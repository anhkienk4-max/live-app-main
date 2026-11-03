import type { ScheduleImportRow, Shift } from '@/lib/types/database.types'
import type { ImportResult } from '@/lib/utils/excelUtils'
import { DEFAULT_SHIFT_STAFFING, MAX_SHIFT_CAPACITY } from '@/lib/utils/shiftUtils'
import { agencyDisplayLabel } from '@/lib/utils/executionSource'

export type PreviewStaffingField = 'required_host_count' | 'required_support_count' | 'required_technical_count'
export type PreviewStaffingValues = Record<PreviewStaffingField, number | string>
export type ValidatedStaffingValues = Record<PreviewStaffingField, number | null>
export type PreviewStaffingNameField = 'host_names' | 'assistant_names' | 'technical_names'
export type PreviewStaffingNameValues = Record<PreviewStaffingNameField, string[]>
export type ScheduleImportSourcePresence = Partial<Record<
  | 'execution_source'
  | 'agency_code'
  | 'campaign_name'
  | 'studio'
  | 'title'
  | 'notes'
  | PreviewStaffingField
  | PreviewStaffingNameField,
  boolean>>

type ScheduleImportEnrichmentShape = Pick<Shift,
  | 'execution_source'
  | 'agency_code'
  | 'campaign_id'
  | 'studio'
  | 'title'
  | 'product_notes'
  | 'required_host_count'
  | 'required_support_count'
  | 'required_technical_count'
  | 'supplemental_fields'
  | 'host_names'
  | 'assistant_names'
  | 'technical_names'
>

const sourceValueProvided = (value: boolean | undefined, fallback: boolean) =>
  value === undefined ? fallback : value

const normalizedNames = (values: string[] | undefined) =>
  [...new Set((values ?? []).map(value => String(value).trim()).filter(Boolean))]

const namesEqual = (left: string[] | undefined, right: string[] | undefined) => {
  const a = normalizedNames(left)
  const b = normalizedNames(right)
  return a.length === b.length && a.every((value, index) => value === b[index])
}

/**
 * Builds the metadata/count patch that an existing canonical Shift may accept.
 * Identity fields are intentionally absent: enrichment never moves a Shift.
 */
export function buildScheduleImportEnrichmentPatch(
  existing: ScheduleImportEnrichmentShape,
  imported: ScheduleImportEnrichmentShape,
  sourcePresence: ScheduleImportSourcePresence = {},
): Partial<Pick<Shift,
  | 'execution_source'
  | 'agency_code'
  | 'campaign_id'
  | 'studio'
  | 'title'
  | 'product_notes'
  | 'required_host_count'
  | 'required_support_count'
  | 'required_technical_count'
  | 'supplemental_fields'
>> {
  const patch: Partial<Pick<Shift,
    | 'execution_source'
    | 'agency_code'
    | 'campaign_id'
    | 'studio'
    | 'title'
    | 'product_notes'
    | 'required_host_count'
    | 'required_support_count'
    | 'required_technical_count'
    | 'supplemental_fields'
  >> = {}
  if (sourcePresence.execution_source && imported.execution_source && existing.execution_source !== imported.execution_source) {
    patch.execution_source = imported.execution_source
  }
  if (sourcePresence.agency_code && imported.agency_code !== undefined && existing.agency_code !== imported.agency_code) {
    patch.agency_code = imported.agency_code
  }
  if (sourceValueProvided(sourcePresence.campaign_name, Boolean(imported.campaign_id)) && imported.campaign_id && existing.campaign_id !== imported.campaign_id) {
    patch.campaign_id = imported.campaign_id
  }
  if (sourceValueProvided(sourcePresence.studio, Boolean(imported.studio)) && imported.studio && existing.studio !== imported.studio) {
    patch.studio = imported.studio
  }
  if (sourceValueProvided(sourcePresence.title, Boolean(imported.title)) && imported.title && existing.title !== imported.title) {
    patch.title = imported.title
  }
  if (sourceValueProvided(sourcePresence.notes, Boolean(imported.product_notes)) && imported.product_notes && existing.product_notes !== imported.product_notes) {
    patch.product_notes = imported.product_notes
  }
  const counts = ['required_host_count', 'required_support_count', 'required_technical_count'] as const
  counts.forEach(field => {
    if (sourceValueProvided(sourcePresence[field], imported[field] !== undefined) && imported[field] !== undefined && existing[field] !== imported[field]) {
      patch[field] = imported[field]
    }
  })
  const supplemental = imported.supplemental_fields ?? {}
  if (Object.entries(supplemental).some(([key, value]) => JSON.stringify(existing.supplemental_fields?.[key]) !== JSON.stringify(value))) {
    patch.supplemental_fields = { ...existing.supplemental_fields, ...supplemental }
  }
  return patch
}

