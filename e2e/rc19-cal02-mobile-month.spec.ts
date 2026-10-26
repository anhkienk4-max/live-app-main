import { expect, test } from '@playwright/test'

for (const language of ['vi', 'en'] as const) {
  for (const width of [260, 312, 320, 390, 430, 691, 768, 1024, 1440]) {
    test(`Month grid and day details at ${width}px (${language})`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 })
      await page.addInitScript(lang => {
        localStorage.setItem('livestream-ops-current-user', '1')
        localStorage.setItem('livestream-ops-language', lang)
      }, language)
      await page.goto('/calendar?tab=calendar&calendar_view=month&calendar_date=2026-10-14')
      const compact = page.getByTestId('calendar-compact-month-grid')
      const desktop = page.getByTestId('calendar-day-2026-10-27')
      if (width >= 1024) {
        await expect(desktop).toBeVisible()
        await expect(compact).toBeHidden()
        await desktop.getByRole('button').first().click()
      } else {
        await expect(compact).toBeVisible()
        await expect(compact).toHaveAttribute('aria-busy', 'false')
        const days = compact.locator('[data-testid^="calendar-compact-day-"]')
        await expect(days).toHaveCount(35)
        const boxes = await days.evaluateAll(elements => elements.slice(0, 8).map(element => {
          const { x, y, width } = element.getBoundingClientRect()
          return { x, y, width }
        }))
        expect(boxes.slice(0, 7).every(box => box.y === boxes[0].y)).toBe(true)
        expect(boxes.slice(1, 7).every((box, index) => box.x > boxes[index].x)).toBe(true)
        expect(boxes[7].y).toBeGreaterThan(boxes[0].y)
        expect(boxes.slice(0, 7).every(box => box.width > 0)).toBe(true)
        await expect(page.getByTestId('calendar-compact-day-2026-10-27')).toHaveAttribute('data-count', '2')
        await expect(page.getByTestId('calendar-compact-day-2026-09-27')).toBeVisible()
        await expect(compact.locator('[data-testid^="calendar-event-"]')).toHaveCount(0)
        await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
        await page.getByTestId('calendar-compact-day-2026-10-27').focus()
        await page.keyboard.press('Enter')
      }
      const dialog = page.getByRole('dialog')
      await expect(dialog).toBeVisible()
      await expect(dialog.locator('[data-testid^="day-session-view-shift-"]:visible')).toHaveCount(2)
      await page.keyboard.press('Escape')
      await expect(dialog).toBeHidden()
    })
  }
}

test('Mobile month navigation and view switching preserve the selected date', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.addInitScript(() => {
    localStorage.setItem('livestream-ops-current-user', '1')
    localStorage.setItem('livestream-ops-language', 'en')
  })
  await page.goto('/calendar?tab=calendar&calendar_view=month&calendar_date=2026-10-14')
  await expect(page.getByTestId('calendar-compact-month-grid')).toBeVisible()
  await page.getByRole('button', { name: 'Next', exact: true }).click()
  await expect(page.getByTestId('calendar-compact-day-2026-11-14')).toBeVisible()
  await page.getByRole('button', { name: 'Previous', exact: true }).click()
  await expect(page.getByTestId('calendar-compact-day-2026-10-14')).toBeVisible()
  for (const [label, view] of [['Week', 'week'], ['Day', 'day'], ['List', 'list'], ['Month', 'month']] as const) {
    await page.getByRole('button', { name: label, exact: true }).click()
    await expect(page).toHaveURL(new RegExp(`calendar_view=${view}`))
  }
  await expect(page.getByTestId('calendar-compact-month-grid')).toBeVisible()
})
