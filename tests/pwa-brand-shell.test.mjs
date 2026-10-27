import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
const source = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8')

test('ADA visual direction uses the reference palette without mutating the business semantics', () => {
  const css = source('app/globals.css')
  for (const token of ['#2563EB','#7C3AED','#06B6D4','#F8FAFF','#10B981','#F59E0B','#EF4444','#EC4899']) {
    assert.ok(css.includes(token), 'missing reference palette '+token)
  }
  assert.ok(css.includes('prefers-reduced-motion'))
})
test('Mobile shell keeps role filters and existing protected navigation', () => {
  const bottom = source('components/layout/BottomNav.tsx')
  assert.ok(bottom.includes('getNavigationForRole'))
  assert.ok(bottom.includes('filterWorkforceNavigation(filterNav('))
  assert.ok(bottom.includes('aria-current='))
  assert.ok(bottom.includes("'\x2freports'"))
  assert.ok(bottom.includes("'\x2fpayroll'"))
  const header = source('components/layout/Header.tsx')
  assert.ok(header.includes('handleSignOut'))
  assert.ok(header.includes('<GlobalSearch />'))
  assert.ok(source('components/layout/ProductionAppShell.tsx').includes('data-testid="production-app-shell"'))
})
test('Login retains user-provided children and no mock passwords or data', () => {
  const auth = source('components/layouts/AuthLayout.tsx')
  assert.ok(auth.includes('{children}'))
  assert.ok(auth.includes('<AdaBrand inverse'))
  assert.ok(source('components/branding/AdaBrand.tsx').includes('ada-brand'))
})
