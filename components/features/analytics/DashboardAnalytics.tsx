'use client'

import * as React from 'react'
import { BarChart3, Filter, RotateCcw } from 'lucide-react'
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
import { brandService, campaignService, isStaffedRegistration, platformService, reportService, shiftRegistrationService, shiftService, userService } from '@/lib/services/dataService'
import { Brand, Campaign, OperationalRole, Platform, Report, Shift, ShiftRegistration, User } from '@/lib/types/database.types'
import { useTranslation } from '@/lib/i18n'
import { formatCurrency } from '@/lib/utils/currency'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PageLoadError } from '@/components/ui/page-load-error'
import { addDateOnlyDays, calculateAnalyticsMetrics, reportMetric, resolveAnalyticsDateRange, startOfBusinessWeek } from '@/lib/utils/analytics'

type RangeKey = 'today' | 'yesterday' | '7d' | '30d' | 'thisMonth' | 'lastMonth' | 'custom'
type Filters = { range: RangeKey; start: string; end: string; brand: string; platform: string; campaign: string; host: string; support: string; technical: string }
type MetricKey = 'revenue' | 'gmv' | 'orders' | 'viewers' | 'productClicks' | 'ctr' | 'cvr' | 'averageOrderValue' | 'liveDuration' | 'reportCount'
const addRange = (range: Exclude<RangeKey, 'custom'>) => resolveAnalyticsDateRange(range)
const initialFilters = (): Filters => ({ range: '30d', ...addRange('30d'), brand: 'all', platform: 'all', campaign: 'all', host: 'all', support: 'all', technical: 'all' })

