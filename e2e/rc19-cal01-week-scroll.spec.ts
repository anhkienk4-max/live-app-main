import { expect, test, type Page } from '@playwright/test'

async function weekGeometry(page: Page) {
  return page.evaluate(() => {
    const main = document.querySelector<HTMLElement>('[data-testid="production-main-content"]')!
    const scroller = document.querySelector<HTMLElement>('[data-testid="calendar-week-scroller"]')!
    const grid = Array.from(scroller.children).find(element => element.classList.contains('grid'))!
    const headers = Array.from(grid.children).slice(1, 8) as HTMLElement[]
    const body = grid.children[8] as HTMLElement
    const ruler = body.firstElementChild as HTMLElement
    const columns = Array.from(body.lastElementChild!.children) as HTMLElement[]
    const toolbar = document.querySelector<HTMLElement>('[data-testid="calendar-search"]')!.closest<HTMLElement>('.sticky')!
    const rect = (element: HTMLElement) => element.getBoundingClientRect()
    const coveredByToolbar = headers.every(header => {
      const day = rect(header)
      const tools = rect(toolbar)
      const top = Math.max(day.top, tools.top)
      const bottom = Math.min(day.bottom, tools.bottom)
      if (top >= bottom || day.right <= tools.left || day.left >= tools.right) return true
      const hit = document.elementFromPoint((Math.max(day.left, tools.left) + Math.min(day.right, tools.right)) / 2, (top + bottom) / 2)
      return hit !== null && toolbar.contains(hit)
    })
    return {
      mainTop: main.scrollTop,
      mainMax: main.scrollHeight - main.clientHeight,
      scrollerTop: scroller.scrollTop,
      scrollerHeight: scroller.scrollHeight,
      scrollerClientHeight: scroller.clientHeight,
      scrollerWidth: scroller.scrollWidth,
      scrollerClientWidth: scroller.clientWidth,
      scrollerLeft: scroller.scrollLeft,
      pageWidth: document.documentElement.scrollWidth,
      viewportWidth: window.innerWidth,
      coveredByToolbar,
      rulerRight: rect(ruler).right,
      headerLefts: headers.map(header => rect(header).left),
      columnLefts: columns.map(column => rect(column).left),
      headerRights: headers.map(header => rect(header).right),
      columnRights: columns.map(column => rect(column).right),
      dayLabels: headers.map(header => header.textContent?.trim()),
      hourLabels: Array.from(ruler.children).map(hour => hour.textContent?.trim()),
      shiftLabels: columns.flatMap(column => Array.from(column.querySelectorAll('button')).map(button => button.getAttribute('aria-label') ?? button.textContent?.trim())),
    }
  })
}

for (const width of [1800, 1635, 1440, 1366, 1152, 1024, 768, 390]) {
  test(`CAL-01 Week scroll geometry at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width === 1635 ? 927 : 900 })
    await page.addInitScript(() => {
      localStorage.setItem('livestream-ops-current-user', '1')
      localStorage.setItem('livestream-ops-language', 'en')
    })
    await page.goto('/calendar?calendar_view=week', { waitUntil: 'domcontentloaded' })
    const main = page.getByTestId('production-main-content')
    const scroller = page.getByTestId('calendar-week-scroller')

    if (width < 640) {
      await expect(scroller).toBeHidden()
      await expect(scroller.locator('xpath=following-sibling::div[1]')).toBeVisible()
      for (const fraction of [0, 0.5, 1]) {
        await main.evaluate((element, fraction) => { element.scrollTop = (element.scrollHeight - element.clientHeight) * fraction }, fraction)
        await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
      }
      return
    }

    await expect(scroller).toBeVisible()
    await expect(scroller.locator('xpath=ancestor::*[@aria-busy][1]')).toHaveAttribute('aria-busy', 'false')
    await expect.poll(async () => (await weekGeometry(page)).dayLabels[0]).toContain('Sunday')
    const baseline = await weekGeometry(page)
    expect(baseline.dayLabels).toHaveLength(7)
    expect(baseline.hourLabels.length).toBeGreaterThan(0)
    expect(baseline.shiftLabels.length).toBeGreaterThan(0)
    expect(baseline.scrollerHeight).toBeLessThanOrEqual(baseline.scrollerClientHeight + 1)
    expect(baseline.pageWidth).toBeLessThanOrEqual(width + 1)
    expect(Math.abs(baseline.headerLefts[0] - baseline.rulerRight)).toBeLessThanOrEqual(1)

    for (const fraction of [0, 0.25, 0.5, 0.75, 1]) {
      await main.evaluate((element, fraction) => { element.scrollTop = (element.scrollHeight - element.clientHeight) * fraction }, fraction)
      const data = await weekGeometry(page)
      expect(data.coveredByToolbar).toBe(true)
      expect(data.scrollerTop).toBe(0)
      expect(data.pageWidth).toBeLessThanOrEqual(width + 1)
      expect(data.dayLabels).toEqual(baseline.dayLabels)
      expect(data.hourLabels).toEqual(baseline.hourLabels)
      expect(data.shiftLabels).toEqual(baseline.shiftLabels)
      for (let day = 0; day < 7; day++) {
        expect(Math.abs(data.headerLefts[day] - data.columnLefts[day])).toBeLessThanOrEqual(1)
        expect(Math.abs(data.headerRights[day] - data.columnRights[day])).toBeLessThanOrEqual(1)
      }
    }

    if (baseline.scrollerWidth > baseline.scrollerClientWidth) {
      await scroller.evaluate(element => { element.scrollLeft = element.scrollWidth - element.clientWidth })
      const data = await weekGeometry(page)
      expect(data.scrollerLeft).toBeGreaterThan(0)
      for (let day = 0; day < 7; day++) {
        expect(Math.abs(data.headerLefts[day] - data.columnLefts[day])).toBeLessThanOrEqual(1)
        expect(Math.abs(data.headerRights[day] - data.columnRights[day])).toBeLessThanOrEqual(1)
      }
    }
  })
}
