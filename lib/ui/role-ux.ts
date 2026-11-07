import { Home, Calendar, Radio, FileText, User, Settings, Users, Package, Megaphone, BarChart3, RefreshCw, History, Bell, UserCheck, FolderArchive, Banknote, Activity, ShieldCheck, type LucideIcon } from 'lucide-react'
import { SystemPermission, User as UserType } from '@/lib/types/database.types'
import { hasAnyPermission, hasPermission, Permission } from '@/lib/permissions'
import type { WorkforceCapabilities } from '@/lib/services/workforceService'

export type NavAccessStatus = 'available' | 'read_only' | 'restricted' | 'unavailable' | 'pending'

export type NavItem = {
  name: string
  href: string
  icon: LucideIcon
  /** i18n key override; falls back to name.toLowerCase() */
  labelKey?: string
  /** Short label for compact layouts (e.g. mobile bottom nav) */
  shortLabelKey?: string
  /** Required permissions for viewing the module */
  requiredPermissions?: Permission[]
  /** Specific permissions required for mutation/management actions */
  actionPermissions?: Permission[]
  /** Workforce capabilities required */
  requiredCapability?: 'payroll' | 'team_performance' | 'own_performance' | 'actual_staffing'
  group?: NavigationGroupId
  accessStatus?: NavAccessStatus
}

export const NAVIGATION_GROUPS = [
  { id: 'overview', labelKey: 'navGroupOverview' },
  { id: 'operations', labelKey: 'navGroupOperations' },
  { id: 'data', labelKey: 'navGroupData' },
  { id: 'people', labelKey: 'navGroupPeople' },
  { id: 'system', labelKey: 'navGroupSystem' },
] as const
export type NavigationGroupId = typeof NAVIGATION_GROUPS[number]['id']

export function groupNavigation(items: NavItem[]) {
  return NAVIGATION_GROUPS.map(group => ({ ...group, items: items.filter(item => (item.group ?? 'overview') === group.id) }))
    .filter(group => group.items.length > 0)
}

export function mobilePrimaryNavigation(items: NavItem[]) {
  return ['/', '/calendar', '/shifts', '/live'].flatMap(path => {
    const item = items.find(item => item.href.split('?')[0] === path)
    return item ? [item] : []
  })
}

// One catalogue backs desktop, mobile, dashboard, and search navigation.
export const UNIFIED_NAVIGATION_CATALOG: NavItem[] = [
  // Overview
  { name: 'Dashboard', href: '/', icon: Home, labelKey: 'dashboard', shortLabelKey: 'myWorkspaceShort', group: 'overview' },
  { name: 'Profile', href: '/profile', icon: User, labelKey: 'profile', group: 'overview' },
  { name: 'Notifications', href: '/notifications', icon: Bell, labelKey: 'navNotifications', group: 'overview' },

  // Operations
  { name: 'Calendar', href: '/calendar', icon: Calendar, labelKey: 'calendar', shortLabelKey: 'myScheduleShort', group: 'operations' },
  { name: 'Shifts', href: '/shifts', icon: Calendar, labelKey: 'shifts', group: 'operations' },
  { name: 'Open Shifts', href: '/calendar?tab=open', icon: Calendar, labelKey: 'openShifts', shortLabelKey: 'openShiftsShort', group: 'operations' },
  { name: 'My Schedule', href: '/calendar?tab=mine', icon: Calendar, labelKey: 'mySchedule', shortLabelKey: 'myScheduleShort', group: 'operations' },
  { name: 'Registration', href: '/staffing?tab=registration', icon: UserCheck, labelKey: 'registration', group: 'operations', actionPermissions: ['shifts.approve_registration'] },
  { name: 'Staffing', href: '/staffing', icon: Users, labelKey: 'staffing', group: 'operations', actionPermissions: ['shifts.assign_staff'] },
  { name: 'Swaps', href: '/swaps', icon: RefreshCw, labelKey: 'swaps', group: 'operations' },
  { name: 'Live', href: '/live', icon: Radio, labelKey: 'live', shortLabelKey: 'live', group: 'operations' },
  { name: 'Attendance', href: '/calendar?tab=attendance', icon: UserCheck, labelKey: 'attendance', group: 'operations' },
  { name: 'Shift Notes', href: '/calendar?tab=notes', icon: FileText, labelKey: 'shiftNotes', group: 'operations' },

  // Data & Reports
  { name: 'Reports', href: '/reports', icon: FileText, labelKey: 'reports', group: 'data' },
  { name: 'Analytics', href: '/analytics', icon: BarChart3, labelKey: 'analytics', group: 'data' },
  { name: 'Storage', href: '/storage', icon: FolderArchive, labelKey: 'storage', group: 'data', requiredPermissions: ['storage.upload', 'reports.review'] },
  { name: 'Product catalog', href: '/brand-catalog', icon: Package, labelKey: 'productCatalog', group: 'data' },
  { name: 'Workforce Performance', href: '/workforce', icon: Activity, labelKey: 'workforce', group: 'data', requiredCapability: 'team_performance' },
  { name: 'Data Quality', href: '/data-quality', icon: FileText, labelKey: 'dataQuality', group: 'data' },

  // People & Finance
  { name: 'Staff Directory', href: '/staff', icon: Users, labelKey: 'staffDirectory', group: 'people', actionPermissions: ['staff.manage'] },
  { name: 'Account Management', href: '/staff?tab=accounts', icon: Users, labelKey: 'accountManagement', group: 'people', requiredPermissions: ['staff.manage'] },
  { name: 'Payroll', href: '/payroll', icon: Banknote, labelKey: 'payroll', group: 'people', requiredPermissions: ['payroll.manage'], requiredCapability: 'payroll' },
  { name: 'Personal Payslip', href: '/payroll?tab=personal', icon: Banknote, labelKey: 'personalPayslip', group: 'people' },

  // System Administration
  { name: 'Admin workspace', href: '/admin', icon: ShieldCheck, labelKey: 'adminWorkspace', group: 'system', requiredPermissions: ['settings.admin'] },
  { name: 'Brands', href: '/brands', icon: Package, labelKey: 'brands', group: 'system', actionPermissions: ['brands.manage'] },
  { name: 'Platforms', href: '/platforms', icon: Megaphone, labelKey: 'platforms', group: 'system', actionPermissions: ['platforms.manage'] },
  { name: 'Campaigns', href: '/campaigns', icon: Megaphone, labelKey: 'campaigns', group: 'system', actionPermissions: ['campaigns.manage', 'campaigns.edit_operational'] },
  { name: 'Audit', href: '/audit', icon: History, labelKey: 'auditHistory', group: 'system', requiredPermissions: ['audit.view', 'audit.view_team'] },
  { name: 'Settings', href: '/settings', icon: Settings, labelKey: 'settings', group: 'system' },
]

