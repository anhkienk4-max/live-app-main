'use client'

import * as React from 'react'
import { format } from 'date-fns'
import { AlertCircle, Clock, DollarSign, FileText, Filter, Radio, RotateCcw, TrendingUp, Users } from 'lucide-react'
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
import { formatShiftTimeRange } from '@/lib/utils/shiftUtils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { DashboardUpdateModal } from './DashboardUpdateModal'
import { hasPermission } from '@/lib/permissions'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'
import { matchesMultiSelect } from '@/lib/utils/multiSelectFilter'
import { MultiSelectFilter } from '@/components/ui/multi-select-filter'

import { LiveSessionModal } from './LiveSessionModal'
import { PageLoadError } from '@/components/ui/page-load-error'

type Filters = { date: string; brandIds: string[]; platformIds: string[]; campaignIds: string[]; hostIds: string[]; supportIds: string[]; technicalIds: string[]; statuses: Shift['status'][] }
const todayValue = () => format(new Date(), 'yyyy-MM-dd')
const initialFilters = (): Filters => ({ date: todayValue(), brandIds: [], platformIds: [], campaignIds: [], hostIds: [], supportIds: [], technicalIds: [], statuses: [] })

export function LiveMonitoringDashboard() {
  const { currentUser } = useCurrentUser()
  const { t } = useTranslation()
  const [shifts, setShifts] = React.useState<Shift[]>([])
  const [updates, setUpdates] = React.useState<Record<string, DashboardUpdate[]>>({})
  const [brands, setBrands] = React.useState<Brand[]>([])
  const [platforms, setPlatforms] = React.useState<Platform[]>([])
  const [campaigns, setCampaigns] = React.useState<Campaign[]>([])
  const [users, setUsers] = React.useState<User[]>([])
  const [registrations, setRegistrations] = React.useState<ShiftRegistration[]>([])
  const [filters, setFilters] = React.useState<Filters | null>(null)
  const [showFilters, setShowFilters] = React.useState(false)
  const [selectedShift, setSelectedShift] = React.useState<Shift | null>(null)
  const [updateShift, setUpdateShift] = React.useState<Shift | null>(null)
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
    } catch (error) {
      setLoadError(error)
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => { setFilters(initialFilters()); void loadData() }, [loadData])
  const handleShiftUpdate = React.useCallback(async (updatedShift?: Shift) => {
    await loadData()
    if (updatedShift) {
      setSelectedShift(prev => prev?.id === updatedShift.id ? updatedShift : prev)
      setUpdateShift(prev => prev?.id === updatedShift.id ? updatedShift : prev)
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
  const totalRevenue = filtered.reduce((sum, shift) => sum + (latestUpdate(shift.id)?.revenue || 0), 0)
  const totalOrders = filtered.reduce((sum, shift) => sum + (latestUpdate(shift.id)?.orders || 0), 0)
  const roleOptions = (role: 'host' | 'support' | 'technical') => users.filter(user => user.operational_roles?.includes(role)).map(user => ({ id: user.id, name: user.full_name }))
  const nameFor = (items: Array<{ id: string; name: string }>, id?: string) => id ? items.find(item => item.id === id)?.name || '—' : '—'
  const userName = (id?: string) => id ? users.find(user => user.id === id)?.full_name || '—' : '—'
  const roleNames = (shift: Shift, role: OperationalRole) => {
    const assignment = role === 'host' ? shift.host_id : role === 'support' ? shift.support_id : shift.technical_id
    const ids = new Set([
      ...(assignment ? [assignment] : []),
      ...registrations.filter(registration => registration.shift_id === shift.id && registration.operational_role === role && isStaffedRegistration(registration)).map(registration => registration.user_id),
    ])
    return [...ids].map(userName).join(', ') || '—'
  }
  const statusLabel = (status: Shift['status']) => status === 'live' ? t('liveStatus') : t(status)

  return <>
    <div className="space-y-6">
      <Card><CardHeader><div className="flex flex-wrap items-center justify-between gap-3"><div><CardTitle>{t('liveFilters')}</CardTitle><p className="mt-1 text-sm text-muted-foreground">{t('todaysDate')}: {format(new Date(), 'dd/MM/yyyy')}</p></div><div className="flex flex-wrap items-center gap-2"><Button variant={showFilters ? 'default' : 'outline'} onClick={() => setShowFilters(!showFilters)} aria-expanded={showFilters} aria-controls="live-filter-panel"><Filter className="mr-2 h-4 w-4" />{t('filters')}</Button><Button variant="outline" onClick={() => setFilters(initialFilters())}><RotateCcw className="mr-2 h-4 w-4" />{t('resetFilters')}</Button></div></div></CardHeader>{showFilters && <CardContent id="live-filter-panel" className="grid gap-3 md:grid-cols-4">
        <label className="text-xs font-medium">{t('date')}<Input className="mt-1" type="date" value={filters.date} onChange={event => setFilters(current => current ? { ...current, date: event.target.value } : current)} /></label>
         <FilterSelect label={t('brand')} value={filters.brandIds} options={brands} onChange={value => setFilters(current => current ? { ...current, brandIds: value } : current)} />
         <FilterSelect label={t('platform')} value={filters.platformIds} options={platforms} onChange={value => setFilters(current => current ? { ...current, platformIds: value } : current)} />
         <FilterSelect label={t('campaign')} value={filters.campaignIds} options={campaigns} onChange={value => setFilters(current => current ? { ...current, campaignIds: value } : current)} />
         <FilterSelect label={t('host')} value={filters.hostIds} options={roleOptions('host')} onChange={value => setFilters(current => current ? { ...current, hostIds: value } : current)} />
         <FilterSelect label={t('support')} value={filters.supportIds} options={roleOptions('support')} onChange={value => setFilters(current => current ? { ...current, supportIds: value } : current)} />
         <FilterSelect label={t('technical')} value={filters.technicalIds} options={roleOptions('technical')} onChange={value => setFilters(current => current ? { ...current, technicalIds: value } : current)} />
         <MultiSelectFilter label={t('status')} value={filters.statuses} onChange={value => setFilters(current => current ? { ...current, statuses: value as Shift['status'][] } : current)} options={(['scheduled','preparing','live','paused','completed','cancelled'] as Shift['status'][]).map(status => ({ value: status, label: statusLabel(status) }))} placeholder={t('all')} testId="live-status-filter" />
      </CardContent>}</Card>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
        <Metric title={t('liveInProgress')} value={filtered.filter(shift => shift.status === 'live').length.toString()} icon={<Radio className="h-5 w-5 text-red-600" />} />
        <Metric title={t('revenue')} value={formatCurrency(totalRevenue)} icon={<DollarSign className="h-5 w-5 text-green-600" />} />
        <Metric title={t('orders')} value={totalOrders.toLocaleString()} icon={<TrendingUp className="h-5 w-5 text-blue-600" />} />
        <Metric title={t('needsReview')} value={filtered.filter(shift => shift.status === 'completed').length.toString()} icon={<FileText className="h-5 w-5 text-amber-600" />} />
        <Metric title={t('updatesMissing')} value={filtered.filter(shift => shift.status === 'live' && !latestUpdate(shift.id)).length.toString()} icon={<AlertCircle className="h-5 w-5 text-red-600" />} />
      </div>

      {filtered.length === 0 ? <Card><CardContent className="py-12 text-center text-muted-foreground">{t('noLiveShifts')}</CardContent></Card> : (
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map(shift => {
            const latest = latestUpdate(shift.id)
            return <Card key={shift.id} className="border-2"><CardHeader><div className="flex items-center justify-between"><Badge className={shift.status === 'live' ? 'bg-red-100 text-red-800' : ''}>{statusLabel(shift.status)}</Badge><span className="text-sm text-muted-foreground">{nameFor(platforms, shift.platform_id)}</span></div><CardTitle className="pt-2 text-lg">{shift.title || nameFor(brands, shift.brand_id)}</CardTitle><p className="text-sm text-muted-foreground">{formatShiftTimeRange(shift)} · {nameFor(campaigns, shift.campaign_id)}</p></CardHeader><CardContent className="space-y-3">
              <div className="grid grid-cols-3 gap-2 text-sm"><Value label={t('host')} value={roleNames(shift, 'host')} /><Value label={t('support')} value={roleNames(shift, 'support')} /><Value label={t('technical')} value={roleNames(shift, 'technical')} /></div>
              <div className="grid grid-cols-3 gap-2 border-t pt-3"><Value label={t('revenue')} value={latest ? formatCurrency(latest.revenue) : '—'} /><Value label={t('orders')} value={latest ? latest.orders.toLocaleString() : '—'} /><Value label={t('viewers')} value={latest ? latest.current_viewers.toLocaleString() : '—'} /></div>
              {latest && <p className="flex items-center gap-2 text-xs text-muted-foreground"><Clock className="h-3 w-3" />{format(new Date(latest.time), 'HH:mm dd/MM/yyyy')}</p>}
              <div className="flex gap-2">
                <Button className="flex-1" variant="outline" onClick={() => setSelectedShift(shift)} data-testid={`open-live-session-${shift.id}`}>
                  {t('viewDetails')}
                </Button>
                {(shift.status === 'live' || shift.status === 'preparing' || shift.status === 'paused') && currentUser && hasPermission(currentUser, 'shifts.edit') && (
                  <Button className="flex-1" onClick={() => setUpdateShift(shift)} data-testid={`open-live-dashboard-update-${shift.id}`}>
                    {t('submitDashboardUpdate')}
                  </Button>
                )}
              </div>
            </CardContent></Card>
          })}
        </div>
      )}
    </div>
    {selectedShift && <LiveSessionModal open shift={selectedShift} brands={brands} platforms={platforms} campaigns={campaigns} users={users} registrations={registrations} onOpenChange={open => !open && setSelectedShift(null)} onUpdate={handleShiftUpdate} />}
    {updateShift && <DashboardUpdateModal open shift={updateShift} platformName={nameFor(platforms, updateShift.platform_id)} onOpenChange={open => !open && setUpdateShift(null)} onSuccess={loadData} />}
  </>
}

function FilterSelect({ label, value, options, onChange }: { label: string; value: string[]; options: Array<{ id: string; name: string }>; onChange: (value: string[]) => void }) {
  return <MultiSelectFilter label={label} value={value} onChange={onChange} options={options.map(option => ({ value: option.id, label: option.name }))} />
}
function Metric({ title, value, icon }: { title: string; value: string; icon: React.ReactNode }) { return <Card><CardHeader className="flex-row items-center justify-between pb-2"><CardTitle className="text-sm text-muted-foreground">{title}</CardTitle>{icon}</CardHeader><CardContent><p className="text-2xl font-bold">{value}</p></CardContent></Card> }
function Value({ label, value }: { label: string; value: string }) { return <div><p className="text-xs text-muted-foreground">{label}</p><p className="truncate font-medium">{value}</p></div> }