/**
 * Matches preview status with confirm-time enrichment semantics. Staffing
 * labels are handled by their dedicated RPC, so they are included here even
 * though they do not belong in the metadata update patch above.
 */
export function hasScheduleImportEnrichment(
  existing: ScheduleImportEnrichmentShape,
  imported: ScheduleImportEnrichmentShape,
  sourcePresence: ScheduleImportSourcePresence = {},
): boolean {
  if (Object.keys(buildScheduleImportEnrichmentPatch(existing, imported, sourcePresence)).length > 0) return true
  const staffingFields = ['host_names', 'assistant_names', 'technical_names'] as const
  return staffingFields.some(field =>
    sourceValueProvided(sourcePresence[field], Boolean(imported[field]?.length))
    && Boolean(imported[field]?.length)
    && !namesEqual(existing[field], imported[field]),
  )
}

export const previewStaffingFields = [
  'required_host_count',
  'required_support_count',
  'required_technical_count',
] as const

export const previewStaffingNameFields = [
  'host_names',
  'assistant_names',
  'technical_names',
] as const

const previewFieldToSourceField: Record<string, string> = {
  execution_source: 'Execution Source',
  agency_code: 'Agency',
  date: 'Date',
  start_time: 'Start time',
  end_time: 'End time',
  brand_name: 'Brand',
  platform_name: 'Platform',
  campaign_name: 'Campaign',
  title: 'Shift title',
  studio: 'Studio',
  host_names: 'host_names',
  assistant_names: 'assistant_names',
  technical_names: 'technical_names',
  required_host_count: 'required_host_count',
  required_support_count: 'required_support_count',
  required_technical_count: 'required_technical_count',
  notes: 'Notes',
}

const staffingSourceAliases: Record<PreviewStaffingField, string[]> = {
  required_host_count: [
    'required_host_count',
    'Required Host count',
    'requiredHostCount',
    'hostRequired',
    'host_count',
    'Host count',
    'Required Host',
    'Số host bắt buộc',
    'So host bat buoc',
    'Số lượng host',
    'So luong host',
    'Số host',
    'So host',
  ],
  required_support_count: [
    'required_support_count',
    'Required Support count',
    'requiredSupportCount',
    'supportRequired',
    'support_count',
    'Support count',
    'Required Support',
    'Số support bắt buộc',
    'So support bat buoc',
    'Số lượng support',
    'So luong support',
    'Số support',
    'So support',
  ],
  required_technical_count: [
    'required_technical_count',
    'Required Technical count',
    'requiredTechnicalCount',
    'technicalRequired',
    'technical_count',
    'Technical count',
    'Required Technical',
    'Số technical bắt buộc',
    'So technical bat buoc',
    'Số lượng technical',
    'So luong technical',
    'Số technical',
    'So technical',
  ],
}

const staffingNameSourceAliases: Record<PreviewStaffingNameField, string[]> = {
  host_names: ['host_names', 'Host', 'Tên Host', 'MC', 'Live Host', 'Host live'],
  assistant_names: ['assistant_names', 'Trợ', 'Trợ lý', 'Tro ly', 'Tro', 'Trợ live', 'Tro live', 'Trợ ca', 'Tro ca', 'Assistant'],
  technical_names: ['technical_names', 'Kỹ thuật', 'Ky thuat', 'Technical', 'Tech', 'KT', 'Kỹ thuật viên', 'Ky thuat vien'],
}

const normalizeSourceKey = (value: string) => value
  .replace(/[\u200B-\u200D\u2060\uFEFF]/g, '')
  .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
  .replace(/_/g, ' ')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/đ/g, 'd')
  .replace(/Đ/g, 'D')
  .replace(/\s+/g, ' ')
  .trim()
  .toLowerCase()

const staffingFieldLookup = new Map<string, PreviewStaffingField>()
for (const field of previewStaffingFields) {
  for (const alias of staffingSourceAliases[field]) {
    staffingFieldLookup.set(normalizeSourceKey(alias), field)
  }
}

const staffingNameFieldLookup = new Map<string, PreviewStaffingNameField>()
for (const field of previewStaffingNameFields) {
  for (const alias of staffingNameSourceAliases[field]) {
    staffingNameFieldLookup.set(normalizeSourceKey(alias), field)
  }
}

const normalizedStaffingAliases = new Set<string>([
  ...staffingFieldLookup.keys(),
  ...staffingNameFieldLookup.keys(),
])

const normalizedStaffingSourceAliases: Record<PreviewStaffingField, string[]> = {
  required_host_count: staffingSourceAliases.required_host_count.map(normalizeSourceKey),
  required_support_count: staffingSourceAliases.required_support_count.map(normalizeSourceKey),
  required_technical_count: staffingSourceAliases.required_technical_count.map(normalizeSourceKey),
}

