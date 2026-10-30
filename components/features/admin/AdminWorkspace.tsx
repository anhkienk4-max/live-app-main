'use client'

import Link from 'next/link'
import * as React from 'react'
import {
  ArrowRight,
  BookOpenCheck,
  Boxes,
  Building2,
  ClipboardList,
  FileStack,
  Megaphone,
  Search,
  ShieldCheck,
  UserCog,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { useTranslation, type TranslationKey } from '@/lib/i18n'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'

type WorkspaceGroup = 'reference' | 'resources' | 'access'
type WorkspaceItem = {
  id: string
  group: WorkspaceGroup
  title: TranslationKey
  description: TranslationKey
  href?: string
  icon: LucideIcon
  state: 'ready' | 'pending'
}

const items: WorkspaceItem[] = [
  { id: 'brands', group: 'reference', title: 'adminBrandsTitle', description: 'adminBrandsDescription', href: '/brands', icon: Building2, state: 'ready' },
  { id: 'campaigns', group: 'reference', title: 'adminCampaignsTitle', description: 'adminCampaignsDescription', href: '/campaigns', icon: Megaphone, state: 'ready' },
  { id: 'platforms', group: 'reference', title: 'adminPlatformsTitle', description: 'adminPlatformsDescription', href: '/platforms', icon: Boxes, state: 'ready' },
  { id: 'products', group: 'reference', title: 'adminProductsTitle', description: 'adminProductsDescription', href: '/brand-catalog', icon: BookOpenCheck, state: 'ready' },
  { id: 'resources', group: 'resources', title: 'adminResourcesTitle', description: 'adminResourcesDescription', href: '/storage', icon: FileStack, state: 'ready' },
  { id: 'staff', group: 'access', title: 'adminStaffTitle', description: 'adminStaffDescription', href: '/staff', icon: Users, state: 'ready' },
  { id: 'role-defaults', group: 'access', title: 'adminRoleDefaultsTitle', description: 'adminRoleDefaultsDescription', href: '/settings?tab=system', icon: ShieldCheck, state: 'ready' },
  { id: 'account-overrides', group: 'access', title: 'adminAccountOverridesTitle', description: 'adminAccountOverridesDescription', icon: UserCog, state: 'pending' },
  { id: 'audit', group: 'access', title: 'adminAuditTitle', description: 'adminAuditDescription', href: '/audit', icon: ClipboardList, state: 'ready' },
]

const groupTitle: Record<WorkspaceGroup, TranslationKey> = {
  reference: 'adminReferenceGroup',
  resources: 'adminResourcesGroup',
  access: 'adminAccessGroup',
}

export function AdminWorkspace() {
  const { t } = useTranslation()
  const { currentUser, authIdentity, loading } = useCurrentUser()
  const identityKey = `${authIdentity?.auth_user_id ?? ''}:${currentUser?.id ?? ''}:${currentUser?.system_permission ?? ''}`
  const [authorization, setAuthorization] = React.useState<{ state: 'checking' | 'allowed' | 'denied' | 'error'; identityKey: string; retry: number }>({ state: 'checking', identityKey: '', retry: -1 })
  const [search, setSearch] = React.useState('')
  const [group, setGroup] = React.useState<'all' | WorkspaceGroup>('all')
  const [retry, setRetry] = React.useState(0)

  React.useEffect(() => {
    if (loading) return
    const controller = new AbortController()
    void fetch('/api/admin/workspace', { cache: 'no-store', credentials: 'same-origin', signal: controller.signal })
      .then(response => {
        if (response.status === 401 || response.status === 403) {
          setAuthorization({ state: 'denied', identityKey, retry })
          return
        }
        if (!response.ok) throw new Error('ADMIN_WORKSPACE_UNAVAILABLE')
        return response.json().then(result => {
          setAuthorization({ state: result?.ok === true ? 'allowed' : 'denied', identityKey, retry })
        })
      })
      .catch(() => {
        if (!controller.signal.aborted) setAuthorization({ state: 'error', identityKey, retry })
      })
    const handleIdentityChange = () => {
      setRetry(value => value + 1)
    }
    window.addEventListener('livestream-ops-current-user-change', handleIdentityChange)
    return () => {
      controller.abort()
      window.removeEventListener('livestream-ops-current-user-change', handleIdentityChange)
    }
  }, [identityKey, loading, retry])

  const normalizedSearch = search.trim().toLocaleLowerCase()
  const filteredItems = items.filter(item => {
    const matchesGroup = group === 'all' || item.group === group
    const matchesText = !normalizedSearch || `${t(item.title)} ${t(item.description)}`.toLocaleLowerCase().includes(normalizedSearch)
    return matchesGroup && matchesText
  })

  const authorizationState = authorization.identityKey === identityKey && authorization.retry === retry
    ? authorization.state
    : 'checking'
  if (authorizationState !== 'allowed') {
    const denied = authorizationState === 'denied'
    return <main className="mx-auto max-w-6xl space-y-4 p-4 md:p-6" data-testid="admin-workspace-gate">
      <h1 className="text-2xl font-semibold">{t('adminWorkspaceTitle')}</h1>
      {authorizationState === 'checking' ? <p role="status" className="rounded-lg border p-4 text-sm text-muted-foreground">{t('adminCheckingAccess')}</p>
        : denied ? <p role="alert" className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">{t('adminAccessDenied')}</p>
          : <div className="rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-900"><p role="alert">{t('adminAccessError')}</p><Button className="mt-3" variant="outline" onClick={() => setRetry(value => value + 1)}>{t('tryAgain')}</Button></div>}
    </main>
  }

  return <main className="mx-auto max-w-6xl space-y-5 p-4 md:p-6" data-testid="admin-workspace">
    <header className="space-y-2">
      <p className="text-sm font-medium text-blue-700">{t('adminWorkspaceEyebrow')}</p>
      <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{t('adminWorkspaceTitle')}</h1>
      <p className="max-w-3xl text-sm text-muted-foreground">{t('adminWorkspaceDescription')}</p>
    </header>

    <section className="grid gap-3 rounded-xl border bg-slate-50 p-3 sm:grid-cols-[minmax(0,1fr)_220px_auto] sm:items-end" aria-label={t('filters')}>
      <label className="grid gap-1 text-sm font-medium" htmlFor="admin-workspace-search">
        {t('search')}
        <span className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" /><Input id="admin-workspace-search" className="pl-9" value={search} onChange={event => setSearch(event.target.value)} placeholder={t('adminSearchPlaceholder')} /></span>
      </label>
      <label className="grid gap-1 text-sm font-medium" htmlFor="admin-workspace-group">{t('filters')}
        <select id="admin-workspace-group" className="h-10 rounded-md border bg-background px-3 text-sm" value={group} onChange={event => setGroup(event.target.value as typeof group)}>
          <option value="all">{t('all')}</option>
          <option value="reference">{t('adminReferenceGroup')}</option>
          <option value="resources">{t('adminResourcesGroup')}</option>
          <option value="access">{t('adminAccessGroup')}</option>
        </select>
      </label>
      <Button type="button" variant="outline" onClick={() => { setSearch(''); setGroup('all') }}>{t('resetFilters')}</Button>
    </section>

    {filteredItems.length === 0 ? <Card><CardContent className="p-6 text-sm text-muted-foreground" role="status">{t('adminNoResults')}</CardContent></Card>
      : (['reference', 'resources', 'access'] as const).filter(section => group === 'all' || group === section).map(section => {
        const sectionItems = filteredItems.filter(item => item.group === section)
        if (!sectionItems.length) return null
        return <section key={section} className="space-y-3" aria-labelledby={`admin-group-${section}`}>
          <h2 id={`admin-group-${section}`} className="text-base font-semibold">{t(groupTitle[section])}</h2>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {sectionItems.map(item => {
              const Icon = item.icon
              const content = <CardContent className="flex h-full gap-3 p-4 sm:p-5">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-700"><Icon className="h-5 w-5" aria-hidden="true" /></span>
                <span className="min-w-0 flex-1 space-y-1">
                  <span className="flex items-start justify-between gap-2"><span className="font-semibold text-foreground">{t(item.title)}</span>{item.state === 'pending' && <span className="shrink-0 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[11px] text-amber-900">{t('adminDependencyPending')}</span>}</span>
                  <span className="block text-sm leading-5 text-muted-foreground">{t(item.description)}</span>
                  {item.href && <span className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-blue-700">{t('openWorkspace')}<ArrowRight className="h-4 w-4" aria-hidden="true" /></span>}
                </span>
              </CardContent>
              return item.href ? <Link key={item.id} href={item.href} className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600" data-testid={`admin-link-${item.id}`}><Card className="h-full transition-colors hover:border-blue-300 hover:bg-blue-50/40">{content}</Card></Link>
                : <Card key={item.id} className="h-full border-dashed" data-testid={`admin-pending-${item.id}`} aria-disabled="true">{content}</Card>
            })}
          </div>
        </section>
      })}
  </main>
}
