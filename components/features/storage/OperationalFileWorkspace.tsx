'use client'

import * as React from 'react'
import { useSearchParams } from 'next/navigation'
import { FolderArchive, Upload, Download, Trash2, RefreshCw } from 'lucide-react'

type Option = { id: string; name: string }
type Category = { id: string; label: string }
type CampaignOption = {
  id: string; name: string; brand_id: string;
  start_date: string; end_date: string;
  platform_ids?: string[] | null; platform_source?: string | null;
}
type Stored = {
  id: string
  category: string
  folder_path: string
  file_name: string
  size_bytes: number
  mime_type: string
  checksum_sha256: string
  created_at: string
  scope_key: string
  provider: string
  access_url: string
}
type CatalogResponse = {
  ok: boolean
  brands: Option[]
  platforms: Option[]
  campaigns: CampaignOption[]
  categories: Category[]
  max_single_upload_bytes: number
}
type ListResponse = { ok: boolean; files?: Stored[]; error?: { code?: string } }

const today = () => {
  const d = new Date()
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-')
}
const formatBytes = (n: number) => n >= 1024 * 1024
  ? (n / (1024 * 1024)).toFixed(1) + ' MB'
  : (n / 1024).toFixed(1) + ' KB'
const fieldClass = 'w-full rounded-md border border-border bg-background px-3 py-2 text-sm'
const buttonClass = 'rounded-md border border-border px-3 py-2 text-sm transition-colors hover:bg-muted disabled:opacity-50'

