import type { Shift } from '@/lib/types/database.types'
import { addDays, addMonths, format, parseISO, isAfter } from 'date-fns'

export interface RecurrenceRule {
  frequency: 'daily' | 'weekly' | 'monthly' | 'custom' | 'none'
  interval?: number // Every X days/weeks/months
  daysOfWeek?: number[] // 0-6 for Sunday-Saturday
  endType: 'never' | 'date' | 'count'
  endDate?: string
  endCount?: number
}

export interface ShiftTemplate {
  id: string
  name: string
  brand_id: string
  platform_id: string
  campaign_id?: string
  studio?: string
  host_id?: string
  support_id?: string
  technical_id?: string
  start_time: string
  end_time: string
  duration: number // in minutes
  product_notes?: string
  is_default: boolean
  created_at: string
  updated_at: string
}

export interface ShiftConflict {
  type: 'host' | 'support' | 'technical' | 'duplicate' | 'time'
  message: string
  conflictingShift?: Shift
}

export interface ResolvedShiftDateTime {
  startAt: Date
  endAt: Date
  startAtLocal: string
  endAtLocal: string
  startDate: string
  endDate: string
  crossesMidnight: boolean
  durationMinutes: number
  timezone: string
  valid: boolean
  error?: string
  warning?: string
}

export interface ShiftTimeConsistency {
  consistent: boolean
  mismatches: string[]
  expected: ReturnType<typeof shiftDateTimeFields> | null
}

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/
export const DEFAULT_BUSINESS_TIMEZONE = 'Asia/Ho_Chi_Minh'
export const MAX_SHIFT_CAPACITY = 100
export const DEFAULT_REQUIRED_STAFF_COUNT = 1
export const DEFAULT_SHIFT_STAFFING = {
  required_host_count: DEFAULT_REQUIRED_STAFF_COUNT,
  required_support_count: DEFAULT_REQUIRED_STAFF_COUNT,
  required_technical_count: DEFAULT_REQUIRED_STAFF_COUNT,
} as const

export function normalizeCapacity(
  value: unknown,
  defaultValue = DEFAULT_REQUIRED_STAFF_COUNT,
  maximum = MAX_SHIFT_CAPACITY,
): number | null {
  if (
    value === null ||
    value === undefined ||
    String(value).trim() === '' ||
    (typeof value === 'number' && Number.isNaN(value))
  ) {
    return defaultValue
  }
  const parsed = Number(String(value).trim())
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > maximum) return null
  return parsed
}

/**
 * Resolves a shift in business-local wall-clock time using IANA timezone rules.
 */
export function resolveShiftDateTime(
  date: string,
  startTime: string,
  endTime: string,
  timezone = DEFAULT_BUSINESS_TIMEZONE,
): ResolvedShiftDateTime | null {
  const dateMatch = date.match(DATE_PATTERN)
  const startMatch = startTime.match(TIME_PATTERN)
  const endMatch = endTime.match(TIME_PATTERN)
  if (!dateMatch || !startMatch || !endMatch || !isValidIanaTimeZone(timezone)) return null

  const [, yearText, monthText, dayText] = dateMatch
  const startMinutes = Number(startMatch[1]) * 60 + Number(startMatch[2])
  const endMinutes = Number(endMatch[1]) * 60 + Number(endMatch[2])
  const crossesMidnight = endMinutes < startMinutes
  const durationMinutes = crossesMidnight
    ? 24 * 60 - startMinutes + endMinutes
    : endMinutes - startMinutes
  const validDate = isValidCalendarDate(Number(yearText), Number(monthText), Number(dayText))
  const endDate = addCalendarDays(date, crossesMidnight ? 1 : 0)
  const startAt = validDate ? zonedWallTimeToUtc(date, startTime, timezone) : new Date(Number.NaN)
  const endAt = validDate ? zonedWallTimeToUtc(endDate, endTime, timezone) : new Date(Number.NaN)
  const actualDurationMinutes = Number.isNaN(startAt.getTime()) || Number.isNaN(endAt.getTime())
    ? durationMinutes
    : Math.round((endAt.getTime() - startAt.getTime()) / 60_000)
  const valid = validDate && actualDurationMinutes > 0 && actualDurationMinutes <= 24 * 60

  return {
    startAt,
    endAt,
    startAtLocal: `${date}T${startTime}:00`,
    endAtLocal: `${endDate}T${endTime}:00`,
    startDate: date,
    endDate,
    crossesMidnight,
    durationMinutes: actualDurationMinutes,
    timezone,
    valid,
    error: !validDate
      ? 'Shift date is invalid.'
      : actualDurationMinutes === 0
        ? 'Start time and end time cannot be the same.'
        : actualDurationMinutes > 24 * 60
          ? 'Shift duration cannot exceed 24 hours.'
          : undefined,
    warning: durationMinutes >= 20 * 60
      ? 'Shift duration is close to 24 hours. Please confirm the times.'
      : undefined,
  }
}

