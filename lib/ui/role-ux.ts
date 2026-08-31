import { Home, Calendar, Radio, FileText, User, Settings, Users, Package, Megaphone, BarChart3, RefreshCw, History, Bell, type LucideIcon } from 'lucide-react'
import { SystemPermission, User as UserType } from '@/lib/types/database.types'
import { hasAnyPermission, hasPermission, resolveSystemPermission, Permission } from '@/lib/permissions'

export type NavItem = {
  key: string
  name: string
  href: string
  icon: LucideIcon
  group: 'work' | 'operations' | 'insights' | 'management' | 'system'
  roleNavigation: Partial<Record<SystemPermission, {
    placement: 'primary' | 'secondary' | 'utility' | 'contextual' | 'hidden'
    order: number
  }>>
  /** i18n key override; falls back to name.toLowerCase() */
  labelKey?: string
  /**
   * When set, item is only rendered if the user holds at least one of these
   * permissions. Only use this for routes that have a genuine access requirement
   * (i.e., classification A). Do NOT apply to routes that are merely
   * mutation-restricted while remaining readable (classification B).
   *
   * Classification reference:
   *   A = route genuinely permission-restricted (hidden from unauthorised users)
   *   B = readable but mutation-restricted (page renders for all; only actions gated)
   *   C = intentional UX omission for role simplification (not a permission denial)
   */
  requiredPermissions?: Permission[]
}

// Full catalogue of all application destinations
const navCatalogue: Record<string, NavItem> = {
  dashboard:     { key: 'dashboard', name: 'Dashboard', href: '/', icon: Home, group: 'work', roleNavigation: { admin: { placement: 'primary', order: 10 }, leader: { placement: 'primary', order: 10 }, member: { placement: 'primary', order: 10 } } },
  calendar:      { key: 'calendar', name: 'Calendar', href: '/calendar', icon: Calendar, group: 'work', roleNavigation: { admin: { placement: 'primary', order: 20 }, leader: { placement: 'primary', order: 20 }, member: { placement: 'primary', order: 20 } } },
  live:          { key: 'live', name: 'Live', href: '/live', icon: Radio, group: 'operations', roleNavigation: { admin: { placement: 'primary', order: 30 }, leader: { placement: 'primary', order: 30 }, member: { placement: 'secondary', order: 10 } } },
  reports:       { key: 'reports', name: 'Reports', href: '/reports', icon: FileText, group: 'insights', roleNavigation: { admin: { placement: 'primary', order: 50 }, leader: { placement: 'primary', order: 50 }, member: { placement: 'secondary', order: 20 } } },
  swaps:         { key: 'swaps', name: 'Swaps', href: '/swaps', icon: RefreshCw, group: 'operations', roleNavigation: { admin: { placement: 'primary', order: 40 }, leader: { placement: 'primary', order: 40 }, member: { placement: 'primary', order: 30 } } },
  analytics:     { key: 'analytics', name: 'Analytics', href: '/analytics', icon: BarChart3, group: 'insights', roleNavigation: { admin: { placement: 'secondary', order: 10 }, leader: { placement: 'secondary', order: 40 }, member: { placement: 'utility', order: 40 } } },
  // B: Staff page is readable; canManage gates mutations only
  staff:         { key: 'staff', name: 'Staff', href: '/staff', icon: Users, group: 'management', roleNavigation: { admin: { placement: 'primary', order: 60 }, leader: { placement: 'secondary', order: 30 }, member: { placement: 'hidden', order: 0 } } },
  // B: Brands page is readable; canManage gates mutations only
  brands:        { key: 'brands', name: 'Brands', href: '/brands', icon: Package, group: 'management', roleNavigation: { admin: { placement: 'secondary', order: 20 }, leader: { placement: 'utility', order: 20 }, member: { placement: 'hidden', order: 0 } } },
  // B: Platforms page is readable; canManage gates mutations only
  platforms:     { key: 'platforms', name: 'Platforms', href: '/platforms', icon: Megaphone, group: 'management', roleNavigation: { admin: { placement: 'secondary', order: 30 }, leader: { placement: 'utility', order: 30 }, member: { placement: 'hidden', order: 0 } } },
  // B: Campaigns page is readable; canManage / edit_operational gates mutations only
  campaigns:     { key: 'campaigns', name: 'Campaigns', href: '/campaigns', icon: Megaphone, group: 'management', roleNavigation: { admin: { placement: 'secondary', order: 40 }, leader: { placement: 'secondary', order: 60 }, member: { placement: 'hidden', order: 0 } } },
  // A: Audit page genuinely restricted — AuditHistory renders nothing without audit.view/view_team
  audit:         { key: 'audit', name: 'Audit', href: '/audit', icon: History, group: 'system', labelKey: 'auditHistory', requiredPermissions: ['audit.view', 'audit.view_team'], roleNavigation: { admin: { placement: 'secondary', order: 50 }, leader: { placement: 'secondary', order: 70 }, member: { placement: 'hidden', order: 0 } } },
  settings:      { key: 'settings', name: 'Settings', href: '/settings', icon: Settings, group: 'system', roleNavigation: { admin: { placement: 'utility', order: 10 }, leader: { placement: 'utility', order: 10 }, member: { placement: 'utility', order: 10 } } },
  profile:       { key: 'profile', name: 'Profile', href: '/profile', icon: User, group: 'system', roleNavigation: { admin: { placement: 'utility', order: 20 }, leader: { placement: 'utility', order: 20 }, member: { placement: 'utility', order: 20 } } },
  // navNotifications key avoids clash with existing 'notifications: Notification preferences' key
  notifications: { key: 'notifications', name: 'Notifications', href: '/notifications', icon: Bell, group: 'system', labelKey: 'navNotifications', roleNavigation: { admin: { placement: 'utility', order: 30 }, leader: { placement: 'utility', order: 30 }, member: { placement: 'primary', order: 40 } } },
}

