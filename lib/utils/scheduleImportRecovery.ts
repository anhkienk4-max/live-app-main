import type { ScheduleImportRow, Shift } from '@/lib/types/database.types'
import type { ImportPreviewRow } from '@/lib/utils/excelUtils'
import type { ReadbackVerificationResult } from '@/lib/utils/scheduleImportReadback'
import type {
  ImportBatchRetryableRowStatus,
  ImportBatchRow,
  ImportBatchRecordedRowStatus,
} from '@/lib/utils/scheduleImportBatch'
import {
  buildScheduleImportEnrichmentPatch,
  hasScheduleImportEnrichment,
} from '@/lib/utils/scheduleImportPreview'
import {
  isRowRetryable,
  isScheduleImportDuplicateError,
  scheduleImportFailureCode,
} from '@/lib/utils/scheduleImportBatch'
import type { ShiftStaffingLabels } from '@/lib/services/supabaseShiftService'

type ShiftDraft = Omit<Shift, 'id' | 'created_at' | 'updated_at'>

const normalizeTime = (value: string) => value.length > 5 ? value.slice(0, 5) : value

export const normalizeShiftQualifier = (v?: string | null): string =>
  (v ? v.trim().toLowerCase().replace(/\s+/g, ' ') : '')

const normalizeQualifier = normalizeShiftQualifier

