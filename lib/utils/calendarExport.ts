import { permissionMatrix, type Permission } from '@/lib/permissions'
import type { SystemPermission } from '@/lib/types/database.types'
import { SCHEDULE_EXPORT_COLUMN_ORDER, type ScheduleExportRow } from './scheduleExportFields'

export type ExportSheet = 'schedule' | 'registrations' | 'actual' | 'audit'
type Value = string | number | boolean | null
export type ExportRecord = Record<string, Value>
export interface CalendarExportField { id: string; label: string; group: ExportSheet; permission: Permission; order: number; transformer: (row: ExportRecord) => Value }
const labels: Partial<Record<keyof ScheduleExportRow, string>> = {
  'Shift ID': 'Mã ca', Date: 'Ngày', 'Start Time': 'Bắt đầu', 'End Time': 'Kết thúc', 'End Date': 'Ngày kết thúc',
  'Crosses Midnight': 'Qua ngày', 'Duration (min)': 'Thời lượng (phút)', Brand: 'Thương hiệu', Platform: 'Nền tảng', Campaign: 'Chiến dịch',
  Title: 'Tiêu đề', Studio: 'Studio', Status: 'Trạng thái', Notes: 'Ghi chú', 'Live Link': 'Link livestream',
  'Assigned Host Names': 'Host đã gán', 'Assigned Support Names': 'Trợ live đã gán', 'Assigned Technical Names': 'Kỹ thuật đã gán',
  'Scheduled Host Names': 'Host theo lịch', 'Scheduled Support Names': 'Trợ live theo lịch', 'Scheduled Technical Names': 'Kỹ thuật theo lịch',
  'Required Host Count': 'Số Host cần', 'Required Support Count': 'Số Trợ live cần', 'Required Technical Count': 'Số Kỹ thuật cần', 'Registration Locked': 'Khóa đăng ký',
  'Import Batch ID': 'Mã batch import',
}
const field = (id: string, label: string, group: ExportSheet, permission: Permission, order: number, key = id): CalendarExportField => ({ id, label, group, permission, order, transformer: row => row[key] ?? '' })
export const CALENDAR_EXPORT_FIELDS: readonly CalendarExportField[] = [
  ...SCHEDULE_EXPORT_COLUMN_ORDER.map((key, order) => field('schedule.' + key, labels[key] ?? key, 'schedule', 'shifts.export', order, key)),
  ...[['id', 'Mã đăng ký'], ['shift_id', 'Mã ca'], ['staff_name', 'Nhân sự'], ['operational_role', 'Vai trò'], ['status', 'Trạng thái'], ['source', 'Nguồn']].map(([key, label], i) => field('registrations.' + key, label, 'registrations', 'shifts.export', 100 + i, key)),
  ...[['id', 'Mã segment'], ['shift_id', 'Mã ca'], ['staff_name', 'Nhân sự'], ['operational_role', 'Vai trò'], ['actual_start_at', 'Bắt đầu thực tế'], ['actual_end_at', 'Kết thúc thực tế'], ['evidence_note', 'Ghi chú nhân sự'], ['review_status', 'Trạng thái duyệt'], ['supersedes_segment_id', 'Thay thế segment'], ['is_active', 'Hiệu lực đã duyệt']].map(([key, label], i) => field('actual.' + key, label, 'actual', 'shifts.approve_registration', 200 + i, key)),
  field('actual.event_kind', 'Sự kiện chấm công', 'actual', 'shifts.approve_registration', 210, 'event_kind'),
  field('actual.coverage_kind', 'Hình thức làm việc', 'actual', 'shifts.approve_registration', 211, 'coverage_kind'),
  ...[['segment_id', 'Mã segment'], ['actor_id', 'Người thao tác'], ['action', 'Thao tác'], ['before_values', 'Trước'], ['after_values', 'Sau'], ['created_at', 'Thời điểm']].map(([key, label], i) => field('audit.' + key, label, 'audit', 'audit.view', 300 + i, key)),
]

export function authorizedExportFields(permission: SystemPermission, actualEnabled: boolean) {
  return CALENDAR_EXPORT_FIELDS.filter(item => permissionMatrix[permission].has(item.permission) && (actualEnabled || item.group !== 'actual' && item.group !== 'audit'))
}
export function selectExportFields(permission: SystemPermission, actualEnabled: boolean, ids?: string[]) {
  const allowed = authorizedExportFields(permission, actualEnabled)
  if (!ids) return allowed
  if (!ids.length || new Set(ids).size !== ids.length || ids.some(id => !allowed.some(field => field.id === id))) throw new Error('EXPORT_FIELD_DENIED')
  return allowed.filter(field => ids.includes(field.id)).sort((a, b) => a.order - b.order)
}

export function safeSpreadsheetValue(value: Value): Value {
  return typeof value === 'string' && /^[\s\u0000-\u001f]*[=+\-@]/u.test(value) ? "'" + value : value
}
