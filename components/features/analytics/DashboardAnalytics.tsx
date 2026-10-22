'use client'

import * as React from 'react'
import { Filter, RotateCcw, ShieldCheck, Download, Eye } from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
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
import { MultiSelectFilter } from '@/components/ui/multi-select-filter'
import { usePagedList } from '@/lib/hooks/usePagedList'
import { getOperationalReferences } from '@/lib/services/operationalReferences'

type RangeKey = 'today' | 'yesterday' | '7d' | '30d' | 'thisMonth' | 'lastMonth' | 'custom'
type Filters = { range: RangeKey; start: string; end: string; brandIds: string[]; platformIds: string[]; campaignIds: string[]; hostIds: string[]; supportIds: string[]; technicalIds: string[] }
type MetricKey = 'revenue' | 'gmv' | 'orders' | 'viewers' | 'productClicks' | 'ctr' | 'cvr' | 'averageOrderValue' | 'liveDuration' | 'reportCount'
const addRange = (range: Exclude<RangeKey, 'custom'>) => resolveAnalyticsDateRange(range)
const initialFilters = (): Filters => ({ range: '30d', ...addRange('30d'), brandIds: [], platformIds: [], campaignIds: [], hostIds: [], supportIds: [], technicalIds: [] })
const analyticsList = { getPage: reportService.getAnalyticsPage }

