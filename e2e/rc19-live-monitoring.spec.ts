import { expect, test } from '@playwright/test'

for (const { width, language } of [{ width: 390, language: 'vi' }, { width: 1440, language: 'en' }]) {
  test(`Live Monitoring page, metrics scope and filters at ${width}px (${language})`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.addInitScript(lang => {
      localStorage.setItem('livestream-ops-current-user', '1')
      localStorage.setItem('livestream-ops-language', lang)
    }, language)
    await page.goto('/live')

    // 1. Control strip buttons & filter toggle
    const filterBtn = page.getByTestId('live-filter-toggle')
    await expect(filterBtn).toBeVisible()

    // 2. Metrics strip with page-local scope disclaimer
    await expect(page.locator('text=/Chỉ số tính trong trang hiện tại/i')).toBeVisible()

    // 3. Filter toggle
    await filterBtn.click()
    const filterPanel = page.locator('#live-filter-panel')
    await expect(filterPanel).toBeVisible()

    // 4. Status filter testId present
    const statusFilter = page.getByTestId('live-status-filter')
    await expect(statusFilter).toBeVisible()

    // 5. Evidence screenshot
    await page.screenshot({ path: `docs/handoffs/evidence/rc19-live-monitoring-after-${width}-${language}.png`, caret: 'initial' })
  })
}
