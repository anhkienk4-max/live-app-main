'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { LayoutGrid, Ellipsis, Bell, Settings2, UserRound } from 'lucide-react'
import { useTranslation } from '@/lib/i18n'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'
import { resolveSystemPermission } from '@/lib/permissions'
import { getNavigationForRole, filterNav } from '@/lib/ui/role-ux'
import { useWorkforceCapabilities } from '@/lib/hooks/useWorkforceCapabilities'
import { filterWorkforceNavigation } from '@/lib/ui/workforceNavigation'
import { resolveActiveNavigation } from './shellConfig'

export function BottomNav() {
  const pathname = usePathname()
  const search = useSearchParams()
  const { t } = useTranslation()
  const { currentUser } = useCurrentUser()
  const { capabilities } = useWorkforceCapabilities()
  const [open, setOpen] = useState(false)
  const nav = filterWorkforceNavigation(filterNav(getNavigationForRole(resolveSystemPermission(currentUser)), currentUser), capabilities)
  const activeHref = resolveActiveNavigation(nav, pathname, search)
  const preferred = ['/', '/calendar', '/reports', '/payroll', '/workforce']
  const selected = preferred.map(path => nav.find(item => path === '/' ? item.href === '/' : item.href.split('?')[0] === path)).filter((item): item is typeof nav[number] => Boolean(item)).slice(0, 4)
  const primary = selected
  // Role filters can leave fewer than four shortcuts. Fill one slot with Profile
  // when available and size the grid by rendered items, never by fixed columns.
  const showProfileTab = Boolean(currentUser) && primary.length < 4
  const visibleTabCount = primary.length + (showProfileTab ? 1 : 0) + 1 // + More
  const other = nav.filter(item => !selected.includes(item) && !(showProfileTab && item.href === '/profile'))
  const label = (item: typeof nav[number]) => item.shortLabelKey
    ? t(item.shortLabelKey as Parameters<typeof t>[0])
    : item.labelKey
      ? t(item.labelKey as Parameters<typeof t>[0])
      : item.name

  return (
    <nav data-testid="production-bottom-nav" className="ada-bottom-nav fixed inset-x-0 bottom-0 z-50 border-t border-[#E6EBF8] bg-white/95 text-slate-500 shadow-[0_-5px_20px_rgba(15,32,80,.06)] backdrop-blur-lg lg:hidden" aria-label={t('navMain')}>
      {open && (
        <>
          <button type="button" aria-label="Đóng menu" className="fixed inset-0 z-40 bg-slate-900/20" onClick={() => setOpen(false)} />
          <div data-testid="pwa-more-panel" className="absolute bottom-[calc(74px+env(safe-area-inset-bottom))] left-3 right-3 z-50 max-h-[min(58dvh,490px)] overflow-y-auto rounded-[18px] border border-[#E0E7F8] bg-white p-3 shadow-[0_24px_70px_rgba(9,21,64,.19)]">
            <p className="px-2 pb-2 text-[11px] font-bold uppercase tracking-[.14em] text-slate-400">Tất cả chức năng</p>
            {other.map(item => {
              const Icon = item.icon
              return <Link href={item.href} key={item.name} onClick={() => setOpen(false)} className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-[13px] font-medium text-[#10234B] hover:bg-blue-50">
                <Icon className="h-[18px] w-[18px] text-[#2563EB]" />{label(item)}
              </Link>
            })}
            <div className="my-2 h-px bg-[#EDF1F8]" />
            {[
              { href: '/profile', name: 'Cá nhân', icon: UserRound },
              { href: '/notifications', name: 'Thông báo', icon: Bell },
              { href: '/settings', name: 'Cài đặt', icon: Settings2 },
            ].map(item => {
              const Icon = item.icon
              return <Link href={item.href} key={item.href} onClick={() => setOpen(false)} className="flex min-h-11 items-center gap-3 rounded-xl px-3 text-[13px] font-medium text-[#10234B] hover:bg-blue-50">
                <Icon className="h-[18px] w-[18px] text-[#2563EB]" />{item.name}
              </Link>
            })}
          </div>
        </>
      )}
      <div className="relative z-50 grid h-[64px] w-full min-w-0" style={{ gridTemplateColumns: `repeat(${visibleTabCount}, minmax(0, 1fr))` }} data-testid="ada-reference-tabs">
        {primary.map(item => {
          const Icon = item.icon
          const active = item.href === activeHref || (item.href.split('?')[0] === pathname && item.href !== '/')
          return <Link key={item.name} href={item.href} aria-current={active ? 'page' : undefined} onClick={() => setOpen(false)} className={`flex min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-0.5 focus-visible:outline-2 focus-visible:outline-blue-600 ${active ? 'font-semibold text-[#1359EC]' : 'text-slate-500'}`}>
            <Icon className="h-[20px] w-[20px]" aria-hidden="true" />
            <span className="max-w-full truncate text-[10px]">{label(item)}</span>
          </Link>
        })}
        {showProfileTab && (
          <Link href="/profile" aria-current={pathname === '/profile' ? 'page' : undefined}
            onClick={() => setOpen(false)}
            className={`flex min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-0.5 focus-visible:outline-2 focus-visible:outline-blue-600 ${pathname === '/profile' ? 'font-semibold text-[#1359EC]' : 'text-slate-500'}`}
          >
            <UserRound className="h-[20px] w-[20px]" aria-hidden="true" />
            <span className="max-w-full truncate text-[10px]">{t('profile')}</span>
          </Link>
        )}
        <button data-testid="nav-menu-more" type="button" aria-label={t('moreMenu')} aria-expanded={open} onClick={() => setOpen(value => !value)} className={`flex flex-col items-center justify-center gap-1 rounded-xl px-1 text-[10px] focus-visible:outline-2 focus-visible:outline-blue-600 ${open ? 'text-[#155BEC]' : 'text-slate-500'}`}>
          <Ellipsis className="h-[21px] w-[21px]" aria-hidden="true" />
          <span>Thêm</span>
        </button>
      </div>
      <div style={{ height: 'env(safe-area-inset-bottom)' }} aria-hidden="true" />
    </nav>
  )
}
