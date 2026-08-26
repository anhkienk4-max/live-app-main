import * as XLSX from 'xlsx'
import { format } from 'date-fns'
import {
  Campaign,
  Report,
  ReportImage,
  ReportMetricKey,
  ScheduleImportRow,
  Shift,
  ShiftRegistration,
  SwapRequest,
  User,
} from '@/lib/types/database.types'
import { getExcelCurrencyNumberFormat } from '@/lib/utils/currency'
import {
  DEFAULT_SHIFT_STAFFING,
  MAX_SHIFT_CAPACITY,
  resolveShiftDateTime,
  shiftDateTimeFields,
} from '@/lib/utils/shiftUtils'
import {
  getCanonicalStaffingField,
  getCanonicalStaffingNameField,
  normalizeScheduleImportSourceRow,
  PreviewStaffingField,
  PreviewStaffingNameField,
  previewStaffingFields,
  toCanonicalScheduleImportPreviewRow,
  validateStaffingValues,
} from '@/lib/utils/scheduleImportPreview'

export interface ImportError {
  row: number
  field: string
  message: string
}

export interface ImportPreviewRow {
  row: ScheduleImportRow
  shift?: Omit<Shift, 'id' | 'created_at' | 'updated_at'>
  /**
   * For duplicate rows (where shift was suppressed to avoid creating a duplicate shift),
   * keep the would-be shift draft so reconciliation can merge imported staffing display
   * names into the existing shift. This preserves duplicate semantics (validShifts excludes
   * it) while allowing staffing metadata persistence.
   */
  duplicateCandidate?: Omit<Shift, 'id' | 'created_at' | 'updated_at'>
}

export interface ImportResult {
  success: boolean
  rows: ImportPreviewRow[]
  validShifts: Omit<Shift, 'id' | 'created_at' | 'updated_at'>[]
  errors: ImportError[]
  warnings: ImportError[]
  totalRows: number
  validRows: number
  invalidRows: number
  warningRows: number
}

export type EntityMaps = {
  brands: Map<string, string>
  platforms: Map<string, string>
  campaigns: Map<string, string>
}

type ScheduleSheetRow = Record<string, unknown>
type SlashDateOrder = 'day-first' | 'month-first'

const scheduleHeaders = {
  date: ['date', 'ngày', 'ngay', 'ngày live', 'ngay live'],
  timeRange: ['time', 'giờ', 'gio', 'shift time', 'time range', 'khung giờ', 'khung gio', 'thời gian', 'thoi gian'],
  startTime: ['start', 'start time', 'giờ bắt đầu', 'gio bat dau', 'từ giờ', 'tu gio'],
  endTime: ['end', 'end time', 'giờ kết thúc', 'gio ket thuc', 'đến giờ', 'den gio'],
  brand: ['brand', 'thương hiệu', 'thuong hieu', 'nhãn hàng', 'nhan hang'],
  platform: ['platform', 'nền tảng', 'nen tang', 'kênh', 'kenh'],
  campaign: ['campaign', 'chiến dịch', 'chien dich'],
  title: ['shift name', 'shift title', 'tên ca', 'ten ca', 'ca'],
  studio: ['studio', 'live studio', 'studio name', 'room', 'live room', 'phòng live', 'phong live', 'phòng livestream', 'phong livestream', 'tên studio', 'ten studio', 'phòng quay', 'phong quay'],
  notes: ['notes', 'note', 'ghi chú', 'ghi chu'],
} as const

type ScheduleHeaderField = keyof typeof scheduleHeaders | PreviewStaffingField | PreviewStaffingNameField

const canonicalScheduleHeaders: Record<ScheduleHeaderField, string> = {
  date: 'Date',
  timeRange: 'Time',
  startTime: 'Start time',
  endTime: 'End time',
  brand: 'Brand',
  platform: 'Platform',
  campaign: 'Campaign',
  title: 'Shift title',
  studio: 'Studio',
  notes: 'Notes',
  host_names: 'host_names',
  assistant_names: 'assistant_names',
  technical_names: 'technical_names',
  required_host_count: 'required_host_count',
  required_support_count: 'required_support_count',
  required_technical_count: 'required_technical_count',
}

const SOURCE_ROW_NUMBER = '__schedule_source_row_number'
const HEADER_SCAN_LIMIT = 30
const HEADER_ERROR_MESSAGE = 'Schedule header was not found. Required columns: Date/Ngày, Time/Khung giờ or Start/End, Brand/Thương hiệu, and Platform/Nền tảng.'

const textValue = (value: unknown): string => {
  if (value && typeof value === 'object') {
    const cell = value as { richText?: Array<{ t?: unknown }>; v?: unknown }
    if (Array.isArray(cell.richText)) return cell.richText.map(part => String(part.t ?? '')).join('')
    if ('v' in cell) return String(cell.v ?? '')
  }
  return String(value ?? '')
}

export const normalizeLookup = (value: unknown) => textValue(value)
  .normalize('NFKC')
  .replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200D\u2060\uFEFF]/g, '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/đ/g, 'd')
  .replace(/Đ/g, 'D')
  .replace(/[_-]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .replace(/^\S+$/, token => token.replace(/([a-z0-9])([A-Z])/g, '$1 $2'))
  .toLowerCase()

/**
 * Brand lookup uses the same lossless normalization for master and imported names.
 * Platform and Campaign lookups intentionally continue using normalizeLookup.
 */
export const normalizeBrandName = (value: unknown): string => String(value ?? '')
  .normalize('NFKC')
  .replace(/\u00A0/g, ' ')
  .replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200D\u2060\uFEFF]/g, '')
  .trim()
  .replace(/\s+/g, ' ')
  .toLowerCase()

const valueFor = (row: ScheduleSheetRow, aliases: readonly string[]) => {
  const normalized = Object.fromEntries(
    Object.entries(row).map(([key, value]) => [normalizeLookup(key), value]),
  )
  const alias = aliases.map(normalizeLookup).find(candidate => Object.prototype.hasOwnProperty.call(normalized, candidate))
  return alias ? normalized[alias] : undefined
}

