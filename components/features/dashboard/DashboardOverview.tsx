'use client'

import * as React from 'react'
import { addDays, endOfMonth, format, startOfMonth, subMonths } from 'date-fns'
import { reportService, shiftRegistrationService, shiftService, swapRequestService, currentUserService } from '@/lib/services/dataService'
import { getAuthMode } from '@/lib/auth/authMode'
import { Brand, Campaign, Platform, Report, Shift, ShiftRegistration, SwapRequest, User } from '@/lib/types/database.types'
import { useTranslation, type TranslationKey } from '@/lib/i18n'
import { getCurrentBusinessDate } from '@/lib/utils/shiftUtils'
import { getOperationalReferences, operationalReferenceIdentity } from '@/lib/services/operationalReferences'
import { readTransientData } from '@/lib/services/transientDataCache'
import { invalidatePageCache } from '@/lib/services/operationsPageCache'
import { ContentSkeleton } from '@/components/ui/content-skeleton'
import { Skeleton } from '@/components/ui/skeleton'
import { PageLoadError } from '@/components/ui/page-load-error'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'
import { useShiftChangeRefresh } from '@/lib/hooks/useShiftChangeRefresh'
import { resolveSystemPermission } from '@/lib/permissions'
import { getSwapUiActions } from '@/lib/utils/swapUi'
import { getMemberAssignedShifts, getLeaderPendingRegistrations, getLeaderPendingReports, getLeaderPendingSwaps } from '@/lib/ui/dashboard-role-data'
import { deriveDataQualityAttention } from '@/lib/ui/operational-attention'
import { getAllIssues } from '@/lib/utils/dataQuality'
import { ShiftDetailModal } from '@/components/features/shifts/ShiftDetailModal'
import { AdminDashboardView } from './presentation/admin/AdminDashboardView'
import { LeaderDashboardView } from './presentation/leader/LeaderDashboardView'
import { MemberDashboardView } from './presentation/member/MemberDashboardView'

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

type WidgetErrors = {
  reports?: boolean
  swaps?: boolean
  registrations?: boolean
}

type DashboardDataset = {
  shifts: Shift[]
  reports: Report[] | null
  brands: Brand[]
  platforms: Platform[]
  campaigns: Campaign[]
  users: User[]
  registrations: ShiftRegistration[] | null
  swapRequests: SwapRequest[] | null
  widgetErrors?: WidgetErrors
}

export function calculateAggregate(reports: Array<Record<string, unknown>>, key: 'revenue' | 'orders'): number | null {
  const numeric = reports.map(r => r[key]).filter((v): v is number => typeof v === 'number')
  if (!numeric.length) return null
  return numeric.reduce((acc, v) => acc + v, 0)
}

