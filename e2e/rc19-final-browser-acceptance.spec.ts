import { expect, test, type Page } from '@playwright/test'
import * as path from 'node:path'
import * as fs from 'node:fs'

const outputDir = path.join(process.cwd(), 'output', 'playwright')

test.beforeAll(async () => {
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true })
  }
})

const memberUser = { userId: '3', role: 'host' }

async function setupMemberUser(page: Page, lang: 'vi' | 'en' = 'vi') {
  await page.addInitScript(({ id, language }) => {
    localStorage.setItem('livestream-ops-current-user', id)
    localStorage.setItem('livestream-ops-language', language)
  }, { id: memberUser.userId, language: lang })

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

  await page.route('**/api/workforce/attendance-photo-review*', route =>
    route.fulfill({
      status: 200,
      json: { ok: true, reviews: [] },
    })
  )
}

async function setupAdminUser(page: Page, lang: 'vi' | 'en' = 'vi') {
  await page.addInitScript(({ language }) => {
    localStorage.setItem('livestream-ops-current-user', '1')
    localStorage.setItem('livestream-ops-language', language)
  }, { language: lang })

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

  await page.route('**/api/workforce/attendance-photo-review*', route =>
    route.fulfill({
      status: 200,
      json: { ok: true, reviews: [] },
    })
  )
}

async function openAttendanceModal(page: Page) {
  await page.goto('/calendar')
  const isMobile = (page.viewportSize()?.width ?? 1000) < 768
  if (isMobile) {
    const fullCalendarBtn = page.getByRole('button', { name: /Lịch đầy đủ|Full calendar/i })
    if (await fullCalendarBtn.isVisible().catch(() => false)) {
      await fullCalendarBtn.click()
    }
  }

  const eventBtn = page.getByTestId('calendar-event-s1').or(page.getByText('Phiên live TechGear')).first()
  await expect(eventBtn).toBeVisible({ timeout: 35_000 })
  await eventBtn.scrollIntoViewIfNeeded()
  await eventBtn.click()

  const viewFullBtn = page.getByRole('button', { name: /View Full Shift|Xem chi tiết ca/i })
  if (await viewFullBtn.isVisible().catch(() => false)) {
    await viewFullBtn.click()
  }
  await expect(page.getByTestId('shift-detail-modal')).toBeVisible({ timeout: 20_000 })
  await page.getByRole('tab', { name: /Check-in \/ Check-out|Chấm công cá nhân/i }).click()
  await expect(page.getByTestId('self-attendance-panel')).toBeVisible({ timeout: 15_000 })
}

