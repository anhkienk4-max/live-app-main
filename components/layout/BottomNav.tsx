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
  return <nav data-testid="production-bottom-nav" className="fixed bottom-0 left-0 right-0 z-40 border-t border-white/10 bg-[#082743] pb-safe text-slate-200 md:hidden" aria-label={t('navMain')}>
    <div className="grid h-16" style={{ gridTemplateColumns: 'repeat(' + (primaryNav.length + 1) + ', minmax(0, 1fr))' }}>
      {primaryNav.map(item => {
        const active = activeHref === item.href
        const Icon = item.icon
        const label = t((item.shortLabelKey ?? item.labelKey ?? item.name.toLowerCase()) as Parameters<typeof t>[0])
        return <Link key={item.href} href={item.href} aria-current={active ? 'page' : undefined} title={label} data-testid={'nav-' + item.name.toLowerCase()} className={cn('flex min-h-11 min-w-0 flex-col items-center justify-center gap-1 px-1 text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white', active ? 'bg-blue-600 text-white' : 'hover:bg-white/10')}>
          <Icon aria-hidden="true" className="h-5 w-5" /><span className="text-[10px] font-medium leading-tight">{label}</span>
        </Link>
      })}
      <NavigationDrawer items={roleNav} activeHref={activeHref} trigger={<button type="button" data-testid="nav-menu-more" aria-label={t('moreMenu')} className={cn('flex min-h-11 flex-col items-center justify-center gap-1 px-1 text-[10px] font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white', moreActive ? 'bg-blue-600 text-white' : 'hover:bg-white/10')}><Menu aria-hidden="true" className="h-5 w-5" /><span>{t('moreMenu')}</span></button>} />
    </div>
  </nav>
}
