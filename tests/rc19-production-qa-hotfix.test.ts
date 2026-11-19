import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const fromSource = (path: string) => readFileSync(new URL('../' + path, import.meta.url), 'utf8')

test('P0 / BUG-PROD-001: AdaNavigationTransition waits for route-owned readiness and exposes retry on timeout', () => {
  const source = fromSource('components/branding/AdaNavigationTransition.tsx')
  assert.match(source, /ROUTE_READINESS_TIMEOUT_MS\s*=\s*20_000/)
  assert.match(source, /data-route-readiness/)
  assert.match(source, /EXPLICIT_READINESS_PATHS/)
  assert.doesNotMatch(source, /window\.fetch\s*=/, 'readiness does not monkeypatch global fetch')
  assert.doesNotMatch(source, /NAVIGATION_FAILSAFE_MS|INITIAL_MOUNT_FAILSAFE_MS|FETCH_BLOCKING_WINDOW_MS/)
  assert.match(source, /function routeHasTerminalState\(\)/)
  assert.match(source, /\[role="alert"\]/)
  assert.match(source, /role="alertdialog"/)
  assert.match(source, /window\.location\.reload\(\)/)
  assert.match(source, /previousFocus\.current\.focus/)
  const matchFn = source.match(/function routeContentIsLoading\(\)[\s\S]*?\n\}/)
  assert.ok(matchFn)
  assert.doesNotMatch(matchFn[0], /\.animate-pulse|data-testid\*="skeleton"/)
})

