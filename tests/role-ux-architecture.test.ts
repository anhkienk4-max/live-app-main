import assert from 'node:assert/strict'
import test from 'node:test'
import { hasPermission } from '../lib/permissions.ts'
import {
  canAccessRoleUxModule,
  getRoleUxSurfaceConfig,
  modulePermission,
  roleUxPriorities,
  type RoleUxModule,
} from '../lib/ui/role-ux.ts'
import type { User } from '../lib/types/database.types.ts'

const modules: RoleUxModule[] = [
  'dashboard', 'calendar', 'shiftDetail', 'myShifts', 'openShifts', 'staffing', 'shiftSwap', 'reports', 'live',
  'analytics', 'brands', 'platforms', 'campaigns', 'audit', 'staff', 'import',
]

function user(system_permission: User['system_permission']): Pick<User, 'role' | 'system_permission'> {
  return { role: system_permission === 'member' ? 'staff' : system_permission, system_permission }
}

test('role UX matrix covers every requested operational surface and priority', () => {
  for (const module of modules) {
    for (const role of ['admin', 'leader', 'member'] as const) {
      const surface = getRoleUxSurfaceConfig(user(role), module)
      assert.equal(surface.role, role)
      assert.match(surface.priority, /^P[0-3]$/)
      assert.ok(surface.responsibility.length > 0)
      assert.ok(surface.emptyState.length > 0)
      assert.equal(surface.priority, roleUxPriorities[module][role])
    }
  }
})

test('module access delegates to the canonical permission matrix', () => {
  const member = user('member')
  const leader = user('leader')
  const admin = user('admin')
  assert.equal(canAccessRoleUxModule(member, 'openShifts'), hasPermission(member, 'shifts.view_open'))
  assert.equal(canAccessRoleUxModule(member, 'staff'), false)
  assert.equal(canAccessRoleUxModule(leader, 'staff'), false)
  assert.equal(canAccessRoleUxModule(leader, 'staffing'), hasPermission(leader, 'shifts.assign_staff'))
  assert.equal(canAccessRoleUxModule(admin, 'staff'), hasPermission(admin, 'staff.manage'))
  assert.equal(canAccessRoleUxModule(admin, 'brands'), hasPermission(admin, 'brands.manage'))
})

test('system permission and operational role remain separate in role UX', () => {
  const memberWithHost = { ...user('member'), operational_roles: ['host'] as const }
  const surface = getRoleUxSurfaceConfig(memberWithHost, 'staffing')
  assert.equal(surface.role, 'member')
  assert.equal(surface.canAccess, true)
  assert.deepEqual(modulePermission.staffing, ['shifts.view_assigned', 'shifts.assign_staff'])
})

test('member surfaces never expose management capabilities', () => {
  const member = user('member')
  for (const module of ['staff', 'brands', 'platforms', 'import'] as const) {
    const surface = getRoleUxSurfaceConfig(member, module)
    assert.equal(surface.canAccess, false)
  }
  assert.equal(getRoleUxSurfaceConfig(member, 'openShifts').primaryAction, 'register')
  assert.equal(getRoleUxSurfaceConfig(member, 'staffing').primaryAction, null)
  assert.equal(getRoleUxSurfaceConfig(user('leader'), 'staffing').primaryAction, 'assign')
  assert.equal(getRoleUxSurfaceConfig(user('admin'), 'staff').primaryAction, 'manage')
})