const normalizedStaffingNameSourceAliases: Record<PreviewStaffingNameField, string[]> = {
  host_names: staffingNameSourceAliases.host_names.map(normalizeSourceKey),
  assistant_names: staffingNameSourceAliases.assistant_names.map(normalizeSourceKey),
  technical_names: staffingNameSourceAliases.technical_names.map(normalizeSourceKey),
}

export function getCanonicalStaffingField(sourceKey: string): PreviewStaffingField | undefined {
  return staffingFieldLookup.get(normalizeSourceKey(sourceKey))
}

export function getCanonicalStaffingNameField(sourceKey: string): PreviewStaffingNameField | undefined {
  return staffingNameFieldLookup.get(normalizeSourceKey(sourceKey))
}

export function normalizeStaffingDisplayNames(rawValue: unknown): string[] {
  const values = Array.isArray(rawValue) ? rawValue : [rawValue]
  const names = values.flatMap(value => {
    if (value === null || value === undefined) return []
    return String(value)
      .split(/[,;\r\n]+/)
      .map(name => name.replace(/\s+/g, ' ').trim())
      .filter(Boolean)
  })
  return [...new Set(names)]
}

function staffingSourceValue(
  sourceRow: Record<string, unknown>,
  field: PreviewStaffingField,
) {
  const normalizedEntries = new Map<string, unknown>()
  Object.entries(sourceRow).forEach(([key, value]) => {
    normalizedEntries.set(normalizeSourceKey(key), value)
  })
  const presentValues: unknown[] = []
  for (const alias of normalizedStaffingSourceAliases[field]) {
    if (normalizedEntries.has(alias)) presentValues.push(normalizedEntries.get(alias))
  }
  return presentValues.find(value => !isMissingStaffingValue(value)) ?? presentValues[0]
}

function staffingNameSourceValue(
  sourceRow: Record<string, unknown>,
  field: PreviewStaffingNameField,
) {
  const normalizedEntries = new Map<string, unknown>()
  Object.entries(sourceRow).forEach(([key, value]) => {
    normalizedEntries.set(normalizeSourceKey(key), value)
  })
  for (const alias of normalizedStaffingNameSourceAliases[field]) {
    if (normalizedEntries.has(alias)) return normalizedEntries.get(alias)
  }
  return undefined
}

function isMissingStaffingValue(value: unknown) {
  if (value === null || value === undefined) return true
  if (typeof value === 'number') return Number.isNaN(value)
  return /^(?:\s*|nan|null|undefined)$/i.test(String(value))
}

export function normalizeStaffingCountForPreview(rawValue: unknown): number | string {
  if (rawValue === null || rawValue === undefined) return DEFAULT_SHIFT_STAFFING.required_host_count
  if (typeof rawValue === 'number') {
    if (Number.isNaN(rawValue)) return DEFAULT_SHIFT_STAFFING.required_host_count
    if (!Number.isFinite(rawValue)) return String(rawValue)
    return Number.isInteger(rawValue) && rawValue >= 0 ? rawValue : String(rawValue)
  }

  const text = String(rawValue).trim()
  if (text === '' || /^(?:nan|null|undefined)$/i.test(text)) {
    return DEFAULT_SHIFT_STAFFING.required_host_count
  }

  const parsed = Number(text)
  if (!Number.isFinite(parsed) || Number.isNaN(parsed)) return text
  if (!Number.isInteger(parsed) || parsed < 0) return text
  return parsed
}

export function normalizeStaffingValuesForPreview(
  sourceRow: Record<string, unknown>,
): PreviewStaffingValues {
  return Object.fromEntries(
    previewStaffingFields.map(field => [
      field,
      normalizeStaffingCountForPreview(staffingSourceValue(sourceRow, field)),
    ]),
  ) as PreviewStaffingValues
}

export function normalizeStaffingNameValuesForPreview(
  sourceRow: Record<string, unknown>,
): PreviewStaffingNameValues {
  return Object.fromEntries(
    previewStaffingNameFields.map(field => [
      field,
      normalizeStaffingDisplayNames(staffingNameSourceValue(sourceRow, field)),
    ]),
  ) as PreviewStaffingNameValues
}

export function validateStaffingValues(
  values: PreviewStaffingValues,
): ValidatedStaffingValues {
  return Object.fromEntries(
    previewStaffingFields.map(field => {
      const value = values[field]
      const parsed = typeof value === 'number' ? value : Number(String(value).trim())
      return [
        field,
        Number.isFinite(parsed) && Number.isInteger(parsed) && parsed >= 0 && parsed <= MAX_SHIFT_CAPACITY
          ? parsed
          : null,
      ]
    }),
  ) as ValidatedStaffingValues
}

