import { Home, Calendar, Radio, FileText, User, Settings, Users, Package, Megaphone, BarChart3, RefreshCw, History, Bell } from 'lucide-react'
import { SystemPermission, User as UserType } from '@/lib/types/database.types'
import { hasAnyPermission, Permission } from '@/lib/permissions'

export type NavItem = {
  name: string
  href: string
  icon: any
  /** i18n key; defaults to name.toLowerCase() if omitted */
  labelKey?: string
  /** When set, item is only visible if the current user has at least one of these permissions */
  requiredPermissions?: Permission[]
}

// Full catalogue of all authorized application routes
const navCatalogue: Record<string, NavItem> = {
  dashboard:     { name: 'Dashboard',     href: '/',              icon: Home },
  calendar:      { name: 'Calendar',      href: '/calendar',      icon: Calendar },
  live:          { name: 'Live',          href: '/live',          icon: Radio },
  reports:       { name: 'Reports',       href: '/reports',       icon: FileText },
  swaps:         { name: 'Swaps',         href: '/swaps',         icon: RefreshCw },
  analytics:     { name: 'Analytics',     href: '/analytics',     icon: BarChart3 },
  staff:         { name: 'Staff',         href: '/staff',         icon: Users,    requiredPermissions: ['staff.manage'] },
  brands:        { name: 'Brands',        href: '/brands',        icon: Package,  requiredPermissions: ['brands.manage'] },
  platforms:     { name: 'Platforms',     href: '/platforms',     icon: Megaphone, requiredPermissions: ['platforms.manage'] },
  campaigns:     { name: 'Campaigns',     href: '/campaigns',     icon: Megaphone, requiredPermissions: ['campaigns.manage', 'campaigns.edit_operational'] },
  audit:         { name: 'Audit',         href: '/audit',         icon: History,  labelKey: 'auditHistory', requiredPermissions: ['audit.view', 'audit.view_team'] },
  settings:      { name: 'Settings',      href: '/settings',      icon: Settings },
  profile:       { name: 'Profile',       href: '/profile',       icon: User },
  notifications: { name: 'Notifications', href: '/notifications', icon: Bell,     labelKey: 'navNotifications' },
}

// ADMIN priority: operational exceptions > schedule/system control > staffing > users/permissions > reports > system/recovery
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

// LEADER priority: today's operations > staffing gaps > pending registrations > swap approvals > schedule > reports
const leaderNav: NavItem[] = [
  navCatalogue.dashboard,
  navCatalogue.calendar,
  navCatalogue.live,
  navCatalogue.swaps,
  navCatalogue.reports,
  navCatalogue.staff,
  navCatalogue.brands,
  navCatalogue.platforms,
  navCatalogue.campaigns,
  navCatalogue.audit,
  navCatalogue.settings,
  navCatalogue.profile,
]

// MEMBER priority: next shift (Calendar) > swaps > notifications > reports > settings > profile
// "My Shifts" and "Open Shifts" are modes/tabs within /calendar — no separate route exists.
const memberNav: NavItem[] = [
  navCatalogue.dashboard,
  navCatalogue.calendar,    // encompasses My Shifts + Open Shifts tabs
  navCatalogue.swaps,
  navCatalogue.notifications,
  navCatalogue.reports,
  navCatalogue.settings,    // member has settings.member permission
  navCatalogue.profile,
]

/**
 * Shared permission filter — single source of truth for both Sidebar and BottomNav.
 * Removes any item whose requiredPermissions the user does not satisfy.
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
  if (!systemPermission) return memberNav // safe fallback
  switch (systemPermission) {
    case 'admin':  return adminNav
    case 'leader': return leaderNav
    case 'member':
    default:       return memberNav
  }
}

export type ExceptionSeverity = 'critical' | 'action_required' | 'pending' | 'informational' | 'resolved'

// Presentation-only severity mapping — no backend status values invented
export const EXCEPTION_CONFIG: Record<ExceptionSeverity, { color: string; iconKey: string }> = {
  critical:      { color: 'text-red-600 bg-red-50 border-red-200',     iconKey: 'alert-triangle' },
  action_required: { color: 'text-amber-600 bg-amber-50 border-amber-200', iconKey: 'alert-circle' },
  pending:       { color: 'text-blue-600 bg-blue-50 border-blue-200',   iconKey: 'clock' },
  informational: { color: 'text-slate-600 bg-slate-50 border-slate-200', iconKey: 'info' },
  resolved:      { color: 'text-emerald-600 bg-emerald-50 border-emerald-200', iconKey: 'check-circle' },
}

// CTA priority contract — consumed by E2 per-surface enforcement
export type CtaPriority = 'primary' | 'secondary' | 'more'
