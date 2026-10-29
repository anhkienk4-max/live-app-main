import { expect, test, type Page, type TestInfo } from '@playwright/test'

type BrowserDiagnostics = {
  consoleErrors: string[]
  pageErrors: string[]
  failedRequests: Array<{ path: string; error: string }>
  capabilityResponses: Array<{ status: number; path: string }>
  apiResponses: Array<{ method: string; path: string; status: number }>
}

const safeText = (value: string) => value
  .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
  .replace(/(access_token|refresh_token|token)=([^&\s]+)/gi, '$1=[redacted]')
  .slice(0, 500)

function installBrowserDiagnostics(page: Page): BrowserDiagnostics {
  const diagnostics: BrowserDiagnostics = {
    consoleErrors: [],
    pageErrors: [],
    failedRequests: [],
    capabilityResponses: [],
    apiResponses: [],
  }
  page.on('console', message => {
    if (message.type() === 'error') diagnostics.consoleErrors.push(safeText(message.text()))
  })
  page.on('pageerror', error => diagnostics.pageErrors.push(safeText(error.message)))
  page.on('requestfailed', request => {
    diagnostics.failedRequests.push({
      path: new URL(request.url()).pathname,
      error: safeText(request.failure()?.errorText || 'unknown request failure'),
    })
  })
  page.on('response', response => {
    const url = new URL(response.url())
    const path = url.pathname
    if (path === '/api/audit/team-capability') {
      diagnostics.capabilityResponses.push({ path, status: response.status() })
    }
    if (path.startsWith('/api/') || path.startsWith('/rest/v1/')) {
      diagnostics.apiResponses.push({
        method: response.request().method(),
        path,
        status: response.status(),
      })
    }
  })
  return diagnostics
}

async function waitForMockAuditRow(page: Page, testInfo: TestInfo, diagnostics: BrowserDiagnostics) {
  try {
    await expect(page.getByText('Mock audit record', { exact: false }).first()).toBeVisible({ timeout: 30000 })
  } catch (error) {
    const pageState = await page.evaluate(() => ({
      path: location.pathname,
      title: document.title,
      auditActorId: localStorage.getItem('livestream-ops-current-user'),
      mockAuditHistoryPresent: Boolean(sessionStorage.getItem('livestream-ops-audit-history')),
      mockAuditFixtureCount: (() => {
        try {
          const fixture = sessionStorage.getItem('livestream-ops-audit-history')
          return fixture ? JSON.parse(fixture).length : 0
        } catch {
          return -1
        }
      })(),
      mainText: document.querySelector('main')?.textContent?.slice(0, 3000) || '',
    }))
    const payload = {
      viewport: await page.evaluate(() => ({ width: innerWidth, height: innerHeight })),
      pageState,
      diagnostics,
      assertion: error instanceof Error ? safeText(error.message) : 'audit row visibility assertion failed',
    }
    console.error(`RBAC01B_INITIAL_AUDIT_DIAGNOSTIC ${JSON.stringify(payload)}`)
    await testInfo.attach('rbac01b-initial-audit-diagnostic.json', {
      body: JSON.stringify(payload, null, 2),
      contentType: 'application/json',
    })
    await testInfo.attach('rbac01b-initial-audit-diagnostic.png', {
      body: await page.screenshot(),
      contentType: 'image/png',
    })
    throw error
  }
}

async function openLeaderAudit(page: Page) {
  const diagnostics = installBrowserDiagnostics(page);
  await page.addInitScript(() => {
    localStorage.setItem('livestream-ops-current-user', '2')
    localStorage.setItem('livestream-ops-language', 'vi')
    sessionStorage.setItem('livestream-ops-audit-history', JSON.stringify([{
      id: 'rbac01b-test-audit-record',
      timestamp: '2026-10-29T00:00:00.000Z',
      actor_id: '1',
      actor_name: 'Admin User',
      actor_role: 'admin',
      module: 'calendar',
      action: 'update',
      entity_type: 'shift',
      entity_id: 'rbac01b-test-shift',
      entity_name: 'Mock audit record RBAC01B fixture',
      source: 'system',
      status: 'success',
      correlation_id: 'rbac01b-test-request',
      entity_exists: true,
      review_status: 'unreviewed',
    }]))
  })
  await page.goto('/audit', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('main').first()).toBeVisible({ timeout: 30000 })
  return diagnostics
}

