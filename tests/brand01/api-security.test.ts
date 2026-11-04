import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createBrandCatalogHandler } from '../../lib/server/brandCatalogHandler'

const body = {
  action: 'product.create',
  product_code: 'TEST-1',
  name: 'Test product',
  brand_ids: ['brand-a'],
}

test('BRAND-01 API denies unauthenticated and non-Admin writes before client/database access', async () => {
  const handler = createBrandCatalogHandler(async () => null)
  const unauthenticated = await handler.POST(new Request('http://local.test/api/brand-catalog', { method: 'POST', body: JSON.stringify(body) }))
  assert.equal(unauthenticated.status, 401)

  const memberHandler = createBrandCatalogHandler(async () => ({
    id: 'auth-member',
    businessUserId: 'member-a',
    systemPermission: 'member',
  }))
  const memberResponse = await memberHandler.POST(new Request('http://local.test/api/brand-catalog', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }))
  assert.equal(memberResponse.status, 403)

  const unmappedAdminHandler = createBrandCatalogHandler(async () => ({
    id: 'auth-admin',
    systemPermission: 'admin',
  }))
  const unmappedAdminResponse = await unmappedAdminHandler.POST(new Request('http://local.test/api/brand-catalog', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }))
  assert.equal(unmappedAdminResponse.status, 403)
  assert.deepEqual(await unmappedAdminResponse.json(), { ok: false, error: 'BUSINESS_USER_REQUIRED' })
})
