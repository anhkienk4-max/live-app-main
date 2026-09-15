'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { addDays, endOfMonth, format, startOfMonth, subMonths } from 'date-fns'
import { Bell, Calendar, Clock, FileText, Filter, Radio, RotateCcw, Users, ArrowLeftRight, CheckCircle } from 'lucide-react'
import dynamic from 'next/dynamic'
import { brandService, campaignService, isStaffedRegistration, platformService, reportService, shiftRegistrationService, shiftService, swapRequestService, userService } from '@/lib/services/dataService'
import { Brand, Campaign, OperationalRole, Platform, Report, Shift, ShiftRegistration, SwapRequest, User } from '@/lib/types/database.types'
import { useTranslation } from '@/lib/i18n'
import { formatCurrency } from '@/lib/utils/currency'
import { formatShiftTimeRange, getCurrentBusinessDate } from '@/lib/utils/shiftUtils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ContentSkeleton } from '@/components/ui/content-skeleton'
import { PageLoadError } from '@/components/ui/page-load-error'
import { PageShell, PageHeader, PageHeaderContent } from '@/components/ui/archetypes'
import { OperationalStatusStrip, HealthyState } from '@/components/ui/operational-status'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'
import { resolveSystemPermission } from '@/lib/permissions'
import { getSwapUiActions } from '@/lib/utils/swapUi'
import { isCanonicalAssignedShift, getMemberAssignedShifts, getMemberPendingRegistrations, getMemberPendingSwaps, getLeaderPendingRegistrations, getLeaderPendingReports, getLeaderPendingSwaps } from '@/lib/ui/dashboard-role-data'
import { deriveLeaderAttention, deriveMemberAttention, deriveDataQualityAttention } from '@/lib/ui/operational-attention'
import { getAllIssues } from '@/lib/utils/dataQuality'
import { matchesMultiSelect } from '@/lib/utils/multiSelectFilter'
import { MultiSelectFilter } from '@/components/ui/multi-select-filter'


const DashboardCharts = dynamic(
  () => import('@/components/features/dashboard/DashboardCharts').then(mod => ({ default: mod.DashboardCharts })),
  { ssr: false, loading: () => <div className="grid gap-5 xl:grid-cols-2">{[0, 1].map(i => <Card key={i}><CardContent className="h-72"><div className="space-y-3 pt-5"><ContentSkeleton /></div></CardContent></Card>)}</div> },
)

type Preset = 'today' | 'yesterday' | '7d' | '30d' | 'thisMonth' | 'lastMonth' | 'custom'
type Filters = { preset: Preset; start: string; end: string; brandIds: string[]; platformIds: string[]; campaignIds: string[]; hostIds: string[]; supportIds: string[]; technicalIds: string[] }
const dateValue = (date: Date) => format(date, 'yyyy-MM-dd')
const rangeFor = (preset: Exclude<Preset, 'custom'>) => {
  const today = new Date(`${getCurrentBusinessDate()}T00:00:00`)
  if (preset === 'today') return { start: dateValue(today), end: dateValue(today) }
  if (preset === 'yesterday') return { start: dateValue(addDays(today, -1)), end: dateValue(addDays(today, -1)) }
  if (preset === '7d') return { start: dateValue(addDays(today, -6)), end: dateValue(today) }
  if (preset === '30d') return { start: dateValue(addDays(today, -29)), end: dateValue(today) }
  if (preset === 'thisMonth') return { start: dateValue(startOfMonth(today)), end: dateValue(today) }
  const previous = subMonths(today, 1)
  return { start: dateValue(startOfMonth(previous)), end: dateValue(endOfMonth(previous)) }
}
const initialFilters = (): Filters => ({ preset: '30d', ...rangeFor('30d'), brandIds: [], platformIds: [], campaignIds: [], hostIds: [], supportIds: [], technicalIds: [] })


