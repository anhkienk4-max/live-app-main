import test from 'node:test'
import assert from 'node:assert/strict'
import { getNavigationForRole, filterNav } from '@/lib/ui/role-ux'
import type { User } from '@/lib/types/database.types'

test('RC16 UI: Navigation RBAC protects Payroll as strictly Admin-only', () => {
  const adminNav = getNavigationForRole('admin')
  const leaderNav = getNavigationForRole('leader')
  const memberNav = getNavigationForRole('member')

  // Payroll must exist in admin navigation
  const adminPayroll = adminNav.find(item => item.href === '/payroll')
  assert.ok(adminPayroll, 'Payroll must exist in admin navigation')
  assert.equal(adminPayroll.name, 'Bảng lương')

  // Payroll must NOT exist in leader or member navigation
  const leaderPayroll = leaderNav.find(item => item.href === '/payroll')
  assert.equal(leaderPayroll, undefined, 'Payroll must NOT exist in leader navigation')

  const memberPayroll = memberNav.find(item => item.href === '/payroll')
  assert.equal(memberPayroll, undefined, 'Payroll must NOT exist in member navigation')
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
  assert.equal(memberWorkforce.name, 'Hiệu suất cá nhân')
})

test('RC16 UI: filterNav preserves Payroll for admin user and strips for non-admin', () => {
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
  assert.ok(adminItems.some(item => item.href === '/payroll'))

  const leaderItems = filterNav(getNavigationForRole('leader'), leaderUser)
  assert.ok(!leaderItems.some(item => item.href === '/payroll'))

  const memberItems = filterNav(getNavigationForRole('member'), memberUser)
  assert.ok(!memberItems.some(item => item.href === '/payroll'))
})
