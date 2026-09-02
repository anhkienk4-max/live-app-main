import type { Report } from '@/lib/types/database.types'
import { DEFAULT_BUSINESS_TIMEZONE, getCurrentBusinessDate } from '@/lib/utils/shiftUtils'

export type AnalyticsRangeKey = 'today' | 'yesterday' | '7d' | '30d' | 'thisMonth' | 'lastMonth' | 'custom'

export interface AnalyticsDateRange {
  start: string
  end: string
}

/** Resolve preset ranges from the business calendar, never the browser calendar. */
export function resolveAnalyticsDateRange(
  range: Exclude<AnalyticsRangeKey, 'custom'>,
  now = new Date(),
  timezone = DEFAULT_BUSINESS_TIMEZONE,
): AnalyticsDateRange {
  const today = getCurrentBusinessDate(timezone, now)
  if (range === 'today') return { start: today, end: today }
  if (range === 'yesterday') {
    const yesterday = addDateOnlyDays(today, -1)
    return { start: yesterday, end: yesterday }
  }
  if (range === '7d') return { start: addDateOnlyDays(today, -6), end: today }
  if (range === '30d') return { start: addDateOnlyDays(today, -29), end: today }
  if (range === 'thisMonth') return { start: `${today.slice(0, 7)}-01`, end: today }

  const previousMonthEnd = addDateOnlyDays(`${today.slice(0, 7)}-01`, -1)
  return { start: `${previousMonthEnd.slice(0, 7)}-01`, end: previousMonthEnd }
}

/** Date-only arithmetic used for Analytics period boundaries and chart buckets. */
export function addDateOnlyDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number)
  const value = new Date(Date.UTC(year, month - 1, day))
  value.setUTCDate(value.getUTCDate() + days)
  return formatDateOnly(value)
}

export function startOfBusinessWeek(date: string): string {
  const [year, month, day] = date.split('-').map(Number)
  const value = new Date(Date.UTC(year, month - 1, day))
  const daysSinceMonday = (value.getUTCDay() + 6) % 7
  value.setUTCDate(value.getUTCDate() - daysSinceMonday)
  return formatDateOnly(value)
}

function formatDateOnly(value: Date): string {
  return `${value.getUTCFullYear()}-${String(value.getUTCMonth() + 1).padStart(2, '0')}-${String(value.getUTCDate()).padStart(2, '0')}`
}

export type AnalyticsMetricKey =
  | 'revenue'
  | 'gmv'
  | 'orders'
  | 'viewers'
  | 'productClicks'
  | 'ctr'
  | 'cvr'
  | 'averageOrderValue'
  | 'liveDuration'
  | 'reportCount'

export function calculateAnalyticsMetrics(items: Report[]): Record<AnalyticsMetricKey, number> {
  const revenue = items.reduce((sum, report) => sum + reportMetric(report, 'revenue'), 0)
  const orders = items.reduce((sum, report) => sum + reportMetric(report, 'orders'), 0)
  return {
    revenue,
    gmv: items.reduce((sum, report) => sum + reportMetric(report, 'gmv'), 0),
    orders,
    viewers: items.reduce((sum, report) => sum + reportMetric(report, 'engaged_viewers'), 0),
    productClicks: items.reduce((sum, report) => sum + reportMetric(report, 'product_clicks'), 0),
    ctr: average(items.map(report => reportMetric(report, 'ctr'))),
    cvr: average(items.map(report => reportMetric(report, 'conversion_rate'))),
    averageOrderValue: orders ? revenue / orders : 0,
    liveDuration: items.reduce((sum, report) => sum + reportMetric(report, 'live_duration_seconds') / 60, 0),
    reportCount: items.length,
  }
}

export function reportMetric(report: Report, key: 'revenue' | 'gmv' | 'orders' | 'engaged_viewers' | 'product_clicks' | 'ctr' | 'conversion_rate' | 'live_duration_seconds'): number {
  const normalized = report.normalized_metrics?.[key]
  if (typeof normalized === 'number') return normalized
  if (key === 'revenue' && typeof report.platform_metrics?.sales === 'number') return report.platform_metrics.sales
  if (key === 'revenue') return report.revenue
  if (key === 'gmv') return report.gmv ?? report.revenue
  if (key === 'orders') return report.orders
  if (key === 'engaged_viewers') return report.viewers ?? report.average_viewer
  if (key === 'product_clicks') return report.product_clicks ?? 0
  if (key === 'ctr') return report.ctr ?? 0
  if (key === 'conversion_rate') return report.cvr ?? 0
  return (report.live_duration_minutes ?? 0) * 60
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0
}
