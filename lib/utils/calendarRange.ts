import { addDays, endOfMonth, endOfWeek, format, parseISO, startOfMonth, startOfWeek } from 'date-fns'
import type { CalendarTimeFilter } from './calendarFilters'
import { businessLocalDate } from './shiftUtils'

export type CalendarViewMode = 'month' | 'week' | 'day' | 'list'

export interface CalendarDataScope {
  startDate?: string
  endDate?: string
  allTime: boolean
}

const dateString = (date: Date) => format(date, 'yyyy-MM-dd')

export function calendarDataScope(
  view: CalendarViewMode,
  currentDate: Date,
  time: CalendarTimeFilter,
  customFrom = '',
  customTo = '',
  explicitAllTime = false,
  today = businessLocalDate(),
): CalendarDataScope {
  if (time === 'all' && (view === 'list' || explicitAllTime)) return { allTime: true }
  if (time === 'custom' && customFrom && customTo && customFrom <= customTo) {
    return { startDate: customFrom, endDate: customTo, allTime: false }
  }
  if (time === 'today') {
    return { startDate: today, endDate: today, allTime: false }
  }
  if (time === 'current_week') {
    return { startDate: dateString(startOfWeek(currentDate)), endDate: dateString(endOfWeek(currentDate)), allTime: false }
  }
  if (time === 'current_month') {
    return { startDate: dateString(startOfMonth(currentDate)), endDate: dateString(endOfMonth(currentDate)), allTime: false }
  }
  if (view === 'month') {
    const monthStart = startOfMonth(currentDate)
    return { startDate: dateString(startOfWeek(monthStart)), endDate: dateString(endOfWeek(endOfMonth(monthStart))), allTime: false }
  }
  if (view === 'week') {
    return { startDate: dateString(startOfWeek(currentDate)), endDate: dateString(endOfWeek(currentDate)), allTime: false }
  }
  const day = dateString(currentDate)
  return { startDate: day, endDate: day, allTime: false }
}

/** One day on each side covers the persisted maximum 24-hour shift duration. */
export function calendarAuthorityScope(scope: CalendarDataScope): CalendarDataScope {
  if (scope.allTime || !scope.startDate || !scope.endDate) return scope
  return {
    startDate: dateString(addDays(parseISO(scope.startDate), -1)),
    endDate: dateString(addDays(parseISO(scope.endDate), 1)),
    allTime: false,
  }
}
