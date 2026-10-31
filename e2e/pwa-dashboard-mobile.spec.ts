import { test, expect } from '@playwright/test'
import { mkdir } from 'node:fs/promises'

for (const viewport of [
  { width: 390, height: 844, name: 'iphone-390' },
  { width: 412, height: 915, name: 'android-412' },
  { width: 620, height: 920, name: 'edge-narrow-620' },
]) {
  test('RC19 authenticated dashboard uses PWA design at ' + viewport.name, async ({ page }) => {
    await page.setViewportSize(viewport)
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    const mobile = page.getByTestId('ada-reference-mobile-home')
    await expect(mobile).toBeVisible({ timeout: 60000 })
    await expect(page.getByTestId('production-bottom-nav')).toBeVisible()
    const role = await mobile.getAttribute('data-role')
    const quickLinks = page.getByTestId('ada-mobile-home-quick-links')
    await expect(quickLinks.getByRole('link')).toHaveCount(role === 'admin' ? 6 : 5)
    await expect(mobile.getByTestId('ada-mobile-profile-link')).toHaveAttribute('href', '/profile')
    await expect(mobile.getByTestId('ada-mobile-notifications-link')).toHaveAttribute('href', '/notifications')
    await expect(mobile.getByRole('heading', { name: 'Công việc cần xử lý' })).toBeVisible()
    const widths = await page.evaluate(() => ({
      visible: window.innerWidth,
      document: document.documentElement.scrollWidth,
    }))
    expect(widths.document, 'Document should not scroll horizontally').toBeLessThanOrEqual(viewport.width + 1)
    await mkdir('test-results/pwa-dashboard', { recursive: true })
    await page.screenshot({ path: 'test-results/pwa-dashboard/' + viewport.name + '.png', fullPage: true, animations: 'disabled' })
    console.log('PWA_DASHBOARD_VIEW ' + JSON.stringify({ viewport, widths }))
  })
}

test('RC19 desktop dashboard remains active at 900px', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 1100 })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('production-main-content')).toBeVisible()
  await expect(page.getByTestId('ada-reference-mobile-home')).toBeHidden({ timeout: 60000 })
  await expect(page.getByTestId('production-bottom-nav')).toBeHidden()
  await expect(page.locator('main.hidden[class*="md:flex"]')).toBeVisible()
  const width = await page.evaluate(() => document.documentElement.scrollWidth)
  expect(width).toBeLessThanOrEqual(901)
})

test('RC19 mobile More drawer retains Profile and Notifications in Overview', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/', { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('ada-reference-mobile-home')).toBeVisible({ timeout: 60000 })
  await page.getByTestId('nav-menu-more').click()
  const menu = page.getByTestId('grouped-navigation-drawer')
  await expect(menu).toBeVisible()
  await expect(menu.locator('a[href="/profile"]')).toHaveCount(1)
  await expect(menu.locator('a[href="/notifications"]')).toHaveCount(1)
})
