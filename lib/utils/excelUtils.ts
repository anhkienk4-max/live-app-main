import * as XLSX from 'xlsx'
import { format } from 'date-fns'
import {
  Campaign,
  Report,
  ReportImage,
  ScheduleImportRow,
  Shift,
  ShiftRegistration,
  SwapRequest,
  User,
} from '@/lib/types/database.types'
import { getExcelCurrencyNumberFormat } from '@/lib/utils/currency'
import { MAX_SHIFT_CAPACITY, normalizeCapacity, resolveShiftDateTime, shiftDateTimeFields } from '@/lib/utils/shiftUtils'

export interface ImportError {
  row: number
  field: string
  message: string
}

export interface ImportPreviewRow {
  row: ScheduleImportRow
  shift?: Omit<Shift, 'id' | 'created_at' | 'updated_at'>
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

type EntityMaps = {
  brands: Map<string, string>
  platforms: Map<string, string>
  campaigns: Map<string, string>
}

type ScheduleSheetRow = Record<string, unknown>

const scheduleHeaders = {
  date: ['date', 'ngay'],
  timeRange: ['time', 'gio', 'shift time', 'khung gio', 'thoi gian'],
  startTime: ['start time', 'gio bat dau', 'tu gio'],
  endTime: ['end time', 'gio ket thuc', 'den gio'],
  brand: ['brand', 'thuong hieu', 'nhan hang'],
  platform: ['platform', 'nen tang', 'kenh'],
  campaign: ['campaign', 'chien dich'],
  title: ['shift name', 'shift title', 'ten ca', 'ca'],
  hostCount: ['required host count', 'required host', 'so host', 'host'],
  supportCount: ['required support count', 'required support', 'so support', 'support', 'ho tro'],
  technicalCount: ['required technical count', 'required technical', 'so technical', 'technical', 'ky thuat'],
  notes: ['notes', 'note', 'ghi chu'],
} as const

const normalizeLookup = (value: unknown) => String(value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/đ/g, 'd')
  .replace(/Đ/g, 'D')
  .replace(/\s+/g, ' ')
  .trim()
  .toLowerCase()

const valueFor = (row: ScheduleSheetRow, aliases: readonly string[]) => {
  const normalized = Object.fromEntries(
    Object.entries(row).map(([key, value]) => [normalizeLookup(key), value]),
  )
  const alias = aliases.find(candidate => Object.prototype.hasOwnProperty.call(normalized, candidate))
  return alias ? normalized[alias] : undefined
}

const normalizeDate = (value: unknown): string => {
  if (typeof value === 'number') {
    const parsed = XLSX.SSF.parse_date_code(value)
    if (parsed) return `${parsed.y}-${String(parsed.m).padStart(2, '0')}-${String(parsed.d).padStart(2, '0')}`
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) return format(value, 'yyyy-MM-dd')
  const text = String(value ?? '').trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text
  const match = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/)
  if (match) return `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`
  return text
}

