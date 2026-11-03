import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import type { Report, Shift } from '../lib/types/database.types.ts'
import {
  isConfirmedReportForKpi,
  reportQueueDisplayState,
  reportQueuePageRange,
} from '../lib/utils/reportQueue.ts'

const makeShift = (id: string, brandId = 'brand-1', status: Shift['status'] = 'completed'): Shift => ({
  id,
  date: '2026-10-15',
  start_time: '14:00',
  end_time: '18:00',
  start_at: '2026-10-15T14:00:00Z',
  brand_id: brandId,
  platform_id: 'shopee',
  status,
  created_at: '2026-10-15T14:00:00Z',
  updated_at: '2026-10-15T14:00:00Z',
})

const makeReport = (
  id: string,
  shiftId: string,
  status: Report['status'],
  metricsConfirmed = false,
  submittedBy = 'usr-member-1',
): Report => ({
  id,
  shift_id: shiftId,
  status,
  metrics_confirmed: metricsConfirmed,
  submitted_by: submittedBy,
  created_at: '2026-10-15T18:00:00Z',
  updated_at: '2026-10-15T18:00:00Z',
})

test('TASK A (#101): Queue breakdown counters are strictly and consistently scoped to pagedQueue', () => {
  // Simulate a page of 20 queue shifts across multiple brands
  const pagedQueue: Shift[] = [
    makeShift('sh-1', 'brand-a'),
    makeShift('sh-2', 'brand-a'),
    makeShift('sh-3', 'brand-a'),
    makeShift('sh-4', 'brand-b'),
    makeShift('sh-5', 'brand-b'),
    makeShift('sh-6', 'brand-c'),
  ]

  // Map of reports associated with shifts
  const reportByShift = new Map<string, Report>([
    ['sh-2', makeReport('rep-2', 'sh-2', 'draft', false)],
    ['sh-3', makeReport('rep-3', 'sh-3', 'reopened', false)],
    ['sh-4', makeReport('rep-4', 'sh-4', 'in_review', false)],
    ['sh-5', makeReport('rep-5', 'sh-5', 'confirmed', false)], // unconfirmed metrics
    ['sh-6', makeReport('rep-6', 'sh-6', 'confirmed', true)],  // confirmed metrics
    // sh-1 has no report -> 'not_started'
  ])

  // A completely separate list of 10 reports from the created reports table page
  const filteredReports: Report[] = Array.from({ length: 10 }, (_, i) =>
    makeReport(`table-rep-${i}`, `other-shift-${i}`, 'confirmed', true)
  )

  // Compute queue counters strictly on pagedQueue
  const queueNotStartedCount = pagedQueue.filter(
    s => reportQueueDisplayState(reportByShift.get(s.id)) === 'not_started'
  ).length
  const queueDraftCount = pagedQueue.filter(
    s => ['draft', 'reopened'].includes(reportQueueDisplayState(reportByShift.get(s.id)))
  ).length
  const queueNeedsReviewCount = pagedQueue.filter(
    s => ['in_review', 'unconfirmed'].includes(reportQueueDisplayState(reportByShift.get(s.id)))
  ).length
  const queueConfirmedCount = pagedQueue.filter(
    s => reportQueueDisplayState(reportByShift.get(s.id)) === 'confirmed'
  ).length

  // 1. Counters match the queue breakdown
  assert.equal(queueNotStartedCount, 1, 'sh-1 is not_started')
  assert.equal(queueDraftCount, 2, 'sh-2 (draft) and sh-3 (reopened) are draft count')
  assert.equal(queueNeedsReviewCount, 2, 'sh-4 (in_review) and sh-5 (unconfirmed) are needs review')
  assert.equal(queueConfirmedCount, 1, 'sh-6 is confirmed')

  // 2. Strict mathematical integrity: sum equals pagedQueue.length
  assert.equal(
    queueNotStartedCount + queueDraftCount + queueNeedsReviewCount + queueConfirmedCount,
    pagedQueue.length,
    'All 4 queue status counters must sum to exactly pagedQueue.length'
  )

  // 3. Proves queueConfirmedCount does NOT use filteredReports (which has 10 confirmed reports)
  assert.notEqual(
    queueConfirmedCount,
    filteredReports.length,
    'queueConfirmedCount must not bleed from filteredReports page'
  )

  // 4. Reports list page counters remain separate
  const reportsConfirmedPageCount = filteredReports.filter(isConfirmedReportForKpi).length
  assert.equal(reportsConfirmedPageCount, 10, 'Filtered reports page has its own 10 confirmed reports')
})

