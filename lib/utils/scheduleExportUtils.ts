/**
 * S4D — Schedule Export Utilities
 *
 * Pure, side-effect-free helpers for building operational schedule export rows
 * and triggering XLSX / CSV downloads.  UI-independent — no React deps.
 *
 * Design notes
 * —————————————
 * - Column order is deterministic (see SCHEDULE_EXPORT_COLUMN_ORDER constant).
 * - Canonical actual staffing comes from staffed ShiftRegistrations / assigned users.
 * - Imported schedule labels remain separate metadata under Scheduled * Names.
 * - Dates and times are written as TEXT strings so Excel never auto-converts
 *   them to date serials (regression guard for 2026-08-25, 14:00-16:00, etc.).
 * - Vietnamese text: SheetJS writes UTF-8 natively; no special handling needed.
 * - CSV uses UTF-8 BOM so Excel opens it correctly without mis-encoding.
 * - No DB calls, no auth, no side effects beyond triggering a browser download.
 */

import * as XLSX from 'xlsx'
import { format } from 'date-fns'
import type { Shift, Brand, Platform, Campaign, User, ShiftRegistration } from '@/lib/types/database.types'
import { resolveShiftDateTime } from '@/lib/utils/shiftUtils'

// --- Row shape ---------------------------------------------------------------

/**
 * One exported schedule row.  All fields are plain primitives so they
 * serialise identically whether written to XLSX or CSV.
 *
 * Dates / times are `string` — never `number` — to prevent Excel serial
 * auto-conversion.
 */
export interface ScheduleExportRow {
  /** Shift primary key */
  'Shift ID': string
  /** Import batch that created this shift, if any */
  'Import Batch ID': string
  /** ISO date string YYYY-MM-DD  (written as text in Excel) */
  'Date': string
  /** HH:MM 24-hour start time  (written as text in Excel) */
  'Start Time': string
  /** HH:MM 24-hour end time  (written as text in Excel) */
  'End Time': string
  /** Date of the end time — differs from Date only when crosses midnight */
  'End Date': string
  /** Whether the shift runs past midnight */
  'Crosses Midnight': boolean
  /** Total duration in minutes */
  'Duration (min)': number | ''
  'Brand': string
  'Platform': string
  'Campaign': string
  'Title': string
  'Studio': string
  /** Comma-separated assigned host full names from staffed registrations / assigned host_id */
  'Assigned Host Names': string
  /** Comma-separated assigned support full names from staffed registrations / assigned support_id */
  'Assigned Support Names': string
  /** Comma-separated assigned technical full names from staffed registrations / assigned technical_id */
  'Assigned Technical Names': string
  /** Comma-separated host display names from the imported schedule */
  'Scheduled Host Names': string
  /** Comma-separated assistant display names from the imported schedule */
  'Scheduled Support Names': string
  /** Comma-separated technical display names from the imported schedule */
  'Scheduled Technical Names': string
  'Required Host Count': number
  'Required Support Count': number
  'Required Technical Count': number
  'Status': string
  'Registration Locked': boolean
  'Live Link': string
  'Notes': string
}

/** Deterministic column order for the exported file. */
export const SCHEDULE_EXPORT_COLUMN_ORDER: ReadonlyArray<keyof ScheduleExportRow> = [
  'Shift ID',
  'Import Batch ID',
  'Date',
  'Start Time',
  'End Time',
  'End Date',
  'Crosses Midnight',
  'Duration (min)',
  'Brand',
  'Platform',
  'Campaign',
  'Title',
  'Studio',
  'Assigned Host Names',
  'Assigned Support Names',
  'Assigned Technical Names',
  'Scheduled Host Names',
  'Scheduled Support Names',
  'Scheduled Technical Names',
  'Required Host Count',
  'Required Support Count',
  'Required Technical Count',
  'Status',
  'Registration Locked',
  'Live Link',
  'Notes',
]

// --- Helper: Staffed registration predicate ---------------------------------

export const isStaffedRegistrationRecord = (
  registration: Pick<ShiftRegistration, 'status'>,
): boolean =>
  registration.status === 'approved' || registration.status === 'manually_assigned'

// --- Row builder ------------------------------------------------------------

/**
 * Builds export rows for the given shifts.
 * Accepts entity-name Maps (id to name) for brand / platform / campaign / user lookup
 * and shift registrations for resolving canonical actual assigned staffing.
 */
