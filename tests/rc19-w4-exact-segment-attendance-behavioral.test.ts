import test from 'node:test'
import assert from 'node:assert/strict'
import {
  parseStrictAttendanceTime,
  resolveAttendanceSegmentContext,
} from '../components/features/shifts/ShiftDetailModal.tsx'
import type { Shift, ShiftRegistration } from '../lib/types/database.types.ts'

test('P0.1 Exact Segment: parseStrictAttendanceTime strictly parses valid times and rejects malformed values', () => {
  // Valid time-only strings
  assert.deepEqual(parseStrictAttendanceTime('18:00'), { time: '18:00' })
  assert.deepEqual(parseStrictAttendanceTime('02:30:00'), { time: '02:30' })
  assert.deepEqual(parseStrictAttendanceTime('23:59'), { time: '23:59' })
  assert.deepEqual(parseStrictAttendanceTime('00:00'), { time: '00:00' })

  // Valid ISO timestamps in Asia/Ho_Chi_Minh
  // 15:00 UTC = 22:00 ICT on same date
  const isoUtc = parseStrictAttendanceTime('2026-11-28T15:00:00.000Z')
  assert.equal(isoUtc?.time, '22:00')
  assert.equal(isoUtc?.date, '2026-11-28')

  // 19:00 UTC = 02:00 ICT next day
  const isoOvernight = parseStrictAttendanceTime('2026-11-28T19:00:00.000Z')
  assert.equal(isoOvernight?.time, '02:00')
  assert.equal(isoOvernight?.date, '2026-11-29')

  // Malformed and invalid values MUST be rejected (return null, never slice arbitrary characters)
  assert.equal(parseStrictAttendanceTime('invalid-time'), null)
  assert.equal(parseStrictAttendanceTime('broke'), null)
  assert.equal(parseStrictAttendanceTime('25:00'), null)
  assert.equal(parseStrictAttendanceTime('12:60'), null)
  assert.equal(parseStrictAttendanceTime('18'), null)
  assert.equal(parseStrictAttendanceTime(''), null)
  assert.equal(parseStrictAttendanceTime(null), null)
  assert.equal(parseStrictAttendanceTime(undefined), null)
  assert.equal(parseStrictAttendanceTime({}), null)
})

test('P0.1 Exact Segment: Valid daytime segment resolves exact segment ID, boundaries, and index', () => {
  const shift: Shift = {
    id: 'shift-100',
    date: '2026-11-28',
    start_time: '08:00',
    end_time: '18:00',
    timezone: 'Asia/Ho_Chi_Minh',
    status: 'scheduled',
    persisted_staffing_segments: [
      {
        id: 'seg-day-1',
        shift_id: 'shift-100',
        segment_index: 1,
        start_at: '09:00',
        end_at: '13:00',
        required_host_count: 1,
        required_support_count: 1,
        required_technical_count: 1,
        planned_host_names: [],
        planned_support_names: [],
        planned_technical_names: [],
      },
    ],
  } as unknown as Shift

  const reg: ShiftRegistration = {
    id: 'reg-1',
    shift_id: 'shift-100',
    user_id: 'user-1',
    staffing_segment_id: 'seg-day-1',
    operational_role: 'host',
    status: 'approved',
  } as unknown as ShiftRegistration

  const result = resolveAttendanceSegmentContext({ shift, registration: reg })

  assert.equal(result.status, 'valid')
  assert.equal(result.isSegmented, true)
  assert.equal(result.segmentId, 'seg-day-1')
  assert.equal(result.segmentIndex, 'K1')
  assert.equal(result.startTime, '09:00')
  assert.equal(result.endTime, '13:00')
  assert.equal(result.segmentTime, '09:00–13:00')
  assert.equal(result.crossesMidnight, false)
  // Verify it did NOT use parent shift boundaries (08:00–18:00)
  assert.notEqual(result.startTime, shift.start_time)
  assert.notEqual(result.endTime, shift.end_time)
})

