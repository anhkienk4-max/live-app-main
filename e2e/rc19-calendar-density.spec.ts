import { expect, test } from '@playwright/test'

// Responsive visual behavior only. Uses local seeded mock shifts, no Production API
// and no credentials. Authenticated Production Calendar UAT is separate.
for (const width of [375, 390, 430, 768, 1440]) {
  test('Full Month cards render and Week scroll stays contained at '+width+'px', async ({ page }, info) => {
    await page.setViewportSize({ width, height: 900 })
    await page.addInitScript(() => {
      localStorage.setItem('livestream-ops-current-user', '1')
      localStorage.setItem('livestream-ops-language', 'vi')
    })
    await page.goto('/calendar?calendar_view=month&calendar_date=2026-11-15')

    const fullMonth = page.getByTestId('calendar-full-month-view')
    await expect(fullMonth).toBeVisible({ timeout: 30_000 })
    await expect(page.getByTestId('calendar-compact-month-view')).toBeHidden()
    expect(await page.locator('[data-testid^="calendar-day-2026-"]:visible').count()).toBeGreaterThanOrEqual(28)

    const monthEvent = page.locator('[data-testid^="calendar-event-"]:visible').first()
    await expect(monthEvent).toBeVisible({ timeout: 30_000 })
    await expect(monthEvent).toHaveClass(/h-7/)
    await expect(monthEvent).toHaveAttribute('title', /.+/)
    expect(await monthEvent.evaluate(element => Boolean(element.closest('[data-testid^="calendar-day-2026-"]')))).toBe(true)
    const dimensions = await fullMonth.evaluate(element => ({
      viewportWidth: element.clientWidth,
      contentWidth: element.scrollWidth,
      pageWidth: document.documentElement.scrollWidth,
    }))
    expect(dimensions.pageWidth).toBeLessThanOrEqual(width)
    if (width < 768) expect(dimensions.contentWidth).toBeGreaterThan(dimensions.viewportWidth)
    await monthEvent.scrollIntoViewIfNeeded()
    await page.screenshot({ path: info.outputPath('calendar-' + width + '.png'), caret: 'initial' })

    await monthEvent.click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.keyboard.press('Escape')

    if (width < 768) {
      const lastDay = page.locator('[data-testid^="calendar-day-2026-"]').last()
      const bottomNav = page.getByTestId('production-bottom-nav')
      await lastDay.scrollIntoViewIfNeeded()
      const [dayBounds, navBounds] = await Promise.all([
        lastDay.boundingBox(),
        bottomNav.boundingBox(),
      ])
      expect(dayBounds).not.toBeNull()
      expect(navBounds).not.toBeNull()
      expect(dayBounds!.y + dayBounds!.height).toBeLessThanOrEqual(navBounds!.y + 1)
    }

    await expect.poll(() => page.evaluate(() =>
      document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)

    await page.getByRole('button', { name: 'Tuần', exact: true }).click()
    await expect.poll(() => page.evaluate(() =>
      document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
    const scroller = page.getByTestId('calendar-week-scroller')
    await expect(scroller).toBeVisible()
    const dims = await scroller.evaluate(el => ({
      viewportWidth: el.clientWidth, contentWidth: el.scrollWidth,
    }))
    expect(dims.contentWidth).toBeGreaterThanOrEqual(1080)
    if (width <= 768) expect(dims.contentWidth).toBeGreaterThan(dims.viewportWidth)
  })
}
