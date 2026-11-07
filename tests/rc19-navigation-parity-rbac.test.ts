import test from 'node:test'
import assert from 'node:assert/strict'
import {
  UNIFIED_NAVIGATION_CATALOG,
  getNavigationForRole,
  filterNav,
  groupNavigation,
} from '@/lib/ui/role-ux'
import { filterWorkforceNavigation } from '@/lib/ui/workforceNavigation'
import type { User } from '@/lib/types/database.types'

test('RC19 C4.4: Navigation Parity — all modules are visible across all authenticated roles', () => {
  const roles = ['admin', 'leader', 'member'] as const
  const operationalRoles = ['host', 'support', 'technical'] as const

  for (const role of roles) {
    const rawNav = getNavigationForRole(role)
    assert.equal(rawNav.length, 29, `${role} navigation must include all application modules`)
    assert.equal(rawNav.length, UNIFIED_NAVIGATION_CATALOG.length)

    const user: Pick<User, 'role' | 'system_permission'> = {
      role: role === 'member' ? 'staff' : role,
      system_permission: role,
    }

    const filtered = filterNav(rawNav, user)
    // No module may be removed for authenticated users
    assert.equal(filtered.length, 29, `${role} filtered navigation must keep all modules`)

    // Verify all 5 groups exist and are populated
    const grouped = groupNavigation(filtered)
    assert.deepEqual(grouped.map(g => g.id), ['overview', 'operations', 'data', 'people', 'system'])
    for (const group of grouped) {
      assert.ok(group.items.length > 0, `Group ${group.id} must have items for ${role}`)
    }
  }

  // Operational roles (host, support, technical) inherit member permission with role distinction
  for (const opRole of operationalRoles) {
    const user: Pick<User, 'role' | 'system_permission'> = {
      role: opRole,
      system_permission: 'member',
    }
    const filtered = filterNav(getNavigationForRole('member'), user)
    assert.equal(filtered.length, 29, `Operational role ${opRole} must see all modules`)
  }
})

test('RC19 C4.4: Navigation Access Status — distinct visibility, view access, and action access states', () => {
  const adminUser: Pick<User, 'role' | 'system_permission'> = { role: 'admin', system_permission: 'admin' }
  const leaderUser: Pick<User, 'role' | 'system_permission'> = { role: 'leader', system_permission: 'leader' }
  const memberUser: Pick<User, 'role' | 'system_permission'> = { role: 'staff', system_permission: 'member' }

  const adminNav = filterNav(getNavigationForRole('admin'), adminUser)
  const leaderNav = filterNav(getNavigationForRole('leader'), leaderUser)
  const memberNav = filterNav(getNavigationForRole('member'), memberUser)

  // 1. Admin sees all modules; disabled global features remain visibly unavailable.
  for (const item of adminNav) {
    assert.ok(['available', 'unavailable'].includes(item.accessStatus || ''), `Admin module state must be resolved for ${item.name} (${item.href})`)
  }

  // 2. Leader has elevated admin routes restricted, operational routes available
  const leaderAdmin = leaderNav.find(i => i.href === '/admin')
  assert.equal(leaderAdmin?.accessStatus, 'restricted', 'Leader must have restricted access status for /admin')

  const leaderPayroll = leaderNav.find(i => i.href === '/payroll')
  assert.equal(leaderPayroll?.accessStatus, 'restricted', 'Leader must have restricted access status for company /payroll')

  const leaderAudit = leaderNav.find(i => i.href === '/audit')
  assert.equal(leaderAudit?.accessStatus, 'available', 'Leader must have available access status for /audit (audit.view_team)')

  const leaderStaffing = leaderNav.find(i => i.href === '/staffing')
  assert.equal(leaderStaffing?.accessStatus, 'available', 'Leader has action permission for /staffing')

  // 3. Member has company management restricted, mutations read_only, personal workflows available
  const memberAdmin = memberNav.find(i => i.href === '/admin')
  assert.equal(memberAdmin?.accessStatus, 'restricted', 'Member must have restricted status for /admin')

  const memberAudit = memberNav.find(i => i.href === '/audit')
  assert.equal(memberAudit?.accessStatus, 'restricted', 'Member must have restricted status for /audit')

  const memberPayroll = memberNav.find(i => i.href === '/payroll')
  assert.equal(memberPayroll?.accessStatus, 'restricted', 'Member must have restricted status for /payroll')

  const memberPersonalPayslip = memberNav.find(i => i.href === '/payroll?tab=personal')
  assert.equal(memberPersonalPayslip?.accessStatus, 'available', 'Member has available access for personal payslip')

  const memberStaffing = memberNav.find(i => i.href === '/staffing')
  assert.equal(memberStaffing?.accessStatus, 'read_only', 'Member has read_only access to /staffing (no assign permission)')

  const memberRegistration = memberNav.find(i => i.href === '/staffing?tab=registration')
  assert.equal(memberRegistration?.accessStatus, 'read_only', 'Member has read_only access to registration management')

  const memberCalendar = memberNav.find(i => i.href === '/calendar')
  assert.equal(memberCalendar?.accessStatus, 'available', 'Member has available access to calendar')

  const memberShifts = memberNav.find(i => i.href === '/shifts')
  assert.equal(memberShifts?.accessStatus, 'available', 'Member has available access to shifts')

  const memberAttendance = memberNav.find(i => i.href === '/calendar?tab=attendance')
  assert.equal(memberAttendance?.accessStatus, 'available', 'Member has available access to attendance')
})

