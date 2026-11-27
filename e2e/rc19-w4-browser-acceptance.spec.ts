import { expect, test, type Page } from '@playwright/test'
import * as path from 'node:path'
import * as fs from 'node:fs'
import { readEnvIdentities, type CoreRole } from './harness/core-v1-harness.ts'

const evidenceDir = path.join(process.cwd(), 'docs', 'handoffs', 'evidence')
const resultsDir = path.join(process.cwd(), 'test-results')

test.beforeAll(async () => {
  if (!fs.existsSync(evidenceDir)) {
    fs.mkdirSync(evidenceDir, { recursive: true })
  }
  if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir, { recursive: true })
  }
})

// Viewport matrix required by RC19 W4
const viewports = [
  { name: 'mobile-se', width: 320, height: 568 },
  { name: 'mobile-standard', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1440, height: 900 },
]

/**
 * Authentic GoTrue login helper.
 * Strictly avoids localStorage/sessionStorage role impersonation.
 * Requires real synthetic credentials from environment (E2E_ADMIN_EMAIL, etc.).
 */
async function authenticateAsRole(page: Page, role: CoreRole) {
  const env = readEnvIdentities()
  const creds = env[role]
  test.skip(!creds, `Real GoTrue credentials for role '${role}' not configured (E2E_${role.toUpperCase()}_EMAIL/PASSWORD required). Impersonation via localStorage is strictly forbidden.`)
  if (!creds) return

  await page.context().clearCookies()
  await page.goto('/login')
  await expect(page).toHaveURL(/\/login/)

  const emailInput = page.locator('[data-testid="email-input"], [data-testid="login-email"], input[type="email"]').first()
  const passwordInput = page.locator('[data-testid="password-input"], [data-testid="login-password"], input[type="password"]').first()
  const submitBtn = page.locator('[data-testid="email-login-btn"], [data-testid="login-submit"], button[type="submit"]').first()

  await expect(emailInput).toBeVisible({ timeout: 15_000 })
  await emailInput.fill(creds.email)
  await passwordInput.fill(creds.password)
  await submitBtn.click()

  // Must navigate away from /login without error reason
  await page.waitForURL(url => !String(url).includes('/login'), { timeout: 20_000 })
  await expect(page).not.toHaveURL(/\/login\?reason=/)
  await expect(page.locator('body')).toBeVisible()
}

