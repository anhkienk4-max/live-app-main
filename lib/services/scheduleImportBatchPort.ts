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
  linkRowToShift(
    batchId: string,
    sourceRowNumber: number,
    shiftId: string,
    outcome?: 'imported' | 'warning',
  ): Promise<ImportBatchRow | null>
  markRowRetryable(batchId: string, sourceRowNumber: number, failureCode: string): Promise<ImportBatchRow | null>
  recordRowOutcome(
    batchId: string,
    sourceRowNumber: number,
    outcome: ImportBatchFinalRowStatus,
    options?: { shiftId?: string; failureCode?: string },
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

const mockPort: ScheduleImportBatchPort = {
  async createBatch({ source, sourceName, createdBy, summary, previewRows }) {
    return scheduleImportService.createPreview(source, sourceName, toPreviewCounters(summary), createdBy, previewRows)
  },

  async recordBatchRows(batchId, rows) {
    recordedBatchRows.set(batchId, rows.map(row => ({ ...row })))
    return rows
  },

  async linkRowToShift(batchId, sourceRowNumber, shiftId, outcome = 'imported') {
    const rows = recordedBatchRows.get(batchId)
    if (!rows) return null
    const index = rows.findIndex(row => row.source_row_number === sourceRowNumber)
    if (index === -1) return null
    rows[index] = {
      ...rows[index],
      resulting_shift_id: shiftId,
      status: outcome,
    }
    return rows[index]
  },

  async markRowRetryable(batchId, sourceRowNumber, failureCode) {
    const rows = recordedBatchRows.get(batchId)
    if (!rows) return null
    const index = rows.findIndex(row => row.source_row_number === sourceRowNumber)
    if (index === -1) return null
    rows[index] = {
      ...rows[index],
      status: 'retryable',
      failure_code: failureCode,
    }
    return rows[index]
  },

  async recordRowOutcome(batchId, sourceRowNumber, outcome, options) {
    const rows = recordedBatchRows.get(batchId)
    if (!rows) return null
    const index = rows.findIndex(row => row.source_row_number === sourceRowNumber)
    if (index === -1) return null
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
    if (status === 'confirmed') return scheduleImportService.confirm(id)
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
  linkRowToShift: (batchId, sourceRowNumber, shiftId, outcome) =>
    resolvePort().linkRowToShift(batchId, sourceRowNumber, shiftId, outcome),
  markRowRetryable: (batchId, sourceRowNumber, failureCode) =>
    resolvePort().markRowRetryable(batchId, sourceRowNumber, failureCode),
  recordRowOutcome: (batchId, sourceRowNumber, outcome, options) =>
    resolvePort().recordRowOutcome(batchId, sourceRowNumber, outcome, options),
  updateBatchPreview: (batchId, summary, previewRows) =>
    resolvePort().updateBatchPreview(batchId, summary, previewRows),
  markBatchStatus: (id, status) => resolvePort().markBatchStatus(id, status),
  removeBatch: (id, actorId, reason) => resolvePort().removeBatch(id, actorId, reason),
  getBatch: id => resolvePort().getBatch(id),
  listBatches: () => resolvePort().listBatches(),
}
