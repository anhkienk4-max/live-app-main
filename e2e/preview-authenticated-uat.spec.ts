import { expect, test, type Page } from '@playwright/test'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const roles = ['admin', 'leader', 'member'] as const
const manualLoginTimeoutMs = 90_000
const outputDir = resolve(process.cwd(), 'test-results/preview-auth-uat')
const previewOrigin = new URL(process.env.PREVIEW_UAT_BASE_URL!).origin
const safeAuthCodes = new Set([
  'invalid_credentials', 'email_not_confirmed', 'email_provider_disabled',
  'provider_disabled', 'over_request_rate_limit', 'user_banned',
])

type Role = typeof roles[number]
type Status = 'PASS' | 'FAIL' | 'BLOCKED'
type UatRow = { role: Role; status: Status; reason?: string; errorCode?: string; screenshot?: string }
type EventRow = { kind: string; route: string; status?: number; code?: string; detail?: string }

function safeText(value: string) {
  return value
    .replace(/https?:\/\/[^\s)]+/g, raw => { try { const url = new URL(raw); return `${url.origin}${url.pathname}` } catch { return '[url]' } })
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[email]')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g, '[token]')
    .replace(/(access_token|refresh_token|code|token)=([^&\s]+)/gi, '$1=[redacted]')
    .slice(0, 240)
}

function safeLocation(page: Page) {
  try {
    const url = new URL(page.url())
    const reason = url.searchParams.get('reason')
    return { origin: url.origin, pathname: url.pathname, reason: reason && /^[a-z_]{1,48}$/.test(reason) ? reason : undefined }
  } catch {
    return { origin: previewOrigin, pathname: '[unavailable]' }
  }
}

async function saveLoginEvidence(page: Page, role: Role, suffix: string) {
  const filename = `${role}-${suffix}.png`
  const path = resolve(outputDir, filename)
  try {
    if (page.isClosed()) return undefined
    await page.screenshot({
      path,
      fullPage: false,
      animations: 'disabled',
      mask: [
        page.locator('[data-testid="email-input"]'),
        page.locator('[data-testid="password-input"]'),
        page.locator('[data-testid="user-menu-btn"]'),
        page.locator('[data-testid="production-sidebar-profile"]'),
      ],
      maskColor: '#333',
    })
    return filename
  } catch {
    return undefined
  }
}

// The existing login-only checks are insufficient to sign off Reports #77.
// This workflow exercises the real authenticated API, not the mocked CI fixtures.
// Deliberately avoid saving report rows, response bodies, tokens, or screenshots of business data.
async function verifyReportsReadOnly(page: Page, role: Role, trace: Array<{ at: string; action: string; role?: Role; detail?: string }>) {
  await page.goto('/reports', { waitUntil: 'domcontentloaded' })
  if (new URL(page.url()).pathname !== '/reports') throw new Error('REPORTS_AUTHENTICATED_ROUTE_REDIRECTED')
  const toolbar = page.getByTestId('command-toolbar')
  await expect(toolbar).toBeVisible({ timeout: 60_000 })
  await expect(page.getByTestId('reports-progressive-shell')).toHaveCount(0)
  trace.push({ at: new Date().toISOString(), action: 'reports_authenticated_loaded', role })

  const searchNeedle = '__RC19_AUTH_UAT_NO_MATCH_20261023__'
  const search = toolbar.locator('input').first()
  await search.fill(searchNeedle)
  const applyButton = page.getByTestId('reports-apply-filters')
  await expect(applyButton).toBeEnabled()
  const matchingResponse = page.waitForResponse(response => {
    try {
      const url = new URL(response.url())
      if (url.pathname !== '/api/operations/collection' || url.searchParams.get('entity') !== 'reports') return false
      const filters = JSON.parse(url.searchParams.get('filters') || '{}')
      return filters.search === searchNeedle
    } catch {
      return false
    }
  }, { timeout: 30_000 })
  await applyButton.click()
  const apiResponse = await matchingResponse
  if (!apiResponse.ok()) throw new Error('REPORTS_FILTERED_API_HTTP_' + apiResponse.status())
  const responseData = await apiResponse.json() as { items?: unknown; total?: unknown; ownerKey?: unknown }
  if (!Array.isArray(responseData.items) || responseData.items.length !== 0 || responseData.total !== 0 || typeof responseData.ownerKey !== 'string') {
    throw new Error('REPORTS_FILTERED_API_SCOPE_OR_ENVELOPE_INVALID')
  }
  const chips = page.getByTestId('reports-applied-filter-chips')
  await expect(chips).toBeVisible({ timeout: 30_000 })
  await expect(chips).toContainText('Tìm kiếm')
  await chips.getByRole('button', { name: /Bỏ lọc/ }).first().click()
  await expect(chips).toHaveCount(0)
  await expect(toolbar).toBeVisible()
  trace.push({ at: new Date().toISOString(), action: 'reports_authenticated_filter_api_and_chips_pass', role })

  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await expect(toolbar).toBeVisible()
    const overflows = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)
    if (overflows) throw new Error('REPORTS_HORIZONTAL_OVERFLOW_' + width)
  }
  trace.push({ at: new Date().toISOString(), action: 'reports_authenticated_responsive_pass', role })
  await page.setViewportSize({ width: 1440, height: 1024 })
}

