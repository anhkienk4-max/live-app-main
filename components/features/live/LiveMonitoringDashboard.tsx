'use client'

import * as React from 'react'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'
import { useShiftChangeRefresh } from '@/lib/hooks/useShiftChangeRefresh'
import { useListPagination } from '@/lib/hooks/useListPagination'
import { HistoryPagination } from '@/components/ui/history-pagination'
import { format } from 'date-fns'
import { AlertCircle, Radio, DollarSign, FileText, Filter, RotateCcw, TrendingUp, RefreshCw, WifiOff, Clock, User as UserIcon } from 'lucide-react'
import { shiftService } from '@/lib/services/dataService'
import { getOperationalReferences, operationalReferenceIdentity } from '@/lib/services/operationalReferences'
import { invalidatePageCache } from '@/lib/services/operationsPageCache'
import { Brand, Campaign, DashboardUpdate, Platform, Shift, ShiftRegistration, User } from '@/lib/types/database.types'
import { useTranslation } from '@/lib/i18n'
import { formatCurrency } from '@/lib/utils/currency'
import { getCurrentBusinessDate, formatShiftTimeRange } from '@/lib/utils/shiftUtils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { MultiSelectFilter } from '@/components/ui/multi-select-filter'

import { LiveSessionModal } from './LiveSessionModal'
import { PageLoadError } from '@/components/ui/page-load-error'

export type LiveSessionStatus = Shift['status']

export function getLiveStatusConfig(status: Shift['status']) {
  switch (status) {
    case 'live':
      return {
        labelKey: 'liveStatus',
        defaultLabel: 'Đang Live',
        badgeClass: 'bg-red-500 text-white border-red-600 shadow-sm animate-pulse font-semibold',
        dotClass: 'bg-white animate-ping',
        indicatorClass: 'text-red-600',
      }
    case 'preparing':
      return {
        labelKey: 'preparing',
        defaultLabel: 'Chuẩn bị',
        badgeClass: 'bg-amber-100 text-amber-900 border-amber-300 font-medium',
        dotClass: 'bg-amber-500',
        indicatorClass: 'text-amber-600',
      }
    case 'scheduled':
      return {
        labelKey: 'scheduled',
        defaultLabel: 'Đã lên lịch',
        badgeClass: 'bg-sky-50 text-sky-800 border-sky-200 font-medium',
        dotClass: 'bg-sky-500',
        indicatorClass: 'text-sky-600',
      }
    case 'paused':
      return {
        labelKey: 'paused',
        defaultLabel: 'Tạm dừng',
        badgeClass: 'bg-orange-100 text-orange-900 border-orange-300 font-medium',
        dotClass: 'bg-orange-500',
        indicatorClass: 'text-orange-600',
      }
    case 'completed':
      return {
        labelKey: 'completed',
        defaultLabel: 'Hoàn thành',
        badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200 font-medium',
        dotClass: 'bg-emerald-500',
        indicatorClass: 'text-emerald-600',
      }
    case 'cancelled':
      return {
        labelKey: 'cancelled',
        defaultLabel: 'Đã huỷ',
        badgeClass: 'bg-slate-100 text-slate-600 border-slate-200 font-medium',
        dotClass: 'bg-slate-400',
        indicatorClass: 'text-slate-400',
      }
    default:
      return {
        labelKey: status,
        defaultLabel: status,
        badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
        dotClass: 'bg-slate-400',
        indicatorClass: 'text-slate-400',
      }
  }
}

type Filters = { date: string; brandIds: string[]; platformIds: string[]; campaignIds: string[]; hostIds: string[]; supportIds: string[]; technicalIds: string[]; statuses: Shift['status'][] }
const todayValue = () => getCurrentBusinessDate()
const initialFilters = (): Filters => ({ date: todayValue(), brandIds: [], platformIds: [], campaignIds: [], hostIds: [], supportIds: [], technicalIds: [], statuses: [] })