test('RC19 C4.4: navigation reflects server-attested account permission overrides', () => {
  const leaderUser: Pick<User, 'role' | 'system_permission'> = { role: 'leader', system_permission: 'leader' }
  const denied = filterNav(getNavigationForRole('leader'), leaderUser, undefined, { 'shifts.assign_staff': false })
  assert.equal(denied.find(item => item.href === '/staffing')?.accessStatus, 'read_only')

  const granted = filterNav(getNavigationForRole('leader'), leaderUser, undefined, { 'shifts.assign_staff': true })
  assert.equal(granted.find(item => item.href === '/staffing')?.accessStatus, 'available')
})

test('RC19 C4.4: Workforce Navigation Filter — does not strip items, preserves discovery parity', () => {
  const memberUser: Pick<User, 'role' | 'system_permission'> = { role: 'staff', system_permission: 'member' }
  const rawNav = filterNav(getNavigationForRole('member'), memberUser)

  // With no elevated capabilities:
  const noCaps = filterWorkforceNavigation(rawNav, {
    actual_staffing: false,
    team_performance: false,
    own_performance: false,
    payroll: false,
  })
  assert.equal(noCaps.length, 29, 'filterWorkforceNavigation must never remove routes')
  assert.equal(noCaps.find(i => i.href === '/payroll')?.accessStatus, 'restricted')
  assert.equal(noCaps.find(i => i.href === '/workforce')?.accessStatus, 'restricted')

  // With own_performance capability:
  const ownCaps = filterWorkforceNavigation(rawNav, {
    actual_staffing: false,
    team_performance: false,
    own_performance: true,
    payroll: false,
  })
  assert.equal(ownCaps.length, 29)
  assert.equal(ownCaps.find(i => i.href === '/workforce')?.accessStatus, 'read_only')

  // With full capabilities:
  const fullCaps = filterWorkforceNavigation(rawNav, {
    actual_staffing: true,
    team_performance: true,
    own_performance: true,
    payroll: true,
  })
  assert.equal(fullCaps.length, 29)
  assert.equal(fullCaps.find(i => i.href === '/payroll')?.accessStatus, 'available')
  assert.equal(fullCaps.find(i => i.href === '/workforce')?.accessStatus, 'available')
})

test('RC19 C4.4: Unauthenticated Failsafe — strips elevated routes when currentUser is null', () => {
  const unauthNav = filterNav(getNavigationForRole('admin'), null)
  const paths = unauthNav.map(i => i.href)

  // Elevated routes must be stripped when unauthenticated
  assert.ok(!paths.includes('/admin'), 'Unauthenticated user stripped of /admin')
  assert.ok(!paths.includes('/audit'), 'Unauthenticated user stripped of /audit')
  assert.ok(!paths.includes('/payroll'), 'Unauthenticated user stripped of /payroll')
  assert.ok(!paths.includes('/storage'), 'Unauthenticated user stripped of /storage')
  assert.ok(!paths.includes('/staff'), 'Unauthenticated user stripped of /staff')
})
