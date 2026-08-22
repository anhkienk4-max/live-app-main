import type { Shift } from '@/lib/types/database.types'
import type { ImportPreviewRow } from '@/lib/utils/excelUtils'
import type {
  ImportBatchRetryableRowStatus,
  ImportBatchRow,
  ImportBatchRecordedRowStatus,
} from '@/lib/utils/scheduleImportBatch'
import {
  isRowRetryable,
  isScheduleImportDuplicateError,
  scheduleImportFailureCode,
} from '@/lib/utils/scheduleImportBatch'

type ShiftDraft = Omit<Shift, 'id' | 'created_at' | 'updated_at'>

const normalizeDimension = (value: string | null | undefined) =>
  (value ?? '').trim().replace(/\s+/g, ' ').normalize('NFKC').toLocaleLowerCase()

const normalizeTime = (value: string) => value.length > 5 ? value.slice(0, 5) : value

export function hasExactScheduleImportIdentity(shift: Shift, candidate: ShiftDraft): boolean {
  return shift.date === candidate.date
    && normalizeTime(shift.start_time) === normalizeTime(candidate.start_time)
    && normalizeTime(shift.end_time) === normalizeTime(candidate.end_time)
    && shift.brand_id === candidate.brand_id
    && shift.platform_id === candidate.platform_id
    && normalizeDimension(shift.campaign_id) === normalizeDimension(candidate.campaign_id)
    && normalizeDimension(shift.studio) === normalizeDimension(candidate.studio)
}

export function hasScheduleImportSlotIdentity(shift: Shift, candidate: ShiftDraft): boolean {
  return shift.date === candidate.date
    && normalizeTime(shift.start_time) === normalizeTime(candidate.start_time)
    && normalizeTime(shift.end_time) === normalizeTime(candidate.end_time)
    && shift.brand_id === candidate.brand_id
    && shift.platform_id === candidate.platform_id
}

export type ScheduleImportReconciliation =
  | { kind: 'unresolved' }
  | { kind: 'recovered'; shift: Shift }
  | { kind: 'ambiguous'; shiftIds: string[] }

/**
 * Reconciliation is intentionally strict: only an exact logical identity
 * created by this same batch can recover a row. External shifts and merely
 * similar labels are never linked to the batch row.
 */
export function reconcileScheduleImportShift(
  batchId: string,
  candidate: ShiftDraft,
  shifts: Shift[],
): ScheduleImportReconciliation {
  const matches = shifts.filter(shift =>
    shift.import_batch_id === batchId && hasExactScheduleImportIdentity(shift, candidate),
  )
  if (matches.length === 0) return { kind: 'unresolved' }
  if (matches.length === 1) return { kind: 'recovered', shift: matches[0] }
  return { kind: 'ambiguous', shiftIds: matches.map(shift => shift.id).sort() }
}

function hasSameBatchSlotConflict(batchId: string, candidate: ShiftDraft, shifts: Shift[]) {
  return shifts.some(shift =>
    shift.import_batch_id === batchId
    && hasScheduleImportSlotIdentity(shift, candidate)
    && !hasExactScheduleImportIdentity(shift, candidate),
  )
}

function hasExternalSlotDuplicate(batchId: string, candidate: ShiftDraft, shifts: Shift[]) {
  return shifts.some(shift =>
    shift.import_batch_id !== batchId && hasScheduleImportSlotIdentity(shift, candidate),
  )
}

export interface ScheduleImportRecoveryResult {
  imported: number
  recovered: number
  duplicateSkipped: number
  retryable: number
  finalizedSkipped: number
}

interface RecordOutcomeInput {
  rowNumber: number
  outcome: ImportBatchRecordedRowStatus
  expectedOutcome: ImportBatchRetryableRowStatus
  shiftId?: string
  failureCode?: string
}

interface ProcessScheduleImportRowsInput {
  batchId: string
  previews: ImportPreviewRow[]
  batchRows: ImportBatchRow[]
  initialShifts: Shift[]
  createShift: (data: ShiftDraft) => Promise<Shift>
  refreshShifts: () => Promise<Shift[]>
  recordOutcome: (input: RecordOutcomeInput) => Promise<void>
}

