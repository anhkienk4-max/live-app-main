import test from 'node:test'
import assert from 'node:assert/strict'
import { storageResourceRegistryDatabaseErrorResponse } from '@/lib/server/storageResourceRegistryErrorResponse'
import { createStorageResourceRegistryHandler } from '@/lib/server/storageResourceRegistryHandler'

test('registry API requires an authenticated admin for valid same-origin writes', async () => {
  const handler = createStorageResourceRegistryHandler(async () => null)
  const response = await handler.POST(new Request('https://ops.test/api/storage-resources', {
    method: 'POST',
    headers: { origin: 'https://ops.test', 'content-type': 'application/json' },
    body: JSON.stringify({
      action: 'create', provider: 'google_drive', canonical_id: 'forged',
      canonical_url: 'https://drive.google.com/drive/folders/forged',
      title: 'Forged', resource_type: 'root_folder', visibility: 'admin_only',
    }),
  }))
  assert.equal(response.status, 401)
  assert.deepEqual(await response.json(), {
    ok: false, error: { code: 'AUTHENTICATION_REQUIRED', message: 'Authentication is required.' },
  })
})

test('registry API fails explicitly when its proposal schema or RPC is not installed', async () => {
  for (const code of ['42P01', 'PGRST202', 'PGRST205']) {
    const response = storageResourceRegistryDatabaseErrorResponse({ code })
    assert.equal(response?.status, 503)
    assert.deepEqual(await response?.json(), { ok: false, error: 'STORAGE_RESOURCE_REGISTRY_NOT_INSTALLED' })
  }
  assert.equal(storageResourceRegistryDatabaseErrorResponse({ code: '42703' }), null)
})

test('registry API distinguishes conflict, invalid scope, missing target, and permission failures', async () => {
  const cases = [
    ['23505', 409, 'RESOURCE_DUPLICATE'],
    ['23503', 400, 'STORAGE_RESOURCE_SCOPE_INVALID'],
    ['23514', 400, 'STORAGE_RESOURCE_CONSTRAINT_FAILED'],
    ['P0002', 404, 'STORAGE_RESOURCE_NOT_FOUND'],
    ['42501', 403, 'FORBIDDEN'],
  ] as const
  for (const [code, status, error] of cases) {
    const response = storageResourceRegistryDatabaseErrorResponse({ code })
    assert.equal(response?.status, status)
    assert.deepEqual(await response?.json(), { ok: false, error })
  }
})
