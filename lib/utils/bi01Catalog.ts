export const BI_METRIC_CATALOG = [
  { key: 'revenue', status: 'SUPPORTED', grain: 'One row per confirmed report; grouped by day/week/month, Brand, Platform, or Campaign.', source: 'get_analytics_snapshot → rc16k_report_metric(revenue): normalized_metrics.revenue, platform_metrics.revenue/sales, then reports.revenue; SUM.', caveat: 'Confirmed report values only. Source field may vary by platform.' },
  { key: 'gmv', status: 'SUPPORTED', grain: 'One row per confirmed report; same dimensions.', source: 'get_analytics_snapshot → normalized_metrics.gmv, platform_metrics.gmv, then reports.gmv; SUM.', caveat: 'Separate from Revenue; no Revenue fallback.' },
  { key: 'orders', status: 'SUPPORTED', grain: 'One row per confirmed report; same dimensions.', source: 'normalized_metrics.orders, platform_metrics.orders, then reports.orders; SUM.', caveat: 'Never substituted for Revenue.' },
  { key: 'viewers', status: 'SUPPORTED', grain: 'One row per confirmed report; same dimensions.', source: 'engaged_viewers from normalized/platform metrics, then reports.viewers/average_viewer; SUM.', caveat: 'Only recorded observations contribute.' },
  { key: 'productClicks', status: 'SUPPORTED', grain: 'One row per confirmed report; same dimensions.', source: 'product_clicks from normalized/platform metrics, then reports.product_clicks; SUM.', caveat: 'Only recorded observations contribute.' },
  { key: 'ctr', status: 'SUPPORTED', grain: 'Report-level percentage grouped by time/Brand/Platform/Campaign.', source: 'CTR observations from normalized/platform metrics, then reports.ctr; AVG of observed reports.', caveat: 'Unweighted report average, not impression-weighted.' },
  { key: 'cvr', status: 'SUPPORTED', grain: 'Report-level percentage grouped by time/Brand/Platform/Campaign.', source: 'conversion_rate observations from normalized/platform metrics, then reports.cvr; AVG of observed reports.', caveat: 'Unweighted report average, not orders/clicks weighted.' },
  { key: 'averageOrderValue', status: 'DERIVED_WITH_VERIFIED_FORMULA', grain: 'Confirmed report set grouped by time/Brand/Platform/Campaign.', source: 'SUM(revenue where revenue and orders are both present) / SUM(orders for those same rows).', caveat: 'Null when no paired rows or paired orders total is zero.' },
  { key: 'liveHours', status: 'DERIVED_WITH_VERIFIED_FORMULA', grain: 'One confirmed report per shift, grouped by time/Brand/Platform/Campaign.', source: 'get_analytics_snapshot SUM(live_duration_seconds) / 60 returns minutes; BI converts minutes / 60 to hours.', caveat: 'Reported duration, not scheduled shift length.' },
  { key: 'reportCount', status: 'SUPPORTED', grain: 'Confirmed report records grouped by time/Brand/Platform/Campaign.', source: 'COUNT(*) for status=confirmed and metrics_confirmed=true reports.', caveat: 'Not a distinct shift count.' },
] as const

export type BiMetricKey = typeof BI_METRIC_CATALOG[number]['key']
export type BiDimension = 'time' | 'brand' | 'platform' | 'campaign' | 'host'
export type BiChartKey = 'bar' | 'stackedBar' | 'line' | 'area' | 'pie' | 'donut' | 'combo' | 'scatter' | 'heatmap' | 'treemap' | 'funnel' | 'waterfall' | 'gauge' | 'pivot'

