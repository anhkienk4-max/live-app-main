'use client'

import * as React from 'react'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'
import { useShiftChangeRefresh } from '@/lib/hooks/useShiftChangeRefresh'
import { useListPagination } from '@/lib/hooks/useListPagination'
import { HistoryPagination } from '@/components/ui/history-pagination'
import { format } from 'date-fns'
import { AlertCircle, Radio, DollarSign, FileText, Filter, RotateCcw, TrendingUp } from 'lucide-react'
import { shiftService } from '@/lib/services/dataService'
import { getOperationalReferences, operationalReferenceIdentity } from '@/lib/services/operationalReferences'
import { invalidatePageCache } from '@/lib/services/operationsPageCache'
import { Brand, Campaign, DashboardUpdate, Platform, Shift, ShiftRegistration, User } from '@/lib/types/database.types'
import { useTranslation } from '@/lib/i18n'
import { formatCurrency } from '@/lib/utils/currency'
import { getCurrentBusinessDate } from '@/lib/utils/shiftUtils'
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
  const identity=currentUser?operationalReferenceIdentity(currentUser):''
  const [loadedIdentity,setLoadedIdentity]=React.useState('')
  const [loadedQuery,setLoadedQuery]=React.useState('')
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
  const liveController=React.useRef<AbortController|null>(null)
  const focusRefreshAt=React.useRef(0)
  const snapshotFingerprint=React.useRef<string | null>(null)
  const encodedFilters=JSON.stringify(filters?{from:filters.date||undefined,to:filters.date||undefined,brandIds:filters.brandIds,platformIds:filters.platformIds,campaignIds:filters.campaignIds,hostIds:filters.hostIds,supportIds:filters.supportIds,technicalIds:filters.technicalIds,statuses:filters.statuses}:{})
  React.useEffect(()=>{const frame=requestAnimationFrame(()=>setFilters(initialFilters()));return()=>cancelAnimationFrame(frame)},[])
  const queryKey=identity+':'+encodedFilters+':'+page+':'+pageSize

  // Static directories are fetched once per identity. They are no longer part
  // of each 30-second live polling request.
  React.useEffect(() => {
    let active=true
    if (!currentUser || !identity) return
    void getOperationalReferences(currentUser).then(refs => {
      if (!active) return
      setBrands(refs.brands);setPlatforms(refs.platforms);setCampaigns(refs.campaigns);setUsers(refs.users)
    }).catch(error => { if (active) setLoadError(error) })
    return () => { active=false }
  },[currentUser,identity])

  const loadData = React.useCallback(async () => {
    if(!filters||!identity || (typeof document !== 'undefined' && document.visibilityState === 'hidden'))return
    liveController.current?.abort()
    const controller=new AbortController()
    liveController.current=controller
    const request=++sequence.current
    setLoadError(null)
    try {
      const result=await shiftService.getLivePage({page,pageSize,filters:JSON.parse(encodedFilters)},controller.signal)
      if(request!==sequence.current||controller.signal.aborted)return
      setLoadedIdentity(identity)
      setLoadedQuery(queryKey)
      setShifts(result.items);setTotal(result.total)
      if(result.page!==page)navigate({live_page:String(result.page)},true)
      setRegistrations(result.registrations)
      setUpdates(Object.fromEntries(result.items.map(shift=>[shift.id,result.updates.filter(update=>update.shift_id===shift.id)])))
      // A 30-second poll without new snapshots must not restart the modal loader.
      const fingerprint=JSON.stringify(result.updates.map(update=>[update.id,update.updated_at,update.time]).sort((a,b)=>String(a[0]).localeCompare(String(b[0]))))
      if(snapshotFingerprint.current!==fingerprint){
        snapshotFingerprint.current=fingerprint
        setRefreshVersion(version=>version+1)
      }
    } catch (error) {
      if(request===sequence.current&&!controller.signal.aborted)setLoadError(error)
    } finally {
      if(request===sequence.current&&!controller.signal.aborted)setLoading(false)
    }
  }, [encodedFilters,filters,identity,navigate,page,pageSize,queryKey])
  useShiftChangeRefresh(loadData)

  React.useEffect(() => {
    const frame=requestAnimationFrame(() => { void loadData() })
    const thisSequence=sequence
    return () => {
      cancelAnimationFrame(frame)
      liveController.current?.abort()
      ++thisSequence.current
    }
  }, [loadData])

  const handleShiftUpdate=React.useCallback(async (updatedShift?:Shift)=>{
    // Shift mutations must invalidate the cross-page cache immediately.
    invalidatePageCache()
    await loadData()
    if(updatedShift)setSelectedShift(prev=>prev?.id===updatedShift.id?updatedShift:prev)
  },[loadData])

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

  if (loadError) return <PageLoadError error={loadError} onRetry={() => { setLoading(true); void loadData() }} />
  if (loading || !filters || loadedIdentity!==identity || loadedQuery!==queryKey) return <div className="py-12 text-center">{t('loading')}</div>

  const filtered=shifts
  const latestUpdate = (shiftId: string) => [...(updates[shiftId] || [])].sort((a, b) => b.time.localeCompare(a.time))[0]
  const revenueValues = filtered.flatMap(shift => { const value = latestUpdate(shift.id)?.revenue; return value == null ? [] : [value] })
  const totalRevenue = revenueValues.length ? revenueValues.reduce((sum,value)=>sum+value,0) : null
  const orderValues = filtered.flatMap(shift => { const value = latestUpdate(shift.id)?.orders; return value == null ? [] : [value] })
  const totalOrders = orderValues.length ? orderValues.reduce((sum,value)=>sum+value,0) : null
  const activeShift = filtered.find(shift=>shift.id===selectedShift?.id) ?? filtered.find(shift=>shift.status==='live') ?? filtered[0]
  const roleOptions = (role: 'host' | 'support' | 'technical') => users.filter(user => user.operational_roles?.includes(role)).map(user => ({ id: user.id, name: user.full_name }))
  const nameFor = (items: Array<{ id: string; name: string }>, id?: string) => id ? items.find(item => item.id === id)?.name || '—' : '—'
  const statusLabel = (status: Shift['status']) => status === 'live' ? t('liveStatus') : t(status)

  return <>
    <div className="space-y-3">

      {/* 1. Header / Control Strip */}
      <div className="flex flex-col gap-2 border-b pb-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-base font-semibold">{t('liveMonitor')}</h2>
          <p className="text-sm text-muted-foreground">{t('todaysDate')}: {format(new Date(), 'dd/MM/yyyy')}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant={showFilters ? 'default' : 'outline'} onClick={() => setShowFilters(!showFilters)} aria-expanded={showFilters} aria-controls="live-filter-panel">
            <Filter className="mr-2 h-4 w-4" />{t('filters')}
          </Button>
          <Button variant="outline" onClick={() => setFilters(initialFilters())}>
            <RotateCcw className="mr-2 h-4 w-4" />{t('resetFilters')}
          </Button>
        </div>
      </div>

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

      {/* 3. Metric / Status Strip */}
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-5">
        <Metric
          title={t('liveInProgress')}
          value={filtered.filter(shift => shift.status === 'live').length.toString()}
          icon={<Radio className="h-5 w-5 text-red-600" />}
          intent="danger"
        />
        <Metric
          title={t('updatesMissing')}
          value={filtered.filter(shift => shift.status === 'live' && !latestUpdate(shift.id)).length.toString()}
          icon={<AlertCircle className="h-5 w-5 text-amber-600" />}
          intent="warning"
        />
        <Metric title={t('revenue')} value={totalRevenue === null ? '—' : formatCurrency(totalRevenue)} icon={<DollarSign className="h-5 w-5 text-green-600" />} />
        <Metric title={t('orders')} value={totalOrders === null ? '—' : totalOrders.toLocaleString()} icon={<TrendingUp className="h-5 w-5 text-blue-600" />} />
        <Metric title={t('needsReview')} value={filtered.filter(shift => shift.status === 'completed').length.toString()} icon={<FileText className="h-5 w-5 text-muted-foreground" />} />
      </div>

      <p className="text-xs text-muted-foreground">{t('currentPage')}</p>
      {/* 4. Session Cards */}
      <div className="space-y-3">
        {filtered.length > 1 && <div className="flex flex-wrap gap-2">{filtered.map(shift => <Button key={shift.id} variant={activeShift?.id === shift.id ? 'secondary' : 'outline'} size="sm" onClick={() => setSelectedShift(shift)} data-testid={`open-live-session-${shift.id}`}>{shift.title || nameFor(brands, shift.brand_id)}<Badge variant="outline">{statusLabel(shift.status)}</Badge></Button>)}</div>}
        <HistoryPagination page={page} pageSize={pageSize} total={total} onPageChange={pagination.setPage} onPageSizeChange={pagination.setPageSize} />
        <div className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white">{activeShift ? <LiveSessionModal key={activeShift.id} refreshVersion={refreshVersion} inline open shift={activeShift} brands={brands} platforms={platforms} campaigns={campaigns} users={users} registrations={registrations} onOpenChange={open=>!open&&setSelectedShift(null)} onUpdate={handleShiftUpdate} /> : <p className="p-10 text-center text-sm text-slate-500">{t('noLiveShifts')}</p>}</div>
      </div>
    </div>
  </>
}

function FilterSelect({ label, value, options, onChange }: { label: string; value: string[]; options: Array<{ id: string; name: string }>; onChange: (value: string[]) => void }) {
  return <MultiSelectFilter label={label} value={value} onChange={onChange} options={options.map(option => ({ value: option.id, label: option.name }))} />
}

function Metric({ title, value, icon, intent = 'default' }: { title: string; value: string; icon: React.ReactNode; intent?: 'default' | 'danger' | 'warning' }) {
  const intentStyles = {
    default: 'bg-card',
    danger: 'bg-red-50/50 border-red-200 dark:bg-red-950/20 dark:border-red-900',
    warning: 'bg-amber-50/50 border-amber-200 dark:bg-amber-950/20 dark:border-amber-900',
  }
  return <div className={`flex items-center justify-between gap-2 rounded-md border px-3 py-2 ${intentStyles[intent]}`}><p className="text-[10px] font-semibold uppercase text-muted-foreground">{title}</p><div className="flex items-center gap-2"><span className="text-sm font-bold">{value}</span>{icon}</div></div>
}
