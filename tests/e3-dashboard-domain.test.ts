import assert from 'node:assert/strict'
import test from 'node:test'
import { Shift, ShiftRegistration, User, SwapRequest, Report } from '../lib/types/database.types'

const mockUser = (id: string, roles: ('host' | 'support' | 'technical')[] = ['host']): User => ({
  id,
  email: `${id}@example.com`,
  full_name: `Test User ${id}`,
  auth_id: `auth-${id}`,
  avatar_url: '',
  department: '',
  is_active: true,
  operational_roles: roles,
  phone: '',
  system_permission: 'member',
  created_at: '',
  updated_at: ''
})

const mockShift = (id: string): Shift => ({
  id,
  brand_id: 'b1',
  campaign_id: 'c1',
  date: '2026-08-30',
  start_time: '12:00:00',
  end_time: '14:00:00',
  platform_id: 'p1',
  status: 'scheduled',
  title: `Shift ${id}`,
  allow_multiple_roles: false,
  created_at: '',
  created_by: 'admin1',
  host_id: null,
  support_id: null,
  technical_id: null,
  host_names: [],
  support_names: [],
  technical_names: [],
  notes: null,
  registration_locked: false,
  updated_at: ''
})

const mockRegistration = (id: string, shift_id: string, user_id: string, status: 'pending' | 'approved' | 'cancelled', role: 'host' | 'support' | 'technical' = 'host', is_manual: boolean = false): ShiftRegistration => ({
  id,
  shift_id,
  user_id,
  status,
  operational_role: role,
  assignment_source: is_manual ? 'manual' : 'self',
  created_at: '',
  updated_at: '',
  created_by: 'user1'
})

// Function extracted from DashboardOverview for testing
const isStaffedRegistration = (registration: ShiftRegistration) => registration.status === 'approved'

const isAssigned = (shift: Shift, role: 'host' | 'support' | 'technical' | null, userId: string, registrations: ShiftRegistration[]) => {
  return registrations.some(registration =>
    registration.shift_id === shift.id &&
    registration.user_id === userId &&
    (role === null || registration.operational_role === role) &&
    isStaffedRegistration(registration)
  )
}

test('canonical registration drives assigned shift', () => {
  const shift = mockShift('s1')
  const reg = mockRegistration('r1', 's1', 'u1', 'approved')
  assert.equal(isAssigned(shift, null, 'u1', [reg]), true)
})

test('direct Shift compatibility ID alone is not canonical assignment', () => {
  const shift = mockShift('s1')
  shift.host_id = 'u1' // compatible ID
  assert.equal(isAssigned(shift, null, 'u1', []), false) // no registration
})

test('imported names do not assign user', () => {
  const shift = mockShift('s1')
  shift.host_names = ['Test User u1']
  assert.equal(isAssigned(shift, null, 'u1', []), false)
})

test('unrelated registration not included', () => {
  const shift = mockShift('s1')
  const reg = mockRegistration('r1', 's2', 'u1', 'approved') // wrong shift
  const reg2 = mockRegistration('r2', 's1', 'u2', 'approved') // wrong user
  assert.equal(isAssigned(shift, null, 'u1', [reg, reg2]), false)
})

test('pending registration does not assign user', () => {
  const shift = mockShift('s1')
  const reg = mockRegistration('r1', 's1', 'u1', 'pending')
  assert.equal(isAssigned(shift, null, 'u1', [reg]), false)
})
