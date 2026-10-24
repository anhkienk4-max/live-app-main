import { expect, test } from '@playwright/test'

for (const { width, language } of [{ width: 390, language: 'vi' }, { width: 1440, language: 'en' }]) {
  test(`Storage Explorer interactive features at ${width}px (${language})`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.addInitScript(lang => {
      localStorage.setItem('livestream-ops-current-user', '1')
      localStorage.setItem('livestream-ops-language', lang)
    }, language)
    await page.goto('/storage')

    // 1. Operational File Workspace container
    const workspace = page.getByTestId('operational-file-workspace')
    await expect(workspace).toBeVisible({ timeout: 25_000 })

    // 2. Directory Tree
    const tree = page.locator('[role="tree"]')
    await expect(tree).toBeVisible()

    // 3. Breadcrumbs
    const breadcrumb = page.locator('nav[aria-label="Breadcrumb"]')
    await expect(breadcrumb).toBeVisible()
    await expect(breadcrumb).toContainText('Client Group')

    // 4. Provider Connection status pills
    await expect(page.locator('text=Google Drive').first()).toBeVisible()
    await expect(page.locator('text=OneDrive').first()).toBeVisible()

    // 5. Action controls (Upload & Attach buttons)
    const uploadBtn = page.getByRole('button', { name: /Tải file lên/i })
    await expect(uploadBtn).toBeVisible()
    const attachBtn = page.getByRole('button', { name: /Chuẩn bị \/ Gắn link/i })
    await expect(attachBtn).toBeVisible()

    // 6. Command Toolbar with search and filters
    const toolbar = page.getByTestId('command-toolbar')
    await expect(toolbar).toBeVisible()

    // 7. View Mode toggle: Switch to Cards and back to Table
    const cardsBtn = page.getByRole('button', { name: 'Chế độ thẻ' })
    if (await cardsBtn.isVisible()) {
      await cardsBtn.click()
      await page.waitForTimeout(300)
      const tableBtn = page.getByRole('button', { name: 'Chế độ bảng' })
      await expect(tableBtn).toBeVisible()
      await tableBtn.click()
      await page.waitForTimeout(300)
    }

    // 8. Capture After Screenshot
    await page.screenshot({ path: `docs/handoffs/evidence/rc19-u08-storage-after-${width}-${language}.png`, caret: 'initial' })
  })
}
