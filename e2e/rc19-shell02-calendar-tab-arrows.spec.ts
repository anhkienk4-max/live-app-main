import { expect, test } from '@playwright/test'

test.use({ launchOptions: { ignoreDefaultArgs: ['--hide-scrollbars'] } })

for (const [width, height] of [[1440, 900], [1366, 500], [1024, 600], [390, 700]]) {
  test(`SHELL-02 Calendar tabs have no stray arrows at ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height })
    await page.addInitScript(() => {
      localStorage.setItem('livestream-ops-current-user', '1')
      localStorage.setItem('livestream-ops-language', 'vi')
    })
    await page.goto('/calendar?tab=calendar', { waitUntil: 'load' })
    const wrapper = page.getByTestId('calendar-stable-tabs')
    const tabs = wrapper.getByRole('tab')
    await expect(wrapper).toBeVisible()
    await expect(page.getByTestId('production-sidebar').locator('nav button').first()).toBeEnabled({ timeout: 30_000 })
    expect(await tabs.count()).toBeGreaterThanOrEqual(5)

    const geometry = await wrapper.evaluate(element => {
      const rect = element.getBoundingClientRect()
      const point = { x: rect.right - 7, y: rect.top + rect.height / 2 }
      return {
        overflowX: getComputedStyle(element).overflowX,
        overflowY: getComputedStyle(element).overflowY,
        scrollbarWidth: element.offsetWidth - element.clientWidth,
        point,
        controlAtArrow: document.elementsFromPoint(point.x, point.y).some(node =>
          node.matches('button, input, [role="button"]') && node.getAttribute('role') !== 'tab'),
        edgeTabIndex: Array.from(element.querySelectorAll('[role="tab"]')).findIndex(tab => {
          const bounds = tab.getBoundingClientRect()
          return point.x >= bounds.left && point.x < bounds.right && point.y >= bounds.top && point.y < bounds.bottom
        }),
        pageWidth: document.documentElement.scrollWidth,
      }
    })
    expect(geometry.overflowX).toBe('auto')
    expect(geometry.overflowY).toBe('hidden')
    expect(geometry.scrollbarWidth).toBe(0)
    expect(geometry.controlAtArrow).toBe(false)
    expect(geometry.pageWidth).toBeLessThanOrEqual(width)

    const beforeUrl = page.url()
    await page.mouse.click(geometry.point.x, geometry.point.y)
    if (geometry.edgeTabIndex >= 0) {
      await expect(tabs.nth(geometry.edgeTabIndex)).toHaveAttribute('aria-selected', 'true')
    } else {
      expect(page.url()).toBe(beforeUrl)
    }
    await tabs.first().click()
    await expect(tabs.first()).toHaveAttribute('aria-selected', 'true')

    await tabs.first().focus()
    await page.keyboard.press('ArrowRight')
    await expect(tabs.nth(1)).toBeFocused()
    await tabs.nth(1).click()
    await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true')
    await expect(page).toHaveURL(/tab=open/)

    await wrapper.evaluate(element => {
      element.style.width = '220px'
      element.querySelector<HTMLElement>('[role="tablist"]')!.style.minWidth = '480px'
      element.scrollLeft = element.scrollWidth
    })
    expect(await wrapper.evaluate(element => element.scrollLeft)).toBeGreaterThan(0)
  })
}
