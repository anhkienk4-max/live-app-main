import assert from 'node:assert/strict'
import test from 'node:test'
import { Shift, ShiftRegistration, User, SwapRequest, Report } from '../lib/types/database.types'
import {
  isCanonicalAssignedShift,
  getMemberAssignedShifts,
  getMemberPendingRegistrations,
  getMemberPendingSwaps,
  getLeaderPendingRegistrations,
  getLeaderPendingReports,
  getLeaderPendingSwaps
} from '../lib/ui/dashboard-role-data'

const mockShift = (id: string, date = '2026-08-30', start_time = '12:00:00'): Shift => ({
  id,
  brand_id: 'b1',
  campaign_id: 'c1',
  date,
  start_time,
  end_time: '14:00:00',
  platform_id: 'p1',
  status: 'scheduled',
  title: `Shift ${id}`,
  allow_multi_role: false,
  created_at: '',
  updated_at: ''
} as unknown as Shift)

const mockRegistration = (id: string, shift_id: string, user_id: string, status: any): ShiftRegistration => ({
  id,
  shift_id,
  user_id,
  status,
  operational_role: 'host',
  source: 'self_registration',
  requested_at: '',
  created_at: '',
  updated_at: ''
})

const mockSwap = (id: string, status: any, requester_id: string, counterpart_id: string | null, shift_id: string, source_shift_id?: string, target_shift_id?: string | null): SwapRequest => ({
  id,
  status,
  requester_id,
  counterpart_id,
  shift_id,
  source_shift_id,
  target_shift_id,
  reason: 'test',
  created_at: '',
  updated_at: ''
} as unknown as SwapRequest)

const mockReport = (id: string, shift_id: string, status: any): Report => ({
  id,
  shift_id,
  status,
  revenue: 0,
  orders: 0,
  peak_viewer: 0,
  average_viewer: 0,
  comments: 0,
  shares: 0,
  created_at: '',
  updated_at: ''
} as unknown as Report)

// MEMBER TESTS
test('Member: approved registration -> assigned', () => {
  const shift = mockShift('s1')
  const reg = mockRegistration('r1', 's1', 'u1', 'approved')
  assert.equal(isCanonicalAssignedShift(shift, null, 'u1', [reg]), true)
})

test('Member: manually_assigned registration -> assigned', () => {
  const shift = mockShift('s1')
  const reg = mockRegistration('r1', 's1', 'u1', 'manually_assigned')
  assert.equal(isCanonicalAssignedShift(shift, null, 'u1', [reg]), true)
})

test('Member: pending -> not assigned', () => {
  const shift = mockShift('s1')
  const reg = mockRegistration('r1', 's1', 'u1', 'pending')
  assert.equal(isCanonicalAssignedShift(shift, null, 'u1', [reg]), false)
})

test('Member: rejected/cancelled/removed -> not assigned', () => {
  const shift = mockShift('s1')
  const r1 = mockRegistration('r1', 's1', 'u1', 'rejected')
  const r2 = mockRegistration('r2', 's1', 'u1', 'cancelled')
  const r3 = mockRegistration('r3', 's1', 'u1', 'removed')
  assert.equal(isCanonicalAssignedShift(shift, null, 'u1', [r1, r2, r3]), false)
})

test('Member: direct Shift host/support/technical ID alone -> not assigned', () => {
  const shift = mockShift('s1')
  shift.host_id = 'u1'
  assert.equal(isCanonicalAssignedShift(shift, null, 'u1', []), false)
})

test('Member: imported display names -> not assigned', () => {
  const shift = mockShift('s1')
  shift.host_names = ['Test User u1']
  assert.equal(isCanonicalAssignedShift(shift, null, 'u1', []), false)
})

test('Member: unrelated shift/user -> not assigned', () => {
  const shift = mockShift('s1')
  const reg = mockRegistration('r1', 's2', 'u1', 'approved')
  const reg2 = mockRegistration('r2', 's1', 'u2', 'approved')
  assert.equal(isCanonicalAssignedShift(shift, null, 'u1', [reg, reg2]), false)
})