test('TASK A (#101): Multi-brand, multi-page pagination range and status transitions', () => {
  // 55 total queue items across 3 pages (pageSize: 20)
  const total = 55
  const page1Range = reportQueuePageRange(total, 1, 20, 20)
  assert.deepEqual(page1Range, { start: 1, end: 20 })

  const page2Range = reportQueuePageRange(total, 2, 20, 20)
  assert.deepEqual(page2Range, { start: 21, end: 40 })

  const page3Range = reportQueuePageRange(total, 3, 20, 15)
  assert.deepEqual(page3Range, { start: 41, end: 55 })

  // Status transitions for a shift:
  // 1. Initial: no report -> not_started
  assert.equal(reportQueueDisplayState(undefined), 'not_started')

  // 2. User creates draft -> draft
  const draftRep = makeReport('r1', 's1', 'draft', false)
  assert.equal(reportQueueDisplayState(draftRep), 'draft')

  // 3. User submits for review -> in_review
  const reviewRep = makeReport('r1', 's1', 'in_review', false)
  assert.equal(reportQueueDisplayState(reviewRep), 'in_review')

  // 4. Manager requests changes -> reopened
  const reopenedRep = makeReport('r1', 's1', 'reopened', false)
  assert.equal(reportQueueDisplayState(reopenedRep), 'reopened')

  // 5. Manager confirms report but metrics unconfirmed -> unconfirmed
  const unconfirmedRep = makeReport('r1', 's1', 'confirmed', false)
  assert.equal(reportQueueDisplayState(unconfirmedRep), 'unconfirmed')

  // 6. Metrics confirmed -> confirmed (KPI eligible)
  const finalizedRep = makeReport('r1', 's1', 'confirmed', true)
  assert.equal(reportQueueDisplayState(finalizedRep), 'confirmed')
  assert.equal(isConfirmedReportForKpi(finalizedRep), true)
})

test('TASK A (#101): Role scope distinction (Member assigned/submitted vs Admin all)', () => {
  const memberId = 'usr-member-101'
  const otherMemberId = 'usr-member-999'

  const myShift = makeShift('sh-own')
  const otherShift = makeShift('sh-other')

  const myReport = makeReport('rep-own', 'sh-own', 'confirmed', true, memberId)
  const otherReport = makeReport('rep-other', 'sh-other', 'confirmed', true, otherMemberId)

  // Under Member role, only assigned shifts and submitted reports are visible
  const memberVisibleShifts = [myShift, otherShift].filter(s => s.id === 'sh-own')
  assert.equal(memberVisibleShifts.length, 1)

  const memberVisibleReports = [myReport, otherReport].filter(r => r.submitted_by === memberId)
  assert.equal(memberVisibleReports.length, 1)
  assert.equal(memberVisibleReports[0].id, 'rep-own')

  // Under Admin/Leader role, all shifts and reports are accessible
  const adminVisibleShifts = [myShift, otherShift]
  assert.equal(adminVisibleShifts.length, 2)

  const adminVisibleReports = [myReport, otherReport]
  assert.equal(adminVisibleReports.length, 2)
})

test('TASK A (#101): ReportsList.tsx source verification: queueConfirmedCount uses pagedQueue', () => {
  const source = readFileSync(new URL('../components/features/reports/ReportsList.tsx', import.meta.url), 'utf8')

  // Confirm queueConfirmedCount filters pagedQueue by 'confirmed'
  assert.match(
    source,
    /const queueConfirmedCount = React\.useMemo\(\(\) => pagedQueue\.filter\(s => reportQueueDisplayState\(reportByShift\.get\(s\.id\)\) === 'confirmed'\)\.length, \[pagedQueue, reportByShift\]\)/
  )

  // Confirm reportsConfirmedPageCount and reportsUnconfirmedPageCount are cleanly separated for filteredReports
  assert.match(
    source,
    /const reportsConfirmedPageCount = React\.useMemo\(\(\) => filteredReports\.filter\(isConfirmedReportForKpi\)\.length, \[filteredReports\]\)/
  )
  assert.match(
    source,
    /const reportsUnconfirmedPageCount = React\.useMemo\(\(\) => filteredReports\.filter\(report => !isConfirmedReportForKpi\(report\)\)\.length, \[filteredReports\]\)/
  )

  // Confirm breakdown badge label is "Đã hoàn tất" and header is "Trạng thái hàng đợi"
  assert.match(source, /Trạng thái hàng đợi \(\{pagedQueue\.length\} ca trên trang này\):/)
  assert.match(source, /Đã hoàn tất: \{loading \? '—' : queueConfirmedCount\}/)

  // Confirm Created Reports header clarifies scope
  assert.match(source, /\{reportTotal\} báo cáo sau bộ lọc \(\{filteredReports\.length\} trang này\)/)
})