export function DashboardAnalytics() {
  const { t } = useTranslation()
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
      setReports(loadedReports); setShifts(loadedShifts); setBrands(loadedBrands); setPlatforms(loadedPlatforms); setCampaigns(loadedCampaigns); setUsers(loadedUsers); setRegistrations(loadedRegistrations)
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
    (filters.brand === 'all' || shift.brand_id === filters.brand) &&
    (filters.platform === 'all' || shift.platform_id === filters.platform) &&
    (filters.campaign === 'all' || shift.campaign_id === filters.campaign) &&
    (filters.host === 'all' || matchesRole(shift, 'host', filters.host)) &&
    (filters.support === 'all' || matchesRole(shift, 'support', filters.support)) &&
    (filters.technical === 'all' || matchesRole(shift, 'technical', filters.technical))
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

  const totals = calculateAnalyticsMetrics(currentReports)
  const previous = calculateAnalyticsMetrics(previousReports)
  const delta = (key: MetricKey) => previous[key] === 0 ? '—' : `${(((totals[key] - previous[key]) / previous[key]) * 100).toFixed(1)}%`

  const trend = Object.entries(currentReports.reduce<Record<string, ReturnType<typeof emptyTrend>>>((result, report) => {
    const shift = shiftById.get(report.shift_id)
    if (!shift) return result
    const bucket = bucketFor(shift.date)
    const row = result[bucket] ??= emptyTrend()
    row.revenue += reportMetric(report, 'revenue')
    row.orders += reportMetric(report, 'orders')
    row.viewers += reportMetric(report, 'engaged_viewers')
    row.ctrTotal += reportMetric(report, 'ctr')
    row.cvrTotal += reportMetric(report, 'conversion_rate')
    row.count += 1
    return result
  }, {})).sort(([left], [right]) => left.localeCompare(right)).map(([period, row]) => ({
    period,
    revenue: row.revenue,
    orders: row.orders,
    viewers: row.viewers,
    ctr: row.count ? row.ctrTotal / row.count : 0,
    cvr: row.count ? row.cvrTotal / row.count : 0,
  }))
  const dimensionData = (dimension: 'brand' | 'platform' | 'campaign') => Object.entries(currentReports.reduce<Record<string, number>>((result, report) => {
    const shift = shiftById.get(report.shift_id)
    if (!shift) return result
    const id = dimension === 'brand' ? shift.brand_id : dimension === 'platform' ? shift.platform_id : shift.campaign_id
    const items = dimension === 'brand' ? brands : dimension === 'platform' ? platforms : campaigns
    const name = items.find(item => item.id === id)?.name || '—'
    result[name] = (result[name] || 0) + reportMetric(report, 'revenue')
    return result
  }, {})).map(([name, revenue]) => ({ name, revenue })).sort((left, right) => right.revenue - left.revenue)
  const workloadCount = (userId: string, role: OperationalRole) => currentShifts.filter(shift => matchesRole(shift, role, userId)).length
  const workload = users.map(user => ({
    name: user.full_name,
    host: workloadCount(user.id, 'host'),
    support: workloadCount(user.id, 'support'),
    technical: workloadCount(user.id, 'technical'),
  })).filter(row => row.host + row.support + row.technical > 0)
  const hostPerformance = users.filter(user => user.operational_roles?.includes('host')).map(user => ({
    name: user.full_name,
    revenue: currentReports.filter(report => {
      const shift = shiftById.get(report.shift_id)
      return Boolean(shift && matchesRole(shift, 'host', user.id))
    }).reduce((sum, report) => sum + reportMetric(report, 'revenue'), 0),
  })).filter(row => row.revenue > 0).sort((left, right) => right.revenue - left.revenue)
  const updateRange = (range: RangeKey) => setFilters(current => current ? { ...current, range, ...(range === 'custom' ? {} : addRange(range)) } : current)
  const roleOptions = (role: 'host' | 'support' | 'technical') => users.filter(user => user.operational_roles?.includes(role)).map(user => ({ id: user.id, name: user.full_name }))

  return <div className="space-y-6">
    <Card><CardHeader className="flex flex-row items-center justify-between space-y-0"><CardTitle className="flex items-center gap-2"><BarChart3 className="h-5 w-5" />{t('confirmedOnly')}</CardTitle><Button variant={showFilters ? 'default' : 'outline'} onClick={() => setShowFilters(!showFilters)} aria-expanded={showFilters} aria-controls="analytics-filter-panel"><Filter className="mr-2 h-4 w-4" />{t('filters')}</Button></CardHeader>{showFilters && <CardContent id="analytics-filter-panel" className="space-y-4">
      <div className="grid gap-3 md:grid-cols-4"><label className="text-xs font-medium">{t('dateRange')}<Select value={filters.range} onValueChange={value => updateRange(value as RangeKey)}><SelectTrigger className="mt-1 w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="today">{t('today')}</SelectItem><SelectItem value="yesterday">{t('yesterday')}</SelectItem><SelectItem value="7d">{t('last7Days')}</SelectItem><SelectItem value="30d">{t('last30Days')}</SelectItem><SelectItem value="thisMonth">{t('thisMonth')}</SelectItem><SelectItem value="lastMonth">{t('lastMonth')}</SelectItem><SelectItem value="custom">{t('customRange')}</SelectItem></SelectContent></Select></label>{filters.range === 'custom' && <><label className="text-xs font-medium">{t('startDate')}<Input className="mt-1" type="date" value={filters.start} onChange={event => setFilters(current => current ? { ...current, start: event.target.value } : current)} /></label><label className="text-xs font-medium">{t('endDate')}<Input className="mt-1" type="date" value={filters.end} onChange={event => setFilters(current => current ? { ...current, end: event.target.value } : current)} /></label></>}</div>
      <div className="grid gap-3 md:grid-cols-3"><FilterSelect label={t('brand')} value={filters.brand} options={brands} onChange={value => setFilters(current => current ? { ...current, brand: value } : current)} /><FilterSelect label={t('platform')} value={filters.platform} options={platforms} onChange={value => setFilters(current => current ? { ...current, platform: value } : current)} /><FilterSelect label={t('campaign')} value={filters.campaign} options={campaigns} onChange={value => setFilters(current => current ? { ...current, campaign: value } : current)} /><FilterSelect label={t('host')} value={filters.host} options={roleOptions('host')} onChange={value => setFilters(current => current ? { ...current, host: value } : current)} /><FilterSelect label={t('support')} value={filters.support} options={roleOptions('support')} onChange={value => setFilters(current => current ? { ...current, support: value } : current)} /><FilterSelect label={t('technical')} value={filters.technical} options={roleOptions('technical')} onChange={value => setFilters(current => current ? { ...current, technical: value } : current)} /></div>
      <Button variant="outline" onClick={() => setFilters(initialFilters())}><RotateCcw className="mr-2 h-4 w-4" />{t('resetFilters')}</Button>
    </CardContent>}</Card>

    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
      <Metric title={t('confirmedRevenue')} value={formatCurrency(totals.revenue)} note={`${delta('revenue')} ${t('previousPeriod')}`} />
      <Metric title={t('gmv')} value={formatCurrency(totals.gmv)} note={`${delta('gmv')} ${t('previousPeriod')}`} />
      <Metric title={t('orders')} value={totals.orders.toLocaleString()} note={`${delta('orders')} ${t('previousPeriod')}`} />
      <Metric title={t('viewers')} value={totals.viewers.toLocaleString()} note={`${delta('viewers')} ${t('previousPeriod')}`} />
      <Metric title={t('productClicks')} value={totals.productClicks.toLocaleString()} note={`${delta('productClicks')} ${t('previousPeriod')}`} />
      <Metric title={t('ctr')} value={`${totals.ctr.toFixed(2)}%`} note={`${delta('ctr')} ${t('previousPeriod')}`} />
      <Metric title={t('cvr')} value={`${totals.cvr.toFixed(2)}%`} note={`${delta('cvr')} ${t('previousPeriod')}`} />
      <Metric title={t('averageOrderValue')} value={formatCurrency(totals.averageOrderValue)} note={`${delta('averageOrderValue')} ${t('previousPeriod')}`} />
      <Metric title={t('liveDuration')} value={`${totals.liveDuration.toLocaleString()} ${t('minuteShort')}`} note={`${delta('liveDuration')} ${t('previousPeriod')}`} />
      <Metric title={t('reportCount')} value={totals.reportCount.toLocaleString()} note={`${delta('reportCount')} ${t('previousPeriod')}`} />
    </div>

    {currentReports.length === 0 ? <Card><CardContent className="py-16 text-center text-muted-foreground">{t('noConfirmedData')}</CardContent></Card> : <div className="grid gap-5 xl:grid-cols-2">
      <LineChartCard title={t('revenueTrend')} data={trend} fields={[{ key: 'revenue', name: t('revenue'), color: '#16a34a', currency: true }]} />
      <LineChartCard title={t('ordersTrend')} data={trend} fields={[{ key: 'orders', name: t('orders'), color: '#2563eb' }]} />
      <LineChartCard title={t('viewersTrend')} data={trend} fields={[{ key: 'viewers', name: t('viewers'), color: '#7c3aed' }]} />
      <LineChartCard title={t('conversionTrend')} data={trend} fields={[{ key: 'ctr', name: t('ctr'), color: '#ea580c' }, { key: 'cvr', name: t('cvr'), color: '#0891b2' }]} />
      <BarChartCard title={t('revenueByBrand')} data={dimensionData('brand')} fields={[{ key: 'revenue', name: t('revenue'), color: '#2563eb', currency: true }]} />
      <BarChartCard title={t('revenueByPlatform')} data={dimensionData('platform')} fields={[{ key: 'revenue', name: t('revenue'), color: '#7c3aed', currency: true }]} />
      <BarChartCard title={t('revenueByCampaign')} data={dimensionData('campaign')} fields={[{ key: 'revenue', name: t('revenue'), color: '#16a34a', currency: true }]} />
      <BarChartCard title={t('staffWorkload')} data={workload} fields={[{ key: 'host', name: t('host'), color: '#2563eb' }, { key: 'support', name: t('support'), color: '#16a34a' }, { key: 'technical', name: t('technical'), color: '#7c3aed' }]} />
      <BarChartCard title={t('hostPerformance')} data={hostPerformance} fields={[{ key: 'revenue', name: t('revenue'), color: '#ea580c', currency: true }]} />
      <BarChartCard title={t('supportWorkload')} data={workload.filter(row => row.support > 0)} fields={[{ key: 'support', name: t('support'), color: '#16a34a' }]} />
      <BarChartCard title={t('technicalWorkload')} data={workload.filter(row => row.technical > 0)} fields={[{ key: 'technical', name: t('technical'), color: '#7c3aed' }]} />
      <BarChartCard title={t('campaignRanking')} data={dimensionData('campaign').slice(0, 10)} fields={[{ key: 'revenue', name: t('revenue'), color: '#dc2626', currency: true }]} />
      <BarChartCard title={t('platformRanking')} data={dimensionData('platform').slice(0, 10)} fields={[{ key: 'revenue', name: t('revenue'), color: '#0891b2', currency: true }]} />
    </div>}
  </div>
}

