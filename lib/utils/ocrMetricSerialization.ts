import type {
  DashboardUpdate,
  NormalizedReportMetrics,
  Report,
  ReportDashboardPlatform,
} from '@/lib/types/database.types'
import {
  isCanonicalMetricKey,
  platformCanonicalMetricKeys,
  type CanonicalMetricKey,
  type MetricState,
} from '@/lib/utils/ocrCanonical'
import { reviewInputValues } from '@/lib/utils/ocrReview'

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

const requiredFinalReportMetricKeys = {
  shopee_live: [
    'sales', 'orders', 'pcu', 'total_viewers', 'comments', 'shares',
    'add_to_cart', 'ctr', 'click_to_order_rate', 'average_basket_size',
  ],
  tiktok_shop: [
    'gmv', 'sku_orders', 'current_viewers', 'total_views', 'comments',
    'shares', 'product_clicks', 'live_ctr', 'ctor', 'average_order_value',
  ],
} as const satisfies Record<Exclude<ReportDashboardPlatform, 'other'>, readonly CanonicalMetricKey[]>

export function reportMetricState(report: Report): MetricState {
  const extractedValues = report.ocr_review ? reviewInputValues(report.ocr_review) : {}
  const legacy = report.dashboard_platform === 'shopee_live'
    ? {
        sales: report.revenue,
        orders: report.orders,
        total_viewers: report.viewers ?? report.average_viewer,
        pcu: report.peak_viewer,
        add_to_cart: report.product_clicks,
        ctr: report.ctr,
        click_to_order_rate: report.cvr,
        average_basket_size: report.average_order_value,
        live_duration_seconds: report.live_duration_minutes == null ? null : report.live_duration_minutes * 60,
        likes: report.likes,
        comments: report.comments,
        shares: report.shares,
      }
    : {
        gmv: report.gmv ?? report.revenue,
        sku_orders: report.orders,
        current_viewers: report.peak_viewer,
        total_views: report.viewers ?? report.average_viewer,
        product_clicks: report.product_clicks,
        live_ctr: report.ctr,
        ctor: report.cvr,
        average_order_value: report.average_order_value,
        comments: report.comments,
        shares: report.shares,
      }
  const normalized = {
    ...legacy,
    ...report.normalized_metrics,
    ...report.platform_metrics,
    ...extractedValues,
  }
  return Object.fromEntries(
    Object.entries(normalized).flatMap(([key, value]) =>
      isCanonicalMetricKey(key) && typeof value === 'number' && Number.isFinite(value)
        ? [[key, value]]
        : [],
    ),
  )
}

export function getMissingFinalReportMetricKeys(
  platform: Exclude<ReportDashboardPlatform, 'other'>,
  state: MetricState,
): CanonicalMetricKey[] {
  return requiredFinalReportMetricKeys[platform].filter(key => finiteMetric(state, key) === undefined)
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
): Partial<Pick<
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
>> {
  const normalized = serializeCanonicalMetrics(platform, state)
  if (platform === 'shopee_live') {
    const totalViewers = finiteMetric(state, 'total_viewers')
    return {
      revenue: finiteMetric(state, 'sales'),
      orders: finiteMetric(state, 'orders'),
      peak_viewer: finiteMetric(state, 'pcu'),
      average_viewer: totalViewers,
      viewers: totalViewers,
      likes: finiteMetric(state, 'likes'),
      comments: finiteMetric(state, 'comments'),
      shares: finiteMetric(state, 'shares'),
      gmv: finiteMetric(state, 'sales'),
      product_clicks: finiteMetric(state, 'add_to_cart'),
      ctr: finiteMetric(state, 'ctr'),
      cvr: finiteMetric(state, 'click_to_order_rate'),
      average_order_value: finiteMetric(state, 'average_basket_size'),
      live_duration_minutes: finiteMetric(state, 'live_duration_seconds') == null
        ? undefined
        : finiteMetric(state, 'live_duration_seconds')! / 60,
      normalized_metrics: normalized,
      platform_metrics: normalized,
    }
  }

  const currentViewers = finiteMetric(state, 'current_viewers')
  return {
    revenue: finiteMetric(state, 'gmv'),
    orders: finiteMetric(state, 'sku_orders'),
    peak_viewer: currentViewers,
    average_viewer: currentViewers,
    viewers: finiteMetric(state, 'total_views'),
    likes: undefined,
    comments: finiteMetric(state, 'comments'),
    shares: finiteMetric(state, 'shares'),
    gmv: finiteMetric(state, 'gmv'),
    product_clicks: finiteMetric(state, 'product_clicks'),
    ctr: finiteMetric(state, 'live_ctr'),
    cvr: finiteMetric(state, 'ctor'),
    average_order_value: finiteMetric(state, 'average_order_value'),
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