export function resolveNavAccessStatus(
  item: NavItem,
  currentUser: Pick<UserType, 'role' | 'system_permission'> | null | undefined,
  capabilities?: WorkforceCapabilities,
  effectivePermissions?: Partial<Record<Permission, boolean>> | null,
): NavAccessStatus {
  if (!currentUser) return 'restricted'

  const permissionAccess = (permissions: Permission[]) => {
    if (effectivePermissions === undefined) return hasAnyPermission(currentUser, permissions)
    if (effectivePermissions === null) return null
    const results = permissions.map(permission => effectivePermissions[permission])
    if (results.includes(true)) return true
    return results.some(result => result === undefined) ? null : false
  }

  if (item.href === '/storage' && process.env.NEXT_PUBLIC_FEATURE_FILE_STORAGE === 'false') {
    return 'unavailable'
  }

  if (item.requiredCapability === 'payroll') {
    if (capabilities?.payroll === false) return 'unavailable'
    const allowed = permissionAccess(['payroll.manage'])
    if (allowed === false) return 'restricted'
    if (allowed === null || (capabilities === undefined && effectivePermissions !== undefined)) return 'pending'
    return allowed ? 'available' : 'restricted'
  }

  if (item.requiredCapability === 'team_performance') {
    if (capabilities?.team_performance === false && capabilities.own_performance === false) return 'unavailable'
    if (capabilities?.team_performance === true) return 'available'
    if (capabilities?.own_performance === true) return 'read_only'
    if (hasPermission(currentUser, 'staff.manage')) return 'available'
    if (capabilities === undefined && effectivePermissions === null) return 'pending'
    return 'restricted'
  }

  if (item.requiredCapability === 'actual_staffing') {
    if (capabilities?.actual_staffing === true) return 'available'
    if (capabilities === undefined && effectivePermissions === null) return 'pending'
    return 'restricted'
  }

  if (item.requiredPermissions && item.requiredPermissions.length > 0) {
    if (effectivePermissions === undefined && !hasAnyPermission(currentUser, item.requiredPermissions)) return 'restricted'
    const allowed = permissionAccess(item.requiredPermissions)
    if (allowed === null) return 'pending'
    if (!allowed) return 'restricted'
  }

  if (item.actionPermissions && item.actionPermissions.length > 0) {
    const allowed = permissionAccess(item.actionPermissions)
    if (allowed === null) return 'pending'
    if (!allowed) return 'read_only'
  }

  return 'available'
}

/**
 * Shared navigation resolver — single source of truth for navigation surfaces.
 * For unauthenticated users, strips elevated routes (security failsafe).
 * For all authenticated roles, preserves discovery parity while annotating accessStatus.
 */
export function filterNav(
  items: NavItem[],
  currentUser: Pick<UserType, 'role' | 'system_permission'> | null | undefined,
  capabilities?: WorkforceCapabilities,
  effectivePermissions?: Partial<Record<Permission, boolean>> | null,
): NavItem[] {
  if (!currentUser) {
    return items.filter(item => {
      if (item.requiredPermissions && item.requiredPermissions.length > 0) return false
      if (item.requiredCapability) return false
      if (item.actionPermissions && item.actionPermissions.length > 0) return false
      return true
    })
  }

  return items.map(item => ({
    ...item,
    accessStatus: resolveNavAccessStatus(item, currentUser, capabilities, effectivePermissions),
  }))
}

export function getNavigationForRole(systemPermission?: SystemPermission): NavItem[] {
  void systemPermission
  return UNIFIED_NAVIGATION_CATALOG.map(item => ({ ...item }))
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
