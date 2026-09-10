import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { calendarAuthorityScope, calendarDataScope } from '../lib/utils/calendarRange.ts'

test('calendar scopes normal views to their visible business dates', () => {
  const date = new Date('2026-10-14T12:00:00.000Z')
  assert.deepEqual(calendarDataScope('month', date, 'all'), {
    startDate: '2026-09-27', endDate: '2026-10-31', allTime: false,
  })
  assert.deepEqual(calendarDataScope('week', date, 'all'), {
    startDate: '2026-10-11', endDate: '2026-10-17', allTime: false,
  })
  assert.deepEqual(calendarDataScope('day', date, 'all'), {
    startDate: '2026-10-14', endDate: '2026-10-14', allTime: false,
  })
  assert.deepEqual(calendarDataScope('list', date, 'current_month'), {
    startDate: '2026-10-01', endDate: '2026-10-31', allTime: false,
  })
})

test('explicit list All Time and custom ranges retain their semantics', () => {
  const date = new Date('2026-10-14T12:00:00.000Z')
  assert.equal(calendarDataScope('list', date, 'all').allTime, true)
  assert.equal(calendarDataScope('month', date, 'all', '', '', true).allTime, true)
  assert.deepEqual(calendarDataScope('list', date, 'today', '', '', false, '2026-10-14'), {
    startDate: '2026-10-14', endDate: '2026-10-14', allTime: false,
  })
  assert.deepEqual(calendarDataScope('list', date, 'custom', '2026-09-30', '2026-10-01'), {
    startDate: '2026-09-30', endDate: '2026-10-01', allTime: false,
  })
  assert.deepEqual(calendarAuthorityScope({ startDate: '2026-09-30', endDate: '2026-10-01', allTime: false }), {
    startDate: '2026-09-29', endDate: '2026-10-02', allTime: false,
  })
})

test('CalendarView uses scoped operational reads, cached references, and latest-response guards', () => {
  const source = readFileSync('components/features/calendar/CalendarView.tsx', 'utf8')
  assert.match(source, /shiftService\.getInRange\(authorityScope\.startDate, authorityScope\.endDate\)/)
  assert.match(source, /shiftRegistrationService\.getForShifts\(shiftIds\)/)
  assert.match(source, /reportService\.getForShifts\(shiftIds\)/)
  assert.match(source, /if \(referenceLoad\.current\) return referenceLoad\.current/)
  assert.match(source, /if \(version !== requestVersion\.current\) return/)
  assert.match(source, /if \(initialLoad\) setLoading\(true\)/)
})
