import assert from 'node:assert/strict'
import test from 'node:test'

import { requireRestoreSuccess } from '../components/features/audit/AuditHistory.tsx'
import { createRecurringShiftBatch } from '../components/features/shifts/ShiftFormDialog.tsx'
import type { Shift } from '../lib/types/database.types.ts'

const draft = (title: string): Omit<Shift, 'id' | 'created_at' | 'updated_at'> => ({
  title,
  date: '2035-01-01',
  start_time: '09:00',
  end_time: '11:00',
  brand_id: 'brand-1',
  platform_id: 'platform-1',
  status: 'scheduled',
})

test('recurring creation reports partial persistence without false success', async () => {
  const attempted: string[] = []
  const result = await createRecurringShiftBatch(
    [draft('persisted'), draft('null result'), draft('denied')],
    async shift => {
      attempted.push(shift.title || '')
      if (shift.title === 'null result') return null
      if (shift.title === 'denied') throw new Error('PERMISSION_DENIED')
      return { ...shift, id: 'shift-1', created_at: '', updated_at: '' }
    },
  )

  assert.deepEqual(attempted, ['persisted', 'null result', 'denied'])
  assert.equal(result.successCount, 1)
  assert.deepEqual(result.errors, ['Shift creation returned no persisted shift.', 'PERMISSION_DENIED'])
})

test('audit restore rejects null, denied, and thrown persistence outcomes', async () => {
  await assert.rejects(() => requireRestoreSuccess(async () => null), /failed silently/i)
  await assert.rejects(() => requireRestoreSuccess(async () => false), /failed silently/i)
  await assert.rejects(() => requireRestoreSuccess(async () => { throw new Error('STALE_WRITE') }), /STALE_WRITE/)
  await assert.doesNotReject(() => requireRestoreSuccess(async () => true))
})
