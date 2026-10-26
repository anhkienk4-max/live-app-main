'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { BarChart3, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/lib/i18n'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'
import { resolveSystemPermission } from '@/lib/permissions'
import { getSharedNavigation, groupNavigation } from '@/lib/ui/role-ux'
import { resolveActiveNavigation } from './shellConfig'
import { AccountMenu } from './AccountMenu'

export function Sidebar() {
  const pathname = usePathname()
  const search = useSearchParams()
  const { t } = useTranslation()
  const { currentUser } = useCurrentUser()
  const permission = resolveSystemPermission(currentUser)
  const navigation = getSharedNavigation()
  const activeHref = resolveActiveNavigation(navigation, pathname, search)
  const [collapsed, setCollapsed] = useState<string[]>([])
  const [preferencesKey, setPreferencesKey] = useState('')
  const storageKey = 'ops.navigation.groups:' + (currentUser?.id ?? '') + ':' + permission
  const activeGroup = navigation.find(item => item.href === activeHref)?.group
  useEffect(() => {
    let value: string[] = []
    try { const parsed: unknown = JSON.parse(localStorage.getItem(storageKey) ?? '[]'); if (Array.isArray(parsed)) value = parsed.filter((id): id is string => typeof id === 'string') } catch { /* Menu preferences are optional. */ }
    const frame = requestAnimationFrame(() => { setCollapsed(value.filter(id => id !== activeGroup)); setPreferencesKey(storageKey) })
    return () => cancelAnimationFrame(frame)
  }, [storageKey, activeGroup, activeHref])
  const toggleGroup = (id: string) => {
    const next = collapsed.includes(id) ? collapsed.filter(value => value !== id) : [...collapsed, id]
    setCollapsed(next)
    try { localStorage.setItem(storageKey, JSON.stringify(next)) } catch { /* Storage can be disabled. */ }
  }
  return (
    <aside data-testid="production-sidebar" className="hidden w-[248px] shrink-0 flex-col bg-[#082743] text-slate-200 lg:flex">
      <div data-testid="production-sidebar-brand" className="flex h-[56px] shrink-0 items-center gap-2.5 border-b border-white/10 px-5">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-blue-600 text-white"><BarChart3 className="h-4 w-4" /></span>
        <div><div className="text-[15px] font-semibold tracking-tight text-white">LiveStream Ops</div></div>
      </div>
      <nav className="min-h-0 flex-1 overflow-y-auto px-3 py-5" style={{ scrollbarWidth: 'thin', scrollbarColor: '#64748b transparent' }} aria-label={t('navMain')}>
        {groupNavigation(navigation).map(group => {
          const expanded = preferencesKey !== storageKey || !collapsed.includes(group.id)
          return <section key={group.id} className="mb-3">
            <button type="button" disabled={preferencesKey !== storageKey} onClick={() => toggleGroup(group.id)} aria-expanded={expanded} aria-controls={'sidebar-group-' + group.id} className="mb-1 flex min-h-11 w-full items-center justify-between gap-2 rounded px-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400">
              <span>{t(group.labelKey)}</span><ChevronDown aria-hidden="true" className={cn('h-3 w-3 shrink-0 transition-transform', !expanded && '-rotate-90')} />
            </button>
            <div id={'sidebar-group-' + group.id} hidden={!expanded}>
            {group.items.map((item) => {
          const active = item.href === activeHref
          const Icon = item.icon
          const label = item.labelKey ? t(item.labelKey as Parameters<typeof t>[0]) : t(item.name.toLowerCase() as Parameters<typeof t>[0]) || item.name
          return <div key={item.name}>
            <Link href={item.href} aria-current={active ? 'page' : undefined} title={label} data-testid={`sidebar-${item.name.toLowerCase().replace(/\s+/g, '-')}`} className={cn('mb-1 flex items-center gap-3 rounded-md px-3 py-2.5 text-[13px] font-medium transition-colors', active ? 'bg-blue-600 text-white' : 'hover:bg-white/10 hover:text-white')}>
              <Icon className="h-4 w-4 shrink-0" aria-hidden="true" /><span className="truncate">{label}</span>
            </Link>
          </div>
            })}
            </div>
          </section>
        })}
      </nav>
      <div data-testid="production-sidebar-profile" className="shrink-0">
        <AccountMenu placement="sidebar" />
      </div>
    </aside>
  )
}
