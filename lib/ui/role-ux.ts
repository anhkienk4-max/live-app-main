import type { SystemPermission, User } from '@/lib/types/database.types'
import { hasAnyPermission, hasPermission, resolveSystemPermission, type Permission } from '@/lib/permissions'

/** The four delivery priorities used by the role UX plan. */
export type RoleUxPriority = 'P0' | 'P1' | 'P2' | 'P3'

export type RoleUxModule =
  | 'dashboard' | 'calendar' | 'shiftDetail' | 'myShifts' | 'openShifts' | 'staffing' | 'shiftSwap'
  | 'reports' | 'live' | 'analytics' | 'brands' | 'platforms' | 'campaigns' | 'audit' | 'staff' | 'import'

export type RoleUxAction = 'view' | 'register' | 'approve' | 'assign' | 'edit' | 'export' | 'manage' | 'review'
export type RoleUxEmptyStateKey = 'roleEmptyAdmin' | 'roleEmptyLeader' | 'roleEmptyMember'
const allActions: readonly RoleUxAction[] = ['view', 'register', 'approve', 'assign', 'edit', 'export', 'manage', 'review']
type PermissionRequirement = Permission | readonly Permission[]

/** Module access is expressed using the existing permission vocabulary. */
export const modulePermission: Record<RoleUxModule, PermissionRequirement> = {
  dashboard: ['shifts.view_assigned', 'shifts.view_open'], calendar: ['shifts.view_assigned', 'shifts.view_open'],
  shiftDetail: ['shifts.view_assigned', 'shifts.view_open'], myShifts: 'shifts.view_assigned', openShifts: 'shifts.view_open',
  staffing: ['shifts.view_assigned', 'shifts.assign_staff'], shiftSwap: 'swaps.request', reports: 'reports.submit', live: 'shifts.view_assigned',
  analytics: 'reports.submit', brands: 'brands.manage', platforms: 'platforms.manage', campaigns: 'campaigns.edit_operational',
  audit: 'audit.view_team', staff: 'staff.manage', import: 'shifts.import',
}

export const roleUxPriorities: Record<RoleUxModule, Record<SystemPermission, RoleUxPriority>> = {
  dashboard: { admin: 'P0', leader: 'P0', member: 'P0' }, calendar: { admin: 'P0', leader: 'P0', member: 'P0' },
  shiftDetail: { admin: 'P0', leader: 'P0', member: 'P0' }, myShifts: { admin: 'P0', leader: 'P0', member: 'P0' },
  openShifts: { admin: 'P1', leader: 'P1', member: 'P0' }, staffing: { admin: 'P0', leader: 'P0', member: 'P2' },
  shiftSwap: { admin: 'P1', leader: 'P1', member: 'P1' }, reports: { admin: 'P1', leader: 'P1', member: 'P1' },
  live: { admin: 'P0', leader: 'P0', member: 'P1' }, analytics: { admin: 'P1', leader: 'P1', member: 'P2' },
  brands: { admin: 'P1', leader: 'P2', member: 'P3' }, platforms: { admin: 'P1', leader: 'P2', member: 'P3' },
  campaigns: { admin: 'P1', leader: 'P1', member: 'P3' }, audit: { admin: 'P1', leader: 'P2', member: 'P3' },
  staff: { admin: 'P0', leader: 'P2', member: 'P3' }, import: { admin: 'P0', leader: 'P0', member: 'P3' },
}

