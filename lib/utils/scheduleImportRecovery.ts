import type { ScheduleImportRow, Shift } from '@/lib/types/database.types'
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

type DuplicateCandidateResolution =
  | { kind: 'none' }
  | { kind: 'unique'; shift: Shift }
  | { kind: 'ambiguous'; shiftIds: string[] }

type ExternalShiftResolution =
  | { kind: 'none' }
  | { kind: 'unique'; shift: Shift }
  | { kind: 'ambiguous'; shiftIds: string[] }

function resolveDuplicateCandidateShift(
  preview: ImportPreviewRow,
  shifts: Shift[],
): DuplicateCandidateResolution {
  const candidate = preview.duplicateCandidate
  if (!candidate) return { kind: 'none' }
  const exactMatches = shifts.filter(shift => hasExactScheduleImportIdentity(shift, candidate))
  if (exactMatches.length === 1) return { kind: 'unique', shift: exactMatches[0] }
  if (exactMatches.length > 1) return { kind: 'ambiguous', shiftIds: exactMatches.map(s => s.id).sort() }
  const slotMatches = shifts.filter(shift => hasScheduleImportSlotIdentity(shift, candidate))
  if (slotMatches.length === 1) return { kind: 'unique', shift: slotMatches[0] }
  if (slotMatches.length > 1) return { kind: 'ambiguous', shiftIds: slotMatches.map(s => s.id).sort() }
  return { kind: 'none' }
}

function resolveExternalShift(
  batchId: string,
  candidate: ShiftDraft,
  shifts: Shift[],
): ExternalShiftResolution {
  const slotMatches = shifts.filter(shift =>
    shift.import_batch_id !== batchId && hasScheduleImportSlotIdentity(shift, candidate),
  )
  if (slotMatches.length === 0) return { kind: 'none' }
  // Prefer exact within slot matches if exactly one exact exists.
  const exactMatches = slotMatches.filter(shift => hasExactScheduleImportIdentity(shift, candidate))
  if (exactMatches.length === 1) return { kind: 'unique', shift: exactMatches[0] }
  if (exactMatches.length > 1) return { kind: 'ambiguous', shiftIds: exactMatches.map(s => s.id).sort() }
  if (slotMatches.length === 1) return { kind: 'unique', shift: slotMatches[0] }
  return { kind: 'ambiguous', shiftIds: slotMatches.map(s => s.id).sort() }
}

