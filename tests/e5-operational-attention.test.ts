import test, { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  deriveShiftAttention,
  deriveSwapAttention,
  deriveDataQualityAttention,
  type ShiftAttentionInput,
  type SwapAttentionInput,
} from '../lib/ui/operational-attention'
import type { SwapStatus } from '../lib/types/database.types'

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
      assert.equal(result[0].label, 'Pending registrations')
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
      assert.equal(result[0].label, 'Staffing gap')
      assert.equal(result[0].description, 'Missing Support, Technical')
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

  await t.test('deriveSwapAttention', async (t) => {
    await t.test('returns nothing for terminal states (completed/cancelled)', () => {
      const statuses: SwapStatus[] = ['completed', 'cancelled']
      
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
      assert.equal(result[0].label, 'Swap requires your response')
    })

    await t.test('returns info when not actionable by current user but in active state', () => {
      const result = deriveSwapAttention({
        swapId: '1',
        status: 'pending',
        actorHasValidAction: false,
      })
      assert.equal(result.length, 1)
      assert.equal(result[0].severity, 'info')
      assert.equal(result[0].label, 'Swap pending response')
    })
  })

  await t.test('deriveDataQualityAttention', async (t) => {
    await t.test('returns critical when there are critical issues in scope', () => {
      const result = deriveDataQualityAttention(1, 0, 0)
      assert.equal(result.length, 1)
      assert.equal(result[0].severity, 'critical')
      assert.equal(result[0].label, 'Data quality errors')
      assert.equal(result[0].count, 1)
    })

    await t.test('returns warning when there are warning issues in scope', () => {
      const result = deriveDataQualityAttention(0, 1, 0)
      assert.equal(result.length, 1)
      assert.equal(result[0].severity, 'warning')
      assert.equal(result[0].label, 'Data quality warnings')
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
})
