import assert from 'node:assert/strict'
import test from 'node:test'

import {
  hasAnyPermission,
  hasPermission,
  permissionMatrix,
  resolveSystemPermission,
} from '../lib/permissions.ts'
import type { User } from '../lib/types/database.types.ts'

const memberUser = { role: 'staff' as const, system_permission: 'member' as const }
const leaderUser = { role: 'leader' as const, system_permission: 'leader' as const }
const adminUser = { role: 'admin' as const, system_permission: 'admin' as const }
const memberRoleUser: Pick<User, 'role' | 'system_permission'> = { role: 'staff' }
const adminViaSystem: Pick<User, 'role' | 'system_permission'> = { role: 'staff', system_permission: 'admin' }
const leaderViaSystem: Pick<User, 'role' | 'system_permission'> = { role: 'staff', system_permission: 'leader' }

test('permission helpers remain canonical (resolveSystemPermission, hasPermission, hasAnyPermission, matrix)', () => {
  assert.equal(resolveSystemPermission(memberUser), 'member')
  assert.equal(resolveSystemPermission(leaderUser), 'leader')
  assert.equal(resolveSystemPermission(adminUser), 'admin')
  assert.equal(resolveSystemPermission(memberRoleUser), 'member')
  assert.equal(resolveSystemPermission(adminViaSystem), 'admin')
  assert.equal(resolveSystemPermission(leaderViaSystem), 'leader')
  assert.equal(resolveSystemPermission(null), 'member')
  assert.equal(resolveSystemPermission(undefined), 'member')
  // matrix is readonly set, not mutated
  assert.equal(permissionMatrix.member.has('shifts.view_open'), true)
  assert.equal(permissionMatrix.leader.has('shifts.view_open'), true)
  assert.equal(permissionMatrix.admin.has('shifts.view_open'), true)
  // helpers — null/undefined resolve to member (fail closed for admin, open for member per existing contract)
  assert.equal(hasPermission(memberUser, 'shifts.view_open'), true)
  assert.equal(hasPermission(null, 'shifts.view_open'), true)
  assert.equal(hasPermission(null, 'shifts.delete'), false)
  assert.equal(hasAnyPermission(memberUser, ['shifts.view_open', 'shifts.delete']), true)
  assert.equal(hasAnyPermission(memberUser, ['shifts.delete', 'staff.manage']), false)
})

test('Calendar / Shift domain — authorized allowed, unauthorized fail closed, leader scope preserved, admin-only isolated', () => {
  // Member: view only
  assert.equal(hasPermission(memberUser, 'shifts.view_assigned'), true)
  assert.equal(hasPermission(memberUser, 'shifts.view_open'), true)
  assert.equal(hasPermission(memberUser, 'shifts.approve_registration'), false)
  assert.equal(hasPermission(memberUser, 'shifts.assign_staff'), false)
  assert.equal(hasPermission(memberUser, 'shifts.edit'), false)
  assert.equal(hasPermission(memberUser, 'shifts.delete'), false)
  assert.equal(hasPermission(memberUser, 'shifts.lock'), false)
  assert.equal(hasPermission(memberUser, 'shifts.import'), false)
  assert.equal(hasPermission(memberUser, 'shifts.export'), false)
  // Leader: view + approve/assign/edit/lock/import/export, but not delete
  assert.equal(hasPermission(leaderUser, 'shifts.view_assigned'), true)
  assert.equal(hasPermission(leaderUser, 'shifts.approve_registration'), true)
  assert.equal(hasPermission(leaderUser, 'shifts.assign_staff'), true)
  assert.equal(hasPermission(leaderUser, 'shifts.edit'), true)
  assert.equal(hasPermission(leaderUser, 'shifts.lock'), true)
  assert.equal(hasPermission(leaderUser, 'shifts.import'), true)
  assert.equal(hasPermission(leaderUser, 'shifts.export'), true)
  assert.equal(hasPermission(leaderUser, 'shifts.delete'), false)
  // Admin: all + delete
  assert.equal(hasPermission(adminUser, 'shifts.delete'), true)
  assert.equal(hasPermission(adminUser, 'shifts.assign_staff'), true)
  // member cannot gain leader/admin via direct invocation
  for (const perm of ['shifts.assign_staff', 'shifts.edit', 'shifts.delete', 'shifts.import'] as const) {
    assert.equal(hasPermission(memberUser, perm), false, `member must not have ${perm}`)
  }
})

