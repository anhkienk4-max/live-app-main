'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useTranslation } from '@/lib/i18n'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'
import { resolveSystemPermission } from '@/lib/permissions'

type Scope = { brandId?: string; campaignId?: string; platformId?: string }
type Resource = {
  id: string
  title: string
  canonical_url: string
  provider: 'google_drive' | 'onedrive'
  resource_type: string
  verification_status: string
  is_active: boolean
  storage_resource_scopes?: Array<Record<string, unknown>>
}
type ResourceLoad = { key: string; status: 'ready' | 'error'; resources: Resource[] }

export function ScopedResourceLinks({ open, scope }: { open: boolean; scope: Scope; canManage?: boolean }) {
  const { language } = useTranslation()
  const { currentUser } = useCurrentUser()
  const isAdmin = resolveSystemPermission(currentUser) === 'admin'
  const tr = (vi: string, en: string) => language === 'vi' ? vi : en
  const [resourceLoad, setResourceLoad] = useState<ResourceLoad | null>(null)
  const scopeKey = `${scope.brandId ?? ''}:${scope.campaignId ?? ''}:${scope.platformId ?? ''}`
  const loading = open && resourceLoad?.key !== scopeKey
  const failed = open && resourceLoad?.key === scopeKey && resourceLoad.status === 'error'
  const resources = resourceLoad?.key === scopeKey ? resourceLoad.resources : []

  useEffect(() => {
    if (!open) return
    let active = true
    fetch('/api/storage-resources', { cache: 'no-store' }).then(async response => {
      const body = await response.json()
      if (!response.ok || body?.ok !== true || !Array.isArray(body.resources)) throw new Error('resource_registry_unavailable')
      const matches = (resource: Resource) => (resource.storage_resource_scopes ?? []).some(item =>
        (!scope.brandId || item.brand_id === scope.brandId)
        && (!scope.campaignId || item.campaign_id === scope.campaignId)
        && (!scope.platformId || item.platform_id === scope.platformId),
      )
      if (active) setResourceLoad({
        key: scopeKey,
        status: 'ready',
        resources: (body.resources as Resource[]).filter(resource => resource.resource_type !== 'attendance_evidence' && matches(resource)),
      })
    }).catch(() => {
      if (active) setResourceLoad({ key: scopeKey, status: 'error', resources: [] })
    })
    return () => { active = false }
  }, [open, scope.brandId, scope.campaignId, scope.platformId, scopeKey])

  const params = new URLSearchParams()
  if (scope.brandId) params.set('brand_id', scope.brandId)
  if (scope.campaignId) params.set('campaign_id', scope.campaignId)
  if (scope.platformId) params.set('platform_id', scope.platformId)
  const query = params.toString()
  const registryHref = `/storage/resources${query ? `?${query}` : ''}`

  return (
    <section className="space-y-3 rounded-xl border bg-card p-4" aria-label={tr('Tài liệu và liên kết', 'Resources and links')}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-semibold">{tr('Tài liệu và liên kết', 'Resources and links')}</h3>
          <p className="text-xs text-muted-foreground">{tr('Các link dùng tiêu đề riêng; quyền truy cập vẫn do tài khoản nguồn và registry quyết định.', 'Links use custom titles; access remains controlled by the provider account and registry.')}</p>
        </div>
        {isAdmin && <Link href={registryHref} className="rounded-md border px-3 py-2 text-sm">{tr('Thêm tài liệu / link', 'Add resource / link')}</Link>}
      </div>
      {loading && <p role="status" className="text-sm text-muted-foreground">{tr('Đang tải tài nguyên…', 'Loading resources…')}</p>}
      {failed && <p role="status" className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">{tr('Chưa thể tải registry tài nguyên. Kiểm tra cấu hình schema và quyền truy cập; không hiển thị dữ liệu thay thế.', 'The resource registry is unavailable. Check schema configuration and authorization; no fallback data is shown.')}</p>}
      {!loading && !failed && resources.length === 0 && <p className="rounded-md border border-dashed p-3 text-sm text-muted-foreground">{tr('Chưa có link nào trong phạm vi này.', 'No links are registered for this scope yet.')}</p>}
      {!loading && !failed && resources.length > 0 && <ul className="grid gap-2 sm:grid-cols-2">
        {resources.map(resource => <li key={resource.id} className="flex min-w-0 items-start justify-between gap-3 rounded-md border p-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{resource.title}</p>
            <p className="text-xs text-muted-foreground">{resource.provider === 'google_drive' ? 'Google Drive' : 'OneDrive'} · {resource.resource_type}</p>
            <p className="text-xs text-muted-foreground">{!resource.is_active ? tr('Đã vô hiệu hóa', 'Inactive') : resource.verification_status === 'broken' ? tr('Link nguồn bị lỗi', 'Source link is broken') : resource.verification_status === 'verified_metadata' ? tr('Đã xác minh metadata', 'Metadata verified') : tr('Chưa xác minh', 'Unverified')}</p>
          </div>
          <a className="shrink-0 text-sm underline" href={resource.canonical_url} target="_blank" rel="noopener noreferrer">{tr('Mở link', 'Open link')}</a>
        </li>)}
      </ul>}
    </section>
  )
}
