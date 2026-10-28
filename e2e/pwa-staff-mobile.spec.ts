import { test, expect } from '@playwright/test'
import { mkdir } from 'node:fs/promises'

for (const viewport of [
  { width: 390, height: 844, name: 'iphone-390' },
  { width: 412, height: 915, name: 'android-412' },
  { width: 620, height: 920, name: 'edge-narrow-620' },
]) {
  test('Staff mobile cards keep readable layout and workflow at ' + viewport.name, async ({ page }) => {
    await page.setViewportSize(viewport)
    await page.goto('/staff', { waitUntil: 'domcontentloaded' })
    await expect(page.getByTestId('staff-page')).toBeVisible({ timeout: 60000 })
    await expect(page.getByTestId('staff-mobile-layout')).toBeVisible()
    await expect(page.getByTestId('staff-summary-grid')).toBeVisible()
    await expect(page.getByTestId('staff-mobile-search')).toBeVisible()
    await expect(page.getByRole('table')).toBeHidden()
    await expect(page.getByTestId('staff-initial-loading')).toHaveCount(0)
    const width = await page.evaluate(() => ({
      viewport: window.innerWidth,
      document: document.documentElement.scrollWidth,
    }))
    expect(width.document).toBeLessThanOrEqual(viewport.width + 1)
    const firstCard = page.locator('[data-testid^="staff-mobile-card-"]').first()
    await expect(firstCard).toBeVisible()
    await firstCard.scrollIntoViewIfNeeded()
    const cardBounds = await firstCard.boundingBox()
    if (!cardBounds) throw new Error('Staff card has no visible bounding box')
    expect(cardBounds.x).toBeGreaterThanOrEqual(-1)
    expect(cardBounds.x + cardBounds.width).toBeLessThanOrEqual(viewport.width + 1)
    await mkdir('test-results/pwa-dashboard', { recursive: true })
    await page.screenshot({
      path: 'test-results/pwa-dashboard/staff-card-' + viewport.name + '.png',
      animations: 'disabled',
    })
    await page.screenshot({
      path: 'test-results/pwa-dashboard/staff-' + viewport.name + '.png',
      fullPage: true,
      animations: 'disabled',
    })
  })
}

test('Staff desktop table stays accessible at 900px', async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 1100 })
  await page.goto('/staff', { waitUntil: 'domcontentloaded' })
  await expect(page.getByTestId('staff-page')).toBeVisible({ timeout: 60000 })
  await expect(page.getByTestId('staff-mobile-layout')).toBeHidden()
  await expect(page.getByRole('table').first()).toBeVisible()
})
