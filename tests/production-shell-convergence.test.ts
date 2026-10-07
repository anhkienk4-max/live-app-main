import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { resolveProductionShell, resolveActiveNavigation } from '../components/layout/shellConfig'
import { getNavigationForRole, filterNav } from '../lib/ui/role-ux'
import { formatChartAxis, formatDimensionTick } from '../lib/utils/chartLabels'

test('route variants follow approved frames without changing route access', () => {
  for (const route of ['/calendar', '/reports', '/analytics', '/staff', '/staffing', '/swaps', '/notifications', '/shifts', '/shifts/create']) assert.equal(resolveProductionShell(route, new URLSearchParams()), 'ops')
  for (const route of ['/audit', '/settings', '/settings/personal']) assert.equal(resolveProductionShell(route, new URLSearchParams()), 'admin')
  assert.equal(resolveProductionShell('/calendar', new URLSearchParams('tab=import')), 'admin')
  assert.equal(resolveProductionShell('/calendar', new URLSearchParams('action=import')), 'admin')
  assert.equal(resolveProductionShell('/live', new URLSearchParams()), 'live')
  assert.equal(resolveProductionShell('/shifts/real-id', new URLSearchParams()), 'shift-detail')
  assert.equal(resolveProductionShell('/shifts/real-id/edit', new URLSearchParams()), 'ops')
})
test('nested and query navigation highlight one canonical destination per role', () => {
  const admin = getNavigationForRole('admin')
  assert.equal(resolveActiveNavigation(admin, '/shifts/create', new URLSearchParams()), '/shifts')
  assert.equal(resolveActiveNavigation(admin, '/shifts/real-id', new URLSearchParams()), '/shifts')
  assert.equal(resolveActiveNavigation(admin, '/staffing', new URLSearchParams('tab=registration')), '/staffing?tab=registration')
  assert.equal(resolveActiveNavigation(admin, '/calendar', new URLSearchParams('tab=import')), '/calendar')
  assert.equal(resolveActiveNavigation(admin, '/settings/personal', new URLSearchParams()), '/settings')
  assert.equal(resolveActiveNavigation(admin, '/shifts-other', new URLSearchParams()), undefined)
  const member = filterNav(getNavigationForRole('member'), { role: 'staff', system_permission: 'member' })
  assert.equal(resolveActiveNavigation(member, '/calendar', new URLSearchParams('tab=mine')), '/calendar?tab=mine')
  assert.equal(resolveActiveNavigation(member, '/calendar', new URLSearchParams('tab=open')), '/calendar?tab=open')
  assert.ok(!member.some(item => item.href.includes('registration')))
})
test('chart ticks stay compact; full values are not changed', () => {
  assert.equal(formatChartAxis(1000000000, true), '1B \u20ab')
  assert.equal(formatChartAxis(0, true), '0 \u20ab')
  assert.equal(formatDimensionTick('Long campaign name exceeding width').length, 12)
  assert.equal(formatDimensionTick('Brand'), 'Brand')
})
test('layout authentication gates and Settings mutation boundary remain present', () => {
  const layout = readFileSync('app/(dashboard)/layout.tsx', 'utf8')
  for (const gate of ['getVerifiedUser', 'createAuthIdentity', 'mapAuthIdentityToBusinessUser', 'identity_unavailable', 'session_expired', 'AuthIdentityProvider', 'RoleLensProvider']) assert.ok(layout.includes(gate))
  const settings = readFileSync('app/(dashboard)/settings/page.tsx', 'utf8')
  assert.ok(settings.includes('disabled={!isAdmin}'))
  assert.ok(settings.includes("hasPermission(currentUser, 'settings.admin')"))
  assert.ok(settings.includes('{isAdmin && <TabsContent value="system">'))
  const shell = readFileSync('components/layout/ProductionAppShell.tsx', 'utf8')
  assert.ok(!/ReferenceMock|visual-fixtures|min-w-\[/.test(shell))
})

test('browser Settings contract preserves Member hiding and Leader locking', () => {
  const harness = readFileSync('e2e/harness/core-v1-harness.ts', 'utf8').split('export const BROWSER_ROLE_EXPECTATIONS')[1]
  const member = harness.split('  member: {')[1].split('  leader: {')[0]
  const leader = harness.split('  leader: {')[1].split('  admin: {')[0]
  assert.ok(member.includes('settings_system: { visible: false }'))
  assert.ok(leader.includes('settings_system: { visible: true, locked: true }'))
  const header = readFileSync('components/layout/Header.tsx', 'utf8')
  assert.equal((header.match(/<GlobalSearch/g) || []).length, 1)
})
