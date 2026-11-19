import test from 'node:test'
import assert from 'node:assert/strict'
import { getNavigationForRole, filterNav } from '@/lib/ui/role-ux'
import type { User } from '@/lib/types/database.types'

test('RC16 UI: Navigation parity keeps Payroll visible for all roles while restricting non-admin access', () => {
  const adminNav = getNavigationForRole('admin')
  const leaderNav = getNavigationForRole('leader')
  const memberNav = getNavigationForRole('member')

  // Payroll exists in navigation for all roles to preserve complete module discovery parity
  const adminPayroll = adminNav.find(item => item.href === '/payroll')
  assert.ok(adminPayroll, 'Payroll must exist in admin navigation')
  assert.equal(adminPayroll.name, 'Payroll')

  const leaderPayroll = leaderNav.find(item => item.href === '/payroll')
  assert.ok(leaderPayroll, 'Payroll must exist in leader navigation for discovery parity')

  const memberPayroll = memberNav.find(item => item.href === '/payroll')
  assert.ok(memberPayroll, 'Payroll must exist in member navigation for discovery parity')
})

test('RC16 UI: Workforce Performance navigation is available across roles with appropriate scope', () => {
  const adminNav = getNavigationForRole('admin')
  const leaderNav = getNavigationForRole('leader')
  const memberNav = getNavigationForRole('member')

  const adminWorkforce = adminNav.find(item => item.href === '/workforce')
  assert.ok(adminWorkforce, 'Workforce must exist in admin navigation')

  const leaderWorkforce = leaderNav.find(item => item.href === '/workforce')
  assert.ok(leaderWorkforce, 'Workforce must exist in leader navigation')

  const memberWorkforce = memberNav.find(item => item.href === '/workforce')
  assert.ok(memberWorkforce, 'Workforce must exist in member navigation')
})

test('RC16 UI: filterNav annotates accessStatus for authenticated users and strips for unauthenticated', () => {
  const adminUser: Pick<User, 'role' | 'system_permission'> = {
    role: 'admin',
    system_permission: 'admin',
  }
  const leaderUser: Pick<User, 'role' | 'system_permission'> = {
    role: 'leader',
    system_permission: 'leader',
  }
  const memberUser: Pick<User, 'role' | 'system_permission'> = {
    role: 'member',
    system_permission: 'member',
  }

  const adminItems = filterNav(getNavigationForRole('admin'), adminUser)
  const adminPayroll = adminItems.find(item => item.href === '/payroll')
  assert.ok(adminPayroll)
  assert.equal(adminPayroll.accessStatus, 'available')

  const leaderItems = filterNav(getNavigationForRole('leader'), leaderUser)
  const leaderPayroll = leaderItems.find(item => item.href === '/payroll')
  assert.ok(leaderPayroll, 'Leader retains Payroll in navigation')
  assert.equal(leaderPayroll.accessStatus, 'restricted', 'Leader has restricted access status')

  const memberItems = filterNav(getNavigationForRole('member'), memberUser)
  const memberPayroll = memberItems.find(item => item.href === '/payroll')
  assert.ok(memberPayroll, 'Member retains Payroll in navigation')
  assert.equal(memberPayroll.accessStatus, 'restricted', 'Member has restricted access status')

  // Unauthenticated user failsafe
  const unauthItems = filterNav(getNavigationForRole('admin'), null)
  assert.ok(!unauthItems.some(item => item.href === '/payroll'), 'Unauthenticated user is stripped of gated routes')
})