test('RBAC01B 390px: already-loaded audit rows/details vanish on 403 and stay hidden on browser return', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 })
  let allowed = true
  let requests = 0
  await page.route('**/api/audit/team-capability', async route => {
    requests++
    await route.fulfill({ status: allowed ? 200 : 403, contentType: 'application/json',
      headers: { 'cache-control': 'no-store' }, body: JSON.stringify(allowed ? { allowed: true, ok: true } : { ok: false }) })
  })
  const diagnostics = await openLeaderAudit(page)
  await waitForMockAuditRow(page, testInfo, diagnostics)
  const row = page.locator('tbody tr').first()
  if (await row.count()) await row.click()
  allowed = false
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await expect(page.getByText('Mock audit record', { exact: false })).toHaveCount(0)
  await expect(page.getByRole('alert').or(page.getByText(/không có quyền|Access denied|từ chối/i)).first()).toBeVisible()
  await page.evaluate(() => {
    document.dispatchEvent(new Event('visibilitychange'))
    window.dispatchEvent(new PageTransitionEvent('pageshow'))
  })
  await expect(page.getByText('Mock audit record', { exact: false })).toHaveCount(0)
  expect(requests).toBeGreaterThanOrEqual(2)
})
test('RBAC01B 768px: 500 network error fails closed, retry restores only after new 200', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 768, height: 900 })
  let code = 200
  await page.route('**/api/audit/team-capability', async route => {
    await route.fulfill({ status: code, contentType: 'application/json',
      body: code === 200 ? JSON.stringify({ok:true,allowed:true}) : JSON.stringify({ok:false}) })
  })
  const diagnostics = await openLeaderAudit(page)
  await waitForMockAuditRow(page, testInfo, diagnostics)
  code = 500
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await expect(page.getByText('Mock audit record', { exact: false })).toHaveCount(0)
  await expect(page.getByRole('alert').filter({hasText:'AUDIT_TEAM_CAPABILITY_UNAVAILABLE'}).first()).toBeVisible()
  code = 200
  await page.getByRole('button', {name:/Try again|Thử lại/i}).first().click()
  await expect(page.getByText('Mock audit record', { exact: false }).first()).toBeVisible({timeout:30000})
})
test('RBAC01B 1440px: stale capability ALLOW cannot override later denied request', async ({ page }, testInfo) => {
  await page.setViewportSize({width:1440,height:900})
  let phase: 'initial'|'slow'|'denied' = 'initial'
  let slowRequest = 0
  await page.route('**/api/audit/team-capability', async route => {
    const state = phase
    if (state === 'slow') {
      slowRequest++
      await new Promise(resolve => setTimeout(resolve, 600))
      await route.fulfill({status:200, contentType:'application/json', body:JSON.stringify({ok:true,allowed:true})})
    } else await route.fulfill({status:state==='denied'?403:200,contentType:'application/json',
      body:JSON.stringify(state==='denied'?{ok:false}:{ok:true,allowed:true})})
  })
  const diagnostics = await openLeaderAudit(page)
  await waitForMockAuditRow(page, testInfo, diagnostics)
  phase='slow'
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await expect.poll(()=>slowRequest).toBe(1)
  phase='denied'
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await expect(page.getByText('Mock audit record', {exact:false})).toHaveCount(0)
  await expect(page.getByRole('alert').or(page.getByText(/không có quyền|Access denied|từ chối/i)).first()).toBeVisible()
  await page.waitForTimeout(800)
  await expect(page.getByText('Mock audit record', {exact:false})).toHaveCount(0)
})

test('RBAC01B user/role switch: previous Leader audit rows/details do not survive Member identity', async ({ page }, testInfo) => {
  await page.setViewportSize({width: 390, height: 844})
  await page.route('**/api/audit/team-capability', async route => {
    await route.fulfill({status:200, contentType:'application/json',body:JSON.stringify({ok:true,allowed:true})})
  })
  const diagnostics = await openLeaderAudit(page)
  await waitForMockAuditRow(page, testInfo, diagnostics)
  await page.locator('tbody tr').first().click()
  await page.evaluate(() => {
    localStorage.setItem('livestream-ops-current-user','3')
    window.dispatchEvent(new Event('livestream-ops-current-user-change'))
  })
  await expect(page.getByText('Mock audit record', {exact:false})).toHaveCount(0)
  await expect(page.getByText(/không có quyền|Access denied|từ chối/i).first()).toBeVisible({timeout:30000})
  await page.evaluate(() => {
    localStorage.setItem('livestream-ops-current-user','2')
    window.dispatchEvent(new Event('livestream-ops-current-user-change'))
  })
  await waitForMockAuditRow(page, testInfo, diagnostics)
})