export function calculateAggregate(reports: Report[], key: keyof Pick<Report, 'revenue' | 'orders' | 'gmv'>): number | null {
  if (reports.length === 0) return null;
  let hasValidValue = false;
  let sum = 0;
  for (const report of reports) {
    const val = report[key];
    if (typeof val === 'number') {
      sum += val;
      hasValidValue = true;
    }
  }
  return hasValidValue ? sum : null;
}

export function DashboardOverview() {
  const router = useRouter()
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
  const [selectedShift, setSelectedShift] = React.useState<Shift | null>(null)
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
    const frame = requestAnimationFrame(() => {
      setFilters(initialFilters())
      void loadData()
    })
    return () => cancelAnimationFrame(frame)
  }, [loadData])

  const initialLoad = !filters || !currentUser || (loading && shifts.length === 0)
  if (initialLoad) return <ContentSkeleton />
  if (loadError) return <PageLoadError error={loadError} onRetry={() => { setLoading(true); void loadData() }} />

  const role = resolveSystemPermission(currentUser)
  const setPreset = (preset: Preset) => setFilters(current => current ? { ...current, preset, ...(preset === 'custom' ? {} : rangeFor(preset)) } : current)
  const dataProps = { shifts, reports, brands, platforms, campaigns, users, registrations, swapRequests, filters, setFilters, showFilters, setShowFilters, currentUser, t, setPreset }

  return (
    <div className={loading ? 'opacity-50 pointer-events-none transition-opacity duration-200' : 'transition-opacity duration-200'}>
      {role === 'admin' && <AdminDashboard {...dataProps} setSelectedShift={setSelectedShift} />}
      {role === 'leader' && <LeaderDashboard {...dataProps} setSelectedShift={setSelectedShift} />}
      {role === 'member' && <MemberDashboard {...dataProps} setSelectedShift={setSelectedShift} />}
      
    </div>
  )
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
  setSelectedShift: (shift: Shift | null) => void
}

