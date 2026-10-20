import { expect, test } from '@playwright/test'

async function assertNoViewportOverflow(page: import('@playwright/test').Page) {
  const widths = await page.evaluate(() => ({
    documentWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
  }))
  expect(widths.documentWidth, 'The page must not clip or scroll horizontally at the viewport').toBeLessThanOrEqual(widths.viewportWidth + 2)
}

test('G07 Live overview keeps shift selection and detail workflow discoverable', async ({ page }, info) => {
  await page.goto('/live')
  await expect(page.getByTestId('live-operations-workspace')).toBeVisible()
  await expect(page.getByTestId('live-kpi-overview')).toBeVisible()
  await expect(page.getByRole('region', { name: 'Chọn ca livestream' })).toBeVisible()
  await expect(page.getByRole('region', { name: 'Chi tiết ca đang chọn' })).toBeVisible()
  await page.getByRole('button', { name: /Bộ lọc|Filter/i }).first().click()
  await expect(page.locator('#live-filter-panel')).toBeVisible()
  const selector = page.getByTestId('live-shift-selector')
  if (await selector.isVisible()) {
    const first = selector.locator('[data-testid^="open-live-session-"]').first()
    await first.click()
    await expect(first).toHaveAttribute('aria-pressed', 'true')
  }
  await assertNoViewportOverflow(page)
  await page.screenshot({ path: info.outputPath('g07-live-workspace.png'), fullPage: true })
})

test('G08 Analytics uses active period, KPI hierarchy and mobile-ready report views', async ({ page }, info) => {
  await page.goto('/analytics')
  await expect(page.getByTestId('analytics-visual-header')).toBeVisible()
  await expect(page.getByTestId('analytics-period-tabs')).toBeVisible()
  await expect(page.getByTestId('analytics-kpi-overview')).toBeVisible()
  const toggle = page.getByRole('button', { name: /Bộ lọc|Filter/i }).first()
  await toggle.click()
  await expect(page.locator('#analytics-filter-panel')).toBeVisible()
  if (await page.getByTestId('analytics-report-list').isVisible()) {
    if (info.project.name === 'mobile') await expect(page.getByTestId('analytics-mobile-report-cards')).toBeVisible()
  } else {
    await expect(page.getByTestId('analytics-empty-state')).toBeVisible()
  }
  await assertNoViewportOverflow(page)
  await page.screenshot({ path: info.outputPath('g08-analytics-workspace.png'), fullPage: true })
})
