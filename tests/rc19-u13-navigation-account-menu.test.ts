import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { getNavigationForRole, getSharedNavigation, groupNavigation } from '../lib/ui/role-ux.ts'

const fromSource = (path: string) => readFileSync(new URL('../' + path, import.meta.url), 'utf8')

test('U13: one complete, stable sidebar destination catalogue for all actor roles', () => {
  const shared = getSharedNavigation()
  const hrefs = shared.map(item => item.href)
  assert.equal(new Set(hrefs).size, hrefs.length, 'one primary sidebar entry per route')
  for (const role of ['admin', 'leader', 'member'] as const) {
    for (const item of getNavigationForRole(role)) {
      const route = new URL(item.href, 'https://local.invalid').pathname
      assert.ok(shared.some(entry => new URL(entry.href, 'https://local.invalid').pathname === route),
        role + ' destination must remain reachable in the common navigation: ' + item.href)
    }
  }
  for (const route of ['/', '/calendar', '/live', '/shifts', '/staffing',
    '/swaps', '/storage', '/reports', '/workforce', '/analytics', '/payroll',
    '/brands', '/platforms', '/campaigns', '/staff', '/audit', '/settings',
    '/notifications', '/profile']) {
    assert.ok(hrefs.includes(route), 'missing U13 sidebar destination ' + route)
  }
  assert.ok(groupNavigation(shared).every(group => group.items.length > 0))
  assert.equal(shared, getSharedNavigation(), 'stable navigation reference across renders')
})

test('U13: desktop, tablet, and mobile shell use same visible navigation, not permission filters', () => {
  const shellSources = [
    fromSource('components/layout/Sidebar.tsx'),
    fromSource('components/layout/Header.tsx'),
    fromSource('components/layout/BottomNav.tsx'),
  ]
  for (const source of shellSources) {
    assert.match(source, /getSharedNavigation\(\)/)
    assert.doesNotMatch(source, /filterNav\(|filterWorkforceNavigation\(|getNavigationForRole\(/)
  }
  const permissions = fromSource('lib/permissions.ts')
  assert.match(permissions, /hasPermission/)
  const roleUx = fromSource('lib/ui/role-ux.ts')
  assert.match(roleUx, /function filterNav\(/)
  assert.match(roleUx, /hasAnyPermission\(currentUser, item\.requiredPermissions\)/)
  assert.doesNotMatch(roleUx, /return\s+true\s*\n\s*}\s*\n\s*export function filterNav/)
})

test('U13: header and sidebar have the same account actions; sidebar trigger is real', () => {
  const header = fromSource('components/layout/Header.tsx')
  const sidebar = fromSource('components/layout/Sidebar.tsx')
  const shared = fromSource('components/layout/AccountMenu.tsx')
  assert.match(header, /<AccountMenu placement="header" user={user}\s*\/>/)
  assert.match(sidebar, /<AccountMenu placement="sidebar"\s*\/>/)
  assert.match(shared, /data-testid="sidebar-account-trigger"/)
  assert.match(shared, /data-testid="user-menu-btn"/)
  assert.match(shared, /render={<button type="button"/)
  assert.match(shared, /href="\/profile"/)
  assert.match(shared, /href="\/settings"/)
  assert.match(shared, /data-testid="signout-btn"/)
  assert.match(shared, /clearLocalSession\(createClient\(\)\)/)
  assert.match(shared, /clearIdentity\(\)/)
  assert.match(shared, /window\.location\.replace\('\/login\?reason=signed_out'\)/)
})
