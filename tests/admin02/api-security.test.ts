import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createAdminWorkspaceHandler } from '../../lib/server/adminWorkspaceHandler'

const handler = (resolver: Parameters<typeof createAdminWorkspaceHandler>[0]) => createAdminWorkspaceHandler(resolver)
const request = () => new Request('http://local.test/api/admin/workspace', { headers: { 'x-role': 'admin', 'x-user-id': 'forged-admin' } })

test('ADMIN-02 authorization gate rejects anonymous, Member, Leader, and forged client role before exposing workspace', async () => {
  const anonymous = await handler(async () => null)(request())
  assert.equal(anonymous.status, 401)

  for (const role of ['member', 'leader'] as const) {
    const denied = await handler(async () => ({
      id: `auth-${role}`,
      businessUserId: `${role}-business-id`,
      systemPermission: role,
    }))(request())
    assert.equal(denied.status, 403, `${role} must not open the Admin workspace`)
    assert.equal((await denied.json() as { ok: boolean }).ok, false)
  }
})
test('ADMIN-02 Admin gate returns an authorization decision only and is not cacheable', async () => {
  const response = await handler(async () => ({
    id: 'auth-admin',
    businessUserId: 'admin-business-id',
    systemPermission: 'admin',
  }))(request())

  assert.equal(response.status, 200)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.deepEqual(await response.json(), { ok: true })
})

test('ADMIN-02 Admin identity without a mapped business actor fails closed', async () => {
  const response = await handler(async () => ({
    id: 'auth-admin',
    systemPermission: 'admin',
  }))(request())

  assert.equal(response.status, 403)
  assert.deepEqual(await response.json(), { ok: false, error: { code: 'BUSINESS_USER_REQUIRED' } })
})