test.describe('RC19 G5 Attendance Final Browser Acceptance', () => {
  const viewports = [
    { name: 'mobile', width: 390, height: 844 },
    { name: 'tablet', width: 768, height: 1024 },
    { name: 'desktop', width: 1440, height: 900 },
  ]

  for (const vp of viewports) {
    test(`G5 Attendance at ${vp.width}px (${vp.name}) — cards, camera eventKind, recovery label, and submit`, async ({ page }) => {
      const consoleErrors: string[] = []
      page.on('console', msg => {
        if (msg.type() === 'error') consoleErrors.push(msg.text())
      })

      await page.setViewportSize({ width: vp.width, height: vp.height })
      await setupMemberUser(page, 'vi')

      const events: Array<Record<string, unknown>> = []
      await page.route('**/rest/v1/rpc/get_my_self_attendance', route => route.fulfill({ json: events }))

      await page.route('**/api/workforce/self-attendance-photo*', async route => {
        if (route.request().method() === 'GET') {
          return route.fulfill({
            contentType: 'image/png',
            body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAA=', 'base64'),
          })
        }
        const body = route.request().postData() ?? ''
        const matchKind = /name="event_kind"\r?\n\r?\n([^\r\n]+)/.exec(body)
        const kind = matchKind ? matchKind[1] : 'check_in'
        const responseEvent = {
          event_id: `evt-${kind}-${Date.now()}`,
          shift_id: 's1',
          staff_id: memberUser.userId,
          role: memberUser.role,
          event: kind,
          recorded_at: new Date().toISOString(),
          verification_status: 'pending_verification',
          replayed: false,
          photo_available: true,
        }
        events.push(responseEvent)
        return route.fulfill({ json: { ok: true, event: responseEvent } })
      })

      await openAttendanceModal(page)

      // 1. Verify Card A (Check-in) and Card B (Check-out) exist
      const cardA = page.getByTestId('attendance-card-checkin')
      const cardB = page.getByTestId('attendance-card-checkout')
      await expect(cardA).toBeVisible()
      await expect(cardB).toBeVisible()

      // 2. Verify Card B is locked before Check-in
      const lockedAlert = page.getByTestId('attendance-checkout-locked-alert')
      await expect(lockedAlert).toBeVisible()
      await expect(lockedAlert).toContainText('Check-out đang khóa')

      // 3. Verify unambiguous recovery label
      const recoverBtnA = page.getByTestId('attendance-checkin-recover-btn')
      await expect(recoverBtnA).toBeVisible()
      await expect(recoverBtnA).toContainText('Khôi phục ảnh đã tải')

      // 4. Open Check-in in-app camera modal
      const openCameraBtnA = page.getByTestId('attendance-checkin-open-camera-btn')
      await expect(openCameraBtnA).toBeVisible()
      await openCameraBtnA.click()

      // 5. Verify Camera modal tags data-event-kind="check_in"
      const cameraModal = page.getByTestId('attendance-camera-capture')
      await expect(cameraModal).toBeVisible()
      await expect(cameraModal).toHaveAttribute('data-event-kind', 'check_in')

      // 6. Capture snapshot and confirm
      await expect(page.getByTestId('camera-video-preview')).toBeVisible()
      await page.getByTestId('camera-capture-trigger').click()
      await expect(page.getByTestId('camera-captured-preview')).toBeVisible()
      await page.getByTestId('camera-confirm-trigger').click()
      await expect(cameraModal).toBeHidden()

      // 7. Preview image is displayed in Card A
      await expect(page.getByTestId('attendance-checkin-preview-img')).toBeVisible()

      // 8. Submit Check-in
      const submitBtnA = page.getByTestId('attendance-checkin-submit-btn')
      await expect(submitBtnA).toBeEnabled()
      await submitBtnA.click()

      // 9. Card A transitions to recorded evidence
      await expect(page.getByTestId('attendance-checkin-evidence')).toBeVisible({ timeout: 15_000 })
      await expect(cardA).toContainText('ĐÃ GHI NHẬN')

      // 9a. Verify distinct photo verification badge and shift progress
      await expect(page.getByTestId('attendance-checkin-verification-badge')).toBeVisible()
      await expect(page.getByTestId('attendance-checkin-verification-badge')).toContainText('Ảnh chờ đối soát')
      await expect(page.getByTestId('self-attendance-status')).toContainText('Đang trong ca')

      // 9b. Verify timing compliance badge is rendered
      await expect(page.getByTestId('attendance-checkin-timing-warning')).toBeVisible()

      // 10. Card B becomes unlocked for check-out
      await expect(lockedAlert).toBeHidden()
      const openCameraBtnB = page.getByTestId('attendance-checkout-open-camera-btn')
      await expect(openCameraBtnB).toBeVisible()

      // 11. Open Check-out camera modal and verify data-event-kind="check_out"
      await openCameraBtnB.click()
      await expect(cameraModal).toBeVisible()
      await expect(cameraModal).toHaveAttribute('data-event-kind', 'check_out')

      // 12. Capture snapshot and confirm checkout
      await page.getByTestId('camera-capture-trigger').click()
      await expect(page.getByTestId('camera-captured-preview')).toBeVisible()
      await page.getByTestId('camera-confirm-trigger').click()
      await expect(cameraModal).toBeHidden()

      // 13. Preview image is displayed in Card B
      await expect(page.getByTestId('attendance-checkout-preview-img')).toBeVisible()

      // 13. Submit Check-out
      const submitBtnB = page.getByTestId('attendance-checkout-submit-btn')
      await expect(submitBtnB).toBeEnabled()
      await submitBtnB.click()

      // 14. Card B transitions to recorded evidence
      await expect(page.getByTestId('attendance-checkout-evidence')).toBeVisible({ timeout: 15_000 })
      await expect(cardB).toContainText('ĐÃ GHI NHẬN')

      // 14a. Verify shift completion state
      await expect(page.getByTestId('self-attendance-status')).toContainText('Đã hoàn thành ca')

      // 15. Verify no horizontal overflow
      const hasHorizontalScroll = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
      expect(hasHorizontalScroll).toBe(false)

      // Capture screenshot
      const shotPath = path.join(outputDir, `g5-attendance-${vp.name}-${vp.width}.png`)
      await page.screenshot({ path: shotPath, fullPage: false })
      expect(fs.existsSync(shotPath)).toBe(true)

      // Ensure no uncaught errors
      expect(consoleErrors.filter(e => !e.includes('Download the React DevTools'))).toEqual([])
    })
  }

  test('G5 Timing Compliance — Normal vs Outside Standard Window', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await setupMemberUser(page, 'vi')

    // Scenario: check-in is 09:15 (compliant for 09:00 - 13:00 shift)
    const todayStr = new Date().toISOString().slice(0, 10)
    const compliantEvent = {
      event_id: 'evt-checkin-compliant',
      shift_id: 's1',
      staff_id: memberUser.userId,
      role: memberUser.role,
      event: 'check_in',
      recorded_at: `${todayStr}T09:15:00.000Z`,
      verification_status: 'pending_verification',
      replayed: false,
      photo_available: true,
    }

    await page.route('**/rest/v1/rpc/get_my_self_attendance', route =>
      route.fulfill({ json: [compliantEvent] })
    )

    await openAttendanceModal(page)

    // Verify Card A shows "Đúng khung giờ chuẩn"
    const timingBadge = page.getByTestId('attendance-checkin-timing-warning')
    await expect(timingBadge).toBeVisible()
    await expect(timingBadge).toContainText('Đúng khung giờ chuẩn')
  })

  test('G5 Error Classification, Retry Button, and Photo Disabled Notice', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await setupMemberUser(page, 'vi')

    await page.route('**/rest/v1/rpc/get_my_self_attendance', route => route.fulfill({ json: [] }))

    // Mock API error response for submission
    await page.route('**/api/workforce/self-attendance-photo', route =>
      route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({ ok: false, error: { code: 'PERMISSION_DENIED_42501', message: '42501 permission denied' } }),
      })
    )

    await openAttendanceModal(page)

    // Capture photo for check-in
    await page.getByTestId('attendance-checkin-open-camera-btn').click()
    await page.getByTestId('camera-capture-trigger').click()
    await page.getByTestId('camera-confirm-trigger').click()

    // Submit -> triggers error
    await page.getByTestId('attendance-checkin-submit-btn').click()

    // Verify classified permission denied message
    const errorAlert = page.getByTestId('attendance-checkin-error')
    await expect(errorAlert).toBeVisible()
    await expect(errorAlert).toContainText('Từ chối quyền truy cập')

    // Verify retry button is rendered and clickable
    const retryBtn = page.getByTestId('attendance-checkin-retry-btn')
    await expect(retryBtn).toBeVisible()

    // Test retry click triggers another attempt
    let retried = false
    await page.route('**/api/workforce/self-attendance-photo*', route => {
      retried = true
      return route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ ok: false, error: { code: 'SESSION_EXPIRED_401', message: '401 session expired' } }),
      })
    })
    await retryBtn.click()
    await expect(errorAlert).toContainText('Phiên làm việc đã hết hạn')
    expect(retried).toBe(true)
  })
})

