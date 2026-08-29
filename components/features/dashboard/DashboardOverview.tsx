'use client'

import * as React from 'react'
import Link from 'next/link'
import { addDays, endOfMonth, format, startOfMonth, subMonths } from 'date-fns'
import { BarChart3, Bell, Calendar, Clock, FileText, Filter, Package, Radio, RotateCcw, TrendingUp, Users, ArrowLeftRight, CheckCircle, ShieldAlert } from 'lucide-react'
import dynamic from 'next/dynamic'
import { brandService, campaignService, isStaffedRegistration, platformService, reportService, shiftRegistrationService, shiftService, swapRequestService, userService } from '@/lib/services/dataService'
import { Brand, Campaign, OperationalRole, Platform, Report, Shift, ShiftRegistration, SwapRequest, User } from '@/lib/types/database.types'
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
import { PageShell, PageHeader, PageHeaderContent } from '@/components/ui/archetypes'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'
import { resolveSystemPermission } from '@/lib/permissions'
import { isCanonicalAssignedShift, getMemberAssignedShifts, getMemberPendingRegistrations, getMemberPendingSwaps, getLeaderPendingRegistrations, getLeaderPendingReports, getLeaderPendingSwaps } from '@/lib/ui/dashboard-role-data'

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
  const { currentUser } = useCurrentUser()
  const [shifts, setShifts] = React.useState<Shift[]>([])
  const [reports, setReports] = React.useState<Report[]>([])
  const [brands, setBrands] = React.useState<Brand[]>([])
  const [platforms, setPlatforms] = React.useState<Platform[]>([])
  const [campaigns, setCampaigns] = React.useState<Campaign[]>([])
  const [users, setUsers] = React.useState<User[]>([])
  const [registrations, setRegistrations] = React.useState<ShiftRegistration[]>([])
  const [swapRequests, setSwapRequests] = React.useState<SwapRequest[]>([])
  const [filters, setFilters] = React.useState<Filters | null>(null)
  const [showFilters, setShowFilters] = React.useState(false)
  const [loading, setLoading] = React.useState(true)
  const [loadError, setLoadError] = React.useState<unknown>(null)

  const loadData = React.useCallback(async () => {
    setLoadError(null)
    try {
      const [loadedShifts, loadedReports, loadedBrands, loadedPlatforms, loadedCampaigns, loadedUsers, loadedRegistrations, loadedSwaps] = await Promise.all([
        shiftService.getAll(), reportService.getAll(), brandService.getAll(), platformService.getAll(), campaignService.getAll(), userService.getAll(), shiftRegistrationService.getAll(), swapRequestService.getAll(),
      ])
      setShifts(loadedShifts); setReports(loadedReports); setBrands(loadedBrands); setPlatforms(loadedPlatforms); setCampaigns(loadedCampaigns); setUsers(loadedUsers); setRegistrations(loadedRegistrations); setSwapRequests(loadedSwaps);
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

  if (loading || !filters || !currentUser) return <ContentSkeleton />
  if (loadError) return <PageLoadError error={loadError} onRetry={() => { setLoading(true); void loadData() }} />

  const role = resolveSystemPermission(currentUser)
  const setPreset = (preset: Preset) => setFilters(current => current ? { ...current, preset, ...(preset === 'custom' ? {} : rangeFor(preset)) } : current)
  const dataProps = { shifts, reports, brands, platforms, campaigns, users, registrations, swapRequests, filters, setFilters, showFilters, setShowFilters, currentUser, t, setPreset }

  if (role === 'admin') return <AdminDashboard {...dataProps} />
  if (role === 'leader') return <LeaderDashboard {...dataProps} />
  return <MemberDashboard {...dataProps} />
}

type CommonProps = {
  shifts: Shift[]
  reports: Report[]
  brands: Brand[]
  platforms: Platform[]
  campaigns: Campaign[]
  users: User[]
  registrations: ShiftRegistration[]
  swapRequests: SwapRequest[]
  filters: Filters
  setFilters: React.Dispatch<React.SetStateAction<Filters | null>>
  showFilters: boolean
  setShowFilters: React.Dispatch<React.SetStateAction<boolean>>
  currentUser: User
  t: (key: string) => string
  setPreset: (preset: Preset) => void
}

const matchesRoleFilter = (shift: Shift, role: OperationalRole, userId: string, registrations: ShiftRegistration[]) => {
  const assignment = role === 'host' ? shift.host_id : role === 'support' ? shift.support_id : shift.technical_id
  return assignment === userId || isCanonicalAssignedShift(shift, role, userId, registrations)
}
const matchesDimensions = (shift: Shift, filters: Filters, registrations: ShiftRegistration[]) =>
  (filters.brand === 'all' || shift.brand_id === filters.brand) &&
  (filters.platform === 'all' || shift.platform_id === filters.platform) &&
  (filters.campaign === 'all' || shift.campaign_id === filters.campaign) &&
  (filters.host === 'all' || matchesRoleFilter(shift, 'host', filters.host, registrations)) &&
  (filters.support === 'all' || matchesRoleFilter(shift, 'support', filters.support, registrations)) &&
  (filters.technical === 'all' || matchesRoleFilter(shift, 'technical', filters.technical, registrations))

const nameFor = (items: Array<{ id: string; name: string }>, id: string) => items.find(item => item.id === id)?.name || '—'

function AdminDashboard(props: CommonProps) {
  const { shifts, reports, brands, platforms, campaigns, users, registrations, filters, setFilters, showFilters, setShowFilters, t, setPreset } = props
  
  const filteredShifts = shifts.filter(shift => shift.date >= filters.start && shift.date <= filters.end && matchesDimensions(shift, filters, registrations))
  const shiftIds = new Set(filteredShifts.map(shift => shift.id))
  const filteredReports = reports.filter(report => shiftIds.has(report.shift_id) && report.status === 'confirmed')
  
  const days = Math.max(1, Math.round((new Date(`${filters.end}T00:00:00`).getTime() - new Date(`${filters.start}T00:00:00`).getTime()) / 86400000) + 1)
  const previousEnd = dateValue(addDays(new Date(`${filters.start}T00:00:00`), -1))
  const previousStart = dateValue(addDays(new Date(`${previousEnd}T00:00:00`), -(days - 1)))
  const previousIds = new Set(shifts.filter(shift => shift.date >= previousStart && shift.date <= previousEnd && matchesDimensions(shift, filters, registrations)).map(shift => shift.id))
  const previousReports = reports.filter(report => previousIds.has(report.shift_id) && report.status === 'confirmed')
  
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
  const roleOptions = (role: 'host' | 'support' | 'technical') => users.filter(user => user.operational_roles?.includes(role)).map(user => ({ id: user.id, name: user.full_name }))

  return <PageShell archetype="command" className="space-y-6">
    <PageHeader>
      <PageHeaderContent>
        <h1 className="text-3xl font-bold">{t('dashboardTitle')}</h1>
        <p className="text-muted-foreground">{t('systemOperationsCommandCenter')}</p>
      </PageHeaderContent>
      <DashboardFilterControls filters={filters} setPreset={setPreset} showFilters={showFilters} setShowFilters={setShowFilters} t={t} />
    </PageHeader>

    <DashboardCustomDateRange filters={filters} setFilters={setFilters} t={t} />
    {showFilters && <DashboardFilterPanel filters={filters} setFilters={setFilters} brands={brands} platforms={platforms} campaigns={campaigns} roleOptions={roleOptions} t={t} />}

    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Metric title={t('todaysLiveSessions')} value={filteredShifts.filter(shift => shift.date === today).length.toString()} icon={<Calendar className="h-5 w-5 text-blue-600 dark:text-blue-400" />} />
      <Metric title={t('liveInProgress')} value={filteredShifts.filter(shift => shift.status === 'live').length.toString()} icon={<Radio className="h-5 w-5 text-red-600 dark:text-red-400" />} />
      <Metric title={t('reportsSubmitted')} value={filteredReports.length.toString()} icon={<FileText className="h-5 w-5 text-amber-600 dark:text-amber-400" />} />
      <Metric title={t('confirmedRevenue')} value={formatCurrency(revenue)} note={`${delta} ${t('previousPeriod')}`} icon={<TrendingUp className="h-5 w-5 text-green-600 dark:text-green-400" />} />
    </div>

    <div className="grid gap-4 md:grid-cols-2">
      <Card><CardHeader><CardTitle>{t('operationsCenter')}</CardTitle><CardDescription>{t('quickActions')}</CardDescription></CardHeader><CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <QuickAction href="/calendar" label={t('calendar')} icon={<Calendar className="h-5 w-5" />} />
        <QuickAction href="/live" label={t('liveMonitor')} icon={<Radio className="h-5 w-5" />} />
        <QuickAction href="/staff" label={t('staff')} icon={<Users className="h-5 w-5" />} />
        <QuickAction href="/data-quality" label={t('dataQuality')} icon={<ShieldAlert className="h-5 w-5 text-destructive" />} />
      </CardContent></Card>

      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-4">
          <Metric title={t('totalStaff')} value={new Set([
            ...filteredShifts.flatMap(shift => [shift.host_id, shift.support_id, shift.technical_id]).filter((id): id is string => Boolean(id)),
            ...registrations.filter(registration => isStaffedRegistration(registration) && shiftIds.has(registration.shift_id)).map(registration => registration.user_id),
          ]).size.toString()} icon={<Users className="h-5 w-5 text-purple-600 dark:text-purple-400" />} />
          <Metric title={t('campaigns')} value={new Set(filteredShifts.map(shift => shift.campaign_id).filter(Boolean)).size.toString()} icon={<Package className="h-5 w-5 text-orange-600 dark:text-orange-400" />} />
        </div>
        <Card className="flex-1 bg-muted/20 border-muted-foreground/20"><CardContent className="flex h-full items-center justify-between p-4"><div><p className="font-semibold text-sm text-foreground">{t('dataQuality')}</p><p className="text-xs text-muted-foreground mt-0.5">{t('dataQualityAlertsSubtitle')}</p></div><Button variant="outline" size="sm" render={<Link href="/data-quality" />} nativeButton={false}>{t('review')}</Button></CardContent></Card>
      </div>
    </div>

    <DashboardCharts
      trend={trend}
      statusSummary={statusSummary}
      revenueLabel={t('revenue')}
      ordersLabel={t('orders')}
      revenueTrendLabel={t('revenueTrend')}
      shiftStatusSummaryLabel={t('shiftStatusSummary')}
      noDataLabel={t('noData')}
    />

    <UpcomingShiftsList upcoming={upcoming} brands={brands} platforms={platforms} t={t} />
  </PageShell>
}

function LeaderDashboard(props: CommonProps) {
  const { shifts, reports, brands, platforms, campaigns, users, registrations, swapRequests, filters, setFilters, showFilters, setShowFilters, t, setPreset } = props
  
  const filteredShifts = shifts.filter(shift => shift.date >= filters.start && shift.date <= filters.end && matchesDimensions(shift, filters, registrations))
  const today = dateValue(new Date())
  const todaysShifts = filteredShifts.filter(shift => shift.date === today)
  
  const shiftIds = new Set(filteredShifts.map(shift => shift.id))
  
  const pendingRegistrations = getLeaderPendingRegistrations(registrations, shiftIds)
  const pendingSwaps = getLeaderPendingSwaps(swapRequests, shiftIds)
  const pendingReports = getLeaderPendingReports(reports, shiftIds)

  const upcoming = filteredShifts.filter(shift => shift.date >= today && shift.status === 'scheduled').sort((a, b) => `${a.date}${a.start_time}`.localeCompare(`${b.date}${b.start_time}`)).slice(0, 5)
  const roleOptions = (role: 'host' | 'support' | 'technical') => users.filter(user => user.operational_roles?.includes(role)).map(user => ({ id: user.id, name: user.full_name }))

  return <PageShell archetype="command" className="space-y-6">
    <PageHeader>
      <PageHeaderContent>
        <h1 className="text-3xl font-bold">{t('leaderDashboard')}</h1>
        <p className="text-muted-foreground">{t('todaysOperationsDecisionQueue')}</p>
      </PageHeaderContent>
      <DashboardFilterControls filters={filters} setPreset={setPreset} showFilters={showFilters} setShowFilters={setShowFilters} t={t} />
    </PageHeader>

    <DashboardCustomDateRange filters={filters} setFilters={setFilters} t={t} />
    {showFilters && <DashboardFilterPanel filters={filters} setFilters={setFilters} brands={brands} platforms={platforms} campaigns={campaigns} roleOptions={roleOptions} t={t} />}

    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Metric title={t('shiftsToday')} value={todaysShifts.length.toString()} icon={<Calendar className="h-5 w-5 text-blue-600 dark:text-blue-400" />} />
      <Metric title={t('liveNow')} value={filteredShifts.filter(shift => shift.status === 'live').length.toString()} icon={<Radio className="h-5 w-5 text-red-600 dark:text-red-400" />} />
      <Metric title={t('pendingRegistrations')} value={pendingRegistrations.length.toString()} icon={<Users className="h-5 w-5 text-amber-600 dark:text-amber-400" />} />
      <Metric title={t('pendingSwaps')} value={pendingSwaps.length.toString()} icon={<ArrowLeftRight className="h-5 w-5 text-purple-600 dark:text-purple-400" />} />
    </div>

    <div className="grid gap-4 md:grid-cols-2">
      <Card><CardHeader><CardTitle>{t('actionQueue')}</CardTitle><CardDescription>{t('attentionRequired')}</CardDescription></CardHeader><CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <QuickAction href="/calendar" label={t('calendar')} icon={<Calendar className="h-5 w-5" />} />
        <QuickAction href="/live" label={t('liveMonitor')} icon={<Radio className="h-5 w-5" />} />
        <QuickAction href="/reports" label={t('reports')} icon={<FileText className="h-5 w-5" />} />
        <QuickAction href="/swaps" label={t('swaps')} icon={<ArrowLeftRight className="h-5 w-5" />} />
      </CardContent></Card>
      
      <div className="flex flex-col gap-4">
        {(pendingRegistrations.length > 0 || pendingSwaps.length > 0) && (
          <Card className="flex-1 bg-amber-500/5 border-amber-500/20"><CardContent className="flex h-full items-center justify-between p-4">
            <div>
              <p className="font-semibold text-sm text-amber-600 dark:text-amber-400">{t('attentionRequired')}</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                {t('attentionRequiredSubtitle').replace('{registrations}', String(pendingRegistrations.length)).replace('{swaps}', String(pendingSwaps.length))}
              </p>
            </div>
            <Button variant="outline" size="sm" render={<Link href="/calendar" />} nativeButton={false} className="border-amber-500/30 text-amber-600 hover:bg-amber-500/10">{t('review')}</Button>
          </CardContent></Card>
        )}
        {pendingReports.length > 0 && (
          <Card className="flex-1 bg-blue-500/5 border-blue-500/20"><CardContent className="flex h-full items-center justify-between p-4">
            <div>
              <p className="font-semibold text-sm text-blue-600 dark:text-blue-400">{t('reportsPending')}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{t('reportsPendingSubtitle').replace('{reports}', String(pendingReports.length))}</p>
            </div>
            <Button variant="outline" size="sm" render={<Link href="/reports" />} nativeButton={false} className="border-blue-500/30 text-blue-600 hover:bg-blue-500/10">{t('review')}</Button>
          </CardContent></Card>
        )}
      </div>
    </div>

    <UpcomingShiftsList upcoming={upcoming} brands={brands} platforms={platforms} t={t} />
  </PageShell>
}

function MemberDashboard(props: CommonProps) {
  const { shifts, reports, brands, platforms, currentUser, registrations, swapRequests, t } = props
  
  const today = dateValue(new Date())
  
  // Find member's shifts using strictly canonical registration
  const myShifts = getMemberAssignedShifts(shifts, currentUser.id, registrations)
  
  const upcoming = myShifts.filter(shift => shift.date >= today && (shift.status === 'scheduled' || shift.status === 'live' || shift.status === 'preparing')).sort((a, b) => `${a.date}${a.start_time}`.localeCompare(`${b.date}${b.start_time}`))
  const nextShift = upcoming[0]
  
  const myPendingSwaps = getMemberPendingSwaps(swapRequests, currentUser.id)
  const myReports = reports.filter(r => r.submitted_by === currentUser.id)
  const myPendingRegistrations = getMemberPendingRegistrations(registrations, currentUser.id)

  return <PageShell archetype="command" className="space-y-6">
    <PageHeader>
      <PageHeaderContent>
        <h1 className="text-3xl font-bold">{t('welcome')}, {currentUser.full_name.split(' ')[0]}</h1>
        <p className="text-muted-foreground">{t('myWorkspace')}</p>
      </PageHeaderContent>
    </PageHeader>

    {nextShift && (
      <Card className="bg-primary/5 border-primary/20">
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-primary">{t('nextAssignedShift')}</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-between gap-4">
          <div>
            <p className="font-semibold text-lg">{nextShift.title || nameFor(brands, nextShift.brand_id)}</p>
            <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
              <Calendar className="w-4 h-4" /> <span>{nextShift.date}</span>
              <Clock className="w-4 h-4 ml-2" /> <span>{formatShiftTimeRange(nextShift)}</span>
            </div>
          </div>
          <Button render={<Link href="/calendar" />} nativeButton={false}>{t('viewDetails')}</Button>
        </CardContent>
      </Card>
    )}

    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Metric title={t('myUpcomingShifts')} value={upcoming.length.toString()} icon={<Calendar className="h-5 w-5 text-blue-600 dark:text-blue-400" />} />
      <Metric title={t('pendingRegistrations')} value={myPendingRegistrations.length.toString()} icon={<Users className="h-5 w-5 text-amber-600 dark:text-amber-400" />} />
      <Metric title={t('pendingSwaps')} value={myPendingSwaps.length.toString()} icon={<ArrowLeftRight className="h-5 w-5 text-purple-600 dark:text-purple-400" />} />
      <Metric title={t('mySubmittedReports')} value={myReports.length.toString()} icon={<CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />} />
    </div>

    <div className="grid gap-4 md:grid-cols-2">
      <Card><CardHeader><CardTitle>{t('quickActions')}</CardTitle></CardHeader><CardContent className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <QuickAction href="/calendar" label={t('myCalendar')} icon={<Calendar className="h-5 w-5" />} />
        <QuickAction href="/calendar" label={t('openShifts')} icon={<Users className="h-5 w-5" />} />
        <QuickAction href="/reports" label={t('submitReport')} icon={<FileText className="h-5 w-5" />} />
        <QuickAction href="/notifications" label={t('notifications')} icon={<Bell className="h-5 w-5" />} />
      </CardContent></Card>
    </div>

    <UpcomingShiftsList upcoming={upcoming.slice(0, 5)} brands={brands} platforms={platforms} t={t} title={t('mySchedule')} />
  </PageShell>
}

// Shared components

function DashboardFilterControls({ filters, setPreset, showFilters, setShowFilters, t }: { filters: Filters; setPreset: (preset: Preset) => void; showFilters: boolean; setShowFilters: (v: boolean) => void; t: (key: string) => string }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={filters.preset} onValueChange={value => setPreset(value as Preset)}><SelectTrigger className="w-[160px]"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="today">{t('today')}</SelectItem><SelectItem value="yesterday">{t('yesterday')}</SelectItem><SelectItem value="7d">{t('last7Days')}</SelectItem><SelectItem value="30d">{t('last30Days')}</SelectItem><SelectItem value="thisMonth">{t('thisMonth')}</SelectItem><SelectItem value="lastMonth">{t('lastMonth')}</SelectItem><SelectItem value="custom">{t('customRange')}</SelectItem></SelectContent></Select>
      <Button variant={showFilters ? 'secondary' : 'outline'} onClick={() => setShowFilters(!showFilters)} aria-expanded={showFilters} aria-controls="dashboard-filter-panel"><Filter className="mr-2 h-4 w-4" />{t('filters')}</Button>
    </div>
  )
}

function DashboardCustomDateRange({ filters, setFilters, t }: { filters: Filters; setFilters: React.Dispatch<React.SetStateAction<Filters | null>>; t: (key: string) => string }) {
  if (filters.preset !== 'custom') return null
  return (
    <div className="flex flex-wrap items-center gap-4 rounded-md border bg-muted/30 px-4 py-3">
      <label className="flex items-center gap-2 text-sm font-medium">{t('startDate')}<Input className="w-auto h-8" type="date" value={filters.start} onChange={event => setFilters(current => current ? { ...current, start: event.target.value } : current)} /></label>
      <label className="flex items-center gap-2 text-sm font-medium">{t('endDate')}<Input className="w-auto h-8" type="date" value={filters.end} onChange={event => setFilters(current => current ? { ...current, end: event.target.value } : current)} /></label>
    </div>
  )
}

function DashboardFilterPanel({ filters, setFilters, brands, platforms, campaigns, roleOptions, t }: { filters: Filters; setFilters: React.Dispatch<React.SetStateAction<Filters | null>>; brands: Brand[]; platforms: Platform[]; campaigns: Campaign[]; roleOptions: (role: 'host' | 'support' | 'technical') => {id: string, name: string}[]; t: (key: string) => string }) {
  return (
    <Card id="dashboard-filter-panel"><CardContent className="space-y-4 pt-4">
      <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
        <FilterSelect label={t('brand')} value={filters.brand} options={brands} onChange={value => setFilters(current => current ? { ...current, brand: value } : current)} />
        <FilterSelect label={t('platform')} value={filters.platform} options={platforms} onChange={value => setFilters(current => current ? { ...current, platform: value } : current)} />
        <FilterSelect label={t('campaign')} value={filters.campaign} options={campaigns} onChange={value => setFilters(current => current ? { ...current, campaign: value } : current)} />
        <FilterSelect label={t('host')} value={filters.host} options={roleOptions('host')} onChange={value => setFilters(current => current ? { ...current, host: value } : current)} />
        <FilterSelect label={t('support')} value={filters.support} options={roleOptions('support')} onChange={value => setFilters(current => current ? { ...current, support: value } : current)} />
        <FilterSelect label={t('technical')} value={filters.technical} options={roleOptions('technical')} onChange={value => setFilters(current => current ? { ...current, technical: value } : current)} />
      </div>
      <Button variant="ghost" onClick={() => setFilters(initialFilters())} size="sm" className="h-8"><RotateCcw className="mr-2 h-3 w-3" />{t('resetFilters')}</Button>
    </CardContent></Card>
  )
}

function UpcomingShiftsList({ upcoming, brands, platforms, t, title }: { upcoming: Shift[]; brands: Brand[]; platforms: Platform[]; t: (key: string) => string; title?: string }) {
  return (
    <Card><CardHeader className="flex-row items-center justify-between border-b px-4 py-3 space-y-0"><div><CardTitle className="text-base">{title || t('upcomingShifts')}</CardTitle></div><Button nativeButton={false} render={<Link href="/calendar" />} variant="outline" size="sm" className="h-8">{t('viewAll')}</Button></CardHeader><CardContent className="p-0">{upcoming.length ? <div className="divide-y">{upcoming.map(shift => <div className="flex items-center justify-between gap-4 p-4 hover:bg-muted/30 transition-colors" key={shift.id}><div className="min-w-0 flex-1"><p className="font-medium truncate">{shift.title || nameFor(brands, shift.brand_id)}</p><div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-muted-foreground"><span>{shift.date}</span><span className="w-1 h-1 rounded-full bg-muted-foreground/40" /><span>{formatShiftTimeRange(shift)}</span><span className="w-1 h-1 rounded-full bg-muted-foreground/40" /><span>{nameFor(platforms, shift.platform_id)}</span></div></div><Badge variant="secondary" className="shrink-0">{t('scheduled')}</Badge></div>)}</div> : <div className="p-8"><Empty text={t('noMatchingShifts')} /></div>}</CardContent></Card>
  )
}

function FilterSelect({ label, value, options, onChange }: { label: string; value: string; options: Array<{ id: string; name: string }>; onChange: (value: string) => void }) {
  const { t } = useTranslation()
  return <label className="text-xs font-medium">{label}<Select value={value} onValueChange={onChange}><SelectTrigger className="mt-1 w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{t('all')}</SelectItem>{options.map(option => <SelectItem key={option.id} value={option.id}>{option.name}</SelectItem>)}</SelectContent></Select></label>
}
function Metric({ title, value, note, icon }: { title: string; value: string; note?: string; icon: React.ReactNode }) { return <Card className="shadow-none"><CardHeader className="flex-row items-center justify-between pb-2 pt-4 px-4 space-y-0"><CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>{icon}</CardHeader><CardContent className="px-4 pb-4"><p className="text-2xl font-bold">{value}</p>{note && <p className="mt-1 text-xs font-medium text-muted-foreground">{note}</p>}</CardContent></Card> }
function QuickAction({ href, label, icon }: { href: string; label: string; icon: React.ReactNode }) { return <Button nativeButton={false} render={<Link href={href} />} variant="outline" className="h-20 flex-col gap-1.5 bg-muted/20">{icon}<span className="text-xs">{label}</span></Button> }
function Empty({ text }: { text: string }) { return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">{text}</div> }
