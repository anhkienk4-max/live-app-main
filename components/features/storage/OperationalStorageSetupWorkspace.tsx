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
  unclassified_shifts_count: number | null; offset: number
  routes: Route[]; root_configured: boolean
}
const control = 'w-full rounded-md border border-border bg-background px-3 py-2 text-sm'
const action = 'rounded-md border border-border px-3 py-2 text-sm hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50'

type PathPreview = {
  read_only: true
  legacy: { dashboard: string; live_visual: string; data_report: string; data_source: string; base_folder_id: string }
  v2: { folder_path: string; base_folder_id: string }
}

function parsePeriodOverrides(raw: string): Record<string, { default: string }> {
  const value: Record<string, { default: string }> = {}
  for (const line of raw.split(/\r?\n/u)) {
    if (!line) continue
    const match = /^(\d{4}-(?:0[1-9]|1[0-2]))=(.+)$/u.exec(line)
    if (!match || !match[2].trim() || match[2].includes('/') || match[2].includes('..')) {
      throw new Error('Định dạng ngoại lệ phải là YYYY-MM=Tên thư mục chính xác, mỗi tháng một dòng.')
    }
    if (Object.prototype.hasOwnProperty.call(value, match[1])) {
      throw new Error('Trùng tháng trong danh sách ngoại lệ: ' + match[1])
    }
    value[match[1]] = { default: match[2] }
  }
  return value
}

