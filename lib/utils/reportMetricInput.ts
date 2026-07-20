import type { ReportMetricKey } from '@/lib/types/database.types'

export type ReportMetricInputKind =
  | 'percentage'
  | 'currency'
  | 'count'
  | 'duration_seconds'
  | 'ratio'
  | 'text'

const percentageMetrics = new Set<ReportMetricKey>([
  'ctr',
  'conversion_rate',
  'click_rate',
  'live_ctr',
  'ctor',
  'comment_rate',
  'click_to_order_rate',
])

const currencyMetrics = new Set<ReportMetricKey>([
  'revenue',
  'gmv',
  'average_order_value',
  'gmv_per_hour',
  'gpm',
  'advertising_cost',
  'sales',
  'estimated_gmv',
  'average_basket_size',
])

const durationMetrics = new Set<ReportMetricKey>([
  'average_view_duration_seconds',
  'live_duration_seconds',
])

export function getReportMetricInputKind(metric: ReportMetricKey): ReportMetricInputKind {
  if (metric === 'started_at' || metric === 'ended_at') return 'text'
  if (percentageMetrics.has(metric)) return 'percentage'
  if (currencyMetrics.has(metric)) return 'currency'
  if (durationMetrics.has(metric)) return 'duration_seconds'
  if (metric === 'roi_gmv_max') return 'ratio'
  return 'count'
}

export function getReportMetricInputProps(metric: ReportMetricKey) {
  const kind = getReportMetricInputKind(metric)
  if (kind === 'text') {
    return { type: 'text' as const }
  }
  if (kind === 'percentage') {
    return { type: 'number' as const, min: 0, max: 100, step: 'any' as const, inputMode: 'decimal' as const }
  }
  if (kind === 'currency' || kind === 'ratio') {
    return { type: 'number' as const, min: 0, step: 'any' as const, inputMode: 'decimal' as const }
  }
  return { type: 'number' as const, min: 0, step: 1, inputMode: 'numeric' as const }
}