export function shiftDateTimeFields(date: string, startTime: string, endTime: string, timezone = DEFAULT_BUSINESS_TIMEZONE) {
  const resolved = resolveShiftDateTime(date, startTime, endTime, timezone)
  if (!resolved?.valid) return null
  return {
    start_at: resolved.startAt.toISOString(),
    end_at: resolved.endAt.toISOString(),
    end_date: resolved.endDate,
    crosses_midnight: resolved.crossesMidnight,
    duration_minutes: resolved.durationMinutes,
  }
}

export function isValidIanaTimeZone(value: unknown): value is string {
  if (typeof value !== 'string' || !value.trim()) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value }).format()
    return true
  } catch {
    return false
  }
}

/** Returns the current calendar date in the business timezone, never browser-local. */
export function businessLocalDate(now = new Date(), timezone = DEFAULT_BUSINESS_TIMEZONE): string {
  const effectiveTimezone = isValidIanaTimeZone(timezone) ? timezone : DEFAULT_BUSINESS_TIMEZONE
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: effectiveTimezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const values = Object.fromEntries(parts.filter(part => part.type !== 'literal').map(part => [part.type, part.value]))
  return `${values.year}-${values.month}-${values.day}`
}

/**
 * Compares persisted absolute timestamps and local projections without rewriting
 * data. Callers can surface mismatches for reconciliation/diagnostics.
 */
export function inspectShiftTimeConsistency(
  shift: Pick<Shift, 'date' | 'start_time' | 'end_time' | 'timezone' | 'start_at' | 'end_at' | 'end_date' | 'crosses_midnight' | 'duration_minutes'>,
): ShiftTimeConsistency {
  const expected = shiftDateTimeFields(
    shift.date,
    shift.start_time,
    shift.end_time,
    shift.timezone || DEFAULT_BUSINESS_TIMEZONE,
  )
  if (!expected) return { consistent: false, mismatches: ['invalid_shift_time'], expected: null }
  const mismatches: string[] = []
  if (shift.start_at && shift.start_at !== expected.start_at) mismatches.push('start_at')
  if (shift.end_at && shift.end_at !== expected.end_at) mismatches.push('end_at')
  if (shift.end_date && shift.end_date !== expected.end_date) mismatches.push('end_date')
  if (shift.crosses_midnight !== undefined && shift.crosses_midnight !== expected.crosses_midnight) mismatches.push('crosses_midnight')
  if (shift.duration_minutes !== undefined && shift.duration_minutes !== expected.duration_minutes) mismatches.push('duration_minutes')
  return { consistent: mismatches.length === 0, mismatches, expected }
}

function isValidCalendarDate(year: number, month: number, day: number): boolean {
  const candidate = new Date(Date.UTC(year, month - 1, day))
  return candidate.getUTCFullYear() === year && candidate.getUTCMonth() === month - 1 && candidate.getUTCDate() === day
}

function addCalendarDays(date: string, days: number): string {
  return format(addDays(parseISO(date), days), 'yyyy-MM-dd')
}

function zonedWallTimeToUtc(date: string, time: string, timezone: string): Date {
  const [year, month, day] = date.split('-').map(Number)
  const [hour, minute] = time.split(':').map(Number)
  const wallTimestamp = Date.UTC(year, month - 1, day, hour, minute)
  let candidate = new Date(wallTimestamp)
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(candidate)
    const values = Object.fromEntries(parts.filter(part => part.type !== 'literal').map(part => [part.type, Number(part.value)]))
    const representedWallTimestamp = Date.UTC(values.year, values.month - 1, values.day, values.hour, values.minute)
    const offset = representedWallTimestamp - candidate.getTime()
    const next = new Date(wallTimestamp - offset)
    if (next.getTime() === candidate.getTime()) break
    candidate = next
  }
  return candidate
}

export function formatShiftTimeRange(shift: Pick<Shift, 'date' | 'start_time' | 'end_time' | 'timezone'>): string {
  const resolved = resolveShiftDateTime(shift.date, shift.start_time, shift.end_time, shift.timezone)
  return `${shift.start_time} - ${shift.end_time}${resolved?.crossesMidnight ? ' (+1 day)' : ''}`
}

export function formatShiftEndDate(shift: Pick<Shift, 'date' | 'start_time' | 'end_time' | 'timezone'>): string | null {
  const resolved = resolveShiftDateTime(shift.date, shift.start_time, shift.end_time, shift.timezone)
  return resolved?.crossesMidnight ? resolved.endDate : null
}