const matchesRoleFilter = (shift: Shift, role: OperationalRole, userId: string, registrations: ShiftRegistration[]) => {
  const assignment = role === 'host' ? shift.host_id : role === 'support' ? shift.support_id : shift.technical_id
  return assignment === userId || isCanonicalAssignedShift(shift, role, userId, registrations)
}
const matchesDimensions = (shift: Shift, filters: Filters, registrations: ShiftRegistration[]) =>
  matchesMultiSelect(shift.brand_id, filters.brandIds) &&
  matchesMultiSelect(shift.platform_id, filters.platformIds) &&
  matchesMultiSelect(shift.campaign_id, filters.campaignIds) &&
  (filters.hostIds.length === 0 || filters.hostIds.some(userId => matchesRoleFilter(shift, 'host', userId, registrations))) &&
  (filters.supportIds.length === 0 || filters.supportIds.some(userId => matchesRoleFilter(shift, 'support', userId, registrations))) &&
  (filters.technicalIds.length === 0 || filters.technicalIds.some(userId => matchesRoleFilter(shift, 'technical', userId, registrations)))

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

  const scopedReports = reports.filter(report => shiftIds.has(report.shift_id))
  const scopedRegistrations = registrations.filter(reg => shiftIds.has(reg.shift_id))
  const dqIssues = getAllIssues({ shifts: filteredShifts, reports: scopedReports, registrations: scopedRegistrations })
  const errorCount = dqIssues.filter(i => i.severity === 'error').length
  const warningCount = dqIssues.filter(i => i.severity === 'warning').length
  const infoCount = dqIssues.filter(i => i.severity === 'info').length
  const dqAttention = deriveDataQualityAttention(errorCount, warningCount, infoCount)

  const revenue = calculateAggregate(filteredReports, 'revenue')
  const previousRevenue = calculateAggregate(previousReports, 'revenue')
  const delta = (revenue !== null && previousRevenue !== null && previousRevenue !== 0)
    ? `${(((revenue - previousRevenue) / previousRevenue) * 100).toFixed(1)}%`
    : '—'
  const today = getCurrentBusinessDate()
  const trend = Object.entries(filteredReports.reduce<Record<string, { revenue: number | null; orders: number | null }>>((result, report) => {
    const shift = shifts.find(candidate => candidate.id === report.shift_id)
    if (shift) {
      if (!result[shift.date]) { result[shift.date] = { revenue: null, orders: null } }
      if (typeof report.revenue === 'number') {
        result[shift.date].revenue = (result[shift.date].revenue || 0) + report.revenue
      }
      if (typeof report.orders === 'number') {
        result[shift.date].orders = (result[shift.date].orders || 0) + report.orders
      }
    }
    return result
  }, {})).sort(([left], [right]) => left.localeCompare(right)).map(([date, values]) => ({ date, revenue: values.revenue ?? 0, orders: values.orders ?? 0 }))

  const statusSummary = ['scheduled', 'preparing', 'live', 'paused', 'completed', 'cancelled'].map(status => ({
    status: status === 'live' ? t('liveStatus') : t(status as 'scheduled' | 'preparing' | 'paused' | 'completed' | 'cancelled'),
    shifts: filteredShifts.filter(shift => shift.status === status).length,
  }))

  const upcoming = filteredShifts.filter(shift => shift.date >= today && shift.status === 'scheduled').sort((a, b) => `${a.date}${a.start_time}`.localeCompare(`${b.date}${b.start_time}`)).slice(0, 5)
  const roleOptions = (role: 'host' | 'support' | 'technical') => users.filter(user => user.operational_roles?.includes(role)).map(user => ({ id: user.id, name: user.full_name }))

  // Derived metric values (no new data, reuse existing authoritative derivations)
  const staffCount = new Set([
    ...filteredShifts.flatMap(shift => [shift.host_id, shift.support_id, shift.technical_id]).filter((id): id is string => Boolean(id)),
    ...registrations.filter(registration => isStaffedRegistration(registration) && shiftIds.has(registration.shift_id)).map(registration => registration.user_id),
  ]).size
  const campaignCount = new Set(filteredShifts.map(shift => shift.campaign_id).filter(Boolean)).size
  const liveCount = filteredShifts.filter(shift => shift.status === 'live').length

  return <PageShell archetype="command" className="space-y-6 md:p-6 p-4">
    {/* A. Page Header */}
    <PageHeader className="flex-col md:flex-row items-start md:items-center gap-4 md:gap-2">
      <PageHeaderContent>
        <h1 className="text-2xl font-semibold truncate">{t('dashboardTitle')}</h1>
        <p className="text-[13px] text-muted-foreground">{t('systemOperationsCommandCenter')}</p>
      </PageHeaderContent>
      <DashboardFilterControls filters={filters} setPreset={setPreset} showFilters={showFilters} setShowFilters={setShowFilters} t={t} />
    </PageHeader>

    <DashboardCustomDateRange filters={filters} setFilters={setFilters} t={t} />
    {showFilters && <DashboardFilterPanel filters={filters} setFilters={setFilters} brands={brands} platforms={platforms} campaigns={campaigns} roleOptions={roleOptions} t={t} />}

    {/* B. Authoritative Attention — Data Quality only (omit when clear) */}
    {dqAttention.length > 0 && (
      <OperationalStatusStrip items={dqAttention} className="gap-2" compact />
    )}

    {/* C. Live / Upcoming Operations — primary operational content */}
    <UpcomingShiftsList upcoming={upcoming} brands={brands} platforms={platforms} t={t} setSelectedShift={props.setSelectedShift} />

    {/* D. Operational Metric Strip — single compact row, text-first, 4 values max */}
    <AdminMetricStrip
      liveCount={liveCount}
      staffCount={staffCount}
      campaignCount={campaignCount}
      confirmedRevenue={revenue !== null ? formatCurrency(revenue) : '—'}
      revenueDelta={delta}
      t={t}
    />

    {/* E. Charts / deeper analytics — secondary, below operational content */}
    <DashboardCharts
      trend={trend}
      statusSummary={statusSummary}
      revenueLabel={t('revenue')}
      ordersLabel={t('orders')}
      revenueTrendLabel={t('revenueTrend')}
      shiftStatusSummaryLabel={t('shiftStatusSummary')}
      noDataLabel={t('noData')}
      notEnoughTrendDataLabel={t('notEnoughTrendData')}
    />
  </PageShell>
}

