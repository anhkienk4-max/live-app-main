import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import type { Report, Shift } from '../lib/types/database.types.ts'
import { isFinalizedReport, limitReportCandidates, reportQueueState, sortReportableShifts } from '../lib/utils/reportQueue.ts'
import { serializeFinalReportMetricState } from '../lib/utils/ocrMetricSerialization.ts'

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

test('Reports UI uses bounded queue/page services and exposes draft/final actions', () => {
  const listSource = readFileSync(new URL('../components/features/reports/ReportsList.tsx', import.meta.url), 'utf8')
  const formSource = readFileSync(new URL('../components/features/reports/ReportFormModal.tsx', import.meta.url), 'utf8')
  assert.match(listSource, /shiftService\.getReportCandidates\(30\)/)
  assert.doesNotMatch(listSource, /reportService\.getAll\(\)/)
  assert.doesNotMatch(listSource, /shiftService\.getAll\(\)/)
  assert.match(listSource, /<HistoryPagination/)
  assert.match(listSource, /needs-report-heading/)
  assert.match(formSource, /t\('saveDraft'\)/)
  assert.match(formSource, /reportService\.confirmMetrics\(/)
})
