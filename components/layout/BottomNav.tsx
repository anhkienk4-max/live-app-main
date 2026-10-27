'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { resolveActiveNavigation } from './shellConfig'
import { Bell, Menu, Settings2, UserRound } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/lib/i18n'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'
import { resolveSystemPermission } from '@/lib/permissions'
import { getNavigationForRole, filterNav } from '@/lib/ui/role-ux'
import { useWorkforceCapabilities } from '@/lib/hooks/useWorkforceCapabilities'
import { filterWorkforceNavigation } from '@/lib/ui/workforceNavigation'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export function BottomNav() {
  const pathname = usePathname()
  const search = useSearchParams()
  const { t } = useTranslation()
  const { currentUser } = useCurrentUser()

  const rawNav = getNavigationForRole(resolveSystemPermission(currentUser))
  const { capabilities } = useWorkforceCapabilities()
  const roleNav = filterWorkforceNavigation(filterNav(rawNav, currentUser), capabilities)
  const activeHref = resolveActiveNavigation(roleNav, pathname, search)

  // At 390px: up to 4 primary slots + 1 overflow trigger (5th col)
  // Prioritize the four destinations shown in the approved mobile reference,
  // but never reveal links that the existing role and capabilities filters hide.
  const preferred = ['/', '/calendar', '/reports', '/payroll']
  const pinned = preferred
    .map(path => roleNav.find(item => path === '/' ? item.href === '/' : item.href.split('?')[0] === path))
    .filter((item): item is typeof roleNav[number] => Boolean(item))
  const orderedNav = [...pinned, ...roleNav.filter(item => !pinned.includes(item))]
  const hasOverflow = orderedNav.length > 4
  const primaryNav = hasOverflow ? orderedNav.slice(0, 4) : orderedNav
  const overflowNav = hasOverflow ? orderedNav.slice(4) : []
  const overflowActive = overflowNav.some(item => item.href === activeHref)

  const getLabel = (item: typeof roleNav[number]) =>
    item.labelKey
      ? t(item.labelKey as Parameters<typeof t>[0])
      : t(item.name.toLowerCase() as Parameters<typeof t>[0])

  return (
    <nav
      data-testid="production-bottom-nav"
      className="ada-bottom-nav fixed bottom-0 left-0 right-0 z-50 border-t border-slate-200 bg-white pb-safe text-slate-500 shadow-[0_-6px_24px_rgba(7,24,59,.06)] md:hidden"
      aria-label={t('navMain')}
    >
      <div className="grid h-16 grid-cols-5">
        {primaryNav.map((item) => {
          const isActive = activeHref === item.href
          const Icon = item.icon
          return (
            <Link
              key={item.name}
              href={item.href}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'ada-bottom-nav__item flex min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1 transition-colors focus-visible:outline-2 focus-visible:outline-blue-600',
                isActive ? 'ada-bottom-nav__item--active font-semibold text-[#2563EB]' : 'text-slate-500 hover:bg-blue-50'
              )}
              data-testid={`nav-${item.name.toLowerCase()}`}
            >
              <Icon className="h-5 w-5" />
              <span className="text-[10px] sm:text-xs font-medium text-center leading-tight px-0.5 line-clamp-1">{getLabel(item)}</span>
            </Link>
          )
        })}

        {hasOverflow && (
          <DropdownMenu>
            <DropdownMenuTrigger
              className={cn(
                'ada-bottom-nav__item flex flex-col items-center justify-center gap-1 transition-colors',
                'outline-none cursor-pointer min-h-11 px-1 rounded-xl focus-visible:outline-2 focus-visible:outline-blue-600',
                overflowActive ? 'ada-bottom-nav__item--active text-[#2563EB]' : 'text-slate-500 hover:bg-blue-50'
              )}
              data-testid="nav-menu-more"
              aria-label={t('moreMenu')}
            >
              <Menu className="h-5 w-5" />
              <span className="text-[10px] sm:text-xs font-medium text-center leading-tight px-0.5 line-clamp-1">{t('moreMenu')}</span>
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
                        activeHref === item.href ? 'text-primary font-medium bg-primary/5' : ''
                      )}
                    />
                  }>
                    <Icon className="h-4 w-4" />
                    {getLabel(item)}
                  </DropdownMenuItem>
                )
              })}
              <DropdownMenuSeparator />
              <DropdownMenuItem render={<Link href="/profile" className="flex items-center gap-3 py-2 cursor-pointer w-full" />}>
                <UserRound className="h-4 w-4" />{t('profile')}
              </DropdownMenuItem>
              <DropdownMenuItem render={<Link href="/notifications" className="flex items-center gap-3 py-2 cursor-pointer w-full" />}>
                <Bell className="h-4 w-4" />{t('navNotifications')}
              </DropdownMenuItem>
              <DropdownMenuItem render={<Link href="/settings" className="flex items-center gap-3 py-2 cursor-pointer w-full" />}>
                <Settings2 className="h-4 w-4" />{t('settings')}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </nav>
  )
}