const headerFieldFor = (value: unknown): ScheduleHeaderField | undefined => {
  const text = String(value ?? '').trim()
  if (!text) return undefined
  const staffingField = getCanonicalStaffingField(text)
  if (staffingField) return staffingField
  const staffingNameField = getCanonicalStaffingNameField(text)
  if (staffingNameField) return staffingNameField
  const normalized = normalizeLookup(text)
  const entry = (Object.entries(scheduleHeaders) as Array<[keyof typeof scheduleHeaders, readonly string[]]>)
    .find(([, aliases]) => aliases.some(alias => normalizeLookup(alias) === normalized))
  return entry?.[0]
}

const hasRequiredScheduleHeaders = (fields: Set<ScheduleHeaderField>) =>
  fields.has('date') &&
  fields.has('brand') &&
  fields.has('platform') &&
  (fields.has('timeRange') || (fields.has('startTime') && fields.has('endTime')))

function detectScheduleHeaderRow(rawRows: unknown[][]) {
  let best: { index: number; fields: Set<ScheduleHeaderField>; score: number } | null = null
  for (const [index, row] of rawRows.slice(0, HEADER_SCAN_LIMIT).entries()) {
    const fields = new Set(row.map(headerFieldFor).filter((field): field is ScheduleHeaderField => Boolean(field)))
    const score = fields.size + (hasRequiredScheduleHeaders(fields) ? 100 : 0)
    if (!best || score > best.score) best = { index, fields, score }
  }
  return best && hasRequiredScheduleHeaders(best.fields) ? best : null
}

const entityIdFor = (items: Map<string, string>, value: string): { id?: string; ambiguous: boolean } => {
  const normalized = normalizeLookup(value)
  const matches = [...items].filter(([name]) => normalizeLookup(name) === normalized)
  if (matches.length === 1) return { id: matches[0][1], ambiguous: false }
  return { ambiguous: matches.length > 1 }
}

const brandIdFor = (items: Map<string, string>, value: string): { id?: string; ambiguous: boolean } => {
  const normalized = normalizeBrandName(value)
  if (!normalized) return { ambiguous: false }
  const matches = [...items].filter(([name]) => normalizeBrandName(name) === normalized)
  if (matches.length === 1) return { id: matches[0][1], ambiguous: false }
  return { ambiguous: matches.length > 1 }
}

const SLASH_DATE_PATTERN = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/

const sourceRowNumberFor = (source: ScheduleSheetRow, index: number) =>
  typeof source[SOURCE_ROW_NUMBER] === 'number' ? source[SOURCE_ROW_NUMBER] as number : index + 2

function inferSlashDateOrder(sourceRows: ScheduleSheetRow[]): {
  order: SlashDateOrder
  error?: ImportError
} {
  let inferred: SlashDateOrder | undefined

  for (const [index, source] of sourceRows.entries()) {
    const rawDate = valueFor(source, scheduleHeaders.date)
    if (typeof rawDate !== 'string') continue
    const text = rawDate.trim()
    const match = text.match(SLASH_DATE_PATTERN)
    if (!match) continue
    const first = Number(match[1])
    const second = Number(match[2])
    const row = sourceRowNumberFor(source, index)

    if (first < 1 || second < 1 || (first > 12 && second > 12)) {
      return {
        order: inferred ?? 'day-first',
        error: { row, field: 'date_format', message: `Date "${text}" is not a valid DD/MM/YYYY or MM/DD/YYYY date.` },
      }
    }

    const evidence: SlashDateOrder | undefined = first > 12
      ? 'day-first'
      : second > 12
        ? 'month-first'
        : undefined
    if (!evidence) continue
    if (inferred && inferred !== evidence) {
      return {
        order: inferred,
        error: {
          row,
          field: 'date_format',
          message: 'Conflicting slash date formats were found. Use one consistent DD/MM/YYYY or MM/DD/YYYY order in the imported schedule.',
        },
      }
    }
    inferred = evidence
  }

  return { order: inferred ?? 'day-first' }
}

type ExcelDateParts = { y: number; m: number; d: number }

// SheetJS attaches `SSF` to `module.exports`. Under Node ESM `import *` exposes the
// namespace without `SSF`; the default export still carries it. Bundlers expose `SSF`
// directly. Resolve once so numeric Excel serials decode in every environment.
const parseExcelDateCode = (value: number): ExcelDateParts | undefined =>
  (XLSX.SSF ?? (XLSX as unknown as { default?: { SSF?: { parse_date_code?: (value: number) => ExcelDateParts } } }).default?.SSF)
    ?.parse_date_code?.(value)

const normalizeDate = (value: unknown, slashDateOrder: SlashDateOrder): string => {
  if (typeof value === 'number') {
    const parsed = parseExcelDateCode(value)
    if (parsed) return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const date = value
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
  }
  const text = String(value ?? '').trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text
  const match = text.match(SLASH_DATE_PATTERN)
  if (match) {
    const first = match[1].padStart(2, '0')
    const second = match[2].padStart(2, '0')
    const [month, day] = slashDateOrder === 'month-first' ? [first, second] : [second, first]
    return `${match[3]}-${month}-${day}`
  }
  const legacyDayFirstMatch = text.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/)
  if (legacyDayFirstMatch) {
    return `${legacyDayFirstMatch[3]}-${legacyDayFirstMatch[2].padStart(2, '0')}-${legacyDayFirstMatch[1].padStart(2, '0')}`
  }
  return text
}

const normalizeTime = (value: unknown): string => {
  if (typeof value === 'number') {
    const totalMinutes = Math.round(value * 24 * 60)
    return `${String(Math.floor(totalMinutes / 60) % 24).padStart(2, '0')}:${String(totalMinutes % 60).padStart(2, '0')}`
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const date = value
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
  }
  const text = String(value ?? '').trim()
  const match = text.match(/^(\d{1,2}):(\d{2})/)
  return match ? `${match[1].padStart(2, '0')}:${match[2]}` : text
}

