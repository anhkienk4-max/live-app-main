import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const fromSource = (path: string) => readFileSync(new URL('../' + path, import.meta.url), 'utf8')

test('P0 / BUG-PROD-001: AdaNavigationTransition eliminates pulse deadlock and installs initial mount failsafe', () => {
  const source = fromSource('components/branding/AdaNavigationTransition.tsx')

  // 1. Initial mount failsafe timer must be present and armed
  assert.match(source, /INITIAL_MOUNT_FAILSAFE_MS\s*=\s*3_000/, 'INITIAL_MOUNT_FAILSAFE_MS set to 3000ms')
  assert.match(source, /NAVIGATION_FAILSAFE_MS\s*=\s*3_000/, 'NAVIGATION_FAILSAFE_MS lowered to 3000ms')
  assert.match(source, /FETCH_BLOCKING_WINDOW_MS\s*=\s*1_000/, 'FETCH_BLOCKING_WINDOW_MS set to 1000ms')

  // 2. Terminal state detection bypasses waiting immediately
  assert.match(source, /function routeHasTerminalState\(\)/, 'routeHasTerminalState helper defined')
  assert.match(source, /\[role="alert"\]/, 'Matches role=alert for instant release')
  assert.match(source, /\[data-testid\*="error"/, 'Matches data-testid error')
  assert.match(source, /\[data-testid\*="denied"/, 'Matches data-testid denied')

  // 3. routeContentIsLoading selector must NOT match generic .animate-pulse or widget skeletons
  const matchFn = source.match(/function routeContentIsLoading\(\)[\s\S]*?\n\}/)
  assert.ok(matchFn, 'routeContentIsLoading found')
  // Strip comments to test selector string
  const fnBodyNoComments = matchFn[0].replace(/\/\/.*$/gm, '')
  assert.doesNotMatch(fnBodyNoComments, /\.animate-pulse/, 'routeContentIsLoading code does NOT include .animate-pulse')
  assert.doesNotMatch(fnBodyNoComments, /data-testid\*="skeleton"/, 'routeContentIsLoading code does NOT include data-testid skeleton')

  // 4. Initial mount failsafe armed in useEffect
  assert.match(source, /failSafeTimer\.current\s*=\s*setTimeout\(\(\)\s*=>\s*\{[\s\S]*?finishTransition\(\)[\s\S]*?INITIAL_MOUNT_FAILSAFE_MS\)/, 'Initial mount failsafe armed')
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