export function normalizeScheduleImportSourceRow(
  sourceRow: Record<string, unknown>,
): Record<string, unknown> & PreviewStaffingValues & PreviewStaffingNameValues & { source_presence?: ScheduleImportSourcePresence } {
  const normalizedEntries = new Map<string, unknown>()
  const canonicalSource: Record<string, unknown> = {}

  for (const [key, value] of Object.entries(sourceRow)) {
    const normKey = normalizeSourceKey(key)
    normalizedEntries.set(normKey, value)
    if (!normalizedStaffingAliases.has(normKey)) {
      canonicalSource[key] = value
    }
  }

  const staffingValues = Object.fromEntries(
    previewStaffingFields.map(field => {
      let found: unknown
      for (const alias of normalizedStaffingSourceAliases[field]) {
        if (normalizedEntries.has(alias)) {
          const val = normalizedEntries.get(alias)
          if (!isMissingStaffingValue(val)) {
            found = val
            break
          }
          if (found === undefined) found = val
        }
      }
      return [field, normalizeStaffingCountForPreview(found)]
    }),
  ) as PreviewStaffingValues

  const staffingNames = Object.fromEntries(
    previewStaffingNameFields.map(field => {
      let found: unknown
      for (const alias of normalizedStaffingNameSourceAliases[field]) {
        if (normalizedEntries.has(alias)) {
          found = normalizedEntries.get(alias)
          break
        }
      }
      return [field, normalizeStaffingDisplayNames(found)]
    }),
  ) as PreviewStaffingNameValues

  return {
    ...canonicalSource,
    ...staffingValues,
    ...staffingNames,
  }
}

export function buildScheduleImportPreviewSourceRow(row: ScheduleImportRow) {
  return normalizeScheduleImportSourceRow({
    'Execution Source': row.execution_source || '',
    Agency: row.agency_code ? agencyDisplayLabel(row.agency_code) : (row.custom_fields?.Agency || ''),
    Date: row.date,
    'Start time': row.start_time,
    'End time': row.end_time,
    Brand: row.brand_name,
    Platform: row.platform_name,
    Campaign: row.campaign_name || '',
    'Shift title': row.title,
    Studio: row.studio || '',
    host_names: row.host_names?.join(', ') || '',
    assistant_names: row.assistant_names?.join(', ') || '',
    technical_names: row.technical_names?.join(', ') || '',
    required_host_count: row.required_host_count,
    required_support_count: row.required_support_count,
    required_technical_count: row.required_technical_count,
    Notes: row.notes || '',
    custom_fields: row.custom_fields ?? {},
    source_presence: row.source_presence,
  })
}

export function toCanonicalScheduleImportPreviewRow(
  row: ScheduleImportRow | Record<string, unknown>,
): ScheduleImportRow {
  const canonical = normalizeScheduleImportSourceRow(row as Record<string, unknown>)
  const studio = typeof canonical.studio === 'string' ? canonical.studio.trim() : ''

  return {
    ...canonical,
    agency_code: (row as ScheduleImportRow).agency_code ?? canonical.agency_code,
    studio: studio || undefined,
    host_names: canonical.host_names,
    assistant_names: canonical.assistant_names,
    technical_names: canonical.technical_names,
    required_host_count: canonical.required_host_count,
    required_support_count: canonical.required_support_count,
    required_technical_count: canonical.required_technical_count,
    source_presence: canonical.source_presence as ScheduleImportSourcePresence | undefined,
  } as ScheduleImportRow
}

export function normalizeScheduleImportResult(result: ImportResult): ImportResult {
  const rows = result.rows.map(preview => {
    const row = toCanonicalScheduleImportPreviewRow(preview.row)
    const staffing = validateStaffingValues(row)
    const shift = preview.shift && previewStaffingFields.every(field => staffing[field] !== null)
      ? {
          ...preview.shift,
          execution_source: row.execution_source,
          agency_code: row.agency_code,
          studio: row.studio,
          host_names: row.host_names ?? [],
          assistant_names: row.assistant_names ?? [],
          technical_names: row.technical_names ?? [],
          required_host_count: staffing.required_host_count!,
          required_support_count: staffing.required_support_count!,
          required_technical_count: staffing.required_technical_count!,
        }
      : preview.shift
    return { ...preview, row, shift }
  })
  return {
    ...result,
    rows,
    validShifts: rows.flatMap(preview =>
      preview.shift && preview.row.errors.length === 0 ? [preview.shift] : [],
    ),
  }
}

export function getScheduleImportSourceField(field: string) {
  return previewFieldToSourceField[field] ?? field
}
