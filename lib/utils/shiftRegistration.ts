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

export async function runEligibleRegistration(
  result: RegistrationCtaResult,
  onRegister: (role: OperationalRole) => Promise<void>,
): Promise<boolean> {
  if (result.state !== 'eligible') return false
  await onRegister(result.role)
  return true
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
  const leftTime = resolveShiftDateTime(left.date, left.start_time, left.end_time, left.timezone)
  const rightTime = resolveShiftDateTime(right.date, right.start_time, right.end_time, right.timezone)
  if (!leftTime?.valid || !rightTime?.valid) return false
  return leftTime.startAt < rightTime.endAt && rightTime.startAt < leftTime.endAt
}

export const isShiftClosed = (shift: Shift, now: Date = new Date()) => {
  if (shift.registration_locked) return true
  if (['cancelled', 'completed', 'live', 'paused'].includes(shift.status)) return true
  if (shift.status !== 'scheduled' && shift.status !== 'preparing') return true
  if (shift.registration_cutoff_at) {
    const cutoff = new Date(shift.registration_cutoff_at)
    if (!Number.isNaN(cutoff.getTime()) && cutoff <= now) return true
  } else {
    const startAt = shift.start_at
      ? new Date(shift.start_at)
      : resolveShiftDateTime(shift.date, shift.start_time, shift.end_time, shift.timezone)?.startAt
    if (startAt && !Number.isNaN(startAt.getTime()) && startAt <= now) return true
  }
  const endAt = shift.end_at ? new Date(shift.end_at) : resolveShiftDateTime(shift.date, shift.start_time, shift.end_time, shift.timezone)?.endAt
  if (endAt && !Number.isNaN(endAt.getTime()) && endAt <= now) return true
  return false
}

/**
 * Checks whether a shift is open for registration according to operational rules:
 * - Shifts where registration is NOT locked
 * - Registration cutoff has NOT passed (or if no cutoff, start_time is in the future)
 * - Shift has at least one unfilled role (host, support, or technical)
 * - Shift status is NOT cancelled / completed / live / paused
 */
export function isShiftOpenForRegistration(
  shift: Shift,
  registrations?: ShiftRegistration[],
  now: Date = new Date(),
): boolean {
  if (shift.deleted_at || shift.archived_at) return false
  if (isShiftClosed(shift, now)) return false

  const checkRoles: OperationalRole[] = ['host', 'support', 'technical']
  return checkRoles.some(role => {
    const required = shift[requiredField[role]] ?? (role === 'host' ? 1 : 0)
    if (required <= 0) return false

    if (shift.staffing_summary && shift.staffing_summary.length > 0) {
      const summary = shift.staffing_summary.find(s => s.role === role)
      if (summary) return summary.approved < summary.required || summary.remaining > 0
    }

    if (registrations && registrations.length > 0) {
      const approvedCount = registrations.filter(
        r => r.shift_id === shift.id && r.operational_role === role && isStaffed(r),
      ).length
      return approvedCount < required
    }

    const directAssigned =
      role === 'host' ? shift.host_id : role === 'support' ? shift.support_id : shift.technical_id
    return !directAssigned
  })
}

export function formatRegistrationErrorMessage(message: string): string {
  const normalized = message.trim()
  const upper = normalized.toUpperCase()
  if (upper.includes('REGISTRATION_CLOSED') || normalized.includes('Registration is closed')) {
    return 'Ca này đã đóng đăng ký hoặc đã hết thời hạn đăng ký.'
  }
  if (upper.includes('SHIFT_CAPACITY_EXCEEDED') || upper.includes('CAPACITY_EXCEEDED') || normalized.includes('No remaining position')) {
    return 'Vị trí cho vai trò này đã đủ số lượng người đăng ký / phân công.'
  }
  if (upper.includes('REGISTRATION_CONFLICT') || normalized.includes('Schedule conflict')) {
    return 'Bạn bị trùng lịch với một ca trực khác vào cùng thời điểm.'
  }
  if (upper.includes('ROLE_NOT_ELIGIBLE') || normalized.includes('role is not assigned') || normalized.includes('không có vai trò')) {
    return 'Hồ sơ nhân sự của bạn không có vai trò này để đăng ký.'
  }
  if (upper.includes('ALREADY_REGISTERED') || normalized.includes('already has this role') || normalized.includes('already registered') || normalized.includes('double registration')) {
    return 'Bạn đã đăng ký hoặc được phân công vai trò này trong ca.'
  }
  if (normalized.includes('cannot occupy multiple roles')) {
    return 'Nhân sự không thể đảm nhiệm nhiều vai trò trong cùng một ca.'
  }
  return normalized || 'Không thể thực hiện đăng ký.'
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
    if (shift.registration_conflict || conflict) return { role, state: 'conflict' }

    const staffedCount = shift.staffing_summary?.find(summary => summary.role === role)?.approved ?? registrations.filter(registration =>
      registration.shift_id === shift.id &&
      registration.operational_role === role &&
      isStaffed(registration),
    ).length
    const required = shift[requiredField[role]] ?? 1
    return staffedCount >= required ? { role, state: 'full' } : { role, state: 'eligible' }
  })
}
