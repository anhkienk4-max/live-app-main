import assert from 'node:assert/strict'
import test from 'node:test'
import { resolveStaffingLabels, resolveStaffingLabelsForRole } from '../lib/utils/staffingResolver.ts'
import type { Shift, ShiftRegistration, User } from '../lib/types/database.types.ts'

const t = (key: string) => key // translation mock

const mockUser = (id: string, name: string, role: 'host' | 'support' | 'technical'): User => ({
  id,
  email: `${id}@test`,
  full_name: name,
  role: 'member',
  system_permission: 'member',
  operational_roles: [role],
  status: 'active',
  account_status: 'active',
  join_date: '2026-01-01',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
})

const baseShift: Shift = {
  id: 's1',
  title: 'Test Shift',
  date: '2026-01-01',
  start_time: '09:00',
  end_time: '11:00',
  brand_id: 'b1',
  platform_id: 'p1',
  status: 'scheduled',
  registration_locked: false,
  allow_multi_role: false,
  required_host_count: 1,
  required_support_count: 0,
  required_technical_count: 0,
  host_names: [],
  assistant_names: [],
  technical_names: [],
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
}

test('RW003 authoritative assignment overrides duplicate imported name', () => {
  const shift: Shift = { ...baseShift, host_names: ['Nguyen Van A'] }
  const registrations: ShiftRegistration[] = [
    {
      id: 'r1',
      shift_id: 's1',
      user_id: 'u1',
      operational_role: 'host',
      status: 'approved',
      source: 'manual',
      imported_name: 'Nguyen Van A',
      requested_at: '2026-01-01T00:00:00.000Z',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    },
  ]
  const users = [mockUser('u1', 'Nguyen Van A', 'host')]
  const labels = resolveStaffingLabelsForRole(shift, registrations, users, 'host', t)
  assert.equal(labels.length, 1)
  assert.equal(labels[0].name, 'Nguyen Van A')
  assert.equal(labels[0].isUnassigned, false)
  assert.equal(labels[0].isImportedOnly, false)
})

test('RW003 imported-only staffing remains visible', () => {
  const shift: Shift = { ...baseShift, host_names: ['Nguyen Van B'] }
  const registrations: ShiftRegistration[] = []
  const users: User[] = []
  const labels = resolveStaffingLabelsForRole(shift, registrations, users, 'host', t)
  assert.equal(labels.length, 1)
  assert.equal(labels[0].name, 'Nguyen Van B')
  assert.equal(labels[0].isUnassigned, false)
  assert.equal(labels[0].isImportedOnly, true)
})

test('RW003 partially mapped imported names preserve remaining people', () => {
  const shift: Shift = { ...baseShift, required_host_count: 2, host_names: ['Nguyen Van A', 'Nguyen Van B'] }
  const registrations: ShiftRegistration[] = [
    {
      id: 'r1',
      shift_id: 's1',
      user_id: 'u1',
      operational_role: 'host',
      status: 'approved',
      source: 'manual',
      imported_name: 'Nguyen Van A',
      requested_at: '2026-01-01T00:00:00.000Z',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    },
  ]
  const users = [mockUser('u1', 'Nguyen Van A', 'host')]
  const labels = resolveStaffingLabelsForRole(shift, registrations, users, 'host', t)
  assert.equal(labels.length, 2)
  assert.equal(labels[0].name, 'Nguyen Van A')
  assert.equal(labels[0].isImportedOnly, false)
  assert.equal(labels[1].name, 'Nguyen Van B')
  assert.equal(labels[1].isImportedOnly, true)
})

