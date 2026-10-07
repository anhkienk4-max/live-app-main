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
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { brandService, campaignService, isStaffedRegistration, platformService, reportService, shiftRegistrationService, shiftService, userService } from '@/lib/services/dataService'
import { Brand, Campaign, OperationalRole, Platform, Report, Shift, ShiftRegistration, User } from '@/lib/types/database.types'
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
import { PageLoadError } from '@/components/ui/page-load-error'
import { addDateOnlyDays, calculateNullableAnalyticsMetrics, reportMetricValue, resolveAnalyticsDateRange, startOfBusinessWeek } from '@/lib/utils/analytics'
import { matchesMultiSelect } from '@/lib/utils/multiSelectFilter'
import { MultiSelectFilter } from '@/components/ui/multi-select-filter'

type RangeKey = 'today' | 'yesterday' | '7d' | '30d' | 'thisMonth' | 'lastMonth' | 'custom'
type Filters = { range: RangeKey; start: string; end: string; brandIds: string[]; platformIds: string[]; campaignIds: string[]; hostIds: string[]; supportIds: string[]; technicalIds: string[] }
type MetricKey = 'revenue' | 'gmv' | 'orders' | 'viewers' | 'productClicks' | 'ctr' | 'cvr' | 'averageOrderValue' | 'liveDuration' | 'reportCount'
const addRange = (range: Exclude<RangeKey, 'custom'>) => resolveAnalyticsDateRange(range)
const initialFilters = (): Filters => ({ range: '30d', ...addRange('30d'), brandIds: [], platformIds: [], campaignIds: [], hostIds: [], supportIds: [], technicalIds: [] })

