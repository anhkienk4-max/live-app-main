import { test, expect } from '@playwright/test'
import { loginWithCredentials, readEnvIdentities } from './harness/core-v1-harness'

const identities = readEnvIdentities()
test.use({ baseURL: identities.baseURL, trace: 'off', video: 'off', screenshot: 'off' })

test('Shift create wizard keeps steps and staffing controls inside every supported viewport', async ({ page }) => {
  test.skip(!identities.admin, 'DATA_NOT_AVAILABLE: staging Admin credentials required')
  if (!identities.admin) return
  await loginWithCredentials(page, identities.admin.email, identities.admin.password)
  await page.goto('/shifts')
  await page.getByTestId('add-shift-btn').click()
  const dialog = page.getByRole('dialog')
  for (const [width, height] of [[1440, 1024], [1280, 900], [768, 1024], [430, 932], [390, 844], [375, 812]]) {
    await page.setViewportSize({ width, height })
    await dialog.locator('nav button').nth(2).click()
    await expect(dialog.locator('[data-step="2"]')).toBeVisible()
    await expect.poll(() => dialog.evaluate(node => {
      const frame = node.getBoundingClientRect()
      const controls = [...node.querySelectorAll('nav button, [data-step="2"] [role="combobox"]')]
      return node.scrollWidth <= node.clientWidth + 1 && controls.every(control => {
        const rect = control.getBoundingClientRect()
        return rect.left >= frame.left && rect.right <= frame.right + 1
      }) && frame.left >= 0 && frame.right <= innerWidth + 1
    })).toBe(true)
    const next = dialog.getByRole('button', { name: /Continue|Tiếp tục/i })
    await next.scrollIntoViewIfNeeded()
    await expect(next).toBeInViewport()
  }
})
