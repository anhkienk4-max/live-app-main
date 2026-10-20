'use client'

import * as React from 'react'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'
import { useListPagination } from '@/lib/hooks/useListPagination'
import { HistoryPagination } from '@/components/ui/history-pagination'
import { format, parseISO, subDays } from 'date-fns'
import { AlertCircle, Radio, DollarSign, FileText, Filter, RotateCcw, TrendingUp } from 'lucide-react'
import {
  brandService,
  campaignService,
  platformService,
  shiftService,
  userService,
} from '@/lib/services/dataService'
import { Brand, Campaign, DashboardUpdate, Platform, Shift, ShiftRegistration, User } from '@/lib/types/database.types'
import { useTranslation } from '@/lib/i18n'
import { formatCurrency } from '@/lib/utils/currency'
import { getCurrentBusinessDate, isShiftLiveAt, suggestUniqueLiveShift } from '@/lib/utils/shiftUtils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { MultiSelectFilter } from '@/components/ui/multi-select-filter'

import { LiveSessionModal } from './LiveSessionModal'
import { PageLoadError } from '@/components/ui/page-load-error'

type Filters = { date: string; brandIds: string[]; platformIds: string[]; campaignIds: string[]; hostIds: string[]; supportIds: string[]; technicalIds: string[]; statuses: Shift['status'][] }
const todayValue = () => getCurrentBusinessDate()
const initialFilters = (): Filters => ({ date: todayValue(), brandIds: [], platformIds: [], campaignIds: [], hostIds: [], supportIds: [], technicalIds: [], statuses: [] })

