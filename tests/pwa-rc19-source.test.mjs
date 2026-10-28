import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8')

test('PWA manifest defines installation, icon and no offline mutation strategy', () => {
  const manifest = source('app/manifest.ts')
  assert.match(manifest, /display: "standalone"/)
  assert.match(manifest, /start_url: "\/"/)
  assert.match(manifest, /scope: "\/"/)
  for (const path of ['/icon1', '/icon2', '/icon3']) assert.ok(manifest.includes(path))
})
test('PWA exact assets are publicly routable, without bypassing protected pages', () => {
  const proxy = source('proxy.ts')
  for (const asset of ['manifest', 'apple-icon', 'pwa-splash']) assert.ok(proxy.includes(asset))
  assert.ok(proxy.includes('authProxy(request)'))
})
test('Current RC19 is retained as application source, including critical workflows', () => {
  assert.ok(source('app/(dashboard)/payroll/page.tsx').includes('MyPayslipPanel'))
  assert.ok(source('components/features/calendar/CalendarView.tsx').includes('readCalendarWindow'))
  assert.ok(source('components/features/reports/ReportsContainer.tsx').includes('useShiftChangeRefresh'))
  assert.ok(source('app/login/page.tsx').includes('startGoogleOAuth'))
  assert.ok(source('app/login/page.tsx').includes("fetch('/api/auth/providers'"))
  assert.ok(source('app/api/auth/callback/route.ts').includes('createOAuthCallbackHandler'))
})
test('Approved PWA Login skin wraps RC19 auth handlers, without replacing auth', () => {
  assert.ok(source('components/layouts/AuthLayout.tsx').includes('data-testid="ada-reference-login"'))
  assert.ok(source('app/login/page.tsx').includes('<AuthLayout variant="login"'))
  assert.ok(source('app/globals.css').includes('ADA OPS PWA Visual W1'))
  assert.ok(source('app/layout.tsx').includes('QueryProvider'))
  assert.ok(source('app/layout.tsx').includes('manifest: "/manifest.webmanifest"'))
})
test('Active Reports route keeps RC19 data loader and mobile cards', () => {
  assert.ok(source('components/features/reports/ReportsContainer.tsx').includes('data-testid="pwa-report-quick-filters"'))
  assert.ok(source('components/features/reports/ReportsView.tsx').includes('data-testid="pwa-reports-cards"'))
  assert.ok(source('components/layout/BottomNav.tsx').includes('getSharedNavigation'))
})

test('RC19 dashboard presents actual admin, leader, member view models in the PWA mobile layout', () => {
  const sourceCode = source('components/features/dashboard/presentation/OpsMobileHome.tsx')
  const overview = source('components/features/dashboard/DashboardOverview.tsx')
  const admin = source('components/features/dashboard/presentation/admin/AdminDashboardView.tsx')
  const leader = source('components/features/dashboard/presentation/leader/LeaderDashboardView.tsx')
  const member = source('components/features/dashboard/presentation/member/MemberDashboardView.tsx')
  assert.ok(sourceCode.includes('data-testid="ada-reference-mobile-home"'))
  assert.ok(sourceCode.includes('data-testid="ada-mobile-home-shift"'))
  assert.ok(sourceCode.includes('data-testid="ada-mobile-home-quick-links"'))
  assert.ok(sourceCode.includes('pendingCount === null'))
  assert.ok(sourceCode.includes("attention === null"))
  for (const text of ["role=\"admin\"", "role=\"leader\"", "role=\"member\""]) {
    assert.ok([admin, leader, member].some(file => file.includes(text)))
  }
  assert.ok(overview.includes('userName={props.currentUser.full_name}'))
  assert.ok(overview.includes('userName={currentUser.full_name}'))
  assert.ok(admin.includes('liveCount={liveShifts.length}'))
  assert.ok(leader.includes('onView: nextMobileShift.onView'))
  assert.ok(member.includes('onOpenNextShift'))
  assert.ok(admin.includes('md:flex'))
});
