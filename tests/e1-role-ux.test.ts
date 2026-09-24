import assert from 'node:assert'
import { test } from 'node:test'
import { getNavigationForRole } from '../lib/ui/role-ux'

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
  assert.ok(paths.includes('/platforms'))
  assert.ok(paths.includes('/campaigns'))
  assert.ok(paths.includes('/staff'))
  assert.ok(paths.includes('/audit'))
  assert.ok(paths.includes('/settings'))
})

test('E1: Leader Navigation includes all requested routes', () => {
  const leaderNav = getNavigationForRole('leader')
  const paths = leaderNav.map(n => n.href)
  
  assert.ok(paths.includes('/')) // Team Operations
  assert.ok(paths.includes('/calendar'))
  assert.ok(paths.includes('/live'))
  assert.ok(paths.includes('/shifts'))
  assert.ok(paths.includes('/staffing'))
  assert.ok(paths.includes('/swaps'))
  assert.ok(paths.includes('/reports'))
  assert.ok(paths.includes('/staff')) // Staff Directory
  assert.ok(paths.includes('/notifications'))
})

test('E1: Member Navigation includes reference data but excludes Analytics and Audit', () => {
  const memberNav = getNavigationForRole('member')
  const paths = memberNav.map(n => n.href)
  
  assert.ok(paths.includes('/')) // My Workspace
  assert.ok(paths.includes('/calendar?tab=mine')) // My Schedule
  assert.ok(paths.includes('/calendar?tab=open')) // Open Shifts
  assert.ok(paths.includes('/swaps')) // My Swaps
  assert.ok(paths.includes('/live'))
  assert.ok(paths.includes('/reports'))
  assert.ok(paths.includes('/notifications'))
  assert.ok(paths.includes('/profile'))
  
  assert.ok(!paths.includes('/analytics'), 'Member should not see analytics')
  assert.ok(!paths.includes('/audit'), 'Member should not see audit')
})
