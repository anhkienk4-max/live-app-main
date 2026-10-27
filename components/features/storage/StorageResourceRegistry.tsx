'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'
import { resolveSystemPermission } from '@/lib/permissions'

type Resource = {
  id: string; provider: 'google_drive' | 'onedrive'; canonical_id: string; canonical_url: string
  title: string; resource_type: string; visibility: string; verification_status: string
  is_active: boolean; owner_id: string; storage_resource_scopes?: Array<Record<string, unknown>>
}

const resourceTypes = ['root_folder', 'google_sheet', 'report_data', 'product_document', 'sku_document', 'kv', 'image', 'livecut', 'marketing_asset', 'campaign_scheme', 'script', 'guideline', 'contract', 'acceptance', 'attendance_evidence', 'other']

export function StorageResourceRegistry() {
  const { currentUser } = useCurrentUser()
  const isAdmin = resolveSystemPermission(currentUser) === 'admin'
  const [resources, setResources] = useState<Resource[]>([])
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [messageIsError, setMessageIsError] = useState(false)
  const [loadFailed, setLoadFailed] = useState(false)
  const [duplicate, setDuplicate] = useState<{ id: string; scope?: Record<string, unknown> } | null>(null)
  const [filters, setFilters] = useState({ brand: '', campaign: '', platform: '', type: '', provider: '' })
  const [form, setForm] = useState({ provider: 'google_drive', canonical_id: '', canonical_url: '', title: '', resource_type: 'root_folder', visibility: 'admin_only', owner_id: '', brand_id: '', campaign_id: '', platform_id: '', client_group_key: '', sku_key: '', shift_id: '', staff_id: '', year: '', month: '' })

  const refresh = useCallback(async () => {
    const response = await fetch('/api/storage-resources', { cache: 'no-store' })
    const body = await response.json()
    if (!response.ok || body?.ok !== true) {
      setLoadFailed(true)
      throw new Error(body.error ?? 'Could not load resources')
    }
    setResources(body.resources)
    setLoadFailed(false)
  }, [])
  useEffect(() => {
    let active = true
    fetch('/api/storage-resources', { cache: 'no-store' }).then(async response => {
      const body = await response.json()
      if (!response.ok || body?.ok !== true) throw new Error(body.error ?? 'Could not load resources')
      if (active) setResources(body.resources)
    }).catch(error => {
      if (active) {
        setLoadFailed(true)
        setMessageIsError(true)
        setMessage(error instanceof Error ? error.message : 'Could not load resources')
      }
    })
    return () => { active = false }
  }, [])

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
        throw new Error(body.error === 'RESOURCE_DUPLICATE' ? `This provider object is already registered (${body.resource_id}).` : body.error ?? 'Request failed')
      }
      setMessage(body.warning ?? body.note ?? 'Saved')
      setDuplicate(null)
      await refresh()
      return body
    } catch (error) {
      setMessageIsError(true)
      setMessage(error instanceof Error ? error.message : 'Request failed')
    }
    finally { setBusy(false) }
  }

  async function createResource(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const scope: Record<string, unknown> = Object.fromEntries([['brand_id', form.brand_id], ['campaign_id', form.campaign_id], ['platform_id', form.platform_id], ['client_group_key', form.client_group_key], ['sku_key', form.sku_key], ['shift_id', form.shift_id], ['staff_id', form.staff_id]].filter(([, value]) => value))
    if (form.year) scope.year = Number(form.year)
    if (form.month) scope.month = Number(form.month)
    await send({ action: 'create', provider: form.provider, canonical_id: form.canonical_id, canonical_url: form.canonical_url, title: form.title, resource_type: form.resource_type, visibility: form.visibility, ...(form.owner_id ? { owner_id: form.owner_id } : {}), ...(Object.keys(scope).length ? { scope } : {}) })
  }

  return <main className="mx-auto max-w-7xl space-y-5 p-4 md:p-6">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div><h1 className="text-2xl font-semibold">Storage resources</h1><p className="text-sm text-muted-foreground">Metadata links only. Verification checks the server integration, not your personal access.</p></div>
      <Link className="rounded-md border px-3 py-2 text-sm" href="/storage">Operational files</Link>
    </header>
    {message && <p role={messageIsError ? 'alert' : 'status'} className="rounded border p-3 text-sm">{message}</p>}
    {duplicate && <div className="flex flex-wrap items-center gap-3 rounded border p-3 text-sm"><span>Existing registry record: {duplicate.id}. Attaching a scope will not change its owner, visibility, provider ACL, or active state.</span>{duplicate.scope && <button className="rounded border px-3 py-1" onClick={() => send({ action: 'attach_scope', resource_id: duplicate.id, scope: duplicate.scope })}>Attach current scope</button>}<button className="rounded border px-3 py-1" onClick={() => setDuplicate(null)}>Close</button></div>}
    <section aria-label="Resource filters" className="grid gap-3 rounded-lg border p-4 sm:grid-cols-2 lg:grid-cols-5">
      <input aria-label="Filter Brand" className="rounded border px-3 py-2" placeholder="Brand ID" value={filters.brand} onChange={e => setFilters({ ...filters, brand: e.target.value })} />
      <input aria-label="Filter Campaign" className="rounded border px-3 py-2" placeholder="Campaign ID" value={filters.campaign} onChange={e => setFilters({ ...filters, campaign: e.target.value })} />
      <input aria-label="Filter Platform" className="rounded border px-3 py-2" placeholder="Platform ID" value={filters.platform} onChange={e => setFilters({ ...filters, platform: e.target.value })} />
      <select aria-label="Filter resource type" className="rounded border px-3 py-2" value={filters.type} onChange={e => setFilters({ ...filters, type: e.target.value })}><option value="">All types</option>{resourceTypes.map(type => <option key={type}>{type}</option>)}</select>
      <select aria-label="Filter provider" className="rounded border px-3 py-2" value={filters.provider} onChange={e => setFilters({ ...filters, provider: e.target.value })}><option value="">All providers</option><option value="google_drive">Google Drive</option><option value="onedrive">OneDrive</option></select>
    </section>
    {isAdmin && <form onSubmit={createResource} className="grid gap-3 rounded-lg border p-4 sm:grid-cols-2 lg:grid-cols-4">
      <h2 className="text-lg font-medium sm:col-span-2 lg:col-span-4">Add existing resource link</h2>
      <input required aria-label="Display title" placeholder="Display title" className="rounded border px-3 py-2" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} />
      <select aria-label="Provider" className="rounded border px-3 py-2" value={form.provider} onChange={e => setForm({ ...form, provider: e.target.value })}><option value="google_drive">Google Drive</option><option value="onedrive">OneDrive</option></select>
      <input required aria-label="Canonical provider ID" placeholder="Canonical provider ID" className="rounded border px-3 py-2" value={form.canonical_id} onChange={e => setForm({ ...form, canonical_id: e.target.value })} />
      <input required type="url" aria-label="Canonical provider URL" placeholder="Canonical provider URL" className="rounded border px-3 py-2" value={form.canonical_url} onChange={e => setForm({ ...form, canonical_url: e.target.value })} />
      <select aria-label="Resource type" className="rounded border px-3 py-2" value={form.resource_type} onChange={e => setForm({ ...form, resource_type: e.target.value, ...(e.target.value === 'attendance_evidence' ? { visibility: 'owner_only', brand_id: '', campaign_id: '', client_group_key: '' } : {}) })}>{resourceTypes.map(type => <option key={type}>{type}</option>)}</select>
      <select aria-label="Visibility" className="rounded border px-3 py-2" value={form.visibility} onChange={e => setForm({ ...form, visibility: e.target.value })}><option value="admin_only">Admins only</option><option value="owner_only">Owner only</option><option value="granted_users">Explicit user grants</option></select>
      <input aria-label="Owner business user ID" placeholder="Owner business user ID (defaults to you)" className="rounded border px-3 py-2" value={form.owner_id} onChange={e => setForm({ ...form, owner_id: e.target.value })} />
      <input aria-label="Brand ID" placeholder="Brand ID (optional)" className="rounded border px-3 py-2" value={form.brand_id} onChange={e => setForm({ ...form, brand_id: e.target.value })} />
      <input aria-label="Campaign ID" placeholder="Campaign ID (optional)" className="rounded border px-3 py-2" value={form.campaign_id} onChange={e => setForm({ ...form, campaign_id: e.target.value })} />
      <input aria-label="Platform ID" placeholder="Platform ID (optional)" className="rounded border px-3 py-2" value={form.platform_id} onChange={e => setForm({ ...form, platform_id: e.target.value })} />
      <input aria-label="Client Group key" placeholder="Client Group key" className="rounded border px-3 py-2" value={form.client_group_key} onChange={e => setForm({ ...form, client_group_key: e.target.value })} />
      <input aria-label="SKU key" placeholder="SKU key" className="rounded border px-3 py-2" value={form.sku_key} onChange={e => setForm({ ...form, sku_key: e.target.value })} />
      <input aria-label="Shift ID" placeholder="Shift ID" className="rounded border px-3 py-2" value={form.shift_id} onChange={e => setForm({ ...form, shift_id: e.target.value })} />
      <input aria-label="Staff ID" placeholder="Staff ID" className="rounded border px-3 py-2" value={form.staff_id} onChange={e => setForm({ ...form, staff_id: e.target.value })} />
      <input aria-label="Year" type="number" placeholder="Year" className="rounded border px-3 py-2" value={form.year} onChange={e => setForm({ ...form, year: e.target.value })} />
      <input aria-label="Month" type="number" min="1" max="12" placeholder="Month" className="rounded border px-3 py-2" value={form.month} onChange={e => setForm({ ...form, month: e.target.value })} />
      <button disabled={busy} className="rounded-md bg-primary px-4 py-2 text-primary-foreground disabled:opacity-50">Add link metadata</button>
      <p className="text-xs text-muted-foreground sm:col-span-2 lg:col-span-4">Adding a link does not create a Drive or OneDrive folder. Scope associations do not grant registry or provider access.</p>
    </form>}
    <section aria-label="Resources" className="grid gap-3 md:grid-cols-2">
      {visible.map(resource => <article key={resource.id} className="space-y-3 rounded-lg border p-4">
        <div className="flex items-start justify-between gap-3"><div><h2 className="font-medium">{resource.title}</h2><p className="text-xs text-muted-foreground">{resource.provider} · {resource.resource_type} · {resource.visibility}</p></div><span className={`rounded-full border px-2 py-1 text-xs ${resource.verification_status === 'broken' ? 'border-red-500 text-red-700' : ''}`}>{resource.is_active ? resource.verification_status : 'inactive'}</span></div>
        <p className="break-all text-xs">ID: {resource.canonical_id}</p>
        <p className="text-xs text-muted-foreground">Owner: {resource.owner_id} · Scopes: {(resource.storage_resource_scopes ?? []).map(scope => [scope.brand_id, scope.campaign_id, scope.platform_id, scope.sku_key, scope.year, scope.month].filter(Boolean).join(' / ')).filter(Boolean).join(', ') || 'None'}</p>
        <a className="text-sm underline" href={resource.canonical_url} target="_blank" rel="noopener noreferrer">Open provider resource</a>
        {isAdmin && <div className="flex flex-wrap gap-2">
          <button disabled={busy} className="rounded border px-3 py-1 text-sm" onClick={() => send({ action: 'verify', resource_id: resource.id })}>Check provider metadata</button>
          <button disabled={busy} className="rounded border px-3 py-1 text-sm" onClick={() => send({ action: 'update', id: resource.id, is_active: !resource.is_active })}>{resource.is_active ? 'Deactivate' : 'Restore'}</button>
          <button disabled={busy} className="rounded border px-3 py-1 text-sm" onClick={() => { const title = window.prompt('Display title', resource.title); if (title?.trim()) send({ action: 'update', id: resource.id, title: title.trim() }) }}>Rename</button>
          <button disabled={busy} className="rounded border px-3 py-1 text-sm" onClick={() => { const canonical_id = window.prompt('Canonical provider ID', resource.canonical_id); if (!canonical_id?.trim()) return; const canonical_url = window.prompt('Canonical provider URL', resource.canonical_url); if (canonical_url?.trim()) send({ action: 'update', id: resource.id, canonical_id: canonical_id.trim(), canonical_url: canonical_url.trim() }) }}>Edit link</button>
          <button disabled={busy} className="rounded border px-3 py-1 text-sm" onClick={() => { const brand_id = window.prompt('Brand ID (optional)'); if (brand_id === null) return; const campaign_id = window.prompt('Campaign ID (optional)'); if (campaign_id === null) return; const sku_key = window.prompt('SKU key (optional)'); if (sku_key === null) return; const scope = Object.fromEntries([['brand_id', brand_id], ['campaign_id', campaign_id], ['sku_key', sku_key]].filter(([, value]) => value.trim())); send({ action: 'attach_scope', resource_id: resource.id, scope }) }}>Attach scope</button>
          <button disabled={busy} className="rounded border px-3 py-1 text-sm" onClick={() => { const user_id = window.prompt('Business user ID to grant access'); if (user_id?.trim()) send({ action: 'grant', resource_id: resource.id, user_id: user_id.trim(), active: true }) }}>Grant user visibility</button>
          {resource.visibility === 'granted_users' && <button disabled={busy} className="rounded border px-3 py-1 text-sm" onClick={() => { const user_id = window.prompt('Business user ID to revoke'); if (user_id?.trim()) send({ action: 'grant', resource_id: resource.id, user_id: user_id.trim(), active: false }) }}>Revoke user visibility</button>}
        </div>}
      </article>)}
      {!visible.length && !loadFailed && <p className="rounded border p-6 text-sm text-muted-foreground">No resources match these filters.</p>}
    </section>
  </main>
}
