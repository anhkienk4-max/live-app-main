'use client'

import * as React from 'react'
import { useRequestSequence } from '@/lib/hooks/useRequestSequence'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Eye, Filter, History, RotateCcw, ShieldAlert } from 'lucide-react'
import { AuditAction, AuditLog, AuditModule, DeletionImpact } from '@/lib/types/database.types'
import { auditService, type AuditLogFilters } from '@/lib/services/auditService'
import { ArchivedEntitySummary, brandService, lifecycleService } from '@/lib/services/dataService'
import type { AuditHistoryCursor } from '@/lib/services/supabaseAuditService'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'
import { hasAnyPermission, hasPermission, resolveSystemPermission } from '@/lib/permissions'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { LifecycleActionDialog } from '@/components/ui/lifecycle-action-dialog'
import { PageLoadError } from '@/components/ui/page-load-error'
import { useToast } from '@/components/ui/toast'
import { HistoryPagination } from '@/components/ui/history-pagination'
import { useTranslation } from '@/lib/i18n'
import { MultiSelectFilter } from '@/components/ui/multi-select-filter'
import {
  auditEntityHref,
  classifyOperationStatus,
  getErrorRecoveryContext,
  getSafeMetadata,
  sanitizeMetadata,
  normalizeAuditActor,
  normalizeAuditAction,
  normalizeAuditModule,
  normalizeTimestamp,
  statusBadgeClass,
} from '@/lib/utils/auditNormalize'

const actions: AuditAction[] = ['create', 'update', 'delete', 'soft_delete', 'restore', 'archive', 'unarchive', 'confirm', 'unconfirm', 'approve', 'reject', 'assign', 'unassign', 'register', 'cancel_registration', 'lock', 'reopen', 'import', 'export', 'ocr_run', 'ocr_rerun', 'ocr_reset', 'upload', 'remove_upload']
const modules: AuditModule[] = ['calendar', 'live', 'reports', 'staff', 'brands', 'platforms', 'campaigns', 'swaps', 'imports', 'settings']
type AuditHistoryFilters = { query: string; from: string; to: string; actorIds: string[]; brandIds: string[]; roles: string[]; modules: string[]; actions: string[]; statuses: string[]; sources: string[] }

function readAuditCursor(params: URLSearchParams, prefix = 'cursor'): AuditHistoryCursor | null {
  const created_at = params.get(`${prefix}_at`)
  const id = params.get(`${prefix}_id`)
  const snapshot_at = params.get(`${prefix}_snapshot`)
  return created_at && id && snapshot_at ? { created_at, id, snapshot_at } : null
}

function isAuditCursor(value: unknown): value is AuditHistoryCursor {
  return Boolean(value && typeof value === 'object' && 'created_at' in value && 'id' in value && 'snapshot_at' in value
    && typeof value.created_at === 'string' && typeof value.id === 'string' && typeof value.snapshot_at === 'string')
}

function auditCursorHistoryKey(identity: string, filters: AuditHistoryFilters, sort: string, pageSize: number, cursor: AuditHistoryCursor | null) {
  return `livestream-ops-audit-cursors:${JSON.stringify([identity, filters, sort, pageSize, cursor])}`
}

function readAuditFilters(params: URLSearchParams): AuditHistoryFilters {
  return {
    query: params.get('q') ?? '', from: params.get('from') ?? '', to: params.get('to') ?? '',
    actorIds: params.getAll('actor'), brandIds: params.getAll('brand'), roles: params.getAll('role'),
    modules: params.getAll('module'), actions: params.getAll('action'), statuses: params.getAll('status'), sources: params.getAll('source'),
  }
}

export async function requireRestoreSuccess(restore: () => Promise<boolean | null>): Promise<void> {
  if (!await restore()) throw new Error('Restore operation failed silently')
}

