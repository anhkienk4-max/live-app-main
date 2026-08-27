import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Shift, ShiftRegistration, User } from '@/lib/types/database.types'
import { resolveRegistrationCta } from '@/lib/utils/shiftRegistration'

const user: User = {
  id: 'member-1',
  email: 'member@example.com',
  full_name: 'Member',
  role: 'staff',
  system_permission: 'member',
  operational_roles: ['host', 'support'],
  status: 'active',
  join_date: '2026-01-01',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
}

const shift = (overrides: Partial<Shift> = {}): Shift => ({
  id: 'shift-1',
  date: '2026-08-28',
  start_time: '10:00',
  end_time: '12:00',
  brand_id: 'brand-1',
  platform_id: 'platform-1',
  status: 'scheduled',
  required_host_count: 1,
  required_support_count: 1,
  required_technical_count: 1,
  registration_locked: false,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  ...overrides,
})

const registration = (overrides: Partial<ShiftRegistration> = {}): ShiftRegistration => ({
  id: 'registration-1',
  shift_id: 'shift-1',
  user_id: 'member-1',
  operational_role: 'host',
  status: 'pending',
  source: 'self_registration',
  requested_at: '2026-08-27T00:00:00.000Z',
  created_at: '2026-08-27T00:00:00.000Z',
  updated_at: '2026-08-27T00:00:00.000Z',
  ...overrides,
})

const stateFor = (target: Shift, role: 'host' | 'support' | 'technical', registrations: ShiftRegistration[] = [], allShifts: Shift[] = [target]) =>
  resolveRegistrationCta({
    allShifts,
    now: new Date('2026-08-27T12:00:00.000Z'),
    registrations,
    shift: target,
    user,
  }).find(state => state.role === role)!.state

test('shift registration eligibility', async (t) => {
  await t.test('allows a future eligible registration', () => {
    assert.equal(stateFor(shift(), 'host'), 'eligible')
  })

  await t.test('closes started and past shifts', () => {
    assert.equal(stateFor(shift({ date: '2026-08-27', start_time: '08:00', end_time: '10:00' }), 'host'), 'closed')
    assert.equal(stateFor(shift({ date: '2026-08-26', start_time: '10:00', end_time: '12:00' }), 'host'), 'closed')
  })

  await t.test('reports full capacity, pending, and approved states', () => {
    assert.equal(stateFor(shift(), 'host', [registration({ id: 'other', user_id: 'other-user', status: 'approved' })]), 'full')
    assert.equal(stateFor(shift(), 'host', [registration()]), 'pending')
    assert.equal(stateFor(shift(), 'host', [registration({ status: 'approved' })]), 'approved')
  })

  await t.test('reports overlap conflicts and preserves role eligibility', () => {
    const overlapping = shift({ id: 'shift-2', start_time: '11:00', end_time: '13:00' })
    assert.equal(stateFor(overlapping, 'host', [registration({ shift_id: 'shift-1', status: 'approved' })], [shift(), overlapping]), 'conflict')
    assert.equal(stateFor(shift(), 'technical'), 'not_eligible')
  })

  await t.test('closes locked and cutoff-passed shifts', () => {
    assert.equal(stateFor(shift({ registration_locked: true }), 'host'), 'closed')
    assert.equal(stateFor(shift({ registration_cutoff_at: '2026-08-26T23:59:00.000Z' }), 'host'), 'closed')
  })
})

test('calendar day, list and detail surfaces use the shared registration actions', () => {
  const root = resolve(process.cwd())
  const day = readFileSync(resolve(root, 'components/features/calendar/DayView.tsx'), 'utf8')
  const list = readFileSync(resolve(root, 'components/features/calendar/ListView.tsx'), 'utf8')
  const detail = readFileSync(resolve(root, 'components/features/shifts/ShiftDetailModal.tsx'), 'utf8')
  assert.match(day, /ShiftRegistrationActions/)
  assert.match(list, /ShiftRegistrationActions/)
  assert.match(detail, /ShiftRegistrationActions/)
})
