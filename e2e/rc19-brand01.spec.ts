import { expect, test, type Page } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

type Body = Record<string, unknown>
const initialCatalog = {
  brands: [{ id: 'brand-a', name: 'Demo Brand', status: 'active', description: 'Mock authorized brand', brand_guideline: 'Approved voice guidance', mandatory_claims: ['Synthetic claim'], restricted_claims: [] }, { id: 'brand-b', name: 'Second Demo Brand', status: 'active', description: 'Second synthetic brand' }],
  campaigns: [{ id: 'campaign-a', name: 'Demo Campaign', brand_id: 'brand-a', start_date: '2026-10-01', end_date: '2026-10-31', status: 'active', platform_ids: ['platform-a'], notes: 'Synthetic campaign' }],
  products: [{ id: 'product-a', product_code: 'DEMO-1', name: 'Demo Product', category: 'Care', description: 'Synthetic test fixture', lifecycle_status: 'active', version: 1 }],
  productBrands: [{ product_id: 'product-a', brand_id: 'brand-a' }],
  skus: [{ id: 'sku-a', product_id: 'product-a', sku_code: 'DEMO-1-S', variant_name: 'Small', size_or_package: '100ml', lifecycle_status: 'active', version: 1 }],
  campaignSkus: [],
  schemes: [],
  knowledge: [],
  resourceLinks: [{ id: 'resource-link-a', resource_id: 'resource-a', product_id: 'product-a', relation_type: 'image' }],
  resources: [{ id: 'resource-a', title: 'Verified demo image', canonical_url: 'https://drive.google.com/file/d/demo-image', provider: 'google_drive', resource_type: 'image', verification_status: 'verified_metadata' }],
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

async function mockCatalog(page: Page, role: 'admin' | 'leader' | 'member') {
  const data = structuredClone(initialCatalog)
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
      await expect(page.getByRole('heading', { name: 'Catalog audit history' })).toBeVisible()
      await expect(page.getByLabel('Filter brand')).toHaveValue('')
      await page.getByRole('button', { name: /Demo Product/ }).click()
      await expect(page.getByText('Variants / SKUs (1)')).toBeVisible()
      await page.screenshot({ path: path.join(evidence, 'after', 'catalog-' + width + '.png'), fullPage: true })
    }

    await page.getByLabel('Filter resource type').selectOption('image')
    await expect(page.getByRole('button', { name: /Demo Product/ })).toBeVisible()
    await page.getByLabel('Filter resource type').selectOption('all')
    await page.getByLabel('Filter brand').selectOption('brand-a')
    await page.getByRole('button', { name: 'Add product' }).click()
    await page.getByLabel('Product code').fill('DEMO-NEW')
    await page.getByLabel('Product name').fill('New Demo Item')
    await page.getByLabel('Product brand associations').selectOption(['brand-a', 'brand-b'])
    await page.getByRole('button', { name: 'Save product' }).click()
    await expect.poll(() => actions.map(action => action.action)).toContain('product.create')
    expect(actions.find(action => action.action === 'product.create')?.brand_ids).toEqual(['brand-a', 'brand-b'])
    await page.getByRole('button', { name: 'Edit fields' }).click()
    await page.getByLabel('Edit product name').fill('New Demo Item Updated')
    await page.getByRole('button', { name: 'Save changes' }).click()
    await expect.poll(() => actions.map(action => action.action)).toContain('product.update')
    await page.getByLabel('Product resource ID').fill('existing-sto02-product-image')
    await page.getByRole('button', { name: 'Attach product resource' }).click()
    await expect.poll(() => actions.filter(action => action.action === 'resource.attach')).toHaveLength(1)
    await page.getByRole('button', { name: 'Add SKU' }).click()
    await page.getByLabel('SKU code').fill('DEMO-NEW-XL')
    await page.getByLabel('Variant name').fill('Extra large')
    await page.getByRole('button', { name: 'Save SKU' }).click()
    await expect.poll(() => actions.map(action => action.action)).toContain('sku.create')
    await page.getByLabel('Edit variant name').fill('Extra large revised')
    await page.getByRole('button', { name: 'Save SKU changes' }).click()
    await expect.poll(() => actions.map(action => action.action)).toContain('sku.update')
    await page.getByLabel('Attach to campaign').selectOption('campaign-a')
    await expect.poll(() => actions.map(action => action.action)).toContain('campaign.attach_sku')
    await page.getByRole('textbox', { name: 'Resource ID', exact: true }).fill('existing-sto02-resource')
    await page.getByRole('button', { name: 'Attach existing resource' }).click()
    await expect.poll(() => actions.map(action => action.action)).toContain('resource.attach')
    await page.getByLabel('Knowledge content').fill('Approved product fact from an authorized synthetic source')
    await page.getByLabel('Knowledge source').fill('synthetic-source-record')
    await page.getByRole('button', { name: 'Submit knowledge for review' }).click()
    await expect.poll(() => actions.map(action => action.action)).toContain('knowledge.create')
    await page.getByLabel('Scheme name Demo Campaign').fill('October scheme')
    await page.getByLabel('Scheme terms Demo Campaign').fill('Synthetic approved campaign terms')
    await page.getByLabel('Scheme source URL Demo Campaign').fill('https://example.test/approved-scheme')
    await page.getByRole('button', { name: 'Save draft campaign scheme' }).click()
    await expect.poll(() => actions.map(action => action.action)).toContain('scheme.create')
    await page.getByLabel('Account to grant brand access').selectOption('leader-user')
    await page.getByRole('button', { name: 'Grant selected Brand' }).click()
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
    await expect(page.getByRole('link', { name: 'Product catalog' })).toBeVisible()
    await expect(page.getByText('Demo Product')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Add product' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Add SKU' })).toHaveCount(0)

    await page.evaluate(() => {
      localStorage.setItem('livestream-ops-current-user', '3')
      window.dispatchEvent(new Event('livestream-ops-current-user-change'))
    })
    await page.reload()
    await expect(page.getByRole('link', { name: 'Product catalog' })).toBeVisible()
    await expect(page.getByText('Demo Product')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Add product' })).toHaveCount(0)
  })

  test('No Brand scope is a distinct empty state, not a successful all-catalog response', async ({ page }) => {
    await setMockUser(page, '3')
    await page.route('**/api/brand-catalog**', route => route.fulfill({ json: { ok: true, brands: [], campaigns: [], products: [], productBrands: [], skus: [], campaignSkus: [], schemes: [], knowledge: [], resourceLinks: [], resources: [], scopes: [], skuPlatforms: [], platforms: [], knowledgeApprovals: [], users: [], auditEvents: [] } }))
    await page.goto('/brand-catalog')
    await expect(page.getByText('No brand access assigned')).toBeVisible()
  })
})