test('manual authenticated Preview UAT for Admin, Leader, and Member', async ({ page }, testInfo) => {
  test.setTimeout(8 * 60_000)
  await mkdir(outputDir, { recursive: true })

  const results: UatRow[] = []
  const events: EventRow[] = []
  const trace: Array<{ at: string; action: string; role?: Role; detail?: string }> = []
  let blockedWrites = 0

  await page.addInitScript(() => {
    const browserWindow = window as Window & { __previewAuthSubmitCount?: number }
    browserWindow.__previewAuthSubmitCount = browserWindow.__previewAuthSubmitCount ?? 0
    document.addEventListener('submit', () => { browserWindow.__previewAuthSubmitCount! += 1 }, true)
  })

  page.on('console', message => {
    if (message.type() === 'error') events.push({ kind: 'console_error', route: safeLocation(page).pathname, detail: safeText(message.text()) })
  })
  page.on('pageerror', error => events.push({ kind: 'page_error', route: safeLocation(page).pathname, detail: safeText(error.message) }))
  page.on('requestfailed', request => {
    let route = '[external]'
    try { route = new URL(request.url()).pathname } catch { /* Do not retain external URLs. */ }
    events.push({ kind: 'request_failed', route, detail: `${request.method()} ${safeText(request.failure()?.errorText ?? 'network failure')}` })
  })
  page.on('response', response => {
    const url = new URL(response.url())
    if (!url.pathname.startsWith('/auth/v1/')) return
    void response.json().then(body => {
      const rawCode = body && typeof body === 'object' ? (body as Record<string, unknown>).code : undefined
      const code = typeof rawCode === 'string' && safeAuthCodes.has(rawCode) ? rawCode : undefined
      events.push({ kind: 'auth_response', route: url.pathname, status: response.status(), code })
    }).catch(() => events.push({ kind: 'auth_response', route: url.pathname, status: response.status() }))
  })

  await page.route('**/*', async route => {
    const request = route.request()
    const url = new URL(request.url())
    const method = request.method().toUpperCase()
    const authHost = url.hostname.endsWith('.supabase.co')
    const grantType = url.searchParams.get('grant_type')
    const authPath = authHost && (
      (url.pathname === '/auth/v1/token' && (grantType === 'password' || grantType === 'refresh_token'))
      || url.pathname === '/auth/v1/logout'
    )
    if (['GET', 'HEAD', 'OPTIONS'].includes(method) || authPath) {
      await route.continue()
      return
    }
    blockedWrites += 1
    events.push({ kind: 'blocked_write', route: url.pathname, detail: `${method} blocked by read-only UAT guard` })
    await route.abort('blockedbyclient')
  })

  try {
    for (const role of roles) {
      if (page.isClosed()) {
        results.push({ role, status: 'BLOCKED', reason: 'Browser page closed before manual sign-in.' })
        continue
      }

      await page.setViewportSize({ width: 1440, height: 1024 })
      await page.goto('/login', { waitUntil: 'domcontentloaded' })
      let attempts = await page.evaluate(() => (window as Window & { __previewAuthSubmitCount?: number }).__previewAuthSubmitCount ?? 0)
      const deadline = Date.now() + manualLoginTimeoutMs
      let lastErrorCode: string | undefined
      let authenticated = false
      let identityRejected = false
      console.log(`PREVIEW UAT: sign in as the authorized ${role.toUpperCase()} Staging account with Email/Password. Do not use Production credentials. Manual wait limit: 90 seconds.`)
      trace.push({ at: new Date().toISOString(), action: 'manual_login_started', role })

      while (Date.now() < deadline && !page.isClosed()) {
        const remaining = deadline - Date.now()
        try {
          await page.waitForFunction(({ previousAttempts, expectedOrigin }) => {
            const browserWindow = window as Window & { __previewAuthSubmitCount?: number }
            return location.origin !== expectedOrigin || location.pathname !== '/login' || (browserWindow.__previewAuthSubmitCount ?? 0) > previousAttempts
          }, { previousAttempts: attempts, expectedOrigin: previewOrigin }, { timeout: Math.min(20_000, remaining) })
        } catch {
          continue
        }

        if (page.isClosed()) break
        const currentURL = new URL(page.url())
        if (currentURL.origin !== previewOrigin) {
          results.push({ role, status: 'BLOCKED', reason: 'Authentication left the Preview origin; this workflow only permits Email/Password on the configured Preview.' })
          await page.goto('/login', { waitUntil: 'domcontentloaded' })
          continue
        }
        const path = currentURL.pathname
        if (path !== '/login') {
          authenticated = true
          break
        }
        if (currentURL.searchParams.get('reason') === 'identity_unavailable') {
          results.push({ role, status: 'FAIL', reason: 'Auth succeeded but the business identity guard rejected the account mapping, active status, or system permission.' })
          trace.push({ at: new Date().toISOString(), action: 'identity_guard_rejected', role })
          identityRejected = true
          break
        }

        attempts = await page.evaluate(() => (window as Window & { __previewAuthSubmitCount?: number }).__previewAuthSubmitCount ?? 0)
        const error = page.getByTestId('login-error')
        await error.waitFor({ state: 'visible', timeout: Math.min(15_000, Math.max(1_000, deadline - Date.now())) }).catch(() => undefined)
        if (await error.isVisible().catch(() => false)) {
          const errorText = safeText((await error.innerText().catch(() => '')).trim())
          const screenshot = await saveLoginEvidence(page, role, `attempt-${attempts}`)
          const authEvent = [...events].reverse().find(item => item.kind === 'auth_response' && item.code)
          lastErrorCode = authEvent?.code
          trace.push({ at: new Date().toISOString(), action: 'login_error_shown', role, detail: errorText })
          events.push({ kind: 'login_error', route: '/login', detail: errorText })
          trace.push({ at: new Date().toISOString(), action: 'login_error_screenshot', role, detail: screenshot ?? 'screenshot unavailable' })
          console.log(`PREVIEW UAT: ${role.toUpperCase()} login attempt did not establish a session; the error is recorded in the redacted report. You may correct the form and retry before timeout.`)
        }
      }

      if (page.isClosed()) {
        results.push({ role, status: 'BLOCKED', reason: 'Browser page/context closed during the bounded manual login window.', errorCode: lastErrorCode })
        trace.push({ at: new Date().toISOString(), action: 'browser_closed', role })
        continue
      }
      if (identityRejected) continue
      if (!authenticated) {
        const error = page.getByTestId('login-error')
        const errorText = await error.innerText().catch(() => '')
        const reason = errorText ? safeText(errorText) : 'No authorized role session was established within 90 seconds.'
        const screenshot = await saveLoginEvidence(page, role, 'timeout')
        results.push({ role, status: 'BLOCKED', reason, errorCode: lastErrorCode, screenshot })
        trace.push({ at: new Date().toISOString(), action: 'manual_login_timeout', role, detail: reason })
        continue
      }

      const roleText = await page.locator('[data-testid="production-sidebar-profile"] > div > div:nth-child(2)').innerText().catch(() => '')
      if (roleText.trim().toLowerCase() !== role) {
        results.push({ role, status: 'FAIL', reason: `Authenticated profile role did not match requested ${role}.` })
        trace.push({ at: new Date().toISOString(), action: 'role_mismatch', role })
      } else {
        trace.push({ at: new Date().toISOString(), action: 'role_verified', role })
        try {
          await verifyReportsReadOnly(page, role, trace)
          results.push({ role, status: 'PASS' })
        } catch (error) {
          results.push({ role, status: 'FAIL', reason: 'Reports authenticated UAT: ' + safeText(error instanceof Error ? error.message : String(error)) })
          trace.push({ at: new Date().toISOString(), action: 'reports_authenticated_failed', role })
        }
        await page.setViewportSize({ width: 1440, height: 1024 })
      }

      const menu = page.getByTestId('user-menu-btn')
      await menu.click()
      await page.getByTestId('signout-btn').click()
      await expect(page).toHaveURL(/\/login(?:\?|$)/, { timeout: 15_000 })
      trace.push({ at: new Date().toISOString(), action: 'local_session_signed_out', role })
    }
  } catch (error) {
    const message = safeText(error instanceof Error ? error.message : String(error))
    trace.push({ at: new Date().toISOString(), action: 'workflow_error', detail: message })
    if (!results.length || results.at(-1)?.status !== 'FAIL') {
      results.push({ role: roles[results.length] ?? 'admin', status: 'FAIL', reason: message })
    }
  } finally {
    const passCount = results.filter(row => row.status === 'PASS').length
    const failCount = results.filter(row => row.status === 'FAIL').length
    const overall: Status = failCount ? 'FAIL' : passCount === roles.length ? 'PASS' : 'BLOCKED'
    const redactedTrace = {
      preview: safeLocation(page).origin,
      generatedAt: new Date().toISOString(),
      events: trace,
      browserEvents: events,
      blockedBusinessWrites: blockedWrites,
      credentialsPersisted: false,
      cookiesOrStorageStateWritten: false,
      rawPlaywrightTraceEnabled: false,
    }
    await writeFile(resolve(outputDir, 'redacted-trace.json'), JSON.stringify(redactedTrace, null, 2), 'utf8')
    await writeFile(resolve(outputDir, 'report.json'), JSON.stringify({ overall, results, generatedAt: new Date().toISOString() }, null, 2), 'utf8')
    testInfo.annotations.push({ type: 'authenticated-uat', description: overall })
  }

  const failed = results.find(row => row.status === 'FAIL')
  if (failed) throw new Error(`Authenticated Preview UAT failed for ${failed.role}: ${failed.reason}`)
  if (results.filter(row => row.status === 'PASS').length !== roles.length) {
    test.skip(true, 'UAT_BLOCKED: all three authorized role accounts did not complete manual Preview sign-in.')
  }
})
