import { SystemPermission, User } from '@/lib/types/database.types'

export type Permission =
  | 'shifts.view_assigned'
  | 'shifts.view_open'
  | 'shifts.register'
  | 'shifts.cancel_registration'
  | 'shifts.approve_registration'
  | 'shifts.assign_staff'
  | 'shifts.lock'
  | 'shifts.import'
  | 'shifts.export'
  | 'reports.submit'
  | 'reports.review'
  | 'reports.export'
  | 'swaps.request'
  | 'swaps.approve'
  | 'swaps.export'
  | 'profile.edit_own'
  | 'staff.manage'
  | 'brands.manage'
  | 'platforms.manage'
  | 'campaigns.manage'
  | 'campaigns.edit_operational'
  | 'settings.member'
  | 'settings.leader'
  | 'settings.admin'
  | 'permissions.manage'
  | 'audit.view'
  | 'audit.view_team'
  | 'audit.restore'
  | 'audit.review'
  | 'data.force_delete'

const memberPermissions: Permission[] = [
  'shifts.view_assigned',
  'shifts.view_open',
  'shifts.register',
  'shifts.cancel_registration',
  'reports.submit',
  'swaps.request',
  'profile.edit_own',
  'settings.member',
]

const leaderPermissions: Permission[] = [
  ...memberPermissions,
  'shifts.approve_registration',
  'shifts.assign_staff',
  'shifts.lock',
  'shifts.import',
  'shifts.export',
  'reports.review',
  'reports.export',
  'swaps.approve',
  'swaps.export',
  'settings.leader',
  'campaigns.edit_operational',
  'audit.view_team',
]

const adminPermissions: Permission[] = [
  ...leaderPermissions,
  'staff.manage',
  'brands.manage',
  'platforms.manage',
  'campaigns.manage',
  'settings.admin',
  'permissions.manage',
  'audit.view',
  'audit.restore',
  'audit.review',
  'data.force_delete',
]

export const permissionMatrix: Record<SystemPermission, ReadonlySet<Permission>> = {
  member: new Set(memberPermissions),
  leader: new Set(leaderPermissions),
  admin: new Set(adminPermissions),
}

export function resolveSystemPermission(user?: Pick<User, 'role' | 'system_permission'> | null): SystemPermission {
  if (user?.system_permission) return user.system_permission
  if (user?.role === 'admin') return 'admin'
  if (user?.role === 'leader') return 'leader'
  return 'member'
}

export function hasPermission(
  user: Pick<User, 'role' | 'system_permission'> | null | undefined,
  permission: Permission,
): boolean {
  return permissionMatrix[resolveSystemPermission(user)].has(permission)
}

export function hasAnyPermission(
  user: Pick<User, 'role' | 'system_permission'> | null | undefined,
  permissions: Permission[],
): boolean {
  return permissions.some(permission => hasPermission(user, permission))
}
