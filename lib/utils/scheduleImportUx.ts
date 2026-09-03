import type { ImportPreviewRow, ImportResult } from '@/lib/utils/excelUtils'
import type { ImportBatchRow } from '@/lib/utils/scheduleImportBatch'
import { hasScheduleImportEnrichment } from '@/lib/utils/scheduleImportPreview'

export type ImportPreviewPresentationStatus = 'ready' | 'warning' | 'invalid' | 'duplicate'
export type ImportResultPresentationStatus = ImportPreviewPresentationStatus | 'imported' | 'retryable'

export interface ImportPresentationCounts {
  total: number
  ready: number
  warning: number
  invalid: number
  duplicate: number
  retryable: number
  imported: number
}

export function previewPresentationStatus(preview: ImportPreviewRow): ImportPreviewPresentationStatus {
  if (preview.row.errors.length > 0) return 'invalid'
  if (!preview.shift && preview.duplicateCandidate) {
    const reference = preview.duplicateReference
    if (!reference || !hasScheduleImportEnrichment(reference, preview.duplicateCandidate, preview.row.source_presence)) return 'duplicate'
  }
  if (preview.row.warnings.length > 0) return 'warning'
  return 'ready'
}

export function previewPresentationCounts(result: ImportResult): ImportPresentationCounts {
  const counts: ImportPresentationCounts = {
    total: result.rows.length,
    ready: 0,
    warning: 0,
    invalid: 0,
    duplicate: 0,
    retryable: 0,
    imported: 0,
  }
  for (const preview of result.rows) counts[previewPresentationStatus(preview)] += 1
  return counts
}

export function batchPresentationCounts(rows: ImportBatchRow[]): ImportPresentationCounts {
  const counts: ImportPresentationCounts = {
    total: rows.length,
    ready: 0,
    warning: 0,
    invalid: 0,
    duplicate: 0,
    retryable: 0,
    imported: 0,
  }
  for (const row of rows) {
    if (row.status === 'imported') counts.imported += 1
    else if (row.status === 'warning') counts.warning += 1
    else if (row.status === 'duplicate_skipped') counts.duplicate += 1
    else if (row.status === 'retryable') counts.retryable += 1
    else if (row.status === 'validation_failed') counts.invalid += 1
    else counts.ready += 1
  }
  return counts
}

/** Rows with either a clean import or an advisory warning are persisted. */
export function isPersistedImportRow(row: ImportBatchRow): boolean {
  return row.status === 'imported' || row.status === 'warning'
}

/** These outcomes did not create or persist a shift. */
export function isNotImportedResultRow(row: ImportBatchRow): boolean {
  return row.status === 'duplicate_skipped'
    || row.status === 'validation_failed'
    || row.status === 'retryable'
}

export function persistedImportCount(counts: ImportPresentationCounts): number {
  return counts.imported + counts.warning
}

export function presentationStatusIsException(status: ImportResultPresentationStatus): boolean {
  return status === 'warning' || status === 'invalid' || status === 'duplicate' || status === 'retryable'
}
