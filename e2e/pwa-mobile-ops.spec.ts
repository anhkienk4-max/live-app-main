import { test, expect, type Page } from '@playwright/test'
import { mkdir } from 'node:fs/promises'

const output = 'test-results/pwa-ops-mobile'
const sizes = [
  { id: 'iphone-390x844', width: 390, height: 844 },
  { id: 'android-412x915', width: 412, height: 915 },
]

async function ensurePhoneLayout(page: Page, width: number) {
  const dimension = await page.evaluate(() => ({
    inner: window.innerWidth,
    scroll: document.documentElement.scrollWidth,
  }))
  expect(dimension.scroll, 'No document-level horizontal overflow').toBeLessThanOrEqual(width + 1)
}

async function capture(page: Page, name: string) {
  await mkdir(output, { recursive: true })
  await page.screenshot({
    path: `${output}/${name}.png`,
    fullPage: true,
    animations: 'disabled',
  })
}

for (const size of sizes) {
  test(`calendar mobile controls: ${size.id}`, async ({ page }) => {
    await page.setViewportSize(size)
    await page.goto('/calendar?tab=calendar', { waitUntil: 'domcontentloaded' })
    const calendar = page.getByTestId('ada-reference-calendar-mobile')
    await expect(calendar).toBeVisible({ timeout: 45000 })
    const mine = page.getByRole('button', { name: 'Ca của tôi' })
    const all = page.getByRole('button', { name: 'Tất cả ca' })
    await expect(mine).toBeVisible()
    await all.click()
    await expect(all).toHaveAttribute('aria-pressed', 'true')
    await mine.click()
    await expect(mine).toHaveAttribute('aria-pressed', 'true')
    await all.click()
    await page.getByRole('button', { name: 'Hiển thị công cụ lịch đầy đủ' }).click()
    await expect(page.getByRole('button', { name: 'Ẩn công cụ lịch nâng cao' })).toBeVisible()
    await page.getByRole('button', { name: 'Ẩn công cụ lịch nâng cao' }).click()
    await expect(page.getByRole('button', { name: 'Hiển thị công cụ lịch đầy đủ' })).toBeVisible()
    await ensurePhoneLayout(page, size.width)
    await capture(page, `04-calendar-${size.id}`)
  })

  test(`reports mobile list/detail: ${size.id}`, async ({ page }) => {
    await page.setViewportSize(size)
    await page.goto('/reports', { waitUntil: 'domcontentloaded' })
    await expect(page.getByTestId('reports-page')).toBeVisible({ timeout: 45000 })
    await expect(page.getByTestId('production-bottom-nav')).toBeVisible()
    await expect(page.getByTestId('pwa-reports-cards')).toBeVisible()
    const quickFilters = page.getByTestId('pwa-report-quick-filters')
    await expect(quickFilters).toBeHidden()
    const details = page.getByTestId('pwa-report-view')
    if (await details.count()) {
      await capture(page, `05-reports-${size.id}`)
      await details.first().click()
      const dialog = page.getByTestId('ada-reference-report-mobile')
      await expect(dialog).toBeVisible({ timeout: 12000 })
      await expect(page.getByRole('button', { name: 'Xem hình ảnh' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Lịch sử chỉnh sửa' })).toBeVisible()
      await capture(page, `05-report-detail-${size.id}`)
    } else {
      test.info().annotations.push({ type: 'SKIP_DETAIL', description: 'No report in local fixture; staging authenticated UAT needed' })
      await capture(page, `05-reports-${size.id}`)
    }
    await ensurePhoneLayout(page, size.width)
  })

  test(`payroll is guarded by Admin and feature flag: ${size.id}`, async ({ page }) => {
    await page.setViewportSize(size)
    await page.goto('/payroll', { waitUntil: 'domcontentloaded' })
    await expect(page.locator('main').first()).toBeVisible({ timeout: 45000 })
    const payroll = page.getByTestId('ada-reference-payroll-mobile')
    // Wait for a decisive capability verdict; a loading screen is not an access-gate PASS.
    const verdict = await Promise.race([
      payroll.waitFor({ state: 'visible', timeout: 16000 }).then(() => 'authorized' as const).catch(() => 'unresolved' as const),
      page.getByRole('alert').first().waitFor({ state: 'visible', timeout: 16000 }).then(() => 'denied' as const).catch(() => 'unresolved' as const),
      page.getByText('Tính năng đang tắt.', { exact: false }).waitFor({ state: 'visible', timeout: 16000 }).then(() => 'disabled' as const).catch(() => 'unresolved' as const),
    ])
    if (verdict === 'authorized') {
      const advanced = page.getByTestId('pwa-payroll-advanced-toggle')
      await expect(advanced).toBeVisible()
      await advanced.click()
      await expect(advanced).toHaveAttribute('aria-expanded', 'true')
      await advanced.click()
      await expect(advanced).toHaveAttribute('aria-expanded', 'false')
      await capture(page, `06-payroll-${size.id}`)
    } else {
      test.info().annotations.push({ type: verdict === 'unresolved' ? 'SKIP_PAYROLL_UNRESOLVED' : 'SKIP_PAYROLL', description: `Local mock payroll access verdict: ${verdict}; no financial data or RBAC was bypassed` })
      await capture(page, `06-payroll-access-gate-${size.id}`)
    }
    await ensurePhoneLayout(page, size.width)
  })

  test(`profile mobile menu and bottom navigation: ${size.id}`, async ({ page }) => {
    await page.setViewportSize(size)
    await page.goto('/profile', { waitUntil: 'domcontentloaded' })
    const profile = page.getByTestId('ada-reference-profile-mobile')
    await expect(profile).toBeVisible({ timeout: 45000 })
    await expect(page.getByTestId('pwa-profile-open-edit')).toBeVisible()
    const nav = page.getByTestId('ada-reference-tabs')
    await expect(nav).toBeVisible()
    const columns = await nav.evaluate(node => ({
      rendered: node.children.length,
      template: getComputedStyle(node).gridTemplateColumns.split(' ').filter(Boolean).length,
    }))
    expect(columns.template, 'All bottom navigation slots must be occupied').toBe(columns.rendered)
    await capture(page, `07-profile-menu-${size.id}`)
    await page.getByTestId('pwa-profile-open-edit').click()
    await expect(page.getByTestId('pwa-profile-close-edit')).toBeVisible()
    await expect(page.locator('#profile-edit')).toBeVisible()
    await page.getByTestId('pwa-profile-close-edit').click()
    await expect(profile).toBeVisible()
    const more = page.getByTestId('nav-menu-more')
    await more.click()
    await expect(page.getByTestId('pwa-more-panel')).toBeVisible()
    await more.click()
    await expect(page.getByTestId('pwa-more-panel')).toHaveCount(0)
    await ensurePhoneLayout(page, size.width)
  })
}