test('RW003 duplicate person is never rendered twice', () => {
  const shift: Shift = { ...baseShift, host_names: ['Nguyen Van A', 'Nguyen Van A'] }
  const registrations: ShiftRegistration[] = [
    {
      id: 'r1',
      shift_id: 's1',
      user_id: 'u1',
      operational_role: 'host',
      status: 'approved',
      source: 'manual',
      imported_name: 'Nguyen Van A',
      requested_at: '2026-01-01T00:00:00.000Z',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    },
  ]
  const users = [mockUser('u1', 'Nguyen Van A', 'host')]
  const labels = resolveStaffingLabelsForRole(shift, registrations, users, 'host', t)
  // Only one slot required (required_host_count=1)
  assert.equal(labels.length, 1)
  assert.equal(labels[0].name, 'Nguyen Van A')
  // If required_host_count were 2, we would still not duplicate
  const shift2: Shift = { ...baseShift, required_host_count: 2, host_names: ['Nguyen Van A', 'Nguyen Van A'] }
  const labels2 = resolveStaffingLabelsForRole(shift2, registrations, users, 'host', t)
  assert.equal(labels2.length, 2)
  assert.equal(labels2[0].name, 'Nguyen Van A')
  assert.equal(labels2[1].name, 'unassigned') // because duplicate not added twice
})

test('RW003 no authoritative + no imported -> "Chưa phân công"', () => {
  const shift: Shift = { ...baseShift, host_names: [] }
  const registrations: ShiftRegistration[] = []
  const users: User[] = []
  const labels = resolveStaffingLabelsForRole(shift, registrations, users, 'host', t)
  assert.equal(labels.length, 1)
  assert.equal(labels[0].name, 'unassigned')
  assert.equal(labels[0].isUnassigned, true)
  assert.equal(labels[0].isImportedOnly, false)
})

test('RW003 multiple roles remain isolated correctly', () => {
  const shift: Shift = {
    ...baseShift,
    required_host_count: 1,
    required_support_count: 1,
    required_technical_count: 1,
    host_names: ['Host A'],
    assistant_names: ['Support B'],
    technical_names: ['Tech C'],
  }
  const registrations: ShiftRegistration[] = [
    {
      id: 'r1',
      shift_id: 's1',
      user_id: 'u1',
      operational_role: 'host',
      status: 'approved',
      source: 'manual',
      imported_name: 'Host A',
      requested_at: '2026-01-01T00:00:00.000Z',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    },
  ]
  const users = [mockUser('u1', 'Host A', 'host')]
  const hostLabels = resolveStaffingLabelsForRole(shift, registrations, users, 'host', t)
  const supportLabels = resolveStaffingLabelsForRole(shift, registrations, users, 'support', t)
  const techLabels = resolveStaffingLabelsForRole(shift, registrations, users, 'technical', t)
  assert.equal(hostLabels.length, 1)
  assert.equal(hostLabels[0].name, 'Host A')
  assert.equal(supportLabels.length, 1)
  assert.equal(supportLabels[0].name, 'Support B')
  assert.equal(supportLabels[0].isImportedOnly, true)
  assert.equal(techLabels.length, 1)
  assert.equal(techLabels[0].name, 'Tech C')
  assert.equal(techLabels[0].isImportedOnly, true)
})

test('RW003 canonical resolver produces deterministic output', () => {
  const shift: Shift = { ...baseShift, host_names: ['Z', 'A'] }
  const registrations: ShiftRegistration[] = []
  const users: User[] = []
  const labels = resolveStaffingLabelsForRole(shift, registrations, users, 'host', t)
  // Order should be consistent: first the approved (none), then imported in array order
  assert.equal(labels.length, 1) // only one required
  // Since required_host_count=1, only first imported name is taken
  assert.equal(labels[0].name, 'Z')
  // If we increase required, order should be as in array
  const shift2: Shift = { ...baseShift, required_host_count: 2, host_names: ['Z', 'A'] }
  const labels2 = resolveStaffingLabelsForRole(shift2, registrations, users, 'host', t)
  assert.equal(labels2.length, 2)
  assert.equal(labels2[0].name, 'Z')
  assert.equal(labels2[1].name, 'A')
})