export const roleUxResponsibility: Record<RoleUxModule, Record<SystemPermission, string>> = {
  dashboard: { admin: 'Monitor operations and exceptions', leader: 'Coordinate today\'s operations', member: 'See your next actions' },
  calendar: { admin: 'Manage the operating plan', leader: 'Coordinate shifts and staffing', member: 'Find available and assigned shifts' },
  shiftDetail: { admin: 'Resolve shift exceptions', leader: 'Coordinate staffing and approvals', member: 'Review assignment and registration status' },
  myShifts: { admin: 'Review team assignments', leader: 'Review team assignments', member: 'Prepare for your assigned shifts' },
  openShifts: { admin: 'Monitor coverage gaps', leader: 'Fill coverage gaps', member: 'Register for eligible shifts' },
  staffing: { admin: 'Maintain canonical staffing', leader: 'Approve and assign staff', member: 'Review your staffing status' },
  shiftSwap: { admin: 'Review operational swaps', leader: 'Approve operational swaps', member: 'Request or respond to a swap' },
  reports: { admin: 'Review operational reporting', leader: 'Review submitted reports', member: 'Submit your report' },
  live: { admin: 'Monitor live exceptions', leader: 'Coordinate live execution', member: 'Follow your live shift' },
  analytics: { admin: 'Monitor performance', leader: 'Inspect team performance', member: 'Review relevant outcomes' },
  brands: { admin: 'Manage master data', leader: 'Use trusted brand data', member: 'Use trusted brand data' },
  platforms: { admin: 'Manage master data', leader: 'Use trusted platform data', member: 'Use trusted platform data' },
  campaigns: { admin: 'Manage campaign data', leader: 'Maintain operational campaign context', member: 'Use assigned campaign context' },
  audit: { admin: 'Investigate and restore', leader: 'Review team activity', member: 'Review your activity when exposed' },
  staff: { admin: 'Manage accounts and permissions', leader: 'Coordinate the team', member: 'Maintain your own profile' },
  import: { admin: 'Import and reconcile schedules', leader: 'Import and reconcile schedules', member: 'No import action' },
}

export const roleUxEmptyState: Record<RoleUxModule, Record<SystemPermission, string>> = {
  dashboard: { admin: 'No operational exceptions require attention.', leader: 'No operational exceptions require attention.', member: 'No next actions are currently assigned.' },
  calendar: { admin: 'No shifts match the current filters.', leader: 'No shifts match the current filters.', member: 'No shifts are available for this profile.' },
  shiftDetail: { admin: 'No registrations or staffing exceptions.', leader: 'No registrations or staffing exceptions.', member: 'No registration activity for this shift.' },
  myShifts: { admin: 'No assigned shifts in this view.', leader: 'No assigned shifts in this view.', member: 'No approved shifts are assigned to you.' },
  openShifts: { admin: 'No open coverage gaps.', leader: 'No open coverage gaps.', member: 'No eligible open shifts match the filters.' },
  staffing: { admin: 'No staffing records for this shift.', leader: 'No staffing records for this shift.', member: 'You are not registered for this shift.' },
  shiftSwap: { admin: 'No swap requests require review.', leader: 'No swap requests require review.', member: 'No swap requests are available.' },
  reports: { admin: 'No reports require review.', leader: 'No reports require review.', member: 'No reports are available yet.' },
  live: { admin: 'No live exceptions.', leader: 'No live exceptions.', member: 'No live shift is assigned.' },
  analytics: { admin: 'No analytics data is available.', leader: 'No analytics data is available.', member: 'No analytics data is available.' },
  brands: { admin: 'No brands are configured.', leader: 'No brands are available.', member: 'Brand data is not available for editing.' },
  platforms: { admin: 'No platforms are configured.', leader: 'No platforms are available.', member: 'Platform data is not available for editing.' },
  campaigns: { admin: 'No campaigns are configured.', leader: 'No campaigns are available.', member: 'Campaign data is not available for editing.' },
  audit: { admin: 'No audit events match the filters.', leader: 'No team audit events match the filters.', member: 'No audit events are available.' },
  staff: { admin: 'No staff records match the filters.', leader: 'No team staff records match the filters.', member: 'Account management is unavailable for this profile.' },
  import: { admin: 'No import rows require attention.', leader: 'No import rows require attention.', member: 'Schedule import is unavailable for this profile.' },
}

export const roleUxEmptyStateKey: Record<RoleUxModule, Record<SystemPermission, RoleUxEmptyStateKey>> =
  Object.fromEntries(
    (Object.keys(roleUxEmptyState) as RoleUxModule[]).map(module => [module, {
      admin: 'roleEmptyAdmin', leader: 'roleEmptyLeader', member: 'roleEmptyMember',
    }]),
  ) as Record<RoleUxModule, Record<SystemPermission, RoleUxEmptyStateKey>>

export interface RoleUxSurfaceConfig {
  module: RoleUxModule
  role: SystemPermission
  priority: RoleUxPriority
  canAccess: boolean
  responsibility: string
  emptyState: string
  emptyStateKey: RoleUxEmptyStateKey
  primaryAction: RoleUxAction | null
  secondaryActions: readonly RoleUxAction[]
  availableActions: ReadonlySet<RoleUxAction>
  exceptionOwnership: 'self' | 'team' | 'system'
}