const normalizeTimeRange = (value: unknown): [string, string] => {
  const parts = String(value ?? '').split(/\s*(?:-|–|—|to|đến)\s*/i)
  if (parts.length < 2) return ['', '']
  return [normalizeTime(parts[0]), normalizeTime(parts[1])]
}

const validIsoDate = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T00:00:00`)
  return !Number.isNaN(date.getTime()) && format(date, 'yyyy-MM-dd') === value
}

const validTime = (value: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value)

const normalizeDimension = (value: string | null | undefined) =>
  (value ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    .normalize('NFKC')
    .toLocaleLowerCase()

const sameShift = (
  shift: Pick<Shift, 'date' | 'start_time' | 'end_time' | 'brand_id' | 'platform_id' | 'campaign_id' | 'studio'>,
  candidate: Pick<Shift, 'date' | 'start_time' | 'end_time' | 'brand_id' | 'platform_id' | 'campaign_id' | 'studio'>,
) =>
  shift.date === candidate.date &&
  shift.start_time === candidate.start_time &&
  shift.end_time === candidate.end_time &&
  shift.brand_id === candidate.brand_id &&
  shift.platform_id === candidate.platform_id &&
  normalizeDimension(shift.campaign_id) === normalizeDimension(candidate.campaign_id) &&
  normalizeDimension(shift.studio) === normalizeDimension(candidate.studio)

export function parseScheduleRows(
  sourceRows: ScheduleSheetRow[],
  maps: EntityMaps,
  existingShifts: Shift[] = [],
): ImportResult {
  const dateOrder = inferSlashDateOrder(sourceRows)
  if (dateOrder.error) {
    return {
      success: false,
      rows: [],
      validShifts: [],
      errors: [dateOrder.error],
      warnings: [],
      totalRows: 0,
      validRows: 0,
      invalidRows: 0,
      warningRows: 0,
    }
  }
  const previews: ImportPreviewRow[] = []
  const errors: ImportError[] = []
  const warnings: ImportError[] = []
  const candidates: Array<Omit<Shift, 'id' | 'created_at' | 'updated_at'>> = []

  sourceRows.forEach((source, index) => {
    const { [SOURCE_ROW_NUMBER]: sourceRowNumber, ...sourceValues } = source
    const normalizedSource = normalizeScheduleImportSourceRow(sourceValues)
    const rowNumber = sourceRowNumberFor(source, index)
    const rowText = Object.values(normalizedSource).map(value => String(value ?? '')).join(' ').replace(/\s+/g, ' ').trim()
    if (/^total\s*week\s*[1-4]\b/i.test(normalizeLookup(rowText))) return
    const rawDate = valueFor(normalizedSource, scheduleHeaders.date)
    const date = normalizeDate(rawDate, dateOrder.order)
    const [rangeStart, rangeEnd] = normalizeTimeRange(valueFor(normalizedSource, scheduleHeaders.timeRange))
    const startTime = normalizeTime(valueFor(normalizedSource, scheduleHeaders.startTime)) || rangeStart
    const endTime = normalizeTime(valueFor(normalizedSource, scheduleHeaders.endTime)) || rangeEnd
    const brandName = textValue(valueFor(normalizedSource, scheduleHeaders.brand)).trim()
    const rawPlatformName = textValue(valueFor(normalizedSource, scheduleHeaders.platform)).trim()
    const platformAlias = normalizeLookup(rawPlatformName)
    const platformName = ['shp', 'shopee'].includes(platformAlias)
      ? 'Shopee Live'
      : ['tts', 'tiktok', 'tt shop', 'tiktok shop'].includes(platformAlias)
        ? 'TikTok Shop'
        : rawPlatformName
    const campaignName = String(valueFor(normalizedSource, scheduleHeaders.campaign) ?? '').trim()
    const suppliedTitle = String(valueFor(normalizedSource, scheduleHeaders.title) ?? '').trim()
    const title = suppliedTitle || (brandName && platformName ? `${brandName} – ${platformName}` : brandName)
    const rawStudio = String(valueFor(normalizedSource, scheduleHeaders.studio) ?? '')
    const studio = rawStudio.trim()
    const notes = String(valueFor(normalizedSource, scheduleHeaders.notes) ?? '').trim()
    const staffingValues = {
      required_host_count: normalizedSource.required_host_count,
      required_support_count: normalizedSource.required_support_count,
      required_technical_count: normalizedSource.required_technical_count,
    }
    const staffingNames = {
      host_names: normalizedSource.host_names,
      assistant_names: normalizedSource.assistant_names,
      technical_names: normalizedSource.technical_names,
    }
    const validatedStaffing = validateStaffingValues(staffingValues)
    const rowErrors: string[] = []
    const rowWarnings: string[] = []

    if (!date) rowErrors.push('Date is required.')
    else if (!validIsoDate(date)) {
      const slashOrder = dateOrder.order === 'month-first' ? 'MM/DD/YYYY' : 'DD/MM/YYYY'
      rowErrors.push(String(rawDate ?? '').trim().match(SLASH_DATE_PATTERN)
        ? `Date "${String(rawDate).trim()}" is invalid using the inferred ${slashOrder} order.`
        : 'Date must use YYYY-MM-DD, DD/MM/YYYY, or MM/DD/YYYY.')
    }
    if (!startTime) rowErrors.push('Start time is required.')
    else if (!validTime(startTime)) rowErrors.push('Start time must use HH:MM.')
    if (!endTime) rowErrors.push('End time is required.')
    else if (!validTime(endTime)) rowErrors.push('End time must use HH:MM.')
    const resolvedTime = validIsoDate(date) && validTime(startTime) && validTime(endTime)
      ? resolveShiftDateTime(date, startTime, endTime)
      : null
    if (resolvedTime && !resolvedTime.valid) rowErrors.push(resolvedTime.error || 'Shift duration is invalid.')
    if (resolvedTime?.warning) rowWarnings.push(resolvedTime.warning)
    if (resolvedTime?.crossesMidnight) rowWarnings.push(`Ends on the next day (${resolvedTime.endDate}).`)
    if (!brandName) rowErrors.push('Brand is required.')
    if (!platformName) rowErrors.push('Platform is required.')
    if (!title) rowErrors.push('Shift title is required.')
    const staffingLabels = {
      required_host_count: 'Host',
      required_support_count: 'Support',
      required_technical_count: 'Technical',
    } as const
    previewStaffingFields.forEach(field => {
      if (validatedStaffing[field] === null) {
        rowErrors.push(`Required ${staffingLabels[field]} count must be a whole number from 0 to ${MAX_SHIFT_CAPACITY}.`)
      }
    })

    const brandMatch = brandIdFor(maps.brands, brandName)
    const platformMatch = entityIdFor(maps.platforms, platformName)
    const campaignMatch = campaignName ? entityIdFor(maps.campaigns, campaignName) : { ambiguous: false }
    const brandId = brandMatch.id
    const platformId = platformMatch.id
    const campaignId = campaignMatch.id
    if (brandName && brandMatch.ambiguous) rowErrors.push(`Brand "${brandName}" matches multiple master brands.`)
    else if (brandName && !brandId) rowErrors.push(`Brand "${brandName}" was not found.`)
    if (platformName && platformMatch.ambiguous) rowErrors.push(`Platform "${platformName}" matches multiple master-data records.`)
    else if (platformName && !platformId) rowErrors.push(`Platform "${platformName}" was not found.`)
    if (campaignName && campaignMatch.ambiguous) rowErrors.push(`Campaign "${campaignName}" matches multiple master-data records.`)
    else if (campaignName && !campaignId) rowErrors.push(`Campaign "${campaignName}" was not found.`)

    let shift: Omit<Shift, 'id' | 'created_at' | 'updated_at'> | undefined
    let duplicateCandidate: Omit<Shift, 'id' | 'created_at' | 'updated_at'> | undefined
    if (brandId && platformId && rowErrors.length === 0) {
      shift = {
        date,
        start_time: startTime,
        end_time: endTime,
        brand_id: brandId,
        platform_id: platformId,
        campaign_id: campaignId,
        title,
        studio: studio || undefined,
        ...staffingNames,
        required_host_count: validatedStaffing.required_host_count!,
        required_support_count: validatedStaffing.required_support_count!,
        required_technical_count: validatedStaffing.required_technical_count!,
        registration_locked: false,
        allow_multi_role: false,
        status: 'scheduled',
        product_notes: notes || undefined,
        ...shiftDateTimeFields(date, startTime, endTime)!,
      }
      const isDuplicate = existingShifts.some(existing => sameShift(existing, shift!)) || candidates.some(existing => sameShift(existing, shift!))
      if (isDuplicate) {
        rowWarnings.push('A shift with the same brand, platform, campaign, studio, date, and time already exists.')
        duplicateCandidate = shift
        shift = undefined
      } else {
        candidates.push(shift)
      }
    }

    rowErrors.forEach(message => errors.push({ row: rowNumber, field: 'row', message }))
    rowWarnings.forEach(message => warnings.push({ row: rowNumber, field: 'duplicate', message }))
    previews.push({
      row: toCanonicalScheduleImportPreviewRow({
        row_number: rowNumber,
        date,
        start_time: startTime,
        end_time: endTime,
        end_date: resolvedTime?.endDate,
        crosses_midnight: resolvedTime?.crossesMidnight,
        duration_minutes: resolvedTime?.durationMinutes,
        brand_name: brandName,
        platform_name: platformName,
        campaign_name: campaignName || undefined,
        title,
        studio: studio || undefined,
        ...staffingNames,
        ...staffingValues,
        notes: notes || undefined,
        warnings: rowWarnings,
        errors: rowErrors,
      }),
      shift,
      duplicateCandidate,
    })
  })

  const validRows = previews.filter(preview => preview.row.errors.length === 0).length
  const invalidRows = previews.filter(preview => preview.row.errors.length > 0).length
  const warningRows = previews.filter(preview => preview.row.warnings.length > 0).length
  return {
    success: invalidRows === 0,
    rows: previews,
    validShifts: previews.flatMap(preview => preview.shift && preview.row.errors.length === 0 ? [preview.shift] : []),
    errors,
    warnings,
    totalRows: previews.length,
    validRows,
    invalidRows,
    warningRows,
  }
}

class ScheduleImportHeaderError extends Error {}

const headerErrorResult = (): ImportResult => ({
  success: false,
  rows: [],
  validShifts: [],
  errors: [{ row: 0, field: 'header', message: HEADER_ERROR_MESSAGE }],
  warnings: [],
  totalRows: 0,
  validRows: 0,
  invalidRows: 0,
  warningRows: 0,
})

const rowsFromWorkbook = (data: ArrayBuffer | string, type: 'array' | 'string') => {
  const workbook = XLSX.read(data, {
    type,
    cellDates: false,
    raw: type === 'string',
  })
  const worksheet = workbook.Sheets[workbook.SheetNames[0]]
  if (!worksheet) throw new ScheduleImportHeaderError(HEADER_ERROR_MESSAGE)
  const rawRows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
    header: 1,
    defval: '',
    blankrows: true,
  })
  const detected = detectScheduleHeaderRow(rawRows)
  if (!detected) throw new ScheduleImportHeaderError(HEADER_ERROR_MESSAGE)

  const headers = rawRows[detected.index].map((header, columnIndex) => {
    const field = headerFieldFor(header)
    return field ? canonicalScheduleHeaders[field] : String(header ?? '').trim() || `__column_${columnIndex}`
  })

  return rawRows.slice(detected.index + 1).flatMap((values, dataIndex) => {
    if (!values.some(value => String(value ?? '').trim() !== '')) return []
    const row: ScheduleSheetRow = { [SOURCE_ROW_NUMBER]: detected.index + dataIndex + 2 }
    headers.forEach((header, columnIndex) => {
      if (header.startsWith('__column_')) return
      const value = values[columnIndex] ?? ''
      if (!(header in row) || String(row[header] ?? '').trim() === '') row[header] = value
    })
    return [row]
  })
}

const normalizeEntityMaps = (maps: EntityMaps): EntityMaps => ({
  brands: new Map(maps.brands),
  platforms: new Map(maps.platforms),
  campaigns: new Map(maps.campaigns),
})

export function parseScheduleTabularData(
  data: ArrayBuffer | string,
  type: 'array' | 'string',
  maps: EntityMaps,
  existingShifts: Shift[] = [],
): ImportResult {
  try {
    return parseScheduleRows(rowsFromWorkbook(data, type), normalizeEntityMaps(maps), existingShifts)
  } catch (error) {
    if (error instanceof ScheduleImportHeaderError) return headerErrorResult()
    throw error
  }
}

export async function importShiftsFromExcel(
  file: File,
  brandsMap: Map<string, string>,
  platformsMap: Map<string, string>,
  campaignsMap: Map<string, string>,
  _usersMap?: Map<string, string>,
  existingShifts: Shift[] = [],
): Promise<ImportResult> {
  try {
    return parseScheduleTabularData(await file.arrayBuffer(), 'array', {
      brands: brandsMap,
      platforms: platformsMap,
      campaigns: campaignsMap,
    }, existingShifts)
  } catch {
    return {
      success: false,
      rows: [],
      validShifts: [],
      errors: [{ row: 0, field: 'file', message: 'The Excel file could not be parsed.' }],
      warnings: [],
      totalRows: 0,
      validRows: 0,
      invalidRows: 0,
      warningRows: 0,
    }
  }
}

const mockGoogleRows: ScheduleSheetRow[] = [{
  Date: format(new Date(Date.now() + 4 * 86400000), 'yyyy-MM-dd'),
  'Start time': '10:00',
  'End time': '13:00',
  Brand: 'TechGear Pro',
  Platform: 'TikTok Shop',
  Campaign: 'Flash Sale Week',
  'Shift title': 'Imported Google Sheets shift',
  Studio: 'Studio A',
  'Required Host count': 1,
  'Required Support count': 1,
  'Required Technical count': 1,
  Notes: 'Mock public CSV boundary.',
}]

const normalizeGoogleSheetsUrl = (url: string) => {
  if (url === 'mock://schedule') return url
  const parsed = new URL(url)
  if (parsed.hostname !== 'docs.google.com') return parsed.toString()
  const match = parsed.pathname.match(/\/spreadsheets\/d\/([^/]+)/)
  if (!match) return parsed.toString()
  const gid = parsed.searchParams.get('gid') || parsed.hash.match(/gid=(\d+)/)?.[1] || '0'
  return `https://docs.google.com/spreadsheets/d/${match[1]}/export?format=csv&gid=${gid}`
}

