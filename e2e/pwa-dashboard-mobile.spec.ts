import { test, expect } from '@playwright/test'
import { mkdir } from 'node:fs/promises'

for (const viewport of [
  { width: 390, height: 844, name: 'iphone-390' },
  { width: 620, height: 920, name: 'edge-narrow-620' },
]) {
  test('RC19 authenticated dashboard uses PWA design at ' + viewport.name, async ({ page }) => {
    await page.setViewportSize(viewport)
    await page.goto('/', { waitUntil: 'domcontentloaded' })
    const mobile = page.getByTestId('ada-reference-mobile-home')
    await expect(mobile).toBeVisible({ timeout: 60000 })
    await expect(page.getByTestId('production-bottom-nav')).toBeVisible()
    await expect(page.getByTestId('ada-mobile-home-quick-links').getByRole('link')).toHaveCount(4)
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