const normalizeTime = (value: unknown): string => {
  if (typeof value === 'number') {
    const totalMinutes = Math.round(value * 24 * 60)
    return `${String(Math.floor(totalMinutes / 60) % 24).padStart(2, '0')}:${String(totalMinutes % 60).padStart(2, '0')}`
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

const sameShift = (
  shift: Pick<Shift, 'date' | 'start_time' | 'end_time' | 'brand_id' | 'platform_id'>,
  candidate: Pick<Shift, 'date' | 'start_time' | 'end_time' | 'brand_id' | 'platform_id'>,
) =>
  shift.date === candidate.date &&
  shift.start_time === candidate.start_time &&
  shift.end_time === candidate.end_time &&
  shift.brand_id === candidate.brand_id &&
  shift.platform_id === candidate.platform_id

export function parseScheduleRows(
  sourceRows: ScheduleSheetRow[],
  maps: EntityMaps,
  existingShifts: Shift[] = [],
): ImportResult {
  const previews: ImportPreviewRow[] = []
  const errors: ImportError[] = []
  const warnings: ImportError[] = []
  const candidates: Array<Omit<Shift, 'id' | 'created_at' | 'updated_at'>> = []

  sourceRows.forEach((source, index) => {
    const rowNumber = index + 2
    const rowText = Object.values(source).map(value => String(value ?? '')).join(' ').replace(/\s+/g, ' ').trim()
    if (/^total\s*week\s*[1-4]\b/i.test(normalizeLookup(rowText))) return
    const date = normalizeDate(valueFor(source, scheduleHeaders.date))
    const [rangeStart, rangeEnd] = normalizeTimeRange(valueFor(source, scheduleHeaders.timeRange))
    const startTime = normalizeTime(valueFor(source, scheduleHeaders.startTime)) || rangeStart
    const endTime = normalizeTime(valueFor(source, scheduleHeaders.endTime)) || rangeEnd
    const brandName = String(valueFor(source, scheduleHeaders.brand) ?? '').trim()
    const rawPlatformName = String(valueFor(source, scheduleHeaders.platform) ?? '').trim()
    const platformAlias = normalizeLookup(rawPlatformName)
    const platformName = ['shp', 'shopee'].includes(platformAlias)
      ? 'Shopee Live'
      : ['tts', 'tiktok', 'tt shop', 'tiktok shop'].includes(platformAlias)
        ? 'TikTok Shop'
        : rawPlatformName
    const campaignName = String(valueFor(source, scheduleHeaders.campaign) ?? '').trim()
    const suppliedTitle = String(valueFor(source, scheduleHeaders.title) ?? '').trim()
    const title = suppliedTitle || (brandName && platformName ? `${brandName} – ${platformName}` : brandName)
    const notes = String(valueFor(source, scheduleHeaders.notes) ?? '').trim()
    const rawHostCount = valueFor(source, scheduleHeaders.hostCount)
    const rawSupportCount = valueFor(source, scheduleHeaders.supportCount)
    const rawTechnicalCount = valueFor(source, scheduleHeaders.technicalCount)
    const hostCount = normalizeCapacity(rawHostCount)
    const supportCount = normalizeCapacity(rawSupportCount)
    const technicalCount = normalizeCapacity(rawTechnicalCount)
    const rowErrors: string[] = []
    const rowWarnings: string[] = []

    if (!date) rowErrors.push('Date is required.')
    else if (!validIsoDate(date)) rowErrors.push('Date must use YYYY-MM-DD or DD/MM/YYYY.')
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
    if (hostCount === null) rowErrors.push(`Required Host count must be a whole number from 0 to ${MAX_SHIFT_CAPACITY}.`)
    if (supportCount === null) rowErrors.push(`Required Support count must be a whole number from 0 to ${MAX_SHIFT_CAPACITY}.`)
    if (technicalCount === null) rowErrors.push(`Required Technical count must be a whole number from 0 to ${MAX_SHIFT_CAPACITY}.`)

    const normalizedBrands = new Map([...maps.brands].map(([name, id]) => [normalizeLookup(name), id]))
    const normalizedPlatforms = new Map([...maps.platforms].map(([name, id]) => [normalizeLookup(name), id]))
    const normalizedCampaigns = new Map([...maps.campaigns].map(([name, id]) => [normalizeLookup(name), id]))
    const brandId = normalizedBrands.get(normalizeLookup(brandName))
    const platformId = normalizedPlatforms.get(normalizeLookup(platformName))
    const campaignId = campaignName ? normalizedCampaigns.get(normalizeLookup(campaignName)) : undefined
    if (brandName && !brandId) rowErrors.push(`Brand "${brandName}" was not found.`)
    if (platformName && !platformId) rowErrors.push(`Platform "${platformName}" was not found.`)
    if (campaignName && !campaignId) rowErrors.push(`Campaign "${campaignName}" was not found.`)

    let shift: Omit<Shift, 'id' | 'created_at' | 'updated_at'> | undefined
    if (brandId && platformId && rowErrors.length === 0) {
      shift = {
        date,
        start_time: startTime,
        end_time: endTime,
        brand_id: brandId,
        platform_id: platformId,
        campaign_id: campaignId,
        title,
        required_host_count: hostCount!,
        required_support_count: supportCount!,
        required_technical_count: technicalCount!,
        registration_locked: false,
        allow_multi_role: false,
        status: 'scheduled',
        product_notes: notes || undefined,
        ...shiftDateTimeFields(date, startTime, endTime)!,
      }
      if (existingShifts.some(existing => sameShift(existing, shift!)) || candidates.some(existing => sameShift(existing, shift!))) {
        rowWarnings.push('A shift with the same brand, platform, date, and time already exists.')
      }
      candidates.push(shift)
    }

    rowErrors.forEach(message => errors.push({ row: rowNumber, field: 'row', message }))
    rowWarnings.forEach(message => warnings.push({ row: rowNumber, field: 'duplicate', message }))
    previews.push({
      row: {
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
        required_host_count: hostCount ?? String(rawHostCount ?? '').trim(),
        required_support_count: supportCount ?? String(rawSupportCount ?? '').trim(),
        required_technical_count: technicalCount ?? String(rawTechnicalCount ?? '').trim(),
        notes: notes || undefined,
        warnings: rowWarnings,
        errors: rowErrors,
      },
      shift,
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

const rowsFromWorkbook = (data: ArrayBuffer | string, type: 'array' | 'string') => {
  const workbook = XLSX.read(data, { type, cellDates: true })
  const worksheet = workbook.Sheets[workbook.SheetNames[0]]
  return XLSX.utils.sheet_to_json<ScheduleSheetRow>(worksheet, { defval: '' })
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
    const rows = rowsFromWorkbook(await file.arrayBuffer(), 'array')
    return parseScheduleRows(rows, {
      brands: new Map([...brandsMap].map(([name, id]) => [name.toLowerCase(), id])),
      platforms: new Map([...platformsMap].map(([name, id]) => [name.toLowerCase(), id])),
      campaigns: new Map([...campaignsMap].map(([name, id]) => [name.toLowerCase(), id])),
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
  const maps = {
    brands: new Map([...brandsMap].map(([name, id]) => [name.toLowerCase(), id])),
    platforms: new Map([...platformsMap].map(([name, id]) => [name.toLowerCase(), id])),
    campaigns: new Map([...campaignsMap].map(([name, id]) => [name.toLowerCase(), id])),
  }
  if (url === 'mock://schedule') return parseScheduleRows(mockGoogleRows, maps, existingShifts)
  const normalizedUrl = normalizeGoogleSheetsUrl(url)
  const response = await fetch(normalizedUrl)
  if (!response.ok) throw new Error('The public Google Sheets CSV could not be loaded.')
  const rows = rowsFromWorkbook(await response.text(), 'string')
  return parseScheduleRows(rows, maps, existingShifts)
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

export function downloadExcelTemplate(): void {
  writeWorkbook('shift_import_template.xlsx', [
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
        'Required Host count': 1,
        'Required Support count': 1,
        'Required Technical count': 1,
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
        { Field: 'Required role counts', Format: 'Whole number >= 0', Required: 'Yes' },
        { Field: 'Notes', Format: 'Text', Required: 'No' },
      ],
    },
  ])
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

const reportRows = (reports: Report[], context: ReportExportContext) => reports.map(report => {
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
  return {
    'Report ID': report.id,
    'Shift ID': report.shift_id,
    'Start Date': shift?.date || '',
    'End Date': resolved?.endDate || shift?.date || '',
    Time: shift ? `${shift.start_time}-${shift.end_time}` : '',
    'Shift Duration Minutes': resolved?.durationMinutes ?? '',
    Brand: shift ? context.brands.get(shift.brand_id) || shift.brand_id : '',
    Platform: shift ? context.platforms.get(shift.platform_id) || shift.platform_id : '',
    Campaign: campaign?.name || '',
    Host: assignedNames('host', shift?.host_id),
    Support: assignedNames('support', shift?.support_id),
    Technical: assignedNames('technical', shift?.technical_id),
    Revenue: report.revenue,
    GMV: report.gmv ?? report.revenue,
    Orders: report.orders,
    Viewers: report.viewers ?? report.average_viewer,
    'Product Clicks': report.product_clicks ?? 0,
    CTR: report.ctr ?? 0,
    CVR: report.cvr ?? 0,
    'Average Order Value': report.average_order_value ?? (report.orders ? report.revenue / report.orders : 0),
    'Live Duration Minutes': report.live_duration_minutes ?? 0,
    'Report Status': report.status || (report.metrics_confirmed ? 'confirmed' : 'draft'),
    'Metrics Confirmed': Boolean(report.metrics_confirmed),
    'Confirmed At': report.confirmed_at || '',
    'Confirmed By': userName(report.confirmed_by),
    'Submitted At': report.created_at,
    'Submitted By': userName(report.submitted_by),
  }
})

export function exportReportsToExcel(reports: Report[], context: ReportExportContext): void {
  writeWorkbook(`reports_filtered_${format(new Date(), 'yyyy-MM-dd')}.xlsx`, [{
    name: 'Reports',
    rows: reportRows(reports, context),
    currencyColumns: ['Revenue', 'GMV', 'Average Order Value'],
  }])
}

export function exportReportDetailToExcel(report: Report, context: ReportExportContext): void {
  writeWorkbook(`report_${report.id}.xlsx`, [{
    name: 'Report',
    rows: reportRows([report], context),
    currencyColumns: ['Revenue', 'GMV', 'Average Order Value'],
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
          .map(item => `${item.action} by ${users.get(item.by) || item.by} at ${item.at}${item.notes ? `: ${item.notes}` : ''}`)
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
