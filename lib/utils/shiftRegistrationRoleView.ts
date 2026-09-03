import type { OperationalRole, ShiftRegistration } from '@/lib/types/database.types'
import type { ShiftRoleCapacity } from '@/lib/services/dataService'

export type RoleFilter = 'all' | OperationalRole

const operationalRoles: OperationalRole[] = ['host', 'support', 'technical']

/**
 * Keep role filtering at the same level as the rows/actions that render it.
 * A selected role never leaves unrelated capacity or registration rows in a
 * child renderer for the otherwise-visible shift.
 */
export function getVisibleRoleCapacities(capacities: ShiftRoleCapacity[], role: string): ShiftRoleCapacity[] {
  return role === 'all' ? capacities : capacities.filter(capacity => capacity.role === role)
}

export function getVisibleOperationalRoles(role: string): OperationalRole[] {
  return role === 'all' ? operationalRoles : operationalRoles.filter(candidate => candidate === role)
}

export function matchesRoleFilter(registration: Pick<ShiftRegistration, 'operational_role'>, role: string): boolean {
  return role === 'all' || registration.operational_role === role
}