export const BI_CHART_CATALOG: Array<{ key: BiChartKey; label: string; supported: boolean; reason: string }> = [
  { key: 'bar', label: 'Bar', supported: true, reason: '' },
  { key: 'stackedBar', label: 'Stacked Bar', supported: false, reason: 'The snapshot returns one selected measure per dimension; it has no compatible multi-series contract.' },
  { key: 'line', label: 'Line', supported: true, reason: '' },
  { key: 'area', label: 'Area', supported: true, reason: '' },
  { key: 'pie', label: 'Pie', supported: true, reason: '' },
  { key: 'donut', label: 'Donut', supported: true, reason: '' },
  { key: 'combo', label: 'Combo', supported: false, reason: 'No aligned multi-measure series with compatible axes is returned.' },
  { key: 'scatter', label: 'Scatter', supported: false, reason: 'The API does not return paired row-level observations.' },
  { key: 'heatmap', label: 'Heatmap', supported: false, reason: 'No two-dimension aggregate grid is returned.' },
  { key: 'treemap', label: 'Treemap', supported: false, reason: 'No parent-child dimension hierarchy is returned.' },
  { key: 'funnel', label: 'Funnel', supported: false, reason: 'No ordered funnel-step events or conversion stages are available.' },
  { key: 'waterfall', label: 'Waterfall', supported: false, reason: 'No ordered contribution or opening/closing balance series is available.' },
  { key: 'gauge', label: 'Gauge', supported: false, reason: 'No target or threshold contract is available.' },
  { key: 'pivot', label: 'Pivot Table', supported: false, reason: 'The snapshot has one-dimensional aggregates, not a cross-tab grain.' },
]

const ADDITIVE_METRICS = new Set<BiMetricKey>(['revenue', 'gmv', 'orders', 'viewers', 'productClicks', 'liveHours', 'reportCount'])

export function biChartCompatibilityReason(metric: BiMetricKey, dimension: BiDimension, chart: BiChartKey): string | null {
  const chartDefinition = BI_CHART_CATALOG.find(item => item.key === chart)
  if (!chartDefinition || !chartDefinition.supported) return chartDefinition?.reason ?? 'Chart is not supported.'
  if (dimension === 'host' && metric !== 'revenue') return 'Host breakdown currently contains confirmed Revenue only.'
  if ((chart === 'line' || chart === 'area') && dimension !== 'time') return 'Line and Area require the time-series grain.'
  if ((chart === 'pie' || chart === 'donut') && dimension === 'time') return 'Pie and Donut require a categorical dimension, not time.'
  if ((chart === 'pie' || chart === 'donut') && !ADDITIVE_METRICS.has(metric)) return 'Pie and Donut require additive non-ratio measures; rates and averages are not shares.'
  return null
}

export function biChartCompatibilityMessage(metric: BiMetricKey, dimension: BiDimension, chart: BiChartKey, english: boolean): string {
  const reason = biChartCompatibilityReason(metric, dimension, chart)
  if (!reason || english) return reason ?? 'Compatible chart.'
  if (dimension === 'host' && metric !== 'revenue') return 'Phân tích Host hiện chỉ có Revenue đã xác nhận.'
  if ((chart === 'line' || chart === 'area') && dimension !== 'time') return 'Line và Area chỉ hỗ trợ dữ liệu theo thời gian.'
  if ((chart === 'pie' || chart === 'donut') && dimension === 'time') return 'Pie và Donut cần chiều phân loại, không dùng cho chuỗi thời gian.'
  if ((chart === 'pie' || chart === 'donut') && !ADDITIVE_METRICS.has(metric)) return 'Pie và Donut cần chỉ số cộng dồn; không phù hợp với tỷ lệ hoặc giá trị trung bình.'
  const chartVi: Partial<Record<BiChartKey, string>> = {
    stackedBar: 'Snapshot hiện chỉ có một chỉ số mỗi chiều, chưa có dữ liệu nhiều chuỗi tương thích.',
    combo: 'Chưa có chuỗi nhiều chỉ số được căn chỉnh và xác minh ý nghĩa trục.',
    scatter: 'API chưa trả về các cặp quan sát ở cấp bản ghi.',
    heatmap: 'API chưa trả về lưới tổng hợp theo hai chiều.',
    treemap: 'API chưa có phân cấp cha-con.',
    funnel: 'API chưa có các bước hoặc sự kiện funnel theo thứ tự.',
    waterfall: 'API chưa có các khoản đóng góp hoặc số dư theo thứ tự.',
    gauge: 'API chưa có mục tiêu hoặc ngưỡng đo.',
    pivot: 'API chỉ có tổng hợp một chiều, chưa có dữ liệu chéo.'
  }
  return chartVi[chart] ?? 'Biểu đồ này chưa tương thích với dữ liệu hiện có.'
}

export function firstCompatibleBiChart(metric: BiMetricKey, dimension: BiDimension): BiChartKey {
  return BI_CHART_CATALOG.find(chart => biChartCompatibilityReason(metric, dimension, chart.key) === null)?.key ?? 'bar'
}