test('ShiftRegistration domain — member register/cancel, leader approve/assign, member cannot approve', () => {
  assert.equal(hasPermission(memberUser, 'shifts.register'), true)
  assert.equal(hasPermission(memberUser, 'shifts.cancel_registration'), true)
  assert.equal(hasPermission(memberUser, 'shifts.approve_registration'), false)
  assert.equal(hasPermission(memberUser, 'shifts.assign_staff'), false)
  assert.equal(hasPermission(leaderUser, 'shifts.approve_registration'), true)
  assert.equal(hasPermission(leaderUser, 'shifts.assign_staff'), true)
  assert.equal(hasPermission(adminUser, 'shifts.approve_registration'), true)
  assert.equal(hasPermission(adminUser, 'shifts.register'), true)
})

test('Swap domain — member request, leader approve, member cannot approve', () => {
  assert.equal(hasPermission(memberUser, 'swaps.request'), true)
  assert.equal(hasPermission(memberUser, 'swaps.approve'), false)
  assert.equal(hasPermission(memberUser, 'swaps.export'), false)
  assert.equal(hasPermission(leaderUser, 'swaps.request'), true)
  assert.equal(hasPermission(leaderUser, 'swaps.approve'), true)
  assert.equal(hasPermission(leaderUser, 'swaps.export'), true)
  assert.equal(hasPermission(adminUser, 'swaps.approve'), true)
  // leader scope preserved: leader has approve but not admin-only audit
  assert.equal(hasPermission(leaderUser, 'audit.view'), false)
})

test('Reports domain — member submit, leader review/export, member cannot review', () => {
  assert.equal(hasPermission(memberUser, 'reports.submit'), true)
  assert.equal(hasPermission(memberUser, 'reports.review'), false)
  assert.equal(hasPermission(memberUser, 'reports.export'), false)
  assert.equal(hasPermission(leaderUser, 'reports.submit'), true)
  assert.equal(hasPermission(leaderUser, 'reports.review'), true)
  assert.equal(hasPermission(leaderUser, 'reports.export'), true)
  assert.equal(hasPermission(adminUser, 'reports.review'), true)
  assert.equal(hasPermission(adminUser, 'reports.submit'), true)
})