export async function importShiftsFromGoogleSheetsUrl(
  url: string,
  brandsMap: Map<string, string>,
  platformsMap: Map<string, string>,
  campaignsMap: Map<string, string>,
  existingShifts: Shift[] = [],
): Promise<ImportResult> {
  const maps = normalizeEntityMaps({ brands: brandsMap, platforms: platformsMap, campaigns: campaignsMap })
  if (url === 'mock://schedule') return parseScheduleRows(mockGoogleRows, maps, existingShifts)
  const normalizedUrl = normalizeGoogleSheetsUrl(url)
  const response = await fetch(normalizedUrl)
  if (!response.ok) throw new Error('The public Google Sheets CSV could not be loaded.')
  return parseScheduleTabularData(await response.text(), 'string', maps, existingShifts)
}

type WorkbookSheet = {
  name: string
  rows: Record<string, unknown>[]
  currencyColumns?: string[]
}

const writeWorkbook = (filename: string, sheets: WorkbookSheet[]) => {
  const workbook = XLSX.utils.book_new()
  sheets.forEach(sheet => {
    const worksheet = XLSX.utils.json_to_sheet(sheet.rows)
    const keys = Object.keys(sheet.rows[0] || {})
    const currencyFormat = getExcelCurrencyNumberFormat()
    sheet.currencyColumns?.forEach(column => {
      const columnIndex = keys.indexOf(column)
      if (columnIndex === -1) return
      sheet.rows.forEach((_row, rowIndex) => {
        const cell = worksheet[XLSX.utils.encode_cell({ c: columnIndex, r: rowIndex + 1 })]
        if (cell?.t === 'n') cell.z = currencyFormat
      })
    })
    worksheet['!cols'] = keys.map(key => ({
      wch: Math.min(50, Math.max(key.length, ...sheet.rows.map(row => String(row[key] ?? '').length))),
    }))
    XLSX.utils.book_append_sheet(workbook, worksheet, sheet.name.slice(0, 31))
  })
  XLSX.writeFile(workbook, filename)
}

