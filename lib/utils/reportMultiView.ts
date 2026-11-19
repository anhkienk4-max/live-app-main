import { addDays, endOfMonth, endOfWeek, format, parseISO, startOfMonth, startOfWeek } from 'date-fns'
import type { Report, Shift } from '@/lib/types/database.types'
import type { ListPage, ListFilters } from '@/lib/services/operationsPageService'
import type { ReportObligation } from '@/lib/services/dataService'

export type ReportWorkspaceView = 'cards' | 'table' | 'list' | 'calendar'
export type ReportCalendarScale = 'month' | 'week' | 'day'
export type ReportCalendarEntry = { shift: Shift; report: Report | null }

/** The Calendar is range-complete, not a projection of the current 20-row queue page. */
export function reportCalendarWindow(date: string, scale: ReportCalendarScale, filters: Pick<ListFilters, 'from' | 'to'> = {}) {
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(date) ? parseISO(date) : new Date(Number.NaN)
  if (!Number.isFinite(parsed.getTime()) || format(parsed, 'yyyy-MM-dd') !== date) return null
  const first = scale === 'month' ? startOfWeek(startOfMonth(parsed), { weekStartsOn: 1 })
    : scale === 'week' ? startOfWeek(parsed, { weekStartsOn: 1 }) : parsed
  const last = scale === 'month' ? endOfWeek(endOfMonth(parsed), { weekStartsOn: 1 })
    : scale === 'week' ? addDays(first, 6) : parsed
  const from = format(first, 'yyyy-MM-dd')
  const to = format(last, 'yyyy-MM-dd')
  const effectiveFrom = filters.from && filters.from > from ? filters.from : from
  const effectiveTo = filters.to && filters.to < to ? filters.to : to
  return { from: effectiveFrom, to: effectiveTo, empty: effectiveFrom > effectiveTo }
}

type WindowAPIs = {
  getQueuePage: (query: { page: number; pageSize: 50; filters: ListFilters }, signal?: AbortSignal) => Promise<ListPage<ReportObligation>>
  getReportsPage: (query: { page: number; pageSize: 50; filters: ListFilters }, signal?: AbortSignal) => Promise<ListPage<Report>>
  getShiftsByIds: (ids: string[]) => Promise<Shift[]>
}
const CALENDAR_LIMIT = 5000
const PAGE_SIZE = 50

async function collectPages<T>(
  fetch: (page: number) => Promise<ListPage<T>>,
  signal?: AbortSignal,
): Promise<{ items: T[]; total: number }> {
  const items: T[] = []
  let expectedTotal = -1
  let ownerKey: string | undefined
  for (let page = 1; ; page++) {
    if (signal?.aborted) throw new Error('REPORT_CALENDAR_CANCELLED')
    const result = await fetch(page)
    if (page === 1) { expectedTotal = result.total; ownerKey = result.ownerKey }
    if (result.page !== page || result.pageSize !== PAGE_SIZE || result.total !== expectedTotal ||
        result.ownerKey !== ownerKey || result.items.length > PAGE_SIZE ||
        expectedTotal > CALENDAR_LIMIT || (expectedTotal > 0 && result.items.length === 0 && items.length < expectedTotal)) {
      throw new Error('REPORT_CALENDAR_COLLECTION_CHANGED')
    }
    items.push(...result.items)
    if (items.length >= expectedTotal) {
      if (items.length !== expectedTotal) throw new Error('REPORT_CALENDAR_COLLECTION_CHANGED')
      return { items, total: expectedTotal }
    }
  }
}

/** Existing signed-actor paginated APIs are authoritative. Never query raw shifts/reports globally. */
export async function collectAuthorizedReportCalendar(
  day: string,
  scale: ReportCalendarScale,
  appliedFilters: ListFilters,
  api: WindowAPIs,
  signal?: AbortSignal,
) {
  const range = reportCalendarWindow(day, scale, appliedFilters)
  if (!range) throw new Error('REPORT_CALENDAR_INVALID_DATE')
  if (range.empty) return { entries: [] as ReportCalendarEntry[], queueTotal: 0, reportTotal: 0, missingShiftCount: 0 }
  const filters: ListFilters = { ...appliedFilters, from: range.from, to: range.to }
  const [queue, reports] = await Promise.all([
    collectPages(page => api.getQueuePage({ page, pageSize: PAGE_SIZE, filters }, signal), signal),
    collectPages(page => api.getReportsPage({ page, pageSize: PAGE_SIZE, filters }, signal), signal),
  ])
  if (signal?.aborted) throw new Error('REPORT_CALENDAR_CANCELLED')
  const queueMap = new Map<string, ReportCalendarEntry>()
  for (const item of queue.items) {
    if (queueMap.has(item.shift.id)) throw new Error('REPORT_CALENDAR_DUPLICATE_SHIFT')
    queueMap.set(item.shift.id, { shift: item.shift, report: item.report })
  }
  const byReportShift = new Map(reports.items.map(report => [report.shift_id, report]))
  const ids = [...new Set(reports.items.map(report => report.shift_id).filter(id => !queueMap.has(id)))]
  const reportShifts: Shift[] = []
  for (let offset = 0; offset < ids.length; offset += PAGE_SIZE) {
    if (signal?.aborted) throw new Error('REPORT_CALENDAR_CANCELLED')
    reportShifts.push(...await api.getShiftsByIds(ids.slice(offset, offset + PAGE_SIZE)))
  }
  for (const shift of reportShifts) {
    // Never include a shift that falls outside both the requested view and applied range.
    if (shift.date < range.from || shift.date > range.to) continue
    queueMap.set(shift.id, { shift, report: byReportShift.get(shift.id) ?? null })
  }
  for (const [id, entry] of queueMap) {
    const recorded = byReportShift.get(id)
    if (recorded) queueMap.set(id, { ...entry, report: recorded })
  }
  const foundShiftIds = new Set(reportShifts.map(s => s.id))
  return {
    entries: [...queueMap.values()].sort((a, b) => a.shift.date.localeCompare(b.shift.date) ||
      a.shift.start_time.localeCompare(b.shift.start_time) || a.shift.id.localeCompare(b.shift.id)),
    queueTotal: queue.total,
    reportTotal: reports.total,
    missingShiftCount: ids.filter(id => !foundShiftIds.has(id)).length,
  }
}
