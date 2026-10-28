import { expect, test } from '@playwright/test'

// Responsive visual behavior only. Uses local seeded mock shifts, no Production API
// and no credentials. Authenticated Production Calendar UAT is separate.
for (const width of [390, 768, 1440]) {
  test('Month cards do not overflow and Week scroll is contained at '+width+'px', async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 })
    await page.addInitScript(() => {
      localStorage.setItem('livestream-ops-current-user', '1')
      localStorage.setItem('livestream-ops-language', 'vi')
    })
    await page.goto('/calendar')

    // Visual regression of a grid containing many real-world ca labels.
    await page.getByRole('button', { name: 'Tháng', exact: true }).click()
    if (width >= 1024) {
      // Desktop keeps the full MonthView cards.
      const monthEvent = page.locator('[data-testid^="calendar-event-"]:visible').first()
      await expect(monthEvent).toBeVisible({ timeout: 30_000 })
      await expect(monthEvent).toHaveClass(/h-7/)
      await expect(monthEvent).toHaveAttribute('title', /.+/)
      if (width === 1440) await page.screenshot({ path: info.outputPath('calendar-desktop.png'), caret: 'initial' })
      await monthEvent.click()
      await expect(page.getByRole('dialog')).toBeVisible()
      await page.keyboard.press('Escape')
    } else {
      await expect(page.getByTestId('calendar-compact-month-grid')).toBeVisible({timeout:30_000})
      expect(await page.locator('[data-testid^="calendar-compact-day-"]:visible').count()).toBeGreaterThanOrEqual(28)
      await expect(page.locator('[data-testid^="calendar-event-"]:visible')).toHaveCount(0)
      if (width === 390) await page.screenshot({ path: info.outputPath('calendar-mobile.png'), caret: 'initial' })
    }
    await expect.poll(() => page.evaluate(() =>
      document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)

    await page.getByRole('button', { name: 'Tuần', exact: true }).click()
    await expect.poll(() => page.evaluate(() =>
      document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
    const scroller = page.getByTestId('calendar-week-scroller')
    if (width >= 640) {
      await expect(scroller).toBeVisible()
      const dims = await scroller.evaluate(el => ({
        viewportWidth: el.clientWidth, contentWidth: el.scrollWidth,
      }))
      expect(dims.contentWidth).toBeGreaterThanOrEqual(1080)
      if (width === 768) expect(dims.contentWidth).toBeGreaterThan(dims.viewportWidth)
    } else {
      await expect(scroller).toBeHidden()
      await expect(page.locator('.sm\\:hidden').first()).toBeVisible()
    }
  })
}
