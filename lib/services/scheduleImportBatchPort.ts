import type {
  ScheduleImportBatch,
  ScheduleImportRow,
  ScheduleImportSource,
  ScheduleImportStatus,
} from '@/lib/types/database.types'
import { getAuthMode } from '@/lib/auth/authMode'
import { scheduleImportService } from '@/lib/services/dataService'
import { getSupabaseScheduleImportPort } from '@/lib/services/supabaseScheduleImportService'
import type {
  ImportBatchFinalRowStatus,
  ImportBatchRecordedRowStatus,
  ImportBatchRetryableRowStatus,
  ImportBatchRow,
  ImportBatchSummary,
} from '@/lib/utils/scheduleImportBatch'
import { toPreviewCounters } from '@/lib/utils/scheduleImportBatch'

export interface CreateImportBatchInput {
  source: ScheduleImportSource
  sourceName: string
  createdBy: string
  summary: ImportBatchSummary
  previewRows?: ScheduleImportRow[]
}

export interface ScheduleImportBatchPort {
  createBatch(input: CreateImportBatchInput): Promise<ScheduleImportBatch>
  recordBatchRows(batchId: string, rows: ImportBatchRow[]): Promise<ImportBatchRow[]>
  listBatchRows(batchId: string): Promise<ImportBatchRow[]>
  linkRowToShift(
    batchId: string,
    sourceRowNumber: number,
    shiftId: string,
    expectedOutcome: ImportBatchRetryableRowStatus,
    outcome?: 'imported' | 'warning',
  ): Promise<ImportBatchRow | null>
  markRowRetryable(
    batchId: string,
    sourceRowNumber: number,
    failureCode: string,
    expectedOutcome: ImportBatchRetryableRowStatus,
  ): Promise<ImportBatchRow | null>
  recordRowOutcome(
    batchId: string,
    sourceRowNumber: number,
    outcome: ImportBatchRecordedRowStatus,
    options: {
      expectedOutcome: ImportBatchRetryableRowStatus
      shiftId?: string
      failureCode?: string
    },
  ): Promise<ImportBatchRow | null>
  updateBatchPreview(
    batchId: string,
    summary: ImportBatchSummary,
    previewRows?: ScheduleImportRow[],
  ): Promise<ScheduleImportBatch | null>
  markBatchStatus(id: string, status: ScheduleImportStatus): Promise<ScheduleImportBatch | null>
  removeBatch(id: string, actorId: string, reason: string): Promise<boolean>
  getBatch(id: string): Promise<ScheduleImportBatch | null>
  listBatches(): Promise<ScheduleImportBatch[]>
}

const recordedBatchRows = new Map<string, ImportBatchRow[]>()

function findMutableMockRow(
  batchId: string,
  sourceRowNumber: number,
  expectedOutcome: ImportBatchRetryableRowStatus,
): { rows: ImportBatchRow[]; index: number } {
  const rows = recordedBatchRows.get(batchId)
  const index = rows?.findIndex(row => row.source_row_number === sourceRowNumber) ?? -1
  if (!rows || index === -1) throw new Error('IMPORT_ROW_NOT_FOUND')
  const current = rows[index]
  if (!current) throw new Error('IMPORT_ROW_NOT_FOUND')
  if ((['imported', 'warning', 'duplicate_skipped'] as ImportBatchFinalRowStatus[]).includes(
    current.status as ImportBatchFinalRowStatus,
  )) {
    throw new Error('IMPORT_ROW_ALREADY_FINALIZED')
  }
  if (current.status !== expectedOutcome) throw new Error('IMPORT_ROW_OUTCOME_CONFLICT')
  return { rows, index }
}

async function assertMockBatchAllowsOutcome(batchId: string): Promise<void> {
  const batch = (await scheduleImportService.getAll()).find(item => item.id === batchId)
  if (batch?.status === 'confirmed') throw new Error('IMPORT_BATCH_NOT_ACTIVE')
}

