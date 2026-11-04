'use client'

import { useRef, type ReactElement } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { groupNavigation, type NavItem } from '@/lib/ui/role-ux'
import { useTranslation } from '@/lib/i18n'
import { cn } from '@/lib/utils'

export function NavigationDrawer({ items, activeHref, trigger, menuId = 'mobile' }: { items: NavItem[]; activeHref?: string; trigger: ReactElement; menuId?: 'mobile' | 'tablet' }) {
  const search = useSearchParams()
  const pushed = useRef(false)
  const open = search.get('nav_menu') === menuId
  const { t } = useTranslation()
  const removeMarker = () => {
    const url = new URL(window.location.href)
    url.searchParams.delete('nav_menu')
    window.history.replaceState(null, '', url)
    pushed.current = false
  }
  const changeOpen = (next: boolean) => {
    if (next) {
      const url = new URL(window.location.href)
      url.searchParams.set('nav_menu', menuId)
      window.history.pushState(null, '', url)
      pushed.current = true
    } else if (pushed.current) {
      pushed.current = false
      window.history.back()
    } else removeMarker()
  }
  return <Dialog open={open} onOpenChange={changeOpen}>
    <DialogTrigger render={trigger} />
    <DialogContent data-testid="grouped-navigation-drawer" className="top-0 right-0 bottom-0 left-auto flex h-dvh max-h-dvh w-[min(24rem,100vw)] max-w-full translate-x-0 translate-y-0 flex-col gap-4 overflow-y-auto rounded-none sm:h-dvh sm:max-h-dvh sm:w-96 sm:max-w-full">
      <DialogHeader><DialogTitle>{t('navMain')}</DialogTitle></DialogHeader>
      <nav aria-label={t('navMain')} className="space-y-5 pb-6">
        {groupNavigation(items).map(group => <section key={group.id} aria-label={t(group.labelKey)}>
          <h2 className="mb-2 px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t(group.labelKey)}</h2>
          {group.items.map(item => {
            const Icon = item.icon
            const label = t((item.labelKey ?? item.name.toLowerCase()) as Parameters<typeof t>[0])
            const active = item.href === activeHref
            return <Link key={item.href} href={item.href} onClick={removeMarker} aria-current={active ? 'page' : undefined} className={cn('flex min-h-11 items-center gap-3 rounded-md px-3 py-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', active ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')}>
              <Icon aria-hidden="true" className="h-5 w-5 shrink-0" /><span className="min-w-0 break-words">{label}</span>
            </Link>
          })}
        </section>)}
      </nav>
    </DialogContent>
  </Dialog>
}
