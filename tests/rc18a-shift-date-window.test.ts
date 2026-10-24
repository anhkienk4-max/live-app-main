import test from 'node:test'
import assert from 'node:assert/strict'
import { shiftDateWindowFilters } from '@/lib/utils/shiftDateWindow'

test('shift date presets use the business-local date and bound the recent view to 30 days', () => {
  const now = new Date('2026-10-20T17:30:00.000Z')
  assert.deepEqual(shiftDateWindowFilters('recent', now), { from: '2026-09-22', to: '2026-10-21' })
  assert.deepEqual(shiftDateWindowFilters('upcoming', now), { from: '2026-10-21' })
  assert.deepEqual(shiftDateWindowFilters('all', now), {})
  assert.deepEqual(shiftDateWindowFilters('month', now, '2024-02'), { from: '2024-02-01', to: '2024-02-29' })
  assert.deepEqual(shiftDateWindowFilters('custom', now, '', '2026-09-30', '2026-10-01'), { from: '2026-09-30', to: '2026-10-01' })
  for (const [mode, month, from, to] of [
    ['month', '2026-13', '', ''], ['custom', '', '2026-02-30', '2026-03-01'], ['custom', '', '2026-11-01', '2026-10-01'],
  ] as const) assert.throws(() => shiftDateWindowFilters(mode, now, month, from, to), /SHIFT_DATE_RANGE_INVALID/)
})