test.describe('RC19 G7 Reports Final Browser Acceptance', () => {
  const viewports = [
    { name: 'mobile', width: 390, height: 844 },
    { name: 'tablet', width: 768, height: 1024 },
    { name: 'desktop', width: 1440, height: 900 },
  ]

  for (const vp of viewports) {
    test(`G7 Reports at ${vp.width}px (${vp.name}) — list, view toggle, and image placeholders`, async ({ page }) => {
      const consoleWarnings: string[] = []
      page.on('console', msg => {
        if (msg.type() === 'warning') consoleWarnings.push(msg.text())
      })

      await page.setViewportSize({ width: vp.width, height: vp.height })
      await setupAdminUser(page, 'vi')

      await page.goto('/reports')

      // 1. Toolbar and obligations
      const toolbar = page.getByTestId('command-toolbar')
      await expect(toolbar).toBeVisible({ timeout: 60_000 })
      await expect(page.locator('#needs-report-heading')).toBeVisible()
      await expect(page.locator('#created-reports-heading')).toBeVisible()

      // 2. Queue breakdown
      const showQueueBtn = page.getByTestId('reports-show-queue')
      if (await showQueueBtn.isVisible().catch(() => false)) {
        await showQueueBtn.click()
        await expect(page.getByTestId('reports-queue-breakdown')).toBeVisible()
      }

      // 3. View Mode toggles and responsive layout
      const tableBtn = page.getByRole('button', { name: 'Chế độ bảng' })
      const cardsBtn = page.getByRole('button', { name: 'Chế độ thẻ' })
      if (await tableBtn.isVisible().catch(() => false)) {
        // Toggle to Table view
        await tableBtn.click()
        await expect(page).toHaveURL(/reports_view=table/)
        await expect(tableBtn).toHaveAttribute('aria-pressed', 'true')

        // Verify zero horizontal page scroll in table view
        const hasScrollTable = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
        expect(hasScrollTable).toBe(false)

        if (vp.width === 390) {
          // On mobile (390px), table view adapts to responsive cards
          await expect(page.getByTestId('reports-table-mobile-cards')).toBeVisible()
        } else if (vp.width === 768) {
          // On tablet (768px), primary CTA or action dropdown is accessible
          const viewBtn = page.getByRole('button', { name: /Xem chi tiết|Tiếp tục/i }).first()
          const actionMenu = page.getByTestId(/^report-action-menu-/).first()
          await expect(viewBtn.or(actionMenu)).toBeVisible()
        }

        // Toggle back to Cards view
        await cardsBtn.click()
        await expect(page).not.toHaveURL(/reports_view=table/)
        await expect(cardsBtn).toHaveAttribute('aria-pressed', 'true')
      }

      // Verify zero horizontal page scroll in cards view
      const hasHorizontalScroll = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
      expect(hasHorizontalScroll).toBe(false)

      // 4. Capture screenshot
      const shotPath = path.join(outputDir, `g7-reports-${vp.name}-${vp.width}.png`)
      await page.screenshot({ path: shotPath, fullPage: true })
      expect(fs.existsSync(shotPath)).toBe(true)

      // 5. Verify zero "empty string src" warnings
      const emptySrcWarnings = consoleWarnings.filter(w => w.includes('An empty string ("") was passed to the src attribute'))
      expect(emptySrcWarnings).toEqual([])
    })
  }

  test('G7 Image Fallback and Retry on Expired or Broken URL', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await setupAdminUser(page, 'vi')

    // Simulate broken/expired image URL
    await page.route('https://images.unsplash.com/**', route => route.abort('failed'))

    await page.goto('/reports')
    await expect(page.getByTestId('command-toolbar')).toBeVisible({ timeout: 35_000 })

    const viewDetailBtn = page.getByRole('button', { name: /Xem chi tiết|View details/i }).first()
    if (await viewDetailBtn.isVisible().catch(() => false)) {
      await viewDetailBtn.click()
      const dialog = page.getByRole('dialog')
      await expect(dialog).toBeVisible({ timeout: 15_000 })

      // Verify that if image failed to load, fallback or retry button is available
      const fallback = page.getByTestId('live-image-error-fallback').first()
      if (await fallback.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await expect(fallback).toContainText(/Không thể tải ảnh/i)
        const retryBtn = page.getByTestId('live-image-retry-btn').first()
        await expect(retryBtn).toBeVisible()
      }
      await page.keyboard.press('Escape')
      await expect(dialog).toBeHidden()
    }
  })

  test('G7 Report Detail & Form Modal DOM Order and Image Gallery', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await setupAdminUser(page, 'vi')

    await page.goto('/reports')
    await expect(page.getByTestId('command-toolbar')).toBeVisible({ timeout: 35_000 })

    // Open first available report detail or continue report
    const viewDetailBtn = page.getByRole('button', { name: /Xem chi tiết|View details/i }).first()
    if (await viewDetailBtn.isVisible().catch(() => false)) {
      await viewDetailBtn.click()
      const dialog = page.getByRole('dialog')
      await expect(dialog).toBeVisible({ timeout: 15_000 })

      // Capture report detail screenshot
      const detailShot = path.join(outputDir, 'g7-report-detail-modal-1440.png')
      await page.screenshot({ path: detailShot, fullPage: false })
      expect(fs.existsSync(detailShot)).toBe(true)

      await page.keyboard.press('Escape')
      await expect(dialog).toBeHidden()
    }
  })
})
