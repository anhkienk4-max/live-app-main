import assert from 'node:assert/strict'
import test from 'node:test'
import {
  BI_CHART_CATALOG, BI_METRIC_CATALOG, analyticsPeriodBucket, biChartCompatibilityReason,
  biMetricValue, biPersonalViewStorageKey, firstCompatibleBiChart, hasBiMetricObservation,
  hasNegativeBiMetric, parseBiPersonalView,
} from '../lib/utils/bi01Catalog.ts'

const filters = {
  range: 'custom' as const, start: '2026-02-01', end: '2026-02-28',
  brandIds: ['brand-a'], platformIds: [], campaignIds: [], hostIds: [], supportIds: [], technicalIds: [],
}
const saved = JSON.stringify({ version: 1, metric: 'revenue', dimension: 'brand', chart: 'donut', filters })

test('BI catalog marks only confirmed report fields and verified derivations as available', () => {
  assert.deepEqual(BI_METRIC_CATALOG.map(metric => metric.status), [
    'SUPPORTED','SUPPORTED','SUPPORTED','SUPPORTED','SUPPORTED','SUPPORTED','SUPPORTED',
    'DERIVED_WITH_VERIFIED_FORMULA','DERIVED_WITH_VERIFIED_FORMULA','SUPPORTED',
  ])
  assert.equal(BI_CHART_CATALOG.find(chart => chart.key === 'funnel')?.supported, false)
  assert.equal(BI_CHART_CATALOG.find(chart => chart.key === 'pivot')?.supported, false)
})

test('Host grain only supports confirmed Revenue; other measures fail closed', () => {
  assert.equal(biChartCompatibilityReason('revenue','host','bar'), null)
  assert.match(biChartCompatibilityReason('orders','host','bar') ?? '', /Host/)
  assert.equal(firstCompatibleBiChart('revenue','host'), 'bar')
})

test('Line and Area require time; Pie and Donut require categorical additive measures', () => {
  assert.match(biChartCompatibilityReason('orders','brand','line') ?? '', /time-series/)
  assert.equal(biChartCompatibilityReason('orders','time','area'), null)
  assert.match(biChartCompatibilityReason('revenue','time','donut') ?? '', /categorical/)
  assert.match(biChartCompatibilityReason('ctr','brand','pie') ?? '', /additive/)
  assert.equal(biChartCompatibilityReason('orders','platform','donut'), null)
})

test('unsupported chart types return a specific source limitation', () => {
  for (const chart of ['stackedBar','combo','scatter','heatmap','treemap','funnel','waterfall','gauge','pivot'] as const) {
    assert.ok(biChartCompatibilityReason('revenue','time',chart), chart)
  }
})

test('missing stays null, explicit zero remains a measured value, and finite values are detected', () => {
  assert.equal(biMetricValue({ revenue: null }, 'revenue'), null)
  assert.equal(biMetricValue({ revenue: 0 }, 'revenue'), 0)
  assert.equal(biMetricValue({ liveDuration: null }, 'liveHours'), null)
  assert.equal(biMetricValue({ liveDuration: 90 }, 'liveHours'), 1.5)
  assert.equal(hasBiMetricObservation([null, undefined, Number.NaN]), false)
  assert.equal(hasBiMetricObservation([null, 0]), true)
  assert.equal(hasNegativeBiMetric([0, null]), false)
  assert.equal(hasNegativeBiMetric([0, -1]), true)
})

test('personal views are actor-keyed configuration only and reject incompatible settings', () => {
  assert.equal(biPersonalViewStorageKey('actor/one'), 'rc19.analytics.bi01.view.v1:actor%2Fone')
  assert.deepEqual(parseBiPersonalView(saved), {
    version: 1, metric: 'revenue', dimension: 'brand', chart: 'donut', filters,
  })
  assert.equal(parseBiPersonalView(JSON.stringify({ ...JSON.parse(saved), chart: 'scatter' })), null)
  assert.equal(parseBiPersonalView(JSON.stringify({ ...JSON.parse(saved), dimension: 'host', metric: 'orders', chart: 'bar' })), null)
  assert.equal(parseBiPersonalView('{bad json'), null)
  const oversized = { ...JSON.parse(saved), filters: { ...filters, brandIds: Array.from({ length: 101 }, (_, i) => 'brand-' + i) } }
  assert.equal(parseBiPersonalView(JSON.stringify(oversized)), null)
})

test('time drill-down clamps day, week and month buckets to current filter range', () => {
  assert.deepEqual(analyticsPeriodBucket('2026-02-11','2026-02-01','2026-02-28'), { start:'2026-02-11',end:'2026-02-11' })
  assert.deepEqual(analyticsPeriodBucket('2026-03-02','2026-02-01','2026-03-15'), { start:'2026-03-02',end:'2026-03-08' })
  assert.deepEqual(analyticsPeriodBucket('2026-02','2026-02-10','2026-03-04'), { start:'2026-02-10',end:'2026-02-28' })
  assert.equal(analyticsPeriodBucket('2026-13','2026-02-01','2026-02-28'), null)
})

test('Analytics UI continues using the existing scoped snapshot and permission-gated export', async () => {
  const { readFile } = await import('node:fs/promises')
  const ui = await readFile(new URL('../components/features/analytics/DashboardAnalytics.tsx', import.meta.url), 'utf8')
  assert.match(ui, /reportService\.getAnalyticsSnapshot/)
  assert.match(ui, /reportStatuses: \['confirmed'\], metricsStatuses: \['confirmed'\]/)
  assert.match(ui, /hasPermission\(currentUser, 'reports\.export'\)/)
  assert.match(ui, /biPersonalViewStorageKey\(currentUser\.id\)/)
})