export function DashboardAnalytics() {
  const { t } = useTranslation()
  const { currentUser } = useCurrentUser()
  const [selectedReport, setSelectedReport] = React.useState<Report | null>(null)
  const [page, setPage] = React.useState(1)
  const [pageSize, setPageSize] = React.useState(10)
  const [compare, setCompare] = React.useState(false)
  const [reports, setReports] = React.useState<Report[]>([])
  const [shifts, setShifts] = React.useState<Shift[]>([])
  const [brands, setBrands] = React.useState<Brand[]>([])
  const [platforms, setPlatforms] = React.useState<Platform[]>([])
  const [campaigns, setCampaigns] = React.useState<Campaign[]>([])
  const [users, setUsers] = React.useState<User[]>([])
  const [registrations, setRegistrations] = React.useState<ShiftRegistration[]>([])
  const [filters, setFilters] = React.useState<Filters | null>(() => initialFilters())
  const [showFilters, setShowFilters] = React.useState(false)
  const [loading, setLoading] = React.useState(true)
  const [loadError, setLoadError] = React.useState<unknown>(null)

  const loadData = React.useCallback(async () => {
    setLoadError(null)
    try {
      const [loadedReports, loadedShifts, loadedBrands, loadedPlatforms, loadedCampaigns, loadedUsers, loadedRegistrations] = await Promise.all([
        reportService.getConfirmed(), shiftService.getAll(), brandService.getAll(), platformService.getAll(), campaignService.getAll(), userService.getAll(), shiftRegistrationService.getAll(),
      ])
      setReports(loadedReports.filter(report => report.status === 'confirmed' && report.metrics_confirmed === true)); setShifts(loadedShifts); setBrands(loadedBrands); setPlatforms(loadedPlatforms); setCampaigns(loadedCampaigns); setUsers(loadedUsers); setRegistrations(loadedRegistrations)
    } catch (error) {
      setLoadError(error)
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    // Initial data hydration intentionally updates the loading/data state from the async callback.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadData()
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
  const matches = (shift: Shift, start: string, end: string) =>
    shift.date >= start && shift.date <= end &&
    matchesMultiSelect(shift.brand_id, filters.brandIds) &&
    matchesMultiSelect(shift.platform_id, filters.platformIds) &&
    matchesMultiSelect(shift.campaign_id, filters.campaignIds) &&
    (filters.hostIds.length === 0 || filters.hostIds.some(userId => matchesRole(shift, 'host', userId))) &&
    (filters.supportIds.length === 0 || filters.supportIds.some(userId => matchesRole(shift, 'support', userId))) &&
    (filters.technicalIds.length === 0 || filters.technicalIds.some(userId => matchesRole(shift, 'technical', userId)))
  const currentShifts = shifts.filter(shift => matches(shift, filters.start, filters.end))
  const currentIds = new Set(currentShifts.map(shift => shift.id))
  const currentReports = reports.filter(report => currentIds.has(report.shift_id))
  const periodDays = Math.max(1, Math.round((Date.parse(`${filters.end}T00:00:00Z`) - Date.parse(`${filters.start}T00:00:00Z`)) / 86400000) + 1)
  const previousEnd = addDateOnlyDays(filters.start, -1)
  const previousStart = addDateOnlyDays(previousEnd, -(periodDays - 1))
  const previousIds = new Set(shifts.filter(shift => matches(shift, previousStart, previousEnd)).map(shift => shift.id))
  const previousReports = reports.filter(report => previousIds.has(report.shift_id))
  const aggregation = periodDays <= 31 ? 'daily' : periodDays <= 120 ? 'weekly' : 'monthly'
  const bucketFor = (date: string) => aggregation === 'daily' ? date : aggregation === 'weekly' ? startOfBusinessWeek(date) : date.slice(0, 7)
  const shiftById = new Map(shifts.map(shift => [shift.id, shift]))

  const totals = calculateNullableAnalyticsMetrics(currentReports)
  const previous = calculateNullableAnalyticsMetrics(previousReports)
  const delta = (key: MetricKey) => {
    const before = previous[key], after = totals[key]
    return before == null || after == null || before === 0 ? '—' : (((after - before) / before) * 100).toFixed(1) + '%'
  }
  const byBucket = new Map<string, Report[]>()
  for (const report of currentReports) {
    const shift = shiftById.get(report.shift_id)
    if (!shift) continue
    const bucket = bucketFor(shift.date)
    byBucket.set(bucket, [...(byBucket.get(bucket) ?? []), report])
  }
  const trend = [...byBucket].sort(([a],[b]) => a.localeCompare(b)).map(([period, items]) => ({ period, ...calculateNullableAnalyticsMetrics(items) }))
  const dimensionData = (dimension: 'brand' | 'platform' | 'campaign') => {
    const groups = new Map<string, Report[]>()
    for (const report of currentReports) {
      const shift = shiftById.get(report.shift_id)
      if (!shift) continue
      const id = dimension === 'brand' ? shift.brand_id : dimension === 'platform' ? shift.platform_id : shift.campaign_id
      const items = dimension === 'brand' ? brands : dimension === 'platform' ? platforms : campaigns
      const name = items.find(item => item.id === id)?.name ?? '—'
      groups.set(name, [...(groups.get(name) ?? []), report])
    }
    return [...groups].map(([name,items]) => ({ name, revenue: calculateNullableAnalyticsMetrics(items).revenue, count: items.length })).sort((a,b) => (b.revenue ?? -Infinity) - (a.revenue ?? -Infinity))
  }
  const workloadCount = (userId: string, role: OperationalRole) => currentShifts.filter(shift => matchesRole(shift, role, userId)).length
  const workload = users.map(user => ({ name: user.full_name, host: workloadCount(user.id, 'host'), support: workloadCount(user.id, 'support'), technical: workloadCount(user.id, 'technical') })).filter(row => row.host + row.support + row.technical > 0)
  const hostPerformance = users.filter(user => user.operational_roles?.includes('host')).map(user => ({ name: user.full_name, revenue: calculateNullableAnalyticsMetrics(currentReports.filter(report => { const shift = shiftById.get(report.shift_id); return Boolean(shift && matchesRole(shift, 'host', user.id)) })).revenue })).filter(row => row.revenue !== null)
  const updateRange = (range: RangeKey) => { setPage(1); setFilters(current => current ? { ...current, range, ...(range === 'custom' ? {} : addRange(range)) } : current) }
  const roleOptions = (role: OperationalRole) => users.filter(user => user.operational_roles?.includes(role)).map(user => ({ id: user.id, name: user.full_name }))
  const display = (value: number | null, unit = '') => value === null ? '—' : unit === 'currency' ? formatCurrency(value) : value.toLocaleString(undefined,{maximumFractionDigits:2}) + unit
  const metricDefinitions: Array<{ key: MetricKey; unit: string; source: string }> = [
    {key:'revenue',unit:'currency',source:'SUM revenue'}, {key:'gmv',unit:'currency',source:'SUM gmv'}, {key:'orders',unit:'',source:'SUM orders'},
    {key:'viewers',unit:'',source:'SUM engaged viewers'}, {key:'productClicks',unit:'',source:'SUM product clicks'}, {key:'ctr',unit:'%',source:'AVG reported CTR'},
    {key:'cvr',unit:'%',source:'AVG reported conversion rate'}, {key:'averageOrderValue',unit:'currency',source:'Revenue / orders with both metrics present'},
    {key:'liveDuration',unit:' '+t('minuteShort'),source:'SUM reported live duration'}, {key:'reportCount',unit:'',source:'COUNT confirmed reports'}
  ]
  const primaryMetricKeys: MetricKey[] = ['revenue', 'orders', 'viewers', 'ctr', 'reportCount']
  const primaryMetrics = metricDefinitions.filter(metric => primaryMetricKeys.includes(metric.key))
  const secondaryMetrics = metricDefinitions.filter(metric => !primaryMetricKeys.includes(metric.key))
  const safePage = Math.min(page, Math.max(1, Math.ceil(currentReports.length / pageSize)))
  const visibleReports = currentReports.slice((safePage - 1) * pageSize, safePage * pageSize)
  const selectedShift = selectedReport ? shiftById.get(selectedReport.shift_id) : undefined
  const platformData = dimensionData('platform')
  return <div className="min-w-0 space-y-4 text-slate-900">
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2"><p className="flex items-center gap-1.5 text-xs text-emerald-700"><ShieldCheck className="h-3.5 w-3.5" />{t('confirmedOnly')} · {currentReports.length} {t('reportCount')}</p><div className="flex gap-2"><Button size="sm" variant={compare ? 'default' : 'outline'} onClick={() => setCompare(!compare)}>{t('previousPeriod')}</Button>{currentUser && hasPermission(currentUser,'reports.export') && <Button size="sm" variant="outline" onClick={() => exportReportsToExcel(currentReports,{shifts, campaigns, users, registrations, brands:new Map(brands.map(b=>[b.id,b.name])), platforms:new Map(platforms.map(p=>[p.id,p.name]))})}><Download className="mr-2 h-4 w-4" />{t('exportExcel')}</Button>}<Button size="sm" variant={showFilters ? 'default' : 'outline'} onClick={() => setShowFilters(!showFilters)} aria-expanded={showFilters} aria-controls="analytics-filter-panel"><Filter className="mr-2 h-4 w-4" />{t('filters')}</Button></div></div>
    {showFilters && <section id="analytics-filter-panel" className="space-y-3 rounded-lg border border-slate-200 bg-white p-3">
      <div className="grid gap-3 md:grid-cols-4"><label className="text-xs font-medium">{t('dateRange')}<Select value={filters.range} onValueChange={value => updateRange(value as RangeKey)}><SelectTrigger className="mt-1 w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="today">{t('today')}</SelectItem><SelectItem value="yesterday">{t('yesterday')}</SelectItem><SelectItem value="7d">{t('last7Days')}</SelectItem><SelectItem value="30d">{t('last30Days')}</SelectItem><SelectItem value="thisMonth">{t('thisMonth')}</SelectItem><SelectItem value="lastMonth">{t('lastMonth')}</SelectItem><SelectItem value="custom">{t('customRange')}</SelectItem></SelectContent></Select></label>{filters.range === 'custom' && <><label className="text-xs font-medium">{t('startDate')}<Input className="mt-1" type="date" value={filters.start} onChange={event => setFilters(current => current ? { ...current, start: event.target.value } : current)} /></label><label className="text-xs font-medium">{t('endDate')}<Input className="mt-1" type="date" value={filters.end} onChange={event => setFilters(current => current ? { ...current, end: event.target.value } : current)} /></label></>}</div>
      <div className="grid gap-3 md:grid-cols-3"><FilterSelect label={t('brand')} value={filters.brandIds} options={brands} onChange={value => setFilters(current => current ? { ...current, brandIds: value } : current)} /><FilterSelect label={t('platform')} value={filters.platformIds} options={platforms} onChange={value => setFilters(current => current ? { ...current, platformIds: value } : current)} /><FilterSelect label={t('campaign')} value={filters.campaignIds} options={campaigns} onChange={value => setFilters(current => current ? { ...current, campaignIds: value } : current)} /><FilterSelect label={t('host')} value={filters.hostIds} options={roleOptions('host')} onChange={value => setFilters(current => current ? { ...current, hostIds: value } : current)} /><FilterSelect label={t('support')} value={filters.supportIds} options={roleOptions('support')} onChange={value => setFilters(current => current ? { ...current, supportIds: value } : current)} /><FilterSelect label={t('technical')} value={filters.technicalIds} options={roleOptions('technical')} onChange={value => setFilters(current => current ? { ...current, technicalIds: value } : current)} /></div>
      <Button variant="outline" onClick={() => setFilters(initialFilters())}><RotateCcw className="mr-2 h-4 w-4" />{t('resetFilters')}</Button>
    </section>}
    <div className="grid grid-cols-2 overflow-hidden rounded-lg border border-slate-200 bg-white sm:grid-cols-3 lg:grid-cols-5">{primaryMetrics.map(metric => <Metric key={metric.key} title={t(metric.key === 'revenue' ? 'confirmedRevenue' : metric.key)} value={display(totals[metric.key],metric.unit)} note={compare ? delta(metric.key)+' '+t('previousPeriod') : metric.source} />)}</div>
    <details className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs"><summary className="cursor-pointer font-semibold">{t('additionalMetricsAndFormulas')}</summary><div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{secondaryMetrics.map(metric => <Metric key={metric.key} title={t(metric.key)} value={display(totals[metric.key],metric.unit)} note={compare ? delta(metric.key)+' '+t('previousPeriod') : metric.source} />)}</div><div className="mt-3 grid gap-2 border-t pt-3 sm:grid-cols-2 lg:grid-cols-4">{metricDefinitions.map(metric => <div key={metric.key}><strong>{t(metric.key)}</strong><p className="text-slate-500">{metric.source}</p></div>)}</div><p className="mt-2 text-slate-500">Không có dữ liệu: —. Chỉ số bằng 0 vẫn được giữ nguyên.</p></details>
    {!currentReports.length ? <div className="rounded-lg border bg-white p-10 text-center text-sm text-slate-500">{t('noConfirmedData')}</div> : <>
      <div className="grid gap-3 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]"><LineChartCard title={t('revenueTrend')} data={trend} fields={[{key:'revenue',name:t('revenue'),color:'#4f46e5',currency:true}]} /><Card><CardHeader><CardTitle>{t('platform')}</CardTitle></CardHeader><CardContent className="h-56"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={platformData} dataKey="count" nameKey="name" innerRadius={48} outerRadius={72}>{platformData.map((item,index)=><Cell key={item.name} fill={['#4f46e5','#2563eb','#10b981','#f59e0b'][index%4]} />)}</Pie><Tooltip /><Legend /></PieChart></ResponsiveContainer></CardContent></Card></div>
      <div className="grid gap-3 xl:grid-cols-2"><BarChartCard title={t('revenueByBrand')} data={dimensionData('brand')} fields={[{key:'revenue',name:t('revenue'),color:'#4f46e5',currency:true}]} /><BarChartCard title={t('revenueByCampaign')} data={dimensionData('campaign')} fields={[{key:'revenue',name:t('revenue'),color:'#2563eb',currency:true}]} /></div>
      <section className="overflow-hidden rounded-lg border border-slate-200 bg-white"><h3 className="border-b px-4 py-3 text-sm font-semibold">{t('viewDetails')} · {currentReports.length}</h3><div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead className="bg-slate-50 text-slate-500"><tr>{(['finalReport','brand','platform','date','revenue','orders','ctr','actions'] as const).map(key=><th key={key} className="px-3 py-2 font-medium">{t(key)}</th>)}</tr></thead><tbody className="divide-y">{visibleReports.map(report=>{const shift=shiftById.get(report.shift_id); return <tr key={report.id}><td className="px-3 py-3"><strong>{shift?.title ?? report.id}</strong><p className="mt-1 text-slate-400">{report.id}</p></td><td className="px-3 py-3">{brands.find(b=>b.id===shift?.brand_id)?.name ?? '—'}</td><td className="px-3 py-3">{platforms.find(p=>p.id===shift?.platform_id)?.name ?? '—'}</td><td className="px-3 py-3">{shift?.date ?? '—'}</td><td className="px-3 py-3 font-semibold">{display(reportMetricValue(report,'revenue'),'currency')}</td><td className="px-3 py-3">{display(reportMetricValue(report,'orders'))}</td><td className="px-3 py-3">{display(reportMetricValue(report,'ctr'),'%')}</td><td className="px-3 py-3"><Button size="icon-sm" variant="ghost" title={t('viewDetails')} onClick={()=>setSelectedReport(report)}><Eye className="h-4 w-4" /></Button></td></tr>})}</tbody></table></div><HistoryPagination page={safePage} pageSize={pageSize} total={currentReports.length} onPageChange={setPage} onPageSizeChange={size=>{setPageSize(size);setPage(1)}} /></section>
      <details className="rounded-lg border bg-white p-3"><summary className="cursor-pointer text-sm font-semibold">{t('staffWorkload')} · {t('hostPerformance')}</summary><div className="mt-3 grid gap-3 xl:grid-cols-2"><BarChartCard title={t('staffWorkload')} data={workload} fields={[{key:'host',name:t('host'),color:'#2563eb'},{key:'support',name:t('support'),color:'#10b981'},{key:'technical',name:t('technical'),color:'#7c3aed'}]} /><BarChartCard title={t('hostPerformance')} data={hostPerformance} fields={[{key:'revenue',name:t('revenue'),color:'#4f46e5',currency:true}]} /></div></details>
      <details className="rounded-lg border bg-white p-3"><summary className="cursor-pointer text-sm font-semibold">{t('ordersTrend')} · {t('viewersTrend')} · {t('conversionTrend')}</summary><div className="mt-3 grid gap-3 xl:grid-cols-3"><LineChartCard title={t('ordersTrend')} data={trend} fields={[{key:'orders',name:t('orders'),color:'#2563eb'}]} /><LineChartCard title={t('viewersTrend')} data={trend} fields={[{key:'viewers',name:t('viewers'),color:'#7c3aed'}]} /><LineChartCard title={t('conversionTrend')} data={trend} fields={[{key:'ctr',name:t('ctr'),color:'#ea580c'},{key:'cvr',name:t('cvr'),color:'#0891b2'}]} /></div></details>
    </>}
    {selectedReport && selectedShift && <ReportDetailModal open report={selectedReport} shift={selectedShift} brands={brands} platforms={platforms} campaigns={campaigns} users={users} registrations={registrations} onOpenChange={open=>!open&&setSelectedReport(null)} onUpdated={()=>{void loadData();setSelectedReport(null)}} />}
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
