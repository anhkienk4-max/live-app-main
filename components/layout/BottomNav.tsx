'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { Menu } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/lib/i18n'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'
import { resolveSystemPermission } from '@/lib/permissions'
import { filterNav, getNavigationForRole, mobilePrimaryNavigation } from '@/lib/ui/role-ux'
import { resolveActiveNavigation } from './shellConfig'
import { NavigationDrawer } from './NavigationDrawer'

export function BottomNav() {
  const pathname = usePathname()
  const search = useSearchParams()
  const { t } = useTranslation()
  const { currentUser } = useCurrentUser()
  const roleNav = filterNav(getNavigationForRole(resolveSystemPermission(currentUser)), currentUser)
  const activeHref = resolveActiveNavigation(roleNav, pathname, search)
  const primaryNav = mobilePrimaryNavigation(roleNav)
  const moreActive = !!activeHref && !primaryNav.some(item => item.href === activeHref)
  return <nav data-testid="production-bottom-nav" className="fixed bottom-0 left-0 right-0 z-40 border-t border-[#E4EAF5] bg-white pb-safe text-slate-500 md:hidden" aria-label={t('navMain')}>
    <div className="grid h-16" data-testid="ada-reference-tabs" style={{ gridTemplateColumns: 'repeat(' + (primaryNav.length + 1) + ', minmax(0, 1fr))' }}>
      {primaryNav.map(item => {
        const active = activeHref === item.href
        const Icon = item.icon
        const label = t((item.shortLabelKey ?? item.labelKey ?? item.name.toLowerCase()) as Parameters<typeof t>[0])
        return <Link key={item.href} href={item.href} aria-current={active ? 'page' : undefined} title={label} data-testid={'nav-' + item.name.toLowerCase()} className={cn('flex min-h-11 min-w-0 flex-col items-center justify-center gap-1 px-1 text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-600', active ? 'font-semibold text-[#155EF2]' : 'hover:bg-blue-50')}>
          <Icon aria-hidden="true" className="h-[22px] w-[22px]" /><span className="text-[11px] font-medium leading-tight">{label}</span>
        </Link>
      })}
      <NavigationDrawer items={roleNav} activeHref={activeHref} trigger={<button type="button" data-testid="nav-menu-more" aria-label={t('moreMenu')} className={cn('flex min-h-11 flex-col items-center justify-center gap-1 px-1 text-[11px] font-medium leading-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-600', moreActive ? 'font-semibold text-[#155EF2]' : 'hover:bg-blue-50')}><Menu aria-hidden="true" className="h-[22px] w-[22px]" /><span>{t('moreMenu')}</span></button>} />
    </div>
  </nav>
}
