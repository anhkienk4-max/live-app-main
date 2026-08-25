import { endOfWeek, format, startOfWeek } from 'date-fns'
import type { OperationalRole, Shift, ShiftRegistration, User } from '@/lib/types/database.types'

export type CalendarStaffingScope = 'month' | 'week' | 'day' | 'list'

export interface StaffingReviewRow {
  registration: ShiftRegistration
  shift: Shift
  user?: User
}

export interface StaffingReviewFilters {
  date: string
  role: 'all' | OperationalRole
  shiftId: string
}

export function shiftsInCalendarScope(
  shifts: Shift[],
  view: CalendarStaffingScope,
  currentDate: Date,
): Shift[] {
  if (view === 'list') return shifts

  const currentDateKey = format(currentDate, 'yyyy-MM-dd')
  if (view === 'day') return shifts.filter(shift => shift.date === currentDateKey)

  if (view === 'month') {
    const monthKey = format(currentDate, 'yyyy-MM')
    return shifts.filter(shift => shift.date.startsWith(monthKey))
  }

  const rangeStart = format(startOfWeek(currentDate), 'yyyy-MM-dd')
  const rangeEnd = format(endOfWeek(currentDate), 'yyyy-MM-dd')
  return shifts.filter(shift => shift.date >= rangeStart && shift.date <= rangeEnd)
}

export function pendingRegistrationsInScope(
  registrations: ShiftRegistration[],
  scopedShifts: Shift[],
): ShiftRegistration[] {
  const shiftIds = new Set(scopedShifts.map(shift => shift.id))
  return registrations.filter(registration =>
    registration.status === 'pending' && shiftIds.has(registration.shift_id))
}

export function buildPendingStaffingReviewRows(
  registrations: ShiftRegistration[],
  shifts: Shift[],
  users: User[],
): StaffingReviewRow[] {
  const shiftsById = new Map(shifts.map(shift => [shift.id, shift]))
  const usersById = new Map(users.map(user => [user.id, user]))
  return registrations.flatMap(registration => {
    if (registration.status !== 'pending') return []
    const shift = shiftsById.get(registration.shift_id)
    if (!shift) return []
    return [{ registration, shift, user: usersById.get(registration.user_id) }]
  }).sort((left, right) =>
    `${left.shift.date} ${left.shift.start_time} ${left.registration.requested_at}`
      .localeCompare(`${right.shift.date} ${right.shift.start_time} ${right.registration.requested_at}`))
}

export function filterStaffingReviewRows(
  rows: StaffingReviewRow[],
  filters: StaffingReviewFilters,
): StaffingReviewRow[] {
  return rows.filter(row => {
    if (filters.date && row.shift.date !== filters.date) return false
    if (filters.role !== 'all' && row.registration.operational_role !== filters.role) return false
    if (filters.shiftId !== 'all' && row.shift.id !== filters.shiftId) return false
    return true
  })
}

export function toggleStaffingReviewSelection(
  current: ReadonlySet<string>,
  targetIds: string[],
  select: boolean,
): Set<string> {
  const next = new Set(current)
  targetIds.forEach(id => {
    if (select) next.add(id)
    else next.delete(id)
  })
  return next
}
