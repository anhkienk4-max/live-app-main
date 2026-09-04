import type { OperationalRole, ShiftRegistration } from '@/lib/types/database.types'
import type { ShiftRoleCapacity } from '@/lib/services/dataService'

export type RoleFilter = 'all' | OperationalRole
export type RoleSelection = RoleFilter | readonly OperationalRole[]

const operationalRoles: OperationalRole[] = ['host', 'support', 'technical']

/**
 * Keep role filtering at the same level as the rows/actions that render it.
 * A selected role never leaves unrelated capacity or registration rows in a
 * child renderer for the otherwise-visible shift.
 */
export function getVisibleRoleCapacities(capacities: ShiftRoleCapacity[], role: RoleSelection): ShiftRoleCapacity[] {
  if (Array.isArray(role)) return role.length === 0 ? capacities : capacities.filter(capacity => role.includes(capacity.role))
  return role === 'all' ? capacities : capacities.filter(capacity => capacity.role === role)
}

export function getVisibleOperationalRoles(role: RoleSelection): OperationalRole[] {
  if (Array.isArray(role)) return role.length === 0 ? operationalRoles : operationalRoles.filter(candidate => role.includes(candidate))
  return role === 'all' ? operationalRoles : operationalRoles.filter(candidate => candidate === role)
}

export function matchesRoleFilter(registration: Pick<ShiftRegistration, 'operational_role'>, role: RoleSelection): boolean {
  return Array.isArray(role) ? role.length === 0 || role.includes(registration.operational_role) : role === 'all' || registration.operational_role === role
}
