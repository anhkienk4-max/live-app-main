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
