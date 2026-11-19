import { expect, test } from '@playwright/test'

for (const { width, language } of [{ width: 390, language: 'vi' }, { width: 1440, language: 'en' }]) {
  test(`Shift List date, search and server page at ${width}px (${language})`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.addInitScript(language => {
      localStorage.setItem('livestream-ops-current-user', '1')
      localStorage.setItem('livestream-ops-language', language)
    }, language)
    await page.goto('/shifts')
    if (width < 768) await expect(page.getByTestId('shifts-mobile-container')).toBeVisible()
    else await expect(page.getByTestId('data-table-search-input')).toBeVisible()
    const mode = page.getByTestId(width < 768 ? 'shifts-mobile-date-mode' : 'shifts-desktop-date-mode')
    await mode.selectOption('month')
    await page.getByTestId('shifts-month-input').filter({ visible: true }).fill('2026-10')
    expect(new URL(page.url()).searchParams.get('shifts_range')).toBeNull()
    await page.getByTestId('shifts-date-apply').filter({ visible: true }).click()
    await expect.poll(() => new URL(page.url()).searchParams.get('shifts_month')).toBe('2026-10')
    await expect.poll(async () => {
      const summary = await page.locator('h1').first().locator('..').locator('p').textContent()
      const total = Number(summary?.match(/\d+/)?.[0] ?? 0)
      const rendered = await (width < 768 ? page.locator('[data-testid^="shift-mobile-card-"]') : page.locator('[data-testid^="data-table-row-"]')).count()
      return total > 0 && rendered === total
    }).toBe(true)
    await page.screenshot({ path: `docs/handoffs/evidence/rc19-u05-shifts-after-${width}.png`, caret: 'initial' })

    await mode.selectOption('custom')
    await page.getByTestId('shifts-from-input').filter({ visible: true }).fill('2026-10-24')
    await page.getByTestId('shifts-to-input').filter({ visible: true }).fill('2026-10-25')
    await page.getByTestId('shifts-date-apply').filter({ visible: true }).click()
    await expect.poll(() => new URL(page.url()).searchParams.get('shifts_from')).toBe('2026-10-24')
    expect(new URL(page.url()).searchParams.get('shifts_to')).toBe('2026-10-25')
    await mode.selectOption('month')
    await page.getByTestId('shifts-date-apply').filter({ visible: true }).click()

    const search = page.getByTestId(width < 768 ? 'shifts-mobile-search' : 'data-table-search-input')
    await search.click()
    await search.pressSequentially('Fashion', { delay: 25 })
    await expect.poll(() => new URL(page.url()).searchParams.get('shifts_search')).toBe('Fashion')
    await expect(search).toBeFocused()
    await expect.poll(() => width < 768 ? page.locator('[data-testid^="shift-mobile-card-"]').count() : page.locator('[data-testid^="data-table-row-"]').count()).toBe(1)

    await page.goto('/shifts?shifts_range=month&shifts_month=2026-10&shifts_page=99')
    await expect.poll(() => new URL(page.url()).searchParams.get('shifts_page')).toBe('1')
    if (width >= 768) {
      await page.getByTestId('shift-row-checkbox').first().click()
      await expect(page.getByTestId('bulk-selected-badge')).toBeVisible()
    }
    const status = page.getByTestId(width < 768 ? 'shifts-mobile-status-filter' : 'shifts-desktop-status-filter')
    await status.selectOption('completed')
    await expect.poll(() => new URL(page.url()).searchParams.get('shifts_status')).toBe('completed')
    expect(new URL(page.url()).searchParams.get('shifts_page')).toBeNull()
    if (width >= 768) await expect(page.getByTestId('bulk-selected-badge')).toHaveCount(0)
    await page.getByTestId(width < 768 ? 'shifts-mobile-sort' : 'shifts-desktop-sort').click()
    await expect.poll(() => new URL(page.url()).searchParams.get('shifts_sort')).toBe('asc')
  })
}
