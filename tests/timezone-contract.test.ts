import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import {
  DEFAULT_BUSINESS_TIMEZONE,
  businessLocalDate,
  inspectShiftTimeConsistency,
  isValidIanaTimeZone,
  resolveShiftDateTime,
  shiftDateTimeFields,
} from '../lib/utils/shiftUtils.ts'

test('normal business-local shift resolves to canonical UTC instants', () => {
  const resolved = resolveShiftDateTime('2026-08-25', '14:00', '16:00')
  assert.ok(resolved?.valid)
  assert.equal(resolved?.timezone, DEFAULT_BUSINESS_TIMEZONE)
  assert.equal(resolved?.startAt.toISOString(), '2026-08-25T07:00:00.000Z')
  assert.equal(resolved?.endAt.toISOString(), '2026-08-25T09:00:00.000Z')
  assert.equal(resolved?.startDate, '2026-08-25')
  assert.equal(resolved?.endDate, '2026-08-25')
  assert.equal(resolved?.durationMinutes, 120)
})

test('overnight shifts preserve business end date and deterministic duration', () => {
  const resolved = resolveShiftDateTime('2026-08-25', '22:00', '02:00')
  assert.ok(resolved?.valid)
  assert.equal(resolved?.crossesMidnight, true)
  assert.equal(resolved?.endDate, '2026-08-26')
  assert.equal(resolved?.endAt.toISOString(), '2026-08-25T19:00:00.000Z')
  assert.equal(resolved?.durationMinutes, 240)
  assert.deepEqual(shiftDateTimeFields('2026-08-25', '22:00', '02:00'), {
    start_at: '2026-08-25T15:00:00.000Z',
    end_at: '2026-08-25T19:00:00.000Z',
    end_date: '2026-08-26',
    crosses_midnight: true,
    duration_minutes: 240,
  })
})

test('IANA zones, UTC boundaries and invalid zones are handled without browser timezone leakage', () => {
  const utc = resolveShiftDateTime('2026-08-25', '23:30', '00:30', 'UTC')
  assert.ok(utc?.valid)
  assert.equal(utc?.startAt.toISOString(), '2026-08-25T23:30:00.000Z')
  assert.equal(utc?.endAt.toISOString(), '2026-08-26T00:30:00.000Z')
  const newYork = resolveShiftDateTime('2026-07-01', '09:00', '10:00', 'America/New_York')
  assert.equal(newYork?.startAt.toISOString(), '2026-07-01T13:00:00.000Z')
  assert.equal(isValidIanaTimeZone('America/New_York'), true)
  assert.equal(isValidIanaTimeZone('Not/AZone'), false)
  assert.equal(resolveShiftDateTime('2026-08-25', '09:00', '10:00', 'Not/AZone'), null)
  const utcBoundary = new Date('2026-08-25T23:30:00.000Z')
  assert.equal(businessLocalDate(utcBoundary), '2026-08-26')
  assert.equal(businessLocalDate(utcBoundary, 'America/New_York'), '2026-08-25')
})

test('time consistency inspection reports mismatches without rewriting persisted projections', () => {
  const consistent = inspectShiftTimeConsistency({
    date: '2026-08-25', start_time: '14:00', end_time: '16:00', timezone: DEFAULT_BUSINESS_TIMEZONE,
    start_at: '2026-08-25T07:00:00.000Z', end_at: '2026-08-25T09:00:00.000Z', end_date: '2026-08-25',
    crosses_midnight: false, duration_minutes: 120,
  })
  assert.equal(consistent.consistent, true)
  const inconsistent = inspectShiftTimeConsistency({
    date: '2026-08-25', start_time: '14:00', end_time: '16:00', timezone: DEFAULT_BUSINESS_TIMEZONE,
    start_at: '2026-08-25T14:00:00.000Z', end_at: '2026-08-25T16:00:00.000Z', end_date: '2026-08-26',
    crosses_midnight: true, duration_minutes: 60,
  })
  assert.deepEqual(inconsistent.mismatches, ['start_at', 'end_at', 'end_date', 'crosses_midnight', 'duration_minutes'])
  assert.equal(inconsistent.expected?.start_at, '2026-08-25T07:00:00.000Z')
})

test('timezone migration validates IANA zones and uses dynamic AT TIME ZONE', () => {
  const sql = readFileSync(resolve(process.cwd(), 'supabase/migrations/20260829120000_core_v1_timezone_contract.sql'), 'utf8')
  assert.match(sql, /pg_catalog\.pg_timezone_names/i)
  assert.match(sql, /new\.start_at\s*:=\s*\(new\.date \+ new\.start_time\) at time zone new\.timezone/i)
  assert.match(sql, /new\.end_at\s*:=\s*\(new\.end_date \+ new\.end_time\) at time zone new\.timezone/i)
  assert.doesNotMatch(sql, /timezone\s*=\s*'Asia\/Ho_Chi_Minh'/i)
  assert.match(sql, /shifts_timezone_check[\s\S]*not valid/i)
})
