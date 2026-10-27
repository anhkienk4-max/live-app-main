'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { MoreHorizontal } from 'lucide-react'
import { AdaBrand } from '@/components/branding/AdaBrand'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/lib/i18n'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'
import { resolveSystemPermission } from '@/lib/permissions'
import { getNavigationForRole, filterNav } from '@/lib/ui/role-ux'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { resolveActiveNavigation } from './shellConfig'
import { useWorkforceCapabilities } from '@/lib/hooks/useWorkforceCapabilities'
import { filterWorkforceNavigation } from '@/lib/ui/workforceNavigation'

export function Sidebar() {
  const pathname = usePathname()
  const search = useSearchParams()
  const { t } = useTranslation()
  const { currentUser } = useCurrentUser()
  const permission = resolveSystemPermission(currentUser)
  const { capabilities } = useWorkforceCapabilities()
  const navigation = filterWorkforceNavigation(filterNav(getNavigationForRole(permission), currentUser), capabilities)
  const activeHref = resolveActiveNavigation(navigation, pathname, search)
  const initials = currentUser?.full_name?.split(' ').filter(Boolean).map(n => n[0]).join('').slice(0, 2).toUpperCase() || currentUser?.email?.[0].toUpperCase() || 'U'
  return (
    <aside data-testid="production-sidebar" className="ada-sidebar hidden w-[248px] shrink-0 flex-col text-slate-200 lg:flex">
      <div data-testid="production-sidebar-brand" className="flex h-[72px] shrink-0 items-center border-b border-white/10 px-5">
        <AdaBrand inverse />
      </div>
      <nav className="min-h-0 flex-1 overflow-y-auto px-3 py-5" aria-label={t('navMain')}>
        {navigation.map((item) => {
          const active = item.href === activeHref
          const Icon = item.icon
          const label = item.labelKey ? t(item.labelKey as Parameters<typeof t>[0]) : t(item.name.toLowerCase() as Parameters<typeof t>[0]) || item.name
          return <div key={item.name}>
            <Link href={item.href} aria-current={active ? 'page' : undefined} title={label} data-testid={`sidebar-${item.name.toLowerCase().replace(/\s+/g, '-')}`} className={cn('mb-1 flex items-center gap-3 rounded-xl px-3 py-2.5 text-[13px] font-medium transition-colors', active ? 'bg-[#2563EB] text-white shadow-[0_7px_18px_rgba(37,99,235,.28)]' : 'text-slate-300 hover:bg-white/10 hover:text-white')}>
              <Icon className="h-4 w-4 shrink-0" aria-hidden="true" /><span className="truncate">{label}</span>
            </Link>
          </div>
        })}
      </nav>
      <div data-testid="production-sidebar-profile" className="flex shrink-0 items-center gap-3 border-t border-white/10 px-4 py-4">
        <Avatar className="h-9 w-9 shrink-0">{currentUser?.avatar_url?.trim() && <AvatarImage src={currentUser.avatar_url} alt={currentUser.full_name || currentUser.email} />}<AvatarFallback className="bg-blue-100 text-[12px] font-bold text-blue-700">{initials}</AvatarFallback></Avatar>
        <div className="min-w-0 flex-1"><div className="truncate text-[13px] font-semibold text-white">{currentUser?.full_name || currentUser?.email || 'User'}</div><div className="truncate text-[11px] capitalize text-slate-400">{permission}</div></div><MoreHorizontal className="h-4 w-4 text-slate-400" aria-hidden="true" />
      </div>
    </aside>
  )
}
