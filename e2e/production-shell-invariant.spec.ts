import { expect, test } from '@playwright/test'
import { readEnvIdentities, loginWithCredentials } from './harness/core-v1-harness.ts'

const admin = readEnvIdentities().admin
const desktopRoutes = [
  '/reports', '/live', '/analytics', '/calendar', '/calendar?tab=import',
  '/shifts', '/staff', '/staffing', '/staffing?tab=registration', '/swaps',
  '/notifications', '/audit', '/settings', '/reports',
]

async function frameGeometry(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const rect = (selector: string) => {
      const element = document.querySelector<HTMLElement>(selector)
      if (!element) return null
      const box = element.getBoundingClientRect()
      return { x: box.x, width: box.width, height: box.height, background: getComputedStyle(element).backgroundColor }
    }
    return {
      sidebar: rect('[data-testid="production-sidebar"]'),
      profile: rect('[data-testid="production-sidebar-profile"]'),
      topbar: rect('[data-testid="production-topbar"]'),
      main: rect('[data-testid="production-main-content"]'),
      bottomNav: rect('[data-testid="production-bottom-nav"]'),
      viewportWidth: window.innerWidth,
      documentWidth: document.documentElement.scrollWidth,
    }
  })
}

test.describe('persistent production app frame', () => {
  test.skip(!admin, 'Admin staging credentials are not configured.')

  test('frame geometry remains fixed across protected route transitions at desktop', async ({ page }, testInfo) => {
    test.setTimeout(240_000)
    await page.setViewportSize({ width: 1440, height: 1024 })
    await loginWithCredentials(page, admin!.email, admin!.password)

    let baseline: Awaited<ReturnType<typeof frameGeometry>> | undefined
    for (const [index, route] of desktopRoutes.entries()) {
      await page.goto(route, { waitUntil: 'domcontentloaded' })
      await expect(page.getByTestId('production-sidebar')).toBeVisible()
      await expect(page.getByTestId('production-topbar')).toBeVisible()

      const immediate = await frameGeometry(page)
      const slug = route.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '')
      await page.screenshot({ path: testInfo.outputPath(`${String(index + 1).padStart(2, '0')}-${slug}-immediate.png`) })
      await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
      const settled = await frameGeometry(page)
      await page.screenshot({ path: testInfo.outputPath(`${String(index + 1).padStart(2, '0')}-${slug}-settled.png`) })
      expect(immediate.sidebar).toMatchObject({ x: 0, width: 248, background: 'rgb(8, 39, 67)' })
      expect(immediate.topbar?.height).toBe(56)
      expect(immediate.main?.x).toBe(248)
      expect(settled).toEqual(immediate)
      expect(settled.documentWidth).toBeLessThanOrEqual(settled.viewportWidth)
      if (baseline) {
        expect(settled.sidebar).toEqual(baseline.sidebar)
        expect(settled.profile).toEqual(baseline.profile)
        expect(settled.topbar?.height).toBe(baseline.topbar?.height)
        expect(settled.main?.x).toBe(baseline.main?.x)
      } else baseline = settled
    }

    // Shift detail is a modal in the current production route model, not a /shifts/[id] route.
    await page.goto('/shifts', { waitUntil: 'domcontentloaded' })
    const firstShift = page.locator('[data-testid="shifts-page"] tbody tr button').first()
    await expect(firstShift).toBeVisible()
    await firstShift.click()
    await expect(page.getByTestId('shift-detail-modal')).toBeVisible()
    expect(await frameGeometry(page)).toEqual(baseline)
    await page.screenshot({ path: testInfo.outputPath('shift-detail-modal.png') })
  })

  test('navigation geometry is stable at tablet and mobile widths', async ({ page }) => {
    test.setTimeout(180_000)
    await loginWithCredentials(page, admin!.email, admin!.password)
    const routes = ['/reports', '/live', '/calendar?tab=import', '/shifts', '/audit', '/settings']
    for (const width of [1280, 768, 430, 390, 375]) {
      await page.setViewportSize({ width, height: width >= 768 ? 900 : 844 })
      let baseline: Awaited<ReturnType<typeof frameGeometry>> | undefined
      for (const route of routes) {
        await page.goto(route, { waitUntil: 'domcontentloaded' })
        await expect(page.getByTestId('production-topbar')).toBeVisible()
        const geometry = await frameGeometry(page)
        expect(geometry.documentWidth).toBeLessThanOrEqual(width)
        if (width >= 1024) {
          expect(geometry.sidebar).toMatchObject({ x: 0, width: 248, background: 'rgb(8, 39, 67)' })
          expect(geometry.topbar?.height).toBe(56)
          expect(geometry.main?.x).toBe(248)
        } else {
          expect(geometry.sidebar).toBeNull()
          expect(geometry.topbar?.height).toBe(56)
        }
        if (baseline) {
          expect(geometry.sidebar).toEqual(baseline.sidebar)
          expect(geometry.topbar).toEqual(baseline.topbar)
          expect(geometry.main?.x).toBe(baseline.main?.x)
          expect(geometry.bottomNav).toEqual(baseline.bottomNav)
        } else baseline = geometry
      }
    }
  })
})