test('P0.1 Exact Segment: Valid overnight segment correctly identifies midnight crossing and boundaries', () => {
  const shift: Shift = {
    id: 'shift-night-100',
    date: '2026-11-28',
    start_time: '20:00',
    end_time: '04:00',
    timezone: 'Asia/Ho_Chi_Minh',
    status: 'scheduled',
    persisted_staffing_segments: [
      {
        id: 'seg-night-2',
        shift_id: 'shift-night-100',
        segment_index: 2,
        start_at: '2026-11-28T15:00:00.000Z', // 22:00 ICT
        end_at: '2026-11-28T19:00:00.000Z',   // 02:00 ICT next day
        required_host_count: 1,
        required_support_count: 1,
        required_technical_count: 1,
        planned_host_names: [],
        planned_support_names: [],
        planned_technical_names: [],
      },
    ],
  } as unknown as Shift

  const reg: ShiftRegistration = {
    id: 'reg-2',
    shift_id: 'shift-night-100',
    user_id: 'user-1',
    staffing_segment_id: 'seg-night-2',
    operational_role: 'host',
    status: 'approved',
  } as unknown as ShiftRegistration

  const result = resolveAttendanceSegmentContext({ shift, registration: reg })

  assert.equal(result.status, 'valid')
  assert.equal(result.isSegmented, true)
  assert.equal(result.segmentId, 'seg-night-2')
  assert.equal(result.segmentIndex, 'K2')
  assert.equal(result.startTime, '22:00')
  assert.equal(result.endTime, '02:00')
  assert.equal(result.segmentTime, '22:00–02:00')
  assert.equal(result.crossesMidnight, true)
  assert.equal(result.date, '2026-11-28')
})

test('P0.1 Exact Segment: Segment with invalid times blocks check-in and NEVER falls back to parent shift boundaries', () => {
  const shift: Shift = {
    id: 'shift-200',
    date: '2026-11-28',
    start_time: '09:00',
    end_time: '17:00',
    timezone: 'Asia/Ho_Chi_Minh',
    status: 'scheduled',
    persisted_staffing_segments: [
      {
        id: 'seg-broken-time',
        shift_id: 'shift-200',
        segment_index: 1,
        start_at: 'malformed_timestamp_string',
        end_at: '12:00',
        required_host_count: 1,
        required_support_count: 1,
        required_technical_count: 1,
        planned_host_names: [],
        planned_support_names: [],
        planned_technical_names: [],
      },
    ],
  } as unknown as Shift

  const reg: ShiftRegistration = {
    id: 'reg-broken',
    shift_id: 'shift-200',
    user_id: 'user-1',
    staffing_segment_id: 'seg-broken-time',
    operational_role: 'support',
    status: 'approved',
  } as unknown as ShiftRegistration

  const result = resolveAttendanceSegmentContext({ shift, registration: reg })

  // MUST return invalid_timing and block check-in
  assert.equal(result.status, 'invalid_timing')
  assert.equal(result.isSegmented, true)
  assert.equal(result.segmentId, 'seg-broken-time')
  // MUST NOT fall back to parent shift start_time (09:00) or end_time (17:00)
  assert.equal(result.startTime, '')
  assert.equal(result.endTime, '')
})

test('P0.1 Exact Segment: Missing segment on segmented shift blocks check-in and fails closed', () => {
  const shift: Shift = {
    id: 'shift-300',
    date: '2026-11-28',
    start_time: '10:00',
    end_time: '20:00',
    timezone: 'Asia/Ho_Chi_Minh',
    status: 'scheduled',
    persisted_staffing_segments: [
      {
        id: 'seg-exists',
        shift_id: 'shift-300',
        segment_index: 1,
        start_at: '10:00',
        end_at: '15:00',
        required_host_count: 1,
        required_support_count: 1,
        required_technical_count: 1,
        planned_host_names: [],
        planned_support_names: [],
        planned_technical_names: [],
      },
    ],
  } as unknown as Shift

  // Registration points to a non-existent segment ID
  const reg: ShiftRegistration = {
    id: 'reg-missing',
    shift_id: 'shift-300',
    user_id: 'user-1',
    staffing_segment_id: 'seg-does-not-exist',
    operational_role: 'host',
    status: 'approved',
  } as unknown as ShiftRegistration

  const result = resolveAttendanceSegmentContext({ shift, registration: reg })

  assert.equal(result.status, 'missing_segment')
  assert.equal(result.isSegmented, true)
  assert.equal(result.startTime, '')
  assert.equal(result.endTime, '')
})

