import * as XLSX from 'xlsx'
import { safeSpreadsheetValue, type CalendarExportField, type ExportSheet, type ExportRecord } from './calendarExport'

export function buildCalendarExport(data: Record<ExportSheet, ExportRecord[]>, fields: CalendarExportField[], format: 'xlsx' | 'csv'): ArrayBuffer | string {
  const groups = [...new Set(fields.map(field => field.group))]
  if (format === 'csv' && (groups.length !== 1 || groups[0] !== 'schedule')) throw new Error('EXPORT_CSV_FLAT_FIELDS_REQUIRED')
  const workbook = XLSX.utils.book_new()
  for (const group of groups) {
    if (format === 'xlsx' && data[group].length > 1_048_575) throw new Error('EXPORT_XLSX_LIMIT_EXCEEDED')
    const columns = fields.filter(field => field.group === group)
    const rows = [columns.map(field => field.label), ...data[group].map(row => columns.map(field => safeSpreadsheetValue(field.transformer(row))))]
    const worksheet = XLSX.utils.aoa_to_sheet(rows)
    worksheet['!cols'] = columns.map(field => ({ wch: Math.min(40, Math.max(14, field.label.length + 2)) }))
    XLSX.utils.book_append_sheet(workbook, worksheet, { schedule: 'Lịch ca', registrations: 'Đăng ký', actual: 'Giờ thực tế', audit: 'Lịch sử' }[group])
  }
  return format === 'xlsx' ? XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
    : '\uFEFF' + XLSX.utils.sheet_to_csv(workbook.Sheets[workbook.SheetNames[0]], { RS: '\r\n' })
}
