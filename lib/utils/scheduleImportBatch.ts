import type {
  ScheduleImportBatch,
  ScheduleImportRow,
  ScheduleImportRowOutcome,
  ScheduleImportStatus,
} from '@/lib/types/database.types'
import type { ImportPreviewRow, ImportResult } from '@/lib/utils/excelUtils'
import { normalizeLookup } from '@/lib/utils/excelUtils'
import { buildScheduleImportPreviewSourceRow } from '@/lib/utils/scheduleImportPreview'

export type ImportBatch = ScheduleImportBatch
export type ImportBatchStatus = ScheduleImportStatus

export type ImportBatchRowStatus = ScheduleImportRowOutcome
export type ImportBatchFinalRowStatus = Exclude<ImportBatchRowStatus, 'pending'>

export interface ImportBatchRow {
  id: string
  batch_id: string
  source_row_number: number
  original_values: Record<string, unknown>
  normalized_values: ScheduleImportRow
  status: ImportBatchRowStatus
  validation_issues: string[]
  resulting_shift_id?: string
  duplicate_of_shift_id?: string
  failure_code?: string
  created_at: string
}

export interface ImportBatchSummary {
  total_rows: number
  imported_rows: number
  failed_rows: number
  warning_rows: number
  duplicate_rows: number
  pending_rows: number
}

export function rowIdFor(batchId: string, sourceRowNumber: number): string {
  return `${batchId}:${sourceRowNumber}`
}

export function sourceRowFingerprint(values: Record<string, unknown>): string {
  const canonical = Object.entries(values)
    .filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== '')
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${normalizeLookup(key)}=${normalizeLookup(value)}`)
    .join('|')
  let hash = 0x811c9dc5
  for (let index = 0; index < canonical.length; index += 1) {
    hash ^= canonical.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return `sr_${(hash >>> 0).toString(16).padStart(8, '0')}`
}

export function classifyRowOutcome(preview: ImportPreviewRow): ImportBatchRowStatus {
  const { errors, warnings } = preview.row
  if (errors.length > 0) return 'validation_failed'
  if (!preview.shift && warnings.some(message => message.includes('already exists'))) {
    return 'duplicate_skipped'
  }
  // A row with a shift AND warnings (e.g. overnight) still produces a shift:
  // its outcome is 'warning', never an unimported row.
  if (preview.shift) return warnings.length > 0 ? 'warning' : 'imported'
  if (warnings.length > 0) return 'warning'
  return 'pending'
}

export function buildImportBatchRow(
  batchId: string,
  preview: ImportPreviewRow,
  createdAt: string,
): ImportBatchRow {
  const row = preview.row
  return {
    id: rowIdFor(batchId, row.row_number),
    batch_id: batchId,
    source_row_number: row.row_number,
    original_values: buildScheduleImportPreviewSourceRow(row),
    normalized_values: row,
    status: classifyRowOutcome(preview),
    validation_issues: [...row.errors],
    resulting_shift_id: undefined,
    duplicate_of_shift_id: undefined,
    created_at: createdAt,
  }
}

export function mapImportResultToBatchRows(
  batchId: string,
  result: ImportResult,
  now: () => string = () => new Date().toISOString(),
): ImportBatchRow[] {
  const createdAt = now()
  return result.rows.map(preview => buildImportBatchRow(batchId, preview, createdAt))
}

export function summarizeBatchRows(rows: ImportBatchRow[]): ImportBatchSummary {
  const count = (status: ImportBatchRowStatus) => rows.filter(row => row.status === status).length
  return {
    total_rows: rows.length,
    imported_rows: count('imported'),
    failed_rows: count('validation_failed'),
    warning_rows: count('warning'),
    duplicate_rows: count('duplicate_skipped'),
    pending_rows: count('pending'),
  }
}

export function summarizeImportResult(result: ImportResult): ImportBatchSummary {
  const statuses = result.rows.map(preview => classifyRowOutcome(preview))
  const count = (status: ImportBatchRowStatus) => statuses.filter(item => item === status).length
  return {
    total_rows: statuses.length,
    imported_rows: count('imported'),
    failed_rows: count('validation_failed'),
    warning_rows: count('warning'),
    duplicate_rows: count('duplicate_skipped'),
    pending_rows: count('pending'),
  }
}

export interface ScheduleImportPreviewCounters {
  total_rows: number
  valid_rows: number
  invalid_rows: number
  warning_rows: number
  duplicate_rows: number
}

/**
 * Maps outcome-classified counters onto the parser-compatible preview counters:
 * valid_rows = rows with no errors (imported + warning + duplicate + pending),
 * warning_rows = rows with warnings (duplicates carry a warning), matching the
 * parser's validRows/warningRows semantics exactly.
 */
export function toPreviewCounters(summary: ImportBatchSummary): ScheduleImportPreviewCounters {
  return {
    total_rows: summary.total_rows,
    valid_rows: summary.imported_rows + summary.warning_rows + summary.duplicate_rows + summary.pending_rows,
    invalid_rows: summary.failed_rows,
    warning_rows: summary.warning_rows + summary.duplicate_rows,
    duplicate_rows: summary.duplicate_rows,
  }
}

export function isRowRetryable(row: ImportBatchRow): boolean {
  return row.status === 'validation_failed' || row.status === 'pending'
}

export function isRowImported(row: ImportBatchRow): boolean {
  return row.status === 'imported'
}

/**
 * The only unique violation that legitimately means "this import slot is
 * already taken" is the shifts active-slot index. Any other 23505 (or an
 * unidentifiable one) must surface as retryable instead of being silently
 * skipped as a duplicate.
 */
export const SCHEDULE_IMPORT_SLOT_CONSTRAINT = 'shifts_active_slot_uidx'

export function isScheduleImportDuplicateError(error: unknown): boolean {
  const shaped = error as
    | { code?: unknown; message?: unknown; details?: unknown; hint?: unknown }
    | null
    | undefined
  const text = [shaped?.message, shaped?.details, shaped?.hint]
    .map(part => (typeof part === 'string' ? part : ''))
    .join(' ')
  const isUniqueViolation = shaped?.code === '23505'
    || /duplicate key value violates unique constraint/i.test(text)
  if (!isUniqueViolation) return false
  return text.includes(SCHEDULE_IMPORT_SLOT_CONSTRAINT)
}

export function scheduleImportFailureCode(error: unknown): string {
  const code = (error as { code?: unknown } | null | undefined)?.code
  if (typeof code === 'string' && code.trim() !== '') return code.trim()
  const message = error instanceof Error ? error.message : ''
  if (message.trim() !== '') return message.slice(0, 120)
  return 'UNKNOWN'
}