export function AuditHistory() {
  const { currentUser, loading: userLoading } = useCurrentUser()
  const { toast } = useToast()
  const { t } = useTranslation()
  const router = useRouter()
  const searchParams = useSearchParams()
  const searchString = searchParams.toString()
  const initialParams = new URLSearchParams(searchString)
  const [logs, setLogs] = React.useState<AuditLog[]>([])
  const [actors, setActors] = React.useState<Array<{ id: string; name: string }>>([])
  const [brands, setBrands] = React.useState<Awaited<ReturnType<typeof brandService.getAll>>>([])
  const [brandLoadFailed, setBrandLoadFailed] = React.useState(false)
  const [pageSize, setPageSize] = React.useState(() => [10, 20, 50].includes(Number(initialParams.get('size'))) ? Number(initialParams.get('size')) : 20)
  const [sort, setSort] = React.useState<'newest' | 'oldest'>(initialParams.get('sort') === 'oldest' ? 'oldest' : 'newest')
  const [cursor, setCursor] = React.useState(() => readAuditCursor(initialParams))
  const [cursorHistory, setCursorHistory] = React.useState<Array<AuditHistoryCursor | null>>([])
  const [nextCursor, setNextCursor] = React.useState<AuditHistoryCursor | null>(null)
  const [hasMore, setHasMore] = React.useState(false)
  const [range, setRange] = React.useState<{ from: string; to: string } | null>(null)
  const [archivedTotal,setArchivedTotal]=React.useState(0)
  const [archived, setArchived] = React.useState<ArchivedEntitySummary[]>([])
  const [archivedPage, setArchivedPage] = React.useState(1)
  const [archivedPageSize, setArchivedPageSize] = React.useState(10)
  const [selected, setSelected] = React.useState<AuditLog | null>(null)
  const [restoreTarget, setRestoreTarget] = React.useState<ArchivedEntitySummary | null>(null)
  const [filters, setFilters] = React.useState(() => readAuditFilters(initialParams))
  const [showFilters, setShowFilters] = React.useState(false)
  const [loading, setLoading] = React.useState(true)
  const [loadError, setLoadError] = React.useState<unknown>(null)
  const [teamCapabilityDenied, setTeamCapabilityDenied] = React.useState(false)
  const controllerRef = React.useRef<AbortController | null>(null)
  const lastWrittenSearch = React.useRef<string | null>(null)
  const returnRefreshScheduled = React.useRef(false)
  const identityRef = React.useRef<string | null>(null)
  const clearAuditSurface = React.useCallback(() => {
    setLogs([]); setSelected(null)
    setArchived([]); setArchivedTotal(0); setRestoreTarget(null)
  }, [])

  const identity=currentUser?currentUser.id+':'+(currentUser.system_permission??currentUser.role):''
  const canView = Boolean(currentUser && hasAnyPermission(currentUser, ['audit.view', 'audit.view_team']))
  const isAdmin = Boolean(currentUser && hasPermission(currentUser, 'audit.view'))
  const {next,isCurrent,invalidate}=useRequestSequence()

  React.useEffect(() => {
    if (!canView || userLoading) return
    let active = true
    void brandService.getAll().then(items => { if (active) { setBrands(items); setBrandLoadFailed(false) } }).catch(() => { if (active) setBrandLoadFailed(true) })
    return () => { active = false }
  }, [canView, identity, userLoading])

  const writeUrl = React.useCallback((nextFilters: typeof filters, nextSort: typeof sort, nextPageSize: number, nextPageCursor: AuditHistoryCursor | null, mode: 'push' | 'replace') => {
    const params = new URLSearchParams()
    if (nextFilters.query) params.set('q', nextFilters.query)
    if (nextFilters.from) params.set('from', nextFilters.from)
    if (nextFilters.to) params.set('to', nextFilters.to)
    for (const [key, values] of Object.entries({ actor: nextFilters.actorIds, brand: nextFilters.brandIds, role: nextFilters.roles, module: nextFilters.modules, action: nextFilters.actions, status: nextFilters.statuses, source: nextFilters.sources })) {
      for (const value of values) params.append(key, value)
    }
    if (nextSort !== 'newest') params.set('sort', nextSort)
    if (nextPageSize !== 20) params.set('size', String(nextPageSize))
    if (nextPageCursor) {
      params.set('cursor_at', nextPageCursor.created_at)
      params.set('cursor_id', nextPageCursor.id)
      params.set('cursor_snapshot', nextPageCursor.snapshot_at)
    }
    const url = `${window.location.pathname}${params.size ? `?${params}` : ''}`
    lastWrittenSearch.current = params.toString()
    router[mode](url, { scroll: false })
  }, [router])

  React.useEffect(() => {
    if (lastWrittenSearch.current === searchString) { lastWrittenSearch.current = null; return }
    const params = new URLSearchParams(searchString)
    setFilters(readAuditFilters(params))
    setSort(params.get('sort') === 'oldest' ? 'oldest' : 'newest')
    const size = Number(params.get('size'))
    setPageSize([10, 20, 50].includes(size) ? size : 20)
    setCursor(readAuditCursor(params))
    setCursorHistory([])
    setActors([])
  }, [searchString])

  React.useEffect(() => {
    if (userLoading) return
    let active = true
    queueMicrotask(() => {
      if (!active) return
      try {
        const value: unknown = JSON.parse(window.sessionStorage.getItem(auditCursorHistoryKey(identity, filters, sort, pageSize, cursor)) || '[]')
        setCursorHistory(Array.isArray(value) ? value.filter((item): item is AuditHistoryCursor | null => item === null || isAuditCursor(item)) : [])
      } catch { setCursorHistory([]) }
    })
    return () => { active = false }
  }, [identity, filters, sort, pageSize, cursor, userLoading])

  const updateFilters = (next: Partial<typeof filters>) => {
    const updated = { ...filters, ...next }
    setFilters(updated)
    setCursor(null); setCursorHistory([]); setNextCursor(null); setActors([])
    writeUrl(updated, sort, pageSize, null, 'replace')
  }

  const [loadedIdentity,setLoadedIdentity]=React.useState('')
  const load = React.useCallback(async () => {
    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    const request=next()
    setLoading(true)
    setLoadError(null)
    clearAuditSurface()
    if (userLoading) {
      setTeamCapabilityDenied(false)
      setLoadedIdentity('')
      if (controllerRef.current === controller) controllerRef.current = null
      return
    }
    if (!currentUser || !canView) {
      setTeamCapabilityDenied(false)
      setLoadedIdentity(identity)
      setLoading(false)
      if (controllerRef.current === controller) controllerRef.current = null
      return
    }
    setTeamCapabilityDenied(false)
    try {
      if (resolveSystemPermission(currentUser) === 'leader'
        && process.env.NEXT_PUBLIC_FEATURE_RBAC01B_AUDIT_TEAM_ENFORCEMENT === 'true') {
        const capability = await fetch('/api/audit/team-capability', { method: 'GET', cache: 'no-store', credentials: 'same-origin', signal: controller.signal })
        if (!isCurrent(request)) return
        if (capability.status === 401 || capability.status === 403) {
          setTeamCapabilityDenied(true); setLoadedIdentity(identity); return
        }
        if (!capability.ok) throw new Error('AUDIT_TEAM_CAPABILITY_UNAVAILABLE')
        const result: unknown = await capability.json()
        if (!result || typeof result !== 'object' || !('allowed' in result) || result.allowed !== true)
          throw new Error('AUDIT_TEAM_CAPABILITY_UNAVAILABLE')
      }
      if (!isCurrent(request)) return
      setTeamCapabilityDenied(false)
      const rpcFilters: AuditLogFilters = {
        ...(filters.query.trim() ? { query: filters.query.trim() } : {}),
        ...(filters.from.trim() ? { from: filters.from.trim() } : {}),
        ...(filters.to.trim() ? { to: filters.to.trim() } : {}),
        ...(filters.actorIds.length ? { actor: filters.actorIds } : {}),
        ...(filters.brandIds.length ? { brand_id: filters.brandIds } : {}),
        ...(filters.roles.length ? { role: filters.roles } : {}),
        ...(filters.modules.length ? { module: filters.modules } : {}),
        ...(filters.actions.length ? { action: filters.actions } : {}),
        ...(filters.statuses.length ? { status: filters.statuses } : {}),
        ...(filters.sources.length ? { source: filters.sources } : {}),
      }
      const [visible, deleted] = await Promise.all([
        auditService.getAuditHistoryPage({ user: currentUser, cursor, pageSize, filters: rpcFilters, sort, signal: controller.signal }),
        isAdmin ? lifecycleService.getArchivedPage(currentUser.id,{page:archivedPage,pageSize:archivedPageSize as 10|20|50}) : Promise.resolve({items:[],total:0,page:1}),
      ])
      if(!isCurrent(request))return
      setLoadedIdentity(identity)
      setLogs(visible.items)
      setSelected(current => current && visible.items.some(item => item.id === current.id) ? current : null)
      setActors(current => [...new Map([...current, ...visible.actors].map(actor => [actor.id, actor])).values()])
      setNextCursor(visible.nextCursor); setHasMore(visible.hasMore); setRange(visible.range)
      setArchived(deleted.items);setArchivedTotal(deleted.total);setArchivedPage(deleted.page)
    } catch (error) {
      if(isCurrent(request) && !controller.signal.aborted && !(error instanceof DOMException && error.name === 'AbortError')){
        clearAuditSurface()
        setActors([])
        setTeamCapabilityDenied(false)
        setLoadedIdentity(identity)
        setLoadError(error)
      }
    } finally {
      if (isCurrent(request)) setLoading(false)
      if (controllerRef.current === controller) controllerRef.current = null
    }
  }, [canView, currentUser, filters, isAdmin, cursor, pageSize, sort, archivedPage, archivedPageSize, identity, userLoading, next, isCurrent, clearAuditSurface])

  React.useEffect(() => {
    const frame = requestAnimationFrame(() => { void load() })
    return () => { cancelAnimationFrame(frame); controllerRef.current?.abort(); invalidate() }
  }, [load,invalidate])

  React.useEffect(() => {
    if (userLoading) return
    if (identityRef.current === null) { identityRef.current = identity; return }
    if (identityRef.current === identity) return
    identityRef.current = identity
    setCursor(null); setCursorHistory([]); setNextCursor(null); setActors([])
    if (identity) writeUrl(filters, sort, pageSize, null, 'replace')
  }, [identity, filters, sort, pageSize, userLoading, writeUrl])

  React.useEffect(() => {
    if (process.env.NEXT_PUBLIC_FEATURE_RBAC01B_AUDIT_TEAM_ENFORCEMENT !== 'true') return
    if (!currentUser || resolveSystemPermission(currentUser) !== 'leader') return
    const onReturn = () => {
      if (returnRefreshScheduled.current) return
      returnRefreshScheduled.current = true
      queueMicrotask(() => { returnRefreshScheduled.current = false; void load() })
    }
    const onVisibility = () => { if (document.visibilityState === 'visible') onReturn() }
    window.addEventListener('focus', onReturn)
    window.addEventListener('pageshow', onReturn)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('focus', onReturn)
      window.removeEventListener('pageshow', onReturn)
      document.removeEventListener('visibilitychange', onVisibility)
      invalidate()
    }
  }, [currentUser, load, invalidate])

  if (userLoading || loading || canView&&identity!==loadedIdentity) return <p className="text-sm text-muted-foreground">{t('loading')}</p>
  const loadErrorCode = loadError && typeof loadError === 'object' && 'code' in loadError ? String(loadError.code) : ''
  if (!currentUser || !canView || teamCapabilityDenied || ['42501', 'PGRST301', '401', '403'].includes(loadErrorCode)) {
    const help = loadErrorCode === 'PGRST301' || loadErrorCode === '401'
      ? 'Your session may have expired. Sign in again to view Audit History.'
      : t('auditAccessDeniedHelp')
    return <Card><CardContent className="flex min-h-64 flex-col items-center justify-center text-center"><ShieldAlert className="mb-3 h-10 w-10 text-amber-600" /><h2 className="font-semibold">{t('accessDenied')}</h2><p className="mt-1 text-sm text-muted-foreground">{help}</p></CardContent></Card>
  }
  if (loadError) {
    const message = loadError instanceof Error && loadError.message === 'AUDIT_TEAM_CAPABILITY_UNAVAILABLE'
      ? loadError.message
      : loadErrorCode === 'PGRST202' || loadErrorCode === '42883'
      ? 'The bounded C12 Audit History endpoint is unavailable in this environment.'
      : loadErrorCode === '57014'
        ? 'The bounded Audit History request timed out. Narrow the date range and retry.'
        : loadErrorCode === '22023'
          ? 'The server rejected an Audit History filter or cursor. Check the filters and retry.'
          : 'Audit History could not be loaded. Your access and saved audit records were not changed.'
    return <PageLoadError error={new Error(message)} onRetry={() => void load()} />
  }

  const archivedTotalPages = Math.max(1, Math.ceil(archivedTotal / archivedPageSize))
  const safeArchivedPage = Math.min(archivedPage, archivedTotalPages)
  const visibleArchived = archived

  const restoreImpact: DeletionImpact | null = restoreTarget ? {
    entity_type: restoreTarget.entity_type,
    entity_id: restoreTarget.entity_id,
    entity_name: restoreTarget.entity_name,
    action: 'archive',
    consequence: t('restoreConsequence'),
    reversible: true,
    related_records: [],
  } : null

  const restore = async (reason: string) => {
    if (!currentUser || !restoreTarget) return
    try {
      await requireRestoreSuccess(() => lifecycleService.restore(restoreTarget.entity_type, restoreTarget.entity_id, currentUser.id, reason, restoreTarget.version))
      toast({ title: t('restored'), description: restoreTarget.entity_name, variant: 'success' })
      setRestoreTarget(null)
      await load()
    } catch (error) {
      toast({ title: t('restoreFailed'), description: error instanceof Error ? error.message : t('validationError'), variant: 'destructive' })
      throw error
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-3"><div><h1 className="flex items-center gap-2 text-xl font-semibold"><History className="h-5 w-5" />{t('auditHistoryTitle')}</h1><p className="text-xs text-muted-foreground">{t('auditHistoryDescription')}</p></div><Button size="sm" variant="outline" onClick={() => { setCursor(null); setCursorHistory([]); setNextCursor(null); setActors([]); writeUrl(filters, sort, pageSize, null, 'push') }}>{t('refresh')}</Button></div>
      <div className="grid gap-3 sm:grid-cols-3"><Meta label="Events on this page" value={String(logs.length)} /><Meta label="Date scope" value={range ? `${range.from} – ${range.to}` : '—'} /><Meta label={t('systemPermissions')} value={resolveSystemPermission(currentUser)} /></div>
      <div className={`grid min-w-0 items-start gap-3 ${selected ? 'xl:grid-cols-[minmax(0,1.5fr)_minmax(360px,1fr)]' : 'grid-cols-1'}`}><div className="min-w-0 space-y-3"><Card><CardHeader className="flex flex-row items-center justify-between space-y-0 px-3 py-2"><div className="flex min-w-0 flex-1 flex-wrap items-center gap-2"><Input className="w-full sm:w-64" aria-label="Search entity name" placeholder="Search entity name" value={filters.query} onChange={event => updateFilters({ query: event.target.value })} /><FilterSelect value={filters.modules} onChange={value => updateFilters({ modules: value })} items={modules.map(value => ({ value, label: value }))} placeholder={t('auditModule')} /><FilterSelect value={filters.actions} onChange={value => updateFilters({ actions: value })} items={actions.map(value => ({ value, label: value.replaceAll('_', ' ') }))} placeholder={t('action')} /></div><Button size="sm" variant={showFilters ? 'default' : 'outline'} onClick={() => setShowFilters(!showFilters)} aria-expanded={showFilters} aria-controls="audit-filter-panel"><Filter className="mr-2 h-4 w-4" />{t('filters')}</Button></CardHeader>{showFilters && <CardContent id="audit-filter-panel" className="grid gap-3 px-3 pb-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="text-xs font-medium">From date<Input aria-label="Audit history from date" type="date" value={filters.from} onChange={event => updateFilters({ from: event.target.value })} /></label>
        <label className="text-xs font-medium">To date<Input aria-label="Audit history to date" type="date" value={filters.to} onChange={event => updateFilters({ to: event.target.value })} /></label>
         <FilterSelect value={filters.actorIds} onChange={value => updateFilters({ actorIds: value })} items={actors.map(actor => ({ value: actor.id, label: actor.name }))} placeholder={t('actor')} />
         {!brandLoadFailed && <FilterSelect value={filters.brandIds} onChange={value => updateFilters({ brandIds: value })} items={brands.filter(brand => !brand.deleted_at && !brand.archived_at).map(brand => ({ value: brand.id, label: brand.name }))} placeholder={t('brand')} />}
         <FilterSelect value={filters.roles} onChange={value => updateFilters({ roles: value })} items={['member','leader','admin'].map(value => ({ value, label: value }))} placeholder={t('role')} />
         <FilterSelect value={filters.statuses} onChange={value => updateFilters({ statuses: value })} items={['success','failed'].map(value => ({ value, label: value }))} placeholder={t('status')} />
         <FilterSelect value={filters.sources} onChange={value => updateFilters({ sources: value })} items={['manual','excel_import','google_sheets','system','ocr','upload'].map(value => ({ value, label: value }))} placeholder={t('source')} />
         {brandLoadFailed && <p role="status" className="text-xs text-muted-foreground">Brand options are unavailable; the Brand filter is disabled.</p>}
         <label className="text-xs font-medium">{t('auditSort')}<Select value={sort} onValueChange={value => { const updatedSort = value as 'newest' | 'oldest'; setSort(updatedSort); setCursor(null); setCursorHistory([]); setNextCursor(null); setActors([]); writeUrl(filters, updatedSort, pageSize, null, 'push') }}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="newest">{t('newestFirst')}</SelectItem><SelectItem value="oldest">{t('oldestFirst')}</SelectItem></SelectContent></Select></label>
      </CardContent>}</Card>

      <Card className="overflow-hidden"><CardContent className="p-0"><div className="max-h-[60vh] overflow-auto"><table className="w-full min-w-[680px] text-xs"><thead className="sticky top-0 z-10 bg-card shadow-sm"><tr className="border-b text-left"><th className="p-2">{t('time')}</th><th className="p-2">{t('actor')}</th><th className="p-2">{t('auditModule')} / {t('action')}</th><th className="p-2">{t('auditEntity')}</th><th className="p-2">{t('status')} / {t('source')}</th><th className="p-2">Correlation</th><th className="p-2">{t('auditDetails')}</th></tr></thead><tbody>{logs.map(entry => {
        const actor = normalizeAuditActor(entry)
        const time = normalizeTimestamp(entry.timestamp).display
        const opStatus = classifyOperationStatus(entry)
        const badge = statusBadgeClass(opStatus)
        const safeModule = normalizeAuditModule(entry.module)
        const safeAction = normalizeAuditAction(entry.action)
        return <tr className="cursor-pointer border-b hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" key={entry.id} tabIndex={0} aria-selected={selected?.id === entry.id} onClick={() => setSelected(entry)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelected(entry) } }}><td className="px-2 py-1.5 whitespace-nowrap">{time}</td><td className="px-2 py-1.5">{actor.name}<p className="text-[10px] text-muted-foreground">{actor.role}</p></td><td className="p-2"><Badge variant="outline">{safeModule}</Badge><p className="mt-1 text-xs">{safeAction.replaceAll('_', ' ')}</p></td><td className="max-w-64 p-2"><p className="truncate font-medium" title={entry.entity_name}>{entry.entity_name}</p><p className="truncate text-[10px] text-muted-foreground" title={entry.entity_id}>{entry.entity_type} · {entry.entity_id}</p></td><td className="p-2"><Badge className={badge} variant="outline">{opStatus}</Badge><p className="mt-1 text-[10px] text-muted-foreground">{entry.source}</p></td><td className="max-w-32 truncate p-2 text-[10px] text-muted-foreground" title={entry.correlation_id}>{entry.correlation_id || '—'}</td><td className="p-2"><Button size="icon" variant="ghost" aria-label={t('viewAuditDetails')} onClick={event => { event.stopPropagation(); setSelected(entry) }}><Eye className="h-4 w-4" /></Button></td></tr>
      })}</tbody></table>{logs.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">{t('noAuditEvents')}</p>}</div><div data-testid="audit-keyset-pagination" className="flex flex-wrap items-center justify-between gap-3 border-t p-3"><p className="text-xs text-muted-foreground">{logs.length} events on this page{hasMore ? ' · More events available' : ''}</p><div className="flex items-center gap-2"><label className="text-xs">Rows<Select value={String(pageSize)} onValueChange={value => { const size = Number(value); setPageSize(size); setCursor(null); setCursorHistory([]); setNextCursor(null); setActors([]); window.localStorage.setItem('livestream-ops-audit-page-size', String(size)); writeUrl(filters, sort, size, null, 'push') }}><SelectTrigger className="h-9 w-20"><SelectValue /></SelectTrigger><SelectContent>{[10,20,50].map(size => <SelectItem key={size} value={String(size)}>{size}</SelectItem>)}</SelectContent></Select></label><Button variant="outline" size="sm" disabled={!cursorHistory.length} onClick={() => { const previous = cursorHistory.at(-1) ?? null; const history = cursorHistory.slice(0, -1); window.sessionStorage.setItem(auditCursorHistoryKey(identity, filters, sort, pageSize, previous), JSON.stringify(history)); setCursorHistory(history); setCursor(previous); writeUrl(filters, sort, pageSize, previous, 'push') }}>Previous</Button><Button variant="outline" size="sm" disabled={!hasMore || !nextCursor} onClick={() => { const history = [...cursorHistory, cursor]; window.sessionStorage.setItem(auditCursorHistoryKey(identity, filters, sort, pageSize, nextCursor), JSON.stringify(history)); setCursorHistory(history); setCursor(nextCursor); writeUrl(filters, sort, pageSize, nextCursor, 'push') }}>Next</Button></div></div></CardContent></Card>

      </div>{selected && <aside className="min-w-0"><AuditDetail key={selected.id} entry={selected} currentUser={currentUser} onClose={() => setSelected(null)} onUpdated={async () => { await load() }} /></aside>}</div>

      {isAdmin && <Card className="overflow-hidden"><CardHeader><CardTitle className="text-base">{t('archivedRecords')}</CardTitle></CardHeader><CardContent className="p-0"><div className="max-h-[420px] space-y-2 overflow-auto px-6 pb-4">{visibleArchived.map(item => <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3" key={`${item.entity_type}-${item.entity_id}`}><div><p className="font-medium">{item.entity_name}</p><p className="text-xs text-muted-foreground">{item.entity_type} · {new Date(item.archived_at).toLocaleString()} · {item.reason || t('noReasonSupplied')}</p></div><Button variant="outline" size="sm" onClick={() => setRestoreTarget(item)}><RotateCcw className="mr-2 h-4 w-4" />{t('restore')}</Button></div>)}{archived.length === 0 && <p className="text-sm text-muted-foreground">{t('noArchivedRecords')}</p>}</div><HistoryPagination page={safeArchivedPage} pageSize={archivedPageSize} total={archivedTotal} onPageChange={setArchivedPage} onPageSizeChange={size => { setArchivedPageSize(size); setArchivedPage(1) }} /></CardContent></Card>}

      <LifecycleActionDialog open={Boolean(restoreTarget)} onOpenChange={open => !open && setRestoreTarget(null)} title={t('restoreRecord')} impact={restoreImpact} confirmText={t('restore')} variant="default" onConfirm={restore} />
    </div>
  )
}

function FilterSelect({ value, onChange, items, placeholder }: { value: string[]; onChange: (value: string[]) => void; items: Array<{ value: string; label: string }>; placeholder: string }) {
  return <MultiSelectFilter label={placeholder} value={value} onChange={onChange} options={items} placeholder={'All ' + placeholder.toLowerCase()} />
}

function AuditDetail({ entry, currentUser, onClose, onUpdated }: { entry: AuditLog; currentUser: NonNullable<ReturnType<typeof useCurrentUser>['currentUser']>; onClose: () => void; onUpdated: () => Promise<void> }) {
  const [detailView,setDetailView] = React.useState<'compare' | 'json' | 'table'>('compare')
  const [saving,setSaving] = React.useState(false)
  const savingRef = React.useRef(false)
  const [note, setNote] = React.useState(entry.admin_note || '')
  const [reviewStatus, setReviewStatus] = React.useState(entry.review_status || 'unreviewed')
  const [handlingReason, setHandlingReason] = React.useState(entry.handling_reason || '')
  const { toast } = useToast()
  const safe = getSafeMetadata(entry)
  const changed = new Set([...Object.keys(safe.before || {}), ...Object.keys(safe.after || {})].filter(key => JSON.stringify(safe.before?.[key]) !== JSON.stringify(safe.after?.[key])))
  const canReview = hasPermission(currentUser, 'audit.review')
  const entityHref = auditEntityHref(entry.entity_type)
  const actor = normalizeAuditActor(entry)
  const time = normalizeTimestamp(entry.timestamp)
  const opStatus = classifyOperationStatus(entry)
  const errorCtx = getErrorRecoveryContext(entry)
  const safeAction = normalizeAuditAction(entry.action)
  const safeModule = normalizeAuditModule(entry.module)
  const save = async () => {
    if (!canReview || savingRef.current) return
    savingRef.current=true;setSaving(true)
    try {
      await auditService.addAdministrativeReview(entry.id, currentUser, { admin_note: note, review_status: reviewStatus, handling_reason: handlingReason })
      toast({title:'Audit review saved',variant:'success'})
      await onUpdated()
    } catch(error) {toast({title:'Không thể lưu đánh giá',description:error instanceof Error?error.message:'Vui lòng thử lại.',variant:'destructive'})}
    finally {savingRef.current=false;setSaving(false)}
  }
  return <Card className="max-h-[calc(100vh-180px)] overflow-auto"><div className="sticky top-0 z-10 border-b bg-white px-4 py-3"><div className="flex items-start justify-between gap-3"><div><h2 className="font-semibold">Audit event · {safeAction.replaceAll('_', ' ')}</h2><p className="text-xs text-muted-foreground">{entry.entity_name} · {entry.correlation_id}</p></div><Button size="sm" variant="outline" onClick={onClose}>Close</Button></div></div><CardContent className="space-y-4 p-3"><div className="grid gap-3 md:grid-cols-3"><Meta label="Actor" value={actor.label} /><Meta label="Module/source" value={`${safeModule} · ${entry.source}`} /><Meta label="Time/status" value={`${time.display} · ${opStatus}`} /></div>{errorCtx.reason && <Meta label="Reason" value={errorCtx.reason} />}{errorCtx.errorCode && <Meta label="Error code" value={errorCtx.errorCode} />}<div className="flex flex-wrap gap-2 text-xs"><Badge variant="outline" className={statusBadgeClass(opStatus)}>{opStatus}</Badge>{errorCtx.retryable && <Badge variant="outline" className="bg-blue-50 text-blue-700">retryable</Badge>}<span className="text-muted-foreground">correlation {errorCtx.correlationId}</span></div>{(errorCtx.references.batchId || errorCtx.references.reportId || errorCtx.references.shiftId || errorCtx.references.requestId) && <div className="rounded-lg border p-3"><p className="mb-2 text-xs font-semibold text-muted-foreground">Recovery references (safe metadata only)</p><div className="grid gap-1 text-xs"><span>entity: {errorCtx.entity.type} · {errorCtx.entity.id}</span>{errorCtx.references.batchId && <span>batch: {errorCtx.references.batchId}</span>}{errorCtx.references.reportId && <span>report: {errorCtx.references.reportId}</span>}{errorCtx.references.shiftId && <span>shift: {errorCtx.references.shiftId}</span>}{errorCtx.references.requestId && <span>request: {errorCtx.references.requestId}</span>}<span>correlation: {errorCtx.references.correlationId}</span></div></div>}<nav className="flex flex-wrap gap-2 border-b pb-3" aria-label="Chi tiết nhật ký">{(['compare','json','table'] as const).map(view=><Button type="button" size="sm" key={view} variant={detailView===view?'secondary':'ghost'} aria-pressed={detailView===view} onClick={()=>setDetailView(view)}>{view==='compare'?'So sánh thay đổi':view==='json'?'Dữ liệu JSON':'Bảng thay đổi'}</Button>)}</nav>{detailView==='compare' && <div className="grid gap-4 lg:grid-cols-2"><Snapshot title="Before" value={safe.before} changed={changed} /><Snapshot title="After" value={safe.after} changed={changed} /></div>}{detailView==='json' && <pre className="max-h-[420px] overflow-auto rounded-lg border bg-muted/20 p-3 text-xs">{JSON.stringify(sanitizeMetadata(entry),null,2)}</pre>}{detailView==='table' && <div className="overflow-x-auto rounded-lg border"><table className="w-full text-xs"><thead className="bg-muted/30 text-left"><tr><th className="p-2">Trường</th><th className="p-2">Trước</th><th className="p-2">Sau</th></tr></thead><tbody>{[...new Set([...Object.keys(safe.before || {}),...Object.keys(safe.after || {})])].map(key=><tr key={key} className={`border-t ${changed.has(key)?'bg-amber-50':''}`}><th className="p-2 text-left align-top">{key}</th><td className="max-w-xs break-all p-2 font-mono">{JSON.stringify(safe.before?.[key]) ?? '—'}</td><td className="max-w-xs break-all p-2 font-mono">{JSON.stringify(safe.after?.[key]) ?? '—'}</td></tr>)}</tbody></table></div>}{errorCtx.relatedRecords.length > 0 && <div><h3 className="mb-2 font-semibold">Related records</h3><ul className="space-y-1">{errorCtx.relatedRecords.map(item => {
          const href = auditEntityHref(item.entity_type)
          return <li className="flex items-center justify-between rounded border p-2 text-sm" key={`${item.entity_type}-${item.entity_id}`}><span>{item.entity_name} {item.count ? `(${item.count})` : ''}<span className="ml-2 text-xs text-muted-foreground">{item.entity_type} · {item.entity_id}</span></span>{href && <Link href={href} className="text-xs font-medium text-primary underline-offset-4 hover:underline">Open</Link>}</li>
        })}</ul></div>}{entityHref && entry.entity_exists && <Button nativeButton={false} render={<Link href={entityHref} />} variant="outline">Open entity</Button>}{canReview && <div className="grid gap-3 rounded-lg border p-4 md:grid-cols-2"><label className="text-sm font-medium">Review status<Select value={reviewStatus} onValueChange={value => setReviewStatus(value as NonNullable<AuditLog['review_status']>)}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent>{['unreviewed','reviewed','action_required','resolved'].map(value => <SelectItem key={value} value={value}>{value.replaceAll('_', ' ')}</SelectItem>)}</SelectContent></Select></label><label className="text-sm font-medium">Handling reason<Input className="mt-1" value={handlingReason} onChange={event => setHandlingReason(event.target.value)} /></label><label className="text-sm font-medium md:col-span-2">Administrative note<Textarea className="mt-1" value={note} onChange={event => setNote(event.target.value)} /></label></div>}</CardContent>{canReview && <div className="flex justify-end border-t p-3"><Button disabled={saving} onClick={() => void save()}>{saving ? 'Đang lưu…' : 'Save review metadata'}</Button></div>}</Card>
}

function Meta({ label, value }: { label: string; value: string }) { return <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 break-words font-medium">{value}</p></div> }
function Snapshot({ title, value, changed }: { title: string; value?: Record<string, unknown>; changed: Set<string> }) {
  const entries = Object.entries(value || {})
  const modified = entries.filter(([key]) => changed.has(key))
  const unchanged = entries.filter(([key]) => !changed.has(key))
  const rows = (items: typeof entries) => <table className="w-full table-fixed text-xs"><tbody>{items.map(([key, field]) => <tr className={changed.has(key) ? 'border-b bg-amber-50' : 'border-b'} key={key}><th className="w-2/5 break-words p-2 text-left align-top">{key}</th><td className="break-all p-2 font-mono">{JSON.stringify(field)}</td></tr>)}</tbody></table>
  return <div className="min-w-0"><h3 className="mb-2 font-semibold">{title}</h3><div className="max-h-[420px] overflow-auto rounded-lg border">{rows(modified)}{unchanged.length > 0 && <details className="border-t"><summary className="cursor-pointer p-2 text-xs text-muted-foreground">Unchanged fields ({unchanged.length})</summary>{rows(unchanged)}</details>}{!value && <p className="p-3 text-muted-foreground">No snapshot.</p>}{value && modified.length === 0 && <p className="p-2 text-xs text-muted-foreground">No changed fields.</p>}</div></div>
}
