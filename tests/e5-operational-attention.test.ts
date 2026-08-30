import test, { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  deriveShiftAttention,
  deriveSwapAttention,
  deriveDataQualityAttention,
  deriveReportAttention,
  deriveStaffingAttention,
  sortOperationalAttention,
  type ShiftAttentionInput,
  type SwapAttentionInput,
} from '../lib/ui/operational-attention'
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
})
