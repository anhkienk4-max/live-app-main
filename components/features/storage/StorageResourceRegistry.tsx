'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'
import { resolveSystemPermission } from '@/lib/permissions'
import { useTranslation } from '@/lib/i18n'

type Resource = {
  id: string; provider: 'google_drive' | 'onedrive'; canonical_id: string; canonical_url: string
  title: string; resource_type: string; visibility: string; verification_status: string
  is_active: boolean; owner_id: string; storage_resource_scopes?: Array<Record<string, unknown>>
}

const resourceTypes = ['root_folder', 'google_sheet', 'report_data', 'product_document', 'sku_document', 'kv', 'image', 'livecut', 'marketing_asset', 'campaign_scheme', 'script', 'guideline', 'contract', 'acceptance', 'attendance_evidence', 'other']
const resourceTypeLabels: Record<string, [string, string]> = {
  root_folder: ['Thư mục gốc', 'Root folder'], google_sheet: ['Google Sheets', 'Google Sheets'],
  report_data: ['Dữ liệu báo cáo', 'Report data'], product_document: ['Tài liệu sản phẩm', 'Product document'],
  sku_document: ['Tài liệu SKU', 'SKU document'], kv: ['KV', 'Key visual'], image: ['Hình ảnh', 'Image'],
  livecut: ['Livecut', 'Livecut'], marketing_asset: ['Tài nguyên marketing', 'Marketing asset'],
  campaign_scheme: ['Đề án chiến dịch', 'Campaign scheme'], script: ['Kịch bản', 'Script'],
  guideline: ['Hướng dẫn', 'Guideline'], contract: ['Hợp đồng', 'Contract'],
  acceptance: ['Nghiệm thu', 'Acceptance document'], attendance_evidence: ['Minh chứng chấm công riêng tư', 'Private attendance evidence'],
  other: ['Khác', 'Other'],
}