function AdminMetricStrip({
  liveCount,
  staffCount,
  campaignCount,
  confirmedRevenue,
  revenueDelta,
  t,
}: {
  liveCount: number
  staffCount: number
  campaignCount: number
  confirmedRevenue: string
  revenueDelta: string
  t: (key: string) => string
}) {
  const items = [
    { label: t('liveInProgress'), value: liveCount.toString() },
    { label: t('staffInScope'), value: staffCount.toString() },
    { label: t('campaigns'), value: campaignCount.toString() },
    { label: t('confirmedRevenue'), value: confirmedRevenue, note: revenueDelta !== '—' ? revenueDelta : undefined },
  ]
  return (
    <div className="flex flex-wrap items-stretch divide-x divide-border border-y bg-transparent">
      {items.map((item, i) => (
        <div key={i} className="flex min-w-0 flex-1 flex-col justify-center px-4 py-2">
          <span className="text-xs text-muted-foreground">{item.label}</span>
          <span className="mt-0.5 text-lg font-semibold tabular-nums">{item.value}</span>
          {item.note && <span className="text-xs text-muted-foreground">{item.note}</span>}
        </div>
      ))}
    </div>
  )
}

function LeaderDashboard(props: CommonProps) {
  const { shifts, reports, brands, platforms, campaigns, users, registrations, swapRequests, filters, setFilters, showFilters, setShowFilters, currentUser, t, setPreset } = props

  const filteredShifts = shifts.filter(shift => shift.date >= filters.start && shift.date <= filters.end && matchesDimensions(shift, filters, registrations))
  const today = getCurrentBusinessDate()
  const todaysShifts = filteredShifts.filter(shift => shift.date === today)

  const shiftIds = new Set(filteredShifts.map(shift => shift.id))

  const pendingRegistrations = getLeaderPendingRegistrations(registrations, shiftIds)
  const pendingSwaps = getLeaderPendingSwaps(swapRequests, shiftIds)
  const pendingReports = getLeaderPendingReports(reports, shiftIds)

  // Retrieve data quality issues scoped to current timeframe
  const scopedReports = reports.filter(report => shiftIds.has(report.shift_id))
  const scopedRegistrations = registrations.filter(reg => shiftIds.has(reg.shift_id))
  const dqIssues = getAllIssues({ shifts: filteredShifts, reports: scopedReports, registrations: scopedRegistrations })
  const dqErrorCount = dqIssues.filter(i => i.severity === 'error').length

  // E5: derive exception-first attention summary
  let actionableSwapCount = 0
  let waitingSwapCount = 0

  const operationalSwaps = swapRequests.filter(s =>
    (s.status === 'pending' || s.status === 'accepted') &&
    (shiftIds.has(s.shift_id) || (s.source_shift_id && shiftIds.has(s.source_shift_id)) || (s.target_shift_id && shiftIds.has(s.target_shift_id)))
  )

  operationalSwaps.forEach(s => {
    const actions = getSwapUiActions(s, currentUser)
    if (actions.showAccept || actions.showCounterpartReject || actions.showApprove || actions.showReviewerReject || actions.showCancel) {
      actionableSwapCount++
    } else {
      waitingSwapCount++
    }
  })

  const attention = deriveLeaderAttention({
    pendingRegistrationCount: pendingRegistrations.length,
    actionableSwapCount,
    waitingSwapCount,
    pendingReportCount: pendingReports.length,
    dqErrorCount,
  })

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

    {/* E5: Exception-first — show action queue before passive metrics */}
    {attention.items.length > 0 ? (
      <OperationalStatusStrip items={attention.items} className="gap-2" />
    ) : (
      <HealthyState
        message={t('noPendingDecisions')}
        description={t('allUpToDate')}
      />
    )}

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
    </div>

    <UpcomingShiftsList upcoming={upcoming} brands={brands} platforms={platforms} t={t} setSelectedShift={props.setSelectedShift} />
  </PageShell>
}