export function buildScheduleExportRows(
  shifts: Shift[],
  brands: Map<string, string>,
  platforms: Map<string, string>,
  campaigns: Map<string, string>,
  users: Map<string, string> | User[] = new Map(),
  registrations: ShiftRegistration[] = [],
): ScheduleExportRow[] {
  const userMap: Map<string, string> = users instanceof Map
    ? users
    : new Map(users.map(u => [u.id, u.full_name]))

  const getUserName = (id?: string): string => {
    if (!id) return ''
    return userMap.get(id) ?? id
  }

  const getAssignedNames = (
    shift: Shift,
    role: 'host' | 'support' | 'technical',
    fallbackId?: string,
  ): string => {
    const ids = new Set<string>()
    if (fallbackId) {
      ids.add(fallbackId)
    }
    for (const reg of registrations) {
      if (
        reg.shift_id === shift.id &&
        reg.operational_role === role &&
        isStaffedRegistrationRecord(reg)
      ) {
        ids.add(reg.user_id)
      }
    }
    return [...ids].map(getUserName).filter(Boolean).join(', ')
  }

  return shifts.map(shift => {
    const resolved = resolveShiftDateTime(shift.date, shift.start_time, shift.end_time)
    return {
      'Shift ID': shift.id,
      'Import Batch ID': shift.import_batch_id ?? '',
      'Date': shift.date,
      'Start Time': shift.start_time,
      'End Time': shift.end_time,
      'End Date': resolved?.endDate ?? shift.date,
      'Crosses Midnight': Boolean(resolved?.crossesMidnight),
      'Duration (min)': resolved?.durationMinutes ?? '',
      'Brand': brands.get(shift.brand_id) ?? shift.brand_id,
      'Platform': platforms.get(shift.platform_id) ?? shift.platform_id,
      'Campaign': shift.campaign_id ? (campaigns.get(shift.campaign_id) ?? shift.campaign_id) : '',
      'Title': shift.title ?? '',
      'Studio': shift.studio ?? '',
      'Assigned Host Names': getAssignedNames(shift, 'host', shift.host_id),
      'Assigned Support Names': getAssignedNames(shift, 'support', shift.support_id),
      'Assigned Technical Names': getAssignedNames(shift, 'technical', shift.technical_id),
      'Scheduled Host Names': (shift.host_names ?? []).join(', '),
      'Scheduled Support Names': (shift.assistant_names ?? []).join(', '),
      'Scheduled Technical Names': (shift.technical_names ?? []).join(', '),
      'Required Host Count': shift.required_host_count ?? 1,
      'Required Support Count': shift.required_support_count ?? 1,
      'Required Technical Count': shift.required_technical_count ?? 1,
      'Status': shift.status,
      'Registration Locked': Boolean(shift.registration_locked),
      'Live Link': shift.live_link ?? '',
      'Notes': shift.product_notes ?? '',
    }
  })
}

// --- Filename helper ---------------------------------------------------------

/**
 * Builds a descriptive, filesystem-safe filename for the export.
 *
 * Scope rules:
 * - `selected` — N-shifts export, uses today`s date
 * - `filtered` — month-scoped view; if shifts span multiple months uses first-to-last date
 */
export function buildScheduleExportFilename(
  scope: 'filtered' | 'selected',
  shifts: Shift[],
  ext: 'xlsx' | 'csv',
  currentDate: Date = new Date(),
): string {
  if (scope === 'selected') {
    const n = shifts.length
    const dateTag = format(currentDate, 'yyyy-MM-dd')
    return `schedule_export_${dateTag}_${n}-shifts.${ext}`
  }

  // filtered — summarise the date range of what is being exported
  const dates = shifts.map(s => s.date).sort()
  if (dates.length === 0) {
    return `schedule_export_${format(currentDate, 'yyyy-MM')}_filtered.${ext}`
  }

  const first = dates[0]
  const last = dates[dates.length - 1]
  const firstMonth = first.slice(0, 7)
  const lastMonth = last.slice(0, 7)

  if (firstMonth === lastMonth) {
    return `schedule_export_${firstMonth}_filtered.${ext}`
  }
  return `schedule_export_${first}_to_${last}_filtered.${ext}`
}

// --- XLSX download ----------------------------------------------------------

