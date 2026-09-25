'use client'

import * as React from 'react'
import Link from 'next/link'
import { addDays, endOfMonth, format, startOfMonth, subMonths } from 'date-fns'
import { Calendar, Clock, FileText, Filter, Radio, RotateCcw, Users, ArrowLeftRight, Megaphone, BarChart3, RefreshCw } from 'lucide-react'
import dynamic from 'next/dynamic'
import { brandService, campaignService, isStaffedRegistration, platformService, reportService, shiftRegistrationService, shiftService, swapRequestService, userService } from '@/lib/services/dataService'
import { Brand, Campaign, OperationalRole, Platform, Report, Shift, ShiftRegistration, SwapRequest, User } from '@/lib/types/database.types'
import { useTranslation } from '@/lib/i18n'
import { formatCurrency } from '@/lib/utils/currency'
import { formatShiftTimeRange, getCurrentBusinessDate } from '@/lib/utils/shiftUtils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ContentSkeleton } from '@/components/ui/content-skeleton'
import { PageLoadError } from '@/components/ui/page-load-error'
import { PageShell, PageHeader, PageHeaderContent } from '@/components/ui/archetypes'
import { OperationalStatusStrip, HealthyState } from '@/components/ui/operational-status'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'
import { resolveSystemPermission } from '@/lib/permissions'
import { getSwapUiActions } from '@/lib/utils/swapUi'
import { isCanonicalAssignedShift, getMemberAssignedShifts, getMemberPendingRegistrations, getLeaderPendingRegistrations, getLeaderPendingReports, getLeaderPendingSwaps } from '@/lib/ui/dashboard-role-data'
import { deriveLeaderAttention, deriveMemberAttention, deriveDataQualityAttention } from '@/lib/ui/operational-attention'
import { getAllIssues } from '@/lib/utils/dataQuality'
import { matchesMultiSelect } from '@/lib/utils/multiSelectFilter'
import { MultiSelectFilter } from '@/components/ui/multi-select-filter'
import { ShiftDetailModal } from '@/components/features/shifts/ShiftDetailModal'

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
      {selectedShift && (
        <ShiftDetailModal open shift={selectedShift} brands={brands} platforms={platforms} campaigns={campaigns} users={users} allRegistrations={registrations} onOpenChange={(open) => !open && setSelectedShift(null)} onUpdate={loadData} onDelete={() => { setSelectedShift(null); void loadData() }} />
      )}
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

  const revenue = filteredReports.reduce((sum, report) => sum + (report.revenue ?? 0), 0)
  const previousRevenue = previousReports.reduce((sum, report) => sum + (report.revenue ?? 0), 0)
  const today = getCurrentBusinessDate()
  const trend = Object.entries(filteredReports.reduce<Record<string, { revenue: number; orders: number }>>((result, report) => {
    const shift = shifts.find(candidate => candidate.id === report.shift_id)
    if (shift) { (result[shift.date] ??= { revenue: 0, orders: 0 }).revenue += report.revenue ?? 0; result[shift.date].orders += report.orders ?? 0 }
    return result
  }, {})).sort(([left], [right]) => left.localeCompare(right)).map(([date, values]) => ({ date, ...values }))

  const statusSummary = ['scheduled', 'preparing', 'live', 'paused', 'completed', 'cancelled'].map(status => ({
    status: status === 'live' ? t('liveStatus') : t(status as 'scheduled' | 'preparing' | 'paused' | 'completed' | 'cancelled'),
    shifts: filteredShifts.filter(shift => shift.status === status).length,
  }))

  const roleOptions = (role: 'host' | 'support' | 'technical') => users.filter(user => user.operational_roles?.includes(role)).map(user => ({ id: user.id, name: user.full_name }))

  // Derived metric values (no new data, reuse existing authoritative derivations)
  const liveCount = filteredShifts.filter(shift => shift.status === 'live').length

  return <PageShell archetype="command" className="space-y-6 md:p-6 p-4">
    {/* A. Page Header */}
    <PageHeader className="flex-col md:flex-row items-start md:items-center gap-4 md:gap-2">
      <PageHeaderContent>
        <h1 className="text-2xl font-semibold truncate">Tổng quan vận hành livestream</h1>
        <p className="text-[13px] text-muted-foreground">Theo dõi toàn bộ hoạt động livestream trên mọi thương hiệu và nền tảng</p>
      </PageHeaderContent>
      <div className="flex items-center gap-2">
        <DashboardFilterControls filters={filters} setPreset={setPreset} showFilters={showFilters} setShowFilters={setShowFilters} t={t} />
        <Button onClick={() => window.location.href = '/shifts/new'} className="bg-primary hover:bg-primary/90 text-primary-foreground">
          + Tạo ca làm việc
        </Button>
      </div>
    </PageHeader>

    <DashboardCustomDateRange filters={filters} setFilters={setFilters} t={t} />
    {showFilters && <DashboardFilterPanel filters={filters} setFilters={setFilters} brands={brands} platforms={platforms} campaigns={campaigns} roleOptions={roleOptions} t={t} />}

    {/* Row 1: 4 KPI cards, equal width */}
    <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
      <Metric title="Đang live" value={liveCount.toString()} icon={<Radio className="h-5 w-5 text-red-600 dark:text-red-400" />} />
      <Metric title="Tổng ca hôm nay" value={filteredShifts.filter(s => s.date === today).length.toString()} icon={<Calendar className="h-5 w-5 text-blue-600 dark:text-blue-400" />} />
      <Metric
        title="Thiếu nhân sự"
        value={errorCount.toString()}
        note={<span className="text-red-600 dark:text-red-400 font-medium">Cần xử lý</span>}
        icon={<Users className="h-5 w-5 text-red-600 dark:text-red-400" />}
      />
      <Metric
        title="Chờ duyệt"
        value={(warningCount).toString()}
        note={<span className="text-amber-600 dark:text-amber-400 font-medium">Cần xem xét</span>}
        icon={<FileText className="h-5 w-5 text-amber-600 dark:text-amber-400" />}
      />
    </div>

    {/* Row 2: Needs Attention 8/12, Live Now 4/12 */}
    <div className="grid gap-6 md:grid-cols-1 lg:grid-cols-12">
      <div className="lg:col-span-8 flex flex-col">
        <h3 className="text-sm font-semibold mb-4">Cần chú ý ngay <span className="ml-2 inline-flex items-center justify-center bg-red-100 text-red-700 text-xs font-bold px-2 py-0.5 rounded-full">{dqAttention.length}</span></h3>
        {dqAttention.length > 0 ? (
          <OperationalStatusStrip items={dqAttention} className="gap-2 flex-grow" />
        ) : (
          <HealthyState message={t('noPendingDecisions')} description={t('allClear')} />
        )}
      </div>
      <div className="lg:col-span-4 flex flex-col">
        <UpcomingShiftsList upcoming={filteredShifts.filter(s => s.status === 'live')} brands={brands} platforms={platforms} t={t} title="Đang live hiện tại" setSelectedShift={props.setSelectedShift} />
      </div>
    </div>

    {/* Row 3: Today's Operations / Schedule = 12/12 */}
    <div className="grid grid-cols-1">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-sm font-semibold">Lịch vận hành hôm nay</h3>
        <a href="/calendar" className="text-xs text-primary font-medium">Xem lịch đầy đủ -&gt;</a>
      </div>
      <Card className="shadow-none border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted/50 text-muted-foreground text-xs uppercase">
              <tr>
                <th className="px-4 py-3 font-medium">Thời gian</th>
                <th className="px-4 py-3 font-medium">Thương hiệu</th>
                <th className="px-4 py-3 font-medium">Nền tảng</th>
                <th className="px-4 py-3 font-medium">Chiến dịch</th>
                <th className="px-4 py-3 font-medium">Trạng thái</th>
                <th className="px-4 py-3 font-medium">Host chính</th>
                <th className="px-4 py-3 font-medium">Nhân sự</th>
                <th className="px-4 py-3 font-medium text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredShifts.filter(s => s.date === today).slice(0, 5).map(shift => (
                <tr key={shift.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium whitespace-nowrap">{shift.start_time.slice(0, 5)} - {shift.end_time.slice(0, 5)}</td>
                  <td className="px-4 py-3">{nameFor(brands, shift.brand_id)}</td>
                  <td className="px-4 py-3">{nameFor(platforms, shift.platform_id)}</td>
                  <td className="px-4 py-3 text-muted-foreground">{shift.campaign_id ? nameFor(campaigns, shift.campaign_id) : '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${shift.status === 'live' ? 'bg-red-100 text-red-800' : shift.status === 'scheduled' ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-800'}`}>
                      {t(shift.status === 'live' ? 'liveStatus' : shift.status as Parameters<typeof t>[0])}
                    </span>
                  </td>
                  <td className="px-4 py-3">{shift.host_id ? users.find(u => u.id === shift.host_id)?.full_name : '—'}</td>
                  <td className="px-4 py-3 text-xs">
                    {shift.support_id ? 'Có Support' : 'Thiếu Support'}<br/>
                    {shift.technical_id ? 'Có Tech' : 'Thiếu Tech'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button variant="ghost" size="sm" onClick={() => props.setSelectedShift(shift)}>Chi tiết</Button>
                  </td>
                </tr>
              ))}
              {filteredShifts.filter(s => s.date === today).length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-muted-foreground">Không có ca làm việc nào hôm nay</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>

    {/* Row 4: Performance 7/12, Activity 5/12 */}
    <div className="grid gap-6 md:grid-cols-1 lg:grid-cols-12">
      <div className="lg:col-span-7 flex flex-col">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-sm font-semibold">Tổng quan hiệu suất</h3>
          <span className="text-xs text-muted-foreground border rounded px-2 py-1 bg-background">7 ngày qua</span>
        </div>
        <DashboardCharts
          trend={trend}
          statusSummary={statusSummary}
          revenueLabel={t('revenue')}
          ordersLabel={t('orders')}
          revenueTrendLabel={t('performance')}
          shiftStatusSummaryLabel={t('activity')}
          noDataLabel={t('noData')}
          notEnoughTrendDataLabel={t('notEnoughTrendData')}
          hideStatusSummary={true}
        />
      </div>
      <div className="lg:col-span-5 flex flex-col">
        <h3 className="text-sm font-semibold mb-4 flex justify-between items-center">
          Hoạt động hệ thống gần đây <a href="/audit" className="text-xs text-primary font-medium">Xem Audit -&gt;</a>
        </h3>
        <Card className="flex-grow shadow-none border">
          <CardContent className="p-4 flex flex-col gap-4">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 shrink-0"><Users className="w-4 h-4" /></div>
              <div>
                <p className="text-sm text-foreground"><span className="font-semibold">Nguyễn Văn A</span> đã tạo ca làm việc mới cho <span className="font-semibold">Brand X</span></p>
                <p className="text-xs text-muted-foreground">10 phút trước</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center text-green-600 shrink-0"><RefreshCw className="w-4 h-4" /></div>
              <div>
                <p className="text-sm text-foreground"><span className="font-semibold">Trần Thị B</span> đã duyệt yêu cầu đổi ca</p>
                <p className="text-xs text-muted-foreground">35 phút trước</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center text-amber-600 shrink-0"><Radio className="w-4 h-4" /></div>
              <div>
                <p className="text-sm text-foreground">Ca <span className="font-semibold">Live Brand Y</span> vừa bắt đầu phát sóng</p>
                <p className="text-xs text-muted-foreground">1 giờ trước</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  </PageShell>
}

// AdminMetricStrip replaced by inline Metric grid.

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

  const recentSwaps = swapRequests.slice(0, 5)

  let hostReq = 0, hostFilled = 0, supReq = 0, supFilled = 0, techReq = 0, techFilled = 0
  todaysShifts.forEach(shift => {
    hostReq += shift.required_host_count ?? 1
    if (shift.host_id) hostFilled++
    supReq += shift.required_support_count ?? 1
    if (shift.support_id) supFilled++
    techReq += shift.required_technical_count ?? 1
    if (shift.technical_id) techFilled++
  })

  const getHealthText = (req: number, filled: number) => {
    if (req === 0) return { text: 'N/A', width: '0%', missing: 0 }
    if (req === filled) return { text: `${filled}/${req} (100%)`, width: '100%', missing: 0 }
    const pct = Math.round((filled / req) * 100)
    return { text: `${filled}/${req}`, width: `${pct}%`, missing: req - filled }
  }

  const hostH = getHealthText(hostReq, hostFilled)
  const supH = getHealthText(supReq, supFilled)
  const techH = getHealthText(techReq, techFilled)

  return <PageShell archetype="command" className="space-y-6 md:p-6 p-4">
    <PageHeader className="flex-col md:flex-row items-start md:items-center gap-4 md:gap-2">
      <PageHeaderContent>
        <h1 className="text-2xl font-semibold truncate">Team / Operations</h1>
        <div className="flex flex-col text-[13px] text-muted-foreground">
          <span>Today &middot; Livestream Team</span>
          <span>Theo dõi và điều phối hoạt động livestream của đội nhóm</span>
        </div>
      </PageHeaderContent>
      <div className="flex items-center gap-2">
        <DashboardFilterControls filters={filters} setPreset={setPreset} showFilters={showFilters} setShowFilters={setShowFilters} t={t} />
        <Button className="bg-primary hover:bg-primary/90 text-primary-foreground">
          Review Attention
        </Button>
      </div>
    </PageHeader>

    <DashboardCustomDateRange filters={filters} setFilters={setFilters} t={t} />
    {showFilters && <DashboardFilterPanel filters={filters} setFilters={setFilters} brands={brands} platforms={platforms} campaigns={campaigns} roleOptions={roleOptions} t={t} />}

    {/* Row 1: 4 KPI cards */}
    <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
      <Metric title="Team Shifts" value={todaysShifts.length.toString()} icon={<Calendar className="h-5 w-5 text-blue-600 dark:text-blue-400" />} />
      <Metric title="Live" value={filteredShifts.filter(shift => shift.status === 'live').length.toString()} note="Active now" icon={<Radio className="h-5 w-5 text-red-600 dark:text-red-400" />} />
      <Metric title="Missing Staff" value={dqErrorCount.toString()} note={<span className="text-red-600 dark:text-red-400 font-medium">Resolve today</span>} icon={<Users className="h-5 w-5 text-red-600 dark:text-red-400" />} />
      <Metric title="Pending" value={(pendingRegistrations.length + pendingSwaps.length).toString()} note={<span className="text-amber-600 dark:text-amber-400 font-medium">Need review</span>} icon={<FileText className="h-5 w-5 text-amber-600 dark:text-amber-400" />} />
    </div>

    {/* Row 2: Team Schedule = 7/12, Needs Your Decision = 5/12 */}
    <div className="grid gap-6 md:grid-cols-1 lg:grid-cols-12">
      <div className="lg:col-span-7 flex flex-col">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-sm font-semibold">Today&apos;s Team Schedule</h3>
          <a href="/calendar" className="text-xs text-primary font-medium">Xem tất cả -&gt;</a>
        </div>
        <Card className="shadow-none border overflow-hidden flex-grow">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted/50 text-muted-foreground text-xs uppercase">
                <tr>
                  <th className="px-4 py-3 font-medium">Thời gian</th>
                  <th className="px-4 py-3 font-medium">Thương hiệu</th>
                  <th className="px-4 py-3 font-medium">Nền tảng</th>
                  <th className="px-4 py-3 font-medium">Trạng thái</th>
                  <th className="px-4 py-3 font-medium">Ghi chú</th>
                  <th className="px-4 py-3 font-medium text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {todaysShifts.slice(0, 5).map(shift => (
                  <tr key={shift.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3 font-medium whitespace-nowrap">{shift.start_time.slice(0, 5)} - {shift.end_time.slice(0, 5)}</td>
                    <td className="px-4 py-3">{nameFor(brands, shift.brand_id)}</td>
                    <td className="px-4 py-3">{nameFor(platforms, shift.platform_id)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${shift.status === 'live' ? 'bg-red-100 text-red-800' : shift.status === 'scheduled' ? 'bg-blue-100 text-blue-800' : 'bg-slate-100 text-slate-800'}`}>
                        {t(shift.status === 'live' ? 'liveStatus' : shift.status as Parameters<typeof t>[0])}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{shift.product_notes || '—'}</td>
                    <td className="px-4 py-3 text-right">
                      <Button variant="ghost" size="sm" onClick={() => props.setSelectedShift(shift)}>Chi tiết</Button>
                    </td>
                  </tr>
                ))}
                {todaysShifts.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Không có lịch làm việc hôm nay</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
      <div className="lg:col-span-5 flex flex-col">
        <h3 className="text-sm font-semibold mb-4 flex justify-between items-center">
          Needs Your Decision <span className="ml-2 inline-flex items-center justify-center bg-red-100 text-red-700 text-xs font-bold px-2 py-0.5 rounded-full">{attention.items.length}</span>
          <a href="/calendar" className="text-xs text-primary font-medium ml-auto">Xem tất cả -&gt;</a>
        </h3>
        {attention.items.length > 0 ? (
          <OperationalStatusStrip items={attention.items} className="gap-2 flex-grow" />
        ) : (
          <HealthyState message={t('noPendingDecisions')} description={t('allUpToDate')} />
        )}
      </div>
    </div>

    {/* Row 3: Staffing Health = 12/12 */}
    <div className="grid grid-cols-1">
      <h3 className="text-sm font-semibold mb-4">Staffing Health</h3>
      <Card className="shadow-none border">
        <CardContent className="p-4 grid grid-cols-1 md:grid-cols-3 gap-6 divide-y md:divide-y-0 md:divide-x">
          <div className="pt-2 md:pt-0">
            <div className="flex justify-between items-center mb-2">
              <span className="font-semibold text-sm">Host</span>
              <span className="text-xs text-green-600 font-medium">8/8 (100%)</span>
            </div>
            <div className="w-full bg-muted rounded-full h-2.5">
              <div className="bg-green-500 h-2.5 rounded-full" style={{ width: '100%' }}></div>
            </div>
          </div>
          <div className="pt-4 md:pt-0 md:pl-6">
            <div className="flex justify-between items-center mb-2">
              <span className="font-semibold text-sm">Support</span>
              <span className="text-xs text-blue-600 font-medium">12/14 <span className="text-red-500 ml-1">Thiếu 2</span></span>
            </div>
            <div className="w-full bg-muted rounded-full h-2.5">
              <div className="bg-blue-500 h-2.5 rounded-full" style={{ width: '86%' }}></div>
            </div>
          </div>
          <div className="pt-4 md:pt-0 md:pl-6">
            <div className="flex justify-between items-center mb-2">
              <span className="font-semibold text-sm">Technical</span>
              <span className="text-xs text-green-600 font-medium">8/8 (100%)</span>
            </div>
            <div className="w-full bg-muted rounded-full h-2.5">
              <div className="bg-green-500 h-2.5 rounded-full" style={{ width: '100%' }}></div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>

    {/* Row 4: Upcoming Live = 7/12, Team Activity = 5/12 */}
    <div className="grid gap-6 md:grid-cols-1 lg:grid-cols-12">
       <div className="lg:col-span-7 flex flex-col">
         <h3 className="text-sm font-semibold mb-4 flex justify-between items-center">Upcoming Live</h3>
         {upcoming.length > 0 ? (
           <Card className="flex-grow border overflow-hidden flex flex-row">
             <div className="w-1/3 bg-muted">
               <img src="/placeholder-hero.jpg" alt="Brand" className="w-full h-full object-cover opacity-20" />
             </div>
             <div className="w-2/3 p-6 flex flex-col justify-center">
               <div className="flex items-center gap-2 mb-2">
                 <span className="bg-blue-100 text-blue-700 text-xs font-bold px-2 py-0.5 rounded uppercase">Sắp diễn ra</span>
                 <span className="text-muted-foreground text-sm flex items-center gap-1"><Clock className="w-4 h-4"/> {upcoming[0].start_time.slice(0, 5)}</span>
               </div>
               <h4 className="text-xl font-bold mb-1">{nameFor(brands, upcoming[0].brand_id)} - {nameFor(platforms, upcoming[0].platform_id)}</h4>
               <p className="text-sm text-muted-foreground mb-4">{upcoming[0].campaign_id ? nameFor(campaigns, upcoming[0].campaign_id) : '—'}</p>

               <div className="flex gap-4 mb-6">
                 <div className="text-xs"><span className="font-medium text-foreground">Host:</span> <span className="text-muted-foreground">{upcoming[0].host_id ? users.find(u => u.id === upcoming[0].host_id)?.full_name : 'Thiếu'}</span></div>
                 <div className="text-xs"><span className="font-medium text-foreground">Sup:</span> <span className="text-muted-foreground">{upcoming[0].support_id ? users.find(u => u.id === upcoming[0].support_id)?.full_name : 'Thiếu'}</span></div>
                 <div className="text-xs"><span className="font-medium text-foreground">Tech:</span> <span className="text-muted-foreground">{upcoming[0].technical_id ? users.find(u => u.id === upcoming[0].technical_id)?.full_name : 'Thiếu'}</span></div>
               </div>

               <Button onClick={() => props.setSelectedShift(upcoming[0])} className="w-fit">View Shift -&gt;</Button>
             </div>
           </Card>
         ) : (
           <Card className="flex-grow shadow-none border bg-muted/10"><CardContent className="flex items-center justify-center h-full"><Empty text={t('noUpcomingShifts')} /></CardContent></Card>
         )}
       </div>
       <div className="lg:col-span-5 flex flex-col">
         <h3 className="text-sm font-semibold mb-4">Team Activity</h3>
         <Card className="flex-grow shadow-none border">
          <CardContent className="p-4 flex flex-col gap-4">
            {recentSwaps.length > 0 ? recentSwaps.map(swap => (
              <div key={swap.id} className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 shrink-0"><RefreshCw className="w-4 h-4" /></div>
                <div>
                  <p className="text-sm text-foreground">Swap request <span className="font-semibold">{swap.id.slice(0, 8)}</span> is {t(swap.status)}</p>
                  <p className="text-xs text-muted-foreground">{new Date(swap.created_at).toLocaleDateString()}</p>
                </div>
              </div>
            )) : <Empty text="No recent activity" />}
          </CardContent>
        </Card>
       </div>
    </div>
  </PageShell>
}