const mockPort: ScheduleImportBatchPort = {
  async createBatch({ source, sourceName, createdBy, summary, previewRows }) {
    return scheduleImportService.createPreview(source, sourceName, toPreviewCounters(summary), createdBy, previewRows)
  },

  async recordBatchRows(batchId, rows) {
    const existing = recordedBatchRows.get(batchId)
    if (existing) return existing.map(row => ({ ...row }))
    const pendingRows = rows.map(row => ({
      ...row,
      status: 'pending' as const,
      resulting_shift_id: undefined,
      failure_code: undefined,
    }))
    recordedBatchRows.set(batchId, pendingRows)
    return pendingRows
  },

  async listBatchRows(batchId) {
    return (recordedBatchRows.get(batchId) ?? []).map(row => ({ ...row }))
  },

  async linkRowToShift(batchId, sourceRowNumber, shiftId, expectedOutcome, outcome = 'imported') {
    const existingRows = recordedBatchRows.get(batchId)
    const existing = existingRows?.find(row => row.source_row_number === sourceRowNumber)
    if (existing && ['imported', 'warning', 'duplicate_skipped'].includes(existing.status)) {
      if (
        existing.status === outcome
        && existing.resulting_shift_id === shiftId
      ) return { ...existing }
      throw new Error('IMPORT_ROW_ALREADY_FINALIZED')
    }
    await assertMockBatchAllowsOutcome(batchId)
    const { rows, index } = findMutableMockRow(batchId, sourceRowNumber, expectedOutcome)
    rows[index] = {
      ...rows[index],
      resulting_shift_id: shiftId,
      status: outcome,
    }
    return rows[index]
  },

  async markRowRetryable(batchId, sourceRowNumber, failureCode, expectedOutcome) {
    await assertMockBatchAllowsOutcome(batchId)
    const { rows, index } = findMutableMockRow(batchId, sourceRowNumber, expectedOutcome)
    rows[index] = {
      ...rows[index],
      status: 'retryable',
      failure_code: failureCode,
    }
    return rows[index]
  },

  async recordRowOutcome(batchId, sourceRowNumber, outcome, options) {
    const existingRows = recordedBatchRows.get(batchId)
    const existing = existingRows?.find(row => row.source_row_number === sourceRowNumber)
    if (existing && ['imported', 'warning', 'duplicate_skipped'].includes(existing.status)) {
      if (
        existing.status === outcome
        && (outcome === 'duplicate_skipped' || existing.resulting_shift_id === options?.shiftId)
      ) return { ...existing }
      throw new Error('IMPORT_ROW_ALREADY_FINALIZED')
    }
    await assertMockBatchAllowsOutcome(batchId)
    const { rows, index } = findMutableMockRow(
      batchId,
      sourceRowNumber,
      options.expectedOutcome,
    )
    rows[index] = {
      ...rows[index],
      status: outcome,
      resulting_shift_id: options?.shiftId ?? rows[index].resulting_shift_id,
      failure_code: options?.failureCode ?? rows[index].failure_code,
    }
    return rows[index]
  },

  async updateBatchPreview(batchId, summary, previewRows) {
    return scheduleImportService.updatePreview(batchId, toPreviewCounters(summary), previewRows)
  },

  async markBatchStatus(id, status) {
    if (status === 'confirmed') {
      const existingBatch = (await scheduleImportService.getAll()).find(batch => batch.id === id)
      if (existingBatch?.status === 'confirmed') return existingBatch
      const rows = recordedBatchRows.get(id)
      rows?.forEach(row => {
        if (row.status !== 'pending') return
        const errors = row.normalized_values?.errors ?? []
        row.status = errors.length > 0 ? 'validation_failed' : 'duplicate_skipped'
        row.resulting_shift_id = undefined
        row.failure_code = undefined
      })
      return scheduleImportService.confirm(id)
    }
    if (status === 'failed') return scheduleImportService.fail(id)
    return null
  },

  async removeBatch(id, actorId, reason) {
    return scheduleImportService.removePreview(id, actorId, reason)
  },

  async getBatch(id) {
    const batches = await scheduleImportService.getAll()
    return batches.find(batch => batch.id === id) ?? null
  },

  async listBatches() {
    return scheduleImportService.getAll()
  },
}

function resolvePort(): ScheduleImportBatchPort {
  return getAuthMode() === 'supabase' ? getSupabaseScheduleImportPort() : mockPort
}

/**
 * Client-facing import batch port. Dispatches per call: Supabase mode uses the
 * RPC-backed port (source of truth), mock mode keeps the in-memory behavior.
 */
export const scheduleImportBatchPort: ScheduleImportBatchPort = {
  createBatch: input => resolvePort().createBatch(input),
  recordBatchRows: (batchId, rows) => resolvePort().recordBatchRows(batchId, rows),
  listBatchRows: batchId => resolvePort().listBatchRows(batchId),
  linkRowToShift: (batchId, sourceRowNumber, shiftId, expectedOutcome, outcome) =>
    resolvePort().linkRowToShift(batchId, sourceRowNumber, shiftId, expectedOutcome, outcome),
  markRowRetryable: (batchId, sourceRowNumber, failureCode, expectedOutcome) =>
    resolvePort().markRowRetryable(batchId, sourceRowNumber, failureCode, expectedOutcome),
  recordRowOutcome: (batchId, sourceRowNumber, outcome, options) =>
    resolvePort().recordRowOutcome(batchId, sourceRowNumber, outcome, options),
  updateBatchPreview: (batchId, summary, previewRows) =>
    resolvePort().updateBatchPreview(batchId, summary, previewRows),
  markBatchStatus: (id, status) => resolvePort().markBatchStatus(id, status),
  removeBatch: (id, actorId, reason) => resolvePort().removeBatch(id, actorId, reason),
  getBatch: id => resolvePort().getBatch(id),
  listBatches: () => resolvePort().listBatches(),
}
