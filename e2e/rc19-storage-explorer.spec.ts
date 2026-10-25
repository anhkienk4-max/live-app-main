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

    // 2. Directory Tree & Breadcrumb
    const tree = page.locator('[role="tree"]')
    await expect(tree).toBeVisible()

    const breadcrumb = page.locator('nav[aria-label="Breadcrumb"]')
    await expect(breadcrumb).toBeVisible()
    await expect(breadcrumb).toContainText('Client Group')

    // 3. Provider Connection Status: Unverified badge
    await expect(page.locator('text=Google Drive: Chưa xác minh').first()).toBeVisible()
    await expect(page.locator('text=OneDrive: Chưa xác minh').first()).toBeVisible()

    // 4. Incomplete Scope Alert & Guidance
    const scopeWarning = page.locator('text=Chưa đủ ngữ cảnh').first()
    await expect(scopeWarning).toBeVisible()

    // 5. Action controls (Upload & Attach buttons disabled on incomplete scope)
    const uploadBtn = page.getByRole('button', { name: /Tải file lên/i })
    await expect(uploadBtn).toBeVisible()
    await expect(uploadBtn).toBeDisabled()

    const attachBtn = page.getByRole('button', { name: /Chuẩn bị \/ Gắn link/i })
    await expect(attachBtn).toBeVisible()
    await expect(attachBtn).toBeDisabled()

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

test('Storage RBAC: Member user (id: 3) is denied access with alert', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.addInitScript(() => {
    localStorage.setItem('livestream-ops-current-user', '3')
    localStorage.setItem('livestream-ops-language', 'vi')
  })
  await page.goto('/storage')

  const alert = page.getByRole('alert').filter({ hasText: 'Bạn không có quyền truy cập kho file' })
  await expect(alert).toBeVisible({ timeout: 20_000 })
  await expect(page.getByTestId('operational-file-workspace')).not.toBeVisible()
})
