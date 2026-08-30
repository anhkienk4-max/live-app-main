import test, { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  deriveShiftAttention,
  deriveSwapAttention,
  deriveDataQualityAttention,
  deriveReportAttention,
  deriveStaffingAttention,
  deriveLeaderAttention,
  deriveMemberAttention,
  sortOperationalAttention,
  type ShiftAttentionInput,
  type SwapAttentionInput,
} from '../lib/ui/operational-attention'
import { getCurrentBusinessDate } from '../lib/utils/shiftUtils'
import type { SwapStatus, ReportStatus } from '../lib/types/database.types'

test('E5 Operational Attention Derivation', async (t) => {
  await t.test('deriveShiftAttention', async (t) => {
    await t.test('returns empty for cancelled shift', () => {
      const result = deriveShiftAttention({
        shiftId: '1',
        shiftDate: '2026-08-30',
        shiftStatus: 'cancelled',
        pendingCount: 1,
        isUpcoming: true,
        required: { host: 1, support: 0, technical: 0 },
        staffed: { host: 0, support: 0, technical: 0 },
      })
      assert.equal(result.length, 0)
    })

    await t.test('returns warning for pending registrations', () => {
      const result = deriveShiftAttention({
        shiftId: '1',
        shiftDate: '2026-08-30',
        shiftStatus: 'scheduled',
        pendingCount: 2,
        isUpcoming: true,
        required: { host: 1, support: 0, technical: 0 },
        staffed: { host: 1, support: 0, technical: 0 },
      })
      assert.equal(result.length, 1)
      assert.equal(result[0].severity, 'warning')
      assert.equal(result[0].label, 'pendingRegistrations')
      assert.equal(result[0].count, 2)
    })

    await t.test('returns attention for staffing gaps on upcoming shifts', () => {
      const result = deriveShiftAttention({
        shiftId: '1',
        shiftDate: '2026-08-30',
        shiftStatus: 'scheduled',
        pendingCount: 0,
        isUpcoming: true,
        required: { host: 1, support: 1, technical: 1 },
        staffed: { host: 1, support: 0, technical: 0 },
      })
      assert.equal(result.length, 1)
      assert.equal(result[0].severity, 'attention')
      assert.equal(result[0].label, 'staffingGap')
      assert.equal(result[0].description, 'missingRoles')
    })

    await t.test('does not return staffing gap attention for past shifts', () => {
      const result = deriveShiftAttention({
        shiftId: '1',
        shiftDate: '2026-08-01',
        shiftStatus: 'scheduled',
        pendingCount: 0,
        isUpcoming: false,
        required: { host: 1, support: 1, technical: 1 },
        staffed: { host: 0, support: 0, technical: 0 },
      })
      assert.equal(result.length, 0)
    })
  })

  await t.test('deriveStaffingAttention', async (t) => {
    await t.test('returns nothing when pending count is zero', () => {
      const result = deriveStaffingAttention({ pendingCount: 0 })
      assert.equal(result.length, 0)
    })
    
    await t.test('returns warning when there are pending registrations', () => {
      const result = deriveStaffingAttention({ pendingCount: 3 })
      assert.equal(result.length, 1)
      assert.equal(result[0].severity, 'warning')
      assert.equal(result[0].label, 'staffingDecisionsNeeded')
      assert.equal(result[0].count, 3)
    })
  })

  await t.test('deriveSwapAttention', async (t) => {
    await t.test('returns nothing for terminal states (completed/cancelled/rejected/approved)', () => {
      const statuses: SwapStatus[] = ['completed', 'cancelled', 'rejected', 'approved']
      
      statuses.forEach(status => {
        const result = deriveSwapAttention({
          swapId: '1',
          status,
          actorHasValidAction: false,
        })
        assert.equal(result.length, 0)
      })
    })

    await t.test('returns warning when actionable by current user', () => {
      const result = deriveSwapAttention({
        swapId: '1',
        status: 'pending',
        actorHasValidAction: true,
      })
      assert.equal(result.length, 1)
      assert.equal(result[0].severity, 'warning')
      assert.equal(result[0].label, 'swapRequiresResponse')
    })

    await t.test('returns info when not actionable by current user but in active state', () => {
      const result = deriveSwapAttention({
        swapId: '1',
        status: 'pending',
        actorHasValidAction: false,
      })
      assert.equal(result.length, 1)
      assert.equal(result[0].severity, 'info')
      assert.equal(result[0].label, 'swapPendingResponse')
    })
  })

  await t.test('deriveDataQualityAttention', async (t) => {
    await t.test('returns critical when there are critical issues in scope', () => {
      const result = deriveDataQualityAttention(1, 0, 0)
      assert.equal(result.length, 1)
      assert.equal(result[0].severity, 'critical')
      assert.equal(result[0].label, 'dataQualityErrors')
      assert.equal(result[0].count, 1)
    })

    await t.test('returns warning when there are warning issues in scope', () => {
      const result = deriveDataQualityAttention(0, 1, 0)
      assert.equal(result.length, 1)
      assert.equal(result[0].severity, 'warning')
      assert.equal(result[0].label, 'dataQualityWarnings')
      assert.equal(result[0].count, 1)
    })
    
    await t.test('returns both when errors and warnings exist', () => {
      const result = deriveDataQualityAttention(2, 1, 0)
      assert.equal(result.length, 2)
      assert.equal(result[0].severity, 'critical')
      assert.equal(result[0].count, 2)
      assert.equal(result[1].severity, 'warning')
      assert.equal(result[1].count, 1)
    })

    await t.test('returns nothing when counts are zero', () => {
      const result = deriveDataQualityAttention(0, 0, 0)
      assert.equal(result.length, 0)
    })
  })

  await t.test('deriveReportAttention', async (t) => {
    await t.test('returns nothing for confirmed or archived reports', () => {
      const statuses: ReportStatus[] = ['confirmed', 'archived']
      statuses.forEach(status => {
        const result = deriveReportAttention('1', status, '2026-08-30')
        assert.equal(result.length, 0)
      })
    })

    await t.test('returns warning for reopened reports', () => {
      const result = deriveReportAttention('1', 'reopened', '2026-08-30')
      assert.equal(result.length, 1)
      assert.equal(result[0].severity, 'warning')
      assert.equal(result[0].label, 'reportNeedsAttention')
    })

    await t.test('returns warning for draft reports', () => {
      const result = deriveReportAttention('1', 'draft', '2026-08-30')
      assert.equal(result.length, 1)
      assert.equal(result[0].severity, 'warning')
      assert.equal(result[0].label, 'reportDraftNeedsCompletion')
    })

    await t.test('returns info for in_review reports', () => {
      const result = deriveReportAttention('1', 'in_review', '2026-08-30')
      assert.equal(result.length, 1)
      assert.equal(result[0].severity, 'info')
      assert.equal(result[0].label, 'reportPendingReview')
    })
  })

  await t.test('sortOperationalAttention', async (t) => {
    await t.test('sorts by severity according to SEVERITY_ORDER', () => {
      const unsorted = [
        { key: '3', severity: 'info', label: 'C' },
        { key: '1', severity: 'critical', label: 'A' },
        { key: '4', severity: 'success', label: 'D' },
        { key: '2', severity: 'warning', label: 'B' },
      ] as any[]
      const sorted = sortOperationalAttention(unsorted)
      assert.equal(sorted[0].severity, 'critical')
      assert.equal(sorted[1].severity, 'warning')
      assert.equal(sorted[2].severity, 'info')
      assert.equal(sorted[3].severity, 'success')
    })
  })

  await t.test('deriveLeaderAttention', async (t) => {
    await t.test('aggregates E5 explicit swap counts correctly', () => {
      const summary = deriveLeaderAttention({
        pendingRegistrationCount: 0,
        actionableSwapCount: 1,
        waitingSwapCount: 2,
        pendingReportCount: 0,
        dqErrorCount: 0,
      })
      
      assert.equal(summary.items.length, 2)
      assert.equal(summary.items[0].severity, 'warning')
      assert.equal(summary.items[0].label, 'swapDecisionsNeeded')
      assert.equal(summary.items[0].count, 1)

      assert.equal(summary.items[1].severity, 'info')
      assert.equal(summary.items[1].label, 'swapPendingParticipant')
      assert.equal(summary.items[1].count, 2)
    })
  })

  await t.test('deriveMemberAttention', async (t) => {
    await t.test('aggregates explicit actionable vs waiting swap counts correctly', () => {
      const summary = deriveMemberAttention({
        pendingRegistrationCount: 0,
        actionableSwapCount: 1,
        waitingSwapCount: 1,
        hasUpcomingShift: true,
      })
      
      assert.equal(summary.items.length, 2)
      assert.equal(summary.items[0].severity, 'warning')
      assert.equal(summary.items[0].label, 'swapRequiresResponse')
      assert.equal(summary.items[0].count, 1)

      assert.equal(summary.items[1].severity, 'info')
      assert.equal(summary.items[1].label, 'swapRequestPending')
      assert.equal(summary.items[1].count, 1)
    })
  })

  await t.test('getCurrentBusinessDate', async (t) => {
    await t.test('returns expected local date around midnight for Asia/Ho_Chi_Minh', () => {
      // 2026-08-30T23:59:00+07:00 (16:59 UTC)
      const lateNight = new Date(Date.UTC(2026, 7, 30, 16, 59, 0))
      assert.equal(getCurrentBusinessDate('Asia/Ho_Chi_Minh', lateNight), '2026-08-30')

      // 2026-08-31T00:01:00+07:00 (17:01 UTC)
      const justAfterMidnight = new Date(Date.UTC(2026, 7, 30, 17, 1, 0))
      assert.equal(getCurrentBusinessDate('Asia/Ho_Chi_Minh', justAfterMidnight), '2026-08-31')
    })
    
    await t.test('returns expected local date for New York across boundaries', () => {
      // 2026-08-30T23:59:00-04:00 (03:59 UTC on 31st)
      const lateNightNY = new Date(Date.UTC(2026, 7, 31, 3, 59, 0))
      assert.equal(getCurrentBusinessDate('America/New_York', lateNightNY), '2026-08-30')
      
      // 2026-08-31T00:01:00-04:00 (04:01 UTC on 31st)
      const midnightNY = new Date(Date.UTC(2026, 7, 31, 4, 1, 0))
      assert.equal(getCurrentBusinessDate('America/New_York', midnightNY), '2026-08-31')
    })
  })
})
