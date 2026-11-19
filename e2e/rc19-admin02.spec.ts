import { expect, test, type Page } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

async function useMockAdmin(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('livestream-ops-current-user', '1')
    localStorage.setItem('livestream-ops-language', 'en')
  })
  let role: 'admin' | 'leader' | 'member' = 'admin'
  let failUntilRetry = false
  let failureCount = 0
  await page.route('**/api/admin/workspace', async route => {
    if (failUntilRetry) {
      failureCount += 1
      await route.fulfill({ status: 500, json: { ok: false } })
      return
    }
    await route.fulfill({ status: role === 'admin' ? 200 : 403, json: { ok: role === 'admin' } })
  })
  return {
    setRole(next: 'admin' | 'leader' | 'member') { role = next },
    failUntilRetry() { failUntilRetry = true },
    recover() { failUntilRetry = false },
    failureCount() { return failureCount },
  }
}

test.describe('ADMIN-02 unified workspace', () => {
  test('Brand, Campaign, Product, SKU and resource deep links reuse the canonical BRAND-01 catalog', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('livestream-ops-current-user', '1'))
    const catalog = {
      brands: [{ id: 'brand-a', name: 'Demo Brand', status: 'active' }],
      campaigns: [{ id: 'campaign-a', name: 'Demo Campaign', brand_id: 'brand-a', status: 'active', start_date: '2026-10-01', end_date: '2026-10-31' }],
      products: [{ id: 'product-a', product_code: 'DEMO-1', name: 'Demo Product', lifecycle_status: 'active', version: 1 }],
      productBrands: [{ product_id: 'product-a', brand_id: 'brand-a' }],
      skus: [{ id: 'sku-a', product_id: 'product-a', sku_code: 'DEMO-1-S', variant_name: 'Small', size_or_package: '100ml', lifecycle_status: 'active', version: 1 }],
      campaignSkus: [{ campaign_id: 'campaign-a', sku_id: 'sku-a' }],
      schemes: [], knowledge: [],
      resourceLinks: [{ id: 'resource-link-a', resource_id: 'resource-a', product_id: 'product-a', relation_type: 'image' }],
      resources: [{ id: 'resource-a', title: 'Verified demo image', canonical_url: 'https://drive.google.com/file/d/demo-image', provider: 'google_drive', resource_type: 'image', verification_status: 'verified_metadata' }],
      scopes: [], skuPlatforms: [], platforms: [], knowledgeApprovals: [], users: [], auditEvents: [],
    }
    await page.route('**/api/brand-catalog**', route => route.fulfill({ json: { ok: true, ...catalog } }))
    await page.goto('/brand-catalog?brand_id=brand-a&campaign_id=campaign-a&product_id=product-a&sku_id=sku-a')
    await expect(page.getByLabel('Filter brand')).toHaveValue('brand-a')
    await expect(page.getByLabel('Filter campaign')).toHaveValue('campaign-a')
    await expect(page.getByRole('heading', { name: 'Demo Product' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'DEMO-1-S · Small · 100ml' })).toBeVisible()
    await page.getByRole('button', { name: /Demo Product/ }).click()
    await expect(page).toHaveURL(/product_id=product-a/)
    await page.getByRole('button', { name: /DEMO-1-S/ }).click()
    await expect(page).toHaveURL(/sku_id=sku-a/)
  })

  test('Admin can search, filter, follow existing workflows, and view responsive before/after evidence', async ({ page }) => {
    const evidence = path.resolve('artifacts/admin02')
    fs.mkdirSync(path.join(evidence, 'before'), { recursive: true })
    fs.mkdirSync(path.join(evidence, 'after'), { recursive: true })
    await useMockAdmin(page)
    const baselinePage = await page.context().newPage()
    await useMockAdmin(baselinePage)

    for (const width of [390, 768, 1440]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 960 })
      await baselinePage.setViewportSize({ width, height: width === 390 ? 844 : 960 })
      await baselinePage.goto('/brands')
      await expect(baselinePage.getByTestId('brands-page')).toBeVisible({ timeout: 20_000 })
      await baselinePage.screenshot({ path: path.join(evidence, 'before', `brands-${width}.png`), fullPage: true })
      await page.goto('/admin')
      await expect(page.getByTestId('admin-link-brands')).toBeVisible({ timeout: 20_000 })
      await expect(page.getByTestId('admin-link-brands')).toHaveAttribute('href', '/brands')
      await expect(page.getByTestId('admin-link-campaigns')).toHaveAttribute('href', '/campaigns')
      await expect(page.getByTestId('admin-link-products')).toHaveAttribute('href', '/brand-catalog')
      await expect(page.getByTestId('admin-link-resources')).toHaveAttribute('href', '/storage')
      await expect(page.getByTestId('admin-link-staff')).toHaveAttribute('href', '/staff')
      await expect(page.getByTestId('admin-link-role-defaults')).toHaveAttribute('href', '/settings?tab=system')
      await expect(page.getByTestId('admin-link-audit')).toHaveAttribute('href', '/audit')
      await expect(page.getByTestId('admin-pending-account-overrides')).toBeVisible()
      await page.screenshot({ path: path.join(evidence, 'after', `admin-${width}.png`), fullPage: true })
    }
    await baselinePage.close()

    await page.getByRole('textbox', { name: 'Search' }).fill('platforms')
    await expect(page.getByTestId('admin-link-platforms')).toBeVisible()
    await expect(page.getByTestId('admin-link-brands')).toHaveCount(0)
    await page.getByRole('textbox', { name: 'Search' }).fill('')
    await page.locator('#admin-workspace-group').selectOption('access')
    await expect(page.getByTestId('admin-link-staff')).toBeVisible()
    await expect(page.getByTestId('admin-link-brands')).toHaveCount(0)
    await page.getByRole('button', { name: 'Reset filters' }).click()
    await expect(page.getByTestId('admin-link-brands')).toBeVisible()
    await page.getByTestId('admin-link-role-defaults').click()
    await expect(page.getByTestId('rbac01-role-defaults')).toBeVisible()
    await expect(page.getByText('Chưa kích hoạt', { exact: true })).toBeVisible()
  })

  test('Leader and Member direct URL remain fail-closed and show no Admin destinations', async ({ page }) => {
    const mock = await useMockAdmin(page)
    await page.goto('/admin')
    await expect(page.getByTestId('admin-workspace')).toBeVisible()

    for (const role of ['leader', 'member'] as const) {
      mock.setRole(role)
      await page.evaluate(userId => {
        localStorage.setItem('livestream-ops-current-user', userId)
        window.dispatchEvent(new Event('livestream-ops-current-user-change'))
      }, role === 'leader' ? '2' : '3')
      await expect(page.getByText(/Only Admin accounts can access this workspace\.|This workspace is available to Admin accounts only\.|Chỉ tài khoản Admin/i)).toBeVisible()
      await expect(page.getByTestId('admin-link-brands')).toHaveCount(0)
    }
  })

  test('authorization service errors render retry state without exposing links', async ({ page }) => {
    const mock = await useMockAdmin(page)
    await page.goto('/admin')
    await expect(page.getByTestId('admin-link-brands')).toBeVisible()
    mock.failUntilRetry()
    await page.evaluate(() => window.dispatchEvent(new Event('livestream-ops-current-user-change')))
    await expect(page.getByText(/Admin access could not be verified|Không xác minh được quyền Admin/i)).toBeVisible()
    expect(mock.failureCount()).toBeGreaterThan(0)
    await expect(page.getByTestId('admin-link-brands')).toHaveCount(0)
    mock.recover()
    await page.getByRole('button', { name: /Please try again|Vui lòng thử lại/i }).click()
    await expect(page.getByTestId('admin-link-brands')).toBeVisible()
  })
})
