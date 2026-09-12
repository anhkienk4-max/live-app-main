import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { buildReportExportRows } from '../lib/utils/excelUtils.ts'
import type { Report } from '../lib/types/database.types.ts'

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')

test('dashboard performance aggregates consume confirmed reports only', () => {
  const dashboard = read('../components/features/dashboard/DashboardOverview.tsx')
  const migration = read('../supabase/migrations/20260912083056_report_draft_nullable_metrics.sql')

  assert.match(dashboard, /const filteredReports = reports\.filter\(report => shiftIds\.has\(report\.shift_id\) && report\.status === 'confirmed'\)/)
  assert.match(dashboard, /const previousReports = reports\.filter\(report => previousIds\.has\(report\.shift_id\) && report\.status === 'confirmed'\)/)
  assert.match(dashboard, /const revenue = filteredReports\.reduce\(/)
  assert.match(dashboard, /const previousRevenue = previousReports\.reduce\(/)
  assert.match(dashboard, /const trend = Object\.entries\(filteredReports\.reduce/)
  assert.match(migration, /new\.status = 'confirmed' and not new\.metrics_confirmed/i)
})

test('analytics reportMetric callers load confirmed-only reports', () => {
  const dashboard = read('../components/features/analytics/DashboardAnalytics.tsx')
  const dataService = read('../lib/services/dataService.ts')
  const reportService = read('../lib/services/supabaseReportService.ts')

  assert.match(dashboard, /reportService\.getConfirmed\(\)/)
  assert.match(dashboard, /const currentReports = reports\.filter\(/)
  assert.match(dashboard, /const previousReports = reports\.filter\(/)
  assert.match(dataService, /report\.status === 'confirmed'[\s\S]*?report\.metrics_confirmed === true/)
  assert.match(reportService, /\.eq\('metrics_confirmed', true\)/)
})

test('Campaign confirmed revenue filters lifecycle state before summing', () => {
  const campaignList = read('../components/features/campaigns/CampaignList.tsx')
  assert.match(campaignList, /relatedReports\.filter\(report => report\.metrics_confirmed\)\.reduce\(\(sum, report\) => sum \+ \(report\.revenue \?\? 0\), 0\)/)
})

test('report export keeps missing draft metrics blank and explicit zero numeric', () => {
  const context = { shifts: [], campaigns: [], users: [], brands: new Map(), platforms: new Map() }
  const report = (overrides: Partial<Report> = {}): Report => ({
    id: 'report-1',
    shift_id: 'shift-1',
    revenue: null,
    orders: null,
    peak_viewer: null,
    average_viewer: null,
    comments: null,
    shares: null,
    live_duration_minutes: null,
    status: 'draft',
    metrics_confirmed: false,
    created_at: '2026-09-01T00:00:00.000Z',
    updated_at: '2026-09-01T00:00:00.000Z',
    ...overrides,
  })
  const [draft] = buildReportExportRows([report()], context)
  const [zero] = buildReportExportRows([report({ revenue: 0, orders: 0, live_duration_minutes: 0 })], context)
  const [confirmed] = buildReportExportRows([report({
    revenue: 250,
    orders: 8,
    live_duration_minutes: 45,
    status: 'confirmed',
    metrics_confirmed: true,
  })], context)

  assert.equal(draft.Revenue, '')
  assert.equal(draft.Orders, '')
  assert.equal(draft['Live Duration Minutes'], '')
  assert.equal(zero.Revenue, 0)
  assert.equal(zero.Orders, 0)
  assert.equal(zero['Live Duration Minutes'], 0)
  assert.equal(confirmed.Revenue, 250)
  assert.equal(confirmed.Orders, 8)
  assert.equal(confirmed['Live Duration Minutes'], 45)
})
