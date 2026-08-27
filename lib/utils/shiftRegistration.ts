import type { OperationalRole, Shift, ShiftRegistration, User } from '@/lib/types/database.types'
import { resolveShiftDateTime } from '@/lib/utils/shiftUtils'

export type RegistrationCtaState =
  | 'eligible'
  | 'pending'
  | 'approved'
  | 'full'
  | 'closed'
  | 'conflict'
  | 'not_eligible'

export interface RegistrationCtaResult {
  role: OperationalRole
  state: RegistrationCtaState
  registration?: ShiftRegistration
}

const roles: OperationalRole[] = ['host', 'support', 'technical']
const requiredField: Record<OperationalRole, 'required_host_count' | 'required_support_count' | 'required_technical_count'> = {
  host: 'required_host_count',
  support: 'required_support_count',
  technical: 'required_technical_count',
}

const isStaffed = (registration: ShiftRegistration) =>
  registration.status === 'approved' || registration.status === 'manually_assigned'

const isActiveRegistration = (registration: ShiftRegistration) =>
  registration.status === 'pending' || isStaffed(registration)

const shiftsOverlap = (left: Shift, right: Shift) => {
  const leftTime = resolveShiftDateTime(left.date, left.start_time, left.end_time)
  const rightTime = resolveShiftDateTime(right.date, right.start_time, right.end_time)
  if (!leftTime?.valid || !rightTime?.valid) return false
  return leftTime.startAt < rightTime.endAt && rightTime.startAt < leftTime.endAt
}

const isShiftClosed = (shift: Shift, now: Date) => {
  if (shift.status !== 'scheduled' || shift.registration_locked) return true
  const endAt = shift.end_at ? new Date(shift.end_at) : resolveShiftDateTime(shift.date, shift.start_time, shift.end_time)?.endAt
  if (endAt && !Number.isNaN(endAt.getTime()) && endAt <= now) return true
  if (shift.registration_cutoff_at) {
    const cutoff = new Date(shift.registration_cutoff_at)
    if (!Number.isNaN(cutoff.getTime()) && cutoff <= now) return true
  }
  return false
}

/**
 * Single UI eligibility/status resolver shared by calendar and shift detail.
 * Backend RPCs remain authoritative; this only determines the action/status to render.
 */
export function resolveRegistrationCta({
  allShifts = [],
  now = new Date(),
  registrations,
  shift,
  user,
}: {
  allShifts?: Shift[]
  now?: Date
  registrations: ShiftRegistration[]
  shift: Shift
  user: User | null
}): RegistrationCtaResult[] {
  return roles.map(role => {
    if (!user || !user.operational_roles?.includes(role)) {
      return { role, state: 'not_eligible' }
    }

    const mine = registrations.filter(registration =>
      registration.shift_id === shift.id &&
      registration.user_id === user.id &&
      registration.operational_role === role &&
      isActiveRegistration(registration),
    )
    const current = mine.find(registration => isStaffed(registration)) ?? mine[0]
    if (current) return { role, state: isStaffed(current) ? 'approved' : 'pending', registration: current }
    if (isShiftClosed(shift, now)) return { role, state: 'closed' }

    const sameShiftOtherRole = registrations.some(registration =>
      registration.shift_id === shift.id &&
      registration.user_id === user.id &&
      registration.operational_role !== role &&
      isActiveRegistration(registration),
    )
    if (sameShiftOtherRole && !shift.allow_multi_role) return { role, state: 'conflict' }

    const conflict = registrations.some(registration => {
      if (registration.user_id !== user.id || !isActiveRegistration(registration)) return false
      if (registration.shift_id === shift.id) return false
      const otherShift = allShifts.find(candidate => candidate.id === registration.shift_id)
      return Boolean(otherShift && shiftsOverlap(otherShift, shift))
    })
    if (conflict) return { role, state: 'conflict' }

    const staffedCount = registrations.filter(registration =>
      registration.shift_id === shift.id &&
      registration.operational_role === role &&
      isStaffed(registration),
    ).length
    const required = shift[requiredField[role]] ?? 1
    return staffedCount >= required ? { role, state: 'full' } : { role, state: 'eligible' }
  })
}
