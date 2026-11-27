import assert from 'node:assert/strict'
import test from 'node:test'
import { mapMonthlyResponseToWorkforceIncidentSummary } from '@/lib/services/shiftIncidentService'

test('Workforce summary adapter uses full-scope totals independently of the staff detail page', () => {
  const summary = mapMonthlyResponseToWorkforceIncidentSummary({
    month: '2026-11',
    timezone: 'Asia/Ho_Chi_Minh',
    pageLimit: 1,
    pageOffset: 0,
    totalIncidents: 20,
    totalDistinctShifts: 9,
    totalDistinctStaff: 7,
    summary: {
      pendingCount: 2,
      confirmedCount: 12,
      rejectedCount: 3,
      correctedCount: 3,
      confirmedSkipCount: 4,
      confirmedAbsentCount: 2,
      confirmedAuthorizedAbsenceCount: 1,
      confirmedLateCount: 3,
      confirmedEarlyLeaveCount: 1,
      approvedPassCount: 2,
      approvedSwapCount: 1,
      confirmedPlannedReassignmentCount: 2,
      confirmedOtherCount: 1,
      unknownLateMinutesCount: 1,
      verifiedLateMinutesTotal: 75,
    },
    staff: [{
      staff_id: 'staff-1',
      incident_count: 1,
      distinct_shift_count: 1,
      pending_count: 0,
      confirmed_count: 1,
      rejected_count: 0,
      corrected_count: 0,
      confirmed_skip_count: 1,
      confirmed_absent_count: 0,
      confirmed_authorized_absence_count: 0,
      confirmed_late_count: 0,
      confirmed_early_leave_count: 0,
      approved_pass_count: 0,
      approved_swap_count: 0,
      confirmed_planned_reassignment_count: 0,
      confirmed_other_count: 0,
      unknown_late_minutes_count: 0,
      verified_late_minutes_total: 0,
      items: [],
    }],
  })

  assert.equal(summary.confirmedSkips, 4)
  assert.equal(summary.confirmedAbsents, 2)
  assert.equal(summary.confirmedViolations, 6)
  assert.equal(summary.confirmedPunctuality, 4)
  assert.equal(summary.plannedReassignments, 2)
  assert.equal(summary.pendingReviews, 2)
  assert.equal(summary.totalVerifiedLateMinutes, 75)
  assert.equal(summary.distinctAffectedShifts, 9)
  assert.equal(summary.distinctAffectedStaff, 7)
  assert.equal(summary.staffSummaries.length, 1)
})
