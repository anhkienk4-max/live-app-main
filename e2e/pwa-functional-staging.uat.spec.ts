import { test, expect, type Page } from '@playwright/test'
import { readEnvIdentities, loginWithCredentials, type CoreRole } from './harness/core-v1-harness'

/**
 * Real 3-role read-only Staging UAT.
 * - Preview host only. No production, mock fallback, mutations, or screenshots.
 * - Missing credentials = explicit failing preflight, not a green SKIP.
 * - Feature flags/capability OFF = BLOCKED (skipped), never counted as PASS.
 * - Run the JSON evidence validator before claiming release readiness.
 */
const target = process.env.E2E_BASE_URL ?? ''
const PINNED_PREVIEW_SHA = '0e1c82cf0c60a73be6916029b457732f8960b9ee'
const PINNED_PREVIEW_HOST = 'livestream-ops-demo-2x9hddzmk-livestream2.vercel.app'
const expectedSha = process.env.PWA_UAT_EXPECTED_SHA ?? ''
const identities = readEnvIdentities()
const credentials: Record<CoreRole, { email: string; password: string } | null> = {
  admin: identities.admin,
  leader: identities.leader,
  member: identities.member,
}
const roles: CoreRole[] = ['admin', 'leader', 'member']
const viewports = [
  { width: 390, height: 844, label: 'iPhone 390' },
  { width: 412, height: 915, label: 'Android 412' },
] as const

function guardTarget() {
  let url: URL
  try { url = new URL(target) } catch { throw new Error('E2E_BASE_URL must be an explicit HTTPS ADA OPS Preview URL') }
  if (
    url.protocol !== 'https:' ||
    url.username || url.password || url.search || url.hash ||
    url.pathname !== '/' ||
    !/^livestream-ops-demo(?:-[a-z0-9-]+)?\.vercel\.app$/.test(url.hostname)
  ) throw new Error('BLOCKED: non-Preview or unsafe E2E_BASE_URL')
  if (url.hostname !== PINNED_PREVIEW_HOST || expectedSha !== PINNED_PREVIEW_SHA) throw new Error('BLOCKED: Preview host and SHA must match the independently verified UI release candidate')
  if (process.env.NEXT_PUBLIC_USE_MOCK_DATA === 'true') throw new Error('BLOCKED: mock environment is forbidden')
}
function requireIdentity(role: CoreRole) {
  const value = credentials[role]
  if (!value) throw new Error('BLOCKED: configure E2E_' + role.toUpperCase() + '_EMAIL and E2E_' + role.toUpperCase() + '_PASSWORD privately')
  return value
}
async function assertSession(page: Page) {
  await expect(page).not.toHaveURL(/\/login(?:\?|$)/)
  await expect(page.getByTestId('production-main-content')).toBeVisible({ timeout: 45000 })
}
async function assertWidth(page: Page, width: number) {
  const layout = await page.evaluate(() => ({
    viewport: window.innerWidth,
    doc: document.documentElement.scrollWidth,
  }))
  expect(layout.doc, 'document horizontal overflow').toBeLessThanOrEqual(width + 1)
}
async function openLoggedIn(page: Page, path: string) {
  await page.goto(path, { waitUntil: 'domcontentloaded' })
  await assertSession(page)
}

test.beforeEach(async ({ page }) => {
  const secret = process.env.E2E_VERCEL_PROTECTION_BYPASS
  if (!secret) return
  guardTarget()
  const expectedOrigin = new URL(target).origin
  // The secret is scoped to the first-party Preview origin, never analytics,
  // external scripts or other hosts. No trace, screenshots or auth-state files.
  await page.route('**/*', route => {
    const requestUrl = new URL(route.request().url())
    if (requestUrl.origin !== expectedOrigin) return route.continue()
    return route.continue({
      headers: { ...route.request().headers(), 'x-vercel-protection-bypass': secret },
    })
  })
})

