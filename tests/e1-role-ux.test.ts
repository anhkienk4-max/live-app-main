import assert from 'node:assert'
import { test } from 'node:test'
import { getNavigationForRole } from '../lib/ui/role-ux'

test('E1: Admin Navigation includes all requested routes', () => {
  const adminNav = getNavigationForRole('admin')
  const paths = adminNav.map(n => n.href)
  
  assert.ok(paths.includes('/live'))
  assert.ok(paths.includes('/brands'))
  assert.ok(paths.includes('/platforms'))
  assert.ok(paths.includes('/campaigns'))
  assert.ok(paths.includes('/analytics'))
})

test('E1: Leader Navigation includes all requested routes', () => {
  const leaderNav = getNavigationForRole('leader')
  const paths = leaderNav.map(n => n.href)
  
  assert.ok(paths.includes('/live'))
  assert.ok(paths.includes('/brands'))
  assert.ok(paths.includes('/platforms'))
  assert.ok(paths.includes('/campaigns'))
  assert.ok(paths.includes('/analytics'))
})

test('E1: Member Navigation includes reference data but excludes Analytics and Audit', () => {
  const memberNav = getNavigationForRole('member')
  const paths = memberNav.map(n => n.href)
  
  assert.ok(paths.includes('/live'))
  assert.ok(paths.includes('/brands'))
  assert.ok(paths.includes('/platforms'))
  assert.ok(paths.includes('/campaigns'))
  
  assert.ok(!paths.includes('/analytics'), 'Member should not see analytics')
  assert.ok(!paths.includes('/audit'), 'Member should not see audit')
})