test('P0.1 Exact Segment: Wrong-shift segment is rejected and fails closed', () => {
  const shift: Shift = {
    id: 'shift-alpha',
    date: '2026-11-28',
    start_time: '10:00',
    end_time: '18:00',
    timezone: 'Asia/Ho_Chi_Minh',
    status: 'scheduled',
    persisted_staffing_segments: [
      {
        id: 'seg-other-shift',
        shift_id: 'shift-beta', // Belongs to a different shift!
        segment_index: 1,
        start_at: '10:00',
        end_at: '14:00',
        required_host_count: 1,
        required_support_count: 1,
        required_technical_count: 1,
        planned_host_names: [],
        planned_support_names: [],
        planned_technical_names: [],
      },
    ],
  } as unknown as Shift

  const reg: ShiftRegistration = {
    id: 'reg-wrong-shift',
    shift_id: 'shift-alpha',
    user_id: 'user-1',
    staffing_segment_id: 'seg-other-shift',
    operational_role: 'host',
    status: 'approved',
  } as unknown as ShiftRegistration

  const result = resolveAttendanceSegmentContext({ shift, registration: reg })

  // Ownership mismatch MUST fail closed as missing_segment
  assert.equal(result.status, 'missing_segment')
  assert.equal(result.isSegmented, true)
  assert.equal(result.startTime, '')
})

test('P0.1 Exact Segment: Multiple assignments for same staff on same shift resolve independently with distinct boundaries', () => {
  const shift: Shift = {
    id: 'shift-multi',
    date: '2026-11-28',
    start_time: '08:00',
    end_time: '20:00',
    timezone: 'Asia/Ho_Chi_Minh',
    status: 'scheduled',
    persisted_staffing_segments: [
      {
        id: 'seg-k01',
        shift_id: 'shift-multi',
        segment_index: 1,
        start_at: '08:00',
        end_at: '14:00',
        required_host_count: 1,
        required_support_count: 1,
        required_technical_count: 1,
        planned_host_names: [],
        planned_support_names: [],
        planned_technical_names: [],
      },
      {
        id: 'seg-k02',
        shift_id: 'shift-multi',
        segment_index: 2,
        start_at: '14:00',
        end_at: '20:00',
        required_host_count: 1,
        required_support_count: 1,
        required_technical_count: 1,
        planned_host_names: [],
        planned_support_names: [],
        planned_technical_names: [],
      },
    ],
  } as unknown as Shift

  const reg1: ShiftRegistration = {
    id: 'reg-multi-1',
    shift_id: 'shift-multi',
    user_id: 'user-same',
    staffing_segment_id: 'seg-k01',
    operational_role: 'host',
    status: 'approved',
  } as unknown as ShiftRegistration

  const reg2: ShiftRegistration = {
    id: 'reg-multi-2',
    shift_id: 'shift-multi',
    user_id: 'user-same',
    staffing_segment_id: 'seg-k02',
    operational_role: 'host',
    status: 'approved',
  } as unknown as ShiftRegistration

  const res1 = resolveAttendanceSegmentContext({ shift, registration: reg1 })
  const res2 = resolveAttendanceSegmentContext({ shift, registration: reg2 })

  assert.equal(res1.status, 'valid')
  assert.equal(res1.segmentId, 'seg-k01')
  assert.equal(res1.segmentIndex, 'K1')
  assert.equal(res1.startTime, '08:00')
  assert.equal(res1.endTime, '14:00')

  assert.equal(res2.status, 'valid')
  assert.equal(res2.segmentId, 'seg-k02')
  assert.equal(res2.segmentIndex, 'K2')
  assert.equal(res2.startTime, '14:00')
  assert.equal(res2.endTime, '20:00')

  assert.notEqual(res1.segmentId, res2.segmentId)
  assert.notEqual(res1.segmentTime, res2.segmentTime)
})

test('P0.1 Exact Segment: Non-segmented shift preserves parent shift attendance', () => {
  const shift: Shift = {
    id: 'shift-legacy',
    date: '2026-11-28',
    start_time: '14:00',
    end_time: '18:00',
    timezone: 'Asia/Ho_Chi_Minh',
    status: 'scheduled',
    persisted_staffing_segments: [],
    staffing_segments: [],
  } as unknown as Shift

  const reg: ShiftRegistration = {
    id: 'reg-legacy',
    shift_id: 'shift-legacy',
    user_id: 'user-1',
    operational_role: 'host',
    status: 'approved',
  } as unknown as ShiftRegistration

  const result = resolveAttendanceSegmentContext({ shift, registration: reg })

  assert.equal(result.status, 'valid')
  assert.equal(result.isSegmented, false)
  assert.equal(result.startTime, '14:00')
  assert.equal(result.endTime, '18:00')
  assert.equal(result.date, '2026-11-28')
  assert.equal(result.segmentId, undefined)
})
