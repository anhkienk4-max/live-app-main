'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/lib/i18n'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'
import { resolveSystemPermission } from '@/lib/permissions'
import { getNavigationForRole, filterNav, type NavItem } from '@/lib/ui/role-ux'

const SIDEBAR_GROUPS = [
  { id: 'operations', labelKey: 'sidebarGroupOperations', match: ['calendar', 'live', 'swaps'] },
  { id: 'performance', labelKey: 'sidebarGroupPerformance', match: ['reports', 'analytics'] },
  { id: 'management', labelKey: 'sidebarGroupManagement', match: ['brands', 'platforms', 'campaigns', 'staff'] },
  { id: 'system', labelKey: 'sidebarGroupSystem', match: ['audit', 'settings'] }
]

export function Sidebar() {
  const pathname = usePathname()
  const { t } = useTranslation()
  const { currentUser } = useCurrentUser()

  const [isCollapsed, setIsCollapsed] = React.useState(false)

  React.useEffect(() => {
    const stored = localStorage.getItem('sidebar:collapsed')
    if (stored === 'true') {

      setIsCollapsed(true)
    }
  }, [])

  const toggleCollapse = () => {
    const next = !isCollapsed
    setIsCollapsed(next)
    localStorage.setItem('sidebar:collapsed', String(next))
  }

  const rawNav = getNavigationForRole(resolveSystemPermission(currentUser))
  const navigation = filterNav(rawNav, currentUser)

  // Group items
  const groupedNav: { labelKey: string | null; items: NavItem[] }[] = []

  // Dashboard is always alone
  const dashboardItem = navigation.find(i => i.name.toLowerCase() === 'dashboard')
  if (dashboardItem) {
    groupedNav.push({ labelKey: null, items: [dashboardItem] })
  }

  const remainingItems = new Set(navigation.filter(i => i.name.toLowerCase() !== 'dashboard'))

  for (const group of SIDEBAR_GROUPS) {
    const groupItems = group.match
      .map(matchName => Array.from(remainingItems).find(i => i.name.toLowerCase() === matchName))
      .filter((i): i is NavItem => i !== undefined)

    if (groupItems.length >= 2) {
      groupedNav.push({ labelKey: group.labelKey, items: groupItems })
      groupItems.forEach(i => remainingItems.delete(i))
    }
  }

  // Any left over items (like single item from a group, or profile/notifications)
  if (remainingItems.size > 0) {
    groupedNav.push({ labelKey: null, items: Array.from(remainingItems) })
  }

  return (
    <aside className="hidden md:flex md:flex-shrink-0 relative">
      <div
        className={cn(
          "flex flex-col border-r border-border bg-sidebar transition-all duration-300",
          isCollapsed ? "w-[72px]" : "w-[248px]"
        )}
      >
        <div className="flex flex-col flex-grow pt-3 pb-3 overflow-y-auto overflow-x-hidden">
          {/* Wordmark */}
          <div className="flex items-center flex-shrink-0 px-4 mb-4 h-[40px] whitespace-nowrap overflow-hidden">
            <div className="w-6 h-6 bg-primary rounded-[var(--radius-md)] flex items-center justify-center flex-shrink-0">
              <svg className="w-3.5 h-3.5 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </div>
            {!isCollapsed && (
              <span className="ml-2.5 text-sm font-semibold text-foreground tracking-tight leading-none">
                LiveStream Ops
              </span>
            )}
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-2 space-y-4" aria-label={t('navMain')}>
            {groupedNav.map((group, groupIdx) => (
              <div key={groupIdx} className="flex flex-col space-y-0.5">
                {!isCollapsed && group.labelKey && (
                  <div className="px-2.5 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    {/* Fallback to english if i18n key is missing in translation */}
                    {t(group.labelKey as Parameters<typeof t>[0]) || group.labelKey.replace('sidebarGroup', '')}
                  </div>
                )}
                {group.items.map((item) => {
                  const isActive = pathname === item.href
                  const Icon = item.icon
                  const label = item.labelKey
                    ? t(item.labelKey as Parameters<typeof t>[0])
                    : t(item.name.toLowerCase() as Parameters<typeof t>[0])

                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      title={isCollapsed ? label : undefined}
                      className={cn(
                        'group relative flex items-center py-1.5 text-sm font-medium rounded-[var(--radius-md)] transition-colors',
                        isCollapsed ? 'px-0 justify-center' : 'px-2.5',
                        isActive
                          ? 'bg-primary/8 text-primary'
                          : 'text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                      )}
                      data-testid={`sidebar-${item.name.toLowerCase()}`}
                      aria-current={isActive ? 'page' : undefined}
                    >
                      <Icon
                        className={cn(
                          'flex-shrink-0 h-4 w-4',
                          !isCollapsed && 'mr-2.5',
                          isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-sidebar-accent-foreground'
                        )}
                        aria-hidden="true"
                      />
                      {!isCollapsed && <span>{label}</span>}
                      {/* Active indicator for collapsed state */}
                      {isCollapsed && isActive && (
                        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-4 bg-primary rounded-r-full" />
                      )}
                    </Link>
                  )
                })}
              </div>
            ))}
          </nav>

          {/* Collapse Toggle */}
          <div className="px-2 mt-4">
            <button
              type="button"
              onClick={toggleCollapse}
              title={isCollapsed ? t('expandSidebar' as Parameters<typeof t>[0]) || 'Expand' : t('collapseSidebar' as Parameters<typeof t>[0]) || 'Collapse'}
              className={cn(
                'flex items-center w-full py-1.5 text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground rounded-[var(--radius-md)] transition-colors',
                isCollapsed ? 'justify-center' : 'px-2.5 justify-start'
              )}
            >
              {isCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
              {!isCollapsed && <span className="ml-2.5 text-sm font-medium">{t('collapseSidebar' as Parameters<typeof t>[0]) || 'Collapse'}</span>}
            </button>
          </div>
        </div>
      </div>
    </aside>
  )
}
