import { businessLocalDate } from '@/lib/utils/shiftUtils'
import { endOfMonth, format, isMatch, parseISO } from 'date-fns'

export type ShiftDateWindow = 'recent' | 'upcoming' | 'all' | 'month' | 'custom'

function offsetBusinessDate(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

export function shiftDateWindowFilters(window: ShiftDateWindow, now = new Date(), month = '', from = '', to = '') {
  const today = businessLocalDate(now)
  if (window === 'recent') return { from: offsetBusinessDate(today, -29), to: today }
  if (window === 'upcoming') return { from: today }
  if (window === 'month') {
    if (!/^\d{4}-\d{2}$/.test(month) || !isMatch(`${month}-01`, 'yyyy-MM-dd')) throw new Error('SHIFT_DATE_RANGE_INVALID')
    return { from: `${month}-01`, to: format(endOfMonth(parseISO(`${month}-01`)), 'yyyy-MM-dd') }
  }
  if (window === 'custom') {
    if (![from, to].every(value => /^\d{4}-\d{2}-\d{2}$/.test(value) && isMatch(value, 'yyyy-MM-dd')) || from > to) throw new Error('SHIFT_DATE_RANGE_INVALID')
    return { from, to }
  }
  return {}
}