test('C4 route-owned readiness is wired to the slow initial data routes', () => {
  const routes = [
    ['components/features/dashboard/DashboardOverview.tsx', /data-route-readiness="pending"/, /data-route-readiness=\{capabilitiesLoading/],
    ['components/features/calendar/CalendarView.tsx', /data-route-readiness=\{loadError/],
    ['components/features/registration/RegistrationReviewWorkspace.tsx', /data-route-readiness="pending"/, /data-route-readiness="ready"/],
    ['components/features/reports/ReportsList.tsx', /data-route-readiness="pending"/, /data-route-readiness="ready"/],
    ['app/(dashboard)/workforce/page.tsx', /data-route-readiness="pending"/, /data-route-readiness=\{routeReadiness\}/], ['components/features/calendar/ShiftRegistrationBoard.tsx', /data-route-readiness="pending"/, /data-route-readiness=\{loadError/], ['components/features/calendar/StaffingWorkspace.tsx', /data-route-readiness="pending"/, /data-route-readiness="ready"/], ['components/features/calendar/ScheduleImportPanel.tsx', /data-route-readiness="pending"/, /data-route-readiness="ready"/], ['components/features/workforce/AttendanceSourceManager.tsx', /data-route-readiness="ready"/],
  ] as const
  for (const [file, ...assertions] of routes) {
    const source = fromSource(file)
    for (const assertion of assertions) assert.match(source, assertion, `${file} publishes route readiness`)
  }
})

test('C4 BrandLogo uses persisted Brand identity and neutral failure fallback', () => {
  const source = fromSource('components/features/brands/BrandLogo.tsx')
  const dashboard = fromSource('components/features/dashboard/DashboardOverview.tsx')
  const brandList = fromSource('components/features/brands/BrandList.tsx')
  assert.match(source, /brandId: string/)
  assert.match(source, /logoUrl\?: string \| null/)
  assert.match(source, /url\.protocol === 'https:' \|\| url\.protocol === 'http:'/)
  assert.match(source, /bg-slate-100 font-semibold text-slate-600/)
  assert.match(source, /onError=\{\(\) => setFailedUrl/)
  assert.match(dashboard, /brandLogoUrl: brands\.find\(brand => brand\.id === s\.brand_id\)/)
  assert.match(brandList, /<BrandLogo brandId=\{brand\.id\}/)
})

test('P1 / BUG-PROD-002: AdminWorkspace non-admin access denied renders immediate recovery UI', () => {
  const source = fromSource('components/features/admin/AdminWorkspace.tsx')

  // 1. Must NOT contain <main>
  assert.doesNotMatch(source, /<main[\s>]/, 'AdminWorkspace contains 0 <main> landmarks')
  assert.doesNotMatch(source, /<\/main>/, 'AdminWorkspace contains 0 </main> tags')

  // 2. Gate section renders accessible role alert and home link
  assert.match(source, /data-testid="admin-workspace-gate"/, 'admin-workspace-gate section rendered')
  assert.match(source, /role="alert"/, 'role="alert" rendered in denied state')
  assert.match(source, /href="\/"/, 'Link back to home provided')
  assert.match(source, /Về trang chủ/, 'Vietnamese recovery CTA present')
})

test('P2 / BUG-PROD-003: Semantic Landmark Uniqueness across all dashboard feature workspaces', () => {
  const filesToCheck = [
    'components/features/admin/AdminWorkspace.tsx',
    'components/features/storage/OperationalFileWorkspace.tsx',
    'components/features/storage/StorageResourceRegistry.tsx',
    'components/features/brand-catalog/BrandCatalogWorkspace.tsx',
    'components/features/payroll/MyPayslipPanel.tsx',
    'components/features/dashboard/presentation/OpsMobileHome.tsx',
  ]

  for (const file of filesToCheck) {
    const src = fromSource(file)
    assert.doesNotMatch(src, /<main[\s>]/, `${file} MUST NOT contain <main> landmark`)
    assert.doesNotMatch(src, /<\/main>/, `${file} MUST NOT contain </main> closing tag`)
  }

  // Verify ProductionAppShell maintains the single authoritative main landmark
  const shell = fromSource('components/layout/ProductionAppShell.tsx')
  const mainMatches = shell.match(/<main[\s>]/g)
  assert.equal(mainMatches?.length, 1, 'ProductionAppShell contains exactly one root <main> landmark')
  assert.match(shell, /data-testid="production-main-content"/, 'ProductionAppShell main has testid')
})

test('P2 / BUG-PROD-004: Payroll Mobile Toolbar and Container Overflow Protection', () => {
  const pageSrc = fromSource('app/(dashboard)/payroll/page.tsx')
  const periodSrc = fromSource('components/features/payroll/PayrollPeriodManager.tsx')
  const rateSrc = fromSource('components/features/payroll/PayrollRateManager.tsx')
  const auditSrc = fromSource('components/features/payroll/PayrollAuditTimeline.tsx')
  const cssSrc = fromSource('app/globals.css')

  // 1. Payroll Page Tabs & Content container constraints
  assert.match(pageSrc, /<Tabs[\s\S]*?className="w-full min-w-0 max-w-full space-y-4"/, 'Tabs has w-full min-w-0 max-w-full')
  assert.match(pageSrc, /TabsContent value="workspace" className="w-full min-w-0 max-w-full/, 'Workspace tab constrained')
  assert.match(pageSrc, /TabsContent value="periods" className="w-full min-w-0 max-w-full/, 'Periods tab constrained')
  assert.match(pageSrc, /TabsContent value="rates" className="w-full min-w-0 max-w-full/, 'Rates tab constrained')
  assert.match(pageSrc, /TabsContent value="room_rules" className="w-full min-w-0 max-w-full/, 'Room rules tab constrained')

  // 2. CardHeader controls flex-wrap
  assert.match(periodSrc, /<div className="flex flex-wrap items-center gap-2">/, 'PayrollPeriodManager action buttons have flex-wrap')
  assert.match(periodSrc, /w-full min-w-0 max-w-full overflow-x-auto/, 'PayrollPeriodManager table container constrained')

  assert.match(rateSrc, /<div className="flex flex-wrap items-center gap-2">/, 'PayrollRateManager action buttons have flex-wrap')
  assert.match(rateSrc, /w-full min-w-0 max-w-full overflow-x-auto/, 'PayrollRateManager table container constrained')

  assert.match(auditSrc, /<div className="flex flex-wrap items-center gap-2">/, 'PayrollAuditTimeline action buttons have flex-wrap')

  // 3. Responsive CSS includes ada-payroll-page
  assert.match(cssSrc, /\.ada-pwa-shell :is\(\.ada-workspace-page, \.ada-payroll-page\)/, 'globals.css includes .ada-payroll-page in mobile overflow prevention')
})

test('P3 / BUG-PROD-005: Login page pending fallback provides SSR semantic form fields', () => {
  const loginSrc = fromSource('app/login/page.tsx')

  // LoginPagePending must provide semantic form inputs instead of empty skeleton blocks
  assert.match(loginSrc, /id="email-pending"/, 'LoginPagePending contains email input')
  assert.match(loginSrc, /name="email"/, 'LoginPagePending contains name="email"')
  assert.match(loginSrc, /type="email"/, 'LoginPagePending contains type="email"')

  assert.match(loginSrc, /id="password-pending"/, 'LoginPagePending contains password input')
  assert.match(loginSrc, /name="password"/, 'LoginPagePending contains name="password"')
  assert.match(loginSrc, /type="password"/, 'LoginPagePending contains type="password"')

  // Skeletons that caused empty form warnings should be eliminated from LoginPagePending
  const matchPending = loginSrc.match(/function LoginPagePending\(\)[\s\S]*?\n\}/)
  assert.ok(matchPending, 'LoginPagePending found')
  assert.doesNotMatch(matchPending[0], /\.animate-pulse/, 'LoginPagePending does NOT use animate-pulse skeletons')
})
