import { Home, Calendar, Radio, FileText, User, Settings, Users, Package, Megaphone, BarChart3, RefreshCw, History, Bell, UserCheck, FolderArchive, Banknote, Activity, type LucideIcon } from 'lucide-react'
import { SystemPermission, User as UserType } from '@/lib/types/database.types'
import { hasAnyPermission, Permission } from '@/lib/permissions'

export type NavItem = {
  name: string
  href: string
  icon: LucideIcon
  /** i18n key override; falls back to name.toLowerCase() */
  labelKey?: string
  /** Short label for compact layouts (e.g. mobile bottom nav) */
  shortLabelKey?: string
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
  group?: NavigationGroupId
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

// Full catalogue of all application destinations
const navCatalogue: Record<string, NavItem> = {
  dashboard:     { name: 'Dashboard',     href: '/',              icon: Home, labelKey: 'dashboard', shortLabelKey: 'myWorkspaceShort', group: 'overview' },
  calendar:      { name: 'Calendar',      href: '/calendar',      icon: Calendar, labelKey: 'calendar', shortLabelKey: 'myScheduleShort', group: 'operations' },
  live:          { name: 'Live',          href: '/live',          icon: Radio, labelKey: 'live', shortLabelKey: 'live', group: 'operations' },
  reports:       { name: 'Reports',       href: '/reports',       icon: FileText, group: 'data' },
  storage:       { name: 'Storage',       href: '/storage',       icon: FolderArchive, labelKey: 'storage', requiredPermissions: ['reports.review'], group: 'data' },
  swaps:         { name: 'Swaps',         href: '/swaps',         icon: RefreshCw, group: 'operations' },
  analytics:     { name: 'Analytics',     href: '/analytics',     icon: BarChart3, group: 'data' },
  staff:         { name: 'Staff',         href: '/staff',         icon: Users, group: 'people' },
  brands:        { name: 'Brands',        href: '/brands',        icon: Package, group: 'system' },
  platforms:     { name: 'Platforms',     href: '/platforms',     icon: Megaphone, group: 'system' },
  campaigns:     { name: 'Campaigns',     href: '/campaigns',     icon: Megaphone, group: 'system' },
  audit:         { name: 'Audit',         href: '/audit',         icon: History,  labelKey: 'auditHistory', requiredPermissions: ['audit.view', 'audit.view_team'], group: 'system' },
  settings:      { name: 'Settings',      href: '/settings',      icon: Settings, group: 'system' },
  profile:       { name: 'Profile',       href: '/profile',       icon: User, group: 'overview' },
  notifications: { name: 'Notifications', href: '/notifications', icon: Bell,     labelKey: 'navNotifications', group: 'overview' },
  payroll:       { name: 'Bảng lương',    href: '/payroll',       icon: Banknote, labelKey: 'payroll', group: 'people' },
  workforce:     { name: 'Hiệu suất',     href: '/workforce',     icon: Activity, labelKey: 'workforce', group: 'data' },

  // Additional parity placeholders
  shifts:        { name: 'Shifts',        href: '/shifts',        icon: Calendar, labelKey: 'shifts', group: 'operations' },
  staffing:      { name: 'Staffing',      href: '/staffing',      icon: Users, labelKey: 'staffing', group: 'operations' },
  registration:  { name: 'Registration',  href: '/staffing?tab=registration', icon: UserCheck, labelKey: 'registration', requiredPermissions: ['shifts.approve_registration'], group: 'operations' },
  staffDirectory:{ name: 'Staff Directory',href: '/staff',        icon: Users, labelKey: 'staffDirectory', group: 'people' },
  myWorkspace:   { name: 'My Workspace',  href: '/',              icon: Home, labelKey: 'myWorkspace', shortLabelKey: 'myWorkspaceShort', group: 'overview' },
  mySchedule:    { name: 'My Schedule',   href: '/calendar?tab=mine', icon: Calendar, labelKey: 'mySchedule', shortLabelKey: 'myScheduleShort', group: 'operations' },
  openShifts:    { name: 'Open Shifts',   href: '/calendar?tab=open', icon: Calendar, labelKey: 'openShifts', shortLabelKey: 'openShiftsShort', group: 'operations' },
  mySwaps:       { name: 'My Swaps',      href: '/swaps',         icon: RefreshCw, labelKey: 'mySwaps', shortLabelKey: 'mySwapsShort', group: 'operations' },
}

// ADMIN priority
const adminNav: NavItem[] = [
  { ...navCatalogue.dashboard },
  { ...navCatalogue.calendar },
  { ...navCatalogue.live },
  { ...navCatalogue.shifts },
  { ...navCatalogue.staffing },
  { ...navCatalogue.registration },
  { ...navCatalogue.storage },
  { ...navCatalogue.swaps },
  { ...navCatalogue.reports },
  { ...navCatalogue.workforce },
  { ...navCatalogue.analytics },
  { ...navCatalogue.payroll },
  { ...navCatalogue.brands },
  { ...navCatalogue.platforms },
  { ...navCatalogue.campaigns },
  { ...navCatalogue.staff },
  { ...navCatalogue.audit },
  { ...navCatalogue.settings },
]

// LEADER priority
const leaderNav: NavItem[] = [
  { ...navCatalogue.dashboard, name: 'Team Operations', labelKey: 'teamOperations', shortLabelKey: 'teamOperationsShort' },
  { ...navCatalogue.calendar },
  { ...navCatalogue.live },
  { ...navCatalogue.shifts },
  { ...navCatalogue.staffing },
  { ...navCatalogue.registration },
  { ...navCatalogue.swaps },
  { ...navCatalogue.reports },
  { ...navCatalogue.workforce },
  { ...navCatalogue.staffDirectory },
  { ...navCatalogue.notifications },
]

// MEMBER priority
const memberNav: NavItem[] = [
  { ...navCatalogue.myWorkspace },
  { ...navCatalogue.mySchedule },
  { ...navCatalogue.openShifts },
  { ...navCatalogue.shifts },
  { ...navCatalogue.mySwaps },
  { ...navCatalogue.live },
  { ...navCatalogue.reports },
  { ...navCatalogue.workforce, name: 'Hiệu suất cá nhân', labelKey: 'myWorkforce' },
  { ...navCatalogue.notifications },
]

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
  switch (systemPermission) {
    case 'admin':  return adminNav
    case 'leader': return leaderNav
    case 'member':
    default:       return memberNav // safe fallback
  }
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
