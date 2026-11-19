import type { OperationalRole, Shift, ShiftRegistration, User } from '../types/database.types'

/** A preliminary directory filter, NOT an availability or scheduling clearance.
 * The server's manual_assign_shift_staff RPC remains authoritative for conflict,
 * capacity, account eligibility, concurrency, and permission checks.
 */
export function staffingCandidates(
  shift: Pick<Shift, 'id' | 'allow_multi_role'>,
  role: OperationalRole,
  users: User[],
  registrations: ShiftRegistration[],
): User[] {
  const occupied = new Set(
    registrations
      .filter(reg => reg.shift_id === shift.id &&
        ['pending', 'approved', 'manually_assigned'].includes(reg.status) &&
        (reg.operational_role === role || !shift.allow_multi_role))
      .map(reg => reg.user_id),
  )
  return users.filter(user =>
    user.status === 'active' &&
    (user.account_status === undefined || user.account_status === 'active') &&
    !user.archived_at && !user.deleted_at &&
    user.operational_roles?.includes(role) &&
    !occupied.has(user.id),
  ).sort((left, right) => left.full_name.localeCompare(right.full_name, 'vi'))
}
