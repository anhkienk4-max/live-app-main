'use client'

import * as React from 'react'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'
import { resolveSystemPermission } from '@/lib/permissions'
import { useListPagination } from '@/lib/hooks/useListPagination'
import { HistoryPagination } from '@/components/ui/history-pagination'
import { ListFeedback } from '@/components/ui/list-feedback'
import { CommandToolbar } from '@/components/ui/command-toolbar'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useTranslation } from '@/lib/i18n'
import {
  FolderArchive,
  Folder,
  FolderOpen,
  ChevronRight,
  ChevronDown,
  Upload,
  Download,
  Trash2,
  RefreshCw,
  FileText,
  FileVideo,
  FileSpreadsheet,
  FileArchive,
  File,
  Info,
  Cloud,
  HardDrive,
  LayoutGrid,
  LayoutList,
  Building,
  Calendar,
  Layers,
  X,
  ShieldCheck,
  ShieldAlert,
  Plus,
  Sparkles,
  Lock,
} from 'lucide-react'
import { businessLocalDate } from '@/lib/utils/shiftUtils'
import { cn } from '@/lib/utils'

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
  integrity_status?: 'sha256_verified' | 'provider_reference'
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
  active_route_count?: number | null
}

type ListResponse = { ok: boolean; total: number; page: number; pageSize: number; files?: Stored[]; error?: { code?: string } }

const today = () => businessLocalDate(new Date())
const formatBytes = (n: number) => n >= 1024 * 1024
  ? (n / (1024 * 1024)).toFixed(1) + ' MB'
  : (n / 1024).toFixed(1) + ' KB'
const fieldClass = 'w-full rounded-md border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20'
const buttonClass = 'rounded-md border border-border px-3 py-2 text-sm transition-colors hover:bg-muted disabled:opacity-50 inline-flex items-center justify-center font-medium gap-1.5'

function getFileIcon(mime: string, name: string) {
  const lowerName = name.toLowerCase()
  if (mime.startsWith('video/') || lowerName.endsWith('.mp4') || lowerName.endsWith('.mov') || lowerName.endsWith('.mkv')) {
    return <FileVideo className="h-4 w-4 text-purple-600 shrink-0" />
  }
  if (
    mime.includes('spreadsheet') ||
    mime.includes('excel') ||
    mime.includes('csv') ||
    lowerName.endsWith('.xlsx') ||
    lowerName.endsWith('.xls') ||
    lowerName.endsWith('.csv')
  ) {
    return <FileSpreadsheet className="h-4 w-4 text-emerald-600 shrink-0" />
  }
  if (
    mime.includes('pdf') ||
    mime.includes('document') ||
    mime.includes('word') ||
    lowerName.endsWith('.pdf') ||
    lowerName.endsWith('.docx') ||
    lowerName.endsWith('.doc')
  ) {
    return <FileText className="h-4 w-4 text-blue-600 shrink-0" />
  }
  if (
    mime.includes('zip') ||
    mime.includes('compressed') ||
    mime.includes('tar') ||
    lowerName.endsWith('.zip') ||
    lowerName.endsWith('.rar') ||
    lowerName.endsWith('.7z')
  ) {
    return <FileArchive className="h-4 w-4 text-amber-600 shrink-0" />
  }
  return <File className="h-4 w-4 text-muted-foreground shrink-0" />
}