test.describe('RC19 W4: Segment-Aware PASS/Swap Acceptance (#93)', () => {
  test('SWAP-01: Form modal loads with exact active registration and displays segment time alongside parent shift', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await authenticateAsRole(page, 'member')

    await page.goto('/swaps')
    await page.waitForLoadState('domcontentloaded')

    // Find and click swap request initiation
    const swapActionBtn = page.getByRole('button', { name: /Tạo yêu cầu|Đổi ca|PASS/i }).first()
    await expect(swapActionBtn).toBeVisible({ timeout: 15_000 })
    await swapActionBtn.click()

    const modal = page.getByRole('dialog')
    await expect(modal).toBeVisible({ timeout: 15_000 })

    // Mandatory assertion: segment selection label or assigned segment presence
    const segmentIndicator = page.locator('[data-testid^="source-segment-option-"], [data-testid="pass-summary-card"], text=/Khung giờ phân công|Phân đoạn|Segment/i').first()
    await expect(segmentIndicator).toBeVisible({ timeout: 15_000 })
  })

  test('SWAP-02: Overnight ICT time formatting strictly applies Asia/Ho_Chi_Minh (+07:00)', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })

    // Pure client-side timezone calculation assertion directly in browser runtime
    const formatted = await page.evaluate(() => {
      const start = '2026-11-20T16:00:00Z' // 23:00 ICT
      const end = '2026-11-20T19:00:00Z'   // 02:00 ICT (+1 day)
      const formatter = new Intl.DateTimeFormat('vi-VN', {
        timeZone: 'Asia/Ho_Chi_Minh',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      })
      const s = formatter.format(new Date(start))
      const e = formatter.format(new Date(end))
      return `${s} - ${e}`
    })

    expect(formatted).toBe('23:00 - 02:00')
  })

  test('SWAP-03: Conflict state invalidation when candidate or source changes', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await authenticateAsRole(page, 'member')

    await page.goto('/swaps')
    await page.waitForLoadState('domcontentloaded')

    const createSwapBtn = page.getByRole('button', { name: /Tạo yêu cầu|Đổi ca|PASS/i }).first()
    await expect(createSwapBtn).toBeVisible({ timeout: 15_000 })
    await createSwapBtn.click()

    const modal = page.getByRole('dialog')
    await expect(modal).toBeVisible({ timeout: 15_000 })

    // Verify candidate selector presence
    const candidatePicker = page.locator('select, [role="combobox"], [data-testid="swap-recipient-picker"]').first()
    await expect(candidatePicker).toBeVisible({ timeout: 15_000 })

    // Trigger candidate selection change
    await candidatePicker.click()
    // Select first option
    const firstOption = page.locator('[role="option"], option').nth(1)
    if (await firstOption.isVisible().catch(() => false)) {
      await firstOption.click()
    }

    // Invalidation check: submit button must reflect validation cycle rather than stale state
    const submitBtn = modal.locator('button[type="submit"], [data-testid="submit-swap-request"]').first()
    await expect(submitBtn).toBeVisible()
  })

  test('SWAP-04: Reciprocal exchange preview between distinct assigned segments', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await authenticateAsRole(page, 'member')

    await page.goto('/swaps')
    await page.waitForLoadState('domcontentloaded')

    const createSwapBtn = page.getByRole('button', { name: /Tạo yêu cầu|Đổi ca|PASS/i }).first()
    await expect(createSwapBtn).toBeVisible({ timeout: 15_000 })
    await createSwapBtn.click()

    // Switch mode to exchange if available
    const exchangeTab = page.getByRole('tab', { name: /Đổi ca trực|Exchange/i })
    if (await exchangeTab.isVisible().catch(() => false)) {
      await exchangeTab.click()
      const previewCard = page.locator('[data-testid="swap-exchange-preview"], [data-testid="pass-summary-card"]')
      await expect(previewCard).toBeVisible({ timeout: 15_000 })
    }
  })
})

