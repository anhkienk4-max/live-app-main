import { Home, Calendar, Radio, FileText, User, Settings, Users, Package, Megaphone, BarChart3, RefreshCw, History, Bell } from 'lucide-react'
import { SystemPermission, User as UserType } from '@/lib/types/database.types'
import { hasAnyPermission, Permission } from '@/lib/permissions'

export type NavItem = {
  name: string
  href: string
  icon: any
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
  dashboard:     { name: 'Dashboard',     href: '/',              icon: Home },
  calendar:      { name: 'Calendar',      href: '/calendar',      icon: Calendar },
  live:          { name: 'Live',          href: '/live',          icon: Radio },
  reports:       { name: 'Reports',       href: '/reports',       icon: FileText },
  swaps:         { name: 'Swaps',         href: '/swaps',         icon: RefreshCw },
  analytics:     { name: 'Analytics',     href: '/analytics',     icon: BarChart3 },
  // B: Staff page is readable; canManage gates mutations only
  staff:         { name: 'Staff',         href: '/staff',         icon: Users },
  // B: Brands page is readable; canManage gates mutations only
  brands:        { name: 'Brands',        href: '/brands',        icon: Package },
  // B: Platforms page is readable; canManage gates mutations only
  platforms:     { name: 'Platforms',     href: '/platforms',     icon: Megaphone },
  // B: Campaigns page is readable; canManage / edit_operational gates mutations only
  campaigns:     { name: 'Campaigns',     href: '/campaigns',     icon: Megaphone },
  // A: Audit page genuinely restricted — AuditHistory renders nothing without audit.view/view_team
  audit:         { name: 'Audit',         href: '/audit',         icon: History,  labelKey: 'auditHistory', requiredPermissions: ['audit.view', 'audit.view_team'] },
  settings:      { name: 'Settings',      href: '/settings',      icon: Settings },
  profile:       { name: 'Profile',       href: '/profile',       icon: User },
  // navNotifications key avoids clash with existing 'notifications: Notification preferences' key
  notifications: { name: 'Notifications', href: '/notifications', icon: Bell,     labelKey: 'navNotifications' },
}

// ADMIN priority: operational exceptions > schedule/system > staffing > users/permissions > reports > system/recovery
// All 13 destinations; admin holds all requiredPermissions so filterNav passes everything through.
const adminNav: NavItem[] = [
  navCatalogue.dashboard,
  navCatalogue.calendar,
  navCatalogue.live,
  navCatalogue.swaps,
  navCatalogue.staff,
  navCatalogue.reports,
  navCatalogue.analytics,
  navCatalogue.brands,
  navCatalogue.platforms,
  navCatalogue.campaigns,
  navCatalogue.audit,
  navCatalogue.settings,
  navCatalogue.profile,
]

// LEADER priority: today's ops > staffing gaps > swap approvals > schedule > reports
// staff/brands/platforms/campaigns included as readable (classification B).
// audit included — leader has audit.view_team so filterNav keeps it.
const leaderNav: NavItem[] = [
  navCatalogue.dashboard,
  navCatalogue.calendar,
  navCatalogue.live,
  navCatalogue.swaps,
  navCatalogue.reports,
  navCatalogue.analytics,
  navCatalogue.staff,
  navCatalogue.brands,
  navCatalogue.platforms,
  navCatalogue.campaigns,
  navCatalogue.audit,
  navCatalogue.settings,
  navCatalogue.profile,
]

// MEMBER priority: next shift (Calendar) > swaps > notifications > reports > settings > profile
// Omissions of admin/leader-centric reference pages (analytics, brands, platforms, campaigns,
// staff, audit) are classification C — UX simplification, not permission denial.
const memberNav: NavItem[] = [
  navCatalogue.dashboard,
  navCatalogue.calendar,
  navCatalogue.live,
  navCatalogue.swaps,
  navCatalogue.reports,
  navCatalogue.brands,
  navCatalogue.platforms,
  navCatalogue.campaigns,
  navCatalogue.notifications,
  navCatalogue.settings,
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
