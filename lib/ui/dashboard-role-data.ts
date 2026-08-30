import { isStaffedRegistration } from '@/lib/services/dataService'
import { OperationalRole, Report, Shift, ShiftRegistration, SwapRequest } from '@/lib/types/database.types'

export function isCanonicalAssignedShift(shift: Shift, role: OperationalRole | null, userId: string, registrations: ShiftRegistration[]): boolean {
  return registrations.some(registration =>
    registration.shift_id === shift.id &&
    registration.user_id === userId &&
    (role === null || registration.operational_role === role) &&
    isStaffedRegistration(registration)
  )
}

export function getMemberAssignedShifts(shifts: Shift[], userId: string, registrations: ShiftRegistration[]): Shift[] {
  return shifts.filter(shift => isCanonicalAssignedShift(shift, null, userId, registrations))
}

export function getMemberPendingRegistrations(registrations: ShiftRegistration[], userId: string): ShiftRegistration[] {
  return registrations.filter(r => r.user_id === userId && r.status === 'pending')
}

export function getMemberPendingSwaps(swapRequests: SwapRequest[], userId: string): SwapRequest[] {
  return swapRequests.filter(s => (s.requester_id === userId || s.counterpart_id === userId) && s.status === 'pending')
}

export function getLeaderPendingRegistrations(registrations: ShiftRegistration[], shiftIds: Set<string>): ShiftRegistration[] {
  return registrations.filter(r => r.status === 'pending' && shiftIds.has(r.shift_id))
}

export function getLeaderPendingReports(reports: Report[], shiftIds: Set<string>): Report[] {
  return reports.filter(r => (r.status === 'draft' || r.status === 'in_review') && shiftIds.has(r.shift_id))
}

export function getLeaderPendingSwaps(swapRequests: SwapRequest[], shiftIds: Set<string>): SwapRequest[] {
  return swapRequests.filter(s => 
    s.status === 'pending' && 
    (shiftIds.has(s.shift_id) || (s.source_shift_id && shiftIds.has(s.source_shift_id)) || (s.target_shift_id && shiftIds.has(s.target_shift_id)))
  )
}
