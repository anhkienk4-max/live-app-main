'use client'

import * as React from 'react'
import { format } from 'date-fns'
import { AlertCircle, Radio, DollarSign, FileText, Filter, RotateCcw, TrendingUp } from 'lucide-react'
import {
  brandService,
  campaignService,
  dashboardUpdateService,
  isStaffedRegistration,
  platformService,
  shiftRegistrationService,
  shiftService,
  userService,
} from '@/lib/services/dataService'
import { Brand, Campaign, DashboardUpdate, OperationalRole, Platform, Shift, ShiftRegistration, User } from '@/lib/types/database.types'
import { useTranslation } from '@/lib/i18n'
import { formatCurrency } from '@/lib/utils/currency'
import { getCurrentBusinessDate, formatShiftTimeRange } from '@/lib/utils/shiftUtils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { matchesMultiSelect } from '@/lib/utils/multiSelectFilter'
import { MultiSelectFilter } from '@/components/ui/multi-select-filter'

import { LiveSessionModal } from './LiveSessionModal'
import { PageLoadError } from '@/components/ui/page-load-error'

type Filters = { date: string; brandIds: string[]; platformIds: string[]; campaignIds: string[]; hostIds: string[]; supportIds: string[]; technicalIds: string[]; statuses: Shift['status'][] }
const todayValue = () => getCurrentBusinessDate()
const initialFilters = (): Filters => ({ date: todayValue(), brandIds: [], platformIds: [], campaignIds: [], hostIds: [], supportIds: [], technicalIds: [], statuses: [] })

export function LiveMonitoringDashboard() {
  const { t } = useTranslation()
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

  const loadData = React.useCallback(async () => {
    setLoadError(null)
    try {
      const [loadedShifts, loadedBrands, loadedPlatforms, loadedCampaigns, loadedUsers, loadedRegistrations] = await Promise.all([
        shiftService.getAll(), brandService.getAll(), platformService.getAll(), campaignService.getAll(), userService.getAll(), shiftRegistrationService.getAll(),
      ])
      const updateEntries = await Promise.all(loadedShifts.map(async shift => [shift.id, await dashboardUpdateService.getByShift(shift.id)] as const))
      setShifts(loadedShifts)
      setBrands(loadedBrands)
      setPlatforms(loadedPlatforms)
      setCampaigns(loadedCampaigns)
      setUsers(loadedUsers)
      setRegistrations(loadedRegistrations)
      setUpdates(Object.fromEntries(updateEntries))
      setRefreshVersion(version=>version+1)
    } catch (error) {
      setLoadError(error)
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    const frame = requestAnimationFrame(() => { setFilters(initialFilters()); void loadData() })
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

  if (loading || !filters) return <div className="py-12 text-center">{t('loading')}</div>
  if (loadError) return <PageLoadError error={loadError} onRetry={() => { setLoading(true); void loadData() }} />

  const matchesRole = (shift: Shift, role: OperationalRole, userId: string) => {
    const assignment = role === 'host' ? shift.host_id : role === 'support' ? shift.support_id : shift.technical_id
    return assignment === userId || registrations.some(registration =>
      registration.shift_id === shift.id &&
      registration.user_id === userId &&
      registration.operational_role === role &&
      isStaffedRegistration(registration)
    )
  }
  const filtered = shifts.filter(shift =>
    (!filters.date || shift.date === filters.date) &&
    matchesMultiSelect(shift.brand_id, filters.brandIds) &&
    matchesMultiSelect(shift.platform_id, filters.platformIds) &&
    matchesMultiSelect(shift.campaign_id, filters.campaignIds) &&
    (filters.hostIds.length === 0 || filters.hostIds.some(userId => matchesRole(shift, 'host', userId))) &&
    (filters.supportIds.length === 0 || filters.supportIds.some(userId => matchesRole(shift, 'support', userId))) &&
    (filters.technicalIds.length === 0 || filters.technicalIds.some(userId => matchesRole(shift, 'technical', userId))) &&
    matchesMultiSelect(shift.status, filters.statuses)
  )
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
    <div className="space-y-6">

      {/* 1. Header / Control Strip */}
      <div className="flex flex-col gap-4 border-b pb-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">{t('liveFilters')}</h2>
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
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
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

      {/* 4. Session Cards */}
      <div className="grid gap-3 xl:grid-cols-[220px_minmax(0,1fr)]">
        <section className="self-start overflow-hidden rounded-lg border border-slate-200 bg-white"><h2 className="border-b px-3 py-3 text-xs font-semibold">{t('liveMonitor')} ({filtered.length})</h2>{!filtered.length && <p className="p-6 text-center text-xs text-slate-500">{t('noLiveShifts')}</p>}{filtered.map(shift=><button key={shift.id} onClick={()=>setSelectedShift(shift)} data-testid={`open-live-session-${shift.id}`} className={`block w-full border-b p-3 text-left hover:bg-slate-50 ${activeShift?.id===shift.id ? 'bg-blue-50' : ''}`}><div className="flex items-center justify-between gap-2"><span className="text-xs font-semibold">{shift.title || nameFor(brands,shift.brand_id)}</span><Badge variant="secondary" className="text-[10px]">{statusLabel(shift.status)}</Badge></div><p className="mt-1 text-[11px] text-slate-500">{formatShiftTimeRange(shift)} · {nameFor(platforms,shift.platform_id)}</p><p className="mt-1 text-[11px] text-slate-400">{shift.studio ?? '—'}</p>{shift.status==='live' && !latestUpdate(shift.id) && <p className="mt-2 text-[11px] text-amber-600">{t('updatesMissing')}</p>}</button>)}</section>
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
  return (
    <Card className={`overflow-hidden ${intentStyles[intent]}`}>
      <CardContent className="p-3">
        <div className="flex items-center justify-between space-y-0 pb-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</p>
          {icon}
        </div>
        <div className="text-xl font-bold tracking-tight">{value}</div>
      </CardContent>
    </Card>
  )
}
