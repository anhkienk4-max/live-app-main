import test from 'node:test'
import assert from 'node:assert/strict'
import { staffingCandidates } from '../lib/utils/staffingCandidates.ts'
import type { Shift, ShiftRegistration, User } from '../lib/types/database.types.ts'

const baseUser = (id: string, changes: Partial<User> = {}): User => ({
  id, email: `${id}@example.com`, full_name: id, role: 'staff', system_permission: 'member',
  operational_roles: ['host'], status: 'active', account_status: 'active',
  join_date: '2026-01-01', created_at: '2026-01-01', updated_at: '2026-01-01', ...changes,
})
const row = (user_id: string, operational_role: 'host' | 'support' = 'host', status: ShiftRegistration['status'] = 'approved'): ShiftRegistration => ({
  id: `${user_id}-${operational_role}`, user_id, shift_id: 's1', operational_role, status,
  source: 'self_registration', requested_at: '2026-01-01', created_at: '2026-01-01', updated_at: '2026-01-01',
})
const shift = { id: 's1', allow_multi_role: false } as Shift

test('RC19 Staffing candidates refuse inactive/unapproved/archived/deleted and missing-role users', () => {
  const users = [baseUser('valid'), baseUser('inactive', { status: 'inactive' }),
    baseUser('pending-account', { account_status: 'pending_approval' }),
    baseUser('archived', { archived_at: '2026-01-02' }),
    baseUser('deleted', { deleted_at: '2026-01-02' }),
    baseUser('not-host', { operational_roles: ['technical'] })]
  assert.deepEqual(staffingCandidates(shift, 'host', users, []).map(x => x.id), ['valid'])
})

test('RC19 Staffing candidates exclude pending/assigned current shift and respect multi-role', () => {
  const users = [baseUser('pending', { operational_roles: ['host', 'support'] }),
    baseUser('assigned', { operational_roles: ['host', 'support'] }), baseUser('new', { operational_roles: ['host', 'support'] })]
  const registrations = [row('pending', 'host', 'pending'), row('assigned', 'support', 'approved')]
  assert.deepEqual(staffingCandidates(shift, 'host', users, registrations).map(x => x.id), ['new'])
  assert.deepEqual(staffingCandidates({ ...shift, allow_multi_role: true }, 'host', users, registrations).map(x => x.id), ['assigned', 'new'])
})

test('RC19 Staffing candidate filter never certifies cross-shift availability', () => {
  const users = [baseUser('potentially-busy')]
  assert.equal(staffingCandidates(shift, 'host', users, []).length, 1)
  // This intentionally makes no scheduling claim; the SQL RPC must resolve conflicts.
})
