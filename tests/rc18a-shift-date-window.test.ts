import test from 'node:test'
import assert from 'node:assert/strict'
import { shiftDateWindowFilters } from '@/lib/utils/shiftDateWindow'

test('shift date presets use the business-local date and bound the recent view to 30 days', () => {
  const now = new Date('2026-10-20T17:30:00.000Z')
  assert.deepEqual(shiftDateWindowFilters('recent', now), { from: '2026-09-22', to: '2026-10-21' })
  assert.deepEqual(shiftDateWindowFilters('upcoming', now), { from: '2026-10-21' })
  assert.deepEqual(shiftDateWindowFilters('all', now), {})
})
