import type { ScheduleImportRow } from '@/lib/types/database.types'
import type { ImportResult } from '@/lib/utils/excelUtils'
import { DEFAULT_SHIFT_STAFFING, MAX_SHIFT_CAPACITY } from '@/lib/utils/shiftUtils'

export type PreviewStaffingField = 'required_host_count' | 'required_support_count' | 'required_technical_count'
export type PreviewStaffingValues = Record<PreviewStaffingField, number | string>
export type ValidatedStaffingValues = Record<PreviewStaffingField, number | null>

export const previewStaffingFields = [
  'required_host_count',
  'required_support_count',
  'required_technical_count',
] as const

const previewFieldToSourceField: Record<string, string> = {
  date: 'Date',
  start_time: 'Start time',
  end_time: 'End time',
  brand_name: 'Brand',
  platform_name: 'Platform',
  campaign_name: 'Campaign',
  title: 'Shift title',
  studio: 'Studio',
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

const ignoredLegacyStaffingAliases = [
  'Host',
  'Support',
  'Technical',
  'Hỗ trợ',
  'Ho tro',
  'Kỹ thuật',
  'Ky thuat',
]

const normalizeSourceKey = (value: string) => value
  .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
  .replace(/_/g, ' ')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/đ/g, 'd')
  .replace(/Đ/g, 'D')
  .replace(/\s+/g, ' ')
  .trim()
  .toLowerCase()

export function getCanonicalStaffingField(sourceKey: string): PreviewStaffingField | undefined {
  const normalizedKey = normalizeSourceKey(sourceKey)
  return previewStaffingFields.find(field =>
    staffingSourceAliases[field].some(alias => normalizeSourceKey(alias) === normalizedKey),
  )
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
  for (const alias of staffingSourceAliases[field]) {
    const normalizedAlias = normalizeSourceKey(alias)
    if (normalizedEntries.has(normalizedAlias)) presentValues.push(normalizedEntries.get(normalizedAlias))
  }
  return presentValues.find(value => !isMissingStaffingValue(value)) ?? presentValues[0]
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
): Record<string, unknown> & PreviewStaffingValues {
  const staffingAliases = new Set(
    [...Object.values(staffingSourceAliases).flat(), ...ignoredLegacyStaffingAliases].map(normalizeSourceKey),
  )
  const canonicalSource = Object.fromEntries(
    Object.entries(sourceRow).filter(([key]) => !staffingAliases.has(normalizeSourceKey(key))),
  )
  return {
    ...canonicalSource,
    ...normalizeStaffingValuesForPreview(sourceRow),
  }
}

export function buildScheduleImportPreviewSourceRow(row: ScheduleImportRow) {
  return normalizeScheduleImportSourceRow({
    Date: row.date,
    'Start time': row.start_time,
    'End time': row.end_time,
    Brand: row.brand_name,
    Platform: row.platform_name,
    Campaign: row.campaign_name || '',
    'Shift title': row.title,
    Studio: row.studio || '',
    required_host_count: row.required_host_count,
    required_support_count: row.required_support_count,
    required_technical_count: row.required_technical_count,
    Notes: row.notes || '',
  })
}

export function toCanonicalScheduleImportPreviewRow(
  row: ScheduleImportRow | Record<string, unknown>,
): ScheduleImportRow {
  const canonical = normalizeScheduleImportSourceRow(row as Record<string, unknown>)
  const studio = typeof canonical.studio === 'string' ? canonical.studio.trim() : ''

  return {
    ...canonical,
    studio: studio || undefined,
    required_host_count: canonical.required_host_count,
    required_support_count: canonical.required_support_count,
    required_technical_count: canonical.required_technical_count,
  } as ScheduleImportRow
}

export function normalizeScheduleImportResult(result: ImportResult): ImportResult {
  const rows = result.rows.map(preview => {
    const row = toCanonicalScheduleImportPreviewRow(preview.row)
    const staffing = validateStaffingValues(row)
    const shift = preview.shift && previewStaffingFields.every(field => staffing[field] !== null)
      ? {
          ...preview.shift,
          studio: row.studio,
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
