import { test, expect } from '@playwright/test'
import { loginWithCredentials, readEnvIdentities } from './harness/core-v1-harness'

const identities = readEnvIdentities()
test.use({ baseURL: identities.baseURL, trace: 'off', video: 'off', screenshot: 'off' })

test('real Calendar drawer stays contained at desktop and mobile widths', async ({ page }) => {
  test.skip(!identities.admin, 'DATA_NOT_AVAILABLE: approved staging Admin credentials required')
  if (!identities.admin) return
  await loginWithCredentials(page, identities.admin.email, identities.admin.password)
  await page.goto('/calendar')
  await page.getByRole('button', { name: 'Month', exact: true }).click()
  const event = page.locator('[data-testid^="calendar-event-"]').first()
  test.skip(await event.count() === 0, 'DATA_NOT_AVAILABLE: current-month staging Shift required')
  for (const [width, height] of [[1440, 1024], [1280, 900], [768, 1024], [430, 932], [390, 844], [375, 812]]) {
    await page.setViewportSize({ width, height })
    await event.click()
    const drawer = page.getByRole('dialog')
    await expect(drawer).toBeVisible()
    await expect.poll(() => drawer.evaluate(node => {
      const rect = node.getBoundingClientRect()
      const title = node.querySelector('[data-slot="dialog-title"]')!.getBoundingClientRect()
      return rect.x >= 0 && rect.right <= innerWidth + 1 && title.top >= 0
        && node.scrollWidth <= node.clientWidth
        && [...node.querySelectorAll('*')].every(child => child.getBoundingClientRect().right <= innerWidth + 1)
    })).toBe(true)
    await drawer.getByRole('button', { name: 'Close', exact: true }).click()
  }
})