function DashboardRoleSkeleton({ role }: { role: string }) {
  return (
    <div className="space-y-6" data-testid="content-skeleton">
      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-5">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={`kpi-${i}`} className="bg-white rounded-[12px] border border-slate-200 shadow-sm p-5 flex flex-col justify-center">
            <div className="flex items-center gap-4 mb-3">
              <Skeleton className="w-[48px] h-[48px] rounded-xl shrink-0" />
              <div className="space-y-1.5 flex-1">
                <Skeleton className="h-3 w-16" />
                <Skeleton className="h-7 w-20" />
              </div>
            </div>
            <Skeleton className="h-3.5 w-28" />
          </div>
        ))}
      </div>

      {role === 'admin' && (
        <>
          {/* Middle Grid: Operational Attention (8 cols) + Live Now (4 cols) */}
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-12 xl:gap-6">
            <div className="min-w-0 xl:col-span-8 flex flex-col space-y-3">
              <Skeleton className="h-5 w-48" />
              <div className="bg-white rounded-[12px] border border-slate-200 shadow-sm p-4 space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={`att-${i}`} className="h-14 w-full rounded-lg" />
                ))}
              </div>
            </div>
            <div className="min-w-0 xl:col-span-4 flex flex-col space-y-3">
              <Skeleton className="h-5 w-32" />
              <div className="bg-white rounded-[12px] border border-slate-200 shadow-sm p-4 space-y-3">
                {Array.from({ length: 2 }).map((_, i) => (
                  <Skeleton key={`live-${i}`} className="h-16 w-full rounded-lg" />
                ))}
              </div>
            </div>
          </div>

          {/* Operations Table */}
          <div className="flex flex-col space-y-3">
            <Skeleton className="h-5 w-44" />
            <div className="bg-white rounded-[12px] border border-slate-200 shadow-sm p-4 space-y-3">
              <Skeleton className="h-10 w-full rounded-md" />
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={`row-${i}`} className="h-12 w-full rounded-md" />
              ))}
            </div>
          </div>
        </>
      )}

      {role === 'leader' && (
        <>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-12 xl:gap-6">
            <div className="min-w-0 xl:col-span-8 space-y-3">
              <Skeleton className="h-5 w-40" />
              <div className="bg-white rounded-[12px] border border-slate-200 shadow-sm p-4 space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={`dec-${i}`} className="h-14 w-full rounded-lg" />
                ))}
              </div>
            </div>
            <div className="min-w-0 xl:col-span-4 space-y-3">
              <Skeleton className="h-5 w-36" />
              <Skeleton className="h-36 w-full rounded-[12px]" />
            </div>
          </div>
          <div className="space-y-3">
            <Skeleton className="h-5 w-44" />
            <div className="bg-white rounded-[12px] border border-slate-200 shadow-sm p-4 space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={`sched-${i}`} className="h-12 w-full rounded-md" />
              ))}
            </div>
          </div>
        </>
      )}

      {role === 'member' && (
        <div className="space-y-6">
          <Skeleton className="h-36 w-full rounded-xl" />
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="space-y-3">
              <Skeleton className="h-5 w-36" />
              <div className="bg-white rounded-[12px] border border-slate-200 shadow-sm p-4 space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={`mysched-${i}`} className="h-14 w-full rounded-lg" />
                ))}
              </div>
            </div>
            <div className="space-y-3">
              <Skeleton className="h-5 w-36" />
              <div className="bg-white rounded-[12px] border border-slate-200 shadow-sm p-4 space-y-3">
                {Array.from({ length: 2 }).map((_, i) => (
                  <Skeleton key={`act-${i}`} className="h-14 w-full rounded-lg" />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export function DashboardOverview() {
  const {currentUser} = useCurrentUser()
  const [data,setData] = React.useState<DashboardDataset | null>(null)
  const [loading,setLoading] = React.useState(true)
  const [isRefreshing,setIsRefreshing] = React.useState(false)
  const [early,setEarly] = React.useState<{key:string; items:Shift[]} | null>(null)
  const [loadError,setLoadError] = React.useState<unknown>(null)
  const [filters,setFilters]=React.useState<Filters|null>(()=>initialFilters())
  const sequence=React.useRef(0)
  const lastLoadedKey = React.useRef<string | null>(null)
  const lastLoadedFilters = React.useRef<Filters | null>(null)

  const identity = currentUser ? operationalReferenceIdentity(currentUser) : ''
  const filterKey = JSON.stringify(filters)
  const viewKey = identity + ':' + filterKey

  const loadData = React.useCallback(async (reuseCache = false) => {
    if (!currentUser || !filters || !identity) return
    const request = ++sequence.current
    if (!reuseCache) invalidatePageCache()

    // Strict time-boundary & actor-boundary check:
    // Only use Stale-While-Revalidate if querying the exact same actor and date range!
    const isSameActor = lastLoadedKey.current && lastLoadedKey.current.startsWith(identity + ':')
    const isSameFilter = lastLoadedFilters.current &&
      lastLoadedFilters.current.start === filters.start &&
      lastLoadedFilters.current.end === filters.end &&
      lastLoadedFilters.current.preset === filters.preset

    if (isSameActor && isSameFilter && data) {
      setIsRefreshing(true)
    } else {
      // Date range or actor changed: MUST clear stale data so old range is not shown as new range!
      setData(null)
      setLoading(true)
      setIsRefreshing(false)
    }
    setLoadError(null)

    try {
      const readDashboard = () => readTransientData(identity, 'dashboard:' + filterKey, async () => {
        const today = getCurrentBusinessDate()
        const from = filters.start < today ? filters.start : today
        const to = filters.end > today ? filters.end : today
        const upcoming = resolveSystemPermission(currentUser)==='member'
          ? shiftService.getRegistrationPage('mine',{page:1,pageSize:10,filters:{from:today,registrationStatuses:['approved','manually_assigned']}})
          : shiftService.getCalendarPage({page:1,pageSize:10,filters:{from:today,statuses:['scheduled','preparing','live','paused']}})
        
        void upcoming.then(visible => {
          if (request === sequence.current) setEarly({key:viewKey, items:visible.items})
        }).catch(() => { /* The full read handles errors authoritatively. */ })

        let reportsError = false
        let swapPageError = false
        let scopeSwapsError = false

        // Fetch independent sources, capturing partial errors cleanly
        const [rangeShifts,reportsResult,refs,future,swapPageResult,scopeSwapsResult]=await Promise.all([
          shiftService.getAllFiltered({from,to}),
          reportService.getAllFiltered({from,to}).catch(err => {
            console.warn('Dashboard reportService error', err)
            reportsError = true
            return null
          }),
          getOperationalReferences(currentUser),
          upcoming,
          swapRequestService.getPage({page:1,pageSize:10,filters:{statuses:['pending','accepted']}}).catch(err => {
            console.warn('Dashboard swapPage error', err)
            swapPageError = true
            return null
          }),
          swapRequestService.getAllFiltered({from,to}).catch(err => {
            console.warn('Dashboard scopeSwaps error', err)
            scopeSwapsError = true
            return null
          }),
        ])

        const previewIds=[...new Set((swapPageResult?.items ?? []).flatMap(swap=>[swap.shift_id,swap.target_shift_id].filter((id):id is string=>!!id)))]
        const related=previewIds.length?await shiftService.getAllFiltered({shiftIds:previewIds}).catch(() => [] as Shift[]):[]
        const shifts=[...new Map([...rangeShifts,...future.items,...related].map(shift=>[shift.id,shift])).values()]

        let registrationsError = false
        const registrationsResult = await shiftRegistrationService.getForShifts(shifts.map(shift=>shift.id)).catch(err => {
          console.warn('Dashboard registrations error', err)
          registrationsError = true
          return null
        })

        const swapRequests = (swapPageError && scopeSwapsError) ? null : [
          ...new Map([...(scopeSwapsResult ?? []), ...(swapPageResult?.items ?? [])].map(swap=>[swap.id,swap])).values()
        ]

        return {
          shifts,
          reports: reportsError ? null : reportsResult,
          ...refs,
          registrations: registrationsError ? null : registrationsResult,
          swapRequests,
          widgetErrors: {
            reports: reportsError,
            swaps: swapPageError || scopeSwapsError,
            registrations: registrationsError,
          },
        } satisfies DashboardDataset
      }, async () => {
        if (getAuthMode() !== 'supabase') return true
        const actor=await currentUserService.getCurrent()
        return !!actor && operationalReferenceIdentity(actor)===identity
      })

      let result: DashboardDataset
      try {
        result = await readDashboard()
      } catch (error) {
        if (!(error instanceof Error && error.message === 'CACHE_INVALIDATED' && request === sequence.current)) throw error
        result = await readDashboard()
      }
      if (request !== sequence.current) return
      setData(result)
      lastLoadedKey.current = viewKey
      lastLoadedFilters.current = filters
    } catch(error) {
      if (request === sequence.current) setLoadError(error)
    } finally {
      if (request === sequence.current) {
        setLoading(false)
        setIsRefreshing(false)
      }
    }
  },[currentUser,filters,identity,filterKey,viewKey,data])

  // Widget retry handler: retry individual failed queries without reloading the whole dashboard
  const retryWidget = React.useCallback(async (widget: 'reports' | 'swaps' | 'registrations') => {
    if (!currentUser || !filters) return
    const today = getCurrentBusinessDate()
    const from = filters.start < today ? filters.start : today
    const to = filters.end > today ? filters.end : today
    try {
      if (widget === 'reports') {
        const fetched = await reportService.getAllFiltered({ from, to })
        setData(cur => cur ? { ...cur, reports: fetched, widgetErrors: { ...cur.widgetErrors, reports: false } } : cur)
      } else if (widget === 'swaps') {
        const [page, list] = await Promise.all([
          swapRequestService.getPage({ page: 1, pageSize: 10, filters: { statuses: ['pending', 'accepted'] } }),
          swapRequestService.getAllFiltered({ from, to }),
        ])
        const combined = [...new Map([...list, ...page.items].map(s => [s.id, s])).values()]
        setData(cur => cur ? { ...cur, swapRequests: combined, widgetErrors: { ...cur.widgetErrors, swaps: false } } : cur)
      } else if (widget === 'registrations') {
        if (!data) return
        const regs = await shiftRegistrationService.getForShifts(data.shifts.map(s => s.id))
        setData(cur => cur ? { ...cur, registrations: regs, widgetErrors: { ...cur.widgetErrors, registrations: false } } : cur)
      }
    } catch (err) {
      console.error(`Retry ${widget} failed:`, err)
    }
  }, [currentUser, filters, data])

  useShiftChangeRefresh(() => loadData(false))
  React.useEffect(()=>{
    const seq = sequence;
    const frame = requestAnimationFrame(()=>{if(currentUser) void loadData(true)});
    return ()=>{cancelAnimationFrame(frame); seq.current++;}
  },[currentUser,loadData])

  if (loadError && !data) return <PageLoadError error={loadError} onRetry={()=>void loadData()} />

  if ((loading && !data) || !data || !currentUser) {
    return <div className="space-y-3" data-testid="dashboard-progressive-shell">
      {early?.key===viewKey && <section className="rounded-lg border bg-card p-4" data-testid="dashboard-visible-first">
        <h2 className="text-sm font-semibold">Ca livestream sắp tới</h2>
        <p className="mt-1 text-xs text-muted-foreground">Đang tải số liệu tổng hợp. Danh sách ca được xác nhận từ server.</p>
        {early.items.length ? <ul className="mt-3 divide-y text-sm">
          {early.items.slice(0,10).map(shift=><li key={shift.id} className="flex flex-wrap justify-between gap-2 py-2"><span className="font-medium">{shift.title}</span><span className="text-muted-foreground">{shift.date} · {shift.start_time}–{shift.end_time}</span></li>)}
        </ul> : <p className="mt-3 text-sm text-muted-foreground">Không có ca sắp tới trong trang đầu.</p>}
      </section>}
      <DashboardRoleSkeleton role={currentUser ? resolveSystemPermission(currentUser) : 'admin'} />
    </div>
  }

  return (
    <div className="relative min-w-0">
      {isRefreshing && (
        <div className="sticky top-0 z-20 w-full bg-blue-500/10 backdrop-blur-sm border-b border-blue-200/50 px-4 py-1.5 text-xs text-blue-700 font-medium flex items-center justify-between transition-all">
          <span className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-600"></span>
            </span>
            Đang cập nhật dữ liệu vận hành mới nhất...
          </span>
        </div>
      )}
      <DashboardWorkspace
        data={data}
        currentUser={currentUser}
        onUpdate={() => loadData(false)}
        filterState={filters}
        onFilterChange={setFilters}
        onRetryWidget={retryWidget}
      />
    </div>
  )
}

// Presentation accepts typed data; only the visual-QA route supplies fixture data.
export function DashboardWorkspace({
  data,
  currentUser,
  onUpdate,
  filterState,
  onFilterChange,
  onRetryWidget,
}: {
  data: DashboardDataset
  currentUser: User
  onUpdate: () => void | Promise<void>
  filterState?: Filters | null
  onFilterChange?: React.Dispatch<React.SetStateAction<Filters | null>>
  onRetryWidget?: (widget: 'reports' | 'swaps' | 'registrations') => void
}) {
  const {t} = useTranslation()
  const [localFilters,setLocalFilters] = React.useState<Filters | null>(null)
  const filters=filterState??localFilters
  const setFilters=onFilterChange??setLocalFilters
  const [showFilters,setShowFilters] = React.useState(false)
  const [selectedShift,setSelectedShift] = React.useState<Shift | null>(null)
  React.useEffect(()=>{const frame=requestAnimationFrame(()=>setLocalFilters(initialFilters()));return ()=>cancelAnimationFrame(frame)},[])
  if (!filters) return <ContentSkeleton />
  const role = resolveSystemPermission(currentUser)
  const setPreset = (preset:Preset)=>setFilters(current=>current ? {...current,preset,...(preset==='custom'?{}:rangeFor(preset))} : current)
  const props: CommonProps = {
    ...data,
    filters,
    setFilters,
    showFilters,
    setShowFilters,
    currentUser,
    // Dynamic labels in operational-attention are typed as strings, but are
    // canonical translation keys. Keep that boundary explicit here.
    t: (key, variables) => t(key as TranslationKey, variables),
    setPreset,
    setSelectedShift,
    widgetErrors: data.widgetErrors,
    onRetryWidget,
  }
  return <div>
    {role==='admin' && <AdminDashboard {...props} />}
    {role==='leader' && <LeaderDashboard {...props} />}
    {role==='member' && <MemberDashboard {...props} />}
    {selectedShift && <ShiftDetailModal open shift={selectedShift} brands={data.brands} platforms={data.platforms} campaigns={data.campaigns} users={data.users} allRegistrations={data.registrations ?? []} onOpenChange={open=>!open&&setSelectedShift(null)} onUpdate={onUpdate} onDelete={()=>{setSelectedShift(null);void onUpdate()}} />}
  </div>
}

type CommonProps = {
  shifts: Shift[]
  reports: Report[] | null
  brands: Brand[]
  platforms: Platform[]
  campaigns: Campaign[]
  users: User[]
  registrations: ShiftRegistration[] | null
  swapRequests: SwapRequest[] | null
  filters: Filters
  setFilters: React.Dispatch<React.SetStateAction<Filters | null>>
  showFilters: boolean
  setShowFilters: React.Dispatch<React.SetStateAction<boolean>>
  currentUser: User
  t: (key: string, variables?: Record<string, string | number>) => string
  setPreset: (preset: Preset) => void
  setSelectedShift: (shift: Shift | null) => void
  widgetErrors?: WidgetErrors
  onRetryWidget?: (widget: 'reports' | 'swaps' | 'registrations') => void
}

const nameFor = (items: { id: string; name?: string; full_name?: string }[], id: string): string =>
  items.find(item => item.id === id)?.name ||
  items.find(item => item.id === id)?.full_name ||
  '?'

const shiftStatusLabel = (status: string): string => {
  switch (status) {
    case 'live':      return 'Đang Live'
    case 'completed': return 'Hoàn thành'
    case 'scheduled': return 'Chưa bắt đầu'
    case 'preparing': return 'Đang chuẩn bị'
    case 'paused':    return 'Tạm dừng'
    case 'cancelled': return 'Đã hủy'
    default:          return status
  }
}

function AdminDashboard(props: CommonProps) {
  const { shifts, reports, brands, platforms, campaigns, users, registrations, filters, widgetErrors, onRetryWidget } = props
  const filteredShifts = shifts.filter(shift => shift.date >= filters.start && shift.date <= filters.end)
  const shiftIds = new Set(filteredShifts.map(shift => shift.id))

  const today = getCurrentBusinessDate()
  const todaysShifts = filteredShifts.filter(s => s.date === today)
  const liveCount = filteredShifts.filter(shift => shift.status === 'live').length

  const scopedReports = reports ? reports.filter(report => shiftIds.has(report.shift_id)) : []
  const scopedRegistrations = registrations ? registrations.filter(reg => shiftIds.has(reg.shift_id)) : []
  const pendingCount = registrations !== null ? scopedRegistrations.filter(r => r.status === 'pending').length : null

  // Derive attention using existing domain helpers
  const dqIssues = getAllIssues({ shifts: filteredShifts, reports: scopedReports, registrations: scopedRegistrations })
  const errorCount = dqIssues.filter(i => i.severity === 'error').length
  const warningCount = dqIssues.filter(i => i.severity === 'warning').length
  const infoCount = dqIssues.filter(i => i.severity === 'info').length
  const rawAttention = deriveDataQualityAttention(errorCount, warningCount, infoCount)

  const dqAttentionForView = rawAttention.map(a => ({
    key: a.key,
    severity: (a.severity === 'critical' ? 'critical' : a.severity === 'warning' ? 'high' : a.severity === 'attention' ? 'medium' : 'low') as 'critical' | 'high' | 'medium' | 'low',
    title: props.t(a.label),
    context: props.t(a.description ?? a.label, a.count == null ? undefined : { count: a.count }),
    time: a.count != null ? props.t('dqItemCount', { count: a.count }) : '',
    action: props.t('viewDetails'),
    href: a.href,
  }))

  const applicationOverview = [
    { key: 'shifts', label: props.t('shiftsInRange'), value: filteredShifts.length, href: '/calendar' },
    { key: 'confirmed-reports', label: props.t('confirmedReportsInRange'), value: reports === null ? null : scopedReports.filter(report => report.status === 'confirmed').length, href: '/reports' },
    { key: 'brands', label: props.t('activeBrands'), value: brands.filter(brand => brand.status === 'active').length, href: '/brands' },
    { key: 'campaigns', label: props.t('activeCampaigns'), value: campaigns.filter(campaign => campaign.status === 'active').length, href: '/campaigns' },
    { key: 'platforms', label: props.t('activePlatforms'), value: platforms.filter(platform => platform.status === 'active').length, href: '/platforms' },
    { key: 'staff', label: props.t('activeStaffAccounts'), value: users.filter(user => user.status === 'active').length, href: '/staff' },
  ]

  const todaysOperations = todaysShifts.map(s => ({
    brand: nameFor(brands, s.brand_id),
    shiftTime: `${s.start_time} - ${s.end_time}`,
    platform: nameFor(platforms, s.platform_id),
    status: shiftStatusLabel(s.status),
    statusColor: (s.status === 'live' ? 'red' : s.status === 'completed' ? 'green' : 'slate') as 'red' | 'green' | 'slate' | 'orange',
    metrics: '—',
    manager: nameFor(users, s.host_id || ''),
  }))

  const liveShifts = todaysShifts.filter(s => s.status === 'live').map(s => ({
    brand: nameFor(brands, s.brand_id),
    platform: nameFor(platforms, s.platform_id),
    duration: null,
    viewers: null,
    health: 'unknown' as const,
  }))

  return (
    <div className="relative">
      {widgetErrors && (widgetErrors.reports || widgetErrors.registrations || widgetErrors.swaps) && (
        <div className="mx-4 sm:mx-8 mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 flex items-center justify-between">
          <span>Một số dữ liệu thứ cấp (báo cáo hoặc đăng ký ca) tải không thành công.</span>
          {onRetryWidget && (
            <button
              onClick={() => {
                if (widgetErrors.reports) onRetryWidget('reports')
                if (widgetErrors.registrations) onRetryWidget('registrations')
                if (widgetErrors.swaps) onRetryWidget('swaps')
              }}
              className="px-2.5 py-1 bg-amber-600 text-white rounded font-medium hover:bg-amber-700 transition"
            >
              Thử lại
            </button>
          )}
        </div>
      )}
      <AdminDashboardView
        userName={props.currentUser.full_name}
        liveCount={liveCount}
        todaysShiftsCount={todaysShifts.length}
        missingStaffCount={null}
        pendingCount={pendingCount}
        dqAttention={dqAttentionForView}
        liveShifts={liveShifts}
        todaysOperations={todaysOperations}
        performance={null}
        activityLog={null}
        t={props.t}
        applicationOverview={applicationOverview}
      />
    </div>
  )
}

function LeaderDashboard(props: CommonProps) {
  const { shifts, reports, brands, platforms, campaigns, users, registrations, filters, swapRequests, widgetErrors, onRetryWidget } = props
  const filteredShifts = shifts.filter(shift => shift.date >= filters.start && shift.date <= filters.end)
  const shiftIds = new Set(filteredShifts.map(shift => shift.id))

  const today = getCurrentBusinessDate()
  const todaysShifts = filteredShifts.filter(shift => shift.date === today)
  const liveCount = filteredShifts.filter(s => s.status === 'live').length

  const pendingRegistrations = registrations ? getLeaderPendingRegistrations(registrations, shiftIds) : null
  const pendingReports = reports ? getLeaderPendingReports(reports, shiftIds) : null
  const pendingSwaps = swapRequests ? getLeaderPendingSwaps(swapRequests, shiftIds) : null

  let actionableSwapCount = 0
    if (pendingSwaps) {
    pendingSwaps.forEach(s => {
      const actions = getSwapUiActions(s, props.currentUser)
      if (actions.showAccept || actions.showCounterpartReject || actions.showApprove || actions.showReviewerReject) {
        actionableSwapCount++
      } else {
        // waiting swap count omitted
      }
    })
  }

  const dqIssues = getAllIssues({
    shifts: filteredShifts,
    reports: reports ? reports.filter(r => shiftIds.has(r.shift_id)) : [],
    registrations: registrations ? registrations.filter(r => shiftIds.has(r.shift_id)) : [],
  })
  const dqErrorCount = dqIssues.filter(i => i.severity === 'error').length

  const pendingCount = (pendingRegistrations !== null && pendingSwaps !== null)
    ? pendingRegistrations.length + actionableSwapCount
    : (pendingRegistrations !== null ? pendingRegistrations.length : null)

  // Build decision queue: null if all sources unavailable; list if at least one available
  let decisions: import('./presentation/leader/LeaderDashboardView').DecisionItem[] | null = null
  if (pendingRegistrations !== null || pendingSwaps !== null || pendingReports !== null) {
    decisions = []
    if (pendingRegistrations && pendingRegistrations.length > 0) {
      decisions.push({
        key: 'reg',
        type: 'registration',
        title: `${pendingRegistrations.length} đăng ký chờ duyệt`,
        subtitle: 'Nhân sự chờ xếp ca',
        time: 'Cần xử lý',
        action: 'Xem',
        iconBg: 'bg-emerald-50',
      })
    }
    if (pendingSwaps && actionableSwapCount > 0) {
      decisions.push({
        key: 'swap',
        type: 'swap',
        title: `${actionableSwapCount} yêu cầu đổi ca cần phê duyệt`,
        subtitle: 'Chờ phản hồi của bạn',
        time: 'Cần xử lý',
        action: 'Xem',
        iconBg: 'bg-amber-50',
      })
    }
    if (pendingReports && pendingReports.length > 0) {
      decisions.push({
        key: 'report',
        type: 'report',
        title: `${pendingReports.length} báo cáo chưa hoàn thành`,
        subtitle: 'Báo cáo nháp / đang xem xét',
        time: 'Cần xử lý',
        action: 'Xem',
        iconBg: 'bg-blue-50',
      })
    }
    if (dqErrorCount > 0) {
      decisions.push({
        key: 'dq',
        type: 'dq',
        title: `${dqErrorCount} lỗi chất lượng dữ liệu`,
        subtitle: 'Cần kiểm tra và sửa',
        time: 'Cần xử lý',
        action: 'Xem',
        iconBg: 'bg-red-50',
      })
    }
  }

  const todaysSchedule = todaysShifts.map(s => ({
    onView: () => props.setSelectedShift(s),
    time: `${s.start_time} - ${s.end_time}`,
    brand: nameFor(brands, s.brand_id),
    platform: nameFor(platforms, s.platform_id),
    status: shiftStatusLabel(s.status),
    statusColor: (s.status === 'live' ? 'red' : s.status === 'completed' ? 'green' : 'slate') as 'blue' | 'green' | 'orange' | 'red' | 'slate',
    staffing: null,
  }))

  const upcomingShifts = todaysShifts.filter(s => s.status === 'scheduled').sort((a, b) => a.start_time.localeCompare(b.start_time))
  const nextUp = upcomingShifts[0]
  let upcomingLive: import('./presentation/leader/LeaderDashboardView').UpcomingLiveItem | null = null
  if (nextUp) {
    const campaignName = nextUp.campaign_id ? nameFor(campaigns, nextUp.campaign_id) : null
    upcomingLive = {
      brand: nameFor(brands, nextUp.brand_id),
      campaign: campaignName !== '?' ? campaignName : null,
      title: `${nameFor(brands, nextUp.brand_id)} | ${nameFor(platforms, nextUp.platform_id)}`,
      timing: `Bắt đầu lúc ${nextUp.start_time}`,
      host: nameFor(users, nextUp.host_id || ''),
      support: nameFor(users, nextUp.support_id || ''),
      technical: nameFor(users, nextUp.technical_id || ''),
    }
  }

  return (
    <div className="relative">
      {widgetErrors && (widgetErrors.reports || widgetErrors.registrations || widgetErrors.swaps) && (
        <div className="mx-4 sm:mx-8 mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 flex items-center justify-between">
          <span>Một số dữ liệu thứ cấp (báo cáo, đăng ký ca hoặc yêu cầu đổi ca) tải không thành công.</span>
          {onRetryWidget && (
            <button
              onClick={() => {
                if (widgetErrors.reports) onRetryWidget('reports')
                if (widgetErrors.registrations) onRetryWidget('registrations')
                if (widgetErrors.swaps) onRetryWidget('swaps')
              }}
              className="px-2.5 py-1 bg-amber-600 text-white rounded font-medium hover:bg-amber-700 transition"
            >
              Thử lại
            </button>
          )}
        </div>
      )}
      <LeaderDashboardView
        userName={props.currentUser.full_name}
        liveCount={liveCount}
        todaysShiftsCount={todaysShifts.length}
        missingStaffCount={null}
        pendingCount={pendingCount}
        decisions={decisions}
        todaysSchedule={todaysSchedule}
        staffingHealth={null}
        upcomingLive={upcomingLive}
        activityLog={null}
      />
    </div>
  )
}

function MemberDashboard(props: CommonProps) {
  const { shifts, brands, platforms, currentUser, swapRequests, registrations, widgetErrors, onRetryWidget } = props
  const today = getCurrentBusinessDate()
  const myAssignedShifts = getMemberAssignedShifts(shifts, currentUser.id, registrations ?? [])
    .sort((a, b) => `${a.date}${a.start_time}`.localeCompare(`${b.date}${b.start_time}`))

  const upcomingShifts = myAssignedShifts.filter(s => s.date >= today)
  const nextUp = upcomingShifts[0]

  let nextShift: import('./presentation/member/MemberDashboardView').NextShiftData | null = null
  if (nextUp) {
    const memberRole = nextUp.host_id === currentUser.id ? 'Host' : nextUp.support_id === currentUser.id ? 'Support' : 'Technical'
    nextShift = {
      startsIn: null,
      brand: nameFor(brands, nextUp.brand_id),
      platform: nameFor(platforms, nextUp.platform_id),
      time: `${nextUp.date} ${nextUp.start_time} – ${nextUp.end_time}`,
      role: memberRole,
      location: nextUp.studio ?? null,
    }
  }

  const mySchedule = myAssignedShifts.map(s => ({
    onView: () => props.setSelectedShift(s),
    date: s.date,
    time: `${s.start_time} – ${s.end_time}`,
    brand: nameFor(brands, s.brand_id),
    platform: nameFor(platforms, s.platform_id),
    role: s.host_id === currentUser.id ? 'Host' : s.support_id === currentUser.id ? 'Support' : 'Technical',
  }))

  let myActions: import('./presentation/member/MemberDashboardView').ActionEntry[] | null = null
  if (swapRequests !== null) {
    const myActionableSwaps = swapRequests.filter(s => {
      if (s.status !== 'pending' && s.status !== 'accepted') return false
      const actions = getSwapUiActions(s, currentUser)
      return actions.showAccept || actions.showCounterpartReject
    })
    myActions = myActionableSwaps.map(s => ({
      type: 'swap' as const,
      title: 'Yêu cầu đổi ca',
      time: s.created_at ? new Date(s.created_at).toLocaleDateString('vi-VN') : '—',
      description: 'Bạn có yêu cầu đổi ca cần phản hồi.',
    }))
  }

  let myRequests: import('./presentation/member/MemberDashboardView').RequestEntry[] | null = null
  if (registrations !== null || swapRequests !== null) {
    const myPendingRegs = registrations ? registrations.filter(r => r.user_id === currentUser.id && r.status === 'pending') : []
    const mySwapRequests = swapRequests ? swapRequests.filter(s => s.requester_id === currentUser.id || s.counterpart_id === currentUser.id) : []
    myRequests = [
      ...myPendingRegs.map(() => ({ type: 'registration' as const, title: 'Đăng ký ca', status: 'pending' as const })),
      ...mySwapRequests.filter(s => s.status === 'pending' || s.status === 'accepted').map(() => ({
        type: 'swap' as const,
        title: 'Yêu cầu đổi ca',
        status: 'pending' as const,
      })),
    ]
  }

  return (
    <div className="relative">
      {widgetErrors && (widgetErrors.registrations || widgetErrors.swaps) && (
        <div className="mx-4 sm:mx-8 mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 flex items-center justify-between">
          <span>Một số dữ liệu yêu cầu hoặc đổi ca tải không thành công.</span>
          {onRetryWidget && (
            <button
              onClick={() => {
                if (widgetErrors.registrations) onRetryWidget('registrations')
                if (widgetErrors.swaps) onRetryWidget('swaps')
              }}
              className="px-2.5 py-1 bg-amber-600 text-white rounded font-medium hover:bg-amber-700 transition"
            >
              Thử lại
            </button>
          )}
        </div>
      )}
      <MemberDashboardView
        userName={currentUser.full_name}
        onOpenNextShift={nextUp ? () => props.setSelectedShift(nextUp) : undefined}
        nextShift={nextShift}
        mySchedule={mySchedule}
        myActions={myActions}
        openShifts={null}
        myRequests={myRequests}
        notifications={null}
      />
    </div>
  )
}
