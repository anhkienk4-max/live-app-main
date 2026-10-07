'use client'

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { BarChart3, MoreHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/lib/i18n'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'
import { resolveSystemPermission } from '@/lib/permissions'
import { getNavigationForRole, filterNav } from '@/lib/ui/role-ux'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { resolveActiveNavigation, type ProductionShellVariant } from './shellConfig'

export function Sidebar({ isCollapsed = false, variant = 'ops' }: { isCollapsed?: boolean; variant?: ProductionShellVariant }) {
  const pathname = usePathname()
  const search = useSearchParams()
  const { t } = useTranslation()
  const { currentUser } = useCurrentUser()
  const permission = resolveSystemPermission(currentUser)
  const navigation = filterNav(getNavigationForRole(permission), currentUser)
  const activeHref = resolveActiveNavigation(navigation, pathname, search)
  const light = variant === 'admin' || variant === 'shift-detail'
  const compact = variant === 'live'
  const initials = currentUser?.full_name?.split(' ').filter(Boolean).map(n => n[0]).join('').slice(0, 2).toUpperCase() || currentUser?.email?.[0].toUpperCase() || 'U'
  return (
    <aside data-testid="production-sidebar" className={cn('hidden shrink-0 flex-col lg:flex', isCollapsed ? 'w-[72px]' : compact ? 'w-[230px]' : 'w-[248px]', light ? 'border-r border-slate-200 bg-white text-slate-600' : 'bg-[#082743] text-slate-200')}>
      <div className={cn('flex shrink-0 items-center gap-2.5 border-b px-5', compact ? 'h-[44px]' : 'h-14', light ? 'border-slate-100' : 'border-white/10')}>
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-blue-600 text-white"><BarChart3 className="h-4 w-4" /></span>
        {!isCollapsed && <div><div className={cn('text-[15px] font-semibold tracking-tight', light ? 'text-slate-900' : 'text-white')}>LiveStream Ops</div>{light && <div className="text-[11px] text-slate-500">Admin Center</div>}</div>}
      </div>
      <nav className={cn('min-h-0 flex-1 overflow-y-auto px-3', light || compact ? 'py-3' : 'py-5')} aria-label={t('navMain')}>
        {navigation.map((item, index) => {
          const active = item.href === activeHref
          const Icon = item.icon
          const label = item.labelKey ? t(item.labelKey as Parameters<typeof t>[0]) : t(item.name.toLowerCase() as Parameters<typeof t>[0]) || item.name
          const first = index === 0 || navigation[index - 1].group !== item.group
          return <div key={item.name}>
            {light && first && item.group && !isCollapsed && <div className="px-3 pb-1 pt-3 text-[11px] font-semibold tracking-wide text-slate-400">{item.group}</div>}
            <Link href={item.href} aria-current={active ? 'page' : undefined} title={label} data-testid={`sidebar-${item.name.toLowerCase().replace(/\s+/g, '-')}`} className={cn('mb-1 flex items-center gap-3 rounded-md px-3 font-medium transition-colors', light || compact ? 'py-1.5 text-[12px]' : 'py-2.5 text-[13px]', isCollapsed && 'justify-center px-0', active ? light ? 'bg-blue-50 text-blue-600' : 'bg-blue-600 text-white' : light ? 'hover:bg-slate-50 hover:text-blue-600' : 'hover:bg-white/10 hover:text-white')}>
              <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />{!isCollapsed && <span className="truncate">{label}</span>}
            </Link>
          </div>
        })}
      </nav>
      <div className={cn('flex shrink-0 items-center gap-3 border-t px-4 py-4', light ? 'border-slate-100' : 'border-white/10')}>
        <Avatar className="h-9 w-9 shrink-0">{currentUser?.avatar_url?.trim() && <AvatarImage src={currentUser.avatar_url} alt={currentUser.full_name || currentUser.email} />}<AvatarFallback className="bg-blue-100 text-[12px] font-bold text-blue-700">{initials}</AvatarFallback></Avatar>
        {!isCollapsed && <><div className="min-w-0 flex-1"><div className={cn('truncate text-[13px] font-semibold', light ? 'text-slate-900' : 'text-white')}>{currentUser?.full_name || currentUser?.email || 'User'}</div><div className="truncate text-[11px] capitalize text-slate-400">{permission}</div></div><MoreHorizontal className="h-4 w-4 text-slate-400" aria-hidden="true" /></>}
      </div>
    </aside>
  )
}
