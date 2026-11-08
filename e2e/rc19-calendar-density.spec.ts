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
    await expect(monthEvent).not.toHaveClass(/h-7/)
    await expect(monthEvent).toHaveAttribute('title', /.+/)
    expect(await monthEvent.evaluate(element => Boolean(element.closest('[data-testid^="calendar-day-2026-"]')))).toBe(true)
    await fullMonth.evaluate(scroller => {
      const card = scroller.querySelector<HTMLElement>('[data-testid^="calendar-event-"]')!
      const scrollerRect = scroller.getBoundingClientRect()
      const cardRect = card.getBoundingClientRect()
      scroller.scrollLeft += cardRect.left - scrollerRect.left - (scroller.clientWidth - cardRect.width) / 2
    })
    if (width < 768) {
      await monthEvent.scrollIntoViewIfNeeded()
      await page.getByTestId('production-main-content').evaluate(main => {
        const card = document.querySelector<HTMLElement>('[data-testid^="calendar-event-"]')!
        const bottomNav = document.querySelector<HTMLElement>('[data-testid="production-bottom-nav"]')
        const mainRect = main.getBoundingClientRect()
        const cardRect = card.getBoundingClientRect()
        const navTop = bottomNav?.getBoundingClientRect().top ?? mainRect.bottom
        main.scrollTop += cardRect.top + cardRect.height / 2 - (mainRect.top + navTop) / 2
      })
    }
    const fields = await monthEvent.locator('[data-calendar-field]').evaluateAll(elements => elements.map(element => {
      const style = getComputedStyle(element)
      return {
        field: element.getAttribute('data-calendar-field'),
        text: element.textContent?.trim() || '',
        clipped: element.scrollHeight > element.clientHeight + 1 || element.scrollWidth > element.clientWidth + 1,
        singleLine: style.whiteSpace === 'nowrap',
        ellipsis: style.textOverflow === 'ellipsis',
        covered: (() => {
          const rect = element.getBoundingClientRect()
          const hit = document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
          return !hit || rect.left < 0 || rect.top < 0 || rect.right > innerWidth || rect.bottom > innerHeight || (!element.contains(hit) && !hit.contains(element))
        })(),
      }
    }))
    for (const field of ['time', 'brand', 'platform', 'status']) {
      const visibleField = fields.find(item => item.field === field)
      expect(visibleField?.text, `${field} should be present in the shift card`).toBeTruthy()
      expect(visibleField?.clipped, `${field} should not be clipped`).toBe(false)
      expect(visibleField?.singleLine, `${field} should wrap when needed`).toBe(false)
      expect(visibleField?.ellipsis, `${field} should not use ellipsis`).toBe(false)
      if (width < 768) expect(visibleField?.covered, `${field} should be fully visible in the viewport`).toBe(false)
    }
    const monthCards = await fullMonth.locator('[data-testid^="calendar-event-"]:visible').count()
    expect(monthCards).toBeGreaterThan(0)
    expect(await monthEvent.evaluate(element => element.scrollHeight <= element.clientHeight + 1)).toBe(true)
    const dimensions = await fullMonth.evaluate(element => ({
      viewportWidth: element.clientWidth,
      contentWidth: element.scrollWidth,
      pageWidth: document.documentElement.scrollWidth,
    }))
    expect(dimensions.pageWidth).toBeLessThanOrEqual(width)
    expect(dimensions.contentWidth).toBeGreaterThan(dimensions.viewportWidth)
    const cardBounds = await monthEvent.boundingBox()
    expect(cardBounds).not.toBeNull()
    expect(cardBounds!.y).toBeGreaterThanOrEqual(0)
    expect(cardBounds!.y + cardBounds!.height).toBeLessThanOrEqual(900)
    if (width < 768) {
      const navBounds = await page.getByTestId('production-bottom-nav').boundingBox()
      expect(navBounds).not.toBeNull()
      expect(cardBounds!.y + cardBounds!.height).toBeLessThanOrEqual(navBounds!.y + 1)
    }
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
