import { expect, test, type Page } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

type Body = Record<string, unknown>
const initialCatalog = {
  brands: [{ id: 'brand-a', name: 'Demo Brand', status: 'active', logo_url: 'https://assets.example.test/demo-brand.png', description: 'Mock authorized brand', brand_guideline: 'Approved voice guidance', mandatory_claims: ['Synthetic claim'], restricted_claims: [] }, { id: 'brand-b', name: 'Second Demo Brand', status: 'active', description: 'Second synthetic brand' }],
  campaigns: [{ id: 'campaign-a', name: 'Demo Campaign', brand_id: 'brand-a', start_date: '2026-10-01', end_date: '2026-10-31', status: 'active', platform_ids: ['platform-a'], notes: 'Synthetic campaign' }],
  products: [{ id: 'product-a', product_code: 'DEMO-1', name: 'Demo Product', category: 'Care', description: 'Synthetic test fixture', lifecycle_status: 'active', version: 1 }],
  productBrands: [{ product_id: 'product-a', brand_id: 'brand-a' }],
  skus: [{ id: 'sku-a', product_id: 'product-a', sku_code: 'DEMO-1-S', variant_name: 'Small', size_or_package: '100ml', lifecycle_status: 'active', version: 1 }],
  campaignSkus: [],
  schemes: [],
  knowledge: [],
  resourceLinks: [{ id: 'resource-link-a', resource_id: 'resource-a', product_id: 'product-a', relation_type: 'image' }],
  resources: [{ id: 'resource-a', title: 'Verified demo image', canonical_url: 'https://drive.google.com/file/d/demo-image', provider: 'google_drive', resource_type: 'image', visibility: 'admin_only', verification_status: 'verified_metadata', is_active: true }],
  scopes: [],
  skuPlatforms: [{ sku_id: 'sku-a', platform_id: 'platform-a', external_sku_id: 'EXT-1' }],
  platforms: [{ id: 'platform-a', name: 'Example Platform', status: 'active' }],
  knowledgeApprovals: [],
  auditEvents: [],
  users: [{ id: 'leader-user', full_name: 'Demo Leader', system_permission: 'leader' }, { id: 'member-user', full_name: 'Demo Member', system_permission: 'member' }],
}

async function setMockUser(page: Page, id: string) {
  await page.addInitScript(userId => {
    localStorage.setItem('livestream-ops-current-user', userId)
    localStorage.setItem('livestream-ops-language', 'en')
  }, id)
}

async function mockCatalog(page: Page, role: 'admin' | 'leader' | 'member', productCount = 1) {
  const data = structuredClone(initialCatalog)
  await page.route('https://assets.example.test/**', route => route.fulfill({
    contentType: 'image/png',
    body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/m2kAAAAASUVORK5CYII=', 'base64'),
  }))
  for (let index = 2; index <= productCount; index++) {
    data.products.push({ id: `product-${index}`, product_code: `DEMO-${index}`, name: `Demo Product ${index}`, category: null, description: null, lifecycle_status: 'draft', version: 1 })
    data.productBrands.push({ product_id: `product-${index}`, brand_id: 'brand-a' })
  }
  const actions: Body[] = []
  await page.route('**/api/brand-catalog**', async route => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ json: { ok: true, ...data, scopes: role === 'admin' ? data.scopes : [], users: role === 'admin' ? data.users : [] } })
      return
    }
    const body = route.request().postDataJSON() as Body
    actions.push(body)
    if (role !== 'admin') {
      await route.fulfill({ status: 403, json: { ok: false, error: 'BRAND_SCOPE_OR_PERMISSION_DENIED' } })
      return
    }
    if (body.action === 'product.create') {
      data.products.push({ id: 'product-new', product_code: String(body.product_code), name: String(body.name), category: null, description: null, lifecycle_status: 'draft', version: 1 })
      for (const brandId of Array.isArray(body.brand_ids) ? body.brand_ids : []) data.productBrands.push({ product_id: 'product-new', brand_id: String(brandId) })
      await route.fulfill({ status: 201, json: { ok: true, product: { id: 'product-new' } } })
    } else if (body.action === 'product.update') {
      const product = data.products.find(item => item.id === body.id)
      if (product) Object.assign(product, { name: body.name, product_code: body.product_code, lifecycle_status: body.lifecycle_status, version: Number(body.expected_version) + 1 })
      data.productBrands.splice(0, data.productBrands.length, ...data.productBrands.filter(link => link.product_id !== body.id), ...(Array.isArray(body.brand_ids) ? body.brand_ids.map(brandId => ({ product_id: String(body.id), brand_id: String(brandId) })) : []))
      await route.fulfill({ status: 200, json: { ok: true } })
    } else if (body.action === 'sku.create') {
      data.skus.push({ id: 'sku-new', product_id: String(body.product_id), sku_code: String(body.sku_code), variant_name: String(body.variant_name), lifecycle_status: 'active', version: 1 })
      await route.fulfill({ status: 201, json: { ok: true, sku: { id: 'sku-new' } } })
    } else if (body.action === 'sku.update') {
      const sku = data.skus.find(item => item.id === body.id)
      if (sku) Object.assign(sku, { sku_code: body.sku_code, variant_name: body.variant_name, version: Number(body.expected_version) + 1 })
      await route.fulfill({ status: 200, json: { ok: true } })
    } else if (body.action === 'resource.attach') {
      data.resourceLinks.push({ id: 'link-' + actions.length, resource_id: String(body.resource_id), product_id: body.target_type === 'product' ? String(body.target_id) : null, sku_id: body.target_type === 'sku' ? String(body.target_id) : null, campaign_id: body.target_type === 'campaign' ? String(body.target_id) : null, relation_type: String(body.relation_type) })
      await route.fulfill({ status: 201, json: { ok: true } })
    } else {
      await route.fulfill({ status: 201, json: { ok: true } })
    }
  })
  return { actions }
}

