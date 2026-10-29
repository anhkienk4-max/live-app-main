import test from 'node:test'
import assert from 'node:assert/strict'
import { storageResourceRegistryDatabaseErrorResponse } from '@/lib/server/storageResourceRegistryErrorResponse'

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