const primaryAction: Record<RoleUxModule, RoleUxAction> = {
  dashboard: 'view', calendar: 'view', shiftDetail: 'view', myShifts: 'view', openShifts: 'register', staffing: 'assign',
  shiftSwap: 'register', reports: 'view', live: 'view', analytics: 'view', brands: 'manage', platforms: 'manage',
  campaigns: 'edit', audit: 'review', staff: 'manage', import: 'manage',
}
const secondaryActions: Record<RoleUxModule, readonly RoleUxAction[]> = {
  dashboard: ['view'], calendar: ['register', 'approve'], shiftDetail: ['register', 'assign', 'edit'], myShifts: ['view'],
  openShifts: ['view'], staffing: ['approve', 'assign'], shiftSwap: ['approve'], reports: ['review', 'export'], live: ['edit'],
  analytics: ['export'], brands: ['edit'], platforms: ['edit'], campaigns: ['edit'], audit: ['export'], staff: ['edit'], import: ['export'],
}
export const exceptionOwnership: Record<RoleUxModule, RoleUxSurfaceConfig['exceptionOwnership']> = {
  dashboard: 'system', calendar: 'team', shiftDetail: 'team', myShifts: 'self', openShifts: 'self', staffing: 'team',
  shiftSwap: 'team', reports: 'team', live: 'team', analytics: 'team', brands: 'system', platforms: 'system', campaigns: 'team',
  audit: 'system', staff: 'system', import: 'team',
}

const actionPermission = (module: RoleUxModule, action: RoleUxAction): PermissionRequirement | null => {
  if (action === 'view') return modulePermission[module]
  if (action === 'register') return module === 'shiftSwap' ? 'swaps.request' : 'shifts.register'
  if (action === 'approve') return module === 'shiftSwap' ? 'swaps.approve' : 'shifts.approve_registration'
  if (action === 'assign') return 'shifts.assign_staff'
  if (action === 'export') return module === 'reports' ? 'reports.export' : 'shifts.export'
  if (action === 'review') return module === 'reports' ? 'reports.review' : 'audit.view_team'
  if (action === 'manage') {
    if (module === 'staff') return 'staff.manage'
    if (module === 'brands') return 'brands.manage'
    if (module === 'platforms') return 'platforms.manage'
    if (module === 'import') return 'shifts.import'
    return 'campaigns.manage'
  }
  if (action === 'edit') return module === 'campaigns' ? 'campaigns.edit_operational' : 'shifts.edit'
  return null
}

const hasRequirement = (
  user: Pick<User, 'role' | 'system_permission'> | null | undefined,
  requirement: PermissionRequirement | null,
) => requirement === null
  ? false
  : typeof requirement === 'string' ? hasPermission(user, requirement) : hasAnyPermission(user, [...requirement])

export function canAccessRoleUxAction(
  user: Pick<User, 'role' | 'system_permission'> | null | undefined,
  module: RoleUxModule,
  action: RoleUxAction,
) {
  return hasRequirement(user, actionPermission(module, action))
}

export function canAccessRoleUxModule(user: Pick<User, 'role' | 'system_permission'> | null | undefined, module: RoleUxModule) {
  const requirement = modulePermission[module]
  return hasRequirement(user, requirement)
}

export function getRoleUxSurfaceConfig(
  user: Pick<User, 'role' | 'system_permission'> | null | undefined,
  module: RoleUxModule,
): RoleUxSurfaceConfig {
  const role = resolveSystemPermission(user)
  const availableActions = new Set<RoleUxAction>(
    allActions.filter(action => canAccessRoleUxAction(user, module, action)),
  )
  const configuredPrimary = primaryAction[module]
  return {
    module, role, priority: roleUxPriorities[module][role], canAccess: canAccessRoleUxModule(user, module),
    responsibility: roleUxResponsibility[module][role],
    primaryAction: availableActions.has(configuredPrimary) ? configuredPrimary : null,
    secondaryActions: secondaryActions[module].filter(action => canAccessRoleUxAction(user, module, action)),
    availableActions,
    emptyState: roleUxEmptyState[module][role],
    emptyStateKey: roleUxEmptyStateKey[module][role],
    exceptionOwnership: exceptionOwnership[module],
  }
}
