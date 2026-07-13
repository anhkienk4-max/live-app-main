import { Shift } from '@/lib/types/database.types'
import { addDays, addWeeks, addMonths, format, parseISO, isAfter, isBefore, parse } from 'date-fns'

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
  host_id?: string
  support_id?: string
  start_time: string
  end_time: string
  duration: number // in minutes
  product_notes?: string
  is_default: boolean
  created_at: string
  updated_at: string
}

export interface ShiftConflict {
  type: 'host' | 'support' | 'duplicate' | 'time'
  message: string
  conflictingShift?: Shift
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
  
  // Parse times
  const newStart = parse(newShift.start_time, 'HH:mm', new Date())
  const newEnd = parse(newShift.end_time, 'HH:mm', new Date())

  // Check if end time is before start time
  if (isBefore(newEnd, newStart)) {
    conflicts.push({
      type: 'time',
      message: 'End time must be after start time',
    })
  }

  existingShifts.forEach(shift => {
    // Skip if same shift (for updates)
    if (shift.id === excludeShiftId) return
    
    // Only check same date
    if (shift.date !== newShift.date) return

    const existingStart = parse(shift.start_time, 'HH:mm', new Date())
    const existingEnd = parse(shift.end_time, 'HH:mm', new Date())

    // Check time overlap
    const hasOverlap = 
      (newStart >= existingStart && newStart < existingEnd) ||
      (newEnd > existingStart && newEnd <= existingEnd) ||
      (newStart <= existingStart && newEnd >= existingEnd)

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

    // Check duplicate shift (same brand, platform, time)
    if (
      shift.brand_id === newShift.brand_id &&
      shift.platform_id === newShift.platform_id &&
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
  const start = parse(startTime, 'HH:mm', new Date())
  const end = parse(endTime, 'HH:mm', new Date())
  const diffMs = end.getTime() - start.getTime()
  return Math.floor(diffMs / (1000 * 60)) // minutes
}

// Format duration for display
export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  if (hours === 0) return `${mins}m`
  if (mins === 0) return `${hours}h`
  return `${hours}h ${mins}m`
}