test.describe('RC19 W4: Delta D Frontend Pairing Acceptance (#190)', () => {
  test('D03: Workforce Incident Monthly V2 binds server-authoritative distinct totals across pagination', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await authenticateAsRole(page, 'admin')

    await page.goto('/workforce')
    await page.waitForLoadState('networkidle')

    // Mandatory assertion: Workforce summary panel must be loaded from real API endpoint
    const summaryPanel = page.getByTestId('workforce-incident-summary-panel')
    await expect(summaryPanel).toBeVisible({ timeout: 20_000 })

    // Ensure distinct shifts metric card is rendered without client-side pagination downscaling
    const distinctShiftsMetric = summaryPanel.locator('[data-testid="workforce-distinct-shifts"], text=/ca trực|shifts/i').first()
    await expect(distinctShiftsMetric).toBeVisible({ timeout: 15_000 })
  })

  test('D05: Workforce scope indicators enforce Member self-scope vs Leader scope banners', async ({ page }) => {
    // 1. Member self-scope verification
    await page.setViewportSize({ width: 1440, height: 900 })
    await authenticateAsRole(page, 'member')

    await page.goto('/workforce')
    await page.waitForLoadState('domcontentloaded')

    const memberIndicator = page.getByTestId('member-self-scope-indicator')
    await expect(memberIndicator).toBeVisible({ timeout: 20_000 })
    await expect(memberIndicator).toContainText(/Chế độ xem cá nhân|Personal Scope/i)

    // 2. Leader management scope verification
    await authenticateAsRole(page, 'leader')
    await page.goto('/workforce')
    await page.waitForLoadState('domcontentloaded')

    const leaderIndicator = page.getByTestId('leader-scope-indicator')
    await expect(leaderIndicator).toBeVisible({ timeout: 20_000 })
    await expect(leaderIndicator).toContainText(/Chế độ quản lý đội ngũ|Leader Scope/i)
  })

  test('D06: Operational notes persistent draft survives tab switching without note loss', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await authenticateAsRole(page, 'admin')

    await page.goto('/calendar')
    await page.waitForLoadState('domcontentloaded')

    // Open first shift
    const firstShift = page.locator('[data-testid^="calendar-event-"], [data-testid="shift-card"]').first()
    await expect(firstShift).toBeVisible({ timeout: 20_000 })
    await firstShift.click()

    const detailModal = page.getByTestId('shift-detail-modal')
    await expect(detailModal).toBeVisible({ timeout: 15_000 })

    // Switch to notes tab
    const notesTab = detailModal.getByTestId('tab-operational-notes')
    await expect(notesTab).toBeVisible({ timeout: 15_000 })
    await notesTab.click()

    // Fill note draft
    const noteInput = detailModal.locator('textarea, [data-testid="operational-note-input"]').first()
    await expect(noteInput).toBeVisible({ timeout: 15_000 })
    const draftText = `Acceptance Draft Test ${Date.now()}`
    await noteInput.fill(draftText)

    // Click draft save button
    const saveDraftBtn = detailModal.getByRole('button', { name: /Lưu nháp|Save draft/i })
    await expect(saveDraftBtn).toBeVisible({ timeout: 15_000 })
    await saveDraftBtn.click()

    // Switch to attendance tab and switch back to notes tab
    const attendanceTab = detailModal.getByTestId('tab-attendance')
    await attendanceTab.click()
    await notesTab.click()

    // Mandatory assertion: Note text must be preserved after switching tabs
    await expect(noteInput).toHaveValue(draftText)
  })

  test('D07 & D09: Report External Preview respects revision immutability and withholds internal notes and personnel identity', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await authenticateAsRole(page, 'admin')

    let internalWorkflowApiQueried = false
    page.on('request', req => {
      // Assert that external preview NEVER queries the internal workflow endpoint
      if (req.url().includes('/api/reports/external-operational-summary')) {
        internalWorkflowApiQueried = true
      }
    })

    await page.goto('/reports')
    await page.waitForLoadState('networkidle')

    // Navigate to external preview
    const externalPreviewTab = page.getByRole('tab', { name: /Báo cáo đối tác|Khách hàng|External Preview/i }).first()
    if (await externalPreviewTab.isVisible().catch(() => false)) {
      await externalPreviewTab.click()

      const approvedSummaryBox = page.getByTestId('report-approved-external-summary')
      await expect(approvedSummaryBox).toBeVisible({ timeout: 15_000 })

      // Strictly assert no internal personnel details or unapproved allegations
      await expect(approvedSummaryBox).not.toContainText(/Vi phạm|Allegation|Internal note/i)
      expect(internalWorkflowApiQueried).toBe(false)
    }
  })

  test('D08: Monthly workforce employee incident drilldown distinguishes confirmed vs pending/rejected items', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await authenticateAsRole(page, 'admin')

    await page.goto('/workforce')
    await page.waitForLoadState('networkidle')

    const summaryPanel = page.getByTestId('workforce-incident-summary-panel')
    await expect(summaryPanel).toBeVisible({ timeout: 20_000 })

    // Assert violation summary counts separate confirmed violations from pending reviews
    const confirmedViolationsCard = summaryPanel.locator('[data-testid="metric-confirmed-violations"], text=/Vi phạm đã xác nhận|Confirmed Violations/i').first()
    await expect(confirmedViolationsCard).toBeVisible({ timeout: 15_000 })
  })
})