export function DashboardAnalytics() {
  const { t } = useTranslation()
  const {toast}=useToast()
  const { currentUser } = useCurrentUser()
  const identity=currentUser?currentUser.id+':'+(currentUser.system_permission??currentUser.role):''
  const [loadedKey,setLoadedKey]=React.useState('')
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
  const snapshotFilters = filters ? { from: filters.start, to: filters.end, brandIds: filters.brandIds, platformIds: filters.platformIds, campaignIds: filters.campaignIds, hostIds: filters.hostIds, supportIds: filters.supportIds, technicalIds: filters.technicalIds } : {}
  const filtersKey = JSON.stringify(snapshotFilters)
  const list = usePagedList<Report>(analyticsList, 'analytics_reports', { ...snapshotFilters, reportStatuses: ['confirmed'], metricsStatuses: ['confirmed'] })
  const pageResult = (list.refreshing ? undefined : list.result) as Awaited<ReturnType<typeof reportService.getAnalyticsPage>> | undefined
  const setFilters: typeof setFiltersRaw = action => { setFiltersRaw(action); list.reset() }
  const setPage = list.setPage
  const pageSize = list.pageSize

  const exportComplete=async()=>{
    if(!filters||!currentUser||!hasPermission(currentUser,'reports.export'))return
    try {
      const complete=await reportService.getAllFiltered({from:filters.start,to:filters.end,brandIds:filters.brandIds,platformIds:filters.platformIds,campaignIds:filters.campaignIds,
        hostIds:filters.hostIds,supportIds:filters.supportIds,technicalIds:filters.technicalIds,reportStatuses:['confirmed'],metricsStatuses:['confirmed']})
      const shifts=await shiftService.getAllFiltered({from:filters.start,to:filters.end,brandIds:filters.brandIds,platformIds:filters.platformIds,campaignIds:filters.campaignIds,
        hostIds:filters.hostIds,supportIds:filters.supportIds,technicalIds:filters.technicalIds})
      const exportRegistrations=await shiftRegistrationService.getForShifts(shifts.map(shift=>shift.id))
      exportReportsToExcel(complete,{shifts,campaigns,users,registrations:exportRegistrations,brands:new Map(brands.map(b=>[b.id,b.name])),platforms:new Map(platforms.map(p=>[p.id,p.name]))})
    } catch(error) {toast({title:t('error'),description:error instanceof Error?error.message:t('validationError'),variant:'destructive'})}
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
    return () => {
      requestVersion.current+=1
      activeRequest.current?.abort()
      activeRequest.current=null
    }
  }, [loadData])

  if (loadError || list.error) return <PageLoadError error={loadError ?? list.error} onRetry={() => { setLoading(true); void loadData(); void list.reload() }} />

  if (loading || !filters || !snapshot || loadedKey!==identity+':'+filtersKey || list.loading || list.refreshing) {
    return (
      <div className="space-y-4" data-testid="analytics-loading-shell">
        <div className="flex flex-col gap-2 rounded-lg border bg-white px-4 py-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-lg font-semibold">{t('analytics') || 'Phân tích & Hiệu suất'}</h1>
            <p className="text-xs text-muted-foreground">{t('analyticsSubtitle') || 'Theo dõi doanh thu và hiệu suất ca livestream'}</p>
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
          <p className="text-xs text-muted-foreground">{t('loading') || 'Đang tải dữ liệu phân tích...'}</p>
        </div>
      </div>
    )
  }

  const totals = snapshot.totals
  const previous = snapshot.previous
  const currentCount = totals.reportCount ?? 0
  const shiftById = new Map((pageResult?.shifts ?? []).map(shift => [shift.id, shift]))
  const delta = (key: MetricKey) => {
    const before = previous[key], after = totals[key]
    return before == null || after == null || before === 0 ? '—' : (((after - before) / before) * 100).toFixed(1) + '%'
  }
  const trend = snapshot.trend
  const dimensionData = (dimension: 'brand' | 'platform' | 'campaign') => {
    const items = dimension === 'brand' ? brands : dimension === 'platform' ? platforms : campaigns
    const rows = dimension === 'brand' ? snapshot.brands : dimension === 'platform' ? snapshot.platforms : snapshot.campaigns
    const groups = new Map<string, { name: string; revenue: number | null; count: number }>()
    for (const row of rows) {
      const name = items.find(item => item.id === row.id)?.name ?? '—'
      const previous = groups.get(name)
      groups.set(name, { name, revenue: row.revenue === null ? previous?.revenue ?? null : (previous?.revenue ?? 0) + row.revenue, count: (previous?.count ?? 0) + (row.reportCount ?? 0) })
    }
    return [...groups.values()].sort((a,b) => (b.revenue ?? -Infinity) - (a.revenue ?? -Infinity))
  }
  const userMap = new Map(users.map(user => [user.id, user]))
  const workload = snapshot.workload.filter(row => userMap.has(row.user_id)).map(row => ({ name: userMap.get(row.user_id)!.full_name, host: row.host, support: row.support, technical: row.technical }))
  const hostPerformance = snapshot.hostPerformance.filter(row => row.revenue !== null && userMap.get(row.user_id)?.operational_roles?.includes('host')).map(row => ({ name: userMap.get(row.user_id)!.full_name, revenue: row.revenue }))
  const updateRange = (range: RangeKey) => { setPage(1); setFilters(current => current ? { ...current, range, ...(range === 'custom' ? {} : addRange(range)) } : current) }
  const roleOptions = (role: OperationalRole) => users.filter(user => user.operational_roles?.includes(role)).map(user => ({ id: user.id, name: user.full_name }))
  const display = (value: number | null, unit = '') => value === null ? '—' : unit === 'currency' ? formatCurrency(value) : value.toLocaleString(undefined,{maximumFractionDigits:2}) + unit
  const metricDefinitions: Array<{ key: MetricKey; unit: string; source: string }> = [
    {key:'revenue',unit:'currency',source:'SUM revenue'}, {key:'gmv',unit:'currency',source:'SUM gmv'}, {key:'orders',unit:'',source:'SUM orders'},
    {key:'viewers',unit:'',source:'SUM engaged viewers'}, {key:'productClicks',unit:'',source:'SUM product clicks'}, {key:'ctr',unit:'%',source:'AVG reported CTR'},
    {key:'cvr',unit:'%',source:'AVG reported conversion rate'}, {key:'averageOrderValue',unit:'currency',source:'Revenue / orders with both metrics present'},
    {key:'liveDuration',unit:' '+t('minuteShort'),source:'SUM reported live duration'}, {key:'reportCount',unit:'',source:'COUNT confirmed reports'}
  ]
  const primaryMetricKeys: MetricKey[] = ['revenue', 'orders', 'averageOrderValue', 'viewers', 'ctr', 'cvr']
  const primaryMetrics = metricDefinitions.filter(metric => primaryMetricKeys.includes(metric.key))
  const secondaryMetrics = metricDefinitions.filter(metric => !primaryMetricKeys.includes(metric.key))
  const safePage = pageResult?.page ?? list.page
  const visibleReports = pageResult?.items ?? []
  const selectedShift = selectedReport ? shiftById.get(selectedReport.shift_id) : undefined
  const platformData = dimensionData('platform')
  return <div className="min-w-0 space-y-3 text-slate-900" data-testid="analytics-ready">
    <header className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 pb-3">
      <div><h1 className="text-xl font-semibold tracking-tight">{t('analyticsTitle')}</h1><p className="mt-1 text-xs text-slate-500">{t('analyticsSubtitle')}</p></div>
      <div className="flex flex-wrap gap-2"><Button size="sm" variant={compare ? 'default' : 'outline'} onClick={() => setCompare(!compare)}>{t('previousPeriod')}</Button>{currentUser && hasPermission(currentUser,'reports.export') && <Button size="sm" variant="outline" onClick={()=>void exportComplete()}><Download className="mr-2 h-4 w-4" />{t('exportExcel')}</Button>}<Button size="sm" variant={showFilters ? 'default' : 'outline'} onClick={() => setShowFilters(!showFilters)} aria-expanded={showFilters} aria-controls="analytics-filter-panel"><Filter className="mr-2 h-4 w-4" />{t('filters')}</Button></div>
    </header>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex flex-wrap gap-1">{(['today', 'yesterday', '7d', '30d', 'thisMonth'] as const).map(range => <Button key={range} size="sm" variant={filters.range === range ? 'secondary' : 'ghost'} onClick={() => updateRange(range)}>{t(range === '7d' ? 'last7Days' : range === '30d' ? 'last30Days' : range)}</Button>)}</div>
      <div className="flex min-w-0 flex-wrap items-center gap-2"><FilterSelect label={t('brand')} value={filters.brandIds} options={brands} onChange={value => setFilters(current => current ? { ...current, brandIds: value } : current)} /><FilterSelect label={t('platform')} value={filters.platformIds} options={platforms} onChange={value => setFilters(current => current ? { ...current, platformIds: value } : current)} /></div>
    </div>
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800"><ShieldCheck className="h-4 w-4 shrink-0" /><span><strong>{t('confirmedOnly')}.</strong> Only confirmed reports with confirmed metrics contribute to these totals.</span><span className="ml-auto whitespace-nowrap font-medium">{currentCount} {t('reportCount')}</span></div>
    {showFilters && <section id="analytics-filter-panel" className="space-y-3 rounded-lg border border-slate-200 bg-white p-3">
      <div className="grid gap-3 md:grid-cols-4"><label className="text-xs font-medium">{t('dateRange')}<Select value={filters.range} onValueChange={value => updateRange(value as RangeKey)}><SelectTrigger className="mt-1 w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="today">{t('today')}</SelectItem><SelectItem value="yesterday">{t('yesterday')}</SelectItem><SelectItem value="7d">{t('last7Days')}</SelectItem><SelectItem value="30d">{t('last30Days')}</SelectItem><SelectItem value="thisMonth">{t('thisMonth')}</SelectItem><SelectItem value="lastMonth">{t('lastMonth')}</SelectItem><SelectItem value="custom">{t('customRange')}</SelectItem></SelectContent></Select></label>{filters.range === 'custom' && <><label className="text-xs font-medium">{t('startDate')}<Input className="mt-1" type="date" value={filters.start} onChange={event => setFilters(current => current ? { ...current, start: event.target.value } : current)} /></label><label className="text-xs font-medium">{t('endDate')}<Input className="mt-1" type="date" value={filters.end} onChange={event => setFilters(current => current ? { ...current, end: event.target.value } : current)} /></label></>}</div>
      <div className="grid gap-3 md:grid-cols-3"><FilterSelect label={t('campaign')} value={filters.campaignIds} options={campaigns} onChange={value => setFilters(current => current ? { ...current, campaignIds: value } : current)} /><FilterSelect label={t('host')} value={filters.hostIds} options={roleOptions('host')} onChange={value => setFilters(current => current ? { ...current, hostIds: value } : current)} /><FilterSelect label={t('support')} value={filters.supportIds} options={roleOptions('support')} onChange={value => setFilters(current => current ? { ...current, supportIds: value } : current)} /><FilterSelect label={t('technical')} value={filters.technicalIds} options={roleOptions('technical')} onChange={value => setFilters(current => current ? { ...current, technicalIds: value } : current)} /></div>
      <Button variant="outline" onClick={() => setFilters(initialFilters())}><RotateCcw className="mr-2 h-4 w-4" />{t('resetFilters')}</Button>
    </section>}
    <div className="grid grid-cols-2 overflow-hidden rounded-lg border border-slate-200 bg-white sm:grid-cols-3 xl:grid-cols-6">{primaryMetrics.map(metric => <Metric key={metric.key} title={t(metric.key === 'revenue' ? 'confirmedRevenue' : metric.key)} value={display(totals[metric.key],metric.unit)} note={compare ? delta(metric.key)+' '+t('previousPeriod') : metric.source} />)}</div>
    {secondaryMetrics.length > 0 && <section className="rounded-lg border border-slate-200 bg-white p-3"><div className="mb-2 text-xs font-semibold text-slate-700">{t('additionalMetricsAndFormulas')}</div><div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">{secondaryMetrics.map(metric => <Metric key={metric.key} title={t(metric.key)} value={display(totals[metric.key],metric.unit)} note={compare ? delta(metric.key)+' '+t('previousPeriod') : metric.source} />)}</div><details className="mt-2 border-t pt-2 text-xs"><summary className="cursor-pointer font-medium">KPI definitions</summary><div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">{metricDefinitions.map(metric => <div key={metric.key}><strong>{t(metric.key)}</strong><p className="text-slate-500">{metric.source}</p></div>)}</div><p className="mt-2 text-slate-500">Missing metrics are shown as —; explicit zero values are preserved.</p></details></section>}
    {!currentCount ? <div className="rounded-lg border bg-white p-10 text-center text-sm text-slate-500">{t('noConfirmedData')}</div> : <>
      <div className="grid gap-3 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]"><LineChartCard title={t('revenueTrend')} data={trend} fields={[{key:'revenue',name:t('revenue'),color:'#4f46e5',currency:true}]} /><Card><CardHeader className="px-3 py-2"><CardTitle className="text-sm">{t('platform')}</CardTitle></CardHeader><CardContent className="space-y-3 px-3 pb-3">{platformData.length ? platformData.map(item => { const share = totals.revenue !== null && totals.revenue > 0 && item.revenue !== null ? Math.min(100, Math.max(0, item.revenue / totals.revenue * 100)) : null; return <div key={item.name} className="space-y-1.5"><div className="flex items-center justify-between gap-2 text-xs"><span className="truncate font-medium">{item.name}</span><span className="shrink-0 text-right">{display(item.revenue, 'currency')}{share !== null ? ` (${share.toFixed(1)}%)` : ''}</span></div>{share !== null && <div className="h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-indigo-600" style={{ width: `${share}%` }} /></div>}<p className="text-[10px] text-slate-500">{item.count} {t('reportCount')}</p></div> }) : <p className="py-6 text-center text-sm text-slate-500">{t('noConfirmedData')}</p>}</CardContent></Card></div>
      <div className="grid gap-3 xl:grid-cols-2"><BarChartCard title={t('revenueByBrand')} data={dimensionData('brand')} fields={[{key:'revenue',name:t('revenue'),color:'#4f46e5',currency:true}]} /><BarChartCard title={t('revenueByCampaign')} data={dimensionData('campaign')} fields={[{key:'revenue',name:t('revenue'),color:'#2563eb',currency:true}]} /></div>
      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white"><h3 className="border-b px-4 py-3 text-sm font-semibold">{t('viewDetails')} · {currentCount}</h3><div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead className="bg-slate-50 text-slate-500"><tr>{(['finalReport','brand','platform','date','revenue','orders','ctr','actions'] as const).map(key=><th key={key} className="px-3 py-2 font-medium">{t(key)}</th>)}</tr></thead><tbody className="divide-y">{visibleReports.map(report=>{const shift=shiftById.get(report.shift_id); return <tr key={report.id}><td className="px-3 py-3"><strong>{shift?.title ?? report.id}</strong><p className="mt-1 text-slate-400">{report.id}</p></td><td className="px-3 py-3">{brands.find(b=>b.id===shift?.brand_id)?.name ?? '—'}</td><td className="px-3 py-3">{platforms.find(p=>p.id===shift?.platform_id)?.name ?? '—'}</td><td className="px-3 py-3">{shift?.date ?? '—'}</td><td className="px-3 py-3 font-semibold">{display(reportMetricValue(report,'revenue'),'currency')}</td><td className="px-3 py-3">{display(reportMetricValue(report,'orders'))}</td><td className="px-3 py-3">{display(reportMetricValue(report,'ctr'),'%')}</td><td className="px-3 py-3"><Button size="icon-sm" variant="ghost" title={t('viewDetails')} onClick={()=>{void Promise.all([reportService.getById(report.id),shiftRegistrationService.getForShift(report.shift_id)]).then(([full,related])=>{if(full){setRegistrations(related);setSelectedReport(full)}}).catch(setLoadError)}}><Eye className="h-4 w-4" /></Button></td></tr>})}</tbody></table></div><HistoryPagination page={safePage} pageSize={pageSize} total={pageResult?.total ?? 0} onPageChange={setPage} onPageSizeChange={list.setPageSize} /></section>
      <details className="rounded-lg border bg-white p-3"><summary className="cursor-pointer text-sm font-semibold">{t('staffWorkload')} · {t('hostPerformance')}</summary><div className="mt-3 grid gap-3 xl:grid-cols-2"><BarChartCard title={t('staffWorkload')} data={workload} fields={[{key:'host',name:t('host'),color:'#2563eb'},{key:'support',name:t('support'),color:'#10b981'},{key:'technical',name:t('technical'),color:'#7c3aed'}]} /><BarChartCard title={t('hostPerformance')} data={hostPerformance} fields={[{key:'revenue',name:t('revenue'),color:'#4f46e5',currency:true}]} /></div></details>
      <details className="rounded-lg border bg-white p-3"><summary className="cursor-pointer text-sm font-semibold">{t('ordersTrend')} · {t('viewersTrend')} · {t('conversionTrend')}</summary><div className="mt-3 grid gap-3 xl:grid-cols-3"><LineChartCard title={t('ordersTrend')} data={trend} fields={[{key:'orders',name:t('orders'),color:'#2563eb'}]} /><LineChartCard title={t('viewersTrend')} data={trend} fields={[{key:'viewers',name:t('viewers'),color:'#7c3aed'}]} /><LineChartCard title={t('conversionTrend')} data={trend} fields={[{key:'ctr',name:t('ctr'),color:'#ea580c'},{key:'cvr',name:t('cvr'),color:'#0891b2'}]} /></div></details>
    </>}
    {selectedReport && selectedShift && <ReportDetailModal open report={selectedReport} shift={selectedShift} brands={brands} platforms={platforms} campaigns={campaigns} users={users} registrations={registrations} onOpenChange={open=>!open&&setSelectedReport(null)} onUpdated={()=>{void loadData();void list.reload();setSelectedReport(null)}} />}
  </div>
}

