import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { filterNav, getNavigationForRole, groupNavigation } from '../lib/ui/role-ux.ts'

const fromSource = (path: string) => readFileSync(new URL('../' + path, import.meta.url), 'utf8')

test('member and leader navigation omit Admin destinations while preserving personal workflows', () => {
  const admin = getNavigationForRole('admin')
  const leader = getNavigationForRole('leader')
  const member = filterNav(getNavigationForRole('member'), { role: 'staff', system_permission: 'member' })
  const paths = (items: typeof member) => items.map(item => new URL(item.href, 'https://local.invalid').pathname)
  const restricted = ['/payroll', '/brands', '/platforms', '/campaigns', '/audit', '/settings']
  for (const href of restricted) {
    assert.ok(paths(admin).includes(href), 'Admin retains ' + href)
    assert.ok(!paths(leader).includes(href), 'Leader does not inherit Admin-only destination ' + href)
    assert.ok(!paths(member).includes(href), 'Member does not inherit Admin-only destination ' + href)
  }
  for (const href of ['/calendar', '/shifts', '/swaps', '/reports', '/workforce']) {
    assert.ok(paths(member).includes(href), 'Member retains personal workflow ' + href)
  }
  assert.ok(groupNavigation(member).every(group => group.items.length > 0))
})

test('desktop, tablet, and mobile navigation are derived from the signed-in role', () => {
  const shellSources = [
    fromSource('components/layout/Sidebar.tsx'),
    fromSource('components/layout/Header.tsx'),
    fromSource('components/layout/BottomNav.tsx'),
  ]
  for (const source of shellSources) {
    assert.match(source, /getNavigationForRole\(/)
    assert.match(source, /filterNav\(/)
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
