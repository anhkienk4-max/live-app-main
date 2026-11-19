import { expect, test, type Page } from '@playwright/test'

const assignments = [
  { userId: '3', role: 'host' },
  { userId: '5', role: 'support' },
  { userId: '6', role: 'technical' },
] as const
const image = {
  name: 'attendance.jpg',
  mimeType: 'image/jpeg',
  buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]),
}

async function openAssignedShift(page: Page, userId: string) {
  await page.addInitScript(id => {
    localStorage.setItem('livestream-ops-current-user', id)
    localStorage.setItem('livestream-ops-language', 'en')
  }, userId)
  await page.route('**/api/workforce/capabilities', route => route.fulfill({
    json: { ok: true, capabilities: {
      actual_staffing: false, team_performance: false, own_performance: true, payroll: false,
    } },
  }))
  await page.goto('/calendar')
  await page.getByTestId('calendar-event-s1').click()
  await page.getByRole('button', { name: /View Full Shift/i }).click()
  await expect(page.getByTestId('shift-detail-modal')).toBeVisible()
  await page.getByRole('tab', { name: 'Check-in / Check-out' }).click()
}

for (const assignment of assignments) {
  for (const checkinSource of ['camera', 'file_picker'] as const) {
    const checkoutSource = checkinSource === 'camera' ? 'file_picker' : 'camera'
    test(`assigned ${assignment.role}: separate check-in and check-out photos via ${checkinSource} and ${checkoutSource}`, async ({ page }) => {
      const events: Array<Record<string, unknown>> = []
      const sources: Array<{ role: string; event: string; source: string }> = []
      await page.route('**/rest/v1/rpc/get_my_self_attendance', route => route.fulfill({ json: events }))
      await page.route('**/api/workforce/self-attendance-photo', async route => {
        const body = route.request().postData() ?? ''
        const value = (name: string) => new RegExp(`name="${name}"\\r?\\n\\r?\\n([^\\r\\n]+)`).exec(body)?.[1] ?? ''
        const role = value('role')
        const event = value('event_kind')
        const source = value('capture_source')
        expect(role).toBe(assignment.role)
        sources.push({ role, event, source })
        const responseEvent = {
          event_id: `${assignment.role}-${event}`,
          shift_id: 's1',
          staff_id: assignment.userId,
          role,
          event,
          recorded_at: event === 'check_in' ? '2026-10-28T02:00:00Z' : '2026-10-28T06:00:00Z',
          verification_status: 'pending_verification',
          replayed: false,
          photo_available: true,
        }
        events.push(responseEvent)
        return route.fulfill({ json: { ok: true, event: responseEvent } })
      })

      await openAssignedShift(page, assignment.userId)
      await expect(page.getByTestId('self-attendance-panel')).toContainText(new RegExp(assignment.role, 'i'))
      const submitPhoto = async (event: 'check_in' | 'check_out', source: 'camera' | 'file_picker') => {
        const inputName = `${source === 'camera' ? 'Take' : 'Choose existing'} ${event.replace('_', '-')}`
          + (source === 'camera' ? ' photo with camera' : ' photo')
        await page.getByLabel(inputName).setInputFiles(image)
        const submitName = event === 'check_in' ? 'Upload photo and check in' : 'Upload photo and check-out'
        const button = page.getByRole('button', { name: submitName, exact: true })
        await expect(button).toBeEnabled()
        await expect(page.getByText(/Selected photo: attendance\.jpg/)).toBeVisible()
        await button.click()
      }

      await submitPhoto('check_in', checkinSource)
      await expect(page.getByTestId('self-attendance-status')).toContainText('Checked in')
      await submitPhoto('check_out', checkoutSource)
      await expect(page.getByTestId('self-attendance-status')).toHaveText('Checked out')
      await expect(page.getByTestId('attendance-checkin-evidence')).toBeVisible()
      await expect(page.getByTestId('attendance-checkout-evidence')).toBeVisible()
      expect(sources).toEqual([
        { role: assignment.role, event: 'check_in', source: checkinSource },
        { role: assignment.role, event: 'check_out', source: checkoutSource },
      ])
    })
  }
}
