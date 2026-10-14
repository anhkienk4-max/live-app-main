'use client'

import * as React from 'react'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'
import { resolveSystemPermission } from '@/lib/permissions'
import { useListPagination } from '@/lib/hooks/useListPagination'
import { HistoryPagination } from '@/components/ui/history-pagination'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  FolderArchive,
  Upload,
  Download,
  Trash2,
  RefreshCw,
  Search,
  FileText,
  FileCode,
  FileSpreadsheet,
  FileImage,
  Video,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Layers,
  Settings,
  AlertCircle,
  CheckCircle2,
  HardDrive,
  Cloud,
  FilePlus,
  Link2,
} from 'lucide-react'
import { businessLocalDate } from '@/lib/utils/shiftUtils'
import { useTranslation } from '@/lib/i18n'

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
  confidential_write_ready: boolean
}

type ListResponse = { ok: boolean; total: number; page: number; pageSize: number; files?: Stored[]; error?: { code?: string } }

const today = () => businessLocalDate(new Date())
const formatBytes = (n: number) => n >= 1024 * 1024
  ? (n / (1024 * 1024)).toFixed(1) + ' MB'
  : (n / 1024).toFixed(1) + ' KB'

const fieldClass = 'w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100'
const buttonClass = 'inline-flex items-center justify-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'

function getFileIcon(fileName: string, mimeType?: string) {
  const ext = fileName.split('.').pop()?.toLowerCase() || ''
  const mime = (mimeType || '').toLowerCase()
  if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(ext) || mime.startsWith('image/')) {
    return <FileImage className="h-5 w-5 text-indigo-500 shrink-0" />
  }
  if (['mp4', 'mov', 'avi', 'mkv', 'webm'].includes(ext) || mime.startsWith('video/')) {
    return <Video className="h-5 w-5 text-rose-500 shrink-0" />
  }
  if (['xlsx', 'xls', 'csv'].includes(ext) || mime.includes('spreadsheet') || mime.includes('excel')) {
    return <FileSpreadsheet className="h-5 w-5 text-emerald-600 shrink-0" />
  }
  if (['json', 'xml', 'js', 'ts'].includes(ext)) {
    return <FileCode className="h-5 w-5 text-amber-500 shrink-0" />
  }
  return <FileText className="h-5 w-5 text-slate-500 shrink-0" />
}