test.describe('PWA functional Staging UAT (read-only, all three roles)', () => {
  test('00 preflight: pinned safe Preview, real identities and unauthenticated redirect', async ({ page }) => {
    guardTarget()
    for (const role of roles) requireIdentity(role)
    await page.goto('/login', { waitUntil: 'domcontentloaded' })
    await expect(page.locator('[data-testid="login-email"], input[type="email"], input[name="email"]').first()).toBeVisible({ timeout: 30000 })
    await page.goto('/calendar', { waitUntil: 'domcontentloaded' })
    await expect(page).toHaveURL(/\/login(?:\?|$)/, { timeout: 30000 })
  })

  for (const role of roles) {
    test.describe(role + ' authorization and navigation', () => {
      test.beforeEach(async ({ page }) => {
        guardTarget()
        const actor = requireIdentity(role)
        await loginWithCredentials(page, actor.email, actor.password)
        await assertSession(page)
      })

      for (const viewport of viewports) {
        test('01 ' + role + ' Dashboard role and navigation at ' + viewport.label, async ({ page }) => {
          await page.setViewportSize({ width: viewport.width, height: viewport.height })
          await openLoggedIn(page, '/')
          const mobile = page.getByTestId('ada-reference-mobile-home')
          await expect(mobile).toBeVisible({ timeout: 60000 })
          await expect(mobile).toHaveAttribute('data-role', role)
          await expect(page.getByTestId('production-bottom-nav')).toBeVisible()
          const shortcuts = page.getByTestId('ada-mobile-home-quick-links')
          await expect(shortcuts.getByRole('link')).toHaveCount(4)
          if (role === 'admin') {
            await expect(shortcuts.getByRole('link', { name: 'Bảng lương' })).toHaveAttribute('href', '/payroll')
          } else if (role === 'leader') {
            await expect(shortcuts.getByRole('link', { name: 'Duyệt đăng ký' })).toHaveAttribute('href', '/staffing?tab=registration')
            await expect(shortcuts.getByRole('link', { name: 'Bảng lương' })).toHaveCount(0)
          } else {
            await expect(shortcuts.getByRole('link', { name: 'Đăng ký ca' })).toHaveAttribute('href', '/calendar?tab=open')
            await expect(shortcuts.getByRole('link', { name: 'Bảng lương' })).toHaveCount(0)
          }
          await assertWidth(page, viewport.width)
        })
      }

      test('02 ' + role + ' Calendar open and own shifts are accessible without writing', async ({ page }) => {
        await openLoggedIn(page, '/calendar?tab=open')
        await expect(page.getByTestId('calendar-page')).toBeVisible()
        await expect(page.getByTestId('registration-open-search')).toBeVisible({ timeout: 60000 })
        await openLoggedIn(page, '/calendar?tab=mine')
        await expect(page.getByTestId('registration-mine-search')).toBeVisible({ timeout: 60000 })
      })

      test('03 ' + role + ' Staffing review gate matches role', async ({ page }) => {
        await openLoggedIn(page, '/staffing?tab=registration')
        await expect(page.getByTestId('staffing-page')).toBeVisible({ timeout: 60000 })
        if (role === 'member') {
          await expect(page.getByTestId('registration-review-workspace')).toHaveCount(0)
          await expect(page.getByTestId('registration-open-search')).toBeVisible({ timeout: 60000 })
        } else {
          await expect(page.getByTestId('registration-review-workspace')).toBeVisible({ timeout: 60000 })
        }
      })

      test('04 ' + role + ' Staff management boundary and loaded data', async ({ page }) => {
        await openLoggedIn(page, '/staff')
        await expect(page.getByTestId('staff-page')).toBeVisible({ timeout: 45000 })
        await expect(page.getByTestId('staff-initial-loading')).toHaveCount(0, { timeout: 60000 })
        await expect(page.getByTestId('staff-summary-grid')).toBeVisible()
        if (role === 'admin') {
          await expect(page.getByTestId('add-staff-btn')).toBeVisible()
        } else {
          await expect(page.getByTestId('add-staff-btn')).toHaveCount(0)
          await expect(page.locator('[data-testid^="approve-staff-"]')).toHaveCount(0)
          await expect(page.locator('[data-testid^="reject-staff-"]')).toHaveCount(0)
        }
      })

      test('05 ' + role + ' Reports data UI loads and filters without submissions', async ({ page }) => {
        await openLoggedIn(page, '/reports')
        await expect(page.getByTestId('reports-apply-filters')).toBeVisible({ timeout: 60000 })
        await expect(page.locator('#created-reports-heading')).toBeVisible()
        await expect(page.getByTestId('reports-mobile-metrics')).toBeVisible()
      })

      test('06 ' + role + ' Payroll access and capability are enforced', async ({ page }) => {
        await openLoggedIn(page, '/payroll')
        // Capability error is a FAIL, never interpreted as an intentionally disabled feature.
        const alert = page.getByRole('alert').first()
        if (role === 'admin') {
          const disabled = page.getByText(/Tính năng đang tắt|Feature.*disabled/i)
          const rates = page.getByRole('tab', { name: 'Khung lương & Đơn giá' })
          await expect.poll(async () => await disabled.isVisible() || await rates.isVisible() || await page.getByRole('alert').first().isVisible(), { timeout: 60000 }).toBe(true)
          if (await disabled.isVisible()) test.skip(true, 'BLOCKED: Staging payroll capability OFF; requires authorized feature-flag UAT')
          await expect(rates).toBeVisible()
        } else {
          const payslip = page.getByRole('heading', { name: 'Phiếu lương của tôi' })
          await expect.poll(async () =>
            await alert.isVisible() || await payslip.isVisible()
          , { timeout: 60000 }).toBe(true)
          if (await payslip.isVisible()) {
            await expect(page.getByRole('tab', { name: 'Khung lương & Đơn giá' })).toHaveCount(0)
          } else {
            await expect(alert).toContainText('403')
          }
        }
      })

      test('07 ' + role + ' Workforce own/team capability obeys role', async ({ page }) => {
        await openLoggedIn(page, '/workforce')
        const disabled = page.getByText(/Tính năng đang tắt|Feature.*disabled/i)
        const heading = page.getByRole('heading', { name: /Hiệu suất|Performance/i }).first()
        await expect.poll(async () => await disabled.isVisible() || await heading.isVisible() || await page.getByRole('alert').first().isVisible(), { timeout: 60000 }).toBe(true)
        if (await disabled.isVisible()) test.skip(true, 'BLOCKED: Staging Workforce capability OFF')
        await expect(heading).toBeVisible()
        if (role === 'member') {
          await expect(page.getByRole('tab', { name: /Xếp hạng|Ranking/i })).toHaveCount(0)
        } else {
          const ranking = page.getByRole('tab', { name: /Xếp hạng|Ranking/i })
          if (await ranking.count() === 0) {
            test.skip(true, 'BLOCKED: team_performance capability OFF for ' + role + '; individual view only')
          }
          await expect(ranking).toBeVisible()
        }
      })
    })
  }
})
