'use client'

import * as React from 'react'
import Link from 'next/link'
import { addDays, endOfMonth, format, startOfMonth, subMonths } from 'date-fns'
import { BarChart3, Calendar, FileText, Package, Radio, RotateCcw, TrendingUp, Users } from 'lucide-react'
import dynamic from 'next/dynamic'
import { brandService, campaignService, isStaffedRegistration, platformService, reportService, shiftRegistrationService, shiftService, userService } from '@/lib/services/dataService'
import { Brand, Campaign, OperationalRole, Platform, Report, Shift, ShiftRegistration, User } from '@/lib/types/database.types'
import { useTranslation } from '@/lib/i18n'
import { formatCurrency } from '@/lib/utils/currency'
import { formatShiftTimeRange } from '@/lib/utils/shiftUtils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ContentSkeleton } from '@/components/ui/content-skeleton'
import { PageLoadError } from '@/components/ui/page-load-error'

const DashboardCharts = dynamic(
  () => import('@/components/features/dashboard/DashboardCharts').then(mod => ({ default: mod.DashboardCharts })),
  { ssr: false, loading: () => <div className="grid gap-5 xl:grid-cols-2">{[0, 1].map(i => <Card key={i}><CardContent className="h-72"><div className="space-y-3 pt-5"><ContentSkeleton /></div></CardContent></Card>)}</div> },
)

type Preset = 'today' | 'yesterday' | '7d' | '30d' | 'thisMonth' | 'lastMonth' | 'custom'
type Filters = { preset: Preset; start: string; end: string; brand: string; platform: string; campaign: string; host: string; support: string; technical: string }
const dateValue = (date: Date) => format(date, 'yyyy-MM-dd')
const rangeFor = (preset: Exclude<Preset, 'custom'>) => {
  const today = new Date()
  if (preset === 'today') return { start: dateValue(today), end: dateValue(today) }
  if (preset === 'yesterday') return { start: dateValue(addDays(today, -1)), end: dateValue(addDays(today, -1)) }
  if (preset === '7d') return { start: dateValue(addDays(today, -6)), end: dateValue(today) }
  if (preset === '30d') return { start: dateValue(addDays(today, -29)), end: dateValue(today) }
  if (preset === 'thisMonth') return { start: dateValue(startOfMonth(today)), end: dateValue(today) }
  const previous = subMonths(today, 1)
  return { start: dateValue(startOfMonth(previous)), end: dateValue(endOfMonth(previous)) }
}
const initialFilters = (): Filters => ({ preset: '30d', ...rangeFor('30d'), brand: 'all', platform: 'all', campaign: 'all', host: 'all', support: 'all', technical: 'all' })

