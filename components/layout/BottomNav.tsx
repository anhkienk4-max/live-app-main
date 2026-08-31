'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Menu } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/lib/i18n'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'
import { resolveSystemPermission } from '@/lib/permissions'
import { getNavigationForRole, filterNav, getNavigationPlacement, isNavItemActive } from '@/lib/ui/role-ux'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export function BottomNav() {
  const pathname = usePathname()
  const { t } = useTranslation()
  const { currentUser } = useCurrentUser()

  const systemPermission = resolveSystemPermission(currentUser)
  const rawNav = getNavigationForRole(systemPermission)
  const roleNav = filterNav(rawNav, currentUser)

  // At 390px: up to 4 primary slots + 1 overflow trigger (5th col).
  // Secondary/utility items never displace the role's primary destinations.
  const rolePrimaryNav = roleNav.filter(item => getNavigationPlacement(item, systemPermission) === 'primary')
  const roleOverflowNav = roleNav.filter(item => getNavigationPlacement(item, systemPermission) !== 'primary')
  const primaryNav = rolePrimaryNav.slice(0, 4)
  const overflowNav = [...rolePrimaryNav.slice(4), ...roleOverflowNav]
  const hasOverflow = overflowNav.length > 0

  const getLabel = (item: typeof roleNav[number]) =>
    item.labelKey
      ? t(item.labelKey as Parameters<typeof t>[0])
      : t(item.name.toLowerCase() as Parameters<typeof t>[0])

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border md:hidden pb-safe"
      aria-label={t('navMain')}
    >
      <div className="grid grid-cols-5 h-16">
        {primaryNav.map((item) => {
          const isActive = isNavItemActive(pathname, item.href)
          const Icon = item.icon
          return (
            <Link
              key={item.name}
              href={item.href}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'flex flex-col items-center justify-center gap-1 transition-colors',
                isActive
                  ? 'text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              )}
              data-testid={`nav-${item.name.toLowerCase()}`}
            >
              <Icon className="h-5 w-5" />
              <span className="text-xs font-medium">{getLabel(item)}</span>
            </Link>
          )
        })}

        {hasOverflow && (
          <DropdownMenu>
            <DropdownMenuTrigger
              className={cn(
                'flex flex-col items-center justify-center gap-1 transition-colors',
                'text-muted-foreground hover:text-foreground outline-none cursor-pointer'
              )}
              data-testid="nav-menu-more"
              aria-label={t('moreMenu')}
            >
              <Menu className="h-5 w-5" />
              <span className="text-xs font-medium">{t('moreMenu')}</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 mb-2">
              {overflowNav.map((item) => {
                const Icon = item.icon
                return (
                  <DropdownMenuItem key={item.name} render={
                    <Link
                      href={item.href}
                      className={cn(
                        'flex items-center gap-3 py-2 cursor-pointer w-full',
                        isNavItemActive(pathname, item.href) ? 'text-primary font-medium bg-primary/5' : ''
                      )}
                      aria-current={isNavItemActive(pathname, item.href) ? 'page' : undefined}
                    />
                  }>
                    <Icon className="h-4 w-4" />
                    {getLabel(item)}
                  </DropdownMenuItem>
                )
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </nav>
  )
}