export function OperationalFileWorkspace() {
  const { t, translate } = useTranslation()
  const search = useSearchParams()
  const requestedCategory = search.get('category')
  const requestedCampaignId = search.get('campaignId')
  const requestedShiftId = search.get('shiftId')
  const { currentUser, loading: userLoading } = useCurrentUser()
  const actorKey = currentUser ? currentUser.id + ':' + resolveSystemPermission(currentUser) : ''
  const canView = !!currentUser && resolveSystemPermission(currentUser) !== 'member'

  const [shiftId, setShiftId] = React.useState(search.get('shiftId') || '')
  const [campaignId, setCampaignId] = React.useState(search.get('campaignId') || '')
  const [catalogState, setCatalogState] = React.useState<{ owner: string; value: CatalogResponse } | null>(null)
  const catalog = catalogState?.owner === actorKey ? catalogState.value : null
  const [brandId, setBrandId] = React.useState('')
  const [platformId, setPlatformId] = React.useState('')
  const [periodDate, setPeriodDate] = React.useState('')
  const [executionSource, setExecutionSource] = React.useState<'internal' | 'agency'>('internal')
  const [category, setCategory] = React.useState(search.get('category') || 'schedule_source')
  const confidentialBlocked = ['payment_document', 'system_export'].includes(category)
    && catalog?.confidential_write_ready !== true
  const [provider, setProvider] = React.useState<'google_drive' | 'onedrive'>('google_drive')
  const [file, setFile] = React.useState<File | null>(null)
  const [files, setFiles] = React.useState<Stored[]>([])
  const [loadedOwner, setLoadedOwner] = React.useState('')
  const [loadedListKey, setLoadedListKey] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState('')
  const [notice, setNotice] = React.useState('')
  const [filter, setFilter] = React.useState('all')
  const pagination = useListPagination('storage', 10)
  const { page, pageSize, navigate } = pagination
  const [total, setTotal] = React.useState(0)
  const requestVersion = React.useRef(0)
  const [providerFilter, setProviderFilter] = React.useState<'all' | 'google_drive' | 'onedrive'>('all')
  const [searchQuery, setSearchQuery] = React.useState('')
  const [activeTaskTab, setActiveTaskTab] = React.useState<'files' | 'upload' | 'attach' | 'export'>('files')
  const [contextExpanded, setContextExpanded] = React.useState(!search.get('shiftId') && !search.get('campaignId'))
  const [externalInput, setExternalInput] = React.useState('')
  const [folderUrl, setFolderUrl] = React.useState('')
  const [folderPath, setFolderPath] = React.useState('')
  const [exportCounts, setExportCounts] = React.useState<Record<string, number> | null>(null)

  const requestKey = shiftId.trim()
    ? 'shift_id=' + encodeURIComponent(shiftId.trim())
    : new URLSearchParams({
      ...(campaignId ? { campaign_id: campaignId } : {}),
      brand_id: brandId, platform_id: platformId,
      period_date: periodDate, execution_source: executionSource,
    }).toString()

  const listKey = [actorKey, requestKey, page, pageSize, filter].join('|')

  React.useEffect(() => {
    if(!canView)return
    let active = true
    const frame = window.requestAnimationFrame(() => setPeriodDate(today()))
    void fetch('/api/operational-files?catalog=1', { cache: 'no-store' })
      .then(async response => {
        const data = await response.json() as CatalogResponse & { error?: { code: string } }
        if (!response.ok || !data.ok) throw new Error(data.error?.code || 'Không tải được danh mục')
        if (!active) return
        setCatalogState({owner:actorKey,value:data})
        setBrandId(current => current || data.brands[0]?.id || '')
        setPlatformId(current => current || data.platforms[0]?.id || '')
        setCategory(data.categories.some(item => item.id === requestedCategory)
          ? String(requestedCategory) : (data.categories[0]?.id || 'schedule_source'))
        const chosen = data.campaigns?.find(item => item.id === requestedCampaignId)
        if (chosen && !requestedShiftId) {
          setCampaignId(chosen.id)
          setBrandId(chosen.brand_id)
          setPeriodDate(chosen.start_date)
          const valid = data.platforms.find(platform =>
            (chosen.platform_ids?.length ? chosen.platform_ids.includes(platform.id)
              : !chosen.platform_source || platform.name.trim().toLowerCase() === chosen.platform_source.trim().toLowerCase()))
          setPlatformId(valid?.id || '')
        }
      }).catch(err => { if (active) setError(String(err instanceof Error ? err.message : err)) })
    return () => { active = false; window.cancelAnimationFrame(frame) }
  }, [actorKey,canView,requestedCategory,requestedCampaignId,requestedShiftId])

  const refresh = React.useCallback(async () => {
    const version = ++requestVersion.current
    if (!canView)return
    if (!shiftId.trim() && (!brandId || !platformId || !periodDate)) return
    setBusy(true)
    setError('')
    try {
      const response = await fetch('/api/operational-files?' + requestKey + '&' + new URLSearchParams({ page: String(page), pageSize: String(pageSize), category: filter }), { cache: 'no-store' })
      const data = await response.json() as ListResponse
      if (!response.ok || !data.ok) throw new Error(data.error?.code || 'Không tải được file')
      if (version !== requestVersion.current) return
      setLoadedOwner(actorKey)
      setLoadedListKey(listKey)
      setFiles(data.files || [])
      setTotal(data.total)
      if (data.page !== page) navigate({ storage_page: String(data.page) }, true)
    } catch (err) {
      if(version===requestVersion.current)setError(err instanceof Error ? err.message : 'Không tải được file')
    } finally { if(version===requestVersion.current)setBusy(false) }
  }, [requestKey, shiftId, brandId, platformId, periodDate, page, pageSize, filter, navigate, actorKey, canView, listKey])

  React.useEffect(() => {
    const versionRef = requestVersion
    const frame = window.requestAnimationFrame(() => { if (catalog) void refresh() })
    return()=>{window.cancelAnimationFrame(frame);versionRef.current++}
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
        setActiveTaskTab('files')
        await refresh()
      }
    } catch (err) { setError(err instanceof Error ? err.message : 'Provider action failed') }
    finally { setBusy(false) }
  }

  const generateSystemExport = async () => {
    if (shiftId.trim() || campaignId || !brandId || !platformId || busy) return
    setBusy(true)
    setError('')
    setExportCounts(null)
    setNotice('')
    try {
      const response = await fetch('/api/operational-files', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generate_system_export', brand_id: brandId,
          platform_id: platformId, period_date: periodDate,
          execution_source: executionSource, provider,
        }),
      })
      const data = await response.json() as {
        ok?: boolean; reused?: boolean; counts?: Record<string, number>; error?: { code?: string }
      }
      if (!response.ok || !data.ok) throw new Error(data.error?.code || 'System export failed')
      setExportCounts(data.counts || null)
      setNotice(data.reused ? 'System Export đã tồn tại, không tạo duplicate.' :
        'Đã tạo System Export JSON và lưu vào Drive/OneDrive.')
      await refresh()
    } catch (err) { setError(err instanceof Error ? err.message : 'System export failed') }
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
      setActiveTaskTab('files')
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

  // Active Context Label Helper
  const activeBrandName = catalog?.brands.find(b => b.id === brandId)?.name || brandId
  const activePlatformName = catalog?.platforms.find(p => p.id === platformId)?.name || platformId
  const activeCampaignName = catalog?.campaigns.find(c => c.id === campaignId)?.name

  // Server filters category across all files; provider/name only filter the visible page.
  const hasFreshList = loadedOwner === actorKey && loadedListKey === listKey
  const filtered = hasFreshList ? files.filter(item => {
    if (filter !== 'all' && item.category !== filter) return false
    if (providerFilter !== 'all' && item.provider !== providerFilter) return false
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim()
      const haystack = [item.file_name, item.folder_path, item.category, item.provider].join(' ').toLowerCase()
      if (!haystack.includes(q)) return false
    }
    return true
  }) : []

  if (userLoading || !currentUser) return <p className="p-4">{t('loading')}</p>
  if (!canView) return <p className="p-4 text-sm" role="alert">{t('permissionDenied')}</p>

  return (
    <div className="mx-auto max-w-6xl space-y-4 px-3 py-4 sm:px-6" data-testid="operational-file-workspace">
      {/* 1. Header & Navigation */}
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-400">
            <FolderArchive className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">{translate("Kho file vận hành")}</h1>
            <p className="text-xs text-slate-500 dark:text-slate-400">{translate("File trên Google Drive/OneDrive · Supabase chỉ lưu metadata. Dành cho Leader/Admin.")}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {catalog?.categories.some(item => item.id === 'system_export') && (
            <Link
              href="/storage/setup"
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
            >
              <Settings className="h-3.5 w-3.5 text-slate-500" />
              <span>{translate("Admin: Kiểm tra và cấu hình Storage Routes")}</span>
            </Link>
          )}
        </div>
      </header>

      {/* 2. Status Notices & Errors */}
      {error && (
        <div role="alert" className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600 dark:text-red-400" />
          <div className="flex-1">{translate(error)}</div>
        </div>
      )}
      {notice && (
        <div role="status" className="flex items-start gap-2.5 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          <div className="flex-1">{translate(notice)}</div>
        </div>
      )}

      {/* 3. Progressive Context Selection Bar */}
      <section className="rounded-xl border border-slate-200 bg-slate-50/60 p-3 text-sm dark:border-slate-800 dark:bg-slate-900/40" aria-label={translate("Ngữ cảnh lưu file")}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5 min-w-0">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">{translate("Ngữ cảnh lưu trữ")}:</span>
            {shiftId.trim() ? (
              <span className="inline-flex items-center gap-1 rounded-md bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-900/40 dark:text-blue-300">
                Ca trực: <strong className="font-mono">{shiftId}</strong>
              </span>
            ) : (
              <>
                <span className="inline-flex items-center rounded-md bg-white px-2 py-0.5 text-xs font-medium text-slate-700 shadow-sm border border-slate-200 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200">
                  {activeBrandName || 'Chưa chọn Brand'}
                </span>
                <span className="inline-flex items-center rounded-md bg-white px-2 py-0.5 text-xs font-medium text-slate-700 shadow-sm border border-slate-200 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200">
                  {activePlatformName || 'Chưa chọn Platform'}
                </span>
                {periodDate && (
                  <span className="inline-flex items-center rounded-md bg-white px-2 py-0.5 text-xs font-medium text-slate-700 shadow-sm border border-slate-200 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200">
                    {periodDate}
                  </span>
                )}
                {activeCampaignName && (
                  <span className="inline-flex items-center rounded-md bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900">
                    Chiến dịch: {activeCampaignName}
                  </span>
                )}
                <span className="text-xs text-slate-500">
                  ({executionSource === 'internal' ? translate("Nội bộ") : translate("Agency")})
                </span>
              </>
            )}
          </div>
          <button
            type="button"
            onClick={() => setContextExpanded(v => !v)}
            className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-800 hover:underline dark:text-blue-400"
          >
            {contextExpanded ? (
              <><span>Thu gọn</span><ChevronUp className="h-3.5 w-3.5" /></>
            ) : (
              <><span>Đổi ngữ cảnh</span><ChevronDown className="h-3.5 w-3.5" /></>
            )}
          </button>
        </div>

        {/* Collapsible Detailed Context Form */}
        {contextExpanded && (
          <div className="mt-3 space-y-3 border-t border-slate-200 pt-3 dark:border-slate-800">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
                <span className="mb-1 block">{translate("Shift ID (nếu lưu cho một ca cụ thể)")}</span>
                <input
                  className={fieldClass}
                  value={shiftId}
                  onChange={event => {
                    setShiftId(event.target.value)
                    if (event.target.value.trim()) setCampaignId('')
                  }}
                  placeholder={translate("Để trống để lưu theo Brand / Platform / Ngày")}
                />
              </label>

              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
                <span className="mb-1 block">{translate("Chiến dịch (tùy chọn)")}</span>
                <select
                  className={fieldClass}
                  disabled={Boolean(shiftId.trim())}
                  value={campaignId}
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
                  }}
                >
                  <option value="">{translate("Không gắn với chiến dịch")}</option>
                  {(catalog?.campaigns ?? []).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </label>

              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
                <span className="mb-1 block">{translate("Nguồn thực hiện")}</span>
                <select
                  className={fieldClass}
                  disabled={Boolean(shiftId.trim())}
                  value={executionSource}
                  onChange={event => setExecutionSource(event.target.value as 'internal' | 'agency')}
                >
                  <option value="internal">{translate("Nội bộ (Internal)")}</option>
                  <option value="agency">{translate("Agency")}</option>
                </select>
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
                <span className="mb-1 block">{translate("Brand")}</span>
                <select
                  className={fieldClass}
                  value={brandId}
                  disabled={Boolean(shiftId.trim() || campaignId)}
                  onChange={event => setBrandId(event.target.value)}
                >
                  {(catalog?.brands || []).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </label>

              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
                <span className="mb-1 block">{translate("Platform")}</span>
                <select
                  className={fieldClass}
                  value={platformId}
                  disabled={Boolean(shiftId.trim() || campaignId)}
                  onChange={event => setPlatformId(event.target.value)}
                >
                  {(catalog?.platforms || []).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </label>

              <label className="block text-xs font-medium text-slate-600 dark:text-slate-300">
                <span className="mb-1 block">{translate("Ngày kỳ / Tháng")}</span>
                <input
                  type="date"
                  className={fieldClass}
                  disabled={Boolean(shiftId.trim() || campaignId)}
                  value={periodDate}
                  onChange={event => setPeriodDate(event.target.value)}
                />
              </label>
            </div>
          </div>
        )}
      </section>

      {/* 4. Task Navigation Strip (Files / Upload / Attach / System Export) */}
      <div className="flex border-b border-slate-200 dark:border-slate-800">
        <button
          type="button"
          onClick={() => setActiveTaskTab('files')}
          className={`flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
            activeTaskTab === 'files'
              ? 'border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
          }`}
        >
          <FolderArchive className="h-4 w-4" />
          <span>Danh sách file</span>
          <span className="ml-1 rounded-full bg-slate-100 px-2 py-0.2 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-300">
            {hasFreshList ? total : 0}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTaskTab('upload')}
          className={`flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
            activeTaskTab === 'upload'
              ? 'border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
          }`}
        >
          <FilePlus className="h-4 w-4" />
          <span>{translate("Thêm file mới")}</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTaskTab('attach')}
          className={`flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
            activeTaskTab === 'attach'
              ? 'border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
          }`}
        >
          <Link2 className="h-4 w-4" />
          <span>{translate("Video lớn / file đã có trên provider")}</span>
        </button>

        {catalog?.categories.some(item => item.id === 'system_export') && (
          <button
            type="button"
            onClick={() => setActiveTaskTab('export')}
            className={`flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTaskTab === 'export'
                ? 'border-blue-600 text-blue-600 dark:border-blue-400 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
            }`}
          >
            <Layers className="h-4 w-4" />
            <span>System Export</span>
          </button>
        )}
      </div>

      {/* 5. Task Sub-Panel: Direct Upload */}
      {activeTaskTab === 'upload' && (
        <section className="rounded-xl border border-blue-200 bg-blue-50/20 p-4 space-y-4 dark:border-blue-900/40 dark:bg-blue-950/10" aria-label={translate("Upload file")}>
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Upload className="h-4 w-4 text-blue-600" />
              {translate("Thêm file mới")}
            </h2>
            <button
              type="button"
              onClick={() => setActiveTaskTab('files')}
              className="text-xs text-slate-500 hover:underline"
            >
              Hủy / Đóng
            </button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block font-medium">{translate("Loại tài liệu")}</span>
              <select className={fieldClass} value={category} onChange={event => setCategory(event.target.value)}>
                {(catalog?.categories || []).map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">{translate("File provider")}</span>
              <select
                className={fieldClass}
                value={provider}
                onChange={event => setProvider(event.target.value as 'google_drive' | 'onedrive')}
              >
                <option value="google_drive">{translate("Google Drive")}</option>
                <option value="onedrive">{translate("OneDrive (chỉ khi đã cấu hình)")}</option>
              </select>
            </label>
          </div>

          {confidentialBlocked && (
            <div role="status" className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300">
              {translate("Finance/System Export đang khóa ghi file cho đến khi quyền truy cập thư mục đích được xác minh và phê duyệt. File đã lưu vẫn có thể truy cập theo phân quyền.")}
            </div>
          )}

          <div className="space-y-1.5">
            <input
              id="operational-file-input"
              type="file"
              className={fieldClass}
              onChange={event => setFile(event.target.files?.[0] || null)}
              aria-label={translate("Chọn file vận hành")}
            />
            <p className="text-xs text-muted-foreground">
              {translate("File định dạng ảnh, Excel, PDF, Office, audio hoặc video nhỏ (tối đa 4 MB). File lớn hãy dùng phần liên kết file provider bên dưới; không upload binary qua Supabase.")}
            </p>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              className="inline-flex min-h-[38px] items-center gap-2 rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50"
              onClick={() => void upload()}
              disabled={!file || !catalog || busy || confidentialBlocked}
            >
              <Upload className="h-4 w-4" />
              {busy ? 'Đang lưu...' : translate("Lưu file")}
            </button>
            <button
              type="button"
              onClick={() => setActiveTaskTab('files')}
              className={buttonClass}
            >
              Quay lại danh sách
            </button>
          </div>
        </section>
      )}

      {/* 6. Task Sub-Panel: Attach Large Provider File */}
      {activeTaskTab === 'attach' && (
        <section className="rounded-xl border border-indigo-200 bg-indigo-50/20 p-4 space-y-3 dark:border-indigo-900/40 dark:bg-indigo-950/10" aria-label={translate("Đính kèm file dung lượng lớn")}>
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <HardDrive className="h-4 w-4 text-indigo-600" />
              {translate("Video lớn / file đã có trên provider")}
            </h2>
            <button
              type="button"
              onClick={() => setActiveTaskTab('files')}
              className="text-xs text-slate-500 hover:underline"
            >
              Hủy / Đóng
            </button>
          </div>
          <p className="text-xs text-muted-foreground">
            {translate("Tạo đúng thư mục, upload trực tiếp file lên Drive/OneDrive, sau đó dán ID để app xác thực file thuộc chính thư mục này và lưu metadata. Không tải binary lớn qua Vercel hoặc Supabase.")}
          </p>

          <div className="pt-1">
            <button
              className={buttonClass}
              type="button"
              disabled={busy || !catalog || confidentialBlocked}
              onClick={() => void providerAction('prepare_folder')}
            >
              <Cloud className="h-4 w-4 text-indigo-600" />
              <span>{translate("Tạo / mở folder lưu trữ")}</span>
            </button>
          </div>

          {folderUrl && (
            <div className="rounded-md border border-indigo-200 bg-white p-3 text-xs dark:bg-slate-900 dark:border-indigo-900">
              <span className="font-semibold text-slate-700 dark:text-slate-300">{translate("Folder:")} </span>
              <a
                className="inline-flex items-center gap-1 text-blue-600 underline hover:text-blue-800 break-all"
                href={folderUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                <span>{folderPath || folderUrl}</span>
                <ExternalLink className="h-3 w-3 inline shrink-0" />
              </a>
            </div>
          )}

          <label className="block text-sm space-y-1">
            <span className="font-medium text-slate-700 dark:text-slate-300">
              {translate("File ID hoặc link Google Drive của file trong folder trên")}
            </span>
            <input
              className={fieldClass}
              value={externalInput}
              onChange={event => setExternalInput(event.target.value)}
              placeholder="File ID / https://drive.google.com/file/d/..."
            />
          </label>

          <div className="flex items-center gap-2 pt-1">
            <button
              className="inline-flex min-h-[38px] items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-50"
              type="button"
              disabled={busy || !catalog || !externalInput.trim() || confidentialBlocked}
              onClick={() => void providerAction('attach_existing')}
            >
              <Link2 className="h-4 w-4" />
              {busy ? 'Đang xác minh...' : translate("Liên kết file đã tải lên")}
            </button>
            <button
              type="button"
              onClick={() => setActiveTaskTab('files')}
              className={buttonClass}
            >
              Quay lại danh sách
            </button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {translate("File gắn bằng ID được kiểm tra parent folder; checksum nội dung chưa được xác nhận (integrity_status = provider_reference). Chỉ dùng file có nguồn đáng tin cậy.")}
          </p>
        </section>
      )}

      {/* 7. Task Sub-Panel: System Export (Admin) */}
      {activeTaskTab === 'export' && catalog?.categories.some(item => item.id === 'system_export') && (
        <section className="rounded-xl border border-slate-200 bg-white p-4 space-y-3 dark:border-slate-800 dark:bg-slate-900" aria-label={translate("Admin System Export")}>
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <Layers className="h-4 w-4 text-slate-700" />
              {translate("System Export — Admin")}
            </h2>
            <button
              type="button"
              onClick={() => setActiveTaskTab('files')}
              className="text-xs text-slate-500 hover:underline"
            >
              Đóng
            </button>
          </div>
          {catalog.confidential_write_ready !== true && (
            <p role="status" className="rounded-md border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
              {translate("System Export chưa được phép lưu vào provider khi quyền chia sẻ chưa được phê duyệt.")}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            {translate("Xuất bản snapshot JSON của một ngày vận hành theo Brand / Platform / Internal hoặc Agency, gồm Shift, Report, KPI timeline và metadata bằng chứng. Không phải backup toàn bộ database. Khi vượt giới hạn hệ thống sẽ báo lỗi thay vì xuất thiếu bản ghi.")}
          </p>
          <button
            className="inline-flex min-h-[38px] items-center gap-2 rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 disabled:opacity-50 dark:bg-slate-100 dark:text-slate-900"
            type="button"
            disabled={busy || catalog.confidential_write_ready !== true || Boolean(shiftId.trim()) || Boolean(campaignId) || !brandId || !platformId}
            onClick={() => void generateSystemExport()}
          >
            {busy ? 'Đang tạo snapshot...' : translate("Xuất dữ liệu ngày đang chọn lên Drive")}
          </button>
          {exportCounts && (
            <p role="status" className="text-xs break-words rounded bg-slate-100 p-2 font-mono text-slate-800 dark:bg-slate-800 dark:text-slate-200">
              {Object.entries(exportCounts).map(([key, value]) => `${key}: ${value}`).join(' · ')}
            </p>
          )}
        </section>
      )}

      {/* 8. Main File Browser & Filter Toolbar */}
      <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900" aria-label={translate("File đã lưu")}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h2 className="font-semibold">
              {translate('File đã lưu')} ({hasFreshList ? total : 0})
            </h2>
            {busy && <RefreshCw className="h-3.5 w-3.5 animate-spin text-blue-600" />}
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            {/* Search Input */}
            <div className="relative flex-1 sm:w-56">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Tìm trong trang hiện tại..."
                className="w-full rounded-md border border-slate-200 bg-slate-50/50 pl-8 pr-3 py-1.5 text-xs text-slate-900 focus:border-blue-500 focus:bg-white focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>

            {/* Category Filter */}
            <select
              aria-label={translate("Lọc loại file")}
              className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              value={filter}
              onChange={event => { setFilter(event.target.value); pagination.reset() }}
            >
              <option value="all">{translate('Tất cả')}</option>
              {(catalog?.categories || []).map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
            </select>

            {/* Provider Filter */}
            <select
              aria-label="Provider"
              className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
              value={providerFilter}
              onChange={event => setProviderFilter(event.target.value as typeof providerFilter)}
            >
              <option value="all">Provider (trang hiện tại)</option>
              <option value="google_drive">Google Drive</option>
              <option value="onedrive">OneDrive</option>
            </select>

            {/* Refresh Button */}
            <button
              className="inline-flex h-11 w-11 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
              type="button"
              disabled={busy}
              onClick={() => void refresh()}
              aria-label={translate("Làm mới")}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${busy ? 'animate-spin text-blue-600' : ''}`} />
            </button>
          </div>
        </div>

        <p className="text-xs text-muted-foreground" role="note">
          {translate("Tên file và Provider chỉ lọc trang hiện tại; Danh mục lọc toàn bộ kho file. Dùng phân trang để xem file khác.")}
        </p>

        {/* 9. Files Rendering: Mobile Cards (md:hidden) vs Desktop Table (hidden md:block) */}
        {filtered.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 p-8 text-center dark:border-slate-800">
            <FolderArchive className="mx-auto h-9 w-9 text-slate-400" />
            <p className="mt-2 text-sm font-medium text-slate-800 dark:text-slate-200">
              {files.length === 0
                ? translate("Chưa có file cho ngữ cảnh được chọn.")
                : "Không tìm thấy file nào khớp với bộ lọc."}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              {files.length === 0
                ? "Tải file lên hoặc liên kết file từ Google Drive để bắt đầu."
                : "Thử xóa từ khóa tìm kiếm hoặc đặt lại bộ lọc loại file."}
            </p>
            {files.length === 0 && (
              <div className="mt-3 flex justify-center gap-2">
                <button
                  type="button"
                  onClick={() => setActiveTaskTab('upload')}
                  className="inline-flex items-center gap-1.5 rounded-md bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
                >
                  <Upload className="h-3.5 w-3.5" />
                  <span>{translate("Thêm file mới")}</span>
                </button>
              </div>
            )}
          </div>
        ) : (
          <>
            {/* Mobile View: Compact Cards (UX-P1-02 / Mobile Responsiveness) */}
            <div className="block divide-y divide-slate-100 md:hidden dark:divide-slate-800">
              {filtered.map(item => (
                <div key={item.id} className="py-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2.5 min-w-0">
                      <div className="mt-0.5">{getFileIcon(item.file_name, item.mime_type)}</div>
                      <div className="min-w-0 flex-1">
                        <p className="break-all text-sm font-medium text-slate-900 dark:text-slate-100">
                          {item.file_name}
                        </p>
                        <p className="text-xs text-slate-500 font-mono break-all mt-0.5">
                          {item.folder_path}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 text-xs">
                    <span className="rounded bg-slate-100 px-2 py-0.5 font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                      {item.category}
                    </span>
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                      {formatBytes(item.size_bytes)}
                    </span>
                    <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium ${
                      item.provider === 'google_drive'
                        ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                        : 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300'
                    }`}>
                      {item.provider === 'google_drive' ? 'Drive' : 'OneDrive'}
                    </span>
                    {item.created_at && (
                      <span className="text-[11px] text-slate-400">
                        {new Date(item.created_at).toLocaleDateString()}
                      </span>
                    )}
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-1 border-t border-slate-50 dark:border-slate-800/60">
                    <a
                      className="inline-flex min-h-11 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                      href={item.access_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={'Tải ' + item.file_name}
                    >
                      <Download className="h-3.5 w-3.5 text-blue-600" />
                      <span>Tải file</span>
                    </a>
                    <button
                      className="inline-flex min-h-11 items-center gap-1.5 rounded-md border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 dark:border-red-900/60 dark:bg-slate-800 dark:text-red-400"
                      type="button"
                      disabled={busy}
                      onClick={() => void remove(item)}
                      aria-label={'Xóa ' + item.file_name}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>Xóa</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Desktop View: Compact Table */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[760px] text-left text-xs">
                <thead className="border-b border-slate-200 bg-slate-50/80 text-slate-600 dark:border-slate-800 dark:bg-slate-800/50 dark:text-slate-400">
                  <tr>
                    <th className="px-3 py-2 font-medium">Tên file &amp; Đường dẫn</th>
                    <th className="px-3 py-2 font-medium">Danh mục</th>
                    <th className="px-3 py-2 font-medium">Dung lượng</th>
                    <th className="px-3 py-2 font-medium">Provider</th>
                    <th className="px-3 py-2 font-medium">Ngày tải</th>
                    <th className="px-3 py-2 font-medium text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filtered.map(item => (
                    <tr key={item.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40">
                      <td className="px-3 py-2 max-w-[280px]">
                        <div className="flex items-start gap-2">
                          <div className="mt-0.5">{getFileIcon(item.file_name, item.mime_type)}</div>
                          <div className="min-w-0">
                            <p className="font-medium text-slate-900 break-all dark:text-slate-100">{item.file_name}</p>
                            <p className="text-[11px] text-slate-400 font-mono truncate" title={item.folder_path}>
                              {item.folder_path}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span className="rounded bg-slate-100 px-2 py-0.5 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                          {item.category}
                        </span>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap font-mono text-slate-600 dark:text-slate-400">
                        {formatBytes(item.size_bytes)}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 font-medium ${
                          item.provider === 'google_drive'
                            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                            : 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300'
                        }`}>
                          {item.provider === 'google_drive' ? 'Google Drive' : 'OneDrive'}
                        </span>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-slate-500">
                        {item.created_at ? new Date(item.created_at).toLocaleDateString() : '—'}
                      </td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          <a
                            className="inline-flex h-11 w-11 items-center justify-center rounded border border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                            href={item.access_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label={'Tải ' + item.file_name}
                            title="Tải file"
                          >
                            <Download className="h-3.5 w-3.5" />
                          </a>
                          <button
                            className="inline-flex h-11 w-11 items-center justify-center rounded border border-slate-200 text-red-600 hover:bg-red-50 hover:text-red-700 dark:border-slate-700 dark:hover:bg-slate-800"
                            type="button"
                            disabled={busy}
                            onClick={() => void remove(item)}
                            aria-label={'Xóa ' + item.file_name}
                            title="Xóa file"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        <HistoryPagination page={page} pageSize={pageSize} total={hasFreshList ? total : 0}
          onPageChange={pagination.setPage} onPageSizeChange={pagination.setPageSize} />
      </section>
    </div>
  )
}
