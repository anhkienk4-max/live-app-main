import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Shift, ShiftRegistration } from '../lib/types/database.types'
import { selectMyShiftEntries } from '../lib/utils/myShifts.ts'

const filters = { date: '', brand: 'all', platform: 'all', campaign: 'all', role: 'all' }
const makeShift = (id: string, date: string, start_time: string): Shift => ({
  id, date, start_time, end_time: start_time === '11:00' ? '14:00' : '23:00', brand_id: 'brand', platform_id: 'platform',
  status: 'scheduled', required_host_count: 1, required_support_count: 1, required_technical_count: 1,
  registration_locked: false, created_at: date, updated_at: date,
})
const makeRegistration = (id: string, shift_id: string, operational_role: ShiftRegistration['operational_role'], status: ShiftRegistration['status'], user_id = 'member'): ShiftRegistration => ({
  id, shift_id, user_id, operational_role, status, source: status === 'manually_assigned' ? 'manual_assignment' : 'self_registration',
  requested_at: '2026-08-28T00:00:00.000Z', created_at: '2026-08-28T00:00:00.000Z', updated_at: '2026-08-28T00:00:00.000Z',
})

test('My Shifts uses one canonical active registration entry per row across views', () => {
  const shifts = [makeShift('shift-day', '2026-08-29', '11:00'), makeShift('shift-evening', '2026-08-29', '18:00')]
  const registrations = [
    makeRegistration('cancelled-replaced-host', 'shift-day', 'host', 'cancelled'),
    makeRegistration('approved-support', 'shift-day', 'support', 'approved'),
    makeRegistration('approved-host', 'shift-evening', 'host', 'approved'),
    makeRegistration('unrelated-rejected', 'shift-day', 'technical', 'rejected'),
  ]
  const entries = selectMyShiftEntries({ shifts, registrations, userId: 'member', filters })
  assert.equal(entries.length, 2)
  assert.deepEqual(entries.map(entry => [entry.shift.id, entry.registration.operational_role]), [
    ['shift-day', 'support'], ['shift-evening', 'host'],
  ])
  assert.equal(entries.some(entry => entry.registration.status === 'cancelled'), false)
})

test('completed replacement ownership is reflected without importing labels as assignments', () => {
  const shifts = [makeShift('shift-day', '2026-08-29', '11:00')]
  const registrations = [
    makeRegistration('old-host', 'shift-day', 'host', 'cancelled', 'requester'),
    makeRegistration('new-host', 'shift-day', 'host', 'manually_assigned', 'replacement'),
    makeRegistration('support', 'shift-day', 'support', 'approved', 'member'),
  ]
  const member = selectMyShiftEntries({ shifts, registrations, userId: 'member', filters })
  const replacement = selectMyShiftEntries({ shifts, registrations, userId: 'replacement', filters })
  assert.deepEqual(member.map(entry => entry.registration.operational_role), ['support'])
  assert.deepEqual(replacement.map(entry => entry.registration.operational_role), ['host'])
})

test('role filter only returns roles actually registered by the user', () => {
  const shifts = [makeShift('shift', '2026-08-29', '11:00')]
  const registrations = [makeRegistration('host', 'shift', 'host', 'approved'), makeRegistration('support', 'shift', 'support', 'pending')]
  assert.deepEqual(selectMyShiftEntries({ shifts, registrations, userId: 'member', filters: { ...filters, role: 'support' } }).map(entry => entry.registration.operational_role), ['support'])
})

test('Calendar My Shifts renders all three views from the canonical entry projection', () => {
  const source = readFileSync(resolve(process.cwd(), 'components/features/calendar/ShiftRegistrationBoard.tsx'), 'utf8')
  assert.match(source, /selectMyShiftEntries/)
  assert.match(source, /MyShiftCards entries=\{visibleMyEntries\}/)
  assert.match(source, /MyShiftCompactList entries=\{visibleMyEntries\}/)
  assert.match(source, /MyShiftTable entries=\{visibleMyEntries\}/)
})