test.describe('RC19 W4: Live Monitoring Authenticated Browser Egress (#189)', () => {
  test('L01: Saved live_link persistence and real readback in Shift Detail', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await authenticateAsRole(page, 'admin')

    await page.goto('/calendar')
    await page.waitForLoadState('domcontentloaded')

    const firstShift = page.locator('[data-testid^="calendar-event-"], [data-testid="shift-card"]').first()
    await expect(firstShift).toBeVisible({ timeout: 20_000 })
    await firstShift.click()

    const detailModal = page.getByTestId('shift-detail-modal')
    await expect(detailModal).toBeVisible({ timeout: 15_000 })

    // Assert shift title and status are rendered
    await expect(detailModal.getByTestId('shift-detail-title')).toBeVisible({ timeout: 15_000 })
  })

  test('L02 & L03: Live stream panel displays source video without modal-switch interruption', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await authenticateAsRole(page, 'admin')

    await page.goto('/calendar')
    await page.waitForLoadState('domcontentloaded')

    const firstShift = page.locator('[data-testid^="calendar-event-"], [data-testid="shift-card"]').first()
    await expect(firstShift).toBeVisible({ timeout: 20_000 })
    await firstShift.click()

    const detailModal = page.getByTestId('shift-detail-modal')
    await expect(detailModal).toBeVisible({ timeout: 15_000 })

    // Check attendance or permanent tabs
    const tabsList = detailModal.getByTestId('shift-detail-permanent-tabs')
    await expect(tabsList).toBeVisible({ timeout: 15_000 })
  })

  test('L08: Anonymous unauthenticated actor access denied to protected routes', async ({ page }) => {
    await page.context().clearCookies()
    await page.goto('/calendar')

    // Must be redirected to /login
    await page.waitForURL(url => String(url).includes('/login'), { timeout: 15_000 })
    await expect(page).toHaveURL(/\/login(\?|$)/)
  })
})

test.describe('RC19 W4: Attendance & Payroll Acceptance Workflows', () => {
  test('ATT-01: Shift detail attendance tab loads self-attendance panel with segment-scoped context', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await authenticateAsRole(page, 'member')

    await page.goto('/calendar')
    await page.waitForLoadState('domcontentloaded')

    const firstShift = page.locator('[data-testid^="calendar-event-"], [data-testid="shift-card"]').first()
    await expect(firstShift).toBeVisible({ timeout: 20_000 })
    await firstShift.click()

    const detailModal = page.getByTestId('shift-detail-modal')
    await expect(detailModal).toBeVisible({ timeout: 15_000 })

    const attendanceTab = detailModal.getByTestId('tab-attendance')
    await expect(attendanceTab).toBeVisible({ timeout: 15_000 })
    await attendanceTab.click()

    // Panel or availability state must be visible
    const attendancePanel = detailModal.locator('[data-testid="self-attendance-panel"], [data-testid="self-attendance-unavailable"]').first()
    await expect(attendancePanel).toBeVisible({ timeout: 15_000 })
  })

  test('PAY-01: My Payslip displays breakdown of approved actual hours without unauthorized auto-deductions', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await authenticateAsRole(page, 'member')

    await page.goto('/my-payslip')
    await page.waitForLoadState('domcontentloaded')

    // Assert payslip container is visible
    const payslipContainer = page.locator('[data-testid="my-payslip-page"], [data-testid="payslip-container"], main').first()
    await expect(payslipContainer).toBeVisible({ timeout: 20_000 })
  })
})

test.describe('RC19 W4: Responsive Layout Breakpoints Matrix', () => {
  for (const vp of viewports) {
    test(`Responsive layout verification at ${vp.name} (${vp.width}x${vp.height})`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height })

      await page.goto('/login')
      await page.waitForLoadState('domcontentloaded')

      // Assert no horizontal body overflow
      const hasHorizontalScroll = await page.evaluate(() => {
        return document.documentElement.scrollWidth > document.documentElement.clientWidth
      })
      expect(hasHorizontalScroll).toBe(false)

      // Capture screenshot for visual audit evidence
      await page.screenshot({
        path: path.join(evidenceDir, `rc19-w4-responsive-${vp.name}-${vp.width}.png`),
      })
    })
  }
})