export function hasExactScheduleImportIdentity(shift: Shift, candidate: ShiftDraft): boolean {
  if (
    shift.date !== candidate.date
    || normalizeTime(shift.start_time) !== normalizeTime(candidate.start_time)
    || normalizeTime(shift.end_time) !== normalizeTime(candidate.end_time)
    || shift.brand_id !== candidate.brand_id
    || shift.platform_id !== candidate.platform_id
  ) {
    return false
  }

  const shiftStudio = normalizeQualifier(shift.studio)
  const candidateStudio = normalizeQualifier(candidate.studio)
  if (shiftStudio !== candidateStudio) return false

  const shiftCampaign = normalizeQualifier(shift.campaign_id)
  const candidateCampaign = normalizeQualifier(candidate.campaign_id)
  if (shiftCampaign !== candidateCampaign) return false

  return true
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
  return shifts.some(shift => {
    if (shift.import_batch_id !== batchId) return false
    if (!hasScheduleImportSlotIdentity(shift, candidate)) return false
    if (hasExactScheduleImportIdentity(shift, candidate)) return false

    // If both have different non-empty qualifiers, they are distinct operational sessions, not a conflict
    const shiftStudio = normalizeQualifier(shift.studio)
    const candidateStudio = normalizeQualifier(candidate.studio)
    if (shiftStudio && candidateStudio && shiftStudio !== candidateStudio) {
      return false
    }

    const shiftCampaign = normalizeQualifier(shift.campaign_id)
    const candidateCampaign = normalizeQualifier(candidate.campaign_id)
    if (shiftCampaign && candidateCampaign && shiftCampaign !== candidateCampaign) {
      return false
    }

    return true
  })
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
  const candidateStudio = normalizeQualifier(candidate.studio)
  const candidateCampaign = normalizeQualifier(candidate.campaign_id)

  const candidateMatches = slotMatches.filter(shift => {
    const shiftStudio = normalizeQualifier(shift.studio)
    const shiftCampaign = normalizeQualifier(shift.campaign_id)
    if (candidateStudio && shiftStudio && candidateStudio !== shiftStudio) return false
    if (candidateCampaign && shiftCampaign && candidateCampaign !== shiftCampaign) return false
    return true
  })

  if (candidateMatches.length === 1) {
    const matched = candidateMatches[0]
    const matchedStudio = normalizeQualifier(matched.studio)
    const matchedCampaign = normalizeQualifier(matched.campaign_id)
    if ((candidateStudio && !matchedStudio) || (!candidateStudio && matchedStudio)
      || (candidateCampaign && !matchedCampaign) || (!candidateCampaign && matchedCampaign)) {
      return { kind: 'ambiguous', shiftIds: [matched.id] }
    }
    return { kind: 'unique', shift: matched }
  }
  if (candidateMatches.length > 1) {
    return { kind: 'ambiguous', shiftIds: candidateMatches.map(s => s.id).sort() }
  }
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

  const candidateStudio = normalizeQualifier(candidate.studio)
  const candidateCampaign = normalizeQualifier(candidate.campaign_id)

  const compatibleMatches = slotMatches.filter(shift => {
    const shiftStudio = normalizeQualifier(shift.studio)
    const shiftCampaign = normalizeQualifier(shift.campaign_id)
    if (candidateStudio && shiftStudio && candidateStudio !== shiftStudio) return false
    if (candidateCampaign && shiftCampaign && candidateCampaign !== shiftCampaign) return false
    return true
  })

  if (compatibleMatches.length === 0) return { kind: 'none' }

  if (compatibleMatches.length === 1) {
    const matched = compatibleMatches[0]
    const matchedStudio = normalizeQualifier(matched.studio)
    const matchedCampaign = normalizeQualifier(matched.campaign_id)
    if ((candidateStudio && !matchedStudio) || (!candidateStudio && matchedStudio)
      || (candidateCampaign && !matchedCampaign) || (!candidateCampaign && matchedCampaign)) {
      return { kind: 'ambiguous', shiftIds: [matched.id] }
    }
    return { kind: 'unique', shift: matched }
  }
  return { kind: 'ambiguous', shiftIds: compatibleMatches.map(s => s.id).sort() }
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

export interface ScheduleImportRowExecutionRecord {
  rowNumber: number
  status: 'created' | 'updated' | 'unchanged' | 'conflict' | 'failed'
  shiftId?: string
  failureCode?: string
  readbackVerified: boolean
  readbackMismatches?: string[]
}

export interface ScheduleImportExecutionSummary {
  created: number
  updated: number
  unchanged: number
  conflict: number
  failed: number
  readbackVerified: number
  readbackFailed: number
  rowResults: ScheduleImportRowExecutionRecord[]
}

export interface ScheduleImportDetailedResult
  extends ScheduleImportRecoveryResult,
    ScheduleImportExecutionSummary {}

export type PersistedScheduleImportResult =
  | {
      kind: 'created'
      shift: Shift
      outcome: 'imported' | 'warning'
      verification?: ReadbackVerificationResult
      batchRowRecorded?: boolean
    }
  | {
      kind: 'updated'
      shift: Shift
      outcome: 'imported' | 'warning'
      verification?: ReadbackVerificationResult
      batchRowRecorded?: boolean
    }
  | {
      kind: 'duplicate_skipped'
      shift?: Shift
      shiftId?: string
      verification?: ReadbackVerificationResult
      batchRowRecorded?: boolean
    }
  | {
      kind: 'review_required'
      failureCode: string
      shiftId?: string
      batchRowRecorded?: boolean
    }
  | {
      kind: 'readback_mismatch'
      shift?: Shift
      shiftId?: string
      failureCode: string
      mismatches: string[]
      verification?: ReadbackVerificationResult
      batchRowRecorded?: boolean
    }

const CONFLICT_FAILURE_CODES = new Set([
  'IMPORT_CROSS_AGENCY_CONFLICT',
  'IMPORT_SHIFT_STATUS_LOCKED',
  'IMPORT_APPROVED_PAYROLL_LOCKED',
  'IMPORT_SAFE_UPDATE_DISABLED',
  'IMPORT_SLOT_IDENTITY_AMBIGUOUS_REVIEW_REQUIRED',
  'IMPORT_RECONCILIATION_AMBIGUOUS',
  'IMPORT_RECONCILIATION_REVIEW_REQUIRED',
  'IMPORT_BATCH_SLOT_IDENTITY_CONFLICT',
  'STAFFING_SEGMENT_TIME_CHANGE_CONFLICT',
  'STAFFING_SEGMENT_DELETE_CONFLICT',
  'SHIFT_AGENCY_EXECUTION_SOURCE_CONFLICT',
])

const isConflictFailureCode = (code: string): boolean =>
  CONFLICT_FAILURE_CODES.has(code) || code.startsWith('STAFFING_CAPACITY_BELOW_APPROVED_COUNT')

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
  /** Database-atomic Confirm path. It persists the row outcome with the parent. */
  createShiftFromImport?: (rowNumber: number, data: ShiftDraft) => Promise<PersistedScheduleImportResult>
  /** Segment-aware reconciliation Confirm path with DB readback verification. */
  reconcileShiftFromImport?: (rowNumber: number, data: ShiftDraft) => Promise<PersistedScheduleImportResult>
  refreshShifts: () => Promise<Shift[]>
  recordOutcome: (input: RecordOutcomeInput) => Promise<void>
  /** Update supported Shift metadata through the canonical CAS-aware service. */
  updateShift?: (shiftId: string, patch: Partial<Shift>) => Promise<Shift | null>
  /**
   * Update staffing display labels on an existing shift.
   * If not provided, staffing merge is skipped (e.g., tests without staffing).
   */
  updateStaffingLabels?: (shiftId: string, labels: ShiftStaffingLabels, expectedVersion?: number) => Promise<Shift | null>
  onProgress?: (progress: { processed: number; total: number; rowNumber: number }) => void
  onSummary?: (summary: ScheduleImportExecutionSummary) => void
}

