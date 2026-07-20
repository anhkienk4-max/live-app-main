'use client'

import * as React from 'react'
import { format } from 'date-fns'
import { AlertCircle, Clock, DollarSign, FileText, Radio, RotateCcw, TrendingUp, Users } from 'lucide-react'
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DashboardUpdateModal } from './DashboardUpdateModal'
import { LiveSessionModal } from './LiveSessionModal'

type Filters = { date: string; brand: string; platform: string; campaign: string; host: string; support: string; technical: string; status: string }
const todayValue = () => format(new Date(), 'yyyy-MM-dd')
const initialFilters = (): Filters => ({ date: todayValue(), brand: 'all', platform: 'all', campaign: 'all', host: 'all', support: 'all', technical: 'all', status: 'all' })

export function LiveMonitoringDashboard() {
  const { t } = useTranslation()
  const [shifts, setShifts] = React.useState<Shift[]>([])
  const [updates, setUpdates] = React.useState<Record<string, DashboardUpdate[]>>({})
  const [brands, setBrands] = React.useState<Brand[]>([])
  const [platforms, setPlatforms] = React.useState<Platform[]>([])
  const [campaigns, setCampaigns] = React.useState<Campaign[]>([])
  const [users, setUsers] = React.useState<User[]>([])
  const [registrations, setRegistrations] = React.useState<ShiftRegistration[]>([])
  const [filters, setFilters] = React.useState<Filters | null>(null)
  const [selectedShift, setSelectedShift] = React.useState<Shift | null>(null)
  const [updateShift, setUpdateShift] = React.useState<Shift | null>(null)
  const [loading, setLoading] = React.useState(true)

  const loadData = React.useCallback(async () => {
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
    setLoading(false)
  }, [])

  React.useEffect(() => { setFilters(initialFilters()); void loadData() }, [loadData])
  React.useEffect(() => {
    const interval = window.setInterval(() => void loadData(), 30000)
    return () => window.clearInterval(interval)
  }, [loadData])

  if (loading || !filters) return <div className="py-12 text-center">{t('loading')}</div>

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
    (filters.brand === 'all' || shift.brand_id === filters.brand) &&
    (filters.platform === 'all' || shift.platform_id === filters.platform) &&
    (filters.campaign === 'all' || shift.campaign_id === filters.campaign) &&
    (filters.host === 'all' || matchesRole(shift, 'host', filters.host)) &&
    (filters.support === 'all' || matchesRole(shift, 'support', filters.support)) &&
    (filters.technical === 'all' || matchesRole(shift, 'technical', filters.technical)) &&
    (filters.status === 'all' || shift.status === filters.status)
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
      <Card><CardHeader><div className="flex flex-wrap items-center justify-between gap-3"><div><CardTitle>{t('liveFilters')}</CardTitle><p className="mt-1 text-sm text-muted-foreground">{t('todaysDate')}: {format(new Date(), 'dd/MM/yyyy')}</p></div><Button variant="outline" onClick={() => setFilters(initialFilters())}><RotateCcw className="mr-2 h-4 w-4" />{t('resetFilters')}</Button></div></CardHeader><CardContent className="grid gap-3 md:grid-cols-4">
        <label className="text-xs font-medium">{t('date')}<Input className="mt-1" type="date" value={filters.date} onChange={event => setFilters(current => current ? { ...current, date: event.target.value } : current)} /></label>
        <FilterSelect label={t('brand')} value={filters.brand} options={brands} onChange={value => setFilters(current => current ? { ...current, brand: value } : current)} />
        <FilterSelect label={t('platform')} value={filters.platform} options={platforms} onChange={value => setFilters(current => current ? { ...current, platform: value } : current)} />
        <FilterSelect label={t('campaign')} value={filters.campaign} options={campaigns} onChange={value => setFilters(current => current ? { ...current, campaign: value } : current)} />
        <FilterSelect label={t('host')} value={filters.host} options={roleOptions('host')} onChange={value => setFilters(current => current ? { ...current, host: value } : current)} />
        <FilterSelect label={t('support')} value={filters.support} options={roleOptions('support')} onChange={value => setFilters(current => current ? { ...current, support: value } : current)} />
        <FilterSelect label={t('technical')} value={filters.technical} options={roleOptions('technical')} onChange={value => setFilters(current => current ? { ...current, technical: value } : current)} />
        <label className="text-xs font-medium">{t('status')}<Select value={filters.status} onValueChange={value => setFilters(current => current ? { ...current, status: value } : current)}><SelectTrigger className="mt-1 w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{t('all')}</SelectItem>{(['scheduled','preparing','live','paused','completed','cancelled'] as Shift['status'][]).map(status => <SelectItem key={status} value={status}>{statusLabel(status)}</SelectItem>)}</SelectContent></Select></label>
      </CardContent></Card>

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
              <div className="flex gap-2"><Button className="flex-1" variant="outline" onClick={() => setSelectedShift(shift)}>{t('viewDetails')}</Button>{(shift.status === 'live' || shift.status === 'preparing' || shift.status === 'paused') && <Button className="flex-1" onClick={() => setUpdateShift(shift)}>{t('submitDashboardUpdate')}</Button>}</div>
            </CardContent></Card>
          })}
        </div>
      )}
    </div>
    {selectedShift && <LiveSessionModal open shift={selectedShift} brands={brands} platforms={platforms} campaigns={campaigns} users={users} registrations={registrations} onOpenChange={open => !open && setSelectedShift(null)} onUpdate={loadData} />}
    {updateShift && <DashboardUpdateModal open shift={updateShift} platformName={nameFor(platforms, updateShift.platform_id)} onOpenChange={open => !open && setUpdateShift(null)} onSuccess={loadData} />}
  </>
}

function FilterSelect({ label, value, options, onChange }: { label: string; value: string; options: Array<{ id: string; name: string }>; onChange: (value: string) => void }) {
  const { t } = useTranslation()
  return <label className="text-xs font-medium">{label}<Select value={value} onValueChange={onChange}><SelectTrigger className="mt-1 w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{t('all')}</SelectItem>{options.map(option => <SelectItem key={option.id} value={option.id}>{option.name}</SelectItem>)}</SelectContent></Select></label>
}
function Metric({ title, value, icon }: { title: string; value: string; icon: React.ReactNode }) { return <Card><CardHeader className="flex-row items-center justify-between pb-2"><CardTitle className="text-sm text-muted-foreground">{title}</CardTitle>{icon}</CardHeader><CardContent><p className="text-2xl font-bold">{value}</p></CardContent></Card> }
function Value({ label, value }: { label: string; value: string }) { return <div><p className="text-xs text-muted-foreground">{label}</p><p className="truncate font-medium">{value}</p></div> }
