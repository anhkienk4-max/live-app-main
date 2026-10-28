import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8')
test('Main-based PWA UI candidate changes visual scope while keeping app service contracts', () => {
  const shell = read('components/layout/ProductionAppShell.tsx')
  const archetypes = read('components/ui/archetypes.tsx')
  const css = read('app/globals.css')
  const nav = read('components/layout/BottomNav.tsx')
  const staff = read('components/features/staff/StaffList.tsx')
  assert.ok(shell.includes('ada-pwa-shell'))
  assert.ok(archetypes.includes("archetype !== 'auth' && 'ada-workspace-page'"))
  assert.ok(css.includes('ADA OPS RC19 mobile visual system'))
  assert.ok(css.includes('--ada-mobile-control-height: 44px'))
  assert.ok(nav.includes('getNavigationForRole('))
  assert.ok(nav.includes('filterWorkforceNavigation('))
  assert.ok(nav.includes('h-[22px] w-[22px]'))
  assert.ok(staff.includes('staff-mobile-layout'))
  assert.ok(staff.includes('staff-mobile-card-'))
  assert.ok(staff.includes("hasPermission(currentUser, 'staff.manage')"))
  for(const name of ['approvePendingAccount','rejectPendingAccount','archive','restore','update']) {
    assert.ok(staff.includes('userService.'+name))
  }
})