export function OperationalFileWorkspace() {
  const { t, translate } = useTranslation()
  const search = useSearchParams()
  const requestedCategory = search.get('category')
  const requestedCampaignId = search.get('campaignId')
  const requestedShiftId = search.get('shiftId')
  const { currentUser, loading: userLoading } = useCurrentUser()
  const permission = currentUser ? resolveSystemPermission(currentUser) : 'member'
  const actorKey = currentUser ? currentUser.id + ':' + permission : ''
  const canView = !!currentUser && permission !== 'member'
  const canWrite = !!currentUser && ['admin', 'leader'].includes(permission)
  const canExport = !!currentUser && permission === 'admin'
  const canDeleteFile = React.useCallback((itemCategory: string) => {
    if (!currentUser) return false
    if (permission === 'admin') return true
    if (permission === 'leader') {
      return !['payment_document', 'system_export'].includes(itemCategory)
    }
    return false
  }, [currentUser, permission])

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
    && (catalog?.confidential_write_ready !== true || permission !== 'admin')
  const [provider, setProvider] = React.useState<'google_drive' | 'onedrive'>('google_drive')
  const [file, setFile] = React.useState<File | null>(null)
  const [files, setFiles] = React.useState<Stored[]>([])
  const [loadedKey, setLoadedKey] = React.useState('')
  const [listError,setListError] = React.useState<{ key: string; message: string } | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState('')
  const [notice, setNotice] = React.useState('')
  const [filter, setFilter] = React.useState('all')
  const [providerFilter, setProviderFilter] = React.useState<'all' | 'google_drive' | 'onedrive'>('all')
  const [searchDraft, setSearchDraft] = React.useState('')
  const [appliedSearch, setAppliedSearch] = React.useState('')
  const pagination = useListPagination('storage', 10)
  const { page, pageSize, navigate } = pagination
  const [total, setTotal] = React.useState(0)
  const requestVersion = React.useRef(0)
  const [externalInput, setExternalInput] = React.useState('')
  const [folderUrl, setFolderUrl] = React.useState('')
  const [folderPath, setFolderPath] = React.useState('')
  const [exportCounts, setExportCounts] = React.useState<Record<string, number> | null>(null)

  // Explorer UI States
  const [viewMode, setViewMode] = React.useState<'table' | 'cards'>('table')
  const [inspectItem, setInspectItem] = React.useState<Stored | null>(null)
  const [showUploadModal, setShowUploadModal] = React.useState(false)
  const [showAttachModal, setShowAttachModal] = React.useState(false)
  const [showExportModal, setShowExportModal] = React.useState(false)
  const [scopeTab, setScopeTab] = React.useState<'hierarchy' | 'campaign' | 'shift'>('hierarchy')
  const [expandedBrands, setExpandedBrands] = React.useState<Record<string, boolean>>({})

  // Date parsing without hardcoding fake periods
  const dateParts = React.useMemo(() => {
    if (!periodDate) return null
    const match = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/u.exec(periodDate.trim())
    if (!match) return null
    return { year: match[1], month: match[2], day: match[3] || null }
  }, [periodDate])

  // Clear scope-dependent data when switching Brand, Platform, or Shift
  const handleBrandChange = (newBrandId: string) => {
    setBrandId(newBrandId)
    setFiles([])
    setLoadedKey('')
    setInspectItem(null)
    setFolderPath('')
    setFolderUrl('')
    setError('')
    setNotice('')
  }
  const handlePlatformChange = (newPlatformId: string) => {
    setPlatformId(newPlatformId)
    setFiles([])
    setLoadedKey('')
    setInspectItem(null)
    setFolderPath('')
    setFolderUrl('')
    setError('')
    setNotice('')
  }
  const handleDateChange = (newDate: string) => {
    setPeriodDate(newDate)
    setFiles([])
    setLoadedKey('')
    setInspectItem(null)
    setFolderPath('')
    setFolderUrl('')
    setError('')
    setNotice('')
  }

  const maxUploadBytes = catalog?.max_single_upload_bytes || 4 * 1024 * 1024

  const requestKey = shiftId.trim()
    ? 'shift_id=' + encodeURIComponent(shiftId.trim())
    : new URLSearchParams({
      ...(campaignId ? { campaign_id: campaignId } : {}),
      brand_id: brandId, platform_id: platformId,
      period_date: periodDate, execution_source: executionSource,
    }).toString()

  const listKey = [actorKey,requestKey,filter,providerFilter,appliedSearch,page,pageSize].join(':')
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
    setLoadedKey('')
    setListError(null)
    try {
      const response = await fetch('/api/operational-files?' + requestKey + '&' + new URLSearchParams({
        page: String(page), pageSize: String(pageSize), category: filter,
        provider_filter: providerFilter, search: appliedSearch,
      }), { cache: 'no-store' })
      const data = await response.json() as ListResponse
      if (!response.ok || !data.ok) throw new Error(data.error?.code || 'Không tải được file')
      if (version !== requestVersion.current) return
      setLoadedKey(listKey)
      setFiles(data.files || [])
      setTotal(data.total)
      if (data.page !== page) navigate({ storage_page: String(data.page) }, true)
    } catch (err) {
      if(version===requestVersion.current)setListError({
        key:listKey,message:err instanceof Error ? err.message : 'Không tải được file',
      })
    } finally { if(version===requestVersion.current)setBusy(false) }
  }, [requestKey, shiftId, brandId, platformId, periodDate, page, pageSize, filter, providerFilter, appliedSearch, listKey, navigate, canView])

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
    if (!canWrite) return
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
        setShowAttachModal(false)
        await refresh()
      }
    } catch (err) { setError(err instanceof Error ? err.message : 'Provider action failed') }
    finally { setBusy(false) }
  }

  const generateSystemExport = async () => {
    if (!canExport || shiftId.trim() || campaignId || !brandId || !platformId || busy) return
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
    if (!canWrite || !file || busy || confidentialBlocked) return
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
      setShowUploadModal(false)
      const input = document.getElementById('operational-file-input') as HTMLInputElement | null
      if (input) input.value = ''
      await refresh()
    } catch (err) { setError(err instanceof Error ? err.message : 'Upload thất bại') }
    finally { setBusy(false) }
  }

  const remove = async (item: Stored) => {
    if (!canDeleteFile(item.category)) {
      setError('Bạn không có quyền xóa file thuộc danh mục này.')
      return
    }
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

  const listReady = loadedKey===listKey
  const listFailure = listError?.key===listKey ? listError.message : null
  const hasCompleteScope = Boolean(shiftId.trim() || (brandId && platformId && periodDate))
  const filtered = listReady?files:[]
  const applySearch = () => {setAppliedSearch(searchDraft.trim());pagination.reset()}
  const resetSearch = () => {setSearchDraft('');setAppliedSearch('');pagination.reset()}

  const selectedBrand = catalog?.brands.find(b => b.id === brandId)
  const selectedPlatform = catalog?.platforms.find(p => p.id === platformId)
  const selectedCategory = catalog?.categories.find(c => c.id === filter)

  // Scope verification indicator: whether folder path was verified from metadata or provider prepare
  const verifiedFolderPath = files[0]?.folder_path || folderPath || ''

  if(userLoading||!currentUser)return <p className="p-4">{t('loading')}</p>
  if(currentUser&&!canView)return <p className="p-4 text-sm" role="alert">Bạn không có quyền truy cập kho file.</p>
  return (
    <div className="mx-auto max-w-7xl space-y-5 px-3 py-4 sm:px-6" data-testid="operational-file-workspace">
      {/* 1. Header & Provider Connectivity Strip */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between border-b pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary shadow-sm border border-primary/20 shrink-0">
            <FolderArchive className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{translate("Kho file vận hành")}</h1>
            <p className="text-xs sm:text-sm text-muted-foreground">{translate("File trên Google Drive/OneDrive · Supabase chỉ lưu metadata. Dành cho Leader/Admin.")}</p>
          </div>
        </div>

        {/* Provider Connectivity Status Pills & Actions */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Honest status indicator: Not hardcoded green, distinguishes runtime health-check from CSDL */}
          <div className="flex items-center gap-1.5 rounded-full border bg-muted/30 px-3 py-1 text-xs font-medium text-muted-foreground" title="Chưa có health-check runtime cho Google Drive. Không tự ý ghi để test.">
            <span className="h-2 w-2 rounded-full bg-slate-400" />
            <HardDrive className="h-3.5 w-3.5 text-slate-500" />
            <span>Google Drive: Chưa xác minh</span>
          </div>
          <div className="flex items-center gap-1.5 rounded-full border bg-muted/30 px-3 py-1 text-xs font-medium text-muted-foreground" title="Chưa có health-check runtime cho OneDrive. Không tự ý ghi để test.">
            <span className="h-2 w-2 rounded-full bg-slate-400" />
            <Cloud className="h-3.5 w-3.5 text-slate-500" />
            <span>OneDrive: Chưa xác minh</span>
          </div>
          {catalog?.active_route_count != null && (
            <div className={cn("flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium", catalog.active_route_count > 0 ? "bg-slate-50 text-slate-700 border-slate-200" : "bg-amber-50 text-amber-800 border-amber-200")} title="Tổng số Storage Routes đang active trong database">
              <Layers className="h-3.5 w-3.5" />
              <span>Storage Routes: {catalog.active_route_count} route(s) CSDL</span>
            </div>
          )}

          {canWrite && (
            <>
              <button
                type="button"
                onClick={() => setShowUploadModal(true)}
                disabled={catalog?.active_route_count === 0 || !hasCompleteScope}
                className="rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-xs font-medium shadow-sm hover:bg-primary/90 disabled:opacity-50 inline-flex items-center gap-1.5 transition-colors"
                title={!hasCompleteScope ? "Chọn đủ Brand, Platform và Ngày trước khi upload" : "Tải file lên hệ thống"}
              >
                <Upload className="h-3.5 w-3.5" />
                <span>Tải file lên</span>
              </button>
              <button
                type="button"
                onClick={() => setShowAttachModal(true)}
                disabled={catalog?.active_route_count === 0 || !hasCompleteScope}
                className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50 inline-flex items-center gap-1.5 transition-colors"
                title={!hasCompleteScope ? "Chọn đủ Brand, Platform và Ngày trước khi chuẩn bị folder" : "Chuẩn bị folder hoặc gắn file đã upload"}
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Chuẩn bị / Gắn link</span>
              </button>
            </>
          )}

          {canExport && catalog?.categories.some(item => item.id === 'system_export') && (
            <button
              type="button"
              onClick={() => setShowExportModal(true)}
              disabled={catalog?.active_route_count === 0 || Boolean(shiftId.trim()) || Boolean(campaignId) || !brandId || !platformId}
              className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted disabled:opacity-50 inline-flex items-center gap-1.5 transition-colors"
            >
              <Sparkles className="h-3.5 w-3.5 text-purple-600" />
              <span>System Export</span>
            </button>
          )}

          {permission === 'admin' && catalog?.categories.some(item => item.id === 'system_export') && (
            <Link href="/storage/setup" className="inline-flex min-h-8 items-center rounded-md border px-2.5 py-1 text-xs hover:bg-muted text-muted-foreground hover:text-foreground">
              {translate("Admin: Kiểm tra và cấu hình Storage Routes")}
            </Link>
          )}
        </div>
      </div>

      {/* Safety Alerts */}
      {catalog?.active_route_count === 0 && <p role="alert" className="rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        Chưa có Storage Route đang hoạt động. Admin cần xác minh folder gốc và quyền Drive/OneDrive tại Cấu hình Storage trước khi upload hoặc liên kết file. Không tự tạo folder thay thế.
      </p>}
      {catalog?.active_route_count == null && catalog && <p role="status" className="text-xs text-muted-foreground">
        Chưa xác minh được trạng thái Storage Route từ hệ thống. Việc lưu file vẫn phải qua kiểm tra quyền và thư mục đích.
      </p>}

      {error && <p role="alert" className="rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">{translate(error)}</p>}
      {notice && <p role="status" className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{translate(notice)}</p>}

      {/* 2. Breadcrumbs Bar */}
      <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 overflow-x-auto text-xs py-2 px-3 rounded-lg border bg-muted/20 text-muted-foreground">
        <span className="flex items-center gap-1 font-semibold text-foreground">
          <Building className="h-3.5 w-3.5 text-primary" />
          <span>Client Group</span>
        </span>
        <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/50" />
        <span className={cn("font-medium truncate max-w-[130px]", selectedBrand ? "text-foreground" : "text-muted-foreground")}>
          {selectedBrand?.name || 'Chưa chọn Brand'}
        </span>
        <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/50" />
        <span className={cn("font-medium", dateParts?.year ? "text-foreground" : "italic text-muted-foreground")}>
          {dateParts?.year ? dateParts.year : 'Chưa chọn năm'}
        </span>
        <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/50" />
        <span className={cn("font-medium", dateParts?.month ? "text-foreground" : "italic text-muted-foreground")}>
          {dateParts?.month ? `Tháng ${Number(dateParts.month)}` : 'Chưa chọn tháng'}
        </span>
        <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/50" />
        <span className={cn("font-medium truncate max-w-[130px]", selectedPlatform ? "text-foreground" : "text-muted-foreground")}>
          {selectedPlatform?.name || 'Chưa chọn Platform'}
        </span>
        {filter !== 'all' && (
          <>
            <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground/50" />
            <span className="font-semibold text-primary truncate max-w-[140px]">
              {selectedCategory?.label || filter}
            </span>
          </>
        )}
        {shiftId.trim() && (
          <span className="ml-auto rounded bg-purple-100 text-purple-800 px-2 py-0.5 text-[11px] font-mono shrink-0">
            Shift: {shiftId}
          </span>
        )}
        {campaignId && (
          <span className="ml-auto rounded bg-blue-100 text-blue-800 px-2 py-0.5 text-[11px] truncate max-w-[180px] shrink-0">
            Chiến dịch: {catalog?.campaigns.find(c => c.id === campaignId)?.name || campaignId}
          </span>
        )}
      </nav>

      {/* 3. Two-Column Storage Explorer Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Column: Explorer Directory Tree & Scope Selector */}
        <aside className="lg:col-span-4 xl:col-span-3 space-y-4">
          <section className="rounded-xl border bg-card p-4 space-y-4 shadow-sm" aria-label={translate("Ngữ cảnh lưu file")}>
            <div className="flex items-center justify-between border-b pb-2.5">
              <div className="flex items-center gap-2">
                <FolderOpen className="h-4 w-4 text-primary" />
                <h2 className="font-semibold text-sm">{translate("Ngữ cảnh lưu trữ")}</h2>
              </div>
              <span className="text-[11px] text-muted-foreground">Phân cấp Scope</span>
            </div>

            {/* Scope Navigation Tabs */}
            <div className="flex rounded-lg border bg-muted/40 p-0.5 text-xs">
              <button
                type="button"
                onClick={() => setScopeTab('hierarchy')}
                className={cn("flex-1 py-1 rounded-md font-medium text-center transition-all", scopeTab === 'hierarchy' ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground")}
              >
                Cấu trúc Brand
              </button>
              <button
                type="button"
                onClick={() => setScopeTab('campaign')}
                className={cn("flex-1 py-1 rounded-md font-medium text-center transition-all", scopeTab === 'campaign' ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground")}
              >
                Chiến dịch
              </button>
              <button
                type="button"
                onClick={() => setScopeTab('shift')}
                className={cn("flex-1 py-1 rounded-md font-medium text-center transition-all", scopeTab === 'shift' ? "bg-background shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground")}
              >
                Ca (Shift)
              </button>
            </div>

            {/* Tab: Campaign */}
            {scopeTab === 'campaign' && (
              <label className="block text-xs">
                <span className="mb-1 block font-medium">{translate("Chiến dịch (tùy chọn, để gắn file Content / Production / Campaign)")}</span>
                <select className={fieldClass} disabled={Boolean(shiftId.trim())} value={campaignId}
                  onChange={event => {
                    const next = event.target.value
                    setCampaignId(next)
                    const chosen = catalog?.campaigns.find(item => item.id === next)
                    if (chosen) {
                      handleBrandChange(chosen.brand_id)
                      handleDateChange(chosen.start_date)
                      const valid = catalog?.platforms.find(platform =>
                        (chosen.platform_ids?.length ? chosen.platform_ids.includes(platform.id)
                          : !chosen.platform_source || platform.name.trim().toLowerCase() === chosen.platform_source.trim().toLowerCase()))
                      handlePlatformChange(valid?.id || '')
                    }
                  }}>
                  <option value="">{translate("Không gắn với chiến dịch")}</option>
                  {(catalog?.campaigns ?? []).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </label>
            )}

            {/* Tab: Shift ID */}
            {scopeTab === 'shift' && (
              <label className="block text-xs">
                <span className="mb-1 block font-medium">{translate("Shift ID (nếu lưu cho một ca cụ thể)")}</span>
                <input className={fieldClass} value={shiftId} onChange={event => {
                  setShiftId(event.target.value)
                  if (event.target.value.trim()) setCampaignId('')
                }}
                  placeholder={translate("Để trống để lưu theo Brand / Platform / Ngày")} />
              </label>
            )}

            {/* Directory Tree View (Client Group → Brand → Year → Month/Period → Platform) */}
            <div className="space-y-1 rounded-lg border bg-muted/20 p-2.5 text-xs font-mono max-h-80 overflow-y-auto" role="tree" aria-label="Directory Tree">
              {/* Root Node: Client Group */}
              <div className="flex items-center justify-between font-semibold text-foreground py-1 px-1.5 rounded hover:bg-muted/50">
                <div className="flex items-center gap-1.5 truncate">
                  <Building className="h-3.5 w-3.5 text-primary shrink-0" />
                  <span className="truncate">ADA Client Group</span>
                </div>
                <span className="text-[10px] text-muted-foreground font-sans">Logic Scope</span>
              </div>

              {/* Brands Hierarchy */}
              <div className="pl-3 space-y-0.5 border-l border-border/60 ml-2">
                {(catalog?.brands || []).map(b => {
                  const isBrandActive = brandId === b.id
                  const isExpanded = isBrandActive || expandedBrands[b.id]
                  return (
                    <div key={b.id} className="space-y-0.5">
                      <button
                        type="button"
                        onClick={() => {
                          handleBrandChange(b.id)
                          setExpandedBrands(prev => ({ ...prev, [b.id]: !prev[b.id] }))
                        }}
                        className={cn(
                          "w-full flex items-center justify-between text-left py-1 px-1.5 rounded transition-colors",
                          isBrandActive ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                        )}
                        role="treeitem"
                        aria-selected={isBrandActive}
                      >
                        <span className="flex items-center gap-1.5 truncate">
                          <Folder className={cn("h-3.5 w-3.5 shrink-0", isBrandActive ? "text-primary fill-primary/20" : "text-muted-foreground")} />
                          <span className="truncate">{b.name}</span>
                        </span>
                        {isExpanded ? <ChevronDown className="h-3 w-3 shrink-0 opacity-70" /> : <ChevronRight className="h-3 w-3 shrink-0 opacity-70" />}
                      </button>

                      {/* Brand Children: Year → Month → Platforms */}
                      {isExpanded && (
                        <div className="pl-3 border-l border-border/40 ml-2 space-y-0.5 py-0.5">
                          {dateParts?.year ? (
                            <div className="flex items-center gap-1 text-muted-foreground py-0.5 px-1">
                              <Calendar className="h-3 w-3 text-muted-foreground/70" />
                              <span>{dateParts.year}</span>
                            </div>
                          ) : (
                            <div className="text-[10px] text-muted-foreground italic py-0.5 px-1">
                              (Chưa chọn ngày)
                            </div>
                          )}

                          {dateParts?.month && (
                            <div className="pl-2.5 border-l border-border/40 ml-1.5 space-y-0.5">
                              <div className="text-[11px] font-medium text-foreground/80 py-0.5 px-1">
                                📂 Tháng {Number(dateParts.month)}
                              </div>

                              {/* Platforms */}
                              <div className="pl-2.5 border-l border-border/40 ml-1.5 space-y-0.5">
                                {(catalog?.platforms || []).map(p => {
                                  const isPlatformActive = platformId === p.id
                                  return (
                                    <button
                                      key={p.id}
                                      type="button"
                                      onClick={() => handlePlatformChange(p.id)}
                                      className={cn(
                                        "w-full flex items-center gap-1.5 text-left py-0.5 px-1 rounded transition-colors text-[11px]",
                                        isPlatformActive ? "bg-primary/15 text-primary font-semibold" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                                      )}
                                    >
                                      <span className={cn("h-1.5 w-1.5 rounded-full", isPlatformActive ? "bg-primary" : "bg-muted-foreground/50")} />
                                      <span className="truncate">{p.name}</span>
                                    </button>
                                  )
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>

            {/* Scope Folder Verification Indicator */}
            <div className="rounded-lg border bg-muted/15 p-2.5 text-[11px] space-y-1">
              <span className="font-semibold block text-foreground">Trạng thái thư mục:</span>
              {verifiedFolderPath ? (
                <div className="space-y-0.5">
                  <span className="inline-flex items-center gap-1 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 px-1.5 py-0.5 text-[10px] font-medium">
                    <ShieldCheck className="h-2.5 w-2.5" />
                    Thư mục đã xác minh từ metadata
                  </span>
                  <p className="font-mono text-muted-foreground break-all text-[10px] pt-0.5">{verifiedFolderPath}</p>
                </div>
              ) : (
                <p className="text-muted-foreground">
                  Cấu trúc logic theo Brand/Platform. Chưa xác nhận folder vật lý trên Drive/OneDrive cho đến khi chuẩn bị folder hoặc tải file.
                </p>
              )}
            </div>

            {/* Scope Form Inputs */}
            <div className="space-y-3 pt-2 border-t text-xs">
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="mb-1 block font-medium">{translate("Brand")}</span>
                  <select className={fieldClass} value={brandId} disabled={Boolean(shiftId.trim() || campaignId)}
                    onChange={event => handleBrandChange(event.target.value)}>
                    {(catalog?.brands || []).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="mb-1 block font-medium">{translate("Platform")}</span>
                  <select className={fieldClass} value={platformId} disabled={Boolean(shiftId.trim())}
                    onChange={event => handlePlatformChange(event.target.value)}>
                    {(catalog?.platforms || []).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
                  </select>
                </label>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="mb-1 block font-medium">{translate("Ngày vận hành")}</span>
                  <input className={fieldClass} type="date" value={periodDate} disabled={Boolean(shiftId.trim())}
                    min={campaignId ? catalog?.campaigns.find(item => item.id === campaignId)?.start_date : undefined}
                    max={campaignId ? catalog?.campaigns.find(item => item.id === campaignId)?.end_date : undefined}
                    onChange={event => handleDateChange(event.target.value)} />
                </label>
                <label className="block">
                  <span className="mb-1 block font-medium">{translate("Nguồn vận hành")}</span>
                  <select className={fieldClass} value={executionSource} disabled={Boolean(shiftId.trim())}
                    onChange={event => setExecutionSource(event.target.value as 'internal' | 'agency')}>
                    <option value="internal">{translate("Internal")}</option>
                    <option value="agency">{translate("Agency")}</option>
                  </select>
                </label>
              </div>
            </div>
          </section>
        </aside>

        {/* Right Column: File Browser / Explorer Table & Cards */}
        <main className="lg:col-span-8 xl:col-span-9 space-y-4">
          <section className="space-y-3 rounded-xl border bg-card p-4 shadow-sm" aria-label={translate("File đã lưu")}>
            <CommandToolbar label="Tìm và lọc file" className="flex flex-col gap-3">
              {/* Toolbar Top Row */}
              <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
                <h2 className="font-semibold">{translate('File đã lưu')} ({listReady ? total : '…'})</h2>
                <div className="flex flex-wrap items-center gap-2">
                  <select aria-label={translate('Lọc loại file')} className={cn(fieldClass, "w-auto min-w-36 text-xs")} value={filter}
                    onChange={event => { setFilter(event.target.value); pagination.reset() }}>
                    <option value="all">{t('all')}</option>
                    {(catalog?.categories || []).map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
                  </select>
                  <select aria-label="Lọc nhà cung cấp file" className={cn(fieldClass, "w-auto min-w-32 text-xs")} value={providerFilter}
                    onChange={event => {setProviderFilter(event.target.value as 'all'|'google_drive'|'onedrive');pagination.reset()}}>
                    <option value="all">Mọi nguồn lưu</option>
                    <option value="google_drive">Google Drive</option>
                    <option value="onedrive">OneDrive</option>
                  </select>

                  {/* View Mode Switcher: Table vs Cards */}
                  <div className="flex items-center rounded-lg border bg-muted/40 p-0.5">
                    <button
                      type="button"
                      onClick={() => setViewMode('table')}
                      className={cn("flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md transition-all", viewMode === 'table' ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
                      title="Chế độ danh sách / bảng"
                      aria-label="Chế độ bảng"
                    >
                      <LayoutList className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Bảng</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewMode('cards')}
                      className={cn("flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-md transition-all", viewMode === 'cards' ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
                      title="Chế độ thẻ lưới"
                      aria-label="Chế độ thẻ"
                    >
                      <LayoutGrid className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">Thẻ</span>
                    </button>
                  </div>

                  <button className={buttonClass} type="button" disabled={busy} onClick={() => void refresh()}
                    aria-label={t('refresh')}><RefreshCw className={cn("h-4 w-4", busy && "animate-spin")} /></button>
                </div>
              </div>

              {/* Toolbar Search Row */}
              <div className="flex flex-wrap items-end gap-2">
                <label className="min-w-48 flex-1 text-xs">
                  <span className="mb-1 block font-medium text-muted-foreground">Tìm file trong ngữ cảnh</span>
                  <input className={fieldClass} type="search" value={searchDraft} maxLength={128}
                    placeholder="Tên file..."
                    onChange={event => setSearchDraft(event.target.value)}
                    onKeyDown={event => {if(event.key==='Enter'){event.preventDefault();applySearch()}}} />
                </label>
                <button type="button" className={buttonClass} onClick={applySearch} disabled={busy || searchDraft.trim()===appliedSearch}>Tìm file</button>
                <button type="button" className={buttonClass} onClick={resetSearch} disabled={busy || (!appliedSearch&&!searchDraft)}>Xóa tìm kiếm</button>
              </div>
            </CommandToolbar>

            {searchDraft.trim()!==appliedSearch&&<p role="status" className="text-xs text-muted-foreground">Từ khóa chưa áp dụng; kết quả đang hiển thị theo tìm kiếm trước đó.</p>}
            {appliedSearch&&<p className="text-xs text-muted-foreground">Đang tìm trong tên file: {appliedSearch}</p>}

            {/* List Feedback & File Content */}
            {!hasCompleteScope ? <ListFeedback kind="empty" title="Chưa đủ ngữ cảnh"
                description="Chọn Brand, nền tảng và ngày vận hành hoặc nhập Shift ID để tìm file." /> :
              listFailure ? <ListFeedback kind="error" title="Không tải được danh sách file"
                description={listFailure} onRetry={() => void refresh()} /> :
              !listReady ? <ListFeedback kind="loading" title="Đang xác minh danh sách file"
                description="Chỉ hiển thị file thuộc tài khoản, ngữ cảnh và bộ lọc đã chọn." /> :
              filtered.length === 0 ? <ListFeedback kind="empty" title="Không tìm thấy file"
                description="Chưa có metadata file phù hợp. Bạn có thể thay đổi từ khóa hoặc chọn nguồn lưu khác; điều này không có nghĩa file Drive đã bị xóa." /> : (
              <div>
                {/* Mode A: Table View */}
                {viewMode === 'table' ? (
                  <div className="overflow-x-auto rounded-lg border">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-muted/50 text-muted-foreground border-b uppercase text-[10px] tracking-wider font-semibold">
                        <tr>
                          <th className="p-3">Tên file & Thư mục</th>
                          <th className="p-3">Loại file</th>
                          <th className="p-3">Dung lượng</th>
                          <th className="p-3">Lưu trữ</th>
                          <th className="p-3">Toàn vẹn</th>
                          <th className="p-3">Ngày lưu</th>
                          <th className="p-3 text-right">Thao tác</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {filtered.map(item => (
                          <tr key={item.id} className="hover:bg-muted/30 transition-colors group">
                            <td className="p-3 min-w-[200px] max-w-[280px]">
                              <div className="flex items-center gap-2">
                                {getFileIcon(item.mime_type, item.file_name)}
                                <div className="min-w-0">
                                  <p className="font-medium truncate text-foreground text-xs" title={item.file_name}>{item.file_name}</p>
                                  <p className="text-[11px] text-muted-foreground truncate" title={item.folder_path}>{item.folder_path}</p>
                                </div>
                              </div>
                            </td>
                            <td className="p-3 whitespace-nowrap text-muted-foreground">
                              {item.category}
                            </td>
                            <td className="p-3 whitespace-nowrap text-muted-foreground font-mono">
                              {formatBytes(item.size_bytes)}
                            </td>
                            <td className="p-3 whitespace-nowrap">
                              {item.provider === 'google_drive' ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-xs font-medium text-blue-700 border border-blue-200">
                                  <HardDrive className="h-3 w-3" />
                                  Google Drive
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 text-xs font-medium text-sky-700 border border-sky-200">
                                  <Cloud className="h-3 w-3" />
                                  OneDrive
                                </span>
                              )}
                            </td>
                            <td className="p-3 whitespace-nowrap">
                              {item.integrity_status === 'sha256_verified' ? (
                                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 border border-emerald-200">
                                  <ShieldCheck className="h-3 w-3" />
                                  Đã xác minh SHA-256
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 border border-amber-200">
                                  <ShieldAlert className="h-3 w-3" />
                                  Tham chiếu provider, chưa xác minh checksum nội dung
                                </span>
                              )}
                            </td>
                            <td className="p-3 whitespace-nowrap text-muted-foreground">
                              {new Date(item.created_at).toLocaleDateString('vi-VN')}
                            </td>
                            <td className="p-3 whitespace-nowrap text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => setInspectItem(item)}
                                  className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                                  title="Xem chi tiết metadata"
                                  aria-label={'Chi tiết ' + item.file_name}
                                >
                                  <Info className="h-4 w-4" />
                                </button>
                                {item.access_url && (item.access_url.startsWith('/api/operational-files') || item.access_url.startsWith('https://')) && (
                                  <a
                                    className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-primary transition-colors"
                                    href={item.access_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    title="Tải file an toàn qua URL được xác minh"
                                    aria-label={'Tải ' + item.file_name}
                                  >
                                    <Download className="h-4 w-4" />
                                  </a>
                                )}
                                {canDeleteFile(item.category) ? (
                                  <button
                                    className="rounded p-1.5 text-muted-foreground hover:bg-muted hover:text-destructive transition-colors disabled:opacity-50"
                                    type="button"
                                    disabled={busy}
                                    onClick={() => void remove(item)}
                                    title="Xóa file"
                                    aria-label={'Xóa ' + item.file_name}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </button>
                                ) : (
                                  <span className="p-1.5 text-muted-foreground/40" title="Không có quyền xóa">
                                    <Lock className="h-3.5 w-3.5" />
                                  </span>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  /* Mode B: Cards View */
                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3.5">
                    {filtered.map(item => (
                      <div
                        key={item.id}
                        className="rounded-xl border bg-card p-3.5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between space-y-3 group border-border/80 hover:border-primary/40"
                      >
                        <div className="space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <div className="p-2 rounded-lg bg-muted/50 border border-border/50 shrink-0">
                                {getFileIcon(item.mime_type, item.file_name)}
                              </div>
                              <div className="min-w-0">
                                <p className="font-semibold text-xs text-foreground line-clamp-2 break-all" title={item.file_name}>
                                  {item.file_name}
                                </p>
                                <p className="text-[10px] text-muted-foreground font-mono mt-0.5">
                                  {formatBytes(item.size_bytes)}
                                </p>
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => setInspectItem(item)}
                              className="p-1 text-muted-foreground hover:text-foreground rounded hover:bg-muted shrink-0"
                              title="Xem chi tiết"
                            >
                              <Info className="h-4 w-4" />
                            </button>
                          </div>

                          <p className="text-[11px] text-muted-foreground truncate rounded bg-muted/20 px-2 py-1" title={item.folder_path}>
                            📂 {item.folder_path}
                          </p>

                          <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                            <span className="rounded bg-muted px-1.5 py-0.5 font-medium text-muted-foreground">
                              {item.category}
                            </span>
                            {item.provider === 'google_drive' ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 font-medium text-blue-700 border border-blue-200">
                                <HardDrive className="h-2.5 w-2.5" />
                                Google Drive
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 font-medium text-sky-700 border border-sky-200">
                                <Cloud className="h-2.5 w-2.5" />
                                OneDrive
                              </span>
                            )}
                          </div>

                          <div className="pt-1">
                            {item.integrity_status === 'sha256_verified' ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-medium text-emerald-700 border border-emerald-200">
                                <ShieldCheck className="h-2.5 w-2.5" />
                                Đã xác minh SHA-256
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-800 border border-amber-200">
                                <ShieldAlert className="h-2.5 w-2.5" />
                                Tham chiếu provider, chưa xác minh checksum nội dung
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center justify-between pt-2 border-t text-[11px] text-muted-foreground">
                          <span>{new Date(item.created_at).toLocaleDateString('vi-VN')}</span>
                          <div className="flex items-center gap-1.5">
                            {item.access_url && (item.access_url.startsWith('/api/operational-files') || item.access_url.startsWith('https://')) && (
                              <a
                                className="rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-muted hover:text-primary transition-colors inline-flex items-center gap-1"
                                href={item.access_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                aria-label={'Tải ' + item.file_name}
                              >
                                <Download className="h-3.5 w-3.5" />
                                <span>Tải</span>
                              </a>
                            )}
                            {canDeleteFile(item.category) && (
                              <button
                                className="rounded-md border border-border px-2 py-1 text-xs font-medium hover:bg-muted hover:text-destructive transition-colors disabled:opacity-50 inline-flex items-center gap-1"
                                type="button"
                                disabled={busy}
                                onClick={() => void remove(item)}
                                aria-label={'Xóa ' + item.file_name}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                <span>Xóa</span>
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            {listReady && <HistoryPagination page={page} pageSize={pageSize} total={total} onPageChange={pagination.setPage} onPageSizeChange={pagination.setPageSize} />}
          </section>
        </main>
      </div>

      {/* 4. MODALS / DRAWERS */}

      {/* Modal A: File Metadata & Integrity Inspector */}
      {inspectItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto" role="dialog" aria-modal="true">
          <div className="max-w-xl w-full rounded-2xl border bg-background p-6 shadow-2xl space-y-4 animate-in fade-in-50 zoom-in-95">
            <div className="flex items-start justify-between border-b pb-3">
              <div className="flex items-center gap-2.5 min-w-0">
                {getFileIcon(inspectItem.mime_type, inspectItem.file_name)}
                <div className="min-w-0">
                  <h3 className="font-bold text-base text-foreground truncate">Chi tiết & Tính toàn vẹn File</h3>
                  <p className="text-xs text-muted-foreground truncate">{inspectItem.file_name}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setInspectItem(null)}
                className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="rounded-lg border bg-muted/20 p-2.5 space-y-1">
                <span className="text-muted-foreground font-medium block">Tên file</span>
                <span className="font-semibold break-all text-foreground">{inspectItem.file_name}</span>
              </div>
              <div className="rounded-lg border bg-muted/20 p-2.5 space-y-1">
                <span className="text-muted-foreground font-medium block">Mã định danh (ID)</span>
                <span className="font-mono break-all text-muted-foreground">{inspectItem.id}</span>
              </div>
              <div className="rounded-lg border bg-muted/20 p-2.5 space-y-1 sm:col-span-2">
                <span className="text-muted-foreground font-medium block">Đường dẫn thư mục (Folder Path)</span>
                <span className="font-mono break-all text-foreground">{inspectItem.folder_path}</span>
              </div>
              <div className="rounded-lg border bg-muted/20 p-2.5 space-y-1">
                <span className="text-muted-foreground font-medium block">Loại phân loại (Category)</span>
                <span className="font-medium text-foreground">{inspectItem.category}</span>
              </div>
              <div className="rounded-lg border bg-muted/20 p-2.5 space-y-1">
                <span className="text-muted-foreground font-medium block">Dung lượng & MIME</span>
                <span className="font-medium text-foreground">{formatBytes(inspectItem.size_bytes)} · {inspectItem.mime_type}</span>
              </div>
              <div className="rounded-lg border bg-muted/20 p-2.5 space-y-1">
                <span className="text-muted-foreground font-medium block">Nhà lưu trữ (Provider)</span>
                <div className="pt-0.5">
                  {inspectItem.provider === 'google_drive' ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 font-medium text-blue-700 border border-blue-200">
                      <HardDrive className="h-3 w-3" />
                      Google Drive
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-0.5 font-medium text-sky-700 border border-sky-200">
                      <Cloud className="h-3 w-3" />
                      OneDrive
                    </span>
                  )}
                </div>
              </div>
              <div className="rounded-lg border bg-muted/20 p-2.5 space-y-1">
                <span className="text-muted-foreground font-medium block">Trạng thái toàn vẹn</span>
                <div className="pt-0.5">
                  {inspectItem.integrity_status === 'sha256_verified' ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700 border border-emerald-200">
                      <ShieldCheck className="h-3 w-3" />
                      Đã xác minh SHA-256
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-800 border border-amber-200">
                      <ShieldAlert className="h-3 w-3" />
                      Tham chiếu provider, chưa xác minh checksum nội dung
                    </span>
                  )}
                </div>
              </div>
              <div className="rounded-lg border bg-muted/20 p-2.5 space-y-1 sm:col-span-2">
                <span className="text-muted-foreground font-medium block">Mã băm SHA-256</span>
                <span className="font-mono break-all text-[11px] text-muted-foreground">
                  {inspectItem.checksum_sha256 || 'Tham chiếu provider, chưa xác minh checksum nội dung'}
                </span>
              </div>
              <div className="rounded-lg border bg-muted/20 p-2.5 space-y-1 sm:col-span-2">
                <span className="text-muted-foreground font-medium block">Khóa ngữ cảnh (Scope Key)</span>
                <span className="font-mono break-all text-[11px] text-muted-foreground">{inspectItem.scope_key}</span>
              </div>
              <div className="rounded-lg border bg-muted/20 p-2.5 space-y-1 sm:col-span-2">
                <span className="text-muted-foreground font-medium block">Thời gian tạo</span>
                <span className="font-medium text-foreground">{new Date(inspectItem.created_at).toLocaleString('vi-VN')}</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t">
              <button
                type="button"
                onClick={() => setInspectItem(null)}
                className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
              >
                Đóng
              </button>
              {inspectItem.access_url && (inspectItem.access_url.startsWith('/api/operational-files') || inspectItem.access_url.startsWith('https://')) && (
                <a
                  href={inspectItem.access_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-xs font-medium shadow-sm hover:bg-primary/90 inline-flex items-center gap-1.5"
                >
                  <Download className="h-3.5 w-3.5" />
                  <span>Mở / Tải file</span>
                </a>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal B: Upload Modal */}
      {showUploadModal && canWrite && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto" role="dialog" aria-modal="true">
          <div className="max-w-lg w-full rounded-2xl border bg-background p-6 shadow-2xl space-y-4 animate-in fade-in-50 zoom-in-95">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-2">
                <Upload className="h-5 w-5 text-primary" />
                <h3 className="font-bold text-base text-foreground">{translate("Upload file")}</h3>
              </div>
              <button type="button" onClick={() => setShowUploadModal(false)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>

            {catalog?.active_route_count === 0 ? (
              <p role="alert" className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                Chưa có Storage Route đang hoạt động. Không thể thực hiện tải file.
              </p>
            ) : (
              <div className="space-y-3 text-xs">
                <div className="rounded-lg border bg-muted/20 p-2.5 text-muted-foreground space-y-1">
                  <span className="font-medium block text-foreground">Ngữ cảnh tải lên hiện tại:</span>
                  <p className="font-mono">{selectedBrand?.name || brandId} · {selectedPlatform?.name || platformId} · {periodDate} ({executionSource})</p>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <label className="block">
                    <span className="mb-1 block font-medium">{translate("Loại file")}</span>
                    <select className={fieldClass} value={category} onChange={event => setCategory(event.target.value)}>
                      {(catalog?.categories || []).map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1 block font-medium">{translate("Nguồn lưu trữ")}</span>
                    <select className={fieldClass} value={provider} onChange={event => setProvider(event.target.value as 'google_drive' | 'onedrive')}>
                      <option value="google_drive">Google Drive</option>
                      <option value="onedrive">OneDrive</option>
                    </select>
                  </label>
                </div>

                <div className="border-2 border-dashed border-border rounded-xl p-4 text-center space-y-2 hover:border-primary/50 transition-colors">
                  <input id="operational-file-input" className="hidden" type="file"
                    onChange={event => setFile(event.target.files?.[0] || null)} />
                  <label htmlFor="operational-file-input" className="cursor-pointer block space-y-1">
                    <Upload className="mx-auto h-7 w-7 text-muted-foreground/60" />
                    <span className="font-semibold text-primary block">Chọn file từ thiết bị</span>
                    <span className="text-[11px] text-muted-foreground block">Hỗ trợ MP4, XLSX, CSV, PDF, hình ảnh, tài liệu</span>
                  </label>
                  {file && (
                    <div className="rounded-md bg-primary/10 border border-primary/20 p-2 font-medium text-primary text-xs flex items-center justify-between">
                      <span className="truncate max-w-[280px]">{file.name}</span>
                      <span className="font-mono">{formatBytes(file.size)}</span>
                    </div>
                  )}
                </div>

                <p className="text-[11px] text-muted-foreground">
                  {translate(`File <= ${formatBytes(maxUploadBytes)} tải trực tiếp qua hệ thống. Với video hoặc file lớn, khuyến nghị chuẩn bị folder và gắn link file đã tải lên Drive.`)}
                </p>

                {confidentialBlocked && (
                  <p role="alert" className="text-[11px] text-red-600 font-medium">
                    {translate("Loại file này yêu cầu quyền phê duyệt lưu trữ bảo mật (Admin) trước khi tải.")}
                  </p>
                )}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-3 border-t">
              <button type="button" onClick={() => setShowUploadModal(false)} className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted">
                Hủy
              </button>
              <button
                type="button"
                className="rounded-md bg-primary text-primary-foreground px-4 py-1.5 text-xs font-medium shadow-sm hover:bg-primary/90 disabled:opacity-50 inline-flex items-center gap-1.5"
                disabled={busy || !file || confidentialBlocked || catalog?.active_route_count === 0}
                onClick={() => void upload()}
              >
                {busy && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
                <span>{translate("Tải lên ngay")}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal C: Prepare Folder & Attach Existing File Modal */}
      {showAttachModal && canWrite && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto" role="dialog" aria-modal="true">
          <div className="max-w-lg w-full rounded-2xl border bg-background p-6 shadow-2xl space-y-4 animate-in fade-in-50 zoom-in-95">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-2">
                <FolderOpen className="h-5 w-5 text-primary" />
                <h3 className="font-bold text-base text-foreground">{translate("Chuẩn bị folder hoặc gắn file đã upload")}</h3>
              </div>
              <button type="button" onClick={() => setShowAttachModal(false)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>

            {catalog?.active_route_count === 0 ? (
              <p role="alert" className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                Chưa có Storage Route đang hoạt động. Không thể chuẩn bị thư mục hoặc gắn file.
              </p>
            ) : (
              <div className="space-y-4 text-xs">
                {/* Step 1: Prepare Folder */}
                <div className="rounded-xl border p-3.5 bg-muted/20 space-y-2">
                  <span className="font-semibold block text-foreground">Bước 1: Chuẩn bị folder theo Storage Route</span>
                  <p className="text-muted-foreground text-[11px]">Hệ thống sẽ tạo hoặc định vị chính xác thư mục trên Google Drive / OneDrive theo quy chuẩn.</p>
                  <button
                    className={buttonClass}
                    type="button"
                    disabled={busy || !catalog || confidentialBlocked}
                    onClick={() => void providerAction('prepare_folder')}
                  >
                    {translate("Tạo / mở folder lưu trữ")}
                  </button>
                  {folderUrl && (
                    <p className="text-xs break-all pt-1.5">
                      {translate("Folder:")}
                      <a className="inline-flex min-h-8 items-center break-all text-primary underline font-medium ml-1" href={folderUrl} target="_blank" rel="noopener noreferrer">
                        {folderPath || folderUrl}
                      </a>
                    </p>
                  )}
                </div>

                {/* Step 2: Attach Existing File */}
                <div className="rounded-xl border p-3.5 bg-muted/20 space-y-2">
                  <span className="font-semibold block text-foreground">Bước 2: Gắn file đã tải lên provider</span>
                  <label className="block">
                    <span className="mb-1 block font-medium">{translate("File ID hoặc link Google Drive của file trong folder trên")}</span>
                    <input className={fieldClass} value={externalInput} onChange={event => setExternalInput(event.target.value)}
                      placeholder="File ID / https://drive.google.com/file/d/..." />
                  </label>
                  <button
                    className={buttonClass}
                    type="button"
                    disabled={busy || !catalog || !externalInput.trim() || confidentialBlocked}
                    onClick={() => void providerAction('attach_existing')}
                  >
                    {translate("Liên kết file đã tải lên")}
                  </button>
                  <p className="text-[11px] text-muted-foreground pt-1">
                    {translate("File gắn bằng ID được kiểm tra parent folder; checksum nội dung chưa được xác nhận (integrity_status = provider_reference). Chỉ dùng file có nguồn đáng tin cậy.")}
                  </p>
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-3 border-t">
              <button type="button" onClick={() => setShowAttachModal(false)} className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted">
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal D: System Export Modal */}
      {showExportModal && canExport && catalog?.categories.some(item => item.id === 'system_export') && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto" role="dialog" aria-modal="true">
          <div className="max-w-lg w-full rounded-2xl border bg-background p-6 shadow-2xl space-y-4 animate-in fade-in-50 zoom-in-95">
            <div className="flex items-center justify-between border-b pb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-purple-600" />
                <h3 className="font-bold text-base text-foreground">{translate("System Export — Admin")}</h3>
              </div>
              <button type="button" onClick={() => setShowExportModal(false)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              {catalog.confidential_write_ready !== true && (
                <p role="status" className="rounded-md border border-amber-300 bg-amber-50 p-2.5 text-amber-900">
                  {translate("System Export chưa được phép lưu vào provider khi quyền chia sẻ chưa được phê duyệt.")}
                </p>
              )}
              <p className="text-muted-foreground">
                {translate("Xuất bản snapshot JSON của một ngày vận hành theo Brand / Platform / Internal hoặc Agency, gồm Shift, Report, KPI timeline và metadata bằng chứng. Không phải backup toàn bộ database. Khi vượt giới hạn hệ thống sẽ báo lỗi thay vì xuất thiếu bản ghi.")}
              </p>

              <button
                className={cn(buttonClass, "bg-primary text-primary-foreground hover:bg-primary/90")}
                type="button"
                disabled={busy || catalog.confidential_write_ready !== true || Boolean(shiftId.trim()) || Boolean(campaignId) || !brandId || !platformId}
                onClick={() => void generateSystemExport()}
              >
                {busy && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
                <span>{translate("Xuất dữ liệu ngày đang chọn lên Drive")}</span>
              </button>

              {exportCounts && (
                <div className="rounded-lg border bg-muted/30 p-2.5 space-y-1 font-mono text-[11px]">
                  <p className="font-semibold text-foreground">Kết quả snapshot:</p>
                  <p role="status" className="break-words">
                    {Object.entries(exportCounts).map(([key, value]) => `${key}: ${value}`).join(' · ')}
                  </p>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t">
              <button type="button" onClick={() => setShowExportModal(false)} className="rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted">
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
