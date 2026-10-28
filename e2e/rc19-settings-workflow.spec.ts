import { expect, test } from '@playwright/test'

test.describe('RC19 U12 Settings Workflow', () => {
  test('Admin (Desktop 1440px EN) has full tab access and can switch tabs', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.addInitScript(() => {
      localStorage.setItem('livestream-ops-current-user', '1')
      localStorage.setItem('livestream-ops-language', 'en')
    })

    const pageErrors: string[] = []
    page.on('pageerror', err => pageErrors.push(err.message))

    await page.goto('/settings', { waitUntil: 'domcontentloaded' })
    await expect(page.getByTestId('settings-page')).toBeVisible()

    // Tab visibility for Admin
    await expect(page.getByTestId('settings-team-tab')).toBeVisible()
    await expect(page.getByTestId('settings-team-tab')).toBeEnabled()

    await expect(page.getByTestId('settings-system-tab')).toBeVisible()
    await expect(page.getByTestId('settings-system-tab')).toBeEnabled()

    await expect(page.getByTestId('settings-integrations-tab')).toBeVisible()
    await expect(page.getByTestId('settings-integrations-tab')).toBeEnabled()

    await expect(page.getByTestId('settings-personal-tab')).toBeVisible()
    await expect(page.getByTestId('settings-personal-tab')).toBeEnabled()

    await expect(page.getByTestId('settings-audit-tab')).toBeVisible()
    await expect(page.getByTestId('settings-audit-tab')).toBeEnabled()

    // Switch to Integrations tab
    await page.getByTestId('settings-integrations-tab').click()
    await expect(page.getByTestId('vision-ocr-admin-settings')).toBeVisible()

    // Switch to Personal tab
    await page.getByTestId('settings-personal-tab').click()
    await expect(page.getByRole('button', { name: /Save|Lưu/i })).toBeVisible()

    expect(pageErrors).toEqual([])
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  })

  test('Leader (Desktop 1440px VI) sees Team enabled and System/Integrations locked', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.addInitScript(() => {
      localStorage.setItem('livestream-ops-current-user', '2')
      localStorage.setItem('livestream-ops-language', 'vi')
    })

    const pageErrors: string[] = []
    page.on('pageerror', err => pageErrors.push(err.message))

    await page.goto('/settings', { waitUntil: 'domcontentloaded' })
    await expect(page.getByTestId('settings-page')).toBeVisible()

    // Team tab is visible & enabled
    await expect(page.getByTestId('settings-team-tab')).toBeVisible()
    await expect(page.getByTestId('settings-team-tab')).toBeEnabled()

    // Personal tab is visible & enabled
    await expect(page.getByTestId('settings-personal-tab')).toBeVisible()
    await expect(page.getByTestId('settings-personal-tab')).toBeEnabled()

    // System tab is visible but locked/disabled
    await expect(page.getByTestId('settings-system-tab')).toBeVisible()
    await expect(page.getByTestId('settings-system-tab')).toBeDisabled()

    // Integrations tab is visible but locked/disabled
    await expect(page.getByTestId('settings-integrations-tab')).toBeVisible()
    await expect(page.getByTestId('settings-integrations-tab')).toBeDisabled()

    // Audit tab is hidden for Leader
    await expect(page.getByTestId('settings-audit-tab')).toHaveCount(0)

    expect(pageErrors).toEqual([])
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  })

  test('Member (Mobile 390px VI) sees only Personal tab with no overflow and clean reset', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.addInitScript(() => {
      localStorage.setItem('livestream-ops-current-user', '3')
      localStorage.setItem('livestream-ops-language', 'vi')
    })

    const pageErrors: string[] = []
    page.on('pageerror', err => pageErrors.push(err.message))

    await page.goto('/settings', { waitUntil: 'domcontentloaded' })
    await expect(page.getByTestId('settings-page')).toBeVisible()

    // Only Personal tab is present
    await expect(page.getByTestId('settings-personal-tab')).toBeVisible()
    await expect(page.getByTestId('settings-team-tab')).toHaveCount(0)
    await expect(page.getByTestId('settings-system-tab')).toHaveCount(0)
    await expect(page.getByTestId('settings-integrations-tab')).toHaveCount(0)
    await expect(page.getByTestId('settings-audit-tab')).toHaveCount(0)

    // Ensure reset button is disabled initially (clean state)
    const resetBtn = page.getByTestId('settings-reset-button')
    await expect(resetBtn).toBeDisabled()

    // Toggle a notification switch to create a dirty edit
    const switchControl = page.locator('button[role="switch"]').first()
    if (await switchControl.isVisible()) {
      await switchControl.click()
      // Dirty indicator appears
      await expect(resetBtn).toBeEnabled()
      // Click reset to revert
      await resetBtn.click()
      await expect(resetBtn).toBeDisabled()
    }

    expect(pageErrors).toEqual([])
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  })

  test('Member (Mobile 390px EN) renders without overflow', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.addInitScript(() => {
      localStorage.setItem('livestream-ops-current-user', '3')
      localStorage.setItem('livestream-ops-language', 'en')
    })

    await page.goto('/settings', { waitUntil: 'domcontentloaded' })
    await expect(page.getByTestId('settings-page')).toBeVisible()
    await expect(page.getByTestId('settings-personal-tab')).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  })
})
