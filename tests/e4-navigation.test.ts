import assert from 'node:assert/strict'
import test from 'node:test'
import type { User } from '../lib/types/database.types.ts'
import { filterNav, getNavigationForRole, getNavigationPlacement, isNavItemActive } from '../lib/ui/role-ux.ts'

const user = (system_permission: User['system_permission']): Pick<User, 'role' | 'system_permission'> => ({
  role: system_permission === 'member' ? 'staff' : system_permission,
  system_permission,
})

const primaryKeys = (systemPermission: User['system_permission']) => getNavigationForRole(systemPermission)
  .filter(item => getNavigationPlacement(item, systemPermission) === 'primary')
  .map(item => item.key)

test('E4 derives role primary navigation from one declarative catalogue', () => {
  assert.deepEqual(primaryKeys('admin'), ['dashboard', 'calendar', 'live', 'swaps', 'reports', 'staff'])
  assert.deepEqual(primaryKeys('leader'), ['dashboard', 'calendar', 'live', 'swaps', 'reports'])
  assert.deepEqual(primaryKeys('member'), ['dashboard', 'calendar', 'swaps', 'notifications'])

  const allKeys = getNavigationForRole('admin').map(item => item.key)
  assert.equal(new Set(allKeys).size, allKeys.length)
})

test('navigation visibility is distinct from permission-backed route access', () => {
  const audit = getNavigationForRole('leader').find(item => item.key === 'audit')
  assert.ok(audit)
  assert.equal(filterNav([audit], user('leader')).length, 1)
  assert.equal(getNavigationForRole('member').some(item => item.key === 'audit'), false)

  // A hidden item is a navigation choice, not a new authorization redirect.
  assert.equal(getNavigationForRole('member').some(item => item.key === 'staff'), false)
})

test('active navigation matches parent routes and ignores query strings', () => {
  assert.equal(isNavItemActive('/calendar', '/calendar'), true)
  assert.equal(isNavItemActive('/calendar?action=create', '/calendar'), true)
  assert.equal(isNavItemActive('/reports/123', '/reports'), true)
  assert.equal(isNavItemActive('/', '/'), true)
  assert.equal(isNavItemActive('/calendar', '/'), false)
  assert.equal(isNavItemActive('/calendar-old', '/calendar'), false)
})
