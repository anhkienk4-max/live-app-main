'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Menu } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/lib/i18n'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'
import { resolveSystemPermission } from '@/lib/permissions'
import { getNavigationForRole, filterNav } from '@/lib/ui/role-ux'
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

  const rawNav = getNavigationForRole(resolveSystemPermission(currentUser))
  const roleNav = filterNav(rawNav, currentUser)

  // At 390px: up to 4 primary slots + 1 overflow trigger (5th col)
  const hasOverflow = roleNav.length > 4
  const primaryNav = hasOverflow ? roleNav.slice(0, 4) : roleNav
  const overflowNav = hasOverflow ? roleNav.slice(4) : []

  const getLabel = (item: typeof roleNav[number]) =>
    item.labelKey
      ? t(item.labelKey as Parameters<typeof t>[0])
      : t(item.name.toLowerCase() as Parameters<typeof t>[0])

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border md:hidden pb-safe"
      aria-label={t('moreMenu')}
    >
      <div className="grid grid-cols-5 h-16">
        {primaryNav.map((item) => {
          const isActive = pathname === item.href
          const Icon = item.icon
          return (
            <Link
              key={item.name}
              href={item.href}
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
                        pathname === item.href ? 'text-primary font-medium bg-primary/5' : ''
                      )}
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
