import type { ScheduleImportRow } from '@/lib/types/database.types'
import {
  getScheduleImportSourceField,
  previewStaffingFields,
  previewStaffingNameFields,
  type PreviewStaffingField,
  type PreviewStaffingNameField,
} from '@/lib/utils/scheduleImportPreview'

export type DraftField =
  | 'date'
  | 'start_time'
  | 'end_time'
  | 'brand_name'
  | 'platform_name'
  | 'campaign_name'
  | 'title'
  | 'studio'
  | PreviewStaffingNameField
  | PreviewStaffingField

export const draftFields: readonly DraftField[] = [
  'date',
  'start_time',
  'end_time',
  'brand_name',
  'platform_name',
  'campaign_name',
  'title',
  'studio',
  ...previewStaffingNameFields,
  ...previewStaffingFields,
]

export type DraftRow = Partial<Record<DraftField, string>>
export type DraftRows = Record<number, DraftRow>

export function committedRowValue(row: ScheduleImportRow, field: DraftField): string {
  const value = row[field]
  if (Array.isArray(value)) return value.join(', ')
  return value === undefined || value === null ? '' : String(value)
}

export function seedRowDraft(row: ScheduleImportRow, field: DraftField, value: string): DraftRow {
  const seeded: DraftRow = {}
  for (const candidate of draftFields) {
    seeded[candidate] = committedRowValue(row, candidate)
  }
  seeded[field] = value
  return seeded
}

export function updateRowDraft(
  draft: DraftRows,
  rowNumber: number,
  row: ScheduleImportRow,
  field: DraftField,
  value: string,
): DraftRows {
  const existing = draft[rowNumber]
  return {
    ...draft,
    [rowNumber]: existing
      ? { ...existing, [field]: value }
      : seedRowDraft(row, field, value),
  }
}

export function removeRowDraft(draft: DraftRows, rowNumber: number): DraftRows {
  if (!(rowNumber in draft)) return draft
  return Object.fromEntries(
    Object.entries(draft).filter(([key]) => Number(key) !== rowNumber),
  ) as DraftRows
}

export function rowDraftValue(
  draft: DraftRows,
  rowNumber: number,
  field: DraftField,
  committed: string,
): string {
  return draft[rowNumber]?.[field] ?? committed
}

export function commitRowDraftToSource<T extends Record<string, unknown>>(
  sourceRow: T,
  draft: DraftRow,
): T {
  const next: Record<string, unknown> = { ...sourceRow }
  const sourcePresence = {
    ...((next.source_presence as Record<string, boolean> | undefined) ?? {}),
  }
  for (const [field, value] of Object.entries(draft)) {
    if (value === undefined) continue
    next[getScheduleImportSourceField(field)] = value
    if (['campaign_name', 'studio', 'title', 'notes', ...previewStaffingFields, ...previewStaffingNameFields].includes(field as DraftField)) {
      sourcePresence[field] = value.trim().length > 0
    }
  }
  next.source_presence = sourcePresence
  return next as T
}
