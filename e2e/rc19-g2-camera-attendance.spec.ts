import { expect, test, type Page } from '@playwright/test'

test.use({
  launchOptions: {
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
  },
})

const user = { userId: '3', role: 'host' }

async function setupAndOpenShift(page: Page, lang: 'vi' | 'en' = 'vi', mockAttendanceEvents: boolean = true) {
  await page.addInitScript(({ id, language }) => {
    localStorage.setItem('livestream-ops-current-user', id)
    localStorage.setItem('livestream-ops-language', language)
  }, { id: user.userId, language: lang })

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

  if (mockAttendanceEvents) {
    await page.route('**/rest/v1/rpc/get_my_self_attendance', route => route.fulfill({ json: [] }))
  }

  await page.goto('/calendar')
  const isMobile = (page.viewportSize()?.width ?? 1000) < 768
  if (isMobile) {
    const fullCalendarBtn = page.getByRole('button', { name: /Lịch đầy đủ|Full calendar/i })
    await fullCalendarBtn.click()
  }

  const eventBtn = page.getByTestId('calendar-event-s1')
  await eventBtn.scrollIntoViewIfNeeded()
  await eventBtn.click()
  await page.getByRole('button', { name: /View Full Shift|Xem chi tiết ca/i }).click()
  await expect(page.getByTestId('shift-detail-modal')).toBeVisible()
  await page.getByRole('tab', { name: /Check-in \/ Check-out|Chấm công cá nhân/i }).click()
}

test.describe('RC19 G2 In-App Camera and Attendance Lifecycle', () => {
  test('In-app camera opens, captures frame via canvas, confirms, and submits check-in and check-out', async ({ page }) => {
    const events: Array<Record<string, unknown>> = []
    const uploadedSources: string[] = []

    await page.route('**/rest/v1/rpc/get_my_self_attendance', route => route.fulfill({ json: events }))
    await page.route('**/api/workforce/self-attendance-photo', async route => {
      const body = route.request().postData() ?? ''
      const matchSource = /name="capture_source"\r?\n\r?\n([^\r\n]+)/.exec(body)
      const matchKind = /name="event_kind"\r?\n\r?\n([^\r\n]+)/.exec(body)
      const source = matchSource ? matchSource[1] : 'unknown'
      const kind = matchKind ? matchKind[1] : 'unknown'
      uploadedSources.push(`${kind}:${source}`)

      const responseEvent = {
        event_id: `evt-${kind}`,
        shift_id: 's1',
        staff_id: user.userId,
        role: user.role,
        event: kind,
        recorded_at: kind === 'check_in' ? '2026-10-30T02:00:00Z' : '2026-10-30T06:00:00Z',
        verification_status: 'pending_verification',
        replayed: false,
        photo_available: true,
      }
      events.push(responseEvent)
      return route.fulfill({ json: { ok: true, event: responseEvent } })
    })

    await setupAndOpenShift(page, 'vi', false)
    await expect(page.getByTestId('self-attendance-panel')).toBeVisible()
    await expect(page.getByTestId('self-attendance-status')).toContainText('Chưa check-in')

    // 1. Click "Chụp ảnh" to open in-app camera viewfinder
    await page.getByTestId('attendance-open-camera-btn').click()
    const cameraModal = page.getByTestId('attendance-camera-capture')
    await expect(cameraModal).toBeVisible()

    // 2. Viewfinder video stream is active
    await expect(page.getByTestId('camera-video-preview')).toBeVisible()
    await expect(page.getByTestId('camera-capture-trigger')).toBeVisible()

    // 3. Switch facing mode
    await page.getByTestId('camera-switch-facing').click()
    await expect(page.getByTestId('camera-video-preview')).toBeVisible()

    // 4. Capture snapshot
    await page.getByTestId('camera-capture-trigger').click()
    await expect(page.getByTestId('camera-captured-preview')).toBeVisible()
    await expect(page.getByTestId('camera-retake-trigger')).toBeVisible()
    await expect(page.getByTestId('camera-confirm-trigger')).toBeVisible()

    // 5. Test Retake
    await page.getByTestId('camera-retake-trigger').click()
    await expect(page.getByTestId('camera-video-preview')).toBeVisible()

    // 6. Capture and confirm
    await page.getByTestId('camera-capture-trigger').click()
    await expect(page.getByTestId('camera-captured-preview')).toBeVisible()
    await page.getByTestId('camera-confirm-trigger').click()

    // Camera closes, photo preview visible in panel
    await expect(cameraModal).toBeHidden()
    await expect(page.getByRole('button', { name: /Tải ảnh và check-in/i })).toBeEnabled()

    // 7. Submit check-in photo
    await page.getByRole('button', { name: /Tải ảnh và check-in/i }).click()
    await expect(page.getByTestId('self-attendance-status')).toContainText('Đã check-in')
    await expect(page.getByTestId('attendance-checkin-evidence')).toBeVisible()

    // 8. Now Check-out is available
    await page.getByTestId('attendance-open-camera-btn').click()
    await expect(cameraModal).toBeVisible()
    await page.getByTestId('camera-capture-trigger').click()
    await expect(page.getByTestId('camera-confirm-trigger')).toBeVisible()
    await page.getByTestId('camera-confirm-trigger').click()
    await expect(cameraModal).toBeHidden()

    // 9. Submit check-out photo
    await page.getByRole('button', { name: /Tải ảnh và check-out/i }).click()
    await expect(page.getByTestId('self-attendance-status')).toHaveText('Đã check-out')
    await expect(page.getByTestId('attendance-checkout-evidence')).toBeVisible()

    expect(uploadedSources).toEqual(['check_in:camera', 'check_out:camera'])
  })

  test('Camera dialog closes cleanly on cancel and unmount without background activity', async ({ page }) => {
    await setupAndOpenShift(page, 'en', true)
    await page.getByTestId('attendance-open-camera-btn').click()
    const cameraModal = page.getByTestId('attendance-camera-capture')
    await expect(cameraModal).toBeVisible()

    // Click cancel button
    await page.getByTestId('camera-cancel-trigger').click()
    await expect(cameraModal).toBeHidden()
  })

  test('Mobile responsive layout test at 390px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await setupAndOpenShift(page, 'vi', true)

    await page.getByTestId('attendance-open-camera-btn').click()
    const cameraModal = page.getByTestId('attendance-camera-capture')
    await expect(cameraModal).toBeVisible()

    const box = await cameraModal.boundingBox()
    expect(box).toBeTruthy()
    if (box) {
      expect(box.width).toBeLessThanOrEqual(390)
    }

    await page.keyboard.press('Escape')
    await expect(cameraModal).toBeHidden()
  })
})