export function LiveMonitoringDashboard() {
  const { t } = useTranslation()
  const {currentUser}=useCurrentUser()
  const identity=currentUser?currentUser.id+':'+(currentUser.system_permission??currentUser.role):''
  const [loadedIdentity,setLoadedIdentity]=React.useState('')
  const [shifts, setShifts] = React.useState<Shift[]>([])
  const [refreshVersion,setRefreshVersion] = React.useState(0)
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
  const [loadError, setLoadError] = React.useState<unknown>(null)

  const pagination=useListPagination('live',10)
  const {page,pageSize,navigate}=pagination
  const [total,setTotal]=React.useState(0)
  const sequence=React.useRef(0)
  const fromDate = filters?.date === todayValue() ? format(subDays(parseISO(filters.date), 1), 'yyyy-MM-dd') : filters?.date
  const encodedFilters=JSON.stringify(filters?{from:fromDate||undefined,to:filters.date||undefined,brandIds:filters.brandIds,platformIds:filters.platformIds,campaignIds:filters.campaignIds,hostIds:filters.hostIds,supportIds:filters.supportIds,technicalIds:filters.technicalIds,statuses:filters.statuses}:{})
  React.useEffect(()=>{const frame=requestAnimationFrame(()=>setFilters(initialFilters()));return()=>cancelAnimationFrame(frame)},[])
  const loadData = React.useCallback(async () => {
    if(!filters||!identity)return
    const request=++sequence.current
    setLoadError(null)
    try {
      const [result,loadedBrands,loadedPlatforms,loadedCampaigns,loadedUsers]=await Promise.all([
        shiftService.getLivePage({page,pageSize,filters:JSON.parse(encodedFilters)}),
        brandService.getAll(),platformService.getAll(),campaignService.getAll(),userService.getAll(),
      ])
      if(request!==sequence.current)return
      setLoadedIdentity(identity)
      setShifts(result.items);setTotal(result.total)
      if(result.page!==page)navigate({live_page:String(result.page)},true)
      setBrands(loadedBrands);setPlatforms(loadedPlatforms);setCampaigns(loadedCampaigns);setUsers(loadedUsers)
      setRegistrations(result.registrations)
      setUpdates(Object.fromEntries(result.items.map(shift=>[shift.id,result.updates.filter(update=>update.shift_id===shift.id)])))
      setRefreshVersion(version=>version+1)
    } catch (error) {
      setLoadError(error)
    } finally {
      setLoading(false)
    }
  }, [encodedFilters,filters,identity,navigate,page,pageSize])

  React.useEffect(() => {
    const frame = requestAnimationFrame(() => { void loadData() })
    return () => cancelAnimationFrame(frame)
  }, [loadData])
  const handleShiftUpdate = React.useCallback(async (updatedShift?: Shift) => {
    await loadData()
    if (updatedShift) {
      setSelectedShift(prev => prev?.id === updatedShift.id ? updatedShift : prev)
    }
  }, [loadData])
  React.useEffect(() => {
    const interval = window.setInterval(() => void loadData(), 30000)
    return () => window.clearInterval(interval)
  }, [loadData])

  if (loading || !filters || loadedIdentity!==identity) return <div className="py-12 text-center">{t('loading')}</div>
  if (loadError) return <PageLoadError error={loadError} onRetry={() => { setLoading(true); void loadData() }} />

  const filtered=shifts
  const latestUpdate = (shiftId: string) => [...(updates[shiftId] || [])].sort((a, b) => b.time.localeCompare(a.time))[0]
  const revenueValues = filtered.flatMap(shift => { const value = latestUpdate(shift.id)?.revenue; return value == null ? [] : [value] })
  const totalRevenue = revenueValues.length ? revenueValues.reduce((sum,value)=>sum+value,0) : null
  const orderValues = filtered.flatMap(shift => { const value = latestUpdate(shift.id)?.orders; return value == null ? [] : [value] })
  const totalOrders = orderValues.length ? orderValues.reduce((sum,value)=>sum+value,0) : null
  const actualLiveShifts = filtered.filter(shift => isShiftLiveAt(shift))
  const activeShift = filtered.find(shift=>shift.id===selectedShift?.id)
    ?? suggestUniqueLiveShift(filtered)
  const roleOptions = (role: 'host' | 'support' | 'technical') => users.filter(user => user.operational_roles?.includes(role)).map(user => ({ id: user.id, name: user.full_name }))
  const nameFor = (items: Array<{ id: string; name: string }>, id?: string) => id ? items.find(item => item.id === id)?.name || '—' : '—'
  const statusLabel = (status: Shift['status']) => status === 'live' ? t('liveStatus') : t(status)

  const liveCount = filtered.filter(shift => shift.status === 'live').length
  const missingUpdateCount = filtered.filter(shift => shift.status === 'live' && !latestUpdate(shift.id)).length
  const completedCount = filtered.filter(shift => shift.status === 'completed').length

  return (
    <main className="mx-auto w-full min-w-0 max-w-[1680px] space-y-5 pb-8" data-testid="live-operations-workspace">
      {/* G07-inspired command header: role/workflow structure, not a static screen copy. */}
      <header className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white px-4 py-4 shadow-sm sm:px-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-blue-700">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50"><Radio className="h-4 w-4" /></span>
            Live operations / Control center
          </div>
          <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">{t('liveMonitor')}</h1>
          <p className="mt-1 text-sm text-slate-500">{t('todaysDate')}: {format(new Date(), 'dd/MM/yyyy')} · {total} ca theo bộ lọc hiện tại</p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto">
          <span className="inline-flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700">
            <span className="h-2 w-2 animate-pulse rounded-full bg-rose-500" /> {liveCount} {t('liveStatus')}
          </span>
          <Button variant={showFilters ? 'default' : 'outline'} onClick={() => setShowFilters(!showFilters)}
            aria-expanded={showFilters} aria-controls="live-filter-panel">
            <Filter className="mr-2 h-4 w-4" />{t('filters')}
          </Button>
          <Button variant="outline" onClick={() => setFilters(initialFilters())}>
            <RotateCcw className="mr-2 h-4 w-4" />{t('resetFilters')}
          </Button>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5" aria-label="Tình trạng vận hành livestream" data-testid="live-kpi-overview">
        <Metric title={t('liveInProgress')} value={String(liveCount)} description="Ca đang vận hành"
          icon={<Radio className="h-5 w-5 text-rose-600" />} intent="danger" />
        <Metric title={t('updatesMissing')} value={String(missingUpdateCount)}
          description={missingUpdateCount ? 'Cần bổ sung snapshot' : 'Đã cập nhật đủ'}
          icon={<AlertCircle className="h-5 w-5 text-amber-600" />} intent="warning" />
        <Metric title={t('revenue')} value={totalRevenue === null ? '—' : formatCurrency(totalRevenue)}
          description={totalRevenue === null ? 'Chưa có số liệu snapshot' : 'Theo cập nhật gần nhất'}
          icon={<DollarSign className="h-5 w-5 text-emerald-600" />} />
        <Metric title={t('orders')} value={totalOrders === null ? '—' : totalOrders.toLocaleString()}
          description={totalOrders === null ? 'Chưa có số liệu snapshot' : 'Theo cập nhật gần nhất'}
          icon={<TrendingUp className="h-5 w-5 text-blue-600" />} />
        <Metric title={t('needsReview')} value={String(completedCount)} description="Ca đã hoàn thành trong bộ lọc"
          icon={<FileText className="h-5 w-5 text-slate-600" />} />
      </section>

      {/* 2. Filter Experience */}
      {showFilters && (
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
            <MultiSelectFilter label={t('status')} value={filters.statuses} onChange={value => setFilters(current => current ? { ...current, statuses: value as Shift['status'][] } : current)} options={(['scheduled','preparing','live','paused','completed','cancelled'] as Shift['status'][]).map(status => ({ value: status, label: statusLabel(status) }))} placeholder={t('all')} testId="live-status-filter" />
          </div>
        </div>
      )}


      {/* G07 operational layout: discover a shift on the left, act on it on the right. */}
      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(260px,0.28fr)_minmax(0,1fr)]">
        <section className="min-w-0 self-start overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm" aria-label="Chọn ca livestream">
          <div className="flex items-start justify-between gap-2 border-b border-slate-100 bg-slate-50/70 px-4 py-4">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Danh sách ca livestream</h2>
              <p className="mt-1 text-xs text-slate-500">Chọn ca để xem và cập nhật đúng dữ liệu</p>
            </div>
            <span className="shrink-0 rounded-full bg-blue-100 px-2.5 py-1 text-xs font-semibold text-blue-700">{total} ca</span>
          </div>
          {actualLiveShifts.length > 1 && !selectedShift && (
            <p className="mx-3 mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              Có nhiều ca đang LIVE. Chọn đúng Brand, Platform và khung giờ trước khi gửi snapshot.
            </p>
          )}
          {filtered.length ? (
            <div className="max-h-[560px] divide-y divide-slate-100 overflow-y-auto" data-testid="live-shift-selector">
              {filtered.map(shift => {
                const selected = activeShift?.id === shift.id
                const brand = nameFor(brands, shift.brand_id)
                const platform = nameFor(platforms, shift.platform_id)
                const count = updates[shift.id]?.length ?? 0
                return (
                  <button key={shift.id} type="button" onClick={() => setSelectedShift(shift)}
                    data-testid={`open-live-session-${shift.id}`}
                    aria-pressed={selected}
                    className={`flex w-full min-w-0 flex-col gap-2 border-l-[3px] px-4 py-3 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-blue-500 ${selected ? 'border-l-blue-600 bg-blue-50/70' : 'border-l-transparent bg-white hover:bg-slate-50'}`}>
                    <span className="flex w-full items-center justify-between gap-2">
                      <span className="min-w-0 truncate text-sm font-semibold text-slate-900">{shift.title || brand}</span>
                      <Badge variant={shift.status === 'live' ? 'destructive' : 'outline'}>{statusLabel(shift.status)}</Badge>
                    </span>
                    <span className="text-xs text-slate-500">{brand} · {platform}</span>
                    <span className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                      <span>{shift.date} · {shift.start_time.slice(0,5)}–{shift.end_time.slice(0,5)}</span>
                      <span className={count ? 'font-medium text-emerald-700' : 'text-amber-700'}>{count ? `${count} snapshot` : 'Chưa có snapshot'}</span>
                    </span>
                  </button>
                )
              })}
            </div>
          ) : (
            <div className="space-y-2 px-4 py-10 text-center">
              <FileText className="mx-auto h-7 w-7 text-slate-400" />
              <p className="text-sm font-semibold text-slate-700">Không có ca phù hợp</p>
              <p className="text-xs text-slate-500">Thử thay đổi ngày hoặc bộ lọc</p>
            </div>
          )}
          <div className="border-t border-slate-100 px-3 py-2">
            <HistoryPagination page={page} pageSize={pageSize} total={total} onPageChange={pagination.setPage} onPageSizeChange={pagination.setPageSize} />
          </div>
        </section>

        <section className="min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm" aria-label="Chi tiết ca đang chọn">
          {activeShift ? (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 bg-gradient-to-r from-blue-50/80 to-white px-4 py-4 sm:px-5">
                <div className="min-w-0">
                  <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-blue-700">Shift workspace / {activeShift.date}</p>
                  <h2 className="break-words text-lg font-bold text-slate-900">{activeShift.title || nameFor(brands, activeShift.brand_id)}</h2>
                  <p className="mt-1 text-xs text-slate-500">
                    {nameFor(brands, activeShift.brand_id)} · {nameFor(platforms, activeShift.platform_id)} · {activeShift.start_time.slice(0,5)}–{activeShift.end_time.slice(0,5)}
                  </p>
                </div>
                <Badge variant={activeShift.status === 'live' ? 'destructive' : 'outline'}>{statusLabel(activeShift.status)}</Badge>
              </div>
              <div className="min-w-0">
                <LiveSessionModal key={activeShift.id} refreshVersion={refreshVersion} inline open shift={activeShift}
                  brands={brands} platforms={platforms} campaigns={campaigns} users={users} registrations={registrations}
                  onOpenChange={open => !open && setSelectedShift(null)} onUpdate={handleShiftUpdate} />
              </div>
            </>
          ) : (
            <div className="flex min-h-[360px] flex-col items-center justify-center gap-3 px-5 py-12 text-center">
              <span className="rounded-2xl bg-blue-50 p-4"><Radio className="h-8 w-8 text-blue-600" /></span>
              <h2 className="text-base font-bold text-slate-800">Chọn ca để bắt đầu giám sát</h2>
              <p className="max-w-sm text-sm leading-6 text-slate-500">
                {filtered.length ? 'Xác nhận đúng ca đang LIVE hoặc chọn ca lịch sử từ danh sách để cập nhật dashboard.' : 'Không có ca nào trong bộ lọc. Vui lòng chọn ngày khác.'}
              </p>
            </div>
          )}
        </section>
      </div>
    </main>
  )
}

function FilterSelect({ label, value, options, onChange }: { label: string; value: string[]; options: Array<{ id: string; name: string }>; onChange: (value: string[]) => void }) {
  return <MultiSelectFilter label={label} value={value} onChange={onChange} options={options.map(option => ({ value: option.id, label: option.name }))} />
}

function Metric({ title, value, description, icon, intent = 'default' }: { title: string; value: string; description: string; icon: React.ReactNode; intent?: 'default' | 'danger' | 'warning' }) {
  const intentStyles = {
    default: 'border-slate-200 bg-white',
    danger: 'border-rose-200 bg-rose-50/50',
    warning: 'border-amber-200 bg-amber-50/50',
  }
  return (
    <div className={`min-w-0 rounded-xl border px-3.5 py-3 shadow-sm sm:px-4 ${intentStyles[intent]}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-semibold text-slate-600">{title}</p>
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/80">{icon}</span>
      </div>
      <p className="mt-1 break-words text-xl font-bold tracking-tight text-slate-900">{value}</p>
      <p className="mt-1 text-[11px] text-slate-500">{description}</p>
    </div>
  )
}
