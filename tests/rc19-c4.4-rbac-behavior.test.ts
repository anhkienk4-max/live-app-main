import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  UNIFIED_NAVIGATION_CATALOG,
  filterNav,
  getNavigationForRole,
} from '../lib/ui/role-ux.ts'
import type { User } from '../lib/types/database.types'

const adminUser: User = {
  id: 'usr-admin-1',
  auth_user_id: 'auth-admin-1',
  email: 'admin@ada.test',
  full_name: 'System Admin',
  role: 'admin',
  system_permission: 'admin',
  status: 'active',
  account_status: 'active',
  created_at: '2026-01-01',
  updated_at: '2026-01-01',
}

const leaderUser: User = {
  id: 'usr-leader-1',
  auth_user_id: 'auth-leader-1',
  email: 'leader@ada.test',
  full_name: 'Team Leader',
  role: 'leader',
  system_permission: 'leader',
  status: 'active',
  account_status: 'active',
  created_at: '2026-01-01',
  updated_at: '2026-01-01',
}

const memberUser: User = {
  id: 'usr-member-1',
  auth_user_id: 'auth-member-1',
  email: 'member@ada.test',
  full_name: 'Live Host',
  role: 'staff',
  system_permission: 'member',
  status: 'active',
  account_status: 'active',
  created_at: '2026-01-01',
  updated_at: '2026-01-01',
}

test('RBAC Invariant 1: All roles see the exact same 29 navigation entries', () => {
  const roles = [adminUser, leaderUser, memberUser]
  for (const user of roles) {
    const nav = filterNav(getNavigationForRole(user.system_permission), user)
    assert.equal(nav.length, UNIFIED_NAVIGATION_CATALOG.length)
    const hrefs = nav.map(item => item.href)
    assert.deepEqual(hrefs, UNIFIED_NAVIGATION_CATALOG.map(item => item.href))
  }
})

test('RBAC Invariant 2 & 3: Restricted data is guarded; view-only does not expose mutations', () => {
  const memberNav = filterNav(getNavigationForRole('member'), memberUser)

  // Payroll is restricted for member
  const payrollItem = memberNav.find(i => i.href === '/payroll')
  assert.ok(payrollItem)
  assert.equal(payrollItem.accessStatus, 'restricted')

  // Audit requires audit.view / audit.view_team -> member is restricted
  const auditItem = memberNav.find(i => i.href === '/audit')
  assert.ok(auditItem)
  assert.equal(auditItem.accessStatus, 'restricted')

  // Account Management requires staff.manage -> member is restricted
  const accountItem = memberNav.find(i => i.href === '/staff?tab=accounts')
  assert.ok(accountItem)
  assert.equal(accountItem.accessStatus, 'restricted')

  // Campaigns requires campaigns.manage -> member gets read_only
  const campaignsItem = memberNav.find(i => i.href === '/campaigns')
  assert.ok(campaignsItem)
  assert.equal(campaignsItem.accessStatus, 'read_only')

  // Admin gets available for all
  const adminNav = filterNav(getNavigationForRole('admin'), adminUser)
  for (const item of adminNav) {
    if (item.href !== '/storage') {
      assert.equal(item.accessStatus, 'available', `Admin must have available access to ${item.name}`)
    }
  }
})

test('RBAC Invariant 4: Payroll company data is Admin-only; non-admins get 403 restricted state', () => {
  const payrollPage = readFileSync(new URL('../app/(dashboard)/payroll/page.tsx', import.meta.url), 'utf8')
  assert.match(payrollPage, /resolveSystemPermission\(currentUser\) !== 'admin'/)
  assert.match(payrollPage, /Bạn không có quyền truy cập bảng lương \(403\)\./)
})

test('RBAC Invariant 5: Personal payslip is accessible to all roles and keyed by actor identity', () => {
  const payrollPage = readFileSync(new URL('../app/(dashboard)/payroll/page.tsx', import.meta.url), 'utf8')
  assert.match(payrollPage, /tabParam === 'personal'/)
  assert.match(payrollPage, /<MyPayslipPanel key=\{identityKey \?\? currentUser\.id\}/)
})

test('RBAC Invariant 6: Account-level denied permissions take precedence over role defaults', () => {
  // Leader normally has shifts.assign_staff
  const leaderDefault = filterNav(getNavigationForRole('leader'), leaderUser)
  const staffingDefault = leaderDefault.find(i => i.href === '/staffing')
  assert.equal(staffingDefault?.accessStatus, 'available')

  // Explicit server-attested denial overrides role
  const leaderDenied = filterNav(getNavigationForRole('leader'), leaderUser, undefined, {
    'shifts.assign_staff': false,
  })
  const staffingDenied = leaderDenied.find(i => i.href === '/staffing')
  assert.equal(staffingDenied?.accessStatus, 'read_only')
})

test('RBAC Invariant 7: Identity switching invalidates cached protected content', () => {
  const calWorkspace = readFileSync(new URL('../components/features/calendar/CalendarWorkspace.tsx', import.meta.url), 'utf8')
  const payrollPage = readFileSync(new URL('../app/(dashboard)/payroll/page.tsx', import.meta.url), 'utf8')

  // CalendarWorkspace keys by identity: id + permission + updated_at
  assert.match(calWorkspace, /key=\{identity\}/)
  assert.match(calWorkspace, /currentUser\.id \+ ':' \+ resolveSystemPermission\(currentUser\)/)

  // Payroll keys by identityKey
  assert.match(payrollPage, /key=\{identityKey\}/)
})

test('RBAC Invariant 8: Unauthenticated failsafe strips elevated routes', () => {
  const unauthNav = filterNav(getNavigationForRole('admin'), null)
  const unauthHrefs = unauthNav.map(i => i.href)
  assert.ok(!unauthHrefs.includes('/admin'))
  assert.ok(!unauthHrefs.includes('/payroll'))
  assert.ok(!unauthHrefs.includes('/storage'))
  assert.ok(!unauthHrefs.includes('/audit'))
})