export async function processScheduleImportRows({
  batchId,
  previews,
  batchRows,
  initialShifts,
  createShift,
  createShiftFromImport,
  reconcileShiftFromImport,
  refreshShifts,
  recordOutcome,
  updateShift,
  updateStaffingLabels,
  onProgress,
  onSummary,
}: ProcessScheduleImportRowsInput): Promise<ScheduleImportRecoveryResult> {
  const result: ScheduleImportRecoveryResult = {
    imported: 0,
    recovered: 0,
    duplicateSkipped: 0,
    retryable: 0,
    finalizedSkipped: 0,
  }
  const summary: ScheduleImportExecutionSummary = {
    created: 0,
    updated: 0,
    unchanged: 0,
    conflict: 0,
    failed: 0,
    readbackVerified: 0,
    readbackFailed: 0,
    rowResults: [],
  }
  const rowsByNumber = new Map(batchRows.map(row => [row.source_row_number, row]))
  let knownShifts = [...initialShifts]
  const reconcileHandler = reconcileShiftFromImport ?? createShiftFromImport
  const actionableTotal = previews.filter(preview => {
    if (preview.row.errors.length > 0) return false
    const row = rowsByNumber.get(preview.row.row_number)
    return Boolean(row && isRowRetryable(row))
  }).length
  let processedActionable = 0

  const notifyProgress = (rowNumber: number) => {
    processedActionable += 1
    onProgress?.({ processed: processedActionable, total: actionableTotal, rowNumber })
  }

  const persistRetryable = async (
    rowNumber: number,
    expectedOutcome: ImportBatchRetryableRowStatus,
    failureCode: string,
  ) => {
    await recordOutcome({ rowNumber, outcome: 'retryable', expectedOutcome, failureCode })
    result.retryable += 1
    if (isConflictFailureCode(failureCode)) {
      summary.conflict += 1
      summary.rowResults.push({ rowNumber, status: 'conflict', failureCode, readbackVerified: false })
    } else {
      summary.failed += 1
      summary.rowResults.push({ rowNumber, status: 'failed', failureCode, readbackVerified: false })
    }
  }

  const replaceKnownShift = (updated: Shift) => {
    const idx = knownShifts.findIndex(s => s.id === updated.id)
    if (idx !== -1) knownShifts[idx] = updated
    else knownShifts.push(updated)
  }

  const enrichExistingShift = async (existing: Shift, imported: ShiftDraft, sourcePresence: ScheduleImportRow['source_presence']) => {
    let current = existing
    let enriched = false
    if (!hasScheduleImportEnrichment(existing, imported, sourcePresence)) return { shift: current, enriched }
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
      summary.updated += 1
      summary.readbackVerified += 1
      summary.rowResults.push({
        rowNumber: preview.row.row_number,
        status: 'updated',
        shiftId: enrichment.shift.id,
        readbackVerified: true,
      })
      return
    }
    await recordOutcome({
      rowNumber: preview.row.row_number,
      outcome: 'duplicate_skipped',
      expectedOutcome,
      shiftId: existing.id,
    })
    result.duplicateSkipped += 1
    summary.unchanged += 1
    summary.rowResults.push({
      rowNumber: preview.row.row_number,
      status: 'unchanged',
      shiftId: existing.id,
      readbackVerified: true,
    })
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

    // Case 0: In-file duplicate rows (same slot in same file) must NEVER enrich or create shifts.
    if (preview.isInFileDuplicate) {
      await recordOutcome({
        rowNumber: preview.row.row_number,
        outcome: 'duplicate_skipped',
        expectedOutcome,
      })
      result.duplicateSkipped += 1
      summary.unchanged += 1
      summary.rowResults.push({
        rowNumber: preview.row.row_number,
        status: 'unchanged',
        readbackVerified: true,
      })
      notifyProgress(preview.row.row_number)
      continue
    }

    if (reconcileHandler) {
      const importDraft = preview.shift ?? preview.duplicateCandidate
      if (!importDraft) {
        await persistRetryable(preview.row.row_number, expectedOutcome, 'IMPORT_RECONCILIATION_REVIEW_REQUIRED')
        notifyProgress(preview.row.row_number)
        continue
      }
      try {
        const persisted = await reconcileHandler(preview.row.row_number, {
          ...importDraft,
          registration_locked: false,
        })
        if (persisted.kind === 'created') {
          knownShifts.push(persisted.shift)
          result.imported += 1
          summary.created += 1
          const readbackOk = persisted.verification ? persisted.verification.ok : true
          if (readbackOk) summary.readbackVerified += 1
          else summary.readbackFailed += 1
          if (persisted.batchRowRecorded === false) {
            await recordOutcome({
              rowNumber: preview.row.row_number,
              outcome: persisted.outcome,
              expectedOutcome,
              shiftId: persisted.shift.id,
            })
          }
          summary.rowResults.push({
            rowNumber: preview.row.row_number,
            status: 'created',
            shiftId: persisted.shift.id,
            readbackVerified: readbackOk,
            ...(persisted.verification && !persisted.verification.ok
              ? { readbackMismatches: persisted.verification.mismatches }
              : {}),
          })
        } else if (persisted.kind === 'updated') {
          replaceKnownShift(persisted.shift)
          result.recovered += 1
          summary.updated += 1
          const readbackOk = persisted.verification ? persisted.verification.ok : true
          if (readbackOk) summary.readbackVerified += 1
          else summary.readbackFailed += 1
          if (persisted.batchRowRecorded === false) {
            await recordOutcome({
              rowNumber: preview.row.row_number,
              outcome: persisted.outcome,
              expectedOutcome,
              shiftId: persisted.shift.id,
            })
          }
          summary.rowResults.push({
            rowNumber: preview.row.row_number,
            status: 'updated',
            shiftId: persisted.shift.id,
            readbackVerified: readbackOk,
            ...(persisted.verification && !persisted.verification.ok
              ? { readbackMismatches: persisted.verification.mismatches }
              : {}),
          })
        } else if (persisted.kind === 'duplicate_skipped') {
          if (persisted.shift) replaceKnownShift(persisted.shift)
          result.duplicateSkipped += 1
          summary.unchanged += 1
          const readbackOk = persisted.verification ? persisted.verification.ok : true
          if (persisted.verification) {
            if (readbackOk) summary.readbackVerified += 1
            else summary.readbackFailed += 1
          }
          if (persisted.batchRowRecorded === false) {
            await recordOutcome({
              rowNumber: preview.row.row_number,
              outcome: 'duplicate_skipped',
              expectedOutcome,
            })
          }
          summary.rowResults.push({
            rowNumber: preview.row.row_number,
            status: 'unchanged',
            shiftId: persisted.shiftId ?? persisted.shift?.id,
            readbackVerified: readbackOk,
          })
        } else if (persisted.kind === 'readback_mismatch') {
          result.retryable += 1
          summary.failed += 1
          summary.readbackFailed += 1
          if (persisted.batchRowRecorded === false) {
            await recordOutcome({
              rowNumber: preview.row.row_number,
              outcome: 'retryable',
              expectedOutcome,
              failureCode: persisted.failureCode,
            })
          }
          summary.rowResults.push({
            rowNumber: preview.row.row_number,
            status: 'failed',
            shiftId: persisted.shiftId ?? persisted.shift?.id,
            failureCode: persisted.failureCode,
            readbackVerified: false,
            readbackMismatches: persisted.mismatches,
          })
        } else {
          result.retryable += 1
          summary.conflict += 1
          if (persisted.batchRowRecorded === false) {
            await recordOutcome({
              rowNumber: preview.row.row_number,
              outcome: 'retryable',
              expectedOutcome,
              failureCode: persisted.failureCode,
            })
          }
          summary.rowResults.push({
            rowNumber: preview.row.row_number,
            status: 'conflict',
            shiftId: persisted.shiftId,
            failureCode: persisted.failureCode,
            readbackVerified: false,
          })
        }
      } catch (error) {
        await persistRetryable(preview.row.row_number, expectedOutcome, scheduleImportFailureCode(error))
      }
      notifyProgress(preview.row.row_number)
      continue
    }

    // Case A: preview is a duplicate (shift suppressed) but we kept duplicateCandidate for merge.
    // This happens when parseScheduleRows detected sameShift against existingShifts / earlier candidates.
    const duplicateCandidate = preview.duplicateCandidate
    if (!preview.shift && duplicateCandidate) {
      const resolution = resolveDuplicateCandidateShift(preview, knownShifts)
      if (resolution.kind === 'unique') {
        await recordExisting(preview, resolution.shift, duplicateCandidate, expectedOutcome)
        notifyProgress(preview.row.row_number)
        continue
      }
      if (resolution.kind === 'ambiguous') {
        await persistRetryable(preview.row.row_number, expectedOutcome, 'IMPORT_RECONCILIATION_AMBIGUOUS')
        notifyProgress(preview.row.row_number)
        continue
      }
      // No unique candidate found (e.g., exact/slot none) — still record as duplicate_skipped without link
      await recordOutcome({
        rowNumber: preview.row.row_number,
        outcome: 'duplicate_skipped',
        expectedOutcome,
      })
      result.duplicateSkipped += 1
      summary.unchanged += 1
      summary.rowResults.push({
        rowNumber: preview.row.row_number,
        status: 'unchanged',
        readbackVerified: true,
      })
      notifyProgress(preview.row.row_number)
      continue
    }

    const candidate = preview.shift
    if (!candidate) {
      notifyProgress(preview.row.row_number)
      continue
    }

    const finalOutcome = preview.row.warnings.length > 0 ? 'warning' : 'imported'

    const reconcile = reconcileScheduleImportShift(batchId, candidate, knownShifts)
    if (reconcile.kind === 'ambiguous') {
      await persistRetryable(preview.row.row_number, expectedOutcome, 'IMPORT_RECONCILIATION_AMBIGUOUS')
      notifyProgress(preview.row.row_number)
      continue
    }
    if (reconcile.kind === 'recovered') {
      await recordExisting(preview, reconcile.shift, candidate, expectedOutcome, true)
      notifyProgress(preview.row.row_number)
      continue
    }
    if (hasSameBatchSlotConflict(batchId, candidate, knownShifts)) {
      await persistRetryable(preview.row.row_number, expectedOutcome, 'IMPORT_BATCH_SLOT_IDENTITY_CONFLICT')
      notifyProgress(preview.row.row_number)
      continue
    }
    const externalResolution = resolveExternalShift(batchId, candidate, knownShifts)
    if (externalResolution.kind === 'unique') {
      await recordExisting(preview, externalResolution.shift, candidate, expectedOutcome)
      notifyProgress(preview.row.row_number)
      continue
    }
    if (externalResolution.kind === 'ambiguous') {
      await persistRetryable(preview.row.row_number, expectedOutcome, 'IMPORT_RECONCILIATION_AMBIGUOUS')
      notifyProgress(preview.row.row_number)
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
      summary.created += 1
      summary.readbackVerified += 1
      summary.rowResults.push({
        rowNumber: preview.row.row_number,
        status: 'created',
        shiftId: shift.id,
        readbackVerified: true,
      })
    } catch (error) {
      if (!isScheduleImportDuplicateError(error)) {
        await persistRetryable(
          preview.row.row_number,
          expectedOutcome,
          scheduleImportFailureCode(error),
        )
        notifyProgress(preview.row.row_number)
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
    notifyProgress(preview.row.row_number)
  }

  onSummary?.(summary)
  return result
}

export async function reconcileScheduleImportRows(
  input: Omit<ProcessScheduleImportRowsInput, 'onSummary'>,
): Promise<ScheduleImportDetailedResult> {
  let captured: ScheduleImportExecutionSummary = {
    created: 0,
    updated: 0,
    unchanged: 0,
    conflict: 0,
    failed: 0,
    readbackVerified: 0,
    readbackFailed: 0,
    rowResults: [],
  }
  const base = await processScheduleImportRows({
    ...input,
    onSummary: summary => {
      captured = summary
    },
  })
  return { ...base, ...captured }
}
