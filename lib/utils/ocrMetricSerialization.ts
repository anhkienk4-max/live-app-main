import type {
  DashboardUpdate,
  NormalizedReportMetrics,
  Report,
  ReportDashboardPlatform,
} from '@/lib/types/database.types'
import {
  platformCanonicalMetricKeys,
  type CanonicalMetricKey,
  type MetricState,
} from '@/lib/utils/ocrCanonical'

const finiteMetric = (state: MetricState, key: CanonicalMetricKey) => {
  const value = state[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

const requiredMetric = (
  state: MetricState,
  keys: readonly CanonicalMetricKey[],
  label: string,
) => {
  for (const key of keys) {
    const value = finiteMetric(state, key)
    if (value !== undefined) return value
  }
  throw new Error(`${label} is required before this OCR draft can be saved.`)
}

export function serializeCanonicalMetrics(
  platform: ReportDashboardPlatform,
  state: MetricState,
): NormalizedReportMetrics {
  return Object.fromEntries(
    platformCanonicalMetricKeys(platform).flatMap(key => {
      const value = finiteMetric(state, key)
      return value === undefined ? [] : [[key, value]]
    }),
  )
}

export function serializeFinalReportMetricState(
  platform: Exclude<ReportDashboardPlatform, 'other'>,
  state: MetricState,
): Pick<
  Report,
  | 'revenue'
  | 'orders'
  | 'peak_viewer'
  | 'average_viewer'
  | 'viewers'
  | 'likes'
  | 'comments'
  | 'shares'
  | 'gmv'
  | 'product_clicks'
  | 'ctr'
  | 'cvr'
  | 'average_order_value'
  | 'live_duration_minutes'
  | 'normalized_metrics'
  | 'platform_metrics'
> {
  const normalized = serializeCanonicalMetrics(platform, state)
  if (platform === 'shopee_live') {
    const totalViewers = requiredMetric(state, ['total_viewers'], 'Total Viewers')
    return {
      revenue: requiredMetric(state, ['sales'], 'Sales'),
      orders: requiredMetric(state, ['orders'], 'Orders'),
      peak_viewer: requiredMetric(state, ['pcu'], 'PCU'),
      average_viewer: totalViewers,
      viewers: totalViewers,
      likes: finiteMetric(state, 'likes'),
      comments: requiredMetric(state, ['comments'], 'Comments'),
      shares: requiredMetric(state, ['shares'], 'Shares'),
      gmv: requiredMetric(state, ['sales'], 'Sales'),
      product_clicks: requiredMetric(state, ['add_to_cart'], 'Add to Cart'),
      ctr: requiredMetric(state, ['ctr'], 'CTR'),
      cvr: requiredMetric(state, ['click_to_order_rate'], 'Click-to-order rate'),
      average_order_value: requiredMetric(state, ['average_basket_size'], 'Average basket size'),
      live_duration_minutes: finiteMetric(state, 'live_duration_seconds') == null
        ? undefined
        : finiteMetric(state, 'live_duration_seconds')! / 60,
      normalized_metrics: normalized,
      platform_metrics: normalized,
    }
  }

  const currentViewers = requiredMetric(state, ['current_viewers'], 'Current Viewers')
  return {
    revenue: requiredMetric(state, ['gmv'], 'GMV'),
    orders: requiredMetric(state, ['sku_orders'], 'SKU Orders'),
    peak_viewer: currentViewers,
    average_viewer: currentViewers,
    viewers: requiredMetric(state, ['total_views'], 'Total Views'),
    likes: undefined,
    comments: requiredMetric(state, ['comments'], 'Comments'),
    shares: requiredMetric(state, ['shares'], 'Shares'),
    gmv: requiredMetric(state, ['gmv'], 'GMV'),
    product_clicks: requiredMetric(state, ['product_clicks'], 'Product Clicks'),
    ctr: requiredMetric(state, ['live_ctr'], 'LIVE CTR'),
    cvr: requiredMetric(state, ['ctor'], 'CTOR'),
    average_order_value: requiredMetric(state, ['average_order_value'], 'Average Order Value'),
    live_duration_minutes: undefined,
    normalized_metrics: normalized,
    platform_metrics: normalized,
  }
}

export function serializeLiveMetricState(
  platform: Exclude<ReportDashboardPlatform, 'other'>,
  state: MetricState,
): Pick<
  DashboardUpdate,
  | 'revenue'
  | 'gmv'
  | 'orders'
  | 'peak_viewers'
  | 'current_viewers'
  | 'total_views'
  | 'total_viewers'
  | 'likes'
  | 'comments'
  | 'shares'
  | 'normalized_metrics'
> {
  const normalized = serializeCanonicalMetrics(platform, state)
  if (platform === 'shopee_live') {
    const pcu = requiredMetric(state, ['pcu'], 'PCU')
    const sales = requiredMetric(state, ['sales'], 'Sales')
    return {
      revenue: sales,
      gmv: sales,
      orders: requiredMetric(state, ['orders'], 'Orders'),
      peak_viewers: pcu,
      current_viewers: pcu,
      total_views: finiteMetric(state, 'total_views'),
      total_viewers: finiteMetric(state, 'total_viewers'),
      likes: finiteMetric(state, 'likes'),
      comments: finiteMetric(state, 'comments'),
      shares: finiteMetric(state, 'shares'),
      normalized_metrics: normalized,
    }
  }

  const currentViewers = requiredMetric(state, ['current_viewers'], 'Current Viewers')
  const gmv = requiredMetric(state, ['gmv'], 'GMV')
  return {
    revenue: gmv,
    gmv,
    orders: requiredMetric(state, ['sku_orders'], 'SKU Orders'),
    peak_viewers: currentViewers,
    current_viewers: currentViewers,
    total_views: finiteMetric(state, 'total_views'),
    total_viewers: undefined,
    likes: undefined,
    comments: finiteMetric(state, 'comments'),
    shares: finiteMetric(state, 'shares'),
    normalized_metrics: normalized,
  }
}