function findDuplicateCandidateShift(
  preview: ImportPreviewRow,
  shifts: Shift[],
): Shift | undefined {
  const res = resolveDuplicateCandidateShift(preview, shifts)
  return res.kind === 'unique' ? res.shift : undefined
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

export function buildScheduleImportEnrichmentPatch(
  existing: Shift,
  imported: ShiftDraft,
  sourcePresence: ScheduleImportRow['source_presence'] = {},
): Partial<Pick<Shift, 'campaign_id' | 'studio' | 'title' | 'product_notes' | 'required_host_count' | 'required_support_count' | 'required_technical_count'>> {
  const provided = (value: boolean | undefined, fallback: boolean) => value === undefined ? fallback : value
  const patch: Partial<Pick<Shift, 'campaign_id' | 'studio' | 'title' | 'product_notes' | 'required_host_count' | 'required_support_count' | 'required_technical_count'>> = {}
  if (provided(sourcePresence.campaign_name, Boolean(imported.campaign_id)) && imported.campaign_id && existing.campaign_id !== imported.campaign_id) {
    patch.campaign_id = imported.campaign_id
  }
  if (provided(sourcePresence.studio, Boolean(imported.studio)) && imported.studio && existing.studio !== imported.studio) {
    patch.studio = imported.studio
  }
  if (provided(sourcePresence.title, Boolean(imported.title)) && imported.title && existing.title !== imported.title) {
    patch.title = imported.title
  }
  if (provided(sourcePresence.notes, Boolean(imported.product_notes)) && imported.product_notes && existing.product_notes !== imported.product_notes) {
    patch.product_notes = imported.product_notes
  }
  const counts = ['required_host_count', 'required_support_count', 'required_technical_count'] as const
  counts.forEach(field => {
    if (provided(sourcePresence[field], imported[field] !== undefined) && imported[field] !== undefined && existing[field] !== imported[field]) {
      patch[field] = imported[field]
    }
  })
  return patch
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
  /** Update supported Shift metadata through the canonical CAS-aware service. */
  updateShift?: (shiftId: string, patch: Partial<Shift>) => Promise<Shift | null>
  /**
   * Update staffing display labels on an existing shift.
   * If not provided, staffing merge is skipped (e.g., tests without staffing).
   */
  updateStaffingLabels?: (shiftId: string, labels: ShiftStaffingLabels, expectedVersion?: number) => Promise<Shift | null>
}

export async function processScheduleImportRows({
  batchId,
  previews,
  batchRows,
  initialShifts,
  createShift,
  refreshShifts,
  recordOutcome,
  updateShift,
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

  const replaceKnownShift = (updated: Shift) => {
    const idx = knownShifts.findIndex(s => s.id === updated.id)
    if (idx !== -1) knownShifts[idx] = updated
    else knownShifts.push(updated)
  }

  const enrichExistingShift = async (existing: Shift, imported: ShiftDraft, sourcePresence: ScheduleImportRow['source_presence']) => {
    let current = existing
    let enriched = false
    const patch = buildScheduleImportEnrichmentPatch(existing, imported, sourcePresence)
    if (Object.keys(patch).length > 0 && updateShift) {
      const updated = await updateShift(existing.id, { ...patch, version: existing.version })
      if (updated) {
        current = updated
        enriched = true
        replaceKnownShift(updated)
      }
    }
    if (updateStaffingLabels) {
      const hasImportedNames =
        ((sourcePresence?.host_names ?? Boolean(imported.host_names?.length)) && Boolean(imported.host_names?.length)) ||
        ((sourcePresence?.assistant_names ?? Boolean(imported.assistant_names?.length)) && Boolean(imported.assistant_names?.length)) ||
        ((sourcePresence?.technical_names ?? Boolean(imported.technical_names?.length)) && Boolean(imported.technical_names?.length))
      if (hasImportedNames) {
        const merged = mergeImportedStaffingLabels(current, imported)
        const before: ShiftStaffingLabels = {
          host_names: current.host_names ?? [],
          assistant_names: current.assistant_names ?? [],
          technical_names: current.technical_names ?? [],
        }
        if (!staffingLabelsEqual(before, merged)) {
          const updated = await updateStaffingLabels(current.id, merged, current.version)
          if (updated) {
            current = updated
            enriched = true
            replaceKnownShift(updated)
          }
        }
      }
    }
    return { shift: current, enriched }
  }

  const recordExisting = async (
    preview: ImportPreviewRow,
    existing: Shift,
    imported: ShiftDraft,
    expectedOutcome: ImportBatchRetryableRowStatus,
    sameBatch = false,
  ) => {
    let enrichment: { shift: Shift; enriched: boolean }
    try {
      enrichment = await enrichExistingShift(existing, imported, preview.row.source_presence)
    } catch (error) {
      await persistRetryable(preview.row.row_number, expectedOutcome, scheduleImportFailureCode(error))
      return
    }
    if (enrichment.enriched || sameBatch) {
      const hasNonDuplicateWarning = preview.row.warnings.some(message => !message.toLowerCase().includes('same brand, platform'))
      await recordOutcome({
        rowNumber: preview.row.row_number,
        outcome: hasNonDuplicateWarning ? 'warning' : 'imported',
        expectedOutcome,
        shiftId: enrichment.shift.id,
      })
      result.recovered += 1
      return
    }
    await recordOutcome({
      rowNumber: preview.row.row_number,
      outcome: 'duplicate_skipped',
      expectedOutcome,
      shiftId: existing.id,
    })
    result.duplicateSkipped += 1
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
      const resolution = resolveDuplicateCandidateShift(preview, knownShifts)
      if (resolution.kind === 'unique') {
        await recordExisting(preview, resolution.shift, duplicateCandidate, expectedOutcome)
        continue
      }
      if (resolution.kind === 'ambiguous') {
        await persistRetryable(preview.row.row_number, expectedOutcome, 'IMPORT_RECONCILIATION_AMBIGUOUS')
        continue
      }
      // No unique candidate found (e.g., exact/slot none) — still record as duplicate_skipped without link
      await recordOutcome({
        rowNumber: preview.row.row_number,
        outcome: 'duplicate_skipped',
        expectedOutcome,
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
      await recordExisting(preview, reconcile.shift, candidate, expectedOutcome, true)
      continue
    }
    if (hasSameBatchSlotConflict(batchId, candidate, knownShifts)) {
      await persistRetryable(preview.row.row_number, expectedOutcome, 'IMPORT_BATCH_SLOT_IDENTITY_CONFLICT')
      continue
    }
    const externalResolution = resolveExternalShift(batchId, candidate, knownShifts)
    if (externalResolution.kind === 'unique') {
      await recordExisting(preview, externalResolution.shift, candidate, expectedOutcome)
      continue
    }
    if (externalResolution.kind === 'ambiguous') {
      await persistRetryable(preview.row.row_number, expectedOutcome, 'IMPORT_RECONCILIATION_AMBIGUOUS')
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
        await recordExisting(preview, retryReconcile.shift, candidate, expectedOutcome, true)
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
        const retryExternal = resolveExternalShift(batchId, candidate, knownShifts)
        if (retryExternal.kind === 'unique') {
          await recordExisting(preview, retryExternal.shift, candidate, expectedOutcome)
        } else if (retryExternal.kind === 'ambiguous') {
          await persistRetryable(preview.row.row_number, expectedOutcome, 'IMPORT_RECONCILIATION_AMBIGUOUS')
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