function FilterSelect({ label, value, options, onChange }: { label: string; value: string[]; options: Array<{ id: string; name: string }>; onChange: (value: string[]) => void }) {
  return <MultiSelectFilter label={label} value={value} onChange={onChange} options={options.map(option => ({ value: option.id, label: option.name }))} />
}
function Metric({ title, value, note }: { title: string; value: string; note: string }) { return <div className="min-w-0 border-r border-slate-200 px-3 py-2 last:border-r-0"><p className="truncate text-[11px] font-medium text-slate-500">{title}</p><p className="mt-0.5 truncate text-base font-semibold">{value}</p><p className="mt-0.5 truncate text-[10px] text-slate-400">{note}</p></div> }
type ChartField = { key: string; name: string; color: string; currency?: boolean }
const chartValue = (value: number | string, key: string, fields: ChartField[]) =>
  fields.find(field => field.key === key)?.currency ? formatCurrency(Number(value)) : value
function LineChartCard({ title, data, fields }: { title: string; data: Array<Record<string, string | number | null>>; fields: ChartField[] }) { return <Card><CardHeader className="px-3 py-2"><CardTitle className="text-sm">{title}</CardTitle></CardHeader><CardContent className="h-48 px-2 pb-2"><ResponsiveContainer width="100%" height="100%"><LineChart data={data} margin={{ top: 12, right: 16, bottom: 8, left: 8 }}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="period" minTickGap={24} tick={{ fontSize: 11 }} tickMargin={8} interval="preserveStartEnd" /><YAxis width={80} tick={{ fontSize: 11 }} tickMargin={8} tickFormatter={value => formatChartAxis(Number(value), fields.every(field => field.currency))} /><Tooltip formatter={(value, _name, item) => [chartValue(value as number | string, String(item.dataKey), fields), item.name]} /><Legend />{fields.map(field => <Line key={field.key} type="monotone" dataKey={field.key} name={field.name} stroke={field.color} />)}</LineChart></ResponsiveContainer></CardContent></Card> }
function BarChartCard({ title, data, fields }: { title: string; data: Array<Record<string, string | number | null>>; fields: ChartField[] }) { return <Card><CardHeader className="px-3 py-2"><CardTitle className="text-sm">{title}</CardTitle></CardHeader><CardContent className="h-48 px-2 pb-2">{data.length ? <ResponsiveContainer width="100%" height="100%"><BarChart data={data} margin={{ top: 12, right: 16, bottom: 8, left: 8 }}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" tickFormatter={formatDimensionTick} tick={{ fontSize: 11 }} tickMargin={8} height={48} angle={-20} textAnchor="end" interval="preserveStartEnd" /><YAxis width={80} tick={{ fontSize: 11 }} tickMargin={8} tickFormatter={value => formatChartAxis(Number(value), fields.every(field => field.currency))} /><Tooltip formatter={(value, _name, item) => [chartValue(value as number | string, String(item.dataKey), fields), item.name]} /><Legend />{fields.map(field => <Bar key={field.key} dataKey={field.key} name={field.name} fill={field.color} />)}</BarChart></ResponsiveContainer> : <div className="flex h-full items-center justify-center text-sm text-muted-foreground">—</div>}</CardContent></Card> }
