import { Home, Calendar, Radio, FileText, User, Settings, Users, Package, Megaphone, BarChart3, RefreshCw, History, Bell } from 'lucide-react'
import { SystemPermission } from '@/lib/types/database.types'

export type NavItem = {
  name: string
  href: string
  icon: any
  restricted?: boolean
}

// Full catalogue of all available application routes
const navCatalogue: Record<string, NavItem> = {
  dashboard: { name: 'Dashboard', href: '/', icon: Home },
  calendar: { name: 'Calendar', href: '/calendar', icon: Calendar },
  live: { name: 'Live', href: '/live', icon: Radio }, // "Staffing" / operations
  reports: { name: 'Reports', href: '/reports', icon: FileText },
  swaps: { name: 'Swaps', href: '/swaps', icon: RefreshCw },
  analytics: { name: 'Analytics', href: '/analytics', icon: BarChart3 },
  staff: { name: 'Staff', href: '/staff', icon: Users },
  brands: { name: 'Brands', href: '/brands', icon: Package },
  platforms: { name: 'Platforms', href: '/platforms', icon: Megaphone },
  campaigns: { name: 'Campaigns', href: '/campaigns', icon: Megaphone },
  audit: { name: 'Audit', href: '/audit', icon: History, restricted: true },
  settings: { name: 'Settings', href: '/settings', icon: Settings },
  profile: { name: 'Profile', href: '/profile', icon: User },
  notifications: { name: 'Notifications', href: '/notifications', icon: Bell },
}

// ADMIN priority: operational exceptions > schedule/system control > staffing > users/permissions > reports > system/recovery
const adminNav = [
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
const leaderNav = [
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

// MEMBER priority: next shift > My Shifts > Open Shifts > registration status > swap > notifications > reports/tasks
const memberNav = [
  navCatalogue.dashboard,
  navCatalogue.calendar,
  navCatalogue.swaps,
  navCatalogue.notifications,
  navCatalogue.reports,
  navCatalogue.profile,
]

export function getNavigationForRole(systemPermission: SystemPermission | undefined): NavItem[] {
  if (!systemPermission) return memberNav // safe fallback
  switch (systemPermission) {
    case 'admin':
      return adminNav
    case 'leader':
      return leaderNav
    case 'member':
    default:
      return memberNav
  }
}

export type ExceptionSeverity = 'critical' | 'action_required' | 'pending' | 'informational' | 'resolved'

// Defines how the UX should map exception semantics for standard components
export const EXCEPTION_CONFIG: Record<ExceptionSeverity, { color: string; iconKey: string }> = {
  critical: { color: 'text-red-600 bg-red-50 border-red-200', iconKey: 'alert-triangle' },
  action_required: { color: 'text-amber-600 bg-amber-50 border-amber-200', iconKey: 'alert-circle' },
  pending: { color: 'text-blue-600 bg-blue-50 border-blue-200', iconKey: 'clock' },
  informational: { color: 'text-slate-600 bg-slate-50 border-slate-200', iconKey: 'info' },
  resolved: { color: 'text-emerald-600 bg-emerald-50 border-emerald-200', iconKey: 'check-circle' },
}

// CTA priority config for standardizing primary vs secondary action placement based on business flow
export type CtaPriority = 'primary' | 'secondary' | 'more'