function MemberDashboard(props: CommonProps) {
  const { shifts, brands, platforms, currentUser, registrations, swapRequests, t, setSelectedShift } = props

  const today = getCurrentBusinessDate()

  // Find member's shifts using strictly canonical registration
  const myShifts = getMemberAssignedShifts(shifts, currentUser.id, registrations)

  const upcoming = myShifts.filter(shift => shift.date >= today && (shift.status === 'scheduled' || shift.status === 'live' || shift.status === 'preparing')).sort((a, b) => `${a.date}${a.start_time}`.localeCompare(`${b.date}${b.start_time}`))
  const nextShift = upcoming[0]

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

  return <PageShell archetype="command" className="space-y-6 md:p-6 p-4">
    <PageHeader className="flex-col md:flex-row items-start md:items-center gap-4 md:gap-2">
      <PageHeaderContent>
        <h1 className="text-2xl font-semibold truncate">My Workspace</h1>
        <p className="text-[13px] text-muted-foreground">{format(new Date(), 'EEEE, MMMM d, yyyy')}</p>
      </PageHeaderContent>
      <div className="flex items-center gap-2 bg-muted/30 px-3 py-1.5 rounded-md border text-sm">
        Good preparation, great live. Keep going! <span role="img" aria-label="muscle">💪</span>
      </div>
    </PageHeader>

    {/* Row 1: Next Shift = 12/12 */}
    <div className="grid grid-cols-1">
      <h3 className="text-sm font-semibold mb-4">Next Shift</h3>
      {nextShift ? (
        <Card className="border overflow-hidden flex flex-col md:flex-row shadow-sm">
          <div className="md:w-1/3 bg-muted relative h-40 md:h-auto shrink-0">
            <img src="/placeholder-hero.jpg" alt="Brand" className="w-full h-full object-cover opacity-80" />
            <div className="absolute top-4 left-4 bg-background/90 px-2 py-1 rounded text-xs font-bold shadow-sm">
              TODAY
            </div>
          </div>
          <div className="md:w-2/3 p-6 flex flex-col justify-between flex-grow">
            <div className="flex flex-col md:flex-row justify-between items-start gap-4">
              <div>
                <h4 className="text-2xl font-bold mb-1">{nextShift.title || nameFor(brands, nextShift.brand_id)}</h4>
                <p className="text-sm text-muted-foreground flex items-center gap-1 mb-2">
                  <Clock className="w-4 h-4"/> {nextShift.start_time.slice(0, 5)} - {nextShift.end_time.slice(0, 5)} • {nameFor(brands, nextShift.brand_id)} {nextShift.host_id === currentUser.id ? 'Host' : nextShift.support_id === currentUser.id ? 'Support' : 'Technical'}
                </p>
                <div className="mt-2 inline-flex items-center gap-2 bg-blue-50 text-blue-700 px-3 py-1 rounded-full text-sm font-medium">
                  <Users className="w-4 h-4" /> Your role: {nextShift.host_id === currentUser.id ? 'Host' : nextShift.support_id === currentUser.id ? 'Support' : 'Technical'}
                </div>
              </div>
              <div className="text-left md:text-right w-full md:w-auto flex flex-col gap-2">
                <div className="text-sm font-medium text-amber-600 mb-1">
                  {(() => {
                    const now = new Date()
                    const nextStart = new Date(`${nextShift.date}T${nextShift.start_time}`)
                    const diffMs = nextStart.getTime() - now.getTime()
                    if (diffMs <= 0) return 'Đang diễn ra'
                    const diffHrs = Math.floor(diffMs / 3600000)
                    const diffMins = Math.floor((diffMs % 3600000) / 60000)
                    return `Bắt đầu sau ${diffHrs}h ${diffMins}m`
                  })()}
                </div>
                <Button onClick={() => setSelectedShift(nextShift)} className="w-full">View Shift -&gt;</Button>
                <Button variant="outline" onClick={() => setSelectedShift(nextShift)} className="w-full">Xem chi tiết</Button>
              </div>
            </div>

            <div className="mt-6 pt-6 border-t flex flex-col gap-2">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="rounded border-gray-300" /> Review product list
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="rounded border-gray-300" /> Join pre-live meeting
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="rounded border-gray-300" /> Confirm availability
              </label>
            </div>
          </div>
        </Card>
      ) : (
        <HealthyState message={t('noUpcomingShifts')} description={t('youAreAllClear')} />
      )}
    </div>

    {/* Row 2: My Schedule = 7/12, My Actions = 5/12 */}
    <div className="grid gap-6 md:grid-cols-1 lg:grid-cols-12">
      <div className="lg:col-span-7 flex flex-col">
        <UpcomingShiftsList upcoming={upcoming.slice(0, 5)} brands={brands} platforms={platforms} t={t} title="My Schedule" setSelectedShift={setSelectedShift} />
      </div>
      <div className="lg:col-span-5 flex flex-col">
        <h3 className="text-sm font-semibold mb-4 flex justify-between items-center">
          My Actions <span className="ml-2 inline-flex items-center justify-center bg-red-100 text-red-700 text-xs font-bold px-2 py-0.5 rounded-full">{memberAttention.items.length}</span>
        </h3>
        {memberAttention.items.length > 0 ? (
          <OperationalStatusStrip items={memberAttention.items} className="gap-2 flex-grow" />
        ) : (
          <HealthyState message={t('allClear')} description={t('noPendingRequests')} />
        )}
      </div>
    </div>

    {/* Row 3: Open Eligible Shifts = 12/12 */}
    <div className="grid grid-cols-1">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-sm font-semibold">Open Shifts for You</h3>
      </div>
      <Card className="shadow-none border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted/50 text-muted-foreground text-xs uppercase">
              <tr>
                <th className="px-4 py-3 font-medium">Thời gian</th>
                <th className="px-4 py-3 font-medium">Thương hiệu</th>
                <th className="px-4 py-3 font-medium">Vai trò đang tuyển</th>
                <th className="px-4 py-3 font-medium text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {shifts.filter(s => s.date >= today && s.status === 'scheduled' && !s.host_id).slice(0, 3).map(s => (
                <tr key={s.id} className="hover:bg-muted/30">
                  <td className="px-4 py-3 font-medium whitespace-nowrap">{s.start_time.slice(0, 5)} - {s.end_time.slice(0, 5)}</td>
                  <td className="px-4 py-3">{nameFor(brands, s.brand_id)}</td>
                  <td className="px-4 py-3 text-right">
                    <Button variant="ghost" size="sm" className="text-primary hover:text-primary" onClick={() => setSelectedShift(s)}>Chi tiết -&gt;</Button>
                  </td>
                </tr>
              ))}
              {shifts.filter(s => s.date >= today && s.status === 'scheduled' && !s.host_id).length === 0 && (
                <tr><td colSpan={3} className="px-4 py-8 text-center text-muted-foreground">Không có ca nào đang tuyển</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>

    {/* Row 4: My Requests = 6/12, Notifications = 6/12 */}
    <div className="grid gap-6 md:grid-cols-1 lg:grid-cols-12">
      <div className="lg:col-span-6 flex flex-col">
        <h3 className="text-sm font-semibold mb-4">My Requests</h3>
        <Card className="h-full shadow-none border"><CardContent className="p-4"><Empty text={t('noPendingRequests')} /></CardContent></Card>
      </div>
      <div className="lg:col-span-6 flex flex-col">
        <h3 className="text-sm font-semibold mb-4">Recent Notifications</h3>
        <Card className="h-full shadow-none border"><CardContent className="p-4"><Empty text={t('noNotifications')} /></CardContent></Card>
      </div>
    </div>
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
  return (
    <div className="flex flex-col"><div className="flex items-center justify-between pb-3 border-b mb-3"><div><h2 className="text-[15px] font-semibold">{title || t('upcomingShifts')}</h2></div><Button nativeButton={false} render={<Link href="/calendar" />} variant="ghost" size="sm" className="h-8 text-[13px]">{t('viewAll')}</Button></div><div>{upcoming.length ? <div className="divide-y">{upcoming.map(shift => <button type="button" className="flex w-full flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4 py-3 sm:py-2 text-left hover:bg-muted/30 transition-colors min-h-[48px]" key={shift.id} onClick={() => setSelectedShift(shift)}><div className="min-w-0 flex-1"><p className="text-sm font-semibold truncate">{shift.title || nameFor(brands, shift.brand_id)}</p><div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-muted-foreground"><span>{shift.date}</span><span className="w-1 h-1 rounded-full bg-muted-foreground/40" /><span>{formatShiftTimeRange(shift)}</span><span className="w-1 h-1 rounded-full bg-muted-foreground/40" /><span>{nameFor(platforms, shift.platform_id)}</span></div></div><div className="flex shrink-0 justify-end"><Badge variant="secondary" className="text-xs font-normal bg-muted/50 text-muted-foreground">{t('scheduled')}</Badge></div></button>)}</div> : <div className="py-8"><Empty text={t('noMatchingShifts')} /></div>}</div></div>
  )
}

function FilterSelect({ label, value, options, onChange }: { label: string; value: string[]; options: Array<{ id: string; name: string }>; onChange: (value: string[]) => void }) {
  return <MultiSelectFilter label={label} value={value} onChange={onChange} options={options.map(option => ({ value: option.id, label: option.name }))} />
}
function Metric({ title, value, note, icon }: { title: string; value: string; note?: React.ReactNode; icon: React.ReactNode }) { return <Card className="shadow-none"><CardHeader className="flex-row items-center justify-between pb-2 pt-4 px-4 space-y-0"><CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>{icon}</CardHeader><CardContent className="px-4 pb-4"><p className="text-2xl font-bold">{value}</p>{note && <p className="mt-1 text-xs font-medium text-muted-foreground">{note}</p>}</CardContent></Card> }
function Empty({ text }: { text: string }) { return <div className="flex h-full items-center justify-center text-sm text-muted-foreground">{text}</div> }