export function downloadScheduleImportErrors(result: ImportResult): void {
  writeWorkbook(`schedule_import_errors_${format(new Date(), 'yyyy-MM-dd')}.xlsx`, [{
    name: 'Errors',
    rows: result.rows
      .filter(preview => preview.row.errors.length > 0 || preview.row.warnings.length > 0)
      .map(preview => ({
        Row: preview.row.row_number,
        Date: preview.row.date,
        Time: `${preview.row.start_time}-${preview.row.end_time}`,
        Brand: preview.row.brand_name,
        Platform: preview.row.platform_name,
        Campaign: preview.row.campaign_name || '',
        Title: preview.row.title,
        Studio: preview.row.studio || '',
        Errors: preview.row.errors.join('\n'),
        Warnings: preview.row.warnings.join('\n'),
      })),
  }])
}

export function exportShiftsToExcel(
  shifts: Shift[],
  brands: Map<string, string>,
  platforms: Map<string, string>,
  campaigns: Map<string, string>,
  users: Map<string, string>,
): void {
  writeWorkbook(`shifts_export_${format(new Date(), 'yyyy-MM-dd')}.xlsx`, [{
    name: 'Shifts',
    rows: shifts.map(shift => {
      const resolved = resolveShiftDateTime(shift.date, shift.start_time, shift.end_time)
      return {
      'Start Date': shift.date,
      'End Date': resolved?.endDate || shift.date,
      'Start Time': shift.start_time,
      'End Time': shift.end_time,
      'Crosses Midnight': Boolean(resolved?.crossesMidnight),
      'Duration Minutes': resolved?.durationMinutes ?? '',
      'Shift Title': shift.title || '',
      Brand: brands.get(shift.brand_id) || shift.brand_id,
      Platform: platforms.get(shift.platform_id) || shift.platform_id,
      Campaign: shift.campaign_id ? campaigns.get(shift.campaign_id) || shift.campaign_id : '',
      Studio: shift.studio || '',
      Host: shift.host_id ? users.get(shift.host_id) || shift.host_id : '',
      Support: shift.support_id ? users.get(shift.support_id) || shift.support_id : '',
      Technical: shift.technical_id ? users.get(shift.technical_id) || shift.technical_id : '',
      'Required Host': shift.required_host_count ?? 1,
      'Required Support': shift.required_support_count ?? 1,
      'Required Technical': shift.required_technical_count ?? 1,
      'Registration Locked': Boolean(shift.registration_locked),
      Status: shift.status,
      'Live Link': shift.live_link || '',
      Notes: shift.product_notes || '',
    }}),
  }])
}

