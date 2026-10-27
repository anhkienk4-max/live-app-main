import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import type { Report, Shift } from '../lib/types/database.types.ts'
import { isFinalizedReport, limitReportCandidates, reportQueueState, reportQueueDisplayState, reportQueuePageRange, sortReportableShifts } from '../lib/utils/reportQueue.ts'
import { reportMetricState, serializeFinalReportMetricState } from '../lib/utils/ocrMetricSerialization.ts'

const shift = (id: string, startAt: string, status: Shift['status'] = 'completed'): Shift => ({
  id,
  date: startAt.slice(0, 10),
  start_time: startAt.slice(11, 16),
  end_time: '12:00',
  start_at: startAt,
  brand_id: 'brand-1',
  platform_id: 'platform-1',
  status,
  created_at: startAt,
  updated_at: startAt,
})

const report = (status: Report['status'], metricsConfirmed = false): Report => ({
  id: `report-${status}`,
  shift_id: 'shift-1',
  status,
  metrics_confirmed: metricsConfirmed,
  created_at: '2026-09-01T00:00:00.000Z',
  updated_at: '2026-09-01T00:00:00.000Z',
})

test('sorts reportable shifts by authoritative start timestamp descending', () => {
  const sorted = sortReportableShifts([
    shift('old', '2026-08-01T10:00:00.000Z'),
    shift('new', '2026-09-01T10:00:00.000Z'),
  ])
  assert.deepEqual(sorted.map(item => item.id), ['new', 'old'])
})

test('report candidate limit is bounded at 30', () => {
  const candidates = Array.from({ length: 31 }, (_, index) => shift(String(index), `2026-09-${String(index + 1).padStart(2, '0')}T10:00:00.000Z`))
  assert.equal(limitReportCandidates(candidates, 100).length, 30)
})

test('queue state keeps missing and draft reports pending', () => {
  assert.equal(reportQueueState(undefined), 'not_started')
  assert.equal(reportQueueState(report('draft')), 'draft')
})

test('confirmed reports are finalized and excluded from the queue', () => {
  assert.equal(isFinalizedReport(report('confirmed', true)), true)
  assert.equal(reportQueueState(report('confirmed', true)), 'finalized')
})

test('draft serialization preserves missing metrics as undefined and explicit zero', () => {
  const empty = serializeFinalReportMetricState('shopee_live', {})
  const zero = serializeFinalReportMetricState('shopee_live', { shares: 0 })
  assert.equal(empty.shares, undefined)
  assert.equal(empty.comments, undefined)
  assert.equal(zero.shares, 0)
})

test('draft continuation hydration preserves NULL versus explicit zero', () => {
  const values = reportMetricState({
    id: 'report-1',
    shift_id: 'shift-1',
    revenue: null,
    orders: 0,
    peak_viewer: null,
    average_viewer: null,
    comments: null,
    shares: 0,
    dashboard_platform: 'shopee_live',
    created_at: '2026-09-01T00:00:00.000Z',
    updated_at: '2026-09-01T00:00:00.000Z',
  })
  assert.equal(values.sales, undefined)
  assert.equal(values.orders, 0)
  assert.equal(values.comments, undefined)
  assert.equal(values.shares, 0)
})

test('Reports UI uses bounded queue/page services and exposes draft/final actions', () => {
  const listSource = readFileSync(new URL('../components/features/reports/ReportsList.tsx', import.meta.url), 'utf8')
  const formSource = readFileSync(new URL('../components/features/reports/ReportFormModal.tsx', import.meta.url), 'utf8')
  assert.match(listSource, /getReportObligationPage\(\{ page: queuePage, pageSize: queuePageSize/)
  assert.doesNotMatch(listSource, /shiftService\.getReportCandidates\(30\)/)
  assert.match(listSource, /total=\{queueTotal\}/)
  assert.doesNotMatch(listSource, /reportService\.getAll\(\)/)
  assert.doesNotMatch(listSource, /shiftService\.getAll\(\)/)
  assert.match(listSource, /<HistoryPagination/)
  assert.match(listSource, /needs-report-heading/)
  assert.match(formSource, /t\('saveDraft'\)/)
  assert.match(formSource, /reportService\.confirmMetrics\(/)
})

test('draft continuation opens the editable form and hydrates the existing report', () => {
  const listSource = readFileSync(new URL('../components/features/reports/ReportsList.tsx', import.meta.url), 'utf8')
  const formSource = readFileSync(new URL('../components/features/reports/ReportFormModal.tsx', import.meta.url), 'utf8')
  assert.match(listSource, /setEditingReport\(report\); setShowForm\(true\)/)
  assert.match(listSource, /initialReport=\{editingReport\}/)
  assert.match(formSource, /initialReport\?: Report/)
  assert.match(formSource, /setMetricValues\(initialReport \? reportMetricState\(initialReport\) : \{\}\)/)
  assert.match(formSource, /reportService\.update\(\s*existingReport\.id,\s*payload,\s*existingReport\.version_number,\s*currentUser\.id,\s*'Saved report draft',\s*'save',\s*\)/)
  assert.match(formSource, /serializeFinalReportMetricState\(dashboardPlatform, metricValues\)/)
})

test('REPORT-02 queue page count does not impersonate global total for 0, 1, 20, 101 or 864', () => {
  assert.deepEqual(reportQueuePageRange(0, 1, 20, 0), { start: 0, end: 0 })
  assert.deepEqual(reportQueuePageRange(1, 1, 20, 1), { start: 1, end: 1 })
  assert.deepEqual(reportQueuePageRange(20, 1, 20, 20), { start: 1, end: 20 })
  assert.deepEqual(reportQueuePageRange(101, 1, 20, 20), { start: 1, end: 20 })
  assert.deepEqual(reportQueuePageRange(101, 6, 20, 1), { start: 101, end: 101 })
  assert.deepEqual(reportQueuePageRange(864, 1, 20, 20), { start: 1, end: 20 })
})
test('REPORT-02 states: not started, Draft, In Review, Reopened, Unconfirmed, Confirmed', () => {
  assert.equal(reportQueueDisplayState(undefined), 'not_started')
  assert.equal(reportQueueDisplayState(report('draft')), 'draft')
  assert.equal(reportQueueDisplayState(report('in_review')), 'in_review')
  assert.equal(reportQueueDisplayState(report('reopened')), 'reopened')
  assert.equal(reportQueueDisplayState(report('confirmed', false)), 'unconfirmed')
  assert.equal(reportQueueDisplayState(report('confirmed', true)), 'confirmed')
})
test('REPORT-02 confirmed financial KPI is page scoped and excludes Draft/Unconfirmed', () => {
  const list = readFileSync(new URL('../components/features/reports/ReportsList.tsx', import.meta.url),'utf8')
  assert.match(list, /report\.status === 'confirmed' && report\.metrics_confirmed === true/)
  assert.match(list, /confirmedOrders > 0 \? totalRevenue \/ confirmedOrders : null/)
  assert.match(list, /Doanh thu đã xác nhận · trang này/)
  assert.match(list, /Báo cáo chưa xác nhận · trang này/)
  assert.match(list, /readOnlyQueueItem \? t\('viewDetails'\)/)
  assert.match(list, /reportQueueDisplayState\(report\)/)
})
