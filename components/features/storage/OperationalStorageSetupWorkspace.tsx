'use client'

import * as React from 'react'
import Link from 'next/link'
import { FolderCog, RefreshCw, ShieldAlert } from 'lucide-react'

type Brand = { id: string; name: string; storage_profile: string | null }
type Platform = { id: string; name: string }
type Shift = { id: string; date: string; title: string | null; version: number; brand_id: string; platform_id: string; status: string }
type Route = { id: string; brand_id: string; platform_id: string | null; execution_source: string; storage_profile: string; provider: string; root_folder_id: string; active: boolean }
type Inventory = {
  ok: boolean; schema_ready: boolean; missing: string[]
  brands: Brand[]; platforms: Platform[]
  unclassified_shifts_sample: Shift[]; sample_limit: number
  routes: Route[]; root_configured: boolean
}
const control = 'w-full rounded-md border border-border bg-background px-3 py-2 text-sm'
const action = 'rounded-md border border-border px-3 py-2 text-sm hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50'

export function OperationalStorageSetupWorkspace() {
  const [data, setData] = React.useState<Inventory | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState('')
  const [notice, setNotice] = React.useState('')
  const [brandId, setBrandId] = React.useState('')
  const [platformId, setPlatformId] = React.useState('')
  const [executionSource, setExecutionSource] = React.useState<'' | 'internal' | 'agency'>('')
  const [rootId, setRootId] = React.useState('')
  const [routeApproved, setRouteApproved] = React.useState(false)
  const [brandApproved, setBrandApproved] = React.useState(false)
  const [shiftId, setShiftId] = React.useState('')
  const [shiftSource, setShiftSource] = React.useState<'' | 'internal' | 'agency'>('')
  const [shiftApproved, setShiftApproved] = React.useState(false)

  const refresh = React.useCallback(async () => {
    setBusy(true)
    setError('')
    try {
      const response = await fetch('/api/operational-storage-setup', { cache: 'no-store' })
      const json = await response.json() as Inventory & { error?: { code: string } }
      if (!response.ok || !json.ok) throw new Error(json.error?.code || 'Không đọc được tình trạng setup')
      setData(json)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không đọc được tình trạng setup')
    } finally { setBusy(false) }
  }, [])
  React.useEffect(() => { void refresh() }, [refresh])

  const mutate = async (payload: Record<string, unknown>) => {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const response = await fetch('/api/operational-storage-setup', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const json = await response.json() as { ok?: boolean; error?: { code?: string } }
      if (!response.ok || !json.ok) throw new Error(json.error?.code || 'Không thể lưu thay đổi')
      setNotice('Đã ghi nhận thay đổi được xác nhận. Kiểm tra lại trước khi upload file.')
      setRouteApproved(false)
      setBrandApproved(false)
      setShiftApproved(false)
      setShiftId('')
      setShiftSource('')
      await refresh()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể lưu thay đổi')
    } finally { setBusy(false) }
  }
  const selectedBrand = data?.brands.find(brand => brand.id === brandId)
  const selectedShift = data?.unclassified_shifts_sample.find(shift => shift.id === shiftId)
  const routeExists = data?.routes.some(route => route.provider === 'google_drive'
    && route.brand_id === brandId && route.platform_id === platformId
    && route.execution_source === executionSource)
  const bname = (id: string) => data?.brands.find(b => b.id === id)?.name || id
  const pname = (id: string) => data?.platforms.find(p => p.id === id)?.name || id

  return <div className="mx-auto max-w-6xl space-y-5" data-testid="storage-setup">
    <div className="flex items-center gap-3">
      <FolderCog className="h-8 w-8 text-primary" />
      <div>
        <h1 className="text-2xl font-semibold">Thiết lập Storage — Admin</h1>
        <p className="text-sm text-muted-foreground">Kiểm tra cấu hình, phân loại có phê duyệt; không tự tạo route hay backfill ca.</p>
      </div>
    </div>
    <Link href="/storage" className="text-sm underline">← Kho file</Link>
    {error && <p role="alert" className="rounded-md border border-red-300 p-3 text-sm text-red-700">{error}</p>}
    {notice && <p role="status" className="rounded-md border p-3 text-sm">{notice}</p>}
    <section className="rounded-xl border p-4 space-y-3" aria-label="Storage readiness">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold">Schema & Route Readiness</h2>
        <button type="button" className={action} disabled={busy} onClick={() => void refresh()}>
          <span className="flex gap-2 items-center"><RefreshCw className="h-4 w-4" />Kiểm tra lại</span>
        </button>
      </div>
      {!data ? <p className="text-sm">Đang kiểm tra…</p> : <>
        <p className="text-sm">{data.schema_ready ? 'Schema prerequisite đã có.' : 'Chưa thể cấu hình: thiếu schema prerequisite.'}</p>
        {data.missing.length > 0 && <p className="text-sm">Thiếu: {data.missing.join(', ')}</p>}
        <p className="text-sm">Root Drive được cấu hình trên server: {data.root_configured ? 'Có' : 'Chưa có'}</p>
        <p className="text-sm">Route đang active: {data.routes.length}. Ca chưa phân loại (tối đa {data.sample_limit} mẫu): {data.unclassified_shifts_sample.length}.</p>
        <p className="text-xs text-muted-foreground">Số ca hiển thị là mẫu giới hạn, không phải tổng số ca chưa phân loại. Không suy đoán nguồn vận hành từ tên brand hoặc status.</p>
      </>}
    </section>
    {!data?.schema_ready && <p className="rounded-md border p-3 text-sm"><ShieldAlert className="inline h-4 w-4 mr-2" />Production thiếu prerequisite. Chờ migration được review và áp dụng theo release gate; trang này không chạy migration.</p>}
    {data?.schema_ready && <>
      <section className="rounded-xl border p-4 space-y-3" aria-label="Brand profile confirmation">
        <h2 className="font-semibold">1. Xác nhận cấu trúc thư mục của brand</h2>
        <p className="text-sm text-muted-foreground">Chỉ chọn CANONICAL_V1 nếu đã mở và đối chiếu cấu trúc Drive thật. Brand cũ thuộc legacy không được đổi sang canonical chỉ để upload thành công.</p>
        <select className={control} aria-label="Chọn Brand" value={brandId}
          onChange={event => { setBrandId(event.target.value); setBrandApproved(false) }}>
          <option value="">Chọn Brand</option>
          {data.brands.map(brand => <option key={brand.id} value={brand.id}>{brand.name} — {brand.storage_profile ?? 'CHƯA PHÂN LOẠI'}</option>)}
        </select>
        {selectedBrand && <p className="text-sm">Profile hiện tại: {selectedBrand.storage_profile ?? 'Chưa phân loại'}</p>}
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={brandApproved} onChange={e => setBrandApproved(e.target.checked)} />
          Tôi đã xác minh chính xác cấu trúc folder này là CANONICAL_V1, không phải legacy.
        </label>
        <button type="button" className={action} disabled={busy || !brandApproved || !selectedBrand || selectedBrand.storage_profile !== null}
          onClick={() => void mutate({ action: 'classify_brand_profile', brand_id: brandId,
            storage_profile: 'CANONICAL_V1',
            confirmation: 'I_VERIFIED_THIS_BRAND_USES_CANONICAL_FOLDERS' })}>
          Xác nhận profile brand
        </button>
      </section>

      <section className="rounded-xl border p-4 space-y-3" aria-label="Exact route mapping">
        <h2 className="font-semibold">2. Đăng ký route Google Drive chính xác</h2>
        <p className="text-sm text-muted-foreground">Không dùng wildcard, không dự đoán root từ brand name. Chỉ sử dụng brand đã xác nhận canonical. Route không tự tạo folder hoặc đổi quyền Drive.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1 text-sm">
            <label htmlFor="route-platform">Platform</label>
            <select id="route-platform" className={control} value={platformId} onChange={e => setPlatformId(e.target.value)}>
              <option value="">Chọn Platform</option>
              {data.platforms.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div className="space-y-1 text-sm">
            <label htmlFor="route-source">Nguồn vận hành</label>
            <select id="route-source" className={control} value={executionSource}
              onChange={e => setExecutionSource(e.target.value as typeof executionSource)}>
              <option value="">Chọn nguồn</option>
              <option value="internal">Internal</option>
              <option value="agency">Agency</option>
            </select>
          </div>
        </div>
        <label className="block text-sm space-y-1">
          <span>Google Drive Root Folder ID (sao chép từ folder đã kiểm tra)</span>
          <input className={control} value={rootId} onChange={e => setRootId(e.target.value)} placeholder="Folder ID" />
        </label>
        {routeExists && <p className="text-sm">Route này đã có và active, không tạo bản trùng.</p>}
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={routeApproved} onChange={e => setRouteApproved(e.target.checked)} />
          Tôi đã xác minh Root Drive, Brand, Platform và Internal/Agency theo đúng thực tế.
        </label>
        <button type="button" className={action}
          disabled={busy || !data.root_configured || !routeApproved || !brandId || !platformId || !executionSource
            || !rootId.trim() || selectedBrand?.storage_profile !== 'CANONICAL_V1' || routeExists}
          onClick={() => void mutate({ action: 'register_route', brand_id: brandId,
            platform_id: platformId, execution_source: executionSource, root_folder_id: rootId.trim(),
            confirmation: 'I_VERIFIED_PROVIDER_ROOT_AND_BRAND' })}>
          Xác nhận và lưu route
        </button>
      </section>

      <section className="rounded-xl border p-4 space-y-3" aria-label="Shift source classification">
        <h2 className="font-semibold">3. Phân loại từng ca cũ</h2>
        <p className="text-sm text-muted-foreground">Không bulk update và không tự gán Internal. Ghi qua RPC với phiên bản ca để bảo toàn audit/lifecycle.</p>
        <select className={control} aria-label="Chọn ca chưa phân loại" value={shiftId}
          onChange={e => { setShiftId(e.target.value); setShiftApproved(false) }}>
          <option value="">Chọn ca cần phân loại</option>
          {data.unclassified_shifts_sample.map(s => <option key={s.id} value={s.id}>
            {s.date} · {bname(s.brand_id)} · {pname(s.platform_id)} · {s.title || s.id}
          </option>)}
        </select>
        {selectedShift && <p className="text-xs text-muted-foreground">Ca ID: {selectedShift.id} · Version {selectedShift.version} · Trạng thái {selectedShift.status}</p>}
        <select className={control} aria-label="Nguồn vận hành của ca" value={shiftSource}
          onChange={e => setShiftSource(e.target.value as typeof shiftSource)}>
          <option value="">Chọn nguồn vận hành đã xác minh</option>
          <option value="internal">Internal</option>
          <option value="agency">Agency</option>
        </select>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={shiftApproved} onChange={e => setShiftApproved(e.target.checked)} />
          Tôi đã kiểm tra thông tin ca và xác nhận chính xác nguồn vận hành.
        </label>
        <button className={action} type="button"
          disabled={busy || !selectedShift || !shiftSource || !shiftApproved}
          onClick={() => selectedShift && shiftSource && void mutate({
            action: 'classify_shift', shift_id: selectedShift.id, expected_version: selectedShift.version,
            execution_source: shiftSource, confirmation: 'I_REVIEWED_THIS_SHIFT_SOURCE',
          })}>
          Phân loại ca được chọn
        </button>
      </section>
      <section className="rounded-xl border p-4 space-y-2" aria-label="Active storage mappings">
        <h2 className="font-semibold">Route đang hoạt động</h2>
        {data.routes.length === 0 ? <p className="text-sm">Chưa có route.</p> :
          <div className="space-y-2">
            {data.routes.map(route => <p className="break-words border-b py-2 text-sm" key={route.id}>
              {bname(route.brand_id)} / {route.platform_id ? pname(route.platform_id) : 'NULL platform'}
              {' · '}{route.execution_source}{' · '}{route.storage_profile}
            </p>)}
          </div>}
      </section>
    </>}
  </div>
}