export function getCurrentBusinessDate(timezone = 'Asia/Ho_Chi_Minh', now = new Date()): string {
  return businessLocalDate(now, timezone)
}
// Generate recurring shifts
export function generateRecurringShifts(
  baseShift: Omit<Shift, 'id' | 'created_at' | 'updated_at'>,
  rule: RecurrenceRule
): Omit<Shift, 'id' | 'created_at' | 'updated_at'>[] {
  const shifts: Omit<Shift, 'id' | 'created_at' | 'updated_at'>[] = []
  let currentDate = parseISO(baseShift.date)
  let count = 0
  const maxShifts = rule.endType === 'count' ? rule.endCount || 1 : 365 // Max 1 year

  while (count < maxShifts) {
    // Check end conditions
    if (rule.endType === 'date' && rule.endDate && isAfter(currentDate, parseISO(rule.endDate))) {
      break
    }
    if (rule.endType === 'count' && count >= (rule.endCount || 1)) {
      break
    }

    // For weekly, check if current day matches selected days
    if (rule.frequency === 'weekly' && rule.daysOfWeek && rule.daysOfWeek.length > 0) {
      const dayOfWeek = currentDate.getDay()
      if (rule.daysOfWeek.includes(dayOfWeek)) {
        shifts.push({
          ...baseShift,
          date: format(currentDate, 'yyyy-MM-dd'),
        })
        count++
      }
    } else {
      shifts.push({
        ...baseShift,
        date: format(currentDate, 'yyyy-MM-dd'),
      })
      count++
    }

    // Increment date
    switch (rule.frequency) {
      case 'daily':
        currentDate = addDays(currentDate, rule.interval || 1)
        break
      case 'weekly':
        currentDate = addDays(currentDate, 1) // Check each day for weekly
        break
      case 'monthly':
        currentDate = addMonths(currentDate, rule.interval || 1)
        break
      case 'custom':
        currentDate = addDays(currentDate, rule.interval || 1)
        break
      default:
        return [baseShift]
    }

    // Safety limit
    if (shifts.length >= 365) break
  }

  return shifts
}

// Check for shift conflicts
export function detectConflicts(
  newShift: Omit<Shift, 'id' | 'created_at' | 'updated_at'>,
  existingShifts: Shift[],
  excludeShiftId?: string
): ShiftConflict[] {
  const conflicts: ShiftConflict[] = []
  
  const resolvedNew = resolveShiftDateTime(newShift.date, newShift.start_time, newShift.end_time, newShift.timezone)
  if (!resolvedNew?.valid) {
    conflicts.push({
      type: 'time',
      message: resolvedNew?.error || 'Shift date or time is invalid',
    })
    return conflicts
  }
  if (resolvedNew.warning) {
    conflicts.push({ type: 'time', message: resolvedNew.warning })
  }

  existingShifts.forEach(shift => {
    // Skip if same shift (for updates)
    if (shift.id === excludeShiftId) return
    
    const resolvedExisting = resolveShiftDateTime(shift.date, shift.start_time, shift.end_time, shift.timezone)
    if (!resolvedExisting?.valid) return
    const hasOverlap =
      resolvedNew.startAt < resolvedExisting.endAt &&
      resolvedNew.endAt > resolvedExisting.startAt

    if (!hasOverlap) return

    // Check host conflict
    if (newShift.host_id && shift.host_id === newShift.host_id) {
      conflicts.push({
        type: 'host',
        message: `Host is already assigned to another shift at ${shift.start_time}-${shift.end_time}`,
        conflictingShift: shift,
      })
    }

    // Check support conflict
    if (newShift.support_id && shift.support_id === newShift.support_id) {
      conflicts.push({
        type: 'support',
        message: `Support staff is already assigned to another shift at ${shift.start_time}-${shift.end_time}`,
        conflictingShift: shift,
      })
    }

    if (newShift.technical_id && shift.technical_id === newShift.technical_id) {
      conflicts.push({
        type: 'technical',
        message: `Technical staff is already assigned to another shift at ${shift.start_time}-${shift.end_time}`,
        conflictingShift: shift,
      })
    }

    // Check duplicate shift (same brand, platform, time)
    if (
      shift.brand_id === newShift.brand_id &&
      shift.platform_id === newShift.platform_id &&
      shift.date === newShift.date &&
      shift.start_time === newShift.start_time &&
      shift.end_time === newShift.end_time
    ) {
      conflicts.push({
        type: 'duplicate',
        message: 'A shift with the same brand, platform, and time already exists',
        conflictingShift: shift,
      })
    }
  })

  return conflicts
}

// Calculate shift duration
export function calculateDuration(startTime: string, endTime: string): number {
  return resolveShiftDateTime('2000-01-01', startTime, endTime)?.durationMinutes ?? 0
}

// Format duration for display
export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  if (hours === 0) return `${mins}m`
  if (mins === 0) return `${hours}h`
  return `${hours}h ${mins}m`
}