test('Staff / Import / Audit domains — admin-only isolation and leader scope', () => {
  // Staff: admin only
  assert.equal(hasPermission(memberUser, 'staff.manage'), false)
  assert.equal(hasPermission(leaderUser, 'staff.manage'), false)
  assert.equal(hasPermission(adminUser, 'staff.manage'), true)
  // Import: leader + admin, member cannot
  assert.equal(hasPermission(memberUser, 'shifts.import'), false)
  assert.equal(hasPermission(memberUser, 'shifts.export'), false)
  assert.equal(hasPermission(leaderUser, 'shifts.import'), true)
  assert.equal(hasPermission(leaderUser, 'shifts.export'), true)
  assert.equal(hasPermission(adminUser, 'shifts.import'), true)
  // Audit: view_team leader, view/admin restore/review admin only
  assert.equal(hasPermission(memberUser, 'audit.view'), false)
  assert.equal(hasPermission(memberUser, 'audit.view_team'), false)
  assert.equal(hasPermission(memberUser, 'audit.restore'), false)
  assert.equal(hasPermission(memberUser, 'audit.review'), false)
  assert.equal(hasPermission(leaderUser, 'audit.view_team'), true)
  assert.equal(hasPermission(leaderUser, 'audit.view'), false)
  assert.equal(hasPermission(leaderUser, 'audit.restore'), false)
  assert.equal(hasPermission(leaderUser, 'audit.review'), false)
  assert.equal(hasPermission(adminUser, 'audit.view'), true)
  assert.equal(hasPermission(adminUser, 'audit.view_team'), true) // admin inherits leader
  assert.equal(hasPermission(adminUser, 'audit.restore'), true)
  assert.equal(hasPermission(adminUser, 'audit.review'), true)
  // Admin-only extra guards
  assert.equal(hasPermission(memberUser, 'brands.manage'), false)
  assert.equal(hasPermission(leaderUser, 'brands.manage'), false)
  assert.equal(hasPermission(adminUser, 'brands.manage'), true)
  assert.equal(hasPermission(adminUser, 'platforms.manage'), true)
  assert.equal(hasPermission(adminUser, 'campaigns.manage'), true)
  assert.equal(hasPermission(leaderUser, 'campaigns.edit_operational'), true)
  assert.equal(hasPermission(memberUser, 'campaigns.edit_operational'), false)
  assert.equal(hasPermission(memberUser, 'data.force_delete'), false)
  assert.equal(hasPermission(leaderUser, 'data.force_delete'), false)
  assert.equal(hasPermission(adminUser, 'data.force_delete'), true)
})

test('member cannot gain Leader/Admin actions through direct service invocation (fail closed)', () => {
  const leaderOnly: typeof hasPermission extends (u: any, p: infer P) => boolean ? P : never[] = [
    'shifts.assign_staff',
    'shifts.edit',
    'shifts.approve_registration',
    'shifts.import',
    'reports.review',
    'swaps.approve',
    'audit.view_team',
  ] as any
  for (const perm of leaderOnly as any) {
    assert.equal(hasPermission(memberUser, perm), false, `member must fail closed for ${perm}`)
  }
  const adminOnly = [
    'shifts.delete',
    'staff.manage',
    'brands.manage',
    'audit.view',
    'audit.restore',
    'data.force_delete',
  ] as const
  for (const perm of adminOnly) {
    assert.equal(hasPermission(memberUser, perm), false)
    assert.equal(hasPermission(leaderUser, perm), false)
  }
})

test('leader scope is preserved (has team view but not admin view)', () => {
  assert.equal(hasPermission(leaderUser, 'audit.view_team'), true)
  assert.equal(hasPermission(leaderUser, 'audit.view'), false)
  // leader can manage operational campaigns but not full campaigns.manage
  assert.equal(hasPermission(leaderUser, 'campaigns.edit_operational'), true)
  assert.equal(hasPermission(leaderUser, 'campaigns.manage'), false)
  // leader inherits member reports.submit
  assert.equal(hasPermission(leaderUser, 'reports.submit'), true)
})

test('existing permission helpers remain canonical — no auth redesign', () => {
  // permissionMatrix is canonical source — sizes derived from current lib/permissions.ts
  assert.equal(permissionMatrix.member.size, 8)
  assert.ok(permissionMatrix.leader.size > permissionMatrix.member.size)
  assert.ok(permissionMatrix.admin.size > permissionMatrix.leader.size)
  assert.equal(permissionMatrix.leader.size, 21)
  assert.equal(permissionMatrix.admin.size, 32)
  // hasPermission delegates to matrix
  assert.equal(hasPermission({ role: 'staff', system_permission: 'member' }, 'shifts.view_open'), true)
  assert.equal(hasPermission({ role: 'admin' }, 'shifts.delete'), true) // role admin → admin
  assert.equal(hasPermission({ role: 'leader' }, 'audit.view_team'), true)
  // system_permission overrides role
  assert.equal(hasPermission({ role: 'staff', system_permission: 'admin' }, 'audit.view'), true)
  assert.equal(hasPermission({ role: 'admin', system_permission: 'member' }, 'audit.view'), false)
})
