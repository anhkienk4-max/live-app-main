'use client'

import * as React from 'react'
import {
  BarChart3,
  Calendar,
  Download,
  Eye,
  Filter,
  RotateCcw,
  TrendingUp,
} from 'lucide-react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { reportService, shiftRegistrationService, shiftService, type AnalyticsSnapshot } from '@/lib/services/dataService'
import { Brand, Campaign, OperationalRole, Platform, Report, ShiftRegistration, User } from '@/lib/types/database.types'
import { useTranslation } from '@/lib/i18n'
import { formatCurrency } from '@/lib/utils/currency'
import { formatChartAxis, formatDimensionTick } from '@/lib/utils/chartLabels'
import { ReportDetailModal } from '@/components/features/reports/ReportDetailModal'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'
import { hasPermission } from '@/lib/permissions'
import { exportReportsToExcel } from '@/lib/utils/excelUtils'
import { HistoryPagination } from '@/components/ui/history-pagination'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useToast } from '@/components/ui/toast'
import { PageLoadError } from '@/components/ui/page-load-error'
import { reportMetricValue, resolveAnalyticsDateRange } from '@/lib/utils/analytics'
import { BI_CHART_CATALOG, biChartCompatibilityMessage, biChartCompatibilityReason, biMetricValue, biPersonalViewStorageKey, firstCompatibleBiChart, hasBiMetricObservation, hasNegativeBiMetric, parseBiPersonalView, analyticsPeriodBucket, type BiChartKey, type BiDimension, type BiMetricKey } from '@/lib/utils/bi01Catalog'
import { MultiSelectFilter } from '@/components/ui/multi-select-filter'
import { usePagedList } from '@/lib/hooks/usePagedList'
import { getOperationalReferences } from '@/lib/services/operationalReferences'

type RangeKey = 'today' | 'yesterday' | '7d' | '30d' | 'thisMonth' | 'lastMonth' | 'custom'
type Filters = { range: RangeKey; start: string; end: string; brandIds: string[]; platformIds: string[]; campaignIds: string[]; hostIds: string[]; supportIds: string[]; technicalIds: string[] }
type MetricKey = BiMetricKey
type AnalyticsDimension = BiDimension
type AnalyticsChartType = BiChartKey

const addRange = (range: Exclude<RangeKey, 'custom'>) => resolveAnalyticsDateRange(range)
const initialFilters = (): Filters => ({ range: '30d', ...addRange('30d'), brandIds: [], platformIds: [], campaignIds: [], hostIds: [], supportIds: [], technicalIds: [] })
const analyticsList = { getPage: reportService.getAnalyticsPage }

