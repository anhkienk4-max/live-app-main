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

test('Dashboard visual QA runs actual responsive app and preserves mock/Production boundary', () => {
 const conf = source('playwright.pwa-dashboard.config.ts')
 const spec = source('e2e/pwa-dashboard-mobile.spec.ts')
 const mobile = source('components/features/dashboard/presentation/OpsMobileHome.tsx')
 assert.ok(conf.includes("NEXT_PUBLIC_USE_MOCK_DATA: 'true'"))
 assert.ok(conf.includes("SUPABASE_SECRET_KEY: ''"))
 assert.ok(conf.includes("VERCEL_ENV: ''"))
 assert.ok(spec.includes("name: 'edge-narrow-620'"))
 assert.ok(spec.includes("name: 'iphone-390'"))
 assert.ok(spec.includes("name: 'android-412'"))
 assert.ok(spec.includes('ada-reference-mobile-home'))
 assert.ok(mobile.includes('liveCount === null'))
});

test('Authenticated mobile topbar displays ADA OPS brand, not old LiveStream Ops mark', () => {
  const header = source('components/layout/Header.tsx')
  assert.ok(header.includes('<AdaBrand inverse compact className="ada-header__brand" />'))
  assert.ok(header.includes('className="ada-header sticky'))
  assert.ok(!header.includes('              LiveStream Ops'))
});

test('Member mobile shortcuts and today KPI use valid role workflow and business date', () => {
  const mobile = source('components/features/dashboard/presentation/OpsMobileHome.tsx')
  const member = source('components/features/dashboard/presentation/member/MemberDashboardView.tsx')
  assert.ok(mobile.includes("href: '/calendar?tab=open', title: 'Đăng ký ca'"))
  assert.ok(mobile.includes("href: '/staffing?tab=registration', title: 'Duyệt đăng ký'"))
  assert.ok(!mobile.includes("href: '/registration', title: 'Đăng ký ca'"))
  assert.ok(member.includes('item.date === getCurrentBusinessDate()'))
  assert.ok(member.includes('shiftCount={todayShiftCount}'))
});
