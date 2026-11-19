import assert from 'node:assert'
import { test } from 'node:test'
import { getNavigationForRole, groupNavigation, filterNav } from '../lib/ui/role-ux'

test('E1: Admin Navigation includes all requested routes', () => {
  const adminNav = getNavigationForRole('admin')
  const paths = adminNav.map(n => n.href)
  
  assert.ok(paths.includes('/'))
  assert.ok(paths.includes('/calendar'))
  assert.ok(paths.includes('/live'))
  assert.ok(paths.includes('/shifts'))
  assert.ok(paths.includes('/staffing'))
  assert.ok(paths.includes('/swaps'))
  assert.ok(paths.includes('/reports'))
  assert.ok(paths.includes('/analytics'))
  assert.ok(paths.includes('/brands'))
  assert.ok(paths.includes('/admin'))
  assert.ok(paths.includes('/platforms'))
  assert.ok(paths.includes('/campaigns'))
  assert.ok(paths.includes('/staff'))
  assert.ok(paths.includes('/audit'))
  assert.ok(paths.includes('/settings'))
  assert.ok(paths.includes('/profile'))
  assert.ok(paths.includes('/notifications'))
})

test('E1: Leader Navigation includes all requested routes with full discovery parity', () => {
  const leaderNav = getNavigationForRole('leader')
  const paths = leaderNav.map(n => n.href)
  
  assert.ok(paths.includes('/'))
  assert.ok(paths.includes('/calendar'))
  assert.ok(paths.includes('/live'))
  assert.ok(paths.includes('/shifts'))
  assert.ok(paths.includes('/staffing'))
  assert.ok(paths.includes('/swaps'))
  assert.ok(paths.includes('/reports'))
  assert.ok(paths.includes('/staff'))
  assert.ok(paths.includes('/admin'), 'Leader retains Admin workspace destination for discovery parity')
  assert.ok(paths.includes('/notifications'))

  const filtered = filterNav(leaderNav, { role: 'leader', system_permission: 'leader' })
  const adminItem = filtered.find(n => n.href === '/admin')
  assert.equal(adminItem?.accessStatus, 'restricted', 'Leader has restricted access to Admin workspace')
})

test('E1: Member Navigation preserves destinations and includes the authorized Shifts workflow with discovery parity', () => {
  const memberNav = getNavigationForRole('member')
  const paths = memberNav.map(n => n.href)
  
  assert.ok(paths.includes('/'))
  assert.ok(paths.includes('/profile'))
  assert.ok(paths.includes('/notifications'))
  assert.ok(paths.includes('/calendar?tab=mine'))
  assert.ok(paths.includes('/calendar?tab=open'))
  assert.ok(paths.includes('/shifts'))
  assert.ok(paths.includes('/swaps'))
  assert.ok(paths.includes('/live'))
  assert.ok(paths.includes('/reports'))
  assert.ok(paths.includes('/brand-catalog'))
  assert.ok(paths.includes('/workforce'))
  assert.ok(paths.includes('/admin'), 'Member retains Admin workspace destination for discovery parity')
  assert.ok(paths.includes('/profile'), 'Member should have a direct profile destination')

  const filtered = filterNav(memberNav, { role: 'staff', system_permission: 'member' })
  const adminItem = filtered.find(n => n.href === '/admin')
  assert.equal(adminItem?.accessStatus, 'restricted', 'Member has restricted access to Admin workspace')
})

test('E1: Profile and Notifications each appear once in Overview for all roles', () => {
  for (const role of ['admin', 'leader', 'member'] as const) {
    const navigation = getNavigationForRole(role)
    const overview = groupNavigation(navigation).find(group => group.id === 'overview')
    assert.ok(overview, role + ' missing Overview group')
    for (const href of ['/profile', '/notifications']) {
      assert.strictEqual(navigation.filter(item => item.href === href).length, 1, role + ' missing or duplicate ' + href)
      const item = overview.items.find(item => item.href === href)
      assert.ok(item, role + ' Overview missing ' + href)
      assert.ok(!item.requiredPermissions?.length, 'Self-service navigation must not require elevated permissions')
    }
  }
})