function MemberDashboard(props: CommonProps) {
  const router = useRouter()
  const { shifts, reports, brands, platforms, currentUser, registrations, swapRequests, t, setSelectedShift } = props

  const today = getCurrentBusinessDate()

  // Find member's shifts using strictly canonical registration
  const myShifts = getMemberAssignedShifts(shifts, currentUser.id, registrations)

  const upcoming = myShifts.filter(shift => shift.date >= today && (shift.status === 'scheduled' || shift.status === 'live' || shift.status === 'preparing')).sort((a, b) => `${a.date}${a.start_time}`.localeCompare(`${b.date}${b.start_time}`))
  const nextShift = upcoming[0]

  const myPendingSwaps = getMemberPendingSwaps(swapRequests, currentUser.id)
  const myReports = reports.filter(r => r.submitted_by === currentUser.id)
  const myPendingRegistrations = getMemberPendingRegistrations(registrations, currentUser.id)

  // E5: derive personal exception summary
  let actionableSwapCount = 0
  let waitingSwapCount = 0

  const personalOperationalSwaps = swapRequests.filter(s =>
    (s.status === 'pending' || s.status === 'accepted') &&
    (s.requester_id === currentUser.id || s.counterpart_id === currentUser.id)
  )

  personalOperationalSwaps.forEach(s => {
    const actions = getSwapUiActions(s, currentUser)
    if (actions.showAccept || actions.showCounterpartReject || actions.showApprove || actions.showReviewerReject || actions.showCancel) {
      actionableSwapCount++
    } else {
      waitingSwapCount++
    }
  })

  const memberAttention = deriveMemberAttention({
    pendingRegistrationCount: myPendingRegistrations.length,
    actionableSwapCount,
    waitingSwapCount,
    hasUpcomingShift: upcoming.length > 0,
  })

  return <PageShell archetype="command" className="space-y-6">
    <PageHeader>
      <PageHeaderContent>
        <h1 className="text-3xl font-bold">{t('welcome')}, {currentUser.full_name.split(' ')[0]}</h1>
        <p className="text-muted-foreground">{t('myWorkspace')}</p>
      </PageHeaderContent>
    </PageHeader>

    {/* E5: personal exception-first strip */}
    {memberAttention.items.length > 0 ? (
      <OperationalStatusStrip items={memberAttention.items} className="gap-2" />
    ) : (
      <HealthyState
        message={t('allClear')}
        description={t('noPendingRequests')}
      />
    )}

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
          <Button onClick={() => router.push('/shifts')}>{t('viewDetails')}</Button>
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
        <QuickAction href="/calendar?tab=mine" label={t('myCalendar')} icon={<Calendar className="h-5 w-5" />} />
        <QuickAction href="/calendar?tab=open" label={t('openShifts')} icon={<Users className="h-5 w-5" />} />
        <QuickAction href="/reports" label={t('submitReport')} icon={<FileText className="h-5 w-5" />} />
        <QuickAction href="/notifications" label={t('notifications')} icon={<Bell className="h-5 w-5" />} />
      </CardContent></Card>
    </div>

    <UpcomingShiftsList upcoming={upcoming.slice(0, 5)} brands={brands} platforms={platforms} t={t} title={t('mySchedule')} setSelectedShift={setSelectedShift} />
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
        <FilterSelect label={t('brand')} value={filters.brandIds} options={brands} onChange={value => setFilters(current => current ? { ...current, brandIds: value } : current)} />
        <FilterSelect label={t('platform')} value={filters.platformIds} options={platforms} onChange={value => setFilters(current => current ? { ...current, platformIds: value } : current)} />
        <FilterSelect label={t('campaign')} value={filters.campaignIds} options={campaigns} onChange={value => setFilters(current => current ? { ...current, campaignIds: value } : current)} />
        <FilterSelect label={t('host')} value={filters.hostIds} options={roleOptions('host')} onChange={value => setFilters(current => current ? { ...current, hostIds: value } : current)} />
        <FilterSelect label={t('support')} value={filters.supportIds} options={roleOptions('support')} onChange={value => setFilters(current => current ? { ...current, supportIds: value } : current)} />
        <FilterSelect label={t('technical')} value={filters.technicalIds} options={roleOptions('technical')} onChange={value => setFilters(current => current ? { ...current, technicalIds: value } : current)} />
      </div>
      <Button variant="ghost" onClick={() => setFilters(initialFilters())} size="sm" className="h-8"><RotateCcw className="mr-2 h-3 w-3" />{t('resetFilters')}</Button>
    </CardContent></Card>
  )
}