/** Columns that must be written as explicit text to prevent Excel serial conversion. */
const EXCEL_TEXT_COLUMNS: ReadonlySet<keyof ScheduleExportRow> = new Set([
  'Date', 'Start Time', 'End Time', 'End Date',
  'Shift ID', 'Import Batch ID',
])

/**
 * Writes rows to an XLSX workbook and triggers a browser download.
 *
 * Critical: date/time columns are force-typed as text cells so Excel cannot
 * silently convert '2026-08-25' to a date serial or '14:00' to a fraction.
 * Column-width auto-fit mirrors the existing excelUtils pattern (max 50 chars).
 */
export function downloadScheduleExportXlsx(
  rows: ScheduleExportRow[],
  filename: string,
): void {
  const workbook = XLSX.utils.book_new()

  const headerRow = [...SCHEDULE_EXPORT_COLUMN_ORDER]
  const dataRows = rows.map(row =>
    SCHEDULE_EXPORT_COLUMN_ORDER.map(col => row[col]),
  )

  const aoa = [headerRow, ...dataRows]
  const worksheet = XLSX.utils.aoa_to_sheet(aoa)

  // Re-type date/time cells as explicit text to prevent Excel auto-conversion
  rows.forEach((row, rowIndex) => {
    SCHEDULE_EXPORT_COLUMN_ORDER.forEach((col, colIndex) => {
      if (!EXCEL_TEXT_COLUMNS.has(col)) return
      const cellRef = XLSX.utils.encode_cell({ c: colIndex, r: rowIndex + 1 })
      const cell = worksheet[cellRef]
      if (cell) {
        cell.t = 's'
        cell.v = String(row[col] ?? '')
        delete cell.z
        delete cell.w
      }
    })
  })

  // Auto-fit column widths (capped at 50, same as existing excelUtils)
  worksheet['!cols'] = SCHEDULE_EXPORT_COLUMN_ORDER.map(col => ({
    wch: Math.min(
      50,
      Math.max(
        col.length,
        ...rows.map(row => String(row[col] ?? '').length),
      ),
    ),
  }))

  XLSX.utils.book_append_sheet(workbook, worksheet, 'Schedule')
  XLSX.writeFile(workbook, filename)
}

// --- CSV download -----------------------------------------------------------

/**
 * Converts rows to a UTF-8 CSV (with BOM for Excel compatibility) and
 * triggers a browser download.
 *
 * All values are RFC 4180 quoted so commas/newlines inside Vietnamese names
 * are handled correctly.
 */
export function downloadScheduleExportCsv(
  rows: ScheduleExportRow[],
  filename: string,
): void {
  const csvCell = (value: unknown): string => {
    const str = String(value ?? '')
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replaceAll('"', '""')}"`
    }
    return str
  }

  const lines: string[] = [
    SCHEDULE_EXPORT_COLUMN_ORDER.map(h => csvCell(h)).join(','),
    ...rows.map(row => SCHEDULE_EXPORT_COLUMN_ORDER.map(col => csvCell(row[col])).join(',')),
  ]

  // UTF-8 BOM ensures Excel opens without mis-encoding Vietnamese characters
  const csv = '\uFEFF' + lines.join('\r\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  anchor.click()
  setTimeout(() => {
    document.body.removeChild(anchor)
    URL.revokeObjectURL(url)
  }, 100)
}

// --- Convenience: entity-name Map builders ----------------------------------

/** Builds a Map<id, name> from Brand[] for passing to buildScheduleExportRows. */
export function brandsToNameMap(brands: Brand[]): Map<string, string> {
  return new Map(brands.map(b => [b.id, b.name]))
}

/** Builds a Map<id, name> from Platform[] for passing to buildScheduleExportRows. */
export function platformsToNameMap(platforms: Platform[]): Map<string, string> {
  return new Map(platforms.map(p => [p.id, p.name]))
}

/** Builds a Map<id, name> from Campaign[] for passing to buildScheduleExportRows. */
export function campaignsToNameMap(campaigns: Campaign[]): Map<string, string> {
  return new Map(campaigns.map(c => [c.id, c.name]))
}

/** Builds a Map<id, full_name> from User[] for passing to buildScheduleExportRows. */
export function usersToNameMap(users: User[]): Map<string, string> {
  return new Map(users.map(u => [u.id, u.full_name]))
}
