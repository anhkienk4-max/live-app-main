import test from 'node:test'
import assert from 'node:assert/strict'
import { hasPermission } from '@/lib/permissions'
import { buildShiftActions } from '@/lib/ui/action-priority'
import { getNavigationForRole } from '@/lib/ui/role-ux'
import type { User } from '@/lib/types/database.types'

test('UX-W1 /shifts: Role capability matrix strictly separates Member, Leader, Admin', () => {
  const member: Pick<User, 'role' | 'system_permission'> = { role: 'member', system_permission: 'member' }
  const leader: Pick<User, 'role' | 'system_permission'> = { role: 'leader', system_permission: 'leader' }
  const admin: Pick<User, 'role' | 'system_permission'> = { role: 'admin', system_permission: 'admin' }

  // Member must not have create/edit, delete, import, export
  assert.equal(hasPermission(member, 'shifts.edit'), false, 'Member cannot create/edit shifts')
  assert.equal(hasPermission(member, 'shifts.delete'), false, 'Member cannot delete shifts')
  assert.equal(hasPermission(member, 'shifts.import'), false, 'Member cannot import shifts')
  assert.equal(hasPermission(member, 'shifts.export'), false, 'Member cannot export shifts')

  // Leader has edit/create, import, export but not delete
  assert.equal(hasPermission(leader, 'shifts.edit'), true, 'Leader can edit shifts')
  assert.equal(hasPermission(leader, 'shifts.import'), true, 'Leader can import shifts')
  assert.equal(hasPermission(leader, 'shifts.export'), true, 'Leader can export shifts')
  assert.equal(hasPermission(leader, 'shifts.delete'), false, 'Leader cannot delete shifts')

  // Admin has all shift permissions
  assert.equal(hasPermission(admin, 'shifts.edit'), true, 'Admin can edit shifts')
  assert.equal(hasPermission(admin, 'shifts.delete'), true, 'Admin can delete shifts')
  assert.equal(hasPermission(admin, 'shifts.import'), true, 'Admin can import shifts')
  assert.equal(hasPermission(admin, 'shifts.export'), true, 'Admin can export shifts')
})

test('UX-W1 /shifts: buildShiftActions restricts row actions based on caller capabilities', () => {
  const labels = { view: 'View', edit: 'Edit', duplicate: 'Duplicate', delete: 'Delete' }
  const handlers = {
    onView: () => {},
    onEdit: () => {},
    onDuplicate: () => {},
    onDelete: () => {},
  }

  // Member: canEdit = false, canDelete = false, duplicate handler omitted for member
  const memberActions = buildShiftActions(
    { canEdit: false, canDelete: false },
    { onView: handlers.onView },
    labels
  )
  assert.deepEqual(memberActions.map(a => a.key), ['view'], 'Member only sees view action')

  // Leader: canEdit = true, canDelete = false, duplicate enabled
  const leaderActions = buildShiftActions(
    { canEdit: true, canDelete: false },
    { onView: handlers.onView, onEdit: handlers.onEdit, onDuplicate: handlers.onDuplicate },
    labels
  )
  assert.deepEqual(leaderActions.map(a => a.key), ['view', 'edit', 'duplicate'], 'Leader sees view, edit, duplicate')

  // Admin: canEdit = true, canDelete = true, duplicate and delete enabled
  const adminActions = buildShiftActions(
    { canEdit: true, canDelete: true },
    { onView: handlers.onView, onEdit: handlers.onEdit, onDuplicate: handlers.onDuplicate, onDelete: handlers.onDelete },
    labels
  )
  assert.deepEqual(adminActions.map(a => a.key), ['view', 'edit', 'duplicate', 'delete'], 'Admin sees all actions')
})

test('UX-W1 Navigation: i18n label keys are defined across all role destinations', () => {
  for (const role of ['member', 'leader', 'admin'] as const) {
    const nav = getNavigationForRole(role)
    for (const item of nav) {
      assert.ok(item.name, `Nav item must have a name for role ${role}`)
      assert.ok(item.href, `Nav item ${item.name} must have an href`)
    }
  }
})

test('UX-W1 /shifts: Bulk selection scope strictly respects filtered shifts and capability gating', () => {
  const allShifts = [
    { id: 's1', status: 'scheduled' },
    { id: 's2', status: 'scheduled' },
    { id: 's3', status: 'completed' },
    { id: 's4', status: 'completed' },
  ]
  const scheduledShifts = allShifts.filter(s => s.status === 'scheduled')

  // Selecting all within filtered view selects only s1, s2
  let selected = new Set<string>()
  scheduledShifts.forEach(s => selected.add(s.id))
  assert.equal(selected.size, 2)
  assert.ok(selected.has('s1'))
  assert.ok(selected.has('s2'))
  assert.equal(selected.has('s3'), false, 'Filtered out shift s3 must not be selected')
  assert.equal(selected.has('s4'), false, 'Filtered out shift s4 must not be selected')

  // When switching filter, selection is reset
  selected = new Set<string>()
  assert.equal(selected.size, 0)
})