export async function processScheduleImportRows({
  batchId,
  previews,
  batchRows,
  initialShifts,
  createShift,
  refreshShifts,
  recordOutcome,
}: ProcessScheduleImportRowsInput): Promise<ScheduleImportRecoveryResult> {
  const result: ScheduleImportRecoveryResult = {
    imported: 0,
    recovered: 0,
    duplicateSkipped: 0,
    retryable: 0,
    finalizedSkipped: 0,
  }
  const rowsByNumber = new Map(batchRows.map(row => [row.source_row_number, row]))
  let knownShifts = [...initialShifts]

  const persistRetryable = async (
    rowNumber: number,
    expectedOutcome: ImportBatchRetryableRowStatus,
    failureCode: string,
  ) => {
    await recordOutcome({ rowNumber, outcome: 'retryable', expectedOutcome, failureCode })
    result.retryable += 1
  }

  for (const preview of previews) {
    const candidate = preview.shift
    if (!candidate || preview.row.errors.length > 0) continue
    const batchRow = rowsByNumber.get(preview.row.row_number)
    if (!batchRow) throw new Error(`IMPORT_ROW_NOT_FOUND:${preview.row.row_number}`)
    if (!isRowRetryable(batchRow)) {
      result.finalizedSkipped += 1
      continue
    }
    const expectedOutcome = batchRow.status as ImportBatchRetryableRowStatus
    const finalOutcome = preview.row.warnings.length > 0 ? 'warning' : 'imported'

    const reconcile = reconcileScheduleImportShift(batchId, candidate, knownShifts)
    if (reconcile.kind === 'ambiguous') {
      await persistRetryable(preview.row.row_number, expectedOutcome, 'IMPORT_RECONCILIATION_AMBIGUOUS')
      continue
    }
    if (reconcile.kind === 'recovered') {
      await recordOutcome({
        rowNumber: preview.row.row_number,
        outcome: finalOutcome,
        expectedOutcome,
        shiftId: reconcile.shift.id,
      })
      result.recovered += 1
      continue
    }
    if (hasSameBatchSlotConflict(batchId, candidate, knownShifts)) {
      await persistRetryable(preview.row.row_number, expectedOutcome, 'IMPORT_BATCH_SLOT_IDENTITY_CONFLICT')
      continue
    }
    if (hasExternalSlotDuplicate(batchId, candidate, knownShifts)) {
      await recordOutcome({
        rowNumber: preview.row.row_number,
        outcome: 'duplicate_skipped',
        expectedOutcome,
      })
      result.duplicateSkipped += 1
      continue
    }

    try {
      const shift = await createShift({
        ...candidate,
        import_batch_id: batchId,
        registration_locked: false,
      })
      knownShifts.push(shift)
      await recordOutcome({
        rowNumber: preview.row.row_number,
        outcome: finalOutcome,
        expectedOutcome,
        shiftId: shift.id,
      })
      result.imported += 1
    } catch (error) {
      if (!isScheduleImportDuplicateError(error)) {
        await persistRetryable(
          preview.row.row_number,
          expectedOutcome,
          scheduleImportFailureCode(error),
        )
        continue
      }

      knownShifts = await refreshShifts()
      const retryReconcile = reconcileScheduleImportShift(batchId, candidate, knownShifts)
      if (retryReconcile.kind === 'recovered') {
        await recordOutcome({
          rowNumber: preview.row.row_number,
          outcome: finalOutcome,
          expectedOutcome,
          shiftId: retryReconcile.shift.id,
        })
        result.recovered += 1
      } else if (
        retryReconcile.kind === 'ambiguous'
        || hasSameBatchSlotConflict(batchId, candidate, knownShifts)
      ) {
        await persistRetryable(
          preview.row.row_number,
          expectedOutcome,
          'IMPORT_RECONCILIATION_AMBIGUOUS',
        )
      } else if (hasExternalSlotDuplicate(batchId, candidate, knownShifts)) {
        await recordOutcome({
          rowNumber: preview.row.row_number,
          outcome: 'duplicate_skipped',
          expectedOutcome,
        })
        result.duplicateSkipped += 1
      } else {
        await persistRetryable(
          preview.row.row_number,
          expectedOutcome,
          scheduleImportFailureCode(error),
        )
      }
    }
  }

  return result
}
