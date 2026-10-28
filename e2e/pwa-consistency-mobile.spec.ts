import { test, expect } from '@playwright/test'
import { mkdir } from 'node:fs/promises'

// Local mock visual QA, never a replacement for three-role Staging UAT.
const pages = [
  { path: '/calendar', name: 'calendar' },
  { path: '/reports', name: 'reports' },
  { path: '/shifts', name: 'shifts' },
  { path: '/staff', name: 'staff' },
  { path: '/settings', name: 'settings' },
  { path: '/profile', name: 'profile' },
  { path: '/payroll', name: 'payroll' },
  { path: '/workforce', name: 'workforce' },
  { path: '/analytics', name: 'analytics' },
  { path: '/storage', name: 'storage' },
  { path: '/notifications', name: 'notifications' },
] as const

for (const route of pages) {
  for (const viewport of [
    { width: 390, height: 844, name: 'iphone' },
    { width: 620, height: 920, name: 'edge-narrow' },
  ]) {
    test('PWA consistency: ' + route.name + ' at ' + viewport.name, async ({ page }) => {
      test.skip(route.name === 'payroll' || route.name === 'workforce', 'BLOCKED: mock auth cannot verify Payroll/Workforce role-capability layout; use credentialed Staging UAT')
      await page.setViewportSize(viewport)
      await page.goto(route.path, { waitUntil: 'domcontentloaded' })
      const workspace = page.locator('.ada-workspace-page').first()
      await expect(workspace).toBeVisible({ timeout: 60000 })
      await expect(page.getByTestId('production-bottom-nav')).toBeVisible()
      // Do not sign off a screenshot of a spinner or auth-capability loading shell.
      if (route.name === 'reports') {
        await expect(page.getByTestId('reports-apply-filters')).toBeAttached({ timeout: 45000 })
        await expect(page.locator('#created-reports-heading')).toBeVisible()
        await expect(page.getByTestId('reports-mobile-metrics')).toBeVisible()
      }
      if (route.name === 'payroll' || route.name === 'workforce') {
        await expect(page.getByText(/Đang xác minh phiên đăng nhập và quyền truy cập/)).toBeHidden({ timeout: 45000 })
      }
      if (route.name === 'calendar') {
        const tabs = page.getByTestId('calendar-stable-tabs').locator('[data-slot="tabs-list"]')
        await expect(tabs).toBeVisible({ timeout: 45000 })
        const layout = await tabs.evaluate(element => ({
          wrap: getComputedStyle(element).flexWrap,
          height: element.getBoundingClientRect().height,
        }))
        expect(layout.wrap).toBe('nowrap')
        expect(layout.height, 'Calendar tabs should occupy one row').toBeLessThanOrEqual(56)
      }
      const metrics = await page.evaluate(() => {
        const root = document.querySelector('.ada-workspace-page')
        const h1 = root?.querySelector('h1')
        return {
          documentWidth: document.documentElement.scrollWidth,
          pageWidth: root?.getBoundingClientRect().width ?? 0,
          headingSize: h1 ? Number.parseFloat(getComputedStyle(h1).fontSize) : null,
        }
      })
      expect(metrics.documentWidth, route.name + ' viewport overflow').toBeLessThanOrEqual(viewport.width + 1)
      expect(metrics.pageWidth).toBeGreaterThan(0)
      if (metrics.headingSize !== null) {
        expect(metrics.headingSize).toBeGreaterThanOrEqual(18)
        expect(metrics.headingSize).toBeLessThanOrEqual(23)
      }
      if (viewport.width === 390 && ['calendar','reports','profile','payroll','workforce'].includes(route.name)) {
        await mkdir('test-results/pwa-dashboard', { recursive: true })
        await page.screenshot({
          path: 'test-results/pwa-dashboard/consistency-' + route.name + '.png',
          fullPage: true,
          animations: 'disabled',
        })
      }
    })
  }
  test('PWA desktop preserved: ' + route.name, async ({ page }) => {
    test.skip(route.name === 'payroll' || route.name === 'workforce', 'BLOCKED: capability pages require Staging identity to verify their business UI')
    await page.setViewportSize({ width: 900, height: 1100 })
    await page.goto(route.path, { waitUntil: 'domcontentloaded' })
    await expect(page.locator('.ada-workspace-page').first()).toBeVisible({ timeout: 60000 })
    await expect(page.getByTestId('production-bottom-nav')).toBeHidden()
  })
}