export const navigationItems = Object.values(navCatalogue)

// ADMIN priority: operational exceptions > schedule/system > staffing > users/permissions > reports > system/recovery
// All 13 destinations; admin holds all requiredPermissions so filterNav passes everything through.
// Role-specific placement is derived from navCatalogue below.

// LEADER priority: today's ops > staffing gaps > swap approvals > schedule > reports
// staff/brands/platforms/campaigns included as readable (classification B).
// audit included — leader has audit.view_team so filterNav keeps it.

// MEMBER priority: next shift (Calendar) > swaps > notifications > reports > settings > profile
// Omissions of admin/leader-centric reference pages (analytics, brands, platforms, campaigns,
// staff, audit) are classification C — UX simplification, not permission denial.

/**
 * Shared permission filter — single source of truth for Sidebar and BottomNav.
 * Only removes items whose requiredPermissions the user does not satisfy (class A items).
 * Class B/C items pass through unconditionally.
 */
export function filterNav(
  items: NavItem[],
  currentUser: Pick<UserType, 'role' | 'system_permission'> | null | undefined,
): NavItem[] {
  return items.filter(item => {
    if (!item.requiredPermissions || item.requiredPermissions.length === 0) return true
    if (!currentUser) return false
    return hasAnyPermission(currentUser, item.requiredPermissions)
  })
}

export function getNavigationForRole(systemPermission: SystemPermission | undefined): NavItem[] {
  const role = systemPermission ?? 'member'
  return navigationItems
    .filter(item => item.roleNavigation[role]?.placement !== 'hidden')
    .sort((left, right) => (
      (left.roleNavigation[role]?.order ?? Number.MAX_SAFE_INTEGER)
      - (right.roleNavigation[role]?.order ?? Number.MAX_SAFE_INTEGER)
    ))
}

export function getNavigationPlacement(item: NavItem, systemPermission: SystemPermission | undefined) {
  return item.roleNavigation[systemPermission ?? 'member']?.placement ?? 'hidden'
}

export function isNavItemActive(pathname: string | null | undefined, href: string) {
  const path = (pathname ?? '/').split('?')[0].replace(/\/$/, '') || '/'
  const target = href.replace(/\/$/, '') || '/'
  return target === '/' ? path === '/' : path === target || path.startsWith(`${target}/`)
}

export type ExceptionSeverity = 'critical' | 'action_required' | 'pending' | 'informational' | 'resolved'

// Presentation-only severity → style mapping. No backend status values invented.
export const EXCEPTION_CONFIG: Record<ExceptionSeverity, { color: string; iconKey: string }> = {
  critical:        { color: 'text-red-600 bg-red-50 border-red-200',       iconKey: 'alert-triangle' },
  action_required: { color: 'text-amber-600 bg-amber-50 border-amber-200', iconKey: 'alert-circle' },
  pending:         { color: 'text-blue-600 bg-blue-50 border-blue-200',    iconKey: 'clock' },
  informational:   { color: 'text-slate-600 bg-slate-50 border-slate-200', iconKey: 'info' },
  resolved:        { color: 'text-emerald-600 bg-emerald-50 border-emerald-200', iconKey: 'check-circle' },
}

// CTA priority contract — consumed by E2 per-surface enforcement
export type CtaPriority = 'primary' | 'secondary' | 'more'

/** UX priority is presentation order, intentionally distinct from defect severity. */
export const UX_PRIORITY_P0 = 'P0' as const
export const UX_PRIORITY_P1 = 'P1' as const
export const UX_PRIORITY_P2 = 'P2' as const
export const UX_PRIORITY_P3 = 'P3' as const
export type UxPriority = typeof UX_PRIORITY_P0 | typeof UX_PRIORITY_P1 | typeof UX_PRIORITY_P2 | typeof UX_PRIORITY_P3
export type RoleUxPriority = UxPriority

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
  user: Pick<UserType, 'role' | 'system_permission'> | null | undefined,
  requirement: PermissionRequirement | null,
) => requirement === null
  ? false
  : typeof requirement === 'string' ? hasPermission(user, requirement) : hasAnyPermission(user, [...requirement])

export function canAccessRoleUxAction(
  user: Pick<UserType, 'role' | 'system_permission'> | null | undefined,
  module: RoleUxModule,
  action: RoleUxAction,
) {
  return hasRequirement(user, actionPermission(module, action))
}

export function canAccessRoleUxModule(user: Pick<UserType, 'role' | 'system_permission'> | null | undefined, module: RoleUxModule) {
  const requirement = modulePermission[module]
  return hasRequirement(user, requirement)
}

export function getRoleUxSurfaceConfig(
  user: Pick<UserType, 'role' | 'system_permission'> | null | undefined,
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
