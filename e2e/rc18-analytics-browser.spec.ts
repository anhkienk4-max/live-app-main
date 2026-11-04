import { expect, test } from '@playwright/test'

/**
 * Headless mock-only React browser regression.
 * Authenticated Preview/Admin/Member UAT must be verified independently.
 */
for (const width of [390, 1440]) {
  for (const locale of ['vi', 'en'] as const) {
    test('Analytics renders and survives reload/filter/route cycles at ' + width + 'px (' + locale + ')', async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await page.addInitScript(language => {
        localStorage.setItem('livestream-ops-current-user', '1')
        localStorage.setItem('livestream-ops-language', language)
      }, locale)
      const pageErrors: string[] = []
      const consoleErrors: string[] = []
      page.on('pageerror', error => pageErrors.push(error.message))
      page.on('console', message => {
        if (message.type() === 'error') consoleErrors.push(message.text())
      })
      await page.goto('/analytics', { waitUntil: 'domcontentloaded' })
      await expect(page.getByTestId('analytics-ready')).toBeVisible()
      await expect(page.getByTestId('analytics-loading-shell')).toHaveCount(0)
      for (let i = 0; i < 3; i++) {
        await page.reload({ waitUntil: 'domcontentloaded' })
        await expect(page.getByTestId('analytics-ready')).toBeVisible()
        await expect(page.getByTestId('analytics-loading-shell')).toHaveCount(0)
      }
      const toggle = page.locator('[aria-controls="analytics-filter-panel"]')
      await expect(toggle).toBeVisible()
      await toggle.click()
      await expect(page.locator('#analytics-filter-panel')).toBeVisible()
      await page.goto('/shifts', { waitUntil: 'domcontentloaded' })
      await expect(page.getByRole('main')).toBeVisible()
      await page.goto('/analytics', { waitUntil: 'domcontentloaded' })
      await expect(page.getByTestId('analytics-ready')).toBeVisible()
      expect(pageErrors, 'No uncaught React page errors').toEqual([])
      const critical = consoleErrors.filter(message =>
        /LIST_IDENTITY_CHANGED|React error #321|Invalid hook call|Rendered fewer hooks|Rendered more hooks/i.test(message))
      expect(critical, 'No identity error or React invalid hook call').toEqual([])
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
        'Analytics must not overflow the viewport').toBe(true)
    })
  }
}