test('Member: next shift ordering deterministic', () => {
  const s1 = mockShift('s1', '2026-08-31', '14:00:00')
  const s2 = mockShift('s2', '2026-08-30', '12:00:00')
  const s3 = mockShift('s3', '2026-08-30', '09:00:00')

  const regs = [
    mockRegistration('r1', 's1', 'u1', 'approved'),
    mockRegistration('r2', 's2', 'u1', 'approved'),
    mockRegistration('r3', 's3', 'u1', 'approved')
  ]
  const assigned = getMemberAssignedShifts([s1, s2, s3], 'u1', regs)
  const upcoming = assigned.sort((a, b) => `${a.date}${a.start_time}`.localeCompare(`${b.date}${b.start_time}`))
  assert.equal(upcoming[0].id, 's3')
  assert.equal(upcoming[1].id, 's2')
  assert.equal(upcoming[2].id, 's1')
})

test('Member: pending registrations scoped to user', () => {
  const regs = [
    mockRegistration('r1', 's1', 'u1', 'pending'),
    mockRegistration('r2', 's2', 'u2', 'pending'),
    mockRegistration('r3', 's3', 'u1', 'approved')
  ]
  const pending = getMemberPendingRegistrations(regs, 'u1')
  assert.equal(pending.length, 1)
  assert.equal(pending[0].id, 'r1')
})

test('Member: pending swaps requester/counterpart only', () => {
  const swaps = [
    mockSwap('sw1', 'pending', 'u1', 'u2', 's1'), // requester
    mockSwap('sw2', 'pending', 'u3', 'u1', 's2'), // counterpart
    mockSwap('sw3', 'pending', 'u3', 'u4', 's3'), // unrelated
    mockSwap('sw4', 'completed', 'u1', 'u2', 's4') // not pending
  ]
  const pending = getMemberPendingSwaps(swaps, 'u1')
  assert.equal(pending.length, 2)
  assert.ok(pending.some(s => s.id === 'sw1'))
  assert.ok(pending.some(s => s.id === 'sw2'))
})

// LEADER TESTS
test('Leader: registration scope correct', () => {
  const shiftIds = new Set(['s1', 's2'])
  const regs = [
    mockRegistration('r1', 's1', 'u1', 'pending'),
    mockRegistration('r2', 's2', 'u2', 'approved'), // not pending
    mockRegistration('r3', 's3', 'u3', 'pending') // not in shiftIds
  ]
  const pending = getLeaderPendingRegistrations(regs, shiftIds)
  assert.equal(pending.length, 1)
  assert.equal(pending[0].id, 'r1')
})

test('Leader: report scope correct', () => {
  const shiftIds = new Set(['s1', 's2'])
  const reports = [
    mockReport('rep1', 's1', 'draft'),
    mockReport('rep2', 's2', 'in_review'),
    mockReport('rep3', 's1', 'confirmed'), // not pending
    mockReport('rep4', 's3', 'draft') // not in shiftIds
  ]
  const pending = getLeaderPendingReports(reports, shiftIds)
  assert.equal(pending.length, 2)
  assert.ok(pending.some(r => r.id === 'rep1'))
  assert.ok(pending.some(r => r.id === 'rep2'))
})

test('Leader: swap scope matches actual chosen contract', () => {
  const shiftIds = new Set(['s1'])
  const swaps = [
    mockSwap('sw1', 'pending', 'u1', null, 's1'), // matches shift_id
    mockSwap('sw2', 'pending', 'u2', 'u3', 's9', 's1', 's2'), // matches source_shift_id
    mockSwap('sw3', 'pending', 'u4', 'u5', 's9', 's8', 's1'), // matches target_shift_id
    mockSwap('sw4', 'pending', 'u6', null, 's2', 's3', 's4'), // no match
    mockSwap('sw5', 'completed', 'u1', null, 's1') // not pending
  ]
  const pending = getLeaderPendingSwaps(swaps, shiftIds)
  assert.equal(pending.length, 3)
  assert.ok(pending.some(s => s.id === 'sw1'))
  assert.ok(pending.some(s => s.id === 'sw2'))
  assert.ok(pending.some(s => s.id === 'sw3'))
})