export function StorageResourceRegistry() {
  const searchParams = useSearchParams()
  const brandParam = searchParams.get('brand_id') ?? ''
  const campaignParam = searchParams.get('campaign_id') ?? ''
  const platformParam = searchParams.get('platform_id') ?? ''
  const { currentUser } = useCurrentUser()
  const { language } = useTranslation()
  const tr = useCallback((vi: string, en: string) => language === 'vi' ? vi : en, [language])
  const resourceTypeName = (type: string) => resourceTypeLabels[type]?.[language === 'vi' ? 0 : 1] ?? type
  const visibilityName = (visibility: string) => ({ admin_only: tr('Chỉ Admin', 'Admins only'), owner_only: tr('Chỉ chủ sở hữu', 'Owner only'), granted_users: tr('Người dùng được cấp quyền', 'Explicit user grants') }[visibility] ?? visibility)
  const verificationName = (status: string) => ({ verified_metadata: tr('Metadata đã xác minh', 'Metadata verified'), unverified: tr('Chưa xác minh', 'Unverified'), broken: tr('Nguồn không khả dụng', 'Source unavailable'), pending: tr('Đang chờ xác minh', 'Verification pending') }[status] ?? status)
  const isAdmin = resolveSystemPermission(currentUser) === 'admin'
  const [resources, setResources] = useState<Resource[]>([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [messageIsError, setMessageIsError] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)
  const [duplicate, setDuplicate] = useState<{ id: string; scope?: Record<string, unknown> } | null>(null)
  const [filters, setFilters] = useState({ brand: '', campaign: '', platform: '', type: '', provider: '' })
  const [form, setForm] = useState({ provider: 'google_drive', canonical_id: '', canonical_url: '', title: '', resource_type: 'root_folder', visibility: 'admin_only', owner_id: '', brand_id: '', campaign_id: '', platform_id: '', client_group_key: '', sku_key: '', shift_id: '', staff_id: '', year: '', month: '' })

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setFilters(current => ({ ...current, brand: brandParam, campaign: campaignParam, platform: platformParam }))
      setForm(current => ({ ...current, brand_id: brandParam, campaign_id: campaignParam, platform_id: platformParam }))
    })
    return () => cancelAnimationFrame(frame)
  }, [brandParam, campaignParam, platformParam])

  const refresh = useCallback(async () => {
    const response = await fetch('/api/storage-resources', { cache: 'no-store' })
    const body = await response.json()
    if (!response.ok || body?.ok !== true) {
      setLoadFailed(true)
      throw new Error(tr('Không tải được danh mục tài nguyên.', 'Could not load the resource registry.'))
    }
    setResources(body.resources)
    setLoadFailed(false)
  }, [tr])
  useEffect(() => {
    let active = true
    fetch('/api/storage-resources', { cache: 'no-store' }).then(async response => {
      const body = await response.json()
      if (!response.ok || body?.ok !== true) throw new Error(tr('Không tải được danh mục tài nguyên.', 'Could not load the resource registry.'))
      if (active) setResources(body.resources)
    }).catch(error => {
      if (active) {
        setLoadFailed(true)
        setMessageIsError(true)
        setMessage(error instanceof Error ? error.message : tr('Không tải được danh mục tài nguyên.', 'Could not load the resource registry.'))
      }
    })
    return () => { active = false }
  }, [tr])

  const visible = useMemo(() => resources.filter(resource => {
    const scopes = resource.storage_resource_scopes ?? []
    const matches = (key: string, value: string) => !value || scopes.some(scope => String(scope[key] ?? '').toLowerCase().includes(value.toLowerCase()))
    return (!filters.type || resource.resource_type === filters.type)
      && (!filters.provider || resource.provider === filters.provider)
      && matches('brand_id', filters.brand) && matches('campaign_id', filters.campaign) && matches('platform_id', filters.platform)
  }), [resources, filters])

  async function send(action: Record<string, unknown>) {
    setBusy(true); setMessage(''); setMessageIsError(false)
    try {
      const response = await fetch('/api/storage-resources', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(action) })
      const body = await response.json()
      if (!response.ok || body?.ok !== true) {
        if (body.error === 'RESOURCE_DUPLICATE') setDuplicate({ id: body.resource_id, ...(action.scope ? { scope: action.scope as Record<string, unknown> } : {}) })
        throw new Error(body.error === 'RESOURCE_DUPLICATE'
          ? tr('Liên kết này đã có trong danh mục. Có thể gắn thêm phạm vi phù hợp.', 'This link is already in the registry. You can attach another applicable scope.')
          : tr('Không thể lưu thay đổi. Hãy kiểm tra quyền và trạng thái cấu hình.', 'Could not save the change. Check authorization and configuration status.'))
      }
      setMessage(body.warning ?? body.note ?? tr('Đã lưu.', 'Saved.'))
      setDuplicate(null)
      await refresh()
      return body
    } catch (error) {
      setMessageIsError(true)
      setMessage(error instanceof Error ? error.message : tr('Không thể hoàn tất yêu cầu.', 'The request could not be completed.'))
    }
    finally { setBusy(false) }
  }

  async function createResource(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const scope: Record<string, unknown> = Object.fromEntries([['brand_id', form.brand_id], ['campaign_id', form.campaign_id], ['platform_id', form.platform_id], ['client_group_key', form.client_group_key], ['sku_key', form.sku_key], ['shift_id', form.shift_id], ['staff_id', form.staff_id]].filter(([, value]) => value))
    if (form.year) scope.year = Number(form.year)
    if (form.month) scope.month = Number(form.month)
    const result = await send({ action: 'create', provider: form.provider, canonical_id: form.canonical_id, canonical_url: form.canonical_url, title: form.title, resource_type: form.resource_type, visibility: form.visibility, ...(form.owner_id ? { owner_id: form.owner_id } : {}), ...(Object.keys(scope).length ? { scope } : {}) })
    if (result?.ok) setForm(current => ({ ...current, canonical_id: '', canonical_url: '', title: '', owner_id: '' }))
  }

  return <main className="mx-auto max-w-7xl space-y-5 p-4 md:p-6">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-2xl font-semibold">{tr('Tài liệu và liên kết', 'Resources and links')}</h1><p className="text-sm text-muted-foreground">{tr('Quản lý liên kết metadata theo phạm vi. Kiểm tra xác minh tích hợp phía máy chủ, không thay thế quyền truy cập của bạn.', 'Manage metadata links by scope. Verification checks server integration and does not grant you provider access.')}</p></div>
      <Link className="rounded-md border px-3 py-2 text-sm" href="/storage">{tr('Kho file vận hành', 'Operational files')}</Link>
    </header>
    {message && <p role={messageIsError ? 'alert' : 'status'} className="rounded border p-3 text-sm">{message}</p>}
    {duplicate && <div className="flex flex-wrap items-center gap-3 rounded border p-3 text-sm"><span>{tr('Tài nguyên đã có trong danh mục.', 'This resource already exists in the registry.')}</span>{duplicate.scope && <button className="rounded border px-3 py-1" onClick={() => send({ action: 'attach_scope', resource_id: duplicate.id, scope: duplicate.scope })}>{tr('Gắn phạm vi hiện tại', 'Attach current scope')}</button>}<button className="rounded border px-3 py-1" onClick={() => setDuplicate(null)}>{tr('Đóng', 'Close')}</button></div>}
    {(filters.brand || filters.campaign || filters.platform) && <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-primary/30 bg-primary/5 p-3 text-sm"><span>{tr('Đang mở tài nguyên trong phạm vi', 'Resources opened for scope')}: {[filters.brand && `${tr('Thương hiệu', 'Brand')} ${filters.brand}`, filters.campaign && `${tr('Chiến dịch', 'Campaign')} ${filters.campaign}`, filters.platform && `${tr('Nền tảng', 'Platform')} ${filters.platform}`].filter(Boolean).join(' · ')}</span><button className="rounded border px-3 py-1" type="button" onClick={() => { setFilters(current => ({ ...current, brand: '', campaign: '', platform: '' })); setForm(current => ({ ...current, brand_id: '', campaign_id: '', platform_id: '' })) }}>{tr('Xóa phạm vi', 'Clear scope')}</button></div>}
    <section aria-label={tr('Bộ lọc tài nguyên', 'Resource filters')} className="grid gap-3 rounded-lg border p-4 sm:grid-cols-2 lg:grid-cols-5">
      <input aria-label={tr('Lọc thương hiệu', 'Filter Brand')} className="rounded border px-3 py-2" placeholder={tr('Mã thương hiệu', 'Brand ID')} value={filters.brand} onChange={e => setFilters({ ...filters, brand: e.target.value })} />
      <input aria-label={tr('Lọc chiến dịch', 'Filter Campaign')} className="rounded border px-3 py-2" placeholder={tr('Mã chiến dịch', 'Campaign ID')} value={filters.campaign} onChange={e => setFilters({ ...filters, campaign: e.target.value })} />
      <input aria-label={tr('Lọc nền tảng', 'Filter Platform')} className="rounded border px-3 py-2" placeholder={tr('Mã nền tảng', 'Platform ID')} value={filters.platform} onChange={e => setFilters({ ...filters, platform: e.target.value })} />
      <select aria-label={tr('Lọc loại tài nguyên', 'Filter resource type')} className="rounded border px-3 py-2" value={filters.type} onChange={e => setFilters({ ...filters, type: e.target.value })}><option value="">{tr('Tất cả loại', 'All types')}</option>{resourceTypes.map(type => <option key={type} value={type}>{resourceTypeName(type)}</option>)}</select>
      <select aria-label={tr('Lọc nhà cung cấp', 'Filter provider')} className="rounded border px-3 py-2" value={filters.provider} onChange={e => setFilters({ ...filters, provider: e.target.value })}><option value="">{tr('Tất cả nguồn', 'All providers')}</option><option value="google_drive">Google Drive</option><option value="onedrive">OneDrive</option></select>
    </section>
    {isAdmin && <form onSubmit={createResource} className="grid gap-3 rounded-lg border p-4 sm:grid-cols-2 lg:grid-cols-4">
      <h2 className="text-lg font-medium sm:col-span-2 lg:col-span-4">{tr('Thêm liên kết tài nguyên có sẵn', 'Add an existing resource link')}</h2>
      <input required aria-label={tr('Tên hiển thị', 'Display title')} placeholder={tr('Tên hiển thị', 'Display title')} className="rounded border px-3 py-2" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
      <select aria-label={tr('Nhà cung cấp', 'Provider')} className="rounded border px-3 py-2" value={form.provider} onChange={e => setForm({ ...form, provider: e.target.value })}><option value="google_drive">Google Drive</option><option value="onedrive">OneDrive</option></select>
      <input required aria-label={tr('ID chuẩn của nhà cung cấp', 'Canonical provider ID')} placeholder={tr('ID chuẩn của nhà cung cấp', 'Canonical provider ID')} className="rounded border px-3 py-2" value={form.canonical_id} onChange={e => setForm({ ...form, canonical_id: e.target.value })} />
      <input required type="url" aria-label={tr('URL chuẩn của nhà cung cấp', 'Canonical provider URL')} placeholder={tr('URL chuẩn của nhà cung cấp', 'Canonical provider URL')} className="rounded border px-3 py-2" value={form.canonical_url} onChange={e => setForm({ ...form, canonical_url: e.target.value })} />
      <select aria-label={tr('Loại tài nguyên', 'Resource type')} className="rounded border px-3 py-2" value={form.resource_type} onChange={e => setForm({ ...form, resource_type: e.target.value, ...(e.target.value === 'attendance_evidence' ? { visibility: 'owner_only', brand_id: '', campaign_id: '', client_group_key: '' } : {}) })}>{resourceTypes.map(type => <option key={type} value={type}>{resourceTypeName(type)}</option>)}</select>
      <select aria-label={tr('Phạm vi xem', 'Visibility')} className="rounded border px-3 py-2" value={form.visibility} onChange={e => setForm({ ...form, visibility: e.target.value })}><option value="admin_only">{tr('Chỉ Admin', 'Admins only')}</option><option value="owner_only">{tr('Chỉ chủ sở hữu', 'Owner only')}</option><option value="granted_users">{tr('Người dùng được cấp quyền', 'Explicit user grants')}</option></select>
      <input aria-label={tr('Mã người dùng nghiệp vụ sở hữu', 'Owner business user ID')} placeholder={tr('Mã người dùng sở hữu (mặc định là bạn)', 'Owner ID (defaults to you)')} className="rounded border px-3 py-2" value={form.owner_id} onChange={e => setForm({ ...form, owner_id: e.target.value })} />
      <input aria-label={tr('Mã thương hiệu', 'Brand ID')} placeholder={tr('Mã thương hiệu (không bắt buộc)', 'Brand ID (optional)')} className="rounded border px-3 py-2" value={form.brand_id} onChange={e => setForm({ ...form, brand_id: e.target.value })} />
      <input aria-label={tr('Mã chiến dịch', 'Campaign ID')} placeholder={tr('Mã chiến dịch (không bắt buộc)', 'Campaign ID (optional)')} className="rounded border px-3 py-2" value={form.campaign_id} onChange={e => setForm({ ...form, campaign_id: e.target.value })} />
      <input aria-label={tr('Mã nền tảng', 'Platform ID')} placeholder={tr('Mã nền tảng (không bắt buộc)', 'Platform ID (optional)')} className="rounded border px-3 py-2" value={form.platform_id} onChange={e => setForm({ ...form, platform_id: e.target.value })} />
      <input aria-label="Client Group key" placeholder={tr('Mã Client Group', 'Client Group key')} className="rounded border px-3 py-2" value={form.client_group_key} onChange={e => setForm({ ...form, client_group_key: e.target.value })} />
      <input aria-label="SKU key" placeholder={tr('Mã SKU', 'SKU key')} className="rounded border px-3 py-2" value={form.sku_key} onChange={e => setForm({ ...form, sku_key: e.target.value })} />
      <input aria-label={tr('Mã ca trực', 'Shift ID')} placeholder={tr('Mã ca trực', 'Shift ID')} className="rounded border px-3 py-2" value={form.shift_id} onChange={e => setForm({ ...form, shift_id: e.target.value })} />
      <input aria-label={tr('Mã nhân sự', 'Staff ID')} placeholder={tr('Mã nhân sự', 'Staff ID')} className="rounded border px-3 py-2" value={form.staff_id} onChange={e => setForm({ ...form, staff_id: e.target.value })} />
      <input aria-label={tr('Năm', 'Year')} type="number" placeholder={tr('Năm', 'Year')} className="rounded border px-3 py-2" value={form.year} onChange={e => setForm({ ...form, year: e.target.value })} />
      <input aria-label={tr('Tháng', 'Month')} type="number" min="1" max="12" placeholder={tr('Tháng', 'Month')} className="rounded border px-3 py-2" value={form.month} onChange={e => setForm({ ...form, month: e.target.value })} />
      <button disabled={busy} className="rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50">{tr('Thêm liên kết', 'Add link metadata')}</button>
      <p className="text-xs text-muted-foreground sm:col-span-2 lg:col-span-4">{tr('Chỉ lưu liên kết metadata; thao tác này không tạo thư mục Drive/OneDrive. Gắn phạm vi không tự cấp quyền registry hoặc quyền truy cập nhà cung cấp.', 'Only link metadata is saved; this does not create a Drive/OneDrive folder. Scope associations do not grant registry or provider access.')}</p>
    </form>}
    <section aria-label="Resources" className="grid gap-3 md:grid-cols-2">
      {visible.map(resource => <article key={resource.id} className="space-y-3 rounded-lg border p-4">
        <div className="flex items-start justify-between gap-3"><div><h2 className="font-medium">{resource.title}</h2><p className="text-xs text-muted-foreground">{resource.provider === 'google_drive' ? 'Google Drive' : 'OneDrive'} · {resourceTypeName(resource.resource_type)} · {visibilityName(resource.visibility)}</p></div><span className={`rounded-full border px-2 py-1 text-xs ${resource.verification_status === 'broken' ? 'border-red-500 text-red-700' : ''}`}>{resource.is_active ? verificationName(resource.verification_status) : tr('Đã vô hiệu hóa', 'Inactive')}</span></div>
        <p className="break-all text-xs">ID: {resource.canonical_id}</p>
        <p className="text-xs text-muted-foreground">{tr('Chủ sở hữu', 'Owner')}: {resource.owner_id} · {tr('Phạm vi', 'Scopes')}: {(resource.storage_resource_scopes ?? []).map(scope => [scope.brand_id, scope.campaign_id, scope.platform_id, scope.sku_key, scope.year, scope.month].filter(Boolean).join(' / ')).filter(Boolean).join(', ') || '—'}</p>
        <a className="text-sm underline" href={resource.canonical_url} target="_blank" rel="noopener noreferrer">{tr('Mở tài nguyên nguồn', 'Open provider resource')}</a>
        {isAdmin && <div className="flex flex-wrap gap-2">
          <button disabled={busy} className="rounded border px-3 py-1 text-sm" onClick={() => send({ action: 'verify', resource_id: resource.id })}>{tr('Kiểm tra metadata nguồn', 'Check provider metadata')}</button>
          <button disabled={busy} className="rounded border px-3 py-1 text-sm" onClick={() => send({ action: 'update', id: resource.id, is_active: !resource.is_active })}>{resource.is_active ? tr('Vô hiệu hóa', 'Deactivate') : tr('Khôi phục', 'Restore')}</button>
          <button disabled={busy} className="rounded border px-3 py-1 text-sm" onClick={() => { const title = window.prompt(tr('Tên hiển thị', 'Display title'), resource.title); if (title?.trim()) send({ action: 'update', id: resource.id, title: title.trim() }) }}>{tr('Đổi tên', 'Rename')}</button>
          <button disabled={busy} className="rounded border px-3 py-1 text-sm" onClick={() => { const canonical_id = window.prompt(tr('ID chuẩn của nhà cung cấp', 'Canonical provider ID'), resource.canonical_id); if (!canonical_id?.trim()) return; const canonical_url = window.prompt(tr('URL chuẩn của nhà cung cấp', 'Canonical provider URL'), resource.canonical_url); if (canonical_url?.trim()) send({ action: 'update', id: resource.id, canonical_id: canonical_id.trim(), canonical_url: canonical_url.trim() }) }}>{tr('Sửa liên kết', 'Edit link')}</button>
          <button disabled={busy} className="rounded border px-3 py-1 text-sm" onClick={() => { const brand_id = window.prompt(tr('Mã thương hiệu (không bắt buộc)', 'Brand ID (optional)')); if (brand_id === null) return; const campaign_id = window.prompt(tr('Mã chiến dịch (không bắt buộc)', 'Campaign ID (optional)')); if (campaign_id === null) return; const platform_id = window.prompt(tr('Mã nền tảng (không bắt buộc)', 'Platform ID (optional)')); if (platform_id === null) return; const sku_key = window.prompt(tr('Mã SKU (không bắt buộc)', 'SKU key (optional)')); if (sku_key === null) return; const scope = Object.fromEntries([['brand_id', brand_id], ['campaign_id', campaign_id], ['platform_id', platform_id], ['sku_key', sku_key]].filter(([, value]) => value.trim())); send({ action: 'attach_scope', resource_id: resource.id, scope }) }}>{tr('Gắn phạm vi', 'Attach scope')}</button>
          <button disabled={busy} className="rounded border px-3 py-1 text-sm" onClick={() => { const user_id = window.prompt(tr('Mã người dùng nghiệp vụ được cấp quyền', 'Business user ID to grant access')); if (user_id?.trim()) send({ action: 'grant', resource_id: resource.id, user_id: user_id.trim(), active: true }) }}>{tr('Cấp quyền xem', 'Grant user visibility')}</button>
          {resource.visibility === 'granted_users' && <button disabled={busy} className="rounded border px-3 py-1 text-sm" onClick={() => { const user_id = window.prompt(tr('Mã người dùng nghiệp vụ cần thu hồi quyền', 'Business user ID to revoke')); if (user_id?.trim()) send({ action: 'grant', resource_id: resource.id, user_id: user_id.trim(), active: false }) }}>{tr('Thu hồi quyền xem', 'Revoke user visibility')}</button>}
        </div>}
      </article>)}
      {!visible.length && !loadFailed && <p className="rounded border p-6 text-sm text-muted-foreground">{tr('Không có tài nguyên phù hợp với bộ lọc.', 'No resources match these filters.')}</p>}
    </section>
  </main>
}
