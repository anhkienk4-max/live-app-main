import { expect, test, type Page } from '@playwright/test'

async function member(page: Page, language: 'vi' | 'en' = 'vi') {
  await page.addInitScript(value => {
    localStorage.setItem('livestream-ops-current-user', '3')
    localStorage.setItem('livestream-ops-language', value)
  }, language)
  await page.route('**/api/workforce/capabilities', route => route.fulfill({
    json: { ok: true, capabilities: {
      actual_staffing: false, team_performance: false, own_performance: true, payroll: false,
    } },
  }))
}
async function openShift(page: Page, shiftId: string) {
  await page.goto('/calendar')
  await page.getByTestId(`calendar-event-${shiftId}`).click()
  await page.getByRole('button', { name: /View Full Shift|Xem chi tiết ca/i }).click()
  await expect(page.getByTestId('shift-detail-modal')).toBeVisible()
}
const checkIn = {
  event_id: 'checkin-3', shift_id: 's1', staff_id: '3', role: 'host',
  event: 'check_in', recorded_at: '2026-10-25T02:00:00Z',
  verification_status: 'pending_verification', photo_available: true,
}

test('flag OFF: assigned member sees an unavailable state and no attendance request', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await member(page)
  let attendanceRequests = 0
  await page.route('**/rest/v1/rpc/**', route => { attendanceRequests++; return route.abort() })
  await openShift(page, 's1')
  await page.getByRole('tab', { name: 'Check-in / Check-out' }).click()
  await expect(page.getByTestId('self-attendance-unavailable')).toContainText('chưa khả dụng')
  await expect(page.getByTestId('self-attendance-panel')).toHaveCount(0)
  expect(attendanceRequests).toBe(0)
  await page.screenshot({ path: 'docs/handoffs/evidence/rc19-u14-flag-off-1440-vi.png' })
})

test('flag ON: assigned member sees own status, photo gate and no cross-shift action', async ({ page }) => {
  await member(page, 'en')
  let reads = 0
  let writes = 0
  await page.route('**/rest/v1/rpc/get_my_self_attendance', route => {
    reads++
    return route.fulfill({ json: [] })
  })
  await page.route('**/rest/v1/rpc/self_attendance_record', route => {
    writes++
    return route.abort()
  })
  await openShift(page, 's1')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('tab', { name: 'Check-in / Check-out' }).click()
  await expect(page.getByTestId('self-attendance-status')).toHaveText('Not checked in')
  await expect(page.getByText('Photo check-in awaits verified Google Drive access.')).toBeVisible()
  await expect(page.getByRole('button', { name: /check in/i })).toHaveCount(0)
  expect(reads).toBeGreaterThan(0)
  expect(writes).toBe(0)
  await page.screenshot({ path: 'docs/handoffs/evidence/rc19-u14-photo-gated-390-en.png' })
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/calendar')
  await expect(page.getByTestId('calendar-event-s1')).toBeVisible()
  await expect(page.getByTestId('calendar-event-s2')).toHaveCount(0)
  await expect(page.getByRole('tab', { name: 'Check-in / Check-out' })).toHaveCount(0)
  expect(writes).toBe(0)
})

test('flag ON: a pending registration cannot check in', async ({ page }) => {
  await member(page, 'en')
  let attendanceRequests = 0
  await page.route('**/rest/v1/rpc/**', route => { attendanceRequests++; return route.abort() })
  await page.goto('/calendar?tab=open')
  await expect(page.getByTestId('open-shift-card-s6')).toBeVisible()
  await page.getByTestId('open-registration-roles-s6').click()
  await page.getByTestId('register-shift-s6-host').click()
  await expect(page.getByTestId('registration-role-s6-host-pending')).toBeVisible()
  await expect(page.getByTestId('shift-detail-modal')).toBeVisible()
  await page.getByRole('tab', { name: 'Check-in / Check-out' }).click()
  await expect(page.getByTestId('self-attendance-unavailable')).toContainText('until your shift assignment is approved')
  await expect(page.getByTestId('self-attendance-panel')).toHaveCount(0)
  expect(attendanceRequests).toBe(0)
})