function emptyTrend() { return { revenue: 0, orders: 0, viewers: 0, ctrTotal: 0, cvrTotal: 0, count: 0 } }
function FilterSelect({ label, value, options, onChange }: { label: string; value: string; options: Array<{ id: string; name: string }>; onChange: (value: string) => void }) {
  const { t } = useTranslation()
  return <label className="text-xs font-medium">{label}<Select value={value} onValueChange={onChange}><SelectTrigger className="mt-1 w-full"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">{t('all')}</SelectItem>{options.map(option => <SelectItem key={option.id} value={option.id}>{option.name}</SelectItem>)}</SelectContent></Select></label>
}
function Metric({ title, value, note }: { title: string; value: string; note: string }) { return <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">{title}</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">{value}</p><p className="mt-1 text-xs text-muted-foreground">{note}</p></CardContent></Card> }
type ChartField = { key: string; name: string; color: string; currency?: boolean }
const chartValue = (value: number | string, key: string, fields: ChartField[]) =>
  fields.find(field => field.key === key)?.currency ? formatCurrency(Number(value)) : value
function LineChartCard({ title, data, fields }: { title: string; data: Array<Record<string, string | number>>; fields: ChartField[] }) { return <Card><CardHeader><CardTitle>{title}</CardTitle></CardHeader><CardContent className="h-72"><ResponsiveContainer width="100%" height="100%"><LineChart data={data}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="period" /><YAxis tickFormatter={value => fields.every(field => field.currency) ? formatCurrency(Number(value)) : String(value)} /><Tooltip formatter={(value, _name, item) => [chartValue(value as number | string, String(item.dataKey), fields), item.name]} /><Legend />{fields.map(field => <Line key={field.key} type="monotone" dataKey={field.key} name={field.name} stroke={field.color} />)}</LineChart></ResponsiveContainer></CardContent></Card> }
function BarChartCard({ title, data, fields }: { title: string; data: Array<Record<string, string | number>>; fields: ChartField[] }) { return <Card><CardHeader><CardTitle>{title}</CardTitle></CardHeader><CardContent className="h-72">{data.length ? <ResponsiveContainer width="100%" height="100%"><BarChart data={data}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="name" /><YAxis tickFormatter={value => fields.every(field => field.currency) ? formatCurrency(Number(value)) : String(value)} /><Tooltip formatter={(value, _name, item) => [chartValue(value as number | string, String(item.dataKey), fields), item.name]} /><Legend />{fields.map(field => <Bar key={field.key} dataKey={field.key} name={field.name} fill={field.color} />)}</BarChart></ResponsiveContainer> : <div className="flex h-full items-center justify-center text-sm text-muted-foreground">—</div>}</CardContent></Card> }
