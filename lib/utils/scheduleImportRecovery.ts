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
import type { ShiftStaffingLabels } from '@/lib/services/supabaseShiftService'

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

function findExternalShift(batchId: string, candidate: ShiftDraft, shifts: Shift[]): Shift | undefined {
  return shifts.find(shift =>
    shift.import_batch_id !== batchId && hasScheduleImportSlotIdentity(shift, candidate),
  )
}

function findDuplicateCandidateShift(
  preview: ImportPreviewRow,
  shifts: Shift[],
): Shift | undefined {
  const candidate = preview.duplicateCandidate
  if (!candidate) return undefined
  // Duplicate candidate was built with exact brand/platform/campaign/studio/date/time.
  // Find the matching existing shift by slot identity (date/time/brand/platform) and
  // then exact identity if possible.
  const exact = shifts.find(shift => hasExactScheduleImportIdentity(shift, candidate))
  if (exact) return exact
  return shifts.find(shift => hasScheduleImportSlotIdentity(shift, candidate))
}

export function mergeImportedStaffingLabels(
  existing: Shift,
  imported: ShiftDraft,
): ShiftStaffingLabels {
  const dedup = (values: string[] | undefined): string[] => {
    if (!values || values.length === 0) return []
    return [...new Set(values.map(v => String(v).trim()).filter(Boolean))]
  }
  const existingHost = existing.host_names ?? []
  const existingAssistant = existing.assistant_names ?? []
  const existingTechnical = existing.technical_names ?? []

  const importedHost = dedup(imported.host_names)
  const importedAssistant = dedup(imported.assistant_names)
  const importedTechnical = dedup(imported.technical_names)

  // Merge rule: if imported provides a field (non-empty), use imported (deduped);
  // if blank, preserve existing. Never duplicate on re-import. Union is replace-on-provide.
  // This satisfies: [] + ["Kiên"] => ["Kiên"], ["Kiên"] + ["Kiên"] => ["Kiên"], ["Kiên"] + [] => ["Kiên"]
  return {
    host_names: importedHost.length > 0 ? importedHost : existingHost,
    assistant_names: importedAssistant.length > 0 ? importedAssistant : existingAssistant,
    technical_names: importedTechnical.length > 0 ? importedTechnical : existingTechnical,
  }
}

function staffingLabelsEqual(a: ShiftStaffingLabels, b: ShiftStaffingLabels): boolean {
  const eq = (x: string[], y: string[]) =>
    x.length === y.length && x.every((v, i) => v === y[i])
  return eq(a.host_names, b.host_names) && eq(a.assistant_names, b.assistant_names) && eq(a.technical_names, b.technical_names)
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
  /**
   * Update staffing display labels on an existing shift.
   * If not provided, staffing merge is skipped (e.g., tests without staffing).
   */
  updateStaffingLabels?: (shiftId: string, labels: ShiftStaffingLabels) => Promise<Shift | null>
}

export async function processScheduleImportRows({
  batchId,
  previews,
  batchRows,
  initialShifts,
  createShift,
  refreshShifts,
  recordOutcome,
  updateStaffingLabels,
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

  const maybeMergeStaffing = async (existing: Shift, imported: ShiftDraft) => {
    if (!updateStaffingLabels) return
    // Only merge if imported actually provides at least one staffing name
    const hasImportedNames =
      (imported.host_names && imported.host_names.length > 0) ||
      (imported.assistant_names && imported.assistant_names.length > 0) ||
      (imported.technical_names && imported.technical_names.length > 0)
    if (!hasImportedNames) return
    const merged = mergeImportedStaffingLabels(existing, imported)
    const current: ShiftStaffingLabels = {
      host_names: existing.host_names ?? [],
      assistant_names: existing.assistant_names ?? [],
      technical_names: existing.technical_names ?? [],
    }
    if (staffingLabelsEqual(current, merged)) return
    try {
      const updated = await updateStaffingLabels(existing.id, merged)
      if (updated) {
        // keep knownShifts in sync for subsequent slot checks / idempotency
        const idx = knownShifts.findIndex(s => s.id === existing.id)
        if (idx !== -1) knownShifts[idx] = updated
        else knownShifts.push(updated)
      }
    } catch {
      // Staffing merge is best-effort; do not block import reconciliation on its failure.
      // The core duplicate/recovered outcome is still recorded.
    }
  }

  for (const preview of previews) {
    // Skip rows with validation errors entirely.
    if (preview.row.errors.length > 0) continue
    const batchRow = rowsByNumber.get(preview.row.row_number)
    if (!batchRow) throw new Error(`IMPORT_ROW_NOT_FOUND:${preview.row.row_number}`)
    if (!isRowRetryable(batchRow)) {
      result.finalizedSkipped += 1
      continue
    }
    const expectedOutcome = batchRow.status as ImportBatchRetryableRowStatus

    // Case A: preview is a duplicate (shift suppressed) but we kept duplicateCandidate for merge.
    // This happens when parseScheduleRows detected sameShift against existingShifts / earlier candidates.
    const duplicateCandidate = preview.duplicateCandidate
    if (!preview.shift && duplicateCandidate) {
      const existing = findDuplicateCandidateShift(preview, knownShifts)
      if (existing) {
        await maybeMergeStaffing(existing, duplicateCandidate)
      }
      // Regardless of merge, this row is a duplicate of an existing shift.
      await recordOutcome({
        rowNumber: preview.row.row_number,
        outcome: 'duplicate_skipped',
        expectedOutcome,
        shiftId: existing?.id,
      })
      result.duplicateSkipped += 1
      continue
    }

    const candidate = preview.shift
    if (!candidate) continue

    const finalOutcome = preview.row.warnings.length > 0 ? 'warning' : 'imported'

    const reconcile = reconcileScheduleImportShift(batchId, candidate, knownShifts)
    if (reconcile.kind === 'ambiguous') {
      await persistRetryable(preview.row.row_number, expectedOutcome, 'IMPORT_RECONCILIATION_AMBIGUOUS')
      continue
    }
    if (reconcile.kind === 'recovered') {
      await maybeMergeStaffing(reconcile.shift, candidate)
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
    const externalShift = findExternalShift(batchId, candidate, knownShifts)
    if (externalShift) {
      await maybeMergeStaffing(externalShift, candidate)
      await recordOutcome({
        rowNumber: preview.row.row_number,
        outcome: 'duplicate_skipped',
        expectedOutcome,
        shiftId: externalShift.id,
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
        await maybeMergeStaffing(retryReconcile.shift, candidate)
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
      } else {
        const retryExternal = findExternalShift(batchId, candidate, knownShifts)
        if (retryExternal) {
          await maybeMergeStaffing(retryExternal, candidate)
          await recordOutcome({
            rowNumber: preview.row.row_number,
            outcome: 'duplicate_skipped',
            expectedOutcome,
            shiftId: retryExternal.id,
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
  }

  return result
}
