import { test, expect } from '@playwright/test'
import { loginWithCredentials, readEnvIdentities } from './harness/core-v1-harness'

const identities = readEnvIdentities()
test.use({ baseURL: identities.baseURL, trace: 'off', video: 'off', screenshot: 'only-on-failure' })

test('real Shift detail header keeps its title and actions inside the dialog', async ({ page }) => {
  test.skip(!identities.admin, 'DATA_NOT_AVAILABLE: staging Admin credentials required')
  if (!identities.admin) return
  await loginWithCredentials(page, identities.admin.email, identities.admin.password)
  await page.goto('/shifts')
  const title = process.env.E2E_SHIFT_TITLE || 'QA_R2_LIVE_CALENDAR_2026-10-08'
  await page.getByTestId('production-main-content').getByRole('textbox').first().fill(title)
  await page.getByRole('button', { name: title, exact: true }).click()
  const dialog = page.getByTestId('shift-detail-modal')
  await expect(dialog).toBeVisible()
  for (const [width, height] of [[1440, 1024], [1280, 900], [768, 1024], [430, 932], [390, 844], [375, 812]]) {
    await page.setViewportSize({ width, height })
    await expect.poll(() => dialog.evaluate(node => {
      const dialogRect = node.getBoundingClientRect()
      const titleNode = node.querySelector('[data-testid="shift-detail-title"]')!
      const header = titleNode.closest('[data-slot="dialog-header"]')!
      return node.scrollWidth <= node.clientWidth + 1
        && [...header.querySelectorAll('button'), titleNode].every(control => {
          const rect = control.getBoundingClientRect()
          return rect.left >= dialogRect.left && rect.right <= dialogRect.right + 1
        })
    })).toBe(true)
  }
})