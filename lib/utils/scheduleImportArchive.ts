import type { ImportPreviewRow } from '@/lib/utils/excelUtils'
import type { Brand, Platform, ScheduleImportRow } from '@/lib/types/database.types'
import { normalizeBrandName, normalizeLookup } from '@/lib/utils/excelUtils'

export type ScheduleArchiveScope = {
  brand_id: string
  platform_id: string
  period_date: string
  execution_source: 'internal' | 'agency'
}

export type ScheduleArchiveIntent = {
  scope: ScheduleArchiveScope
  file: File
  kind: 'normalized_preview' | 'original_source'
  rowCount: number
}

export type ScheduleArchivePlan = {
  files: ScheduleArchiveIntent[]
  /** These rows cannot safely be assigned to a single brand/platform/month. */
  unresolvedRowNumbers: number[]
  /** Raw Excel files are NEVER placed in brand folders when they contain mixed scopes. */
  originalSourceArchived: boolean
}

const safeDate = (value: string): boolean => {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(value)) return false
  const date = new Date(value + 'T00:00:00.000Z')
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}

const sourceFields = [
  'row_number', 'date', 'start_time', 'end_time', 'end_date', 'crosses_midnight',
  'duration_minutes', 'execution_source', 'brand_name', 'platform_name',
  'campaign_name', 'title', 'studio', 'host_names', 'assistant_names',
  'technical_names', 'required_host_count', 'required_support_count',
  'required_technical_count', 'notes', 'source_presence',
] as const satisfies readonly (keyof ScheduleImportRow)[]

function normalizedRecord(row: ScheduleImportRow): Record<string, unknown> {
  const record: Record<string, unknown> = {}
  for (const key of sourceFields) {
    if (row[key] !== undefined) record[key] = row[key]
  }
  return record
}

function exactEntityId<T extends { id: string; name: string }>(
  value: string, entities: readonly T[], normalize: (raw: string) => string,
): string | null {
  const match = entities.filter(item => normalize(item.name) === normalize(value))
  return match.length === 1 ? match[0].id : null
}

/**
 * Creates a brand-isolated archive from the reviewed preview, not from any
 * untrusted user-selected destination. Rows with unknown scope are never leaked
 * into a different brand. The exact original workbook is only copied when
 * *every* row belongs to the same resolved brand/platform/execution/month.
 */
export function planScheduleImportArchive(input: {
  batchId: string
  previews: readonly ImportPreviewRow[]
  brands: readonly Brand[]
  platforms: readonly Platform[]
  sourceFile?: File | null
  sourceType: 'excel' | 'google_sheets'
  maxFileBytes: number
}): ScheduleArchivePlan {
  const grouped = new Map<string, { scope: ScheduleArchiveScope; rows: ScheduleImportRow[] }>()
  const unresolvedRowNumbers: number[] = []
  const batchId = input.batchId.trim()
  if (!batchId || !/^[a-zA-Z0-9_-]{1,120}$/u.test(batchId)) throw new Error('SCHEDULE_ARCHIVE_BATCH_INVALID')

  for (const preview of input.previews) {
    const row = preview.row
    const shift = preview.shift ?? preview.duplicateCandidate
    const brand = shift?.brand_id || exactEntityId(row.brand_name, input.brands, normalizeBrandName)
    const platform = shift?.platform_id || exactEntityId(row.platform_name, input.platforms, normalizeLookup)
    const source = shift?.execution_source ?? row.execution_source
    if (!brand || !platform || !safeDate(row.date) || (source !== 'internal' && source !== 'agency')) {
      unresolvedRowNumbers.push(row.row_number)
      continue
    }
    const key = JSON.stringify([brand, platform, row.date.slice(0, 7), source])
    const scope: ScheduleArchiveScope = {
      brand_id: brand,
      platform_id: platform,
      period_date: row.date,
      execution_source: source,
    }
    const bucket = grouped.get(key)
    if (bucket) bucket.rows.push(row)
    else grouped.set(key, { scope, rows: [row] })
  }

  const files: ScheduleArchiveIntent[] = []
  const buckets = [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b))
  for (const [key, bucket] of buckets) {
    const month = bucket.scope.period_date.slice(0, 7)
    const text = JSON.stringify({
      schema: 'schedule_import_preview_v1',
      batch_id: batchId,
      brand_id: bucket.scope.brand_id,
      platform_id: bucket.scope.platform_id,
      execution_source: bucket.scope.execution_source,
      period_month: month,
      source_kind: input.sourceType,
      rows: bucket.rows.map(normalizedRecord),
    }, null, 2)
    const file = new File([text], `schedule_import_${batchId}_${month}_${buckets.indexOf(buckets.find(item => item[0] === key)!) + 1}.json`, {
      type: 'application/json',
    })
    if (file.size > input.maxFileBytes) throw new Error('SCHEDULE_ARCHIVE_PARTITION_TOO_LARGE')
    files.push({ scope: bucket.scope, file, kind: 'normalized_preview', rowCount: bucket.rows.length })
  }

  const oneScope = buckets.length === 1 && unresolvedRowNumbers.length === 0
  const original = input.sourceType === 'excel' ? input.sourceFile : null
  const copyOriginal = Boolean(oneScope && original && original.size > 0 && original.size <= input.maxFileBytes)
  if (copyOriginal && original) files.push({
    scope: buckets[0][1].scope,
    file: original,
    kind: 'original_source',
    rowCount: input.previews.length,
  })

  return { files, unresolvedRowNumbers, originalSourceArchived: copyOriginal }
}

/** Client helper: fail when a provider upload returns an error, never claim success. */
export async function persistScheduleArchive(
  plan: ScheduleArchivePlan,
  send: (form: FormData) => Promise<Response> = (form) =>
    fetch('/api/operational-files', { method: 'POST', body: form }),
): Promise<{ archived: number; reused: number; unresolved: number; originalSourceArchived: boolean }> {
  let archived = 0
  let reused = 0
  for (const intent of plan.files) {
    const form = new FormData()
    form.set('brand_id', intent.scope.brand_id)
    form.set('platform_id', intent.scope.platform_id)
    form.set('period_date', intent.scope.period_date)
    form.set('execution_source', intent.scope.execution_source)
    form.set('category', 'schedule_source')
    form.set('provider', 'google_drive')
    form.set('file', intent.file)
    const response = await send(form)
    const data = await response.json() as { ok?: boolean; reused?: boolean; error?: { code?: string } }
    if (!response.ok || data.ok !== true) {
      throw new Error(data.error?.code ?? 'SCHEDULE_ARCHIVE_PROVIDER_FAILED')
    }
    archived += 1
    if (data.reused) reused += 1
  }
  return { archived, reused, unresolved: plan.unresolvedRowNumbers.length, originalSourceArchived: plan.originalSourceArchived }
}
