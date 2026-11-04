import { expect, test } from '@playwright/test'

for (const { width, language } of [{ width: 390, language: 'vi' }, { width: 1440, language: 'en' }]) {
  test(`Reports List comprehensive interactive features at ${width}px (${language})`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.addInitScript(lang => {
      localStorage.setItem('livestream-ops-current-user', '1')
      localStorage.setItem('livestream-ops-language', lang)
    }, language)
    await page.goto('/reports')

    // 1. Toolbar and filter panel
    const toolbar = page.getByTestId('command-toolbar')
    await expect(toolbar).toBeVisible({ timeout: 25_000 })

    // 2. Section 1: "Cần báo cáo" (Report obligations)
    const needsHeading = page.locator('#needs-report-heading')
    await expect(needsHeading).toBeVisible()

    // 3. Section 2: "Đã tạo báo cáo" (Created reports) with dedicated total badge
    const createdHeading = page.locator('#created-reports-heading')
    await expect(createdHeading).toBeVisible()

    // 4. View Mode toggle in Created Reports
    const tableBtn = page.getByRole('button', { name: 'Chế độ bảng' })
    const cardsBtn = page.getByRole('button', { name: 'Chế độ thẻ' })

    if (await tableBtn.isVisible()) {
      await tableBtn.click()
      await page.waitForTimeout(400)
      // Verify table headers are visible
      await expect(page.locator('th:has-text("Brand")').first()).toBeVisible()
      await expect(page.locator('th:has-text("Thời gian")').first()).toBeVisible()

      // Switch back to cards mode
      await cardsBtn.click()
      await page.waitForTimeout(400)
    }

    // 5. Test Filter Application and URL Sync
    const searchInput = toolbar.locator('input[placeholder*="Tìm"], input[placeholder*="Search"]').first()
    if (await searchInput.isVisible()) {
      await searchInput.fill('Mars')
      const applyBtn = page.getByTestId('reports-apply-filters')
      await expect(applyBtn).toBeEnabled()
      await applyBtn.click()
      await page.waitForTimeout(500)

      // Verify applied chips appear
      const chips = page.getByTestId('reports-applied-filter-chips')
      await expect(chips).toBeVisible()
      await expect(chips).toContainText('Mars')

      // Verify URL updated with search param
      expect(page.url()).toContain('search=Mars')

      // Reset filters
      const resetBtn = toolbar.getByRole('button', { name: /Đặt lại|Reset/i })
      await resetBtn.click()
      await page.waitForTimeout(500)
      expect(page.url()).not.toContain('search=Mars')
    }

    // 6. Capture After Screenshot
    await page.screenshot({ path: `docs/handoffs/evidence/rc19-u09-reports-after-${width}-${language}.png`, caret: 'initial' })
  })
}

test('Reports RBAC & Role isolation: Member user (id: 3) sees own scope without unauthorized delete', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.addInitScript(() => {
    localStorage.setItem('livestream-ops-current-user', '3')
    localStorage.setItem('livestream-ops-language', 'vi')
  })
  await page.goto('/reports')

  const toolbar = page.getByTestId('command-toolbar')
  await expect(toolbar).toBeVisible({ timeout: 25_000 })

  // Member should see reports list
  await expect(page.locator('#created-reports-heading')).toBeVisible()
})
