import assert from 'node:assert/strict'
import test from 'node:test'
import { shiftIncidentService, ShiftIncidentServiceError } from '../lib/services/shiftIncidentService.ts'
import type { WorkforceIncidentMonthlyResponse } from '../lib/types/workforceIncidentMonth.ts'

test('D3 server aggregation: preserves server-authoritative monthly total when total incidents exceed page size', async () => {
  const originalEnv = { ...process.env }
  const originalFetch = globalThis.fetch
  try {
    process.env.NODE_ENV = 'development'
    process.env.NEXT_PUBLIC_USE_MOCK_DATA = 'false' // Force Supabase HTTP client branch

    const mockResponse: WorkforceIncidentMonthlyResponse = {
      month: '2026-11',
      timezone: 'Asia/Ho_Chi_Minh',
      pageLimit: 50,
      pageOffset: 0,
      totalIncidents: 150, // 150 total incidents in month, exceeding pageLimit 50
      totalDistinctShifts: 65,
      totalDistinctStaff: 2,
      summary: {
        pendingCount: 7,
        confirmedCount: 135,
        rejectedCount: 5,
        correctedCount: 3,
        confirmedSkipCount: 18,
        confirmedAbsentCount: 9,
        confirmedAuthorizedAbsenceCount: 3,
        confirmedLateCount: 75,
        confirmedEarlyLeaveCount: 22,
        approvedPassCount: 5,
        approvedSwapCount: 3,
        confirmedPlannedReassignmentCount: 0,
        confirmedOtherCount: 0,
        unknownLateMinutesCount: 4,
        verifiedLateMinutesTotal: 830,
      },
      staff: [
        {
          staff_id: 'staff-01',
          incident_count: 80,
          distinct_shift_count: 40,
          pending_count: 5,
          confirmed_count: 70,
          rejected_count: 3,
          corrected_count: 2,
          confirmed_skip_count: 10,
          confirmed_absent_count: 5,
          confirmed_authorized_absence_count: 2,
          confirmed_late_count: 40,
          confirmed_early_leave_count: 10,
          approved_pass_count: 2,
          approved_swap_count: 1,
          unknown_late_minutes_count: 3,
          verified_late_minutes_total: 450,
          items: Array.from({ length: 30 }, (_, i) => ({
            incidentId: `inc-01-${i}`,
            shiftId: `shift-01-${i}`,
            staffingSegmentId: null,
            role: 'host' as const,
            businessDate: '2026-11-05',
            type: 'late' as const,
            reviewState: 'confirmed' as const,
            verifiedLateMinutes: 15,
            version: 1,
          })),
        },
        {
          staff_id: 'staff-02',
          incident_count: 70,
          distinct_shift_count: 35,
          pending_count: 2,
          confirmed_count: 65,
          rejected_count: 2,
          corrected_count: 1,
          confirmed_skip_count: 8,
          confirmed_absent_count: 4,
          confirmed_authorized_absence_count: 1,
          confirmed_late_count: 35,
          confirmed_early_leave_count: 12,
          approved_pass_count: 3,
          approved_swap_count: 2,
          unknown_late_minutes_count: 1,
          verified_late_minutes_total: 380,
          items: Array.from({ length: 20 }, (_, i) => ({
            incidentId: `inc-02-${i}`,
            shiftId: `shift-02-${i}`,
            staffingSegmentId: null,
            role: 'support' as const,
            businessDate: '2026-11-10',
            type: 'late' as const,
            reviewState: 'confirmed' as const,
            verifiedLateMinutes: 10,
            version: 1,
          })),
        },
      ],
    }

    let capturedUrl = ''
    globalThis.fetch = async (input) => {
      capturedUrl = String(input)
      return new Response(JSON.stringify(mockResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    const summary = await shiftIncidentService.getWorkforceSummary({
      month: '2026-11',
      employeeId: 'staff-01',
      role: 'host',
      brandId: 'brand-alpha',
    })

    // Assert that the request parameters match the query schema
    assert.match(capturedUrl, /month=2026-11/)
    assert.match(capturedUrl, /staff_id=staff-01/)
    assert.match(capturedUrl, /role=host/)
    assert.match(capturedUrl, /brand_id=brand-alpha/)

    // Assert server-authoritative monthly total (NOT truncated to the 50 paged items)
    assert.equal(summary.totalIncidents, 150)
    assert.equal(summary.month, '2026-11')

    // Assert aggregate counts computed from server-authoritative staff records
    assert.equal(summary.confirmedSkips, 18)
    assert.equal(summary.confirmedAbsents, 9)
    assert.equal(summary.authorizedAbsences, 3)
    assert.equal(summary.confirmedViolations, 27)
    assert.equal(summary.confirmedLates, 75)
    assert.equal(summary.confirmedEarlyLeaves, 22)
    assert.equal(summary.confirmedPunctuality, 97)
    assert.equal(summary.approvedPasses, 5)
    assert.equal(summary.approvedSwaps, 3)
    assert.equal(summary.approvedChanges, 8)
    assert.equal(summary.totalVerifiedLateMinutes, 830)
    assert.equal(summary.unknownDurationCount, 4)
    assert.equal(summary.distinctAffectedStaff, 2)
    assert.equal(summary.distinctAffectedShifts, 65)
  } finally {
    process.env = originalEnv
    globalThis.fetch = originalFetch
  }
})

test('D3 server aggregation: returns SCHEMA_NOT_DEPLOYED when endpoint returns 404 or 503', async () => {
  const originalEnv = { ...process.env }
  const originalFetch = globalThis.fetch
  try {
    process.env.NODE_ENV = 'development'
    process.env.NEXT_PUBLIC_USE_MOCK_DATA = 'false'

    globalThis.fetch = async () => new Response('Not Found', { status: 404 })

    await assert.rejects(
      async () => {
        await shiftIncidentService.getWorkforceSummary({ month: '2026-11' })
      },
      (err: unknown) => {
        assert.ok(err instanceof ShiftIncidentServiceError)
        assert.equal(err.code, 'SCHEMA_NOT_DEPLOYED')
        return true
      },
    )
  } finally {
    process.env = originalEnv
    globalThis.fetch = originalFetch
  }
})
