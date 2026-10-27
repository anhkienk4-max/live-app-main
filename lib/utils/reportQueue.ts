import type { Report, Shift } from '@/lib/types/database.types'
import { resolveShiftDateTime } from '@/lib/utils/shiftUtils'

export const reportableShiftStatuses = ['preparing', 'live', 'paused', 'completed'] as const

export function shiftStartTimestamp(shift: Pick<Shift, 'date' | 'start_time' | 'end_time' | 'timezone' | 'start_at'>): number {
  const persisted = shift.start_at ? new Date(shift.start_at).getTime() : Number.NaN
  if (Number.isFinite(persisted)) return persisted
  return resolveShiftDateTime(shift.date, shift.start_time, shift.end_time, shift.timezone)?.startAt.getTime() ?? 0
}

export function sortReportableShifts(shifts: Shift[]): Shift[] {
  return [...shifts].sort((left, right) =>
    shiftStartTimestamp(right) - shiftStartTimestamp(left) || right.id.localeCompare(left.id),
  )
}

export function limitReportCandidates(shifts: Shift[], limit = 30): Shift[] {
  return sortReportableShifts(shifts).slice(0, Math.min(30, Math.max(1, limit)))
}

export function isFinalizedReport(report: Report): boolean {
  return report.metrics_confirmed === true || report.status === 'confirmed' || report.status === 'archived'
}

export function reportQueueState(report: Report | undefined): 'not_started' | 'draft' | 'finalized' {
  if (!report) return 'not_started'
  return isFinalizedReport(report) ? 'finalized' : 'draft'
}

/** REPORT-02: workflow status is distinct from metrics confirmation. */
export function reportQueueDisplayState(report: Report | undefined): 'not_started' | 'draft' | 'in_review' | 'reopened' | 'unconfirmed' | 'confirmed' {
  if (!report) return 'not_started'
  if (report.status === 'in_review') return 'in_review'
  if (report.status === 'reopened') return 'reopened'
  if (report.status === 'draft') return 'draft'
  if (report.status === 'confirmed' && report.metrics_confirmed === true) return 'confirmed'
  return 'unconfirmed'
}

/** A server-side queue total is not the number of shifts in the current page. */
export function reportQueuePageRange(total: number, page: number, pageSize: number, loaded: number): { start: number; end: number } {
  if (total <= 0 || loaded <= 0) return { start: 0, end: 0 }
  const start = (Math.max(1, page) - 1) * pageSize + 1
  return { start, end: Math.min(total, start + loaded - 1) }
}
