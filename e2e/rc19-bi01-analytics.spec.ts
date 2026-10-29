import { expect, test } from '@playwright/test'

/** Browser mock only; authenticated role UAT remains a separate gate. */
for (const width of [390, 1440]) {
  for (const locale of ['vi', 'en'] as const) {
    test('BI composer stays scoped and responsive at ' + width + 'px (' + locale + ')', async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await page.addInitScript(language => {
        localStorage.setItem('livestream-ops-current-user', '1')
        localStorage.setItem('livestream-ops-language', language)
      }, locale)
      const errors: string[] = []
      page.on('pageerror', error => errors.push(error.message))
      await page.goto('/analytics', { waitUntil: 'domcontentloaded' })
      await expect(page.getByTestId('analytics-ready')).toBeVisible()
      const metric = page.getByTestId('bi-metric-selector')
      const dimension = page.getByTestId('bi-dimension-selector')
      const chart = page.getByTestId('bi-chart-selector')
      await expect(metric).toBeVisible()
      await dimension.selectOption('brand')
      await chart.selectOption('donut')
      await expect(chart).toHaveValue('donut')
      await expect(chart.locator('option[value="heatmap"]')).toBeDisabled()
      await expect(chart.locator('option[value="funnel"]')).toBeDisabled()
      await page.getByTestId('bi-save-view').click()
      await metric.selectOption('orders')
      await page.getByTestId('bi-load-view').click()
      await expect(metric).toHaveValue('revenue')
      const saved = await page.evaluate(() => Object.keys(localStorage).filter(key => key.includes('rc19.analytics.bi01.view.v1:')))
      expect(saved).toHaveLength(1)
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
      expect(errors).toEqual([])
    })
  }
}