const CHART_COLORS = ['#4f46e5', '#06b6d4', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#3b82f6', '#14b8a6']

export function DashboardAnalytics() {
  const { t, language } = useTranslation()
  const isEn = language === 'en'
  const tr = React.useCallback((key: string, fallbackVi: string, fallbackEn?: string): string => {
    try {
      const val = (t as (k: string) => string)(key)
      if (val && val !== key) return val
    } catch {}
    return isEn ? (fallbackEn ?? fallbackVi) : fallbackVi
  }, [t, isEn])

  const { toast } = useToast()
  const { currentUser } = useCurrentUser()
  const identity = currentUser ? currentUser.id + ':' + (currentUser.system_permission ?? currentUser.role) : ''
  const [loadedKey, setLoadedKey] = React.useState('')
  const [selectedReport, setSelectedReport] = React.useState<Report | null>(null)
  const [compare, setCompare] = React.useState(false)
  const [snapshot, setSnapshot] = React.useState<AnalyticsSnapshot | null>(null)
  const [brands, setBrands] = React.useState<Brand[]>([])
  const [platforms, setPlatforms] = React.useState<Platform[]>([])
  const [campaigns, setCampaigns] = React.useState<Campaign[]>([])
  const [users, setUsers] = React.useState<User[]>([])
  const [registrations, setRegistrations] = React.useState<ShiftRegistration[]>([])
  const [filters, setFiltersRaw] = React.useState<Filters | null>(() => initialFilters())
  const [showFilters, setShowFilters] = React.useState(false)
  const [loading, setLoading] = React.useState(true)
  const [loadError, setLoadError] = React.useState<unknown>(null)

  // Interactive Analytics Workspace State
  const [selectedMetric, setSelectedMetric] = React.useState<MetricKey>('revenue')
  const [selectedDimension, setSelectedDimension] = React.useState<AnalyticsDimension>('time')
  const [selectedChartType, setSelectedChartType] = React.useState<AnalyticsChartType>('area')
  const personalViewKey = currentUser ? biPersonalViewStorageKey(currentUser.id) : ''
  const [hasPersonalView, setHasPersonalView] = React.useState(false)

  const snapshotFilters = filters ? { from: filters.start, to: filters.end, brandIds: filters.brandIds, platformIds: filters.platformIds, campaignIds: filters.campaignIds, hostIds: filters.hostIds, supportIds: filters.supportIds, technicalIds: filters.technicalIds } : {}
  const filtersKey = JSON.stringify(snapshotFilters)
  const list = usePagedList<Report>(analyticsList, 'analytics_reports', { ...snapshotFilters, reportStatuses: ['confirmed'], metricsStatuses: ['confirmed'] })
  const pageResult = (list.refreshing ? undefined : list.result) as Awaited<ReturnType<typeof reportService.getAnalyticsPage>> | undefined
  const setFilters: typeof setFiltersRaw = action => { setFiltersRaw(action); list.reset() }
  const setPage = list.setPage
  const pageSize = list.pageSize

  React.useEffect(() => {
    let active = true
    void Promise.resolve().then(() => {
      if (!active) return
      try { setHasPersonalView(Boolean(personalViewKey && window.localStorage.getItem(personalViewKey))) }
      catch { setHasPersonalView(false) }
    })
    return () => { active = false }
  }, [personalViewKey])

  const exportComplete = async () => {
    if (!filters || !currentUser || !hasPermission(currentUser, 'reports.export')) return
    try {
      const complete = await reportService.getAllFiltered({
        from: filters.start, to: filters.end, brandIds: filters.brandIds, platformIds: filters.platformIds, campaignIds: filters.campaignIds,
        hostIds: filters.hostIds, supportIds: filters.supportIds, technicalIds: filters.technicalIds, reportStatuses: ['confirmed'], metricsStatuses: ['confirmed']
      })
      const shifts = await shiftService.getAllFiltered({
        from: filters.start, to: filters.end, brandIds: filters.brandIds, platformIds: filters.platformIds, campaignIds: filters.campaignIds,
        hostIds: filters.hostIds, supportIds: filters.supportIds, technicalIds: filters.technicalIds
      })
      const exportRegistrations = await shiftRegistrationService.getForShifts(shifts.map(shift => shift.id))
      exportReportsToExcel(complete, {
        shifts, campaigns, users, registrations: exportRegistrations,
        brands: new Map(brands.map(b => [b.id, b.name])),
        platforms: new Map(platforms.map(p => [p.id, p.name]))
      })
    } catch (error) {
      toast({ title: t('error'), description: error instanceof Error ? error.message : t('validationError'), variant: 'destructive' })
    }
  }

  const requestVersion=React.useRef(0)
  const activeRequest=React.useRef<AbortController|null>(null)
  const loadData = React.useCallback(async () => {
    const version=++requestVersion.current
    activeRequest.current?.abort()
    const controller=new AbortController()
    activeRequest.current=controller
    if(!identity||!currentUser) {
      activeRequest.current=null
      setLoadedKey('')
      setSnapshot(null)
      setBrands([]); setPlatforms([]); setCampaigns([]); setUsers([]); setRegistrations([])
      setSelectedReport(null)
      setLoadError(null)
      setLoading(false)
      return
    }
    setLoading(true)
    setLoadError(null)
    try {
      const [loadedSnapshot, refs] = await Promise.all([
        reportService.getAnalyticsSnapshot(JSON.parse(filtersKey),controller.signal), getOperationalReferences(currentUser),
      ])
      if(version!==requestVersion.current||controller.signal.aborted)return
      setLoadedKey(identity+':'+filtersKey)
      setSnapshot(loadedSnapshot); setBrands(refs.brands); setPlatforms(refs.platforms); setCampaigns(refs.campaigns); setUsers(refs.users)
    } catch (error) {
      if(version===requestVersion.current&&!controller.signal.aborted)setLoadError(error)
    } finally {
      if(version===requestVersion.current) {
        activeRequest.current=null
        setLoading(false)
      }
    }
  }, [identity,filtersKey,currentUser])

  React.useEffect(() => {
    // Initial data hydration intentionally updates the loading/data state from the async callback.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadData()
    return () => { requestVersion.current+=1; activeRequest.current?.abort() }
  }, [loadData])

  if (loadError || list.error) {
    return <PageLoadError error={loadError ?? list.error} onRetry={() => { setLoading(true); void loadData(); void list.reload() }} />
  }

  if (loading || !filters || !snapshot || loadedKey !== identity + ':' + filtersKey || list.loading || list.refreshing) {
    return (
      <div className="space-y-4" data-testid="analytics-loading-shell">
        <div className="flex flex-col gap-2 rounded-lg border bg-white px-4 py-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-lg font-semibold">{t('analytics')}</h1>
            <p className="text-xs text-muted-foreground">{t('analyticsSubtitle')}</p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[1, 2, 3, 4].map(idx => (
            <div key={idx} className="rounded-lg border bg-white p-4 animate-pulse">
              <div className="h-3 w-16 bg-slate-200 rounded mb-2" />
              <div className="h-6 w-24 bg-slate-200 rounded" />
            </div>
          ))}
        </div>
        <div className="rounded-lg border bg-white p-12 text-center">
          <div className="inline-block h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent mb-2" />
          <p className="text-xs text-muted-foreground">{t('loading')}</p>
        </div>
      </div>
    )
  }

  const totals = snapshot.totals
  const previous = snapshot.previous
  const currentCount = totals.reportCount ?? 0
  const shiftById = new Map((pageResult?.shifts ?? []).map(shift => [shift.id, shift]))
  const delta = (key: MetricKey) => {
    const before = biMetricValue(previous as unknown as Record<string, unknown>, key)
    const after = biMetricValue(totals as unknown as Record<string, unknown>, key)
    return before == null || after == null || before === 0 ? '—' : (((after - before) / before) * 100).toFixed(1) + '%'
  }
  const trend = snapshot.trend

  const dimensionData = (dimension: 'brand' | 'platform' | 'campaign', metric: MetricKey = 'revenue') => {
    const items = dimension === 'brand' ? brands : dimension === 'platform' ? platforms : campaigns
    const rows = dimension === 'brand' ? snapshot.brands : dimension === 'platform' ? snapshot.platforms : snapshot.campaigns
    const groups = new Map<string, { id: string | null; name: string; value: number | null; revenue: number | null; count: number }>()
    for (const row of rows) {
      const name = items.find(item => item.id === row.id)?.name ?? '—'
      const key = row.id ?? '__unassigned__'
      const prev = groups.get(key)
      const rowValue = biMetricValue(row as unknown as Record<string, unknown>, metric)
      const rowRevenue = row.revenue
      groups.set(key, {
        id: row.id,
        name,
        value: rowValue === null ? prev?.value ?? null : (prev?.value ?? 0) + rowValue,
        revenue: rowRevenue === null ? prev?.revenue ?? null : (prev?.revenue ?? 0) + rowRevenue,
        count: (prev?.count ?? 0) + (row.reportCount ?? 0)
      })
    }
    return [...groups.values()].sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity))  }

  const userMap = new Map(users.map(user => [user.id, user]))
  const workload = snapshot.workload.filter(row => userMap.has(row.user_id)).map(row => ({
    name: userMap.get(row.user_id)!.full_name,
    host: row.host,
    support: row.support,
    technical: row.technical
  }))
  const hostPerformance = snapshot.hostPerformance.filter(row => row.revenue !== null && userMap.get(row.user_id)?.operational_roles?.includes('host')).map(row => ({
    id: row.user_id,
    name: userMap.get(row.user_id)!.full_name,
    revenue: row.revenue
  }))

  const updateRange = (range: RangeKey) => {
    setPage(1)
    setFilters(current => current ? { ...current, range, ...(range === 'custom' ? {} : addRange(range)) } : current)
  }
  const roleOptions = (role: OperationalRole) => users.filter(user => user.operational_roles?.includes(role)).map(user => ({ id: user.id, name: user.full_name }))
  const display = (value: number | null, unit = '') => value === null ? '—' : unit === 'currency' ? formatCurrency(value) : value.toLocaleString(undefined, { maximumFractionDigits: 2 }) + unit

  const metricDefinitions: Array<{ key: MetricKey; unit: string; source: string; label: string }> = [
    { key: 'revenue', unit: 'currency', source: 'SUM confirmed report revenue; source field varies by platform', label: t('revenue') },
    { key: 'gmv', unit: 'currency', source: 'SUM confirmed GMV; never substituted with Revenue', label: 'GMV' },
    { key: 'orders', unit: '', source: 'SUM confirmed report orders', label: t('orders') },
    { key: 'viewers', unit: '', source: 'SUM reported engaged viewers; missing observations excluded', label: t('viewers') },
    { key: 'productClicks', unit: '', source: 'SUM reported product clicks; missing observations excluded', label: t('productClicks') },
    { key: 'ctr', unit: '%', source: 'Unweighted average of observed confirmed-report CTR', label: 'CTR' },
    { key: 'cvr', unit: '%', source: 'Unweighted average of observed confirmed-report CVR', label: 'CVR' },
    { key: 'averageOrderValue', unit: 'currency', source: 'Paired Revenue / Orders using verified weighted formula', label: t('averageOrderValue') },
    { key: 'liveHours', unit: ' h', source: 'Reported live minutes / 60; not scheduled shift length', label: tr('liveHours', 'Giờ livestream', 'Livestream hours') },
    { key: 'reportCount', unit: '', source: 'Count confirmed report records; not distinct shifts', label: t('reportCount') }
  ]
  const primaryMetricKeys: MetricKey[] = ['revenue', 'orders', 'averageOrderValue', 'viewers', 'ctr', 'cvr']
  const primaryMetrics = metricDefinitions.filter(metric => primaryMetricKeys.includes(metric.key))
  const secondaryMetrics = metricDefinitions.filter(metric => !primaryMetricKeys.includes(metric.key))
  const safePage = pageResult?.page ?? list.page
  const visibleReports = pageResult?.items ?? []
  const selectedShift = selectedReport ? shiftById.get(selectedReport.shift_id) : undefined
  const platformData = dimensionData('platform', 'revenue')

  // Prepare Interactive Chart Data
  const isSelectedMetricCurrency = selectedMetric === 'revenue' || selectedMetric === 'gmv' || selectedMetric === 'averageOrderValue'
  const isSelectedMetricPercent = selectedMetric === 'ctr' || selectedMetric === 'cvr'
  const selectedMetricDef = metricDefinitions.find(m => m.key === selectedMetric) || metricDefinitions[0]
  const activeChartReason = biChartCompatibilityMessage(selectedMetric, selectedDimension, selectedChartType, isEn)

  let interactiveChartData: Array<Record<string, string | number | null>> = []
  let interactiveXKey = 'period'
  let interactiveDataKey = selectedMetric

  if (selectedDimension === 'time') {
    interactiveChartData = trend.map(item => ({
      period: item.period,
      [selectedMetric]: biMetricValue(item as unknown as Record<string, unknown>, selectedMetric),
      drilldownId: item.period
    }))
    interactiveXKey = 'period'
    interactiveDataKey = selectedMetric
  } else if (selectedDimension === 'brand' || selectedDimension === 'platform' || selectedDimension === 'campaign') {
    const dimRows = dimensionData(selectedDimension, selectedMetric)
    interactiveChartData = dimRows.map(row => ({
      name: row.name,
      value: row.value,
      [selectedMetric]: row.value,
      drilldownId: row.id
    }))
    interactiveXKey = 'name'
    interactiveDataKey = selectedMetric
  } else if (selectedDimension === 'host') {
    interactiveChartData = hostPerformance.map(row => ({
      name: row.name,
      value: row.revenue,
      [selectedMetric]: row.revenue,
      drilldownId: row.id
    }))
    interactiveXKey = 'name'
    interactiveDataKey = selectedMetric
  }

  const interactiveValues = interactiveChartData.map(row => typeof row[interactiveDataKey] === 'number' ? Number(row[interactiveDataKey]) : null)
  const hasInteractiveData = currentCount > 0 && interactiveChartData.length > 0 && hasBiMetricObservation(interactiveValues)
  const pieHasNegativeValues = (selectedChartType === 'pie' || selectedChartType === 'donut') && hasNegativeBiMetric(interactiveValues)
  const pieHasPositiveValues = interactiveValues.some(value => typeof value === 'number' && value > 0)
  const pieChartBlockedByValues = (selectedChartType === 'pie' || selectedChartType === 'donut') && (pieHasNegativeValues || !pieHasPositiveValues)
  const pieData = interactiveChartData.filter(row => row[interactiveDataKey] !== null && typeof row[interactiveDataKey] === 'number' && Number(row[interactiveDataKey]) > 0)
  const drilldownOptions = interactiveChartData.filter(row => typeof row.drilldownId === 'string' && row.drilldownId.length > 0)
  const applyDrilldown = (id: string) => {
    const selected = interactiveChartData.find(row => row.drilldownId === id)
    if (!selected || !filters) return
    if (selectedDimension === 'time') {
      const period = typeof selected.period === 'string' ? selected.period : ''
      const range = analyticsPeriodBucket(period, filters.start, filters.end)
      if (range) setFilters(current => current ? { ...current, range: 'custom', start: range.start, end: range.end } : current)
      return
    }
    if (selectedDimension === 'brand') setFilters(current => current ? { ...current, brandIds: [id] } : current)
    else if (selectedDimension === 'platform') setFilters(current => current ? { ...current, platformIds: [id] } : current)
    else if (selectedDimension === 'campaign') setFilters(current => current ? { ...current, campaignIds: [id] } : current)
    else setFilters(current => current ? { ...current, hostIds: [id] } : current)
  }
  const savePersonalView = () => {
    if (!personalViewKey || !filters || typeof window === 'undefined') return
    try {
      window.localStorage.setItem(personalViewKey, JSON.stringify({ version: 1, metric: selectedMetric, dimension: selectedDimension, chart: selectedChartType, filters }))
      setHasPersonalView(true)
      toast({ title: tr('viewSaved', 'Đã lưu chế độ xem cá nhân', 'Personal view saved') })
    } catch {
      toast({ title: tr('viewSaveFailed', 'Không thể lưu chế độ xem trên thiết bị này', 'Could not save this view on this device'), variant: 'destructive' })
    }
  }
  const restorePersonalView = () => {
    if (!personalViewKey || typeof window === 'undefined') return
    try {
      const serialized = window.localStorage.getItem(personalViewKey)
      const view = serialized ? parseBiPersonalView(serialized) : null
      if (!view) {
        setHasPersonalView(false)
        return
      }
      setFilters(view.filters)
      setPage(1)
      setSelectedMetric(view.metric)
      setSelectedDimension(view.dimension)
      setSelectedChartType(view.chart)
      toast({ title: tr('viewLoaded', 'Đã tải chế độ xem cá nhân', 'Personal view loaded') })
    } catch {
      setHasPersonalView(false)
    }
  }

  return (
    <div className="min-w-0 space-y-3 text-slate-900" data-testid="analytics-ready">
      {/* Top Header & Range Actions */}
      <div className="flex flex-col gap-2 rounded-lg border bg-white px-4 py-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-lg font-semibold">{t('analytics')}</h1>
          <p className="text-xs text-muted-foreground">{t('analyticsSubtitle')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select value={filters.range} onValueChange={updateRange}>
            <SelectTrigger className="w-36 text-xs"><SelectValue placeholder={tr('filterRange', 'Khoảng thời gian', 'Range')} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="today">{t('today')}</SelectItem>
              <SelectItem value="yesterday">{t('yesterday')}</SelectItem>
              <SelectItem value="7d">{t('last7Days')}</SelectItem>
              <SelectItem value="30d">{t('last30Days')}</SelectItem>
              <SelectItem value="thisMonth">{t('thisMonth')}</SelectItem>
              <SelectItem value="lastMonth">{t('lastMonth')}</SelectItem>
              <SelectItem value="custom">{t('customRange')}</SelectItem>
            </SelectContent>
          </Select>
          {filters.range === 'custom' && (
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <Input type="month" aria-label={tr('yearMonth', 'Năm và tháng', 'Year and month')} value={filters.start.slice(0, 7)} onChange={e => {
                const value = e.target.value
                if (!/^\\d{4}-\\d{2}$/.test(value)) return
                const [year, month] = value.split('-').map(Number)
                if (month < 1 || month > 12) return
                const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate()
                const end = value + '-' + String(lastDay).padStart(2, '0')
                setPage(1)
                setFilters(current => current ? { ...current, range: 'custom', start: value + '-01', end } : current)
              }} className="h-8 w-36" />
              <Input type="date" aria-label={tr('startDate', 'Từ ngày', 'Start date')} value={filters.start} onChange={e => { setPage(1); setFilters(c => c ? { ...c, start: e.target.value } : c) }} className="h-8 w-32" />
              <span>–</span>
              <Input type="date" aria-label={tr('endDate', 'Đến ngày', 'End date')} value={filters.end} onChange={e => { setPage(1); setFilters(c => c ? { ...c, end: e.target.value } : c) }} className="h-8 w-32" />
            </div>
          )}
          <Button variant={compare ? 'default' : 'outline'} size="sm" onClick={() => setCompare(!compare)} className="text-xs">
            {tr('comparePreviousPeriod', 'So sánh kỳ trước', 'Compare previous period')}
          </Button>
          <Button variant="outline" size="sm" aria-controls="analytics-filter-panel" onClick={() => setShowFilters(!showFilters)} className="text-xs">
            <Filter className="mr-1.5 h-3.5 w-3.5" />
            {t('filters')}
          </Button>
          {hasPermission(currentUser, 'reports.export') && (
            <Button variant="outline" size="sm" onClick={exportComplete} className="text-xs">
              <Download className="mr-1.5 h-3.5 w-3.5" />
              {tr('export', 'Xuất Excel', 'Export')}
            </Button>
          )}
        </div>
      </div>

      {/* Filter Panel */}
      {showFilters && (
        <section id="analytics-filter-panel" className="space-y-3 rounded-lg border bg-white p-4">
          <div className="grid gap-3 md:grid-cols-2">
            <FilterSelect label={t('brand')} value={filters.brandIds} options={brands} onChange={value => setFilters(c => c ? { ...c, brandIds: value } : c)} />
            <FilterSelect label={t('platform')} value={filters.platformIds} options={platforms} onChange={value => setFilters(c => c ? { ...c, platformIds: value } : c)} />
          </div>
          <div className="grid gap-3 md:grid-cols-4">
            <FilterSelect label={t('campaign')} value={filters.campaignIds} options={campaigns} onChange={value => setFilters(c => c ? { ...c, campaignIds: value } : c)} />
            <FilterSelect label={t('host')} value={filters.hostIds} options={roleOptions('host')} onChange={value => setFilters(c => c ? { ...c, hostIds: value } : c)} />
            <FilterSelect label={t('support')} value={filters.supportIds} options={roleOptions('support')} onChange={value => setFilters(c => c ? { ...c, supportIds: value } : c)} />
            <FilterSelect label={t('technical')} value={filters.technicalIds} options={roleOptions('technical')} onChange={value => setFilters(c => c ? { ...c, technicalIds: value } : c)} />
          </div>
          <Button variant="outline" size="sm" onClick={() => setFilters(initialFilters())} className="text-xs">
            <RotateCcw className="mr-2 h-3.5 w-3.5" />
            {t('resetFilters')}
          </Button>
        </section>
      )}

      {/* Primary Metrics Strip */}
      <div className="grid grid-cols-2 overflow-hidden rounded-lg border border-slate-200 bg-white sm:grid-cols-3 xl:grid-cols-6">
        {primaryMetrics.map(metric => (
          <Metric
            key={metric.key}
            title={metric.key === 'revenue' ? t('confirmedRevenue') : metric.label}
            value={display(biMetricValue(totals as unknown as Record<string, unknown>, metric.key), metric.unit)}
            note={compare ? delta(metric.key) + ' ' + t('previousPeriod') : metric.source}
          />
        ))}
      </div>

      {/* Secondary Metrics & Formula Transparency */}
      {secondaryMetrics.length > 0 && (
        <section className="rounded-lg border border-slate-200 bg-white p-3">
          <div className="mb-2 text-xs font-semibold text-slate-700">{t('additionalMetricsAndFormulas')}</div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {secondaryMetrics.map(metric => (
              <Metric
                key={metric.key}
                title={metric.label}
                value={display(biMetricValue(totals as unknown as Record<string, unknown>, metric.key), metric.unit)}
                note={compare ? delta(metric.key) + ' ' + t('previousPeriod') : metric.source}
              />
            ))}
          </div>
          <details className="mt-2 border-t pt-2 text-xs text-slate-500">
            <summary className="cursor-pointer font-medium hover:text-slate-800">KPI definitions & business rules</summary>
            <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {metricDefinitions.map(metric => (
                <div key={metric.key}>
                  <strong className="text-slate-700">{metric.label}</strong>
                  <p className="text-[11px] text-slate-500">{metric.source}</p>
                </div>              ))}
            </div>
            <p className="mt-2 text-[11px] text-slate-400">
              * Dữ liệu chỉ tính từ báo cáo ca đã xác nhận (confirmed). Giá trị chưa phát sinh hiển thị là &quot;—&quot;; số 0 hợp lệ được giữ nguyên.
            </p>
          </details>
        </section>
      )}

      {/* 1. Interactive Analytics Workspace Card (Always Visible) */}
      <Card className="border border-slate-200 bg-white shadow-sm overflow-hidden" data-testid="analytics-workspace-card">
        <CardHeader className="border-b bg-slate-50/70 px-4 py-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-2">
              <div className="rounded-md bg-indigo-50 p-1.5 text-indigo-600 border border-indigo-100">
                <TrendingUp className="h-4 w-4" />
              </div>
              <div>
                <CardTitle className="text-sm font-semibold text-slate-900">
                  {tr('interactiveWorkspace', 'Không gian Phân tích Tương tác (Interactive Workspace)', 'Interactive Analytics Workspace')}
                </CardTitle>
                <p className="text-[11px] text-muted-foreground">
                  {tr('interactiveWorkspaceDesc', 'Tùy chỉnh chỉ số, chiều phân tích và dạng trực quan hóa', 'Customize metrics, dimensions, and visualization styles')}
                </p>
              </div>
            </div>

            {/* Workspace Controls Row */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Metric Selector */}
              <div className="flex items-center gap-1.5 text-xs">
                <span className="font-medium text-slate-500 hidden sm:inline">{tr('metric', 'Chỉ số', 'Metric')}:</span>
                <select
                  aria-label={tr('metric', 'Chỉ số', 'Metric')} data-testid="bi-metric-selector"
                  value={selectedMetric}
                  onChange={e => {
                    const nextMetric = e.target.value as MetricKey
                    setSelectedMetric(nextMetric)
                    if (biChartCompatibilityReason(nextMetric, selectedDimension, selectedChartType)) {
                      setSelectedChartType(firstCompatibleBiChart(nextMetric, selectedDimension))
                    }
                  }}
                  className="h-8 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-800 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  {metricDefinitions.map(metric => {
                    const reason = biChartCompatibilityReason(metric.key, selectedDimension, 'bar')
                    return <option key={metric.key} value={metric.key} disabled={Boolean(reason)} title={reason ?? undefined}>
                      {metric.label}{reason ? ' — ' + (isEn ? reason : 'Chỉ số này chưa được API cung cấp cho chiều đã chọn') : ''}
                    </option>
                  })}
                </select>
              </div>

              {/* Dimension Selector */}
              <div className="flex items-center gap-1.5 text-xs">
                <span className="font-medium text-slate-500 hidden sm:inline">{tr('dimension', 'Chiều', 'Dimension')}:</span>
                <select
                  aria-label={tr('dimension', 'Chiều phân tích', 'Dimension')} data-testid="bi-dimension-selector"
                  value={selectedDimension}
                  onChange={e => {
                    const nextDim = e.target.value as AnalyticsDimension
                    const nextMetric = nextDim === 'host' ? 'revenue' : selectedMetric
                    setSelectedDimension(nextDim)
                    setSelectedMetric(nextMetric)
                    if (biChartCompatibilityReason(nextMetric, nextDim, selectedChartType)) {
                      setSelectedChartType(firstCompatibleBiChart(nextMetric, nextDim))
                    }
                  }}
                  className="h-8 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-800 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <option value="time">{tr('byTime', 'Theo thời gian', 'By Time')}</option>
                  <option value="brand">{tr('byBrand', 'Theo Thương hiệu', 'By Brand')}</option>
                  <option value="platform">{tr('byPlatform', 'Theo Nền tảng', 'By Platform')}</option>
                  <option value="campaign">{tr('byCampaign', 'Theo Chiến dịch', 'By Campaign')}</option>
                  <option value="host">{tr('byHost', 'Theo Host', 'By Host')}</option>
                </select>
              </div>

              <div className="flex items-center gap-1.5 text-xs">
                <span className="font-medium text-slate-500 hidden sm:inline">{tr('chartType', 'Biểu đồ', 'Chart')}:</span>
                <select
                  aria-label={tr('chartType', 'Loại biểu đồ', 'Chart type')} data-testid="bi-chart-selector"
                  value={selectedChartType}
                  onChange={e => setSelectedChartType(e.target.value as AnalyticsChartType)}
                  className="h-8 max-w-52 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-800 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  {BI_CHART_CATALOG.map(chart => {
                    const reason = biChartCompatibilityReason(selectedMetric, selectedDimension, chart.key)
                    const explanation = biChartCompatibilityMessage(selectedMetric, selectedDimension, chart.key, isEn)
                    return <option key={chart.key} value={chart.key} disabled={Boolean(reason)} title={explanation}>
                      {chart.label}{reason ? ' — ' + explanation : ''}
                    </option>
                  })}
                </select>
              </div>
              <div className="flex items-center gap-1">
                <Button data-testid="bi-save-view" type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={savePersonalView} disabled={!personalViewKey || !filters}>
                  {tr('saveView', 'Lưu chế độ xem', 'Save view')}
                </Button>
                <Button data-testid="bi-load-view" type="button" size="sm" variant="outline" className="h-8 text-xs" onClick={restorePersonalView} disabled={!hasPersonalView}>
                  {tr('loadView', 'Tải chế độ xem', 'Load view')}
                </Button>
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="space-y-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-xs text-slate-500">
              {activeChartReason || tr('confirmedOnlyNote', 'Chỉ dữ liệu báo cáo đã xác nhận được tổng hợp; dữ liệu thiếu không được đổi thành 0.', 'Only confirmed report data is aggregated; missing observations are not converted to zero.')}
            </div>
            {drilldownOptions.length > 0 && (
              <label className="flex items-center gap-2 text-xs">
                <span>{tr('drillDown', 'Đi sâu vào', 'Drill down')}</span>
                <select aria-label={tr('drillDown', 'Đi sâu vào', 'Drill down')} value=""
                  onChange={event => applyDrilldown(event.target.value)}
                  className="h-8 max-w-56 rounded-md border bg-white px-2 text-xs">
                  <option value="">{tr('selectDimensionValue', 'Chọn giá trị', 'Choose a value')}</option>
                  {drilldownOptions.map(row => <option key={String(row.drilldownId)} value={String(row.drilldownId)}>
                    {String(row[interactiveXKey] ?? '—')}
                  </option>)}
                </select>
              </label>
            )}
          </div>
          {!hasInteractiveData || pieChartBlockedByValues ? (
            <div className="flex h-72 flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50/70 p-6 text-center animate-in fade-in-50">
              <div className="rounded-full bg-slate-100 p-3 mb-3 text-slate-400">
                <BarChart3 className="h-6 w-6 text-slate-500" />
              </div>
              <p className="font-semibold text-sm text-slate-800">
                {pieHasNegativeValues
                  ? tr('pieNegativeUnsupported', 'Pie/Donut không hiển thị giá trị âm.', 'Pie/Donut cannot represent negative values.')
                  : hasInteractiveData
                    ? tr('noMetricObservation', 'Không có quan sát hợp lệ cho chỉ số đã chọn; giá trị thiếu vẫn để trống.', 'No valid observations for this metric; missing values remain blank.')
                    : tr('noConfirmedData', 'Chưa có dữ liệu báo cáo được xác nhận.', 'No confirmed report data.')}
              </p>
              <p className="mt-1.5 max-w-md text-xs text-slate-500 leading-relaxed">
                {tr('analyticsConfirmedOnlyHelp', 'KPI chỉ dùng báo cáo confirmed và metrics_confirmed. Mở rộng khoảng ngày hoặc điều chỉnh Brand / Platform / Campaign.', 'KPIs use confirmed reports with metrics_confirmed. Expand the date range or adjust Brand / Platform / Campaign filters.')}
              </p>
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                <Button size="sm" variant="outline" className="text-xs" onClick={() => updateRange('30d')}>
                  <Calendar className="mr-1.5 h-3.5 w-3.5 text-primary" />
                  Xem 30 ngày qua
                </Button>
                <Button size="sm" variant="ghost" className="text-xs" onClick={() => setFilters(initialFilters())}>
                  <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                  {t('resetFilters')}
                </Button>
              </div>
            </div>
          ) : (
            <div className="h-72 w-full pt-2">
              <ResponsiveContainer width="100%" height="100%">
                {selectedChartType === 'area' ? (
                  <AreaChart data={interactiveChartData} margin={{ top: 12, right: 16, bottom: 8, left: 8 }}>
                    <defs>
                      <linearGradient id="interactiveAreaGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.35} />
                        <stop offset="95%" stopColor="#4f46e5" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey={interactiveXKey} tickFormatter={selectedDimension !== 'time' ? formatDimensionTick : undefined} tick={{ fontSize: 11 }} tickMargin={8} interval="preserveStartEnd" />
                    <YAxis width={80} tick={{ fontSize: 11 }} tickMargin={8} tickFormatter={value => formatChartAxis(Number(value), isSelectedMetricCurrency)} />
                    <Tooltip formatter={(value) => [isSelectedMetricCurrency ? formatCurrency(Number(value)) : isSelectedMetricPercent ? Number(value).toFixed(2) + '%' : Number(value).toLocaleString(), selectedMetricDef.label]} />
                    <Legend />
                    <Area type="monotone" dataKey={interactiveDataKey} name={selectedMetricDef.label} stroke="#4f46e5" fill="url(#interactiveAreaGrad)" />
                  </AreaChart>
                ) : selectedChartType === 'line' ? (
                  <LineChart data={interactiveChartData} margin={{ top: 12, right: 16, bottom: 8, left: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey={interactiveXKey} tickFormatter={selectedDimension !== 'time' ? formatDimensionTick : undefined} tick={{ fontSize: 11 }} tickMargin={8} interval="preserveStartEnd" />
                    <YAxis width={80} tick={{ fontSize: 11 }} tickMargin={8} tickFormatter={value => formatChartAxis(Number(value), isSelectedMetricCurrency)} />
                    <Tooltip formatter={(value) => [isSelectedMetricCurrency ? formatCurrency(Number(value)) : isSelectedMetricPercent ? Number(value).toFixed(2) + '%' : Number(value).toLocaleString(), selectedMetricDef.label]} />
                    <Legend />
                    <Line type="monotone" dataKey={interactiveDataKey} name={selectedMetricDef.label} stroke="#4f46e5" strokeWidth={2} dot={{ r: 3 }} />
                  </LineChart>
                ) : selectedChartType === 'bar' ? (
                  <BarChart data={interactiveChartData} margin={{ top: 12, right: 16, bottom: 8, left: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey={interactiveXKey} tickFormatter={selectedDimension !== 'time' ? formatDimensionTick : undefined} tick={{ fontSize: 11 }} tickMargin={8} interval="preserveStartEnd" />
                    <YAxis width={80} tick={{ fontSize: 11 }} tickMargin={8} tickFormatter={value => formatChartAxis(Number(value), isSelectedMetricCurrency)} />
                    <Tooltip formatter={(value) => [isSelectedMetricCurrency ? formatCurrency(Number(value)) : isSelectedMetricPercent ? Number(value).toFixed(2) + '%' : Number(value).toLocaleString(), selectedMetricDef.label]} />
                    <Legend />
                    <Bar dataKey={interactiveDataKey} name={selectedMetricDef.label} fill="#4f46e5" radius={[4, 4, 0, 0]} />
                  </BarChart>
                ) : (
                  <PieChart margin={{ top: 8, right: 12, bottom: 8, left: 12 }}>
                    <Tooltip formatter={(value) => [isSelectedMetricCurrency ? formatCurrency(Number(value)) : isSelectedMetricPercent ? Number(value).toFixed(2) + '%' : Number(value).toLocaleString(), selectedMetricDef.label]} />
                    <Legend />
                    <Pie
                      data={pieData}
                      dataKey={interactiveDataKey}
                      nameKey={interactiveXKey}
                      cx="50%"
                      cy="50%"
                      innerRadius={selectedChartType === 'donut' ? 45 : 0}
                      outerRadius={85}
                      paddingAngle={2}
                    >
                      {pieData.map((_, idx) => (
                        <Cell key={'cell-' + idx} fill={CHART_COLORS[idx % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                  </PieChart>
                )}
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 2. Executive Overview Grid (Always Preserves Card Boundaries) */}
      <div className="grid gap-3 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <LineChartCard
          title={t('revenueTrend')}
          data={trend}
          fields={[{ key: 'revenue', name: t('revenue'), color: '#4f46e5', currency: true }]}
        />
        <Card>
          <CardHeader className="px-3 py-2">
            <CardTitle className="text-sm">{t('platform')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 px-3 pb-3">
            {platformData.length && currentCount > 0 ? (
              platformData.map(item => {
                const share = totals.revenue !== null && totals.revenue > 0 && item.revenue !== null
                  ? Math.min(100, Math.max(0, (item.revenue / totals.revenue) * 100))
                  : null
                return (
                  <div key={item.name} className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="truncate font-medium">{item.name}</span>
                      <span className="shrink-0 text-right">
                        {display(item.revenue, 'currency')}
                        {share !== null ? ' (' + share.toFixed(1) + '%)' : ''}
                      </span>                    </div>
                    {share !== null && (
                      <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full rounded-full bg-indigo-600" style={{ width: share + '%' }} />
                      </div>
                    )}
                    <p className="text-[10px] text-slate-500">{item.count} {t('reportCount')}</p>
                  </div>
                )
              })
            ) : (
              <p className="py-6 text-center text-sm text-slate-500">{t('noConfirmedData')}</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-3 xl:grid-cols-2">
        <BarChartCard
          title={t('revenueByBrand')}
          data={currentCount > 0 ? dimensionData('brand') : []}
          fields={[{ key: 'revenue', name: t('revenue'), color: '#4f46e5', currency: true }]}
        />
        <BarChartCard
          title={t('revenueByCampaign')}
          data={currentCount > 0 ? dimensionData('campaign') : []}
          fields={[{ key: 'revenue', name: t('revenue'), color: '#2563eb', currency: true }]}
        />
      </div>

      {/* 3. Detailed Confirmed Reports Table */}
      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
        <h3 className="border-b px-4 py-3 text-sm font-semibold">
          {t('viewDetails')} · {currentCount}
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                {(['finalReport', 'brand', 'platform', 'date', 'revenue', 'orders', 'ctr', 'actions'] as const).map(key => (
                  <th key={key} className="px-3 py-2 font-medium">{t(key)}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {visibleReports.length > 0 ? (
                visibleReports.map(report => {
                  const shift = shiftById.get(report.shift_id)
                  return (
                    <tr key={report.id}>
                      <td className="px-3 py-3">
                        <strong>{shift?.title ?? report.id}</strong>
                        <p className="mt-1 text-slate-400">{report.id}</p>
                      </td>
                      <td className="px-3 py-3">{brands.find(b => b.id === shift?.brand_id)?.name ?? '—'}</td>
                      <td className="px-3 py-3">{platforms.find(p => p.id === shift?.platform_id)?.name ?? '—'}</td>
                      <td className="px-3 py-3">{shift?.date ?? '—'}</td>
                      <td className="px-3 py-3 font-semibold">{display(reportMetricValue(report, 'revenue'), 'currency')}</td>
                      <td className="px-3 py-3">{display(reportMetricValue(report, 'orders'))}</td>
                      <td className="px-3 py-3">{display(reportMetricValue(report, 'ctr'), '%')}</td>
                      <td className="px-3 py-3">
                        <Button
                          size="icon-sm"
                          variant="ghost"
                          title={t('viewDetails')}
                          onClick={() => {
                            void Promise.all([
                              reportService.getById(report.id),
                              shiftRegistrationService.getForShift(report.shift_id)
                            ]).then(([full, related]) => {
                              if (full) {
                                setRegistrations(related)
                                setSelectedReport(full)
                              }
                            }).catch(setLoadError)
                          }}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  )
                })
              ) : (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-xs text-slate-400">
                    {t('noConfirmedData')}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <HistoryPagination
          page={safePage}
          pageSize={pageSize}
          total={pageResult?.total ?? 0}
          onPageChange={setPage}
          onPageSizeChange={list.setPageSize}
        />
      </section>

      {/* 4. Staff Workload & Host Performance Breakdown */}
      <details className="rounded-lg border bg-white p-3">
        <summary className="cursor-pointer text-sm font-semibold">
          {t('staffWorkload')} · {t('hostPerformance')}
        </summary>
        <div className="mt-3 grid gap-3 xl:grid-cols-2">
          <BarChartCard
            title={t('staffWorkload')}
            data={currentCount > 0 ? workload : []}
            fields={[
              { key: 'host', name: t('host'), color: '#2563eb' },
              { key: 'support', name: t('support'), color: '#10b981' },
              { key: 'technical', name: t('technical'), color: '#7c3aed' }
            ]}
          />
          <BarChartCard
            title={t('hostPerformance')}
            data={currentCount > 0 ? hostPerformance : []}
            fields={[{ key: 'revenue', name: t('revenue'), color: '#4f46e5', currency: true }]}
          />
        </div>
      </details>

      {/* 5. Additional Operational Trends Breakdown */}
      <details className="rounded-lg border bg-white p-3">
        <summary className="cursor-pointer text-sm font-semibold">
          {t('ordersTrend')} · {t('viewersTrend')} · {t('conversionTrend')}
        </summary>
        <div className="mt-3 grid gap-3 xl:grid-cols-3">
          <LineChartCard title={t('ordersTrend')} data={currentCount > 0 ? trend : []} fields={[{ key: 'orders', name: t('orders'), color: '#2563eb' }]} />
          <LineChartCard title={t('viewersTrend')} data={currentCount > 0 ? trend : []} fields={[{ key: 'viewers', name: t('viewers'), color: '#7c3aed' }]} />
          <LineChartCard title={t('conversionTrend')} data={currentCount > 0 ? trend : []} fields={[{ key: 'ctr', name: t('ctr'), color: '#ea580c' }, { key: 'cvr', name: t('cvr'), color: '#0891b2' }]} />
        </div>
      </details>

      {selectedReport && selectedShift && (
        <ReportDetailModal
          open
          report={selectedReport}
          shift={selectedShift}
          brands={brands}
          platforms={platforms}
          campaigns={campaigns}
          users={users}
          registrations={registrations}
          onOpenChange={open => !open && setSelectedReport(null)}
          onUpdated={() => { void loadData(); void list.reload(); setSelectedReport(null) }}
        />
      )}
    </div>
  )
}

function FilterSelect({ label, value, options, onChange }: { label: string; value: string[]; options: Array<{ id: string; name: string }>; onChange: (value: string[]) => void }) {
  return <MultiSelectFilter label={label} value={value} onChange={onChange} options={options.map(option => ({ value: option.id, label: option.name }))} />
}

function Metric({ title, value, note }: { title: string; value: string; note: string }) {
  return (
    <div className="min-w-0 border-r border-slate-200 px-3 py-2 last:border-r-0">
      <p className="truncate text-[11px] font-medium text-slate-500">{title}</p>
      <p className="mt-0.5 truncate text-base font-semibold">{value}</p>
      <p className="mt-0.5 truncate text-[10px] text-slate-400">{note}</p>
    </div>
  )
}

type ChartField = { key: string; name: string; color: string; currency?: boolean }
const chartValue = (value: number | string, key: string, fields: ChartField[]) =>
  fields.find(field => field.key === key)?.currency ? formatCurrency(Number(value)) : value

function LineChartCard({ title, data, fields }: { title: string; data: Array<Record<string, string | number | null>>; fields: ChartField[] }) {
  return (
    <Card>
      <CardHeader className="px-3 py-2"><CardTitle className="text-sm">{title}</CardTitle></CardHeader>
      <CardContent className="h-48 px-2 pb-2">
        {data.length ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 12, right: 16, bottom: 8, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="period" minTickGap={24} tick={{ fontSize: 11 }} tickMargin={8} interval="preserveStartEnd" />
              <YAxis width={80} tick={{ fontSize: 11 }} tickMargin={8} tickFormatter={value => formatChartAxis(Number(value), fields.every(field => field.currency))} />
              <Tooltip formatter={(value, _name, item) => [chartValue(value as number | string, String(item.dataKey), fields), item.name]} />
              <Legend />
              {fields.map(field => <Line key={field.key} type="monotone" dataKey={field.key} name={field.name} stroke={field.color} />)}
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">—</div>
        )}
      </CardContent>
    </Card>
  )
}

function BarChartCard({ title, data, fields }: { title: string; data: Array<Record<string, string | number | null>>; fields: ChartField[] }) {
  return (
    <Card>
      <CardHeader className="px-3 py-2"><CardTitle className="text-sm">{title}</CardTitle></CardHeader>
      <CardContent className="h-48 px-2 pb-2">
        {data.length ? (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 12, right: 16, bottom: 8, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" tickFormatter={formatDimensionTick} tick={{ fontSize: 11 }} tickMargin={8} height={48} angle={-20} textAnchor="end" interval="preserveStartEnd" />
              <YAxis width={80} tick={{ fontSize: 11 }} tickMargin={8} tickFormatter={value => formatChartAxis(Number(value), fields.every(field => field.currency))} />
              <Tooltip formatter={(value, _name, item) => [chartValue(value as number | string, String(item.dataKey), fields), item.name]} />
              <Legend />
              {fields.map(field => <Bar key={field.key} dataKey={field.key} name={field.name} fill={field.color} />)}
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">—</div>
        )}
      </CardContent>
    </Card>
  )
}