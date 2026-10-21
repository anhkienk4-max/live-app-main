import { businessLocalDate } from '@/lib/utils/shiftUtils'

export type ShiftDateWindow = 'recent' | 'upcoming' | 'all'

function offsetBusinessDate(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`)
  value.setUTCDate(value.getUTCDate() + days)
  return value.toISOString().slice(0, 10)
}

export function shiftDateWindowFilters(window: ShiftDateWindow, now = new Date()) {
  const today = businessLocalDate(now)
  if (window === 'recent') return { from: offsetBusinessDate(today, -29), to: today }
  if (window === 'upcoming') return { from: today }
  return {}
}