export function exportShiftStaffingToExcel(
  shift: Shift,
  registrations: ShiftRegistration[],
  users: Map<string, string>,
): void {
  const resolved = resolveShiftDateTime(shift.date, shift.start_time, shift.end_time)
  writeWorkbook(`shift_staffing_${shift.date}_${shift.id}.xlsx`, [{
    name: 'Staffing',
    rows: registrations.map(registration => ({
      'Shift ID': shift.id,
      Studio: shift.studio || '',
      'Start Date': shift.date,
      'End Date': resolved?.endDate || shift.date,
      Time: `${shift.start_time}-${shift.end_time}`,
      'Duration Minutes': resolved?.durationMinutes ?? '',
      Role: registration.operational_role,
      Staff: users.get(registration.user_id) || registration.user_id,
      Status: registration.status,
      Source: registration.source,
      'Requested At': registration.requested_at,
      'Reviewed By': registration.reviewed_by ? users.get(registration.reviewed_by) || registration.reviewed_by : '',
      'Reviewed At': registration.reviewed_at || '',
      Notes: registration.review_notes || '',
    })),
  }])
}

export function buildScheduleImportTemplateSheets() {
  return [
    {
      name: 'Schedule',
      rows: [{
        Date: format(new Date(Date.now() + 86400000), 'yyyy-MM-dd'),
        'Start time': '09:00',
        'End time': '13:00',
        Brand: 'TechGear Pro',
        Platform: 'TikTok Shop',
        Campaign: 'Flash Sale Week',
        'Shift title': 'Morning product live',
        Studio: 'Studio A',
        'Required Host count': DEFAULT_SHIFT_STAFFING.required_host_count,
        'Required Support count': DEFAULT_SHIFT_STAFFING.required_support_count,
        'Required Technical count': DEFAULT_SHIFT_STAFFING.required_technical_count,
        Notes: 'Product focus and setup notes',
      }],
    },
    {
      name: 'Instructions',
      rows: [
        { Field: 'Date', Format: 'YYYY-MM-DD or DD/MM/YYYY', Required: 'Yes' },
        { Field: 'Start time / End time', Format: 'HH:MM (24 hour)', Required: 'Yes' },
        { Field: 'Brand / Platform', Format: 'Existing name', Required: 'Yes' },
        { Field: 'Campaign', Format: 'Existing name', Required: 'No' },
        { Field: 'Shift title', Format: 'Text', Required: 'Yes' },
        { Field: 'Studio', Format: 'Text', Required: 'No' },
        { Field: 'Required role counts', Format: 'Whole number >= 1 (defaults to 1 when blank)', Required: 'Yes' },
        { Field: 'Notes', Format: 'Text', Required: 'No' },
      ],
    },
  ]
}

export function downloadExcelTemplate(): void {
  writeWorkbook('shift_import_template.xlsx', buildScheduleImportTemplateSheets())
}

type ReportExportContext = {
  shifts: Shift[]
  campaigns: Campaign[]
  users: User[]
  brands: Map<string, string>
  platforms: Map<string, string>
  images?: ReportImage[]
  registrations?: ShiftRegistration[]
}

export const REPORT_EXPORT_COLUMN_ORDER = [
  // 1. Shift & Schedule Metadata
  'Report ID',
  'Shift ID',
  'Start Date',
  'End Date',
  'Time',
  'Shift Duration Minutes',
  'Brand',
  'Platform',
  'Campaign',
  'Studio',
  'Host',
  'Support',
  'Technical',

  // 2. Canonical Financial & Sales KPIs
  'Revenue',
  'GMV',
  'Estimated GMV',
  'Orders',
  'SKU Orders',
  'Buyers',
  'Items Sold',
  'Add to Cart',
  'Average Order Value',
  'Average Basket Size',
  'GPM',
  'Advertising Cost',
  'ROI GMV Max',

  // 3. Canonical Viewership & Engagement KPIs
  'Total Views',
  'Total Viewers',
  'Impressions',
  'Current Viewers',
  'Peak Viewers',
  'Engaged Viewers',
  'Average Viewers',
  'Average Watch Time (s)',
  'Product Clicks',
  'CTR',
  'CVR',
  'CTOR',
  'Comment Rate',
  'Likes',
  'Comments',
  'Shares',
  'New Followers',
  'Live Duration Minutes',

  // 4. Report Lifecycle & Approval Metadata
  'Report Status',
  'Metrics Confirmed',
  'Confirmed At',
  'Confirmed By',
  'Submitted At',
  'Submitted By',

  // 5. Narrative & Feedback Fields
  'Traffic Throughout the Session',
  'Platform Vouchers',
  'Shop Vouchers',
  'Best-performing Time Slots',
  'Customer Interest in Products and Gifts',
  'Main Customer Comment Topics',
  'Live Pricing Feedback',
  'Top-selling Products',
  'Issues Encountered During the Live',
] as const

