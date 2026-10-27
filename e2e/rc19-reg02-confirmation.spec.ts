import { expect, test, type Page } from '@playwright/test'

async function openHostRegistration(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('livestream-ops-current-user', '3')
    localStorage.setItem('livestream-ops-language', 'vi')
  })
  await page.goto('/calendar')
  await expect(page.getByTestId('calendar-page')).toBeVisible({ timeout: 30_000 })
  await page.getByRole('tab', { name: /Open shifts|Ca đang mở/, exact: true }).click()
  await page.getByRole('button', { name: /Card view|Dạng thẻ/, exact: true }).click()
  await page.getByTestId('open-shift-detail-card-s6').click()
  await expect(page.getByTestId('shift-detail-modal')).toBeVisible()
  await page.getByTestId('shift-detail-modal').getByTestId('open-registration-roles-s6').click()
  await page.getByTestId('register-shift-s6-host').click()
  const confirm = page.getByTestId('registration-confirm-dialog-s6')
  await expect(confirm).toBeVisible()
  await expect(confirm).toContainText('Chờ duyệt')
  await expect(confirm).toContainText('Brand')
  await expect(confirm).toContainText('Platform')
  await expect(confirm).toContainText('Role')
  return confirm
}

for (const width of [390, 768, 1440]) {
  test('REG-02 Host registration confirmation Cancel does not submit at '+width+'px', async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await openHostRegistration(page)
    await page.getByTestId('registration-confirm-cancel-s6').click()
    await expect(page.getByTestId('registration-confirm-dialog-s6')).toHaveCount(0)
    await expect(page.getByTestId('registration-role-dialog-s6')).toBeVisible()
    await expect(page.getByTestId('register-shift-s6-host')).toBeEnabled()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2)).toBe(true)
  })
}

test('REG-02 final submit requires explicit confirmation', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await openHostRegistration(page)
  await page.getByTestId('registration-confirm-submit-s6').click()
  await expect(page.getByTestId('registration-confirm-dialog-s6')).toHaveCount(0)
  await expect(page.getByTestId('register-shift-s6-host')).toBeDisabled()
})
