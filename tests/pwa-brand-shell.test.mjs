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
    assert.ok(nav.includes("href: '" + route + "'") || nav.includes('href="'+route+'"'))
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
  assert.ok(base.includes('lg:flex'))
})

test('Auth tablet landscape uses a two-panel layout and mobile remains scrollable', () => {
  const auth = source('components/layouts/AuthLayout.tsx')
  assert.ok(auth.includes('md:flex-row'), 'tablet must use two-panel auth layout')
  assert.ok(auth.includes('md:min-h-dvh'), 'both tablet panels must occupy viewport height')
  assert.ok(auth.includes('md:mt-0'), 'auth card must not overlap brand on tablet')
  assert.ok(auth.includes('{children}'), 'preserve login and recovery form content')
  const css = source('app/globals.css')
  assert.ok(css.includes('min-height: clamp(245px, 32dvh, 300px)'), 'mobile hero must be bounded')
  assert.ok(css.includes('env(safe-area-inset-bottom)'), 'mobile safe area must remain supported')
  const login = source('app/login/page.tsx')
  assert.ok(login.includes('establishPasswordSession('), 'authentication logic must remain unchanged')
})

test('Tablet navigation expands using ordinary links instead of a popup portal', () => {
  const header = source('components/layout/Header.tsx')
  assert.ok(header.includes('data-testid="tablet-nav-toggle"'))
  assert.ok(header.includes('data-testid="tablet-nav-panel"'))
  assert.ok(header.includes('aria-expanded={open}'))
  assert.ok(header.includes('onClick={() => setOpen(false)}'))
  assert.ok(header.includes('filterWorkforceNavigation(filterNav('))
  const part = header.slice(header.indexOf('function MobileNavMenu()'), header.indexOf('interface HeaderProps'))
  assert.ok(!part.includes('<DropdownMenu'), 'tablet menu must not use popup primitives')
})

test('Dashboard reference mobile is role-aware, not restricted to Member only', () => {
  const admin = source('components/features/dashboard/presentation/admin/AdminDashboardView.tsx')
  const leader = source('components/features/dashboard/presentation/leader/LeaderDashboardView.tsx')
  const member = source('components/features/dashboard/presentation/member/MemberDashboardView.tsx')
  for (const component of [admin, leader]) {
    assert.ok(component.includes('<OperationsMobileHome'))
    assert.ok(component.includes('lg:flex'), 'existing desktop layout must remain')
  }
  assert.ok(member.includes('<MemberDashboardMobile'))
  const shared = source('components/features/dashboard/presentation/OperationsMobileHome.tsx')
  assert.ok(shared.includes('todaysShifts') || shared.includes('today: number'))
  assert.ok(shared.includes('pending: number'))
  assert.ok(shared.includes('/payroll'))
  assert.ok(shared.includes('admin ?'))
  const bottom = source('components/layout/BottomNav.tsx')
  assert.ok(bottom.includes('data-testid="ada-reference-tabs"'))
  assert.ok(bottom.includes('aria-expanded={open}'))
})
test('Login reference uses white page and blue-violet waves while preserving Supabase sign-in', () => {
  const auth = source('components/layouts/AuthLayout.tsx')
  const login = source('app/login/page.tsx')
  assert.ok(auth.includes('ada-login-reference__top'))
  assert.ok(auth.includes('ada-login-reference__bottom'))
  assert.ok(login.includes('variant="login"'))
  assert.ok(login.includes('establishPasswordSession('))
})

test('Reference loading state does not show legacy desktop skeleton on mobile', () => {
  const dashboard = source('components/features/dashboard/DashboardOverview.tsx')
  assert.ok(dashboard.includes('data-testid="ada-mobile-dashboard-loading"'))
  assert.ok(dashboard.includes('className="hidden space-y-3 lg:block"'))
  assert.ok(dashboard.includes('early.items.slice(0, 3)'))
})
