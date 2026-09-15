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