export function DashboardOverview() {
  const { t } = useTranslation()
  const [shifts, setShifts] = React.useState<Shift[]>([])
  const [reports, setReports] = React.useState<Report[]>([])
  const [brands, setBrands] = React.useState<Brand[]>([])
  const [platforms, setPlatforms] = React.useState<Platform[]>([])
  const [campaigns, setCampaigns] = React.useState<Campaign[]>([])
  const [users, setUsers] = React.useState<User[]>([])
  const [registrations, setRegistrations] = React.useState<ShiftRegistration[]>([])
  const [filters, setFilters] = React.useState<Filters | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [loadError, setLoadError] = React.useState<unknown>(null)

  const loadData = React.useCallback(async () => {
    setLoadError(null)
    try {
      const [loadedShifts, loadedReports, loadedBrands, loadedPlatforms, loadedCampaigns, loadedUsers, loadedRegistrations] = await Promise.all([
        shiftService.getAll(), reportService.getConfirmed(), brandService.getAll(), platformService.getAll(), campaignService.getAll(), userService.getAll(), shiftRegistrationService.getAll(),
      ])
      setShifts(loadedShifts); setReports(loadedReports); setBrands(loadedBrands); setPlatforms(loadedPlatforms); setCampaigns(loadedCampaigns); setUsers(loadedUsers); setRegistrations(loadedRegistrations)
    } catch (error) {
      setLoadError(error)
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    setFilters(initialFilters())
    void loadData()
  }, [loadData])

  if (loading || !filters) return <ContentSkeleton />
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
  const matchesDimensions = (shift: Shift) =>
    (filters.brand === 'all' || shift.brand_id === filters.brand) &&
    (filters.platform === 'all' || shift.platform_id === filters.platform) &&
    (filters.campaign === 'all' || shift.campaign_id === filters.campaign) &&
    (filters.host === 'all' || matchesRole(shift, 'host', filters.host)) &&
    (filters.support === 'all' || matchesRole(shift, 'support', filters.support)) &&
    (filters.technical === 'all' || matchesRole(shift, 'technical', filters.technical))
  const filteredShifts = shifts.filter(shift => shift.date >= filters.start && shift.date <= filters.end && matchesDimensions(shift))
  const shiftIds = new Set(filteredShifts.map(shift => shift.id))
  const filteredReports = reports.filter(report => shiftIds.has(report.shift_id))
  const days = Math.max(1, Math.round((new Date(`${filters.end}T00:00:00`).getTime() - new Date(`${filters.start}T00:00:00`).getTime()) / 86400000) + 1)
  const previousEnd = dateValue(addDays(new Date(`${filters.start}T00:00:00`), -1))
  const previousStart = dateValue(addDays(new Date(`${previousEnd}T00:00:00`), -(days - 1)))
  const previousIds = new Set(shifts.filter(shift => shift.date >= previousStart && shift.date <= previousEnd && matchesDimensions(shift)).map(shift => shift.id))
  const previousReports = reports.filter(report => previousIds.has(report.shift_id))
  const revenue = filteredReports.reduce((sum, report) => sum + report.revenue, 0)
  const previousRevenue = previousReports.reduce((sum, report) => sum + report.revenue, 0)
  const delta = previousRevenue ? `${(((revenue - previousRevenue) / previousRevenue) * 100).toFixed(1)}%` : '—'
  const today = dateValue(new Date())
  const trend = Object.entries(filteredReports.reduce<Record<string, { revenue: number; orders: number }>>((result, report) => {
    const shift = shifts.find(candidate => candidate.id === report.shift_id)
    if (shift) { (result[shift.date] ??= { revenue: 0, orders: 0 }).revenue += report.revenue; result[shift.date].orders += report.orders }
    return result
  }, {})).sort(([left], [right]) => left.localeCompare(right)).map(([date, values]) => ({ date, ...values }))
  const statusSummary = ['scheduled', 'preparing', 'live', 'paused', 'completed', 'cancelled'].map(status => ({
    status: status === 'live' ? t('liveStatus') : t(status as 'scheduled' | 'preparing' | 'paused' | 'completed' | 'cancelled'),
    shifts: filteredShifts.filter(shift => shift.status === status).length,
  }))
  const upcoming = filteredShifts.filter(shift => shift.date >= today && shift.status === 'scheduled').sort((a, b) => `${a.date}${a.start_time}`.localeCompare(`${b.date}${b.start_time}`)).slice(0, 5)
  const setPreset = (preset: Preset) => setFilters(current => current ? { ...current, preset, ...(preset === 'custom' ? {} : rangeFor(preset)) } : current)
  const roleOptions = (role: 'host' | 'support' | 'technical') => users.filter(user => user.operational_roles?.includes(role)).map(user => ({ id: user.id, name: user.full_name }))

  return <div className="space-y-7">
    <div><h1 className="text-3xl font-bold">{t('dashboardTitle')}</h1><p className="mt-1 text-muted-foreground">{t('dashboardSubtitle')}</p></div>
    <Card><CardHeader><CardTitle className="text-base">{t('dashboardFilters')}</CardTitle></CardHeader><CardContent className="space-y-4">
      <div className="grid gap-3 md:grid-cols-4">
        <label className="text-xs font-medium">{t('dateRange')}<Select value={filters.preset} onValueChange={value => setPreset(value as Preset)}><SelectTrigger className="mt-1 w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="today">{t('today')}</SelectItem><SelectItem value="yesterday">{t('yesterday')}</SelectItem><SelectItem value="7d">{t('last7Days')}</SelectItem><SelectItem value="30d">{t('last30Days')}</SelectItem><SelectItem value="thisMonth">{t('thisMonth')}</SelectItem><SelectItem value="lastMonth">{t('lastMonth')}</SelectItem><SelectItem value="custom">{t('customRange')}</SelectItem></SelectContent></Select></label>
        {filters.preset === 'custom' && <><label className="text-xs font-medium">{t('startDate')}<Input className="mt-1" type="date" value={filters.start} onChange={event => setFilters(current => current ? { ...current, start: event.target.value } : current)} /></label><label className="text-xs font-medium">{t('endDate')}<Input className="mt-1" type="date" value={filters.end} onChange={event => setFilters(current => current ? { ...current, end: event.target.value } : current)} /></label></>}
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <FilterSelect label={t('brand')} value={filters.brand} options={brands} onChange={value => setFilters(current => current ? { ...current, brand: value } : current)} />
        <FilterSelect label={t('platform')} value={filters.platform} options={platforms} onChange={value => setFilters(current => current ? { ...current, platform: value } : current)} />
        <FilterSelect label={t('campaign')} value={filters.campaign} options={campaigns} onChange={value => setFilters(current => current ? { ...current, campaign: value } : current)} />
        <FilterSelect label={t('host')} value={filters.host} options={roleOptions('host')} onChange={value => setFilters(current => current ? { ...current, host: value } : current)} />
        <FilterSelect label={t('support')} value={filters.support} options={roleOptions('support')} onChange={value => setFilters(current => current ? { ...current, support: value } : current)} />
        <FilterSelect label={t('technical')} value={filters.technical} options={roleOptions('technical')} onChange={value => setFilters(current => current ? { ...current, technical: value } : current)} />
      </div>
      <Button variant="outline" onClick={() => setFilters(initialFilters())}><RotateCcw className="mr-2 h-4 w-4" />{t('resetFilters')}</Button>
    </CardContent></Card>

    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <Metric title={t('todaysLiveSessions')} value={filteredShifts.filter(shift => shift.date === today).length.toString()} icon={<Calendar className="h-5 w-5 text-blue-600" />} />
      <Metric title={t('confirmedRevenue')} value={formatCurrency(revenue)} note={`${delta} ${t('previousPeriod')}`} icon={<TrendingUp className="h-5 w-5 text-green-600" />} />
      <Metric title={t('liveInProgress')} value={filteredShifts.filter(shift => shift.status === 'live').length.toString()} icon={<Radio className="h-5 w-5 text-red-600" />} />
      <Metric title={t('totalStaff')} value={new Set([
        ...filteredShifts.flatMap(shift => [shift.host_id, shift.support_id, shift.technical_id]).filter((id): id is string => Boolean(id)),
        ...registrations.filter(registration => isStaffedRegistration(registration) && shiftIds.has(registration.shift_id)).map(registration => registration.user_id),
      ]).size.toString()} icon={<Users className="h-5 w-5 text-purple-600" />} />
      <Metric title={t('reportsSubmitted')} value={filteredReports.length.toString()} icon={<FileText className="h-5 w-5 text-amber-600" />} />
      <Metric title={t('campaigns')} value={new Set(filteredShifts.map(shift => shift.campaign_id).filter(Boolean)).size.toString()} icon={<Package className="h-5 w-5 text-orange-600" />} />
    </div>

    <Card><CardHeader><CardTitle>{t('quickActions')}</CardTitle><CardDescription>{t('operationsCenter')}</CardDescription></CardHeader><CardContent className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <QuickAction href="/calendar" label={t('calendar')} icon={<Calendar className="h-6 w-6" />} /><QuickAction href="/live" label={t('liveMonitor')} icon={<Radio className="h-6 w-6" />} /><QuickAction href="/reports" label={t('reports')} icon={<FileText className="h-6 w-6" />} /><QuickAction href="/analytics" label={t('analytics')} icon={<BarChart3 className="h-6 w-6" />} />
    </CardContent></Card>

    <DashboardCharts
      trend={trend}
      statusSummary={statusSummary}
      revenueLabel={t('revenue')}
      ordersLabel={t('orders')}
      revenueTrendLabel={t('revenueTrend')}
      shiftStatusSummaryLabel={t('shiftStatusSummary')}
      noDataLabel={t('noData')}
    />

    <Card><CardHeader className="flex-row items-center justify-between"><div><CardTitle>{t('upcomingShifts')}</CardTitle><CardDescription>{t('dashboardFilters')}</CardDescription></div><Button nativeButton={false} render={<Link href="/calendar" />} variant="outline" size="sm">{t('viewAll')}</Button></CardHeader><CardContent>{upcoming.length ? <div className="space-y-3">{upcoming.map(shift => <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3" key={shift.id}><div><p className="font-medium">{shift.title || nameFor(brands, shift.brand_id)}</p><p className="text-sm text-muted-foreground">{shift.date} · {formatShiftTimeRange(shift)} · {nameFor(platforms, shift.platform_id)}</p></div><Badge variant="outline">{t('scheduled')}</Badge></div>)}</div> : <Empty text={t('noMatchingShifts')} />}</CardContent></Card>
  </div>
}

function FilterSelect({ label, value, options, onChange }: { label: string; value: string; options: Array<{ id: string; name: string }>; onChange: (value: string) => void }) {
  const { t } = useTranslation()
  return <label className="text-xs font-medium">{label}<Select value={value} onValueChange={onChange}><SelectTrigger className="mt-1 w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{t('all')}</SelectItem>{options.map(option => <SelectItem key={option.id} value={option.id}>{option.name}</SelectItem>)}</SelectContent></Select></label>
}
function Metric({ title, value, note, icon }: { title: string; value: string; note?: string; icon: React.ReactNode }) { return <Card><CardHeader className="flex-row items-center justify-between pb-2"><CardTitle className="text-sm text-muted-foreground">{title}</CardTitle>{icon}</CardHeader><CardContent><p className="text-2xl font-bold">{value}</p>{note && <p className="mt-1 text-xs text-muted-foreground">{note}</p>}</CardContent></Card> }
function QuickAction({ href, label, icon }: { href: string; label: string; icon: React.ReactNode }) { return <Button nativeButton={false} render={<Link href={href} />} variant="outline" className="h-24 flex-col gap-2">{icon}<span>{label}</span></Button> }
function Empty({ text }: { text: string }) { return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">{text}</div> }
const nameFor = (items: Array<{ id: string; name: string }>, id: string) => items.find(item => item.id === id)?.name || '—'