test('flag ON: failed check-out retries with one request ID and double click writes once', async ({ page }) => {
  await member(page, 'en')
  await page.addInitScript(() => {
    localStorage.setItem('livestream-ops-feature-photo', 'true')
  })
  const events = [checkIn]
  await page.route('**/rest/v1/rpc/get_my_self_attendance', route => route.fulfill({ json: events }))
  const ids: string[] = []
  let release: (() => void) | undefined
  await page.route('**/api/workforce/self-attendance-photo', async route => {
    const postData = route.request().postData() ?? ''
    const match = /name="request_id"\r?\n\r?\n([a-f0-9-]+)/.exec(postData)
    const reqId = match ? match[1] : 'unknown-id'
    ids.push(reqId)
    if (ids.length === 1) {
      await new Promise<void>(resolve => { release = resolve })
      return route.fulfill({ status: 503, json: { ok: false, error: { code: 'Temporary API error' } } })
    }
    const checkedOut = { ...checkIn, event_id: 'checkout-3', event: 'check_out',
      recorded_at: '2026-10-25T06:00:00Z', photo_available: true }
    events.push(checkedOut)
    return route.fulfill({ json: { ok: true, event: checkedOut } })
  })
  await openShift(page, 's1')
  await page.getByRole('tab', { name: 'Check-in / Check-out' }).click()
  await expect(page.getByTestId('self-attendance-status')).toContainText('Checked in')
  await expect(page.getByTestId('attendance-checkout-camera')).toBeVisible()

  // Verify check-out button is disabled until photo is provided
  const checkoutBtn = page.getByRole('button', { name: 'Upload photo and check-out', exact: true })
  await expect(checkoutBtn).toBeDisabled()

  // Select valid check-out photo
  await page.locator('input[type="file"][accept*="image"]').first().setInputFiles({
    name: 'checkout.jpg',
    mimeType: 'image/jpeg',
    buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]),
  })
  await expect(checkoutBtn).toBeEnabled()

  // Double click debounce check
  await checkoutBtn.evaluate(button => { (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click() })
  await expect.poll(() => ids.length).toBe(1)
  release?.()
  await expect(page.getByRole('alert')).toContainText('Temporary API error')

  // Retry with same photo sends identical request id
  await checkoutBtn.click()
  await expect(page.getByTestId('self-attendance-status')).toHaveText('Checked out')
  expect(ids).toHaveLength(2)
  expect(ids[0]).toBe(ids[1])
  await expect(page.getByRole('button', { name: 'Upload photo and check-out', exact: true })).toHaveCount(0)
  await expect(page.getByTestId('attendance-checkout-evidence')).toBeVisible()
})

test('flag ON: API read retry and account switch do not show stale actor events', async ({ page }) => {
  await member(page, 'en')
  let allowSuccess = false
  let holdNext = false
  let release: (() => void) | undefined
  await page.route('**/rest/v1/rpc/get_my_self_attendance', async route => {
    if (!allowSuccess) return route.fulfill({ status: 503, json: { message: 'Read failed', code: '503' } })
    if (holdNext) await new Promise<void>(resolve => { release = resolve })
    return route.fulfill({ json: [checkIn] })
  })
  await openShift(page, 's1')
  await page.getByRole('tab', { name: 'Check-in / Check-out' }).click()
  await expect(page.getByRole('alert')).toContainText('Read failed')
  allowSuccess = true
  await page.getByRole('button', { name: 'Retry / Refresh' }).click()
  await expect(page.getByTestId('self-attendance-status')).toContainText('Checked in')
  holdNext = true
  await page.getByRole('button', { name: 'Retry / Refresh' }).click()
  await expect.poll(() => Boolean(release)).toBe(true)
  await expect(page.getByText('Checking attendance history…')).toBeVisible()
  await page.evaluate(() => {
    localStorage.setItem('livestream-ops-current-user', '4')
    window.dispatchEvent(new Event('livestream-ops-current-user-change'))
  })
  release?.()
  await expect(page.getByRole('tab', { name: 'Check-in / Check-out' })).toHaveCount(0)
  await expect(page.getByTestId('self-attendance-panel')).toHaveCount(0)
})

test('flag ON: rejects attendance history returned for another actor', async ({ page }) => {
  await member(page, 'en')
  let writes = 0
  await page.route('**/rest/v1/rpc/get_my_self_attendance', route => route.fulfill({
    json: [{ ...checkIn, staff_id: '4' }],
  }))
  await page.route('**/rest/v1/rpc/self_attendance_record', route => { writes++; return route.abort() })
  await openShift(page, 's1')
  await page.getByRole('tab', { name: 'Check-in / Check-out' }).click()
  await expect(page.getByTestId('self-attendance-panel').getByRole('alert')).toContainText('ATTENDANCE_SCOPE_INVALID')
  await expect(page.getByTestId('self-attendance-status')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Check-out' })).toHaveCount(0)
  expect(writes).toBe(0)
})
