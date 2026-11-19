import { expect, test, type Page } from '@playwright/test'
import * as path from 'node:path'
import * as fs from 'node:fs'

const evidenceDir = path.join(process.cwd(), 'docs', 'handoffs', 'evidence')

test.beforeAll(async () => {
  if (!fs.existsSync(evidenceDir)) {
    fs.mkdirSync(evidenceDir, { recursive: true })
  }
})

async function setupMember(page: Page, language: 'vi' | 'en' = 'vi') {
  await page.addInitScript(value => {
    localStorage.setItem('livestream-ops-current-user', '3')
    localStorage.setItem('livestream-ops-language', value)
  }, language)
  await page.route('**/api/workforce/capabilities', route =>
    route.fulfill({
      json: {
        ok: true,
        capabilities: {
          actual_staffing: false,
          team_performance: false,
          own_performance: true,
          payroll: false,
        },
      },
    })
  )
}

async function setupAdmin(page: Page, language: 'vi' | 'en' = 'vi') {
  await page.addInitScript(value => {
    localStorage.setItem('livestream-ops-current-user', '1') // Admin user
    localStorage.setItem('livestream-ops-language', value)
  }, language)
  await page.route('**/api/rbac/capabilities', route =>
    route.fulfill({
      json: {
        ok: true,
        role: 'admin',
        capabilities: {
          'shifts.view': true,
          'shifts.create': true,
          'shifts.edit': true,
          'shifts.delete': true,
          'shifts.assign': true,
        },
      },
    })
  )
  await page.route('**/api/workforce/capabilities', route =>
    route.fulfill({
      json: {
        ok: true,
        capabilities: {
          actual_staffing: true,
          team_performance: true,
          own_performance: true,
          payroll: true,
        },
      },
    })
  )
}

async function openShift(page: Page, shiftId: string) {
  await page.goto('/calendar')
  const target = page
    .getByTestId(`calendar-event-${shiftId}`)
    .or(page.getByRole('button', { name: /TechGear morning live/i }))
    .first()
  await expect(target).toBeVisible({ timeout: 45_000 })
  await target.click()

  const detailBtn = page.getByRole('button', { name: /View Full Shift|Xem chi ti?t ca/i })
  if (await detailBtn.isVisible({ timeout: 4000 }).catch(() => false)) {
    await detailBtn.click()
  }
  await expect(page.getByTestId('shift-detail-modal')).toBeVisible({ timeout: 15_000 })
}

test.describe('RC19 G5: Attendance UI — Check-in / Check-out, Time Policy, and Admin Proxy', () => {
  test('G5 Desktop (1440x900): Two independent cards, locked check-out, time policy, and shift context', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await setupMember(page, 'vi')

    await page.route('**/rest/v1/rpc/get_my_self_attendance', route => {
      return route.fulfill({ json: [] })
    })

    await openShift(page, 's1')

    const attendanceTab = page.getByTestId('tab-attendance')
    await expect(attendanceTab).toBeVisible()
    await attendanceTab.click()

    // 1. Verify Card A (Check-in) and Card B (Check-out) exist
    const cardCheckIn = page.getByTestId('attendance-card-checkin')
    const cardCheckOut = page.getByTestId('attendance-card-checkout')
    await expect(cardCheckIn).toBeVisible()
    await expect(cardCheckOut).toBeVisible()

    // 2. Verify Card B displays locked alert because check-in is not yet recorded
    const lockedAlert = page.getByTestId('attendance-checkout-locked-alert')
    await expect(lockedAlert).toBeVisible()
    await expect(lockedAlert).toContainText('Check-out đang khóa')
    await expect(lockedAlert).toContainText('Cần hoàn tất Check-in thành công')

    // 3. Verify Live shift context & time policy section
    await expect(page.getByTestId('attendance-live-shift-context')).toBeVisible()
    await expect(page.getByTestId('attendance-staff-context')).toBeVisible()
    await expect(page.getByTestId('attendance-segment-context')).toBeVisible()
    await expect(page.getByTestId('attendance-time-policy-section')).toBeVisible()
    await expect(page.getByTestId('attendance-time-policy-disclaimer')).toBeVisible()

    // 4. Capture Desktop Evidence Screenshot
    const screenshotPath = path.join(evidenceDir, 'rc19-g5-attendance-desktop.png')
    await page.screenshot({ path: screenshotPath, fullPage: false })
    expect(fs.existsSync(screenshotPath)).toBe(true)
  })

  test('G5 Mobile (390x844): Responsive stacked cards, locked check-out alert, and time policy', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await setupMember(page, 'vi')

    await page.route('**/rest/v1/rpc/get_my_self_attendance', route => {
      return route.fulfill({ json: [] })
    })

    await openShift(page, 's1')

    // Switch to mobile viewport to verify responsive layout of modal and cards
    await page.setViewportSize({ width: 390, height: 844 })

    const attendanceTab = page.getByTestId('tab-attendance')
    await expect(attendanceTab).toBeVisible()
    await attendanceTab.click()

    // Verify both cards visible and properly formatted on mobile
    const cardCheckIn = page.getByTestId('attendance-card-checkin')
    const cardCheckOut = page.getByTestId('attendance-card-checkout')
    await expect(cardCheckIn).toBeVisible()
    await expect(cardCheckOut).toBeVisible()

    const lockedAlert = page.getByTestId('attendance-checkout-locked-alert')
    await expect(lockedAlert).toBeVisible()

    // Capture Mobile Evidence Screenshot
    const screenshotPath = path.join(evidenceDir, 'rc19-g5-attendance-mobile.png')
    await page.screenshot({ path: screenshotPath, fullPage: false })
    expect(fs.existsSync(screenshotPath)).toBe(true)
  })

  test('G5 Admin Proxy Attendance: Safety lock banner and immutable timestamp notice', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await setupAdmin(page, 'vi')

    await page.route('**/rest/v1/rpc/get_my_self_attendance', route => {
      return route.fulfill({ json: [] })
    })

    await openShift(page, 's1')

    const attendanceTab = page.getByTestId('tab-attendance')
    await expect(attendanceTab).toBeVisible()
    await attendanceTab.click()

    // Verify Admin proxy button is visible for Admin role
    const proxyBtn = page.getByTestId('open-admin-proxy-attendance-btn')
    await expect(proxyBtn).toBeVisible()
    await proxyBtn.click()

    // Verify Admin proxy modal opened
    const proxyModal = page.getByTestId('admin-proxy-attendance-modal')
    await expect(proxyModal).toBeVisible()

    // Verify P0 Safety Lock Alert
    const lockedAlert = page.getByTestId('admin-proxy-attendance-locked-alert')
    await expect(lockedAlert).toBeVisible()
    await expect(lockedAlert).toContainText('Chờ C5 Backend RPC: proxy_attendance_record')

    // Verify submit button is disabled
    const submitBtn = page.getByTestId('admin-proxy-submit-btn')
    await expect(submitBtn).toBeDisabled()

    // Close modal
    await page.getByRole('button', { name: 'Hủy' }).click()
    await expect(proxyModal).not.toBeVisible()
  })
})