export function OperationalStorageSetupWorkspace() {
  const [data, setData] = React.useState<Inventory | null>(null)
  const [offset, setOffset] = React.useState(0)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState('')
  const [notice, setNotice] = React.useState('')
  const [brandId, setBrandId] = React.useState('')
  const [platformId, setPlatformId] = React.useState('')
  const [executionSource, setExecutionSource] = React.useState<'' | 'internal' | 'agency'>('')
  const [rootId, setRootId] = React.useState('')
  const [routeApproved, setRouteApproved] = React.useState(false)
  const [brandApproved, setBrandApproved] = React.useState(false)
  const [profileChoice, setProfileChoice] = React.useState('CANONICAL_V1')
  const [legacyBaseId, setLegacyBaseId] = React.useState('')
  const [legacyPeriodStyle, setLegacyPeriodStyle] = React.useState('THANG_M_DASH_YEAR')
  const [periodOverridesText, setPeriodOverridesText] = React.useState('')
  const [previewDate, setPreviewDate] = React.useState('')
  const [routePreview, setRoutePreview] = React.useState<(PathPreview & { signature: string }) | null>(null)
  const [legacyLabels, setLegacyLabels] = React.useState({
    dashboard: '', live_visual_internal: '', live_visual_agency: '',
    data_report: '', data_source: '',
  })
  const [shiftId, setShiftId] = React.useState('')
  const [shiftSource, setShiftSource] = React.useState<'' | 'internal' | 'agency'>('')
  const [shiftApproved, setShiftApproved] = React.useState(false)

  const refresh = React.useCallback(async () => {
    setBusy(true)
    setError('')
    try {
      const response = await fetch('/api/operational-storage-setup?offset=' + offset, { cache: 'no-store' })
      const json = await response.json() as Inventory & { error?: { code: string } }
      if (!response.ok || !json.ok) throw new Error(json.error?.code || 'Không đọc được tình trạng setup')
      setData(json)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không đọc được tình trạng setup')
    } finally { setBusy(false) }
  }, [offset])
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
  const legacySupported = [
    'LEGACY_CATEGORY_PERIOD', 'LEGACY_PLATFORM_CATEGORY_PERIOD', 'LEGACY_PERIOD_CATEGORY',
  ]
  const needsLegacy = Boolean(selectedBrand && legacySupported.includes(selectedBrand.storage_profile || ''))
  const selectedShift = data?.unclassified_shifts_sample.find(shift => shift.id === shiftId)
  const routeExists = data?.routes.some(route => route.provider === 'google_drive'
    && route.brand_id === brandId && route.platform_id === platformId
    && route.execution_source === executionSource)
  const bname = (id: string) => data?.brands.find(b => b.id === id)?.name || id
  const pname = (id: string) => data?.platforms.find(p => p.id === id)?.name || id
  const previewSignature = JSON.stringify([
    brandId, platformId, executionSource, rootId, legacyBaseId,
    selectedBrand?.storage_profile, legacyPeriodStyle, legacyLabels,
    periodOverridesText, previewDate,
  ])
  const previewReady = routePreview?.signature === previewSignature

  const legacyRoutePayload = () => ({
    brand_id: brandId, platform_id: platformId,
    execution_source: executionSource,
    root_folder_id: rootId.trim(), base_folder_id: legacyBaseId.trim(),
    storage_profile: selectedBrand?.storage_profile,
    period_naming_style: legacyPeriodStyle,
    period_label_overrides: parsePeriodOverrides(periodOverridesText),
    folder_labels: {
      dashboard: legacyLabels.dashboard,
      live_visual_internal: legacyLabels.live_visual_internal,
      live_visual_agency: legacyLabels.live_visual_agency,
      data_report: legacyLabels.data_report.split('/').map(v => v.trim()),
      data_source: legacyLabels.data_source.split('/').map(v => v.trim()),
    },
  })

  const previewLegacyRoute = async () => {
    setBusy(true)
    setError('')
    setRoutePreview(null)
    try {
      const signature = previewSignature
      const response = await fetch('/api/operational-storage-setup', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'preview_legacy_route',
          ...legacyRoutePayload(), shift_date: previewDate,
        }),
      })
      const data = await response.json() as PathPreview & { ok?: boolean; error?: { code: string } }
      if (!response.ok || data.ok !== true || data.read_only !== true) {
        throw new Error(data.error?.code || 'PREVIEW_NOT_AVAILABLE')
      }
      setRoutePreview({ ...data, signature })
      setRouteApproved(false)
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Không xem trước được đường dẫn')
    } finally { setBusy(false) }
  }

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
        <p className="text-sm">Route đang active: {data.routes.length}. Ca chưa phân loại: {data.unclassified_shifts_count ?? 'Chưa đếm được'}; đang hiển thị {data.unclassified_shifts_sample.length} ca.</p>
        <p className="text-xs text-muted-foreground">Số ca hiển thị là mẫu giới hạn, không phải tổng số ca chưa phân loại. Không suy đoán nguồn vận hành từ tên brand hoặc status.</p>
      </>}
    </section>
    {!data?.schema_ready && <p className="rounded-md border p-3 text-sm"><ShieldAlert className="inline h-4 w-4 mr-2" />Production thiếu prerequisite. Chờ migration được review và áp dụng theo release gate; trang này không chạy migration.</p>}
    {data?.schema_ready && <>
      <section className="rounded-xl border p-4 space-y-3" aria-label="Brand profile confirmation">
        <h2 className="font-semibold">1. Xác nhận cấu trúc thư mục của brand</h2>
        <p className="text-sm text-muted-foreground">Chỉ chọn profile đã đối chiếu đúng trên Drive; không đổi brand legacy sang canonical chỉ để upload.</p>
        <select className={control} aria-label="Chọn Brand" value={brandId}
          onChange={event => { setBrandId(event.target.value); setBrandApproved(false) }}>
          <option value="">Chọn Brand</option>
          {data.brands.map(brand => <option key={brand.id} value={brand.id}>{brand.name} — {brand.storage_profile ?? 'CHƯA PHÂN LOẠI'}</option>)}
        </select>
        {selectedBrand && <p className="text-sm">Profile hiện tại: {selectedBrand.storage_profile ?? 'Chưa phân loại'}</p>}
        {selectedBrand?.storage_profile === null && <label className="block text-sm space-y-1">
          <span>Profile đã xác minh</span>
          <select className={control} value={profileChoice}
            onChange={e => { setProfileChoice(e.target.value); setBrandApproved(false) }}>
            <option value="CANONICAL_V1">CANONICAL_V1 — Brand mới</option>
            <option value="LEGACY_CATEGORY_PERIOD">Legacy Category → Period</option>
            <option value="LEGACY_PLATFORM_CATEGORY_PERIOD">Legacy Platform → Category → Period</option>
            <option value="LEGACY_PERIOD_CATEGORY">Legacy Period → Category</option>
          </select>
        </label>}
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={brandApproved} onChange={e => setBrandApproved(e.target.checked)} />
          Tôi đã kiểm tra thư mục Drive thực tế và chọn đúng profile; không chuyển đổi cấu trúc cũ.
        </label>
        <button type="button" className={action} disabled={busy || !brandApproved || !selectedBrand || selectedBrand.storage_profile !== null}
          onClick={() => void mutate({ action: 'classify_brand_profile', brand_id: brandId,
            storage_profile: profileChoice,
            confirmation: profileChoice === 'CANONICAL_V1'
              ? 'I_VERIFIED_THIS_BRAND_USES_CANONICAL_FOLDERS'
              : 'I_VERIFIED_THIS_BRAND_FOLDER_PROFILE' })}>
          Xác nhận profile brand
        </button>
      </section>

      <section className="rounded-xl border p-4 space-y-3" aria-label="Exact route mapping">
        <h2 className="font-semibold">2. Đăng ký route Google Drive chính xác</h2>
        <p className="text-sm text-muted-foreground">Không dùng wildcard hoặc tự đoán root. Brand canonical và ba kiểu legacy không-subbrand phải có cấu hình đã kiểm tra.</p>
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
        {needsLegacy && <>
          <p className="text-sm">Legacy: giữ nguyên các folder Dashboard/Visibility/DATA cũ. Các nhóm V2 mới lưu dưới ADA_STORAGE_V2 theo Brand ID/Platform ID/Nguồn/Tháng.</p>
          <label className="block text-sm space-y-1">
            <span>Legacy Base Folder ID nằm trong Root đã kiểm tra</span>
            <input className={control} value={legacyBaseId}
              onChange={e => setLegacyBaseId(e.target.value)} placeholder="Folder ID" />
          </label>
          <label className="block text-sm space-y-1">
            <span>Quy tắc đặt tên tháng legacy</span>
            <select className={control} value={legacyPeriodStyle}
              onChange={e => setLegacyPeriodStyle(e.target.value)}>
              <option value="THANG_M_DASH_YEAR">Tháng 9 - 2026</option>
              <option value="THANG_M_DOT_YEAR">THÁNG 9.2026</option>
              <option value="THANG_M_DOT_SPACE_YEAR">THÁNG 9. 2026</option>
              <option value="T_M_DOT_YEAR">T9.2026</option>
              <option value="THANG_UPPER_M_DASH_YEAR">THÁNG 9 - 2026</option>
            </select>
          </label>
          <label className="block space-y-1 text-sm">
            <span>Ngoại lệ tên tháng, mỗi dòng YYYY-MM=Tên thư mục chính xác</span>
            <textarea className={control} rows={3}
              placeholder={'2026-07=Tháng 7-2026\\n2026-09=Tháng 9 - 2026'}
              value={periodOverridesText} onChange={e => setPeriodOverridesText(e.target.value)} />
          </label>
          {([
            ['dashboard', 'Folder Dashboard'],
            ['live_visual_internal', 'Folder Visual Internal'],
            ['live_visual_agency', 'Folder Visual Agency'],
            ['data_report', 'DATA/REPORT — đường dẫn / phân cách'],
            ['data_source', 'DATA/SOURCE — đường dẫn / phân cách'],
          ] as const).map(([key, label]) => <label key={key} className="block text-sm space-y-1">
            <span>{label}</span>
            <input className={control} value={legacyLabels[key]}
              onChange={e => setLegacyLabels(old => ({ ...old, [key]: e.target.value }))} />
          </label>)}
          <label className="block space-y-1 text-sm">
            <span>Ngày cần xem trước đường dẫn tháng (bắt buộc)</span>
            <input type="date" className={control} value={previewDate}
              onChange={e => setPreviewDate(e.target.value)} />
          </label>
          <button type="button" className={action} disabled={busy || !previewDate
            || !data.root_configured || !brandId || !platformId || !executionSource
            || !rootId.trim() || !legacyBaseId.trim()
            || Object.values(legacyLabels).some(v => !v.trim())}
            onClick={() => void previewLegacyRoute()}>
            Xem trước đường dẫn — không ghi dữ liệu
          </button>
          {previewReady && routePreview && <div className="space-y-1 rounded-md border p-3 text-sm" role="status">
            <p className="font-medium">Đường dẫn dự kiến — chưa tạo folder hay xác minh sự tồn tại của từng folder category</p>
            <p>Dashboard: {routePreview.legacy.dashboard}</p>
            <p>Visibility: {routePreview.legacy.live_visual}</p>
            <p>DATA/REPORT: {routePreview.legacy.data_report}</p>
            <p>DATA/SOURCE: {routePreview.legacy.data_source}</p>
            <p>Nhóm file V2: {routePreview.v2.folder_path}</p>
            <p className="text-xs">Preview dựa trên cấu hình và ancestry của Base Folder; cần đối chiếu tên thực tế trên Drive.</p>
          </div>}
        </>}
        {routeExists && <p className="text-sm">Route này đã có và active, không tạo bản trùng.</p>}
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={routeApproved} onChange={e => setRouteApproved(e.target.checked)} />
          Tôi đã xác minh Root Drive, Brand, Platform và Internal/Agency theo đúng thực tế.
        </label>
        <button type="button" className={action}
          disabled={busy || !data.root_configured || !routeApproved || !brandId || !platformId || !executionSource
            || !rootId.trim() || (!needsLegacy && selectedBrand?.storage_profile !== 'CANONICAL_V1')
            || (needsLegacy && (!legacyBaseId.trim()
              || Object.values(legacyLabels).some(v => !v.trim())
              || !previewReady))
            || routeExists}
          onClick={() => void mutate(needsLegacy ? {
            action: 'register_legacy_route', ...legacyRoutePayload(),
            confirmation: 'I_VERIFIED_LEGACY_PROVIDER_BASE_AND_PATHS',
          } : {
            action: 'register_route', brand_id: brandId,
            platform_id: platformId, execution_source: executionSource, root_folder_id: rootId.trim(),
            confirmation: 'I_VERIFIED_PROVIDER_ROOT_AND_BRAND',
          })}>
          Xác nhận và lưu route
        </button>
      </section>

      <section className="rounded-xl border p-4 space-y-3" aria-label="Shift source classification">
        <h2 className="font-semibold">3. Phân loại từng ca cũ</h2>
        <p className="text-sm text-muted-foreground">Không bulk update và không tự gán Internal. Ghi qua RPC với phiên bản ca để bảo toàn audit/lifecycle.</p>
        <div className="flex items-center gap-3 text-sm">
          <button type="button" className={action} disabled={busy || offset === 0}
            onClick={() => { setShiftId(''); setOffset(value => Math.max(0, value - 40)) }}>Trang trước</button>
          <span>Ca {offset + 1}–{offset + data.unclassified_shifts_sample.length} / {data.unclassified_shifts_count ?? '?'}</span>
          <button type="button" className={action}
            disabled={busy || data.unclassified_shifts_sample.length < 40 || (data.unclassified_shifts_count !== null && offset + 40 >= data.unclassified_shifts_count)}
            onClick={() => { setShiftId(''); setOffset(value => value + 40) }}>Trang sau</button>
        </div>
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
