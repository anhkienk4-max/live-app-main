'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/lib/i18n'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'
import { resolveSystemPermission } from '@/lib/permissions'
import { getNavigationForRole, filterNav } from '@/lib/ui/role-ux'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'

interface SidebarProps {
  isCollapsed?: boolean
}

export function Sidebar({ isCollapsed = false }: SidebarProps) {
  const pathname = usePathname()
  const { t } = useTranslation()
  const { currentUser } = useCurrentUser()

  const systemPermission = resolveSystemPermission(currentUser)
  const rawNav = getNavigationForRole(systemPermission)
  const navigation = filterNav(rawNav, currentUser)

  const initials = currentUser?.full_name
    ?.split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase() || currentUser?.email?.[0].toUpperCase() || 'U'

  // Determine role label for context
  const roleLabel = systemPermission ? systemPermission.toUpperCase() : 'MEMBER'

  return (
    <aside className={cn(
      "hidden md:flex flex-col border-r border-border bg-sidebar transition-all duration-300",
      isCollapsed ? "w-[68px]" : "w-[248px]"
    )}>
      <div className="flex flex-col flex-grow pt-3 pb-3 overflow-y-auto">
        {/* Wordmark */}
        <div className="flex items-center flex-shrink-0 px-4 mb-4 h-[40px]">
          <div className="w-6 h-6 bg-primary rounded-md flex items-center justify-center flex-shrink-0">
            <svg className="w-3.5 h-3.5 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </div>
          {!isCollapsed && (
            <span className="ml-2.5 text-sm font-semibold text-foreground tracking-tight leading-none overflow-hidden whitespace-nowrap">
              LiveStream Ops
            </span>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-2 space-y-0.5" aria-label={t('navMain')}>
          {navigation.map((item, index) => {
            const isActive = pathname === item.href
            const isFirstInGroup = index === 0 || navigation[index - 1].group !== item.group

            const Icon = item.icon
            const label = item.labelKey
              ? t(item.labelKey as Parameters<typeof t>[0])
              : (t(item.name.toLowerCase() as Parameters<typeof t>[0]) || item.name)

            return (
                <div key={item.name}>
                  {isFirstInGroup && item.group && !isCollapsed && (
                    <div className="px-3 pt-4 pb-1 text-xs font-semibold text-muted-foreground tracking-wider uppercase">
                      {item.group}
                    </div>
                  )}
                  {isFirstInGroup && item.group && isCollapsed && (
                    <div className="pt-4" />
                  )}
                  <Link
                    href={item.href}
                    className={cn(
                      'group flex items-center px-2.5 py-1.5 text-sm font-medium rounded-md transition-colors',
                      isActive
                        ? 'bg-primary/8 text-primary'
                        : 'text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                      isCollapsed && "justify-center px-0"
                    )}
                    data-testid={`sidebar-${item.name.toLowerCase().replace(/\s+/g, '-')}`}
                    aria-current={isActive ? 'page' : undefined}
                    title={isCollapsed ? label : undefined}
                  >
                    <Icon
                      className={cn(
                        'flex-shrink-0 h-4 w-4',
                        isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-sidebar-accent-foreground',
                        !isCollapsed && "mr-2.5"
                      )}
                      aria-hidden="true"
                    />
                    {!isCollapsed && <span className="truncate">{label}</span>}
                  </Link>
                </div>
              )
          })}
        </nav>
      </div>

      {/* Profile Footer & Role Context */}
      <div className="flex-shrink-0 border-t border-border p-4">
        <div className={cn("flex items-center", isCollapsed ? "justify-center" : "gap-3")}>
          <Avatar className="h-9 w-9">
            <AvatarImage src={currentUser?.avatar_url || ''} alt={currentUser?.full_name || currentUser?.email || 'User'} />
            <AvatarFallback className="bg-primary/10 text-primary text-small font-semibold">
              {initials}
            </AvatarFallback>
          </Avatar>
          {!isCollapsed && (
            <div className="flex flex-col overflow-hidden">
              <span className="text-sm font-medium text-foreground truncate">
                {currentUser?.full_name || 'User'}
              </span>
              <span className="text-micro text-muted-foreground tracking-wider font-medium truncate">
                {roleLabel}
              </span>
            </div>
          )}
        </div>
      </div>
    </aside>
  )
}