export const REPORT_CURRENCY_COLUMNS = [
  'Revenue',
  'GMV',
  'Estimated GMV',
  'Average Order Value',
  'Average Basket Size',
  'Advertising Cost',
]

export const buildReportExportRows = (reports: Report[], context: ReportExportContext) => reports.map(report => {
  const shift = context.shifts.find(candidate => candidate.id === report.shift_id)
  const resolved = shift ? resolveShiftDateTime(shift.date, shift.start_time, shift.end_time) : null
  const campaign = context.campaigns.find(candidate => candidate.id === shift?.campaign_id)
  const userName = (id?: string) => id ? context.users.find(user => user.id === id)?.full_name || id : ''
  const assignedNames = (role: 'host' | 'support' | 'technical', fallbackId?: string) => {
    const ids = new Set([
      ...(fallbackId ? [fallbackId] : []),
      ...(context.registrations || [])
        .filter(registration => registration.shift_id === shift?.id && registration.operational_role === role && (registration.status === 'approved' || registration.status === 'manually_assigned'))
        .map(registration => registration.user_id),
    ])
    return [...ids].map(userName).join(', ')
  }

  const pMetrics = (report.platform_metrics || {}) as Record<string, unknown>
  const nMetrics = (report.normalized_metrics || {}) as Record<string, unknown>

  const getMetric = (...keys: (ReportMetricKey | string)[]): number | '' => {
    for (const key of keys) {
      const val = pMetrics[key] ?? nMetrics[key]
      if (typeof val === 'number' && Number.isFinite(val)) {
        return val
      }
    }
    return ''
  }

  const revenueVal = getMetric('revenue', 'sales') !== ''
    ? getMetric('revenue', 'sales')
    : (typeof report.revenue === 'number' ? report.revenue : 0)

  const gmvVal = getMetric('gmv') !== ''
    ? getMetric('gmv')
    : (report.gmv ?? revenueVal)

  const ordersVal = getMetric('orders') !== ''
    ? getMetric('orders')
    : (typeof report.orders === 'number' ? report.orders : 0)

  const aovVal = getMetric('average_order_value', 'average_basket_size') !== ''
    ? getMetric('average_order_value', 'average_basket_size')
    : (report.average_order_value ?? (typeof revenueVal === 'number' && typeof ordersVal === 'number' && ordersVal > 0 ? revenueVal / ordersVal : ''))

  const liveDurationMinutes = report.live_duration_minutes ?? (
    getMetric('live_duration_seconds') !== '' ? Number(getMetric('live_duration_seconds')) / 60 : 0
  )

  const rawRow: Record<string, unknown> = {
    // 1. Shift & Schedule Metadata
    'Report ID': report.id,
    'Shift ID': report.shift_id,
    'Start Date': shift?.date || '',
    'End Date': resolved?.endDate || shift?.date || '',
    Time: shift ? `${shift.start_time}-${shift.end_time}` : '',
    'Shift Duration Minutes': resolved?.durationMinutes ?? '',
    Brand: shift ? context.brands.get(shift.brand_id) || shift.brand_id : '',
    Platform: shift ? context.platforms.get(shift.platform_id) || shift.platform_id : '',
    Campaign: campaign?.name || '',
    Studio: shift?.studio || '',
    Host: assignedNames('host', shift?.host_id),
    Support: assignedNames('support', shift?.support_id),
    Technical: assignedNames('technical', shift?.technical_id),

    // 2. Canonical Financial & Sales KPIs
    Revenue: revenueVal,
    GMV: gmvVal,
    'Estimated GMV': getMetric('estimated_gmv'),
    Orders: ordersVal,
    'SKU Orders': getMetric('sku_orders'),
    Buyers: getMetric('buyers'),
    'Items Sold': getMetric('items_sold'),
    'Add to Cart': getMetric('add_to_cart'),
    'Average Order Value': aovVal,
    'Average Basket Size': getMetric('average_basket_size'),
    GPM: getMetric('gpm'),
    'Advertising Cost': getMetric('advertising_cost'),
    'ROI GMV Max': getMetric('roi_gmv_max'),

    // 3. Canonical Viewership & Engagement KPIs
    'Total Views': getMetric('total_views'),
    'Total Viewers': getMetric('total_viewers'),
    Impressions: getMetric('impressions'),
    'Current Viewers': getMetric('current_viewers'),
    'Peak Viewers': getMetric('pcu', 'peak_concurrent_viewers') !== '' ? getMetric('pcu', 'peak_concurrent_viewers') : (report.peak_viewer ?? ''),
    'Engaged Viewers': getMetric('engaged_viewers'),
    'Average Viewers': typeof report.average_viewer === 'number' ? report.average_viewer : '',
    'Average Watch Time (s)': getMetric('average_view_duration_seconds'),
    'Product Clicks': getMetric('product_clicks') !== '' ? getMetric('product_clicks') : (report.product_clicks ?? ''),
    CTR: getMetric('ctr', 'live_ctr', 'click_rate') !== '' ? getMetric('ctr', 'live_ctr', 'click_rate') : (report.ctr ?? ''),
    CVR: getMetric('conversion_rate', 'click_to_order_rate') !== '' ? getMetric('conversion_rate', 'click_to_order_rate') : (report.cvr ?? ''),
    CTOR: getMetric('ctor'),
    'Comment Rate': getMetric('comment_rate'),
    Likes: getMetric('likes') !== '' ? getMetric('likes') : (report.likes ?? ''),
    Comments: getMetric('comments') !== '' ? getMetric('comments') : (report.comments ?? ''),
    Shares: getMetric('shares') !== '' ? getMetric('shares') : (report.shares ?? ''),
    'New Followers': getMetric('new_followers'),
    'Live Duration Minutes': liveDurationMinutes,

    // 4. Report Lifecycle & Approval Metadata
    'Report Status': report.status || (report.metrics_confirmed ? 'confirmed' : 'draft'),
    'Metrics Confirmed': Boolean(report.metrics_confirmed),
    'Confirmed At': report.confirmed_at || '',
    'Confirmed By': userName(report.confirmed_by),
    'Submitted At': report.created_at,
    'Submitted By': userName(report.submitted_by),

    // 5. Narrative & Feedback Fields
    'Traffic Throughout the Session': report.final_recap?.traffic_summary || '',
    'Platform Vouchers': report.final_recap?.platform_vouchers || '',
    'Shop Vouchers': report.final_recap?.shop_vouchers || '',
    'Best-performing Time Slots': report.final_recap?.best_performing_time_slots || '',
    'Customer Interest in Products and Gifts': report.final_recap?.customer_product_gift_interest || '',
    'Main Customer Comment Topics': report.final_recap?.main_comment_topics || '',
    'Live Pricing Feedback': report.final_recap?.live_price_feedback || '',
    'Top-selling Products': report.final_recap?.top_selling_products || '',
    'Issues Encountered During the Live': report.final_recap?.live_issues || '',
  }

  const orderedRow: Record<string, unknown> = {}
  for (const col of REPORT_EXPORT_COLUMN_ORDER) {
    orderedRow[col] = rawRow[col] ?? ''
  }
  return orderedRow
})

