import { expect, test } from '@playwright/test'

test.use({ launchOptions: { ignoreDefaultArgs: ['--hide-scrollbars'] } })

for (const [width, height] of [[1440, 900], [1366, 768], [1366, 500], [1024, 600]]) {
  test(`SHELL-01 sidebar remains scrollable at ${width}x${height}`, async ({ page }) => {
    await page.setViewportSize({ width, height })
    await page.addInitScript(() => {
      localStorage.setItem('livestream-ops-current-user', '1')
      localStorage.setItem('livestream-ops-language', 'en')
    })
    await page.goto('/calendar', { waitUntil: 'load' })

    const sidebar = page.getByTestId('production-sidebar')
    const nav = sidebar.locator('nav')
    await expect(sidebar).toBeVisible()
    await expect(nav.locator('button').first()).toBeEnabled({ timeout: 30_000 })
    const geometry = await nav.evaluate(element => {
      const aside = element.closest('aside')!
      const brand = aside.querySelector('[data-testid="production-sidebar-brand"]')!
      const profile = aside.querySelector('[data-testid="production-sidebar-profile"]')!
      return {
        overflow: getComputedStyle(element).overflowY,
        scrollbarStyle: getComputedStyle(element).scrollbarWidth,
        scrollbarWidth: element.offsetWidth - element.clientWidth,
        scrollMax: element.scrollHeight - element.clientHeight,
        navTop: element.getBoundingClientRect().top,
        navBottom: element.getBoundingClientRect().bottom,
        brandBottom: brand.getBoundingClientRect().bottom,
        profileTop: profile.getBoundingClientRect().top,
        profileBottom: profile.getBoundingClientRect().bottom,
      }
    })
    expect(geometry.overflow).toBe('auto')
    expect(geometry.scrollbarStyle).toBe('thin')
    expect(geometry.scrollMax).toBeGreaterThan(0)
    if (geometry.scrollbarWidth > 0) expect(geometry.scrollbarWidth).toBeLessThan(15)
    expect(geometry.navTop).toBe(geometry.brandBottom)
    expect(geometry.navBottom).toBe(geometry.profileTop)
    expect(geometry.profileBottom).toBe(height)

    const lastLink = nav.locator('a').last()
    await nav.hover()
    await page.mouse.wheel(0, height * 2)
    await expect.poll(() => nav.evaluate(element => element.scrollTop)).toBeGreaterThan(0)
    await nav.evaluate(element => { element.scrollTop = element.scrollHeight })
    await expect(lastLink).toBeInViewport()
    await nav.evaluate(element => { element.scrollTop = 0 })
    await nav.locator('button').first().focus()
    for (let i = 0; i < 40 && !(await lastLink.evaluate(element => element === document.activeElement)); i++) {
      await page.keyboard.press('Tab')
    }
    await expect(lastLink).toBeFocused()
    await expect(lastLink).toBeInViewport()
    expect(await nav.evaluate(element => element.scrollTop)).toBeGreaterThan(0)
    expect(await page.evaluate(() => document.documentElement.scrollHeight - document.documentElement.clientHeight)).toBe(0)
  })
}

test.describe('responsive navigation drawer', () => {
  test.use({ hasTouch: true })
  for (const [width, height] of [[768, 700], [390, 700]]) {
    test(`SHELL-01 uses the existing navigation drawer at ${width}x${height}`, async ({ page }) => {
      await page.setViewportSize({ width, height })
      await page.goto('/calendar', { waitUntil: 'load' })
      await expect(page.getByTestId('production-sidebar')).toBeHidden()
      await expect(page.getByTestId('production-sidebar').locator('nav button').first()).toBeEnabled({ timeout: 30_000 })
      const trigger = width < 768
        ? page.getByTestId('nav-menu-more')
        : page.getByTestId('production-topbar').getByRole('button', { name: /Main navigation|Thanh điều hướng chính/ })
      await trigger.tap()
      const drawer = page.getByTestId('grouped-navigation-drawer')
      await expect(drawer).toBeVisible()
      await expect(drawer.locator('a').last()).toBeVisible()
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
    })
  }
})
