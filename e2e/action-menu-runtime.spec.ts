import { expect, test, type Page } from '@playwright/test'

async function useMockAdmin(page: Page) {
  await page.addInitScript(() => {
    window.localStorage.setItem('livestream-ops-current-user', '1')
    window.localStorage.setItem('livestream-ops-language', 'en')
  })
}

function capturePageErrors(page: Page) {
  const errors: Error[] = []
  page.on('pageerror', error => errors.push(error))
  return errors
}

async function expectMenuOpens(trigger: ReturnType<Page['locator']>, page: Page) {
  await expect(trigger).toBeVisible()
  await trigger.click()
  await expect(page.getByRole('menu').last()).toBeVisible()
}

test.describe('shared action and dropdown menus', () => {
  test.beforeEach(async ({ page }) => {
    await useMockAdmin(page)
  })

  test('opens an ActionBar overflow menu in reports', async ({ page }) => {
    const errors = capturePageErrors(page)
    await page.goto('/reports')

    await expectMenuOpens(page.getByTestId('action-overflow-trigger').first(), page)
    expect(errors).toEqual([])
  })

  test('opens a MobileActionMenu in swaps', async ({ page }) => {
    const errors = capturePageErrors(page)
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/swaps')

    await expectMenuOpens(page.locator('button[aria-label="Actions"]:visible').first(), page)
    expect(errors).toEqual([])
  })

  test('opens a normal feature DropdownMenu with disabled and destructive entries', async ({ page }) => {
    const errors = capturePageErrors(page)
    await page.goto('/staff')

    await expectMenuOpens(page.locator('button[aria-label="Actions"]:visible').first(), page)
    await expect(page.getByRole('menuitem').first()).toBeVisible()
    expect(errors).toEqual([])
  })

  test('opens and searches the shared multi-select without crashing', async ({ page }) => {
    const errors = capturePageErrors(page)
    await page.goto('/swaps')

    await page.getByRole('button', { name: 'Requester', exact: true }).click()
    const search = page.getByRole('textbox', { name: 'Search Requester' })
    await expect(search).toBeVisible()
    await search.fill('not-a-real-requester')
    await expect(page.getByText('No matching options')).toBeVisible()
    expect(errors).toEqual([])
  })
})