export function biMetricValue(source: Record<string, unknown>, metric: BiMetricKey): number | null {
  const raw = metric === 'liveHours'
    ? typeof source.liveDuration === 'number' ? source.liveDuration / 60 : null
    : source[metric]
  return typeof raw === 'number' && Number.isFinite(raw) ? raw : null
}

export function hasBiMetricObservation(values: Array<number | null | undefined>): boolean {
  return values.some(value => typeof value === 'number' && Number.isFinite(value))
}

export function hasNegativeBiMetric(values: Array<number | null | undefined>): boolean {
  return values.some(value => typeof value === 'number' && Number.isFinite(value) && value < 0)
}

export type BiSavedFilters = {
  range: 'today' | 'yesterday' | '7d' | '30d' | 'thisMonth' | 'lastMonth' | 'custom'
  start: string
  end: string
  brandIds: string[]
  platformIds: string[]
  campaignIds: string[]
  hostIds: string[]
  supportIds: string[]
  technicalIds: string[]
}

export type BiPersonalView = {
  version: 1
  metric: BiMetricKey
  dimension: BiDimension
  chart: BiChartKey
  filters: BiSavedFilters
}

const BI_METRICS = new Set<string>(BI_METRIC_CATALOG.map(item => item.key))
const BI_DIMENSIONS = new Set<string>(['time', 'brand', 'platform', 'campaign', 'host'])
const BI_CHARTS = new Set<string>(BI_CHART_CATALOG.map(item => item.key))
const BI_RANGES = new Set<string>(['today', 'yesterday', '7d', '30d', 'thisMonth', 'lastMonth', 'custom'])
const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/

function isDateOnly(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE_ONLY.test(value)) return false
  const date = new Date(value + 'T00:00:00Z')
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
}

function isIdArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.length <= 100 && value.every(item => typeof item === 'string' && item.length > 0 && item.length <= 128)
}

export function parseBiPersonalView(serialized: string): BiPersonalView | null {
  try {
    if (serialized.length > 32768) return null
    const input = JSON.parse(serialized) as Partial<BiPersonalView>
    const filters = input.filters as Partial<BiSavedFilters> | undefined
    if (input.version !== 1 || typeof input.metric !== 'string' || !BI_METRICS.has(input.metric)
      || typeof input.dimension !== 'string' || !BI_DIMENSIONS.has(input.dimension)
      || typeof input.chart !== 'string' || !BI_CHARTS.has(input.chart)
      || !filters || typeof filters.range !== 'string' || !BI_RANGES.has(filters.range)
      || !isDateOnly(filters.start) || !isDateOnly(filters.end) || filters.start > filters.end
      || !isIdArray(filters.brandIds) || !isIdArray(filters.platformIds) || !isIdArray(filters.campaignIds)
      || !isIdArray(filters.hostIds) || !isIdArray(filters.supportIds) || !isIdArray(filters.technicalIds)) return null
    const metric = input.metric as BiMetricKey
    const dimension = input.dimension as BiDimension
    const chart = input.chart as BiChartKey
    if (biChartCompatibilityReason(metric, dimension, chart)) return null
    return { version: 1, metric, dimension, chart, filters: filters as BiSavedFilters }
  } catch {
    return null
  }
}

export function biPersonalViewStorageKey(actorId: string): string {
  return 'rc19.analytics.bi01.view.v1:' + encodeURIComponent(actorId)
}

export function analyticsPeriodBucket(period: string, rangeStart: string, rangeEnd: string): { start: string; end: string } | null {
  if (!isDateOnly(rangeStart) || !isDateOnly(rangeEnd) || rangeStart > rangeEnd) return null
  let start: string
  let end: string
  if (/^\d{4}-\d{2}$/.test(period)) {
    const [year, month] = period.split('-').map(Number)
    if (month < 1 || month > 12) return null
    start = period + '-01'
    end = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10)
  } else if (isDateOnly(period)) {
    start = period
    const span = Math.round((Date.parse(rangeEnd) - Date.parse(rangeStart)) / 86400000) + 1
    if (span > 31 && span <= 120) end = new Date(Date.parse(period + 'T00:00:00Z') + 6 * 86400000).toISOString().slice(0, 10)
    else end = period
  } else return null
  if (start < rangeStart) start = rangeStart
  if (end > rangeEnd) end = rangeEnd
  return start <= end ? { start, end } : null
}
