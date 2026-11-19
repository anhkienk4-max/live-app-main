import { expect, test } from '@playwright/test'

for (const width of [320, 768]) {
  test(`Brand and platform controls remain usable at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.addInitScript(() => {
      localStorage.setItem('livestream-ops-current-user', '1')
      localStorage.setItem('livestream-ops-language', 'vi')
    })
    await page.goto('/shifts?shifts_range=all')
    const layout = width < 768 ? 'mobile' : 'desktop'
    const brand = page.getByTestId(`shifts-${layout}-brand-filter`)
    const platform = page.getByTestId(`shifts-${layout}-platform-filter`)
    await expect(brand.locator('option[value="b1"]')).toHaveCount(1)
    await brand.focus()
    await expect(brand).toBeFocused()
    await brand.selectOption('b1')
    await platform.selectOption('p1')
    await expect(page.locator('h1').first().locator('..').locator('p')).toContainText('2')
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
  })
}
