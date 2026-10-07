import type { Report, Shift, User } from '@/lib/types/database.types'
import { hasPermission } from '@/lib/permissions'
import { isFinalizedReport, reportableShiftStatuses } from './reportQueue'

export const reportShiftHref = (shiftId: string) => `/reports?shiftId=${encodeURIComponent(shiftId)}`

export function clearReportShiftQuery(pathname: string, search: string) {
  const params = new URLSearchParams(search)
  params.delete('shiftId')
  return `${pathname}${params.size ? `?${params}` : ''}`
}

export function initialReportShift(shifts: Shift[], report?: Report, shiftId?: string) {
  if (report) return shifts.find(shift => shift.id === report.shift_id && (!shiftId || shiftId === report.shift_id))
  if (shiftId !== undefined) return shifts.find(shift => shift.id === shiftId)
  return shifts[0]
}

export type ReportTarget = { shift: Shift } & (
  | { mode: 'form'; report?: Report }
  | { mode: 'detail'; report: Report }
)

/** Exact authenticated lookups; the recent work queue is not a target index. */
export async function loadReportTarget(
  shiftId: string,
  lookups: { getShift: (id: string) => Promise<Shift | null>; getReport: (id: string) => Promise<Report | null> },
  user: User,
  staffedShiftIds: ReadonlySet<string>,
): Promise<ReportTarget> {
  if (!shiftId.trim()) throw new Error('REPORT_TARGET_UNAVAILABLE')
  const [shift, report] = await Promise.all([lookups.getShift(shiftId), lookups.getReport(shiftId)])
  if (!shift || shift.id !== shiftId || shift.deleted_at || shift.archived_at ||
    (report && (report.shift_id !== shiftId || report.deleted_at || report.archived_at))) {
    throw new Error('REPORT_TARGET_UNAVAILABLE')
  }
  const editable = report && !isFinalizedReport(report) && (!report.status || ['draft', 'reopened'].includes(report.status))
  if (report && !editable) return { mode: 'detail', shift, report }
  if (!reportableShiftStatuses.includes(shift.status as typeof reportableShiftStatuses[number])) {
    throw new Error('REPORT_TARGET_UNAVAILABLE')
  }
  const canReview = hasPermission(user, 'reports.review')
  const assigned = staffedShiftIds.has(shiftId) || [shift.host_id, shift.support_id, shift.technical_id].includes(user.id)
  if (!hasPermission(user, 'reports.submit') || !(canReview || (report ? report.submitted_by === user.id : assigned))) {
    throw new Error('REPORT_TARGET_FORBIDDEN')
  }
  return { mode: 'form', shift, report: report ?? undefined }
}
