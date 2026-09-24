import { Home, Calendar, Radio, FileText, User, Settings, Users, Package, Megaphone, BarChart3, RefreshCw, History, Bell, type LucideIcon } from 'lucide-react'
import { SystemPermission, User as UserType } from '@/lib/types/database.types'
import { hasAnyPermission, Permission } from '@/lib/permissions'

export type NavItem = {
  name: string
  href: string
  icon: LucideIcon
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
  group?: string
}

// Full catalogue of all application destinations
const navCatalogue: Record<string, NavItem> = {
  dashboard:     { name: 'Dashboard',     href: '/',              icon: Home },
  calendar:      { name: 'Calendar',      href: '/calendar',      icon: Calendar },
  live:          { name: 'Live',          href: '/live',          icon: Radio },
  reports:       { name: 'Reports',       href: '/reports',       icon: FileText },
  swaps:         { name: 'Swaps',         href: '/swaps',         icon: RefreshCw },
  analytics:     { name: 'Analytics',     href: '/analytics',     icon: BarChart3 },
  staff:         { name: 'Staff',         href: '/staff',         icon: Users },
  brands:        { name: 'Brands',        href: '/brands',        icon: Package },
  platforms:     { name: 'Platforms',     href: '/platforms',     icon: Megaphone },
  campaigns:     { name: 'Campaigns',     href: '/campaigns',     icon: Megaphone },
  audit:         { name: 'Audit',         href: '/audit',         icon: History,  labelKey: 'auditHistory', requiredPermissions: ['audit.view', 'audit.view_team'] },
  settings:      { name: 'Settings',      href: '/settings',      icon: Settings },
  profile:       { name: 'Profile',       href: '/profile',       icon: User },
  notifications: { name: 'Notifications', href: '/notifications', icon: Bell,     labelKey: 'navNotifications' },

  // Additional parity placeholders
  shifts:        { name: 'Shifts',        href: '/shifts',        icon: Calendar },
  staffing:      { name: 'Staffing',      href: '/staffing',      icon: Users },
  staffDirectory:{ name: 'Staff Directory',href: '/staff',        icon: Users },
  myWorkspace:   { name: 'My Workspace',  href: '/',              icon: Home },
  mySchedule:    { name: 'My Schedule',   href: '/calendar?tab=mine', icon: Calendar },
  openShifts:    { name: 'Open Shifts',   href: '/calendar?tab=open', icon: Calendar },
  mySwaps:       { name: 'My Swaps',      href: '/swaps',         icon: RefreshCw },
}

// ADMIN priority
const adminNav: NavItem[] = [
  navCatalogue.dashboard,
  { ...navCatalogue.calendar, group: 'OPERATIONS' },
  { ...navCatalogue.live, group: 'OPERATIONS' },
  { ...navCatalogue.shifts, group: 'OPERATIONS' },
  { ...navCatalogue.staffing, group: 'OPERATIONS' },
  { ...navCatalogue.swaps, group: 'OPERATIONS' },
  { ...navCatalogue.reports, group: 'PERFORMANCE' },
  { ...navCatalogue.analytics, group: 'PERFORMANCE' },
  { ...navCatalogue.brands, group: 'MANAGEMENT' },
  { ...navCatalogue.platforms, group: 'MANAGEMENT' },
  { ...navCatalogue.campaigns, group: 'MANAGEMENT' },
  { ...navCatalogue.staff, group: 'MANAGEMENT' },
  { ...navCatalogue.audit, group: 'SYSTEM' },
  { ...navCatalogue.settings, group: 'SYSTEM' },
]

// LEADER priority
const leaderNav: NavItem[] = [
  { ...navCatalogue.dashboard, name: 'Team Operations' },
  { ...navCatalogue.calendar, group: 'OPERATIONS' },
  { ...navCatalogue.live, group: 'OPERATIONS' },
  { ...navCatalogue.shifts, group: 'OPERATIONS' },
  { ...navCatalogue.staffing, group: 'OPERATIONS' },
  { ...navCatalogue.swaps, group: 'OPERATIONS' },
  { ...navCatalogue.reports, group: 'PERFORMANCE' },
  { ...navCatalogue.staffDirectory, group: 'TEAM' },
  navCatalogue.notifications,
]

// MEMBER priority
const memberNav: NavItem[] = [
  navCatalogue.myWorkspace,
  navCatalogue.mySchedule,
  navCatalogue.openShifts,
  navCatalogue.mySwaps,
  navCatalogue.live,
  navCatalogue.reports,
  navCatalogue.notifications,
  navCatalogue.profile,
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
