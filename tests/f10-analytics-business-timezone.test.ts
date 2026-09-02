import assert from 'node:assert/strict'
import test from 'node:test'
import {
  addDateOnlyDays,
  calculateAnalyticsMetrics,
  resolveAnalyticsDateRange,
  startOfBusinessWeek,
} from '../lib/utils/analytics.ts'
import { DEFAULT_BUSINESS_TIMEZONE } from '../lib/utils/shiftUtils.ts'
import type { Report } from '../lib/types/database.types.ts'

const report = (overrides: Partial<Report> = {}): Report => ({
  id: 'report-1',
  shift_id: 'shift-1',
  revenue: 100,
  orders: 4,
  peak_viewer: 20,
  average_viewer: 10,
  comments: 0,
  shares: 0,
  created_at: '2026-09-01T00:00:00.000Z',
  updated_at: '2026-09-01T00:00:00.000Z',
  ...overrides,
})

test('Analytics presets anchor to the canonical business date', () => {
  const boundary = new Date('2026-09-02T17:30:00.000Z')
  assert.equal(resolveAnalyticsDateRange('today', boundary).start, '2026-09-03')
  assert.deepEqual(resolveAnalyticsDateRange('today', boundary), { start: '2026-09-03', end: '2026-09-03' })
  assert.deepEqual(resolveAnalyticsDateRange('yesterday', boundary), { start: '2026-09-02', end: '2026-09-02' })
  assert.deepEqual(resolveAnalyticsDateRange('7d', boundary), { start: '2026-08-28', end: '2026-09-03' })
  assert.deepEqual(resolveAnalyticsDateRange('30d', boundary), { start: '2026-08-05', end: '2026-09-03' })
  assert.deepEqual(resolveAnalyticsDateRange('thisMonth', boundary), { start: '2026-09-01', end: '2026-09-03' })
  assert.deepEqual(resolveAnalyticsDateRange('lastMonth', boundary), { start: '2026-08-01', end: '2026-08-31' })
})

test('date-only Analytics calculations are independent of browser timezone', () => {
  const boundary = new Date('2026-09-02T17:30:00.000Z')
  const range = resolveAnalyticsDateRange('today', boundary, DEFAULT_BUSINESS_TIMEZONE)
  assert.deepEqual(range, resolveAnalyticsDateRange('today', boundary, DEFAULT_BUSINESS_TIMEZONE))
  assert.equal(addDateOnlyDays('2026-09-01', 1), '2026-09-02')
  assert.equal(startOfBusinessWeek('2026-09-03'), '2026-08-31')
  assert.equal(resolveAnalyticsDateRange('today', new Date('2026-09-02T17:30:00.000-07:00')).start, '2026-09-03')
})

test('Analytics preserves current rolling and custom range semantics', () => {
  const boundary = new Date('2026-09-03T02:00:00.000Z')
  assert.deepEqual(resolveAnalyticsDateRange('7d', boundary), { start: '2026-08-28', end: '2026-09-03' })
  assert.deepEqual(resolveAnalyticsDateRange('30d', boundary), { start: '2026-08-05', end: '2026-09-03' })
})

test('Analytics formulas aggregate canonical report metrics safely', () => {
  const metrics = calculateAnalyticsMetrics([
    report({ revenue: 100, orders: 4, average_viewer: 10, product_clicks: 5, ctr: 2, cvr: 1, live_duration_minutes: 30 }),
    report({ id: 'report-2', revenue: 50, orders: 6, average_viewer: 20, product_clicks: 7, ctr: 4, cvr: 3, live_duration_minutes: 60 }),
  ])
  assert.equal(metrics.revenue, 150)
  assert.equal(metrics.orders, 10)
  assert.equal(metrics.viewers, 30)
  assert.equal(metrics.productClicks, 12)
  assert.equal(metrics.averageOrderValue, 15)
  assert.equal(metrics.ctr, 3)
  assert.equal(metrics.cvr, 2)
  assert.equal(metrics.liveDuration, 90)
  assert.equal(metrics.reportCount, 2)
})

test('Analytics formulas retain normalized metric precedence and zero-order safety', () => {
  const metrics = calculateAnalyticsMetrics([report({
    revenue: 10,
    orders: 0,
    normalized_metrics: { revenue: 250, orders: 0, engaged_viewers: 99, product_clicks: 8, ctr: 6, conversion_rate: 4 },
  })])
  assert.equal(metrics.revenue, 250)
  assert.equal(metrics.orders, 0)
  assert.equal(metrics.viewers, 99)
  assert.equal(metrics.productClicks, 8)
  assert.equal(metrics.averageOrderValue, 0)
  assert.equal(metrics.ctr, 6)
  assert.equal(metrics.cvr, 4)
  assert.deepEqual(calculateAnalyticsMetrics([]), {
    revenue: 0, gmv: 0, orders: 0, viewers: 0, productClicks: 0, ctr: 0, cvr: 0,
    averageOrderValue: 0, liveDuration: 0, reportCount: 0,
  })
})