export function LiveMonitoringDashboard() {
  const { t } = useTranslation()
  const { currentUser } = useCurrentUser()
  const identity = currentUser ? operationalReferenceIdentity(currentUser) : ''
  const [loadedIdentity, setLoadedIdentity] = React.useState('')
  const lastLoadedScope = React.useRef('')
  const [shifts, setShifts] = React.useState<Shift[]>([])
  const [refreshVersion, setRefreshVersion] = React.useState(0)
  const [updates, setUpdates] = React.useState<Record<string, DashboardUpdate[]>>({})
  const [brands, setBrands] = React.useState<Brand[]>([])
  const [platforms, setPlatforms] = React.useState<Platform[]>([])
  const [campaigns, setCampaigns] = React.useState<Campaign[]>([])
  const [users, setUsers] = React.useState<User[]>([])
  const [registrations, setRegistrations] = React.useState<ShiftRegistration[]>([])
  const [filters, setFilters] = React.useState<Filters | null>(null)
  const [showFilters, setShowFilters] = React.useState(false)
  const [selectedShift, setSelectedShift] = React.useState<Shift | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [isRevalidating, setIsRevalidating] = React.useState(false)
  const [loadError, setLoadError] = React.useState<unknown>(null)
  const [isOnline, setIsOnline] = React.useState(typeof navigator !== 'undefined' ? navigator.onLine : true)
  const [lastSuccessTime, setLastSuccessTime] = React.useState<number | null>(null)
  const [isStale, setIsStale] = React.useState(false)

  const pagination = useListPagination('live', 10)
  const { page, pageSize, navigate } = pagination
  const [total, setTotal] = React.useState(0)
  const sequence = React.useRef(0)
  const liveController = React.useRef<AbortController | null>(null)
  const focusRefreshAt = React.useRef(0)
  const snapshotFingerprint = React.useRef<string | null>(null)
  const [hasEverLoaded, setHasEverLoaded] = React.useState(false)

  const encodedFilters = JSON.stringify(filters ? {
    from: filters.date || undefined,
    to: filters.date || undefined,
    brandIds: filters.brandIds,
    platformIds: filters.platformIds,
    campaignIds: filters.campaignIds,
    hostIds: filters.hostIds,
    supportIds: filters.supportIds,
    technicalIds: filters.technicalIds,
    statuses: filters.statuses,
  } : {})

  React.useEffect(() => {
    const frame = requestAnimationFrame(() => setFilters(initialFilters()))
    return () => cancelAnimationFrame(frame)
  }, [])



  // Static directories are fetched once per identity.
  React.useEffect(() => {
    let active = true
    if (!currentUser || !identity) return
    void getOperationalReferences(currentUser).then(refs => {
      if (!active) return
      setBrands(refs.brands)
      setPlatforms(refs.platforms)
      setCampaigns(refs.campaigns)
      setUsers(refs.users)
    }).catch(error => {
      if (active) setLoadError(error)
    })
    return () => { active = false }
  }, [currentUser, identity])

  const loadData = React.useCallback(async () => {
    if (!filters || !identity || (typeof document !== 'undefined' && document.visibilityState === 'hidden')) return
    liveController.current?.abort()
    const controller = new AbortController()
    liveController.current = controller
    const request = ++sequence.current
    const scopeKey = identity + ':' + encodedFilters + ':' + page + ':' + pageSize
    const isScopeChanged = (loadedIdentity !== '' && identity !== loadedIdentity) || (lastLoadedScope.current !== '' && lastLoadedScope.current !== scopeKey)
    if (isScopeChanged) {
      setHasEverLoaded(false)
      setShifts([])
      setUpdates({})
      setSelectedShift(null)
      setLoading(true)
    } else if (hasEverLoaded) {
      setIsRevalidating(true)
    } else {
      setLoading(true)
    }
    setLoadError(null)
    try {
      const result = await shiftService.getLivePage({ page, pageSize, filters: JSON.parse(encodedFilters) }, controller.signal)
      if (request !== sequence.current || controller.signal.aborted) return
      setLoadedIdentity(identity)
      lastLoadedScope.current = scopeKey
      setShifts(result.items)
      setTotal(result.total)
      setHasEverLoaded(true)
      setLastSuccessTime(Date.now())
      if (result.page !== page) navigate({ live_page: String(result.page) }, true)
      setRegistrations(result.registrations)
      setUpdates(Object.fromEntries(result.items.map(shift => [shift.id, result.updates.filter(update => update.shift_id === shift.id)])))
      // A 30-second poll without new snapshots must not restart the modal loader.
      const fingerprint = JSON.stringify(result.updates.map(update => [update.id, update.updated_at, update.time]).sort((a, b) => String(a[0]).localeCompare(String(b[0]))))
      if (snapshotFingerprint.current!==fingerprint) {
        snapshotFingerprint.current = fingerprint
        setRefreshVersion(version => version + 1)
      }
    } catch (error) {
      if (request === sequence.current && !controller.signal.aborted) {
        setLoadError(error)
      }
    } finally {
      if (request === sequence.current && !controller.signal.aborted) {
        setLoading(false)
        setIsRevalidating(false)
      }
    }
  }, [encodedFilters, filters, hasEverLoaded, identity, loadedIdentity, navigate, page, pageSize])
  useShiftChangeRefresh(loadData)

  React.useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true)
      void loadData()
    }
    const handleOffline = () => {
      setIsOnline(false)
    }
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [loadData])

  React.useEffect(() => {
    const frame = requestAnimationFrame(() => { void loadData() })
    const thisSequence = sequence
    return () => {
      cancelAnimationFrame(frame)
      liveController.current?.abort()
      ++thisSequence.current
    }
  }, [loadData])

  const handleShiftUpdate = React.useCallback(async (updatedShift?: Shift) => {
    // Shift mutations must invalidate the cross-page cache immediately.
    invalidatePageCache()
    await loadData()
    if (updatedShift) setSelectedShift(prev => prev?.id === updatedShift.id ? updatedShift : prev)
  }, [loadData])

  React.useEffect(() => {
    const tick=()=>{
      if(document.visibilityState!=='visible')return
      void loadData()
    }
    const resume=()=>{
      if(document.visibilityState!=='visible')return
      const now=Date.now()
      if(now-focusRefreshAt.current<1000)return
      focusRefreshAt.current=now
      void loadData()
    }
    const interval=window.setInterval(tick,30000)
    document.addEventListener('visibilitychange',resume)
    window.addEventListener('focus',resume)
    return ()=>{
      window.clearInterval(interval)
      document.removeEventListener('visibilitychange',resume)
      window.removeEventListener('focus',resume)
    }
  },[loadData])

  const roleOptions = (role: 'host' | 'support' | 'technical') => users.filter(user => user.operational_roles?.includes(role)).map(user => ({ id: user.id, name: user.full_name }))
  const nameFor = (items: Array<{ id: string; name: string }>, id?: string) => id ? items.find(item => item.id === id)?.name || '—' : '—'
  const userName = (id?: string) => id ? users.find(user => user.id === id)?.full_name || '—' : '—'
  const statusLabel = (status: Shift['status']) => {
    return status === 'live' ? t('liveStatus') : t(status as 'scheduled')
  }

  const filtered = shifts
  const latestUpdate = (shiftId: string) => [...(updates[shiftId] || [])].sort((a, b) => b.time.localeCompare(a.time))[0]
  const revenueValues = filtered.flatMap(shift => { const value = latestUpdate(shift.id)?.revenue; return value == null ? [] : [value] })
  const totalRevenue = revenueValues.length ? revenueValues.reduce((sum, value) => sum + value, 0) : null
  const orderValues = filtered.flatMap(shift => { const value = latestUpdate(shift.id)?.orders; return value == null ? [] : [value] })
  const totalOrders = orderValues.length ? orderValues.reduce((sum, value) => sum + value, 0) : null
  const activeShift = filtered.find(shift => shift.id === selectedShift?.id) ?? filtered.find(shift => shift.status === 'live') ?? filtered[0]

  // Stale detection via timer (pure render)
  React.useEffect(() => {
    const checkStale = () => {
      if (lastSuccessTime !== null) {
        setIsStale(Date.now() - lastSuccessTime > 90000)
      }
    }
    const interval = window.setInterval(checkStale, 10000)
    checkStale()
    return () => window.clearInterval(interval)
  }, [lastSuccessTime])

  return (
    <div className="space-y-4">
      {/* 1. Header / Control Strip */}
      <div className="flex flex-col gap-3 border-b pb-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <h2 className="text-base font-semibold tracking-tight text-slate-900">{t('liveMonitor')}</h2>
            {!isOnline && (
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                <WifiOff className="h-3 w-3" /> Ngoại tuyến
              </span>
            )}
            {isRevalidating && (
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-blue-600">
                <RefreshCw className="h-3 w-3 animate-spin" /> Đang đồng bộ...
              </span>
            )}
            {isStale && !isRevalidating && isOnline && (
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                <Clock className="h-3 w-3" /> Dữ liệu quá hạn
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {t('todaysDate')}: {format(new Date(), 'dd/MM/yyyy')}
            {total > 0 && <span className="ml-2 font-medium text-slate-700">· {total} {t('shifts') || 'phiên'}</span>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void loadData()}
            disabled={isRevalidating || !isOnline}
            title={t('refresh')}
            className="h-8"
          >
            <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${isRevalidating ? 'animate-spin' : ''}`} />
            <span className="hidden sm:inline">{t('refresh') || 'Làm mới'}</span>
          </Button>
          <Button
            variant={showFilters ? 'default' : 'outline'}
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
            aria-expanded={showFilters}
            aria-controls="live-filter-panel"
            data-testid="live-filter-toggle"
            className="h-8"
          >
            <Filter className="mr-1.5 h-3.5 w-3.5" />
            {t('filters')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setFilters(initialFilters())}
            className="h-8"
          >
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
            <span className="hidden sm:inline">{t('resetFilters')}</span>
          </Button>
        </div>
      </div>

      {/* 2. Filter Experience */}
      {showFilters && filters ? (
        <div id="live-filter-panel" className="grid grid-cols-2 gap-4 rounded-lg border bg-muted/20 p-4 md:grid-cols-4 lg:grid-cols-7 lg:gap-6">
          <label className="flex flex-col gap-1.5 text-xs font-medium">
            {t('date')}
            <Input className="mt-1" type="date" value={filters.date} onChange={event => setFilters(current => current ? { ...current, date: event.target.value } : current)} />
          </label>
          <FilterSelect label={t('brand')} value={filters.brandIds} options={brands} onChange={value => setFilters(current => current ? { ...current, brandIds: value } : current)} />
          <FilterSelect label={t('platform')} value={filters.platformIds} options={platforms} onChange={value => setFilters(current => current ? { ...current, platformIds: value } : current)} />
          <FilterSelect label={t('campaign')} value={filters.campaignIds} options={campaigns} onChange={value => setFilters(current => current ? { ...current, campaignIds: value } : current)} />
          <FilterSelect label={t('host')} value={filters.hostIds} options={roleOptions('host')} onChange={value => setFilters(current => current ? { ...current, hostIds: value } : current)} />
          <FilterSelect label={t('support')} value={filters.supportIds} options={roleOptions('support')} onChange={value => setFilters(current => current ? { ...current, supportIds: value } : current)} />
          <FilterSelect label={t('technical')} value={filters.technicalIds} options={roleOptions('technical')} onChange={value => setFilters(current => current ? { ...current, technicalIds: value } : current)} />

          <div className="col-span-2 md:col-span-4 lg:col-span-7 border-t pt-4">
            <MultiSelectFilter
              label={t('status')}
              value={filters.statuses}
              onChange={value => setFilters(current => current ? { ...current, statuses: value as Shift['status'][] } : current)}
              options={(['scheduled', 'preparing', 'live', 'paused', 'completed', 'cancelled'] as Shift['status'][]).map(status => ({ value: status, label: statusLabel(status) }))}
              placeholder={t('all')}
              testId="live-status-filter"
            />
          </div>
        </div>
      ) : null}

      {/* Network / Stale / Partial Error Banner */}
      {Boolean(loadError && hasEverLoaded) && (
        <div className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" />
            <span>Không thể đồng bộ phiên live mới nhất. Đang hiển thị bản dữ liệu lưu tạm.</span>
          </div>
          <Button size="sm" variant="outline" className="h-7 text-xs bg-white hover:bg-amber-100" onClick={() => void loadData()}>Thử lại</Button>
        </div>
      )}

      {/* Initial Load Error */}
      {loadError && !hasEverLoaded ? (
        <PageLoadError error={loadError instanceof Error ? loadError : new Error(String(loadError))} onRetry={() => { setLoading(true); void loadData() }} />
      ) : loading && !hasEverLoaded ? (
        /* Progressive Initial Skeleton */
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-5">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-14 animate-pulse rounded-md border border-slate-200 bg-slate-100" />
            ))}
          </div>
          <div className="h-20 animate-pulse rounded-lg border border-slate-200 bg-slate-100" />
          <div className="h-96 animate-pulse rounded-lg border border-slate-200 bg-slate-100" />
        </div>
      ) : (
        /* Loaded Content */
        <div className="space-y-4">
          {/* 3. Metric / Status Strip */}
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center justify-between gap-1 text-[11px] text-muted-foreground px-0.5">
              <span>Chỉ số tính trong trang hiện tại ({filtered.length} phiên · tổng {total} phiên toàn hệ thống)</span>
              {total > pageSize && (
                <span className="rounded border border-blue-200 bg-blue-50 px-2 py-0.5 text-blue-700 font-medium">
                  Trang {page} / {Math.max(1, Math.ceil(total / pageSize))}
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-5">
              <Metric
                title={t('liveInProgress')}
                value={filtered.filter(shift => shift.status === 'live').length.toString()}
                icon={<Radio className="h-5 w-5 text-red-600" />}
                intent="danger"
                scope="Trong trang hiện tại"
              />
              <Metric
                title={t('updatesMissing')}
                value={filtered.filter(shift => shift.status === 'live' && !latestUpdate(shift.id)).length.toString()}
                icon={<AlertCircle className="h-5 w-5 text-amber-600" />}
                intent="warning"
                scope="Trong trang hiện tại"
              />
              <Metric
                title={t('revenue')}
                value={totalRevenue === null ? '—' : formatCurrency(totalRevenue)}
                icon={<DollarSign className="h-5 w-5 text-green-600" />}
                scope="Trong trang hiện tại"
              />
              <Metric
                title={t('orders')}
                value={totalOrders === null ? '—' : totalOrders.toLocaleString()}
                icon={<TrendingUp className="h-5 w-5 text-blue-600" />}
                scope="Trong trang hiện tại"
              />
              <Metric
                title={t('needsReview')}
                value={filtered.filter(shift => shift.status === 'completed').length.toString()}
                icon={<FileText className="h-5 w-5 text-muted-foreground" />}
                scope="Trong trang hiện tại"
              />
            </div>
          </div>

          {/* 4. Session Selector Cards */}
          {filtered.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Danh sách phiên live trong ngày
                </p>
                <p className="text-xs text-muted-foreground">{t('currentPage')}</p>
              </div>

              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {filtered.map(shift => {
                  const isSelected = activeShift?.id === shift.id
                  const statusCfg = getLiveStatusConfig(shift.status)
                  const hostName = userName(shift.host_id)
                  const supportName = userName(shift.support_id)
                  return (
                    <button
                      key={shift.id}
                      type="button"
                      onClick={() => setSelectedShift(shift)}
                      data-testid={`open-live-session-${shift.id}`}
                      className={`group relative flex flex-col justify-between rounded-lg border p-3 text-left transition-all ${
                        isSelected
                          ? 'border-blue-600 bg-blue-50/40 ring-1 ring-blue-600 shadow-sm'
                          : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/60'
                      }`}
                    >
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <span className="font-semibold text-xs text-slate-900 group-hover:text-blue-600 line-clamp-1">
                            {shift.title || nameFor(brands, shift.brand_id)}
                          </span>
                          <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide ${statusCfg.badgeClass}`}>
                            {shift.status === 'live' && <span className="h-1.5 w-1.5 rounded-full bg-white animate-ping" />}
                            {statusLabel(shift.status)}
                          </span>
                        </div>

                        <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-slate-500">
                          <span className="font-medium text-slate-700">{nameFor(platforms, shift.platform_id)}</span>
                          <span>·</span>
                          <span>{formatShiftTimeRange(shift)}</span>
                        </div>
                      </div>

                      <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2 text-[11px] text-slate-500">
                        <div className="flex items-center gap-1 truncate" title={`Host: ${hostName}`}>
                          <UserIcon className="h-3 w-3 shrink-0 text-slate-400" />
                          <span className="truncate">{hostName !== '—' ? hostName : (supportName !== '—' ? supportName : 'Chưa phân công')}</span>
                        </div>
                        {isSelected && (
                          <span className="text-[10px] font-semibold text-blue-600 shrink-0">Đang chọn</span>
                        )}
                      </div>
                    </button>
                  )
                })}
              </div>

              <HistoryPagination
                page={page}
                pageSize={pageSize}
                total={total}
                onPageChange={pagination.setPage}
                onPageSizeChange={pagination.setPageSize}
              />
            </div>
          )}

          {/* 5. Live Session Console / Empty State */}
          <div className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white">
            {activeShift ? (
              <LiveSessionModal
                key={activeShift.id}
                refreshVersion={refreshVersion}
                inline
                open
                shift={activeShift}
                brands={brands}
                platforms={platforms}
                campaigns={campaigns}
                users={users}
                registrations={registrations}
                onOpenChange={open => !open && setSelectedShift(null)}
                onUpdate={handleShiftUpdate}
              />
            ) : (
              <div className="flex flex-col items-center justify-center p-12 text-center">
                <Radio className="mb-3 h-10 w-10 text-slate-400" />
                <p className="text-base font-semibold text-slate-700">{t('noLiveShifts')}</p>
                <p className="mt-1 text-sm text-slate-500">Không có phiên livestream nào phù hợp với bộ lọc hiện tại.</p>
                <Button variant="outline" size="sm" className="mt-4" onClick={() => setFilters(initialFilters())}>
                  <RotateCcw className="mr-2 h-4 w-4" />{t('resetFilters')}
                </Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function FilterSelect({ label, value, options, onChange }: { label: string; value: string[]; options: Array<{ id: string; name: string }>; onChange: (value: string[]) => void }) {
  return <MultiSelectFilter label={label} value={value} onChange={onChange} options={options.map(option => ({ value: option.id, label: option.name }))} />
}

function Metric({ title, value, icon, intent = 'default', scope }: { title: string; value: string; icon: React.ReactNode; intent?: 'default' | 'danger' | 'warning'; scope?: string }) {
  const intentStyles = {
    default: 'bg-card',
    danger: 'bg-red-50/50 border-red-200 dark:bg-red-950/20 dark:border-red-900',
    warning: 'bg-amber-50/50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-900',
  }
  return (
    <div className={`flex flex-col justify-between rounded-md border px-3 py-2 ${intentStyles[intent]}`}>
      <div className="flex items-center justify-between gap-1">
        <p className="text-[10px] font-semibold uppercase text-muted-foreground truncate">{title}</p>
        {scope && <span className="text-[9px] text-slate-400 font-normal shrink-0">({scope})</span>}
      </div>
      <div className="mt-1 flex items-center justify-between gap-2">
        <span className="text-sm font-bold">{value}</span>
        {icon}
      </div>
    </div>
  )
}