export function OperationalFileWorkspace() {
  const search = useSearchParams()
  const [shiftId, setShiftId] = React.useState(search.get('shiftId') || '')
  const [campaignId, setCampaignId] = React.useState(search.get('campaignId') || '')
  const [catalog, setCatalog] = React.useState<CatalogResponse | null>(null)
  const [brandId, setBrandId] = React.useState('')
  const [platformId, setPlatformId] = React.useState('')
  const [periodDate, setPeriodDate] = React.useState(today)
  const [executionSource, setExecutionSource] = React.useState<'internal' | 'agency'>('internal')
  const [category, setCategory] = React.useState(search.get('category') || 'schedule_source')
  const [provider, setProvider] = React.useState<'google_drive' | 'onedrive'>('google_drive')
  const [file, setFile] = React.useState<File | null>(null)
  const [files, setFiles] = React.useState<Stored[]>([])
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState('')
  const [notice, setNotice] = React.useState('')
  const [filter, setFilter] = React.useState('all')
  const [externalInput, setExternalInput] = React.useState('')
  const [folderUrl, setFolderUrl] = React.useState('')
  const [folderPath, setFolderPath] = React.useState('')
  const requestKey = shiftId.trim()
    ? 'shift_id=' + encodeURIComponent(shiftId.trim())
    : new URLSearchParams({
      ...(campaignId ? { campaign_id: campaignId } : {}),
      brand_id: brandId, platform_id: platformId,
      period_date: periodDate, execution_source: executionSource,
    }).toString()

  React.useEffect(() => {
    let active = true
    void fetch('/api/operational-files?catalog=1', { cache: 'no-store' })
      .then(async response => {
        const data = await response.json() as CatalogResponse & { error?: { code: string } }
        if (!response.ok || !data.ok) throw new Error(data.error?.code || 'Không tải được danh mục')
        if (!active) return
        setCatalog(data)
        setBrandId(current => current || data.brands[0]?.id || '')
        setPlatformId(current => current || data.platforms[0]?.id || '')
        const requestedCategory = search.get('category')
        setCategory(data.categories.some(item => item.id === requestedCategory)
          ? String(requestedCategory) : (data.categories[0]?.id || 'schedule_source'))
        const chosen = data.campaigns?.find(item => item.id === search.get('campaignId'))
        if (chosen && !search.get('shiftId')) {
          setCampaignId(chosen.id)
          setBrandId(chosen.brand_id)
          setPeriodDate(chosen.start_date)
          const valid = data.platforms.find(platform =>
            (chosen.platform_ids?.length ? chosen.platform_ids.includes(platform.id)
              : !chosen.platform_source || platform.name.trim().toLowerCase() === chosen.platform_source.trim().toLowerCase()))
          setPlatformId(valid?.id || '')
        }
      }).catch(err => { if (active) setError(String(err instanceof Error ? err.message : err)) })
    return () => { active = false }
  }, [])

  const refresh = React.useCallback(async () => {
    if (!shiftId.trim() && (!brandId || !platformId || !periodDate)) return
    setBusy(true)
    setError('')
    try {
      const response = await fetch('/api/operational-files?' + requestKey, { cache: 'no-store' })
      const data = await response.json() as ListResponse
      if (!response.ok || !data.ok) throw new Error(data.error?.code || 'Không tải được file')
      setFiles(data.files || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không tải được file')
    } finally { setBusy(false) }
  }, [requestKey, shiftId, brandId, platformId, periodDate])

  React.useEffect(() => {
    if (catalog) void refresh()
  }, [catalog, refresh])

  const providerPayload = (action: 'prepare_folder' | 'attach_existing') => ({
    action, category, provider,
    ...(shiftId.trim()
      ? { shift_id: shiftId.trim() }
      : {
        ...(campaignId ? { campaign_id: campaignId } : {}),
        brand_id: brandId, platform_id: platformId,
        period_date: periodDate, execution_source: executionSource,
      }),
  })

  const providerAction = async (action: 'prepare_folder' | 'attach_existing') => {
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const externalId = provider === 'google_drive'
        ? (externalInput.trim().split('/d/')[1]?.split(/[/?#]/u)[0] || externalInput.trim().match(/[?&]id=([^&#]+)/u)?.[1] || externalInput.trim())
        : externalInput.trim()
      if (action === 'attach_existing' && !externalId) {
        throw new Error('Cần nhập File ID hoặc đường dẫn Drive của file đã tải lên.')
      }
      const response = await fetch('/api/operational-files', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...providerPayload(action),
          ...(action === 'attach_existing' ? { external_file_id: externalId } : {}),
        }),
      })
      const data = await response.json() as {
        ok: boolean; folder_url?: string; folder_path?: string;
        reused?: boolean; error?: { code: string }
      }
      if (!response.ok || !data.ok) throw new Error(data.error?.code || 'Provider action failed')
      if (action === 'prepare_folder') {
        setFolderUrl(data.folder_url || '')
        setFolderPath(data.folder_path || '')
        setNotice('Đã chuẩn bị đúng folder. Có thể upload trực tiếp file lớn lên provider rồi gắn ID.')
      } else {
        setNotice(data.reused ? 'File đã được liên kết trước đó.' : 'Đã liên kết file provider vào metadata của app.')
        setExternalInput('')
        await refresh()
      }
    } catch (err) { setError(err instanceof Error ? err.message : 'Provider action failed') }
    finally { setBusy(false) }
  }

  const upload = async () => {
    if (!file || !catalog) return
    if (file.size > catalog.max_single_upload_bytes) {
      setError('File vượt giới hạn single-upload của provider. Video lớn cần luồng resumable riêng.')
      return
    }
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const form = new FormData()
      if (shiftId.trim()) form.set('shift_id', shiftId.trim())
      else {
        if (campaignId) form.set('campaign_id', campaignId)
        form.set('brand_id', brandId)
        form.set('platform_id', platformId)
        form.set('period_date', periodDate)
        form.set('execution_source', executionSource)
      }
      form.set('category', category)
      form.set('provider', provider)
      form.set('file', file)
      const response = await fetch('/api/operational-files', { method: 'POST', body: form })
      const data = await response.json() as { ok: boolean; reused?: boolean; error?: { code: string } }
      if (!response.ok || !data.ok) throw new Error(data.error?.code || 'Upload thất bại')
      setNotice(data.reused ? 'File đã tồn tại, không tạo bản trùng.' : 'Đã lưu file trên provider và metadata.')
      setFile(null)
      const input = document.getElementById('operational-file-input') as HTMLInputElement | null
      if (input) input.value = ''
      await refresh()
    } catch (err) { setError(err instanceof Error ? err.message : 'Upload thất bại') }
    finally { setBusy(false) }
  }

  const remove = async (item: Stored) => {
    if (!window.confirm('Chuyển file này vào Trash của provider và soft-delete metadata?')) return
    setBusy(true)
    setError('')
    try {
      const response = await fetch('/api/operational-files', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_id: item.id }),
      })
      const data = await response.json() as { ok: boolean; error?: { code: string } }
      if (!response.ok || !data.ok) throw new Error(data.error?.code || 'Xóa thất bại')
      setNotice('Đã chuyển file vào Trash; metadata đã soft-delete.')
      await refresh()
    } catch (err) { setError(err instanceof Error ? err.message : 'Xóa thất bại') }
    finally { setBusy(false) }
  }

  const filtered = filter === 'all' ? files : files.filter(item => item.category === filter)
  return (
    <div className="mx-auto max-w-6xl space-y-5" data-testid="operational-file-workspace">
      <div className="flex items-center gap-3">
        <FolderArchive className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-2xl font-semibold">Kho file vận hành</h1>
          <p className="text-sm text-muted-foreground">File trên Google Drive/OneDrive · Supabase chỉ lưu metadata. Dành cho Leader/Admin.</p>
        </div>
      </div>

      <section className="space-y-4 rounded-xl border p-4" aria-label="Ngữ cảnh lưu file">
        <h2 className="font-semibold">Ngữ cảnh lưu trữ</h2>
        <label className="block text-sm">
          <span className="mb-1 block">Chiến dịch (tùy chọn, để gắn file Content / Production / Campaign)</span>
          <select className={fieldClass} disabled={Boolean(shiftId.trim())} value={campaignId}
            onChange={event => {
              const next = event.target.value
              setCampaignId(next)
              const chosen = catalog?.campaigns.find(item => item.id === next)
              if (chosen) {
                setBrandId(chosen.brand_id)
                setPeriodDate(chosen.start_date)
                const valid = catalog?.platforms.find(platform =>
                  (chosen.platform_ids?.length ? chosen.platform_ids.includes(platform.id)
                    : !chosen.platform_source || platform.name.trim().toLowerCase() === chosen.platform_source.trim().toLowerCase()))
                setPlatformId(valid?.id || '')
              }
            }}>
            <option value="">Không gắn với chiến dịch</option>
            {(catalog?.campaigns ?? []).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <label className="block text-sm">
          <span className="mb-1 block">Shift ID (nếu lưu cho một ca cụ thể)</span>
          <input className={fieldClass} value={shiftId} onChange={event => {
            setShiftId(event.target.value)
            if (event.target.value.trim()) setCampaignId('')
          }}
            placeholder="Để trống để lưu theo Brand / Platform / Ngày" />
        </label>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block text-sm">
            <span className="mb-1 block">Brand</span>
            <select className={fieldClass} value={brandId} disabled={Boolean(shiftId.trim() || campaignId)}
              onChange={event => setBrandId(event.target.value)}>
              {(catalog?.brands || []).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block">Platform</span>
            <select className={fieldClass} value={platformId} disabled={Boolean(shiftId.trim())}
              onChange={event => setPlatformId(event.target.value)}>
              {(catalog?.platforms || []).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block">Ngày vận hành</span>
            <input className={fieldClass} type="date" value={periodDate} disabled={Boolean(shiftId.trim())}
              min={campaignId ? catalog?.campaigns.find(item => item.id === campaignId)?.start_date : undefined}
              max={campaignId ? catalog?.campaigns.find(item => item.id === campaignId)?.end_date : undefined}
              onChange={event => setPeriodDate(event.target.value)} />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block">Nguồn vận hành</span>
            <select className={fieldClass} value={executionSource} disabled={Boolean(shiftId.trim())}
              onChange={event => setExecutionSource(event.target.value as 'internal' | 'agency')}>
              <option value="internal">Internal</option>
              <option value="agency">Agency</option>
            </select>
          </label>
        </div>
      </section>

      <section className="space-y-4 rounded-xl border p-4" aria-label="Upload file">
        <h2 className="font-semibold">Thêm file mới</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block">Loại tài liệu</span>
            <select className={fieldClass} value={category} onChange={event => setCategory(event.target.value)}>
              {(catalog?.categories || []).map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block">File provider</span>
            <select className={fieldClass} value={provider}
              onChange={event => setProvider(event.target.value as 'google_drive' | 'onedrive')}>
              <option value="google_drive">Google Drive</option>
              <option value="onedrive">OneDrive (chỉ khi đã cấu hình)</option>
            </select>
          </label>
        </div>
        <input id="operational-file-input" type="file" className={fieldClass}
          onChange={event => setFile(event.target.files?.[0] || null)}
          aria-label="Chọn file vận hành" />
        <p className="text-xs text-muted-foreground">
          File định dạng ảnh, Excel, PDF, Office, audio hoặc video nhỏ (tối đa 4 MB).
          File lớn hãy dùng phần liên kết file provider bên dưới; không upload binary qua Supabase.
        </p>
        <button type="button" className={buttonClass} onClick={() => void upload()}
          disabled={!file || !catalog || busy}>
          <span className="flex items-center gap-2"><Upload className="h-4 w-4" />Lưu file</span>
        </button>
      </section>

      <section className="space-y-3 rounded-xl border p-4" aria-label="Đính kèm file dung lượng lớn">
        <h2 className="font-semibold">Video lớn / file đã có trên provider</h2>
        <p className="text-sm text-muted-foreground">
          Tạo đúng thư mục, upload trực tiếp file lên Drive/OneDrive, sau đó dán ID để app xác thực
          file thuộc chính thư mục này và lưu metadata. Không tải binary lớn qua Vercel hoặc Supabase.
        </p>
        <button className={buttonClass} type="button" disabled={busy || !catalog}
          onClick={() => void providerAction('prepare_folder')}>Tạo / mở folder lưu trữ</button>
        {folderUrl && <p className="text-sm break-all">
          Folder: <a className="text-primary underline" href={folderUrl} target="_blank" rel="noopener noreferrer">{folderPath || folderUrl}</a>
        </p>}
        <label className="block text-sm">
          <span className="mb-1 block">File ID hoặc link Google Drive của file trong folder trên</span>
          <input className={fieldClass} value={externalInput} onChange={event => setExternalInput(event.target.value)}
            placeholder="File ID / https://drive.google.com/file/d/..." />
        </label>
        <button className={buttonClass} type="button" disabled={busy || !catalog || !externalInput.trim()}
          onClick={() => void providerAction('attach_existing')}>Liên kết file đã tải lên</button>
        <p className="text-xs text-muted-foreground">
          File gắn bằng ID được kiểm tra parent folder; checksum nội dung chưa được xác nhận
          (integrity_status = provider_reference). Chỉ dùng file có nguồn đáng tin cậy.
        </p>
      </section>

      {error && <p role="alert" className="rounded-md border border-red-300 px-3 py-2 text-sm text-red-700">{error}</p>}
      {notice && <p role="status" className="rounded-md border px-3 py-2 text-sm">{notice}</p>}

      <section className="space-y-3 rounded-xl border p-4" aria-label="File đã lưu">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">File đã lưu ({filtered.length})</h2>
          <div className="flex items-center gap-2">
            <select aria-label="Lọc loại file" className={fieldClass} value={filter}
              onChange={event => setFilter(event.target.value)}>
              <option value="all">Tất cả</option>
              {(catalog?.categories || []).map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>
            <button className={buttonClass} type="button" disabled={busy} onClick={() => void refresh()}
              aria-label="Làm mới"><RefreshCw className="h-4 w-4" /></button>
          </div>
        </div>
        {filtered.length === 0 ? <p className="text-sm text-muted-foreground">Chưa có file cho ngữ cảnh được chọn.</p> : (
          <div className="divide-y">
            {filtered.map(item => <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
              <div className="min-w-0 flex-1">
                <p className="break-all text-sm font-medium">{item.file_name}</p>
                <p className="break-all text-xs text-muted-foreground">{item.folder_path}</p>
                <p className="text-xs text-muted-foreground">{item.category} · {formatBytes(item.size_bytes)} · {item.provider}</p>
              </div>
              <div className="flex gap-2">
                <a className={buttonClass} href={item.access_url} target="_blank" rel="noopener noreferrer"
                  aria-label={'Tải ' + item.file_name}><Download className="h-4 w-4" /></a>
                <button className={buttonClass} type="button" disabled={busy} onClick={() => void remove(item)}
                  aria-label={'Xóa ' + item.file_name}><Trash2 className="h-4 w-4" /></button>
              </div>
            </div>)}
          </div>
        )}
      </section>
    </div>
  )
}