function UpcomingShiftsList({ upcoming, brands, platforms, t, title, setSelectedShift }: { upcoming: Shift[]; brands: Brand[]; platforms: Platform[]; t: (key: string) => string; title?: string; setSelectedShift: (shift: Shift | null) => void }) {
  const router = useRouter()
  return (
    <div className="flex flex-col"><div className="flex items-center justify-between pb-3 border-b mb-3"><div><h2 className="text-[15px] font-semibold">{title || t('upcomingShifts')}</h2></div><Button nativeButton={false} render={<Link href="/calendar" />} variant="ghost" size="sm" className="h-8 text-[13px]">{t('viewAll')}</Button></div><div>{upcoming.length ? <div className="divide-y">{upcoming.map(shift => <button type="button" className="flex w-full flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4 py-3 sm:py-2 text-left hover:bg-muted/30 transition-colors min-h-[48px]" key={shift.id} onClick={() => router.push('/shifts')}><div className="min-w-0 flex-1"><p className="text-sm font-semibold truncate">{shift.title || nameFor(brands, shift.brand_id)}</p><div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-muted-foreground"><span>{shift.date}</span><span className="w-1 h-1 rounded-full bg-muted-foreground/40" /><span>{formatShiftTimeRange(shift)}</span><span className="w-1 h-1 rounded-full bg-muted-foreground/40" /><span>{nameFor(platforms, shift.platform_id)}</span></div></div><div className="flex shrink-0 justify-end"><Badge variant="secondary" className="text-xs font-normal bg-muted/50 text-muted-foreground">{t('scheduled')}</Badge></div></button>)}</div> : <div className="py-8"><Empty text={t('noMatchingShifts')} /></div>}</div></div>
  )
}

function FilterSelect({ label, value, options, onChange }: { label: string; value: string[]; options: Array<{ id: string; name: string }>; onChange: (value: string[]) => void }) {
  return <MultiSelectFilter label={label} value={value} onChange={onChange} options={options.map(option => ({ value: option.id, label: option.name }))} />
}
function Metric({ title, value, note, icon }: { title: string; value: string; note?: string; icon: React.ReactNode }) { return <Card className="shadow-none"><CardHeader className="flex-row items-center justify-between pb-2 pt-4 px-4 space-y-0"><CardTitle className="text-sm font-medium text-muted-foreground truncate" title={title}>{title}</CardTitle>{icon}</CardHeader><CardContent className="px-4 pb-4 min-w-0"><p className="text-2xl font-bold truncate" title={value}>{value}</p>{note && <p className="mt-1 text-xs font-medium text-muted-foreground truncate" title={note}>{note}</p>}</CardContent></Card> }
function QuickAction({ href, label, icon }: { href: string; label: string; icon: React.ReactNode }) { return <Button nativeButton={false} render={<Link href={href} />} variant="outline" className="h-20 flex-col gap-1.5 bg-muted/20">{icon}<span className="text-xs">{label}</span></Button> }
function Empty({ text }: { text: string }) { return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">{text}</div> }
