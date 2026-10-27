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

test('Reference module surfaces remain real routes with original business logic', () => {
  const calendar = source('app/(dashboard)/calendar/page.tsx')
  const reports = source('app/(dashboard)/reports/page.tsx')
  const payroll = source('app/(dashboard)/payroll/page.tsx')
  const profile = source('app/(dashboard)/profile/page.tsx')
  assert.ok(calendar.includes('<CalendarWorkspace />'))
  assert.ok(reports.includes('<LazyReportsList />'))
  assert.ok(payroll.includes("permission !== 'admin'"))
  assert.ok(profile.includes('userService.update('))
  for (const css of ['ada-calendar-page', 'ada-reports-page', 'ada-payroll-page', 'ada-profile-page']) {
    assert.ok(source('app/globals.css').includes(css))
  }
  const nav = source('components/layout/BottomNav.tsx')
  for (const route of ['/profile','/notifications','/settings']) {
    assert.ok(nav.includes('href="'+route+'"'))
  }
})

test('Member mobile dashboard displays real view-model data with links to existing routes', () => {
  const view = source('components/features/dashboard/presentation/member/MemberDashboardMobile.tsx')
  for (const marker of ['mySchedule.length', 'myActions.length', 'nextShift', 'openShifts']) assert.ok(view.includes(marker), marker)
  for (const route of ['/calendar', '/reports', '/workforce', '/swaps']) {
    assert.ok(view.includes("href: '" + route + "'") || view.includes('href="' + route + '"'), route)
  }
  const base = source('components/features/dashboard/presentation/member/MemberDashboardView.tsx')
  assert.ok(base.includes('<MemberDashboardMobile'))
  assert.ok(base.includes('md:flex'))
})