test.describe('BRAND-01 catalog interaction and responsive evidence', () => {
  test('Catalog uses authorized metadata and preserves product history at responsive widths', async ({ page }) => {
    await setMockUser(page, '1')
    await mockCatalog(page, 'admin')
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/brand-catalog')
      const product = page.getByRole('button', { name: /Demo Product/ }).first()
      await expect(product).toBeVisible({ timeout: 25_000 })
      const productBox = await product.boundingBox()
      expect(productBox).not.toBeNull()
      expect(productBox!.x + productBox!.width).toBeLessThanOrEqual(width)
      await expect(page.locator('img[src*="demo-image"]')).toHaveCount(0)
      await product.focus()
      await page.keyboard.press('Enter')
      await expect(page).toHaveURL(/product_id=product-a/)
      await expect(page.getByText('Biến thể SKU (1)')).toBeVisible()
      await page.screenshot({ path: `output/playwright/g9-catalog-${width}.png`, fullPage: true })
      await page.goBack()
      await expect(page).not.toHaveURL(/product_id=product-a/)
      await page.goForward()
      await expect(page).toHaveURL(/product_id=product-a/)
    }
  })

  test('Visual Manager shows saved metadata without claiming an image preview or unsupported slot writes', async ({ page }) => {
    await setMockUser(page, '1')
    await mockCatalog(page, 'admin')
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/brand-catalog')
      await page.getByRole('button', { name: 'Visual Manager' }).click()
      const manager = page.getByTestId('visual-asset-manager')
      await expect(manager).toBeVisible()
      await expect(page.getByRole('img', { name: 'Demo Brand logo' })).toBeVisible()
      await expect(page.getByText('Campaign KV & banner')).toBeVisible()
      await expect(page.getByText(/API đọc hiện tại không trả về resource links của campaign/)).toBeVisible()
      await expect(page.getByRole('button', { name: /Cấu hình slot/ })).toBeDisabled()
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
      await page.screenshot({ path: `output/playwright/g9-visual-manager-${width}.png`, fullPage: true })
      await page.getByRole('button', { name: 'Mở thư viện' }).click()
      await expect(page).toHaveURL(/product_id=product-a/)
      await expect(page.getByTestId('product-asset-gallery')).toBeVisible()
      await expect(page.getByRole('button', { name: 'Verified demo image image' })).toBeVisible()
      await expect(page.getByText('verified_metadata')).toBeVisible()
      await expect(page.getByText(/Xem trước ảnh chưa được hỗ trợ/)).toBeVisible()
      await expect(page.locator('img[src*="demo-image"]')).toHaveCount(0)
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
      if (width < 768) {
        const attachButton = page.getByRole('button', { name: 'Gắn liên kết' })
        await attachButton.scrollIntoViewIfNeeded()
        const buttonBox = await attachButton.boundingBox()
        const navBox = await page.getByTestId('production-bottom-nav').boundingBox()
        expect(buttonBox).not.toBeNull()
        expect(navBox).not.toBeNull()
        expect(buttonBox!.y + buttonBox!.height).toBeLessThanOrEqual(navBox!.y)
      }
      if (width === 390) await page.screenshot({ path: 'output/playwright/g9-product-gallery-390.png', fullPage: true })
    }
  })

  test('Catalog paginates the loaded result and resets page when filters change', async ({ page }) => {
    await setMockUser(page, '1')
    await mockCatalog(page, 'admin', 21)
    await page.setViewportSize({ width: 768, height: 900 })
    await page.goto('/brand-catalog')
    const productCards = page.locator('[aria-label="Product catalog"] [role="button"]')
    await expect(productCards).toHaveCount(20)
    await expect(page.getByText('1–20 / 21 sản phẩm đã tải · trang 1/2')).toBeVisible()
    await page.getByRole('button', { name: 'Tiếp' }).click()
    await expect(productCards).toHaveCount(1)
    await expect(page.getByText('21–21 / 21 sản phẩm đã tải · trang 2/2')).toBeVisible()
    await page.getByLabel('Filter category').selectOption('Care')
    await expect(productCards).toHaveCount(1)
    await expect(page.getByText('21–21 / 21 sản phẩm đã tải · trang 2/2')).toHaveCount(0)
  })

  test('Admin creates Product/SKU, associates Campaign, attaches knowledge/resource; baseline and after screenshots', async ({ page }) => {
    const evidence = path.resolve('artifacts/brand01')
    fs.mkdirSync(path.join(evidence, 'before'), { recursive: true })
    fs.mkdirSync(path.join(evidence, 'after'), { recursive: true })
    await setMockUser(page, '1')
    const { actions } = await mockCatalog(page, 'admin')

    for (const width of [390, 768, 1440]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 960 })
      await page.goto('/brands')
      await expect(page.getByTestId('brands-page')).toBeVisible({ timeout: 20_000 })
      await page.screenshot({ path: path.join(evidence, 'before', 'brands-' + width + '.png'), fullPage: true })
      await page.goto('/brand-catalog')
      await expect(page.getByTestId('brand-catalog')).toBeVisible({ timeout: 20_000 })
      await expect(page.getByText('Demo Product')).toBeVisible()
      await expect(page.getByText('Lịch sử thay đổi (Audit log)')).toBeVisible()
      await expect(page.getByLabel('Select Brand Scope')).toHaveValue('')
      await page.getByRole('button', { name: /Demo Product/ }).click()
      await expect(page.getByText('Biến thể SKU (1)')).toBeVisible()
      await page.screenshot({ path: path.join(evidence, 'after', 'catalog-' + width + '.png'), fullPage: true })
    }

    await page.getByLabel('Filter category').selectOption('Care')
    await expect(page.getByRole('button', { name: /Demo Product/ })).toBeVisible()
    await page.getByLabel('Filter category').selectOption('')
    await page.getByLabel('Select Brand Scope').selectOption('brand-a')
    await page.getByRole('button', { name: 'Thêm Sản Phẩm Mới' }).click()
    await page.getByLabel('Product code').fill('DEMO-NEW')
    await page.getByLabel('Product name').fill('New Demo Item')
    await page.getByLabel('Product brand associations').selectOption(['brand-a', 'brand-b'])
    await page.getByRole('button', { name: 'Lưu sản phẩm' }).click()
    await expect.poll(() => actions.map(action => action.action)).toContain('product.create')
    expect(actions.find(action => action.action === 'product.create')?.brand_ids).toEqual(['brand-a', 'brand-b'])
    await page.getByRole('button', { name: 'Sửa' }).click()
    await page.getByLabel('Edit product name').fill('New Demo Item Updated')
    await page.getByRole('button', { name: 'Lưu thay đổi' }).click()
    await expect.poll(() => actions.map(action => action.action)).toContain('product.update')
    await page.getByRole('button', { name: /Hình ảnh & tài nguyên/ }).click()
    await page.getByLabel('Product resource ID').fill('existing-sto02-product-image')
    await page.getByRole('button', { name: 'Gắn liên kết' }).click()
    await expect.poll(() => actions.filter(action => action.action === 'resource.attach')).toHaveLength(1)
    await page.getByRole('button', { name: /^Biến thể SKU/ }).click()
    await page.getByRole('button', { name: 'Thêm SKU' }).click()
    await page.getByLabel('SKU code').fill('DEMO-NEW-XL')
    await page.getByLabel('Variant name').fill('Extra large')
    await page.getByRole('button', { name: 'Lưu SKU' }).click()
    await expect.poll(() => actions.map(action => action.action)).toContain('sku.create')
    await page.getByLabel('Edit variant name').fill('Extra large revised')
    await page.getByRole('button', { name: 'Lưu thay đổi SKU' }).click()
    await expect.poll(() => actions.map(action => action.action)).toContain('sku.update')
    await page.locator('select').filter({ has: page.locator('option[value="campaign-a"]') }).last().selectOption('campaign-a')
    await expect.poll(() => actions.map(action => action.action)).toContain('campaign.attach_sku')
    await page.getByLabel('Knowledge content').fill('Approved product fact from an authorized synthetic source')
    await page.getByLabel('Knowledge source').fill('synthetic-source-record')
    await page.getByRole('button', { name: 'Gửi duyệt kiến thức' }).click()
    await expect.poll(() => actions.map(action => action.action)).toContain('knowledge.create')
    await page.getByLabel('Scheme name').fill('October scheme')
    await page.getByLabel('Scheme terms').fill('Synthetic approved campaign terms')
    await page.getByLabel('Scheme source URL').fill('https://example.test/approved-scheme')
    await page.getByRole('button', { name: 'Lưu cơ chế bản nháp' }).click()
    await expect.poll(() => actions.map(action => action.action)).toContain('scheme.create')
    await page.getByLabel('Account to grant brand access').selectOption('leader-user')
    await page.getByRole('button', { name: 'Cấp quyền Brand đang chọn' }).click()
    await expect.poll(() => actions.map(action => action.action)).toContain('scope.set')

    for (const width of [390, 768, 1440]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 960 })
      await page.screenshot({ path: path.join(evidence, 'after', 'catalog-' + width + '.png'), fullPage: true })
    }
  })

  test('Leader and Member see only read-only authorized catalog controls', async ({ page }) => {
    await setMockUser(page, '2')
    await mockCatalog(page, 'leader')
    await page.goto('/brand-catalog')
    await expect(page.getByTestId('brand-catalog')).toBeVisible()
    await expect(page.getByText('Demo Product')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Thêm Sản Phẩm Mới' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Thêm SKU' })).toHaveCount(0)
    await page.getByRole('button', { name: 'Visual Manager' }).click()
    await expect(page.getByText(/Metadata tài nguyên được ẩn/)).toBeVisible()
    await page.getByRole('button', { name: 'Danh mục', exact: true }).click()
    await page.getByRole('button', { name: /Demo Product/ }).click()
    await page.getByRole('button', { name: /Hình ảnh & tài nguyên/ }).click()
    await expect(page.getByText(/Chi tiết tài nguyên và xem trước được ẩn/)).toBeVisible()
    await expect(page.getByText('Verified demo image')).toHaveCount(0)

    await page.evaluate(() => {
      localStorage.setItem('livestream-ops-current-user', '3')
      window.dispatchEvent(new Event('livestream-ops-current-user-change'))
    })
    await page.reload()
    await expect(page.getByTestId('brand-catalog')).toBeVisible()
    await expect(page.getByText('Demo Product')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Thêm Sản Phẩm Mới' })).toHaveCount(0)
  })

  test('No Brand scope is a distinct empty state, not a successful all-catalog response', async ({ page }) => {
    await setMockUser(page, '3')
    await page.route('**/api/brand-catalog**', route => route.fulfill({ json: { ok: true, brands: [], campaigns: [], products: [], productBrands: [], skus: [], campaignSkus: [], schemes: [], knowledge: [], resourceLinks: [], resources: [], scopes: [], skuPlatforms: [], platforms: [], knowledgeApprovals: [], users: [], auditEvents: [] } }))
    await page.goto('/brand-catalog')
    await expect(page.getByText('Chưa được cấp quyền xem thương hiệu')).toBeVisible()
  })
})