export function exportReportsToExcel(reports: Report[], context: ReportExportContext): void {
  writeWorkbook('reports_filtered_' + format(new Date(), 'yyyy-MM-dd') + '.xlsx', [{
    name: 'Reports',
    rows: buildReportExportRows(reports, context),
    currencyColumns: REPORT_CURRENCY_COLUMNS,
  }])
}

export function exportReportDetailToExcel(report: Report, context: ReportExportContext): void {
  writeWorkbook('report_' + report.id + '.xlsx', [{
    name: 'Report',
    rows: buildReportExportRows([report], context),
    currencyColumns: REPORT_CURRENCY_COLUMNS,
  }])
}
export function exportReportImageMetadataToExcel(
  images: ReportImage[],
  reports: Report[],
): void {
  writeWorkbook(`report_images_${format(new Date(), 'yyyy-MM-dd')}.xlsx`, [{
    name: 'Images',
    rows: images
      .filter(image => reports.some(report => report.id === image.report_id))
      .map(image => ({
        'Report ID': image.report_id,
        Category: image.image_type,
        'Original Name': image.original_name || '',
        'Storage Path': image.storage_path || '',
        'Mock URL': image.image_url.startsWith('blob:') ? 'Local mock object URL' : image.image_url,
        'MIME Type': image.mime_type || '',
        'Size Bytes': image.size_bytes || 0,
        'Created At': image.created_at,
      })),
  }])
}

export function downloadReportTemplate(): void {
  writeWorkbook('report_template.xlsx', [{
    name: 'Report',
    currencyColumns: ['Revenue', 'GMV', 'Average Order Value'],
    rows: [{
      'Shift ID': '',
      Revenue: 0,
      GMV: 0,
      Orders: 0,
      Viewers: 0,
      'Product Clicks': 0,
      CTR: 0,
      CVR: 0,
      'Average Order Value': 0,
      'Live Duration Minutes': 0,
      'What Went Well': '',
      'Improvement Areas': '',
      'Traffic Throughout the Session': '',
      'Platform Vouchers': '',
      'Shop Vouchers': '',
      'Best-performing Time Slots': '',
      'Customer Interest in Products and Gifts': '',
      'Main Customer Comment Topics': '',
      'Live Pricing Feedback': '',
      'Top-selling Products': '',
      'Issues Encountered During the Live': '',
    }],
  }])
}

export function exportSwapsToExcel(
  swaps: SwapRequest[],
  shifts: Shift[],
  users: Map<string, string>,
  brands: Map<string, string>,
  campaigns: Map<string, string>,
  filename = `swap_requests_${format(new Date(), 'yyyy-MM-dd')}.xlsx`,
): void {
  writeWorkbook(filename, [{
    name: 'Swaps',
    rows: swaps.map(swap => {
      const shift = shifts.find(candidate => candidate.id === swap.shift_id)
      const resolved = shift ? resolveShiftDateTime(shift.date, shift.start_time, shift.end_time) : null
      const originalId = swap.original_staff_id || swap.requester_id
      const replacementId = swap.replacement_staff_id || swap.new_host_id || swap.new_support_id || swap.new_technical_id
      return {
        'Request ID': swap.id,
        'Shift ID': swap.shift_id,
        'Start Date': shift?.date || '',
        'End Date': resolved?.endDate || shift?.date || '',
        Time: shift ? `${shift.start_time}-${shift.end_time}` : '',
        'Shift Duration Minutes': resolved?.durationMinutes ?? '',
        Brand: shift ? brands.get(shift.brand_id) || shift.brand_id : '',
        Campaign: shift?.campaign_id ? campaigns.get(shift.campaign_id) || shift.campaign_id : '',
        Role: swap.operational_role || (swap.new_support_id ? 'support' : swap.new_technical_id ? 'technical' : 'host'),
        'Original Staff': users.get(originalId) || originalId,
        'Replacement Staff': replacementId ? users.get(replacementId) || replacementId : '',
        Status: swap.status,
        Reason: swap.reason,
        Notes: swap.notes || '',
        'Approval History': (swap.approval_history || [])
          .map(item => `${item.action} by ${users.get(item.actor_id) || item.actor_id} at ${item.at}${item.notes ? `: ${item.notes}` : ''}`)
          .join('\n'),
        'Created At': swap.created_at,
      }
    }),
  }])
}

export function downloadSwapRequestTemplate(): void {
  writeWorkbook('swap_request_template.xlsx', [{
    name: 'Swap Request',
    rows: [{
      'Shift ID': '',
      Role: 'host',
      'Original Staff Email': '',
      'Replacement Staff Email': '',
      Reason: '',
      Notes: '',
    }],
  }])
}
