import assert from 'node:assert/strict'
import test from 'node:test'
import { createRbac02AccountOverridesHandler } from '../lib/server/rbac02AccountOverridesHandler'

const request = (url='https://local/api/rbac/account-overrides', body?: unknown) => new Request(url, {
  method: body === undefined ? 'GET' : 'POST',
  headers: body === undefined ? {} : { 'content-type': 'application/json' },
  body: body === undefined ? undefined : JSON.stringify(body),
})
const identity = (role: 'admin'|'leader'|'member', businessUserId?: string) => async () => ({
  id: 'auth-id-from-session', businessUserId, systemPermission: role,
})

test('RBAC02 default OFF hides GET/POST before auth or database work', async () => {
  let authCalls = 0
  let dbCalls = 0
  const handler = createRbac02AccountOverridesHandler({
    enabled: () => false,
    resolveUser: async () => { authCalls++; return null },
    createClient: async () => { dbCalls++; throw new Error('must not connect') },
  })
  assert.equal((await handler.GET(request())).status, 404)
  assert.equal((await handler.POST(request(undefined, {}))).status, 404)
  assert.equal(authCalls, 0)
  assert.equal(dbCalls, 0)
})

test('RBAC02 Admin API uses mapped session actor and never accepts actor identity from request', async () => {
  const calls: Array<{ name: string; args?: unknown }> = []
  const handler = createRbac02AccountOverridesHandler({
    enabled: () => true,
    resolveUser: identity('admin', 'business-admin'),
    createClient: async () => ({ rpc: async (name: string, args?: unknown) => {
      calls.push({ name, args }); return { data: { version: 1 }, error: null }
    } }) as never,
  })
  const response = await handler.POST(request(undefined, {
    action: 'set', targetId: 'leader-a', permission: 'audit.view_team', decision: 'deny',
    reason: 'approved test reason', expiresAt: null, expectedVersion: 0,
  }))
  assert.equal(response.status, 200)
  assert.deepEqual(calls, [{ name: 'rbac02_set_account_override', args: {
    p_target_business_user_id: 'leader-a', p_permission: 'audit.view_team', p_decision: 'deny',
    p_reason: 'approved test reason', p_expires_at: null, p_expected_version: 0,
  } }])

  const forged = await handler.POST(request(undefined, {
    action: 'set', targetId: 'leader-a', permission: 'audit.view_team', decision: 'allow',
    reason: 'forged actor attempt', expiresAt: null, expectedVersion: 1, actorId: 'admin-b', role: 'admin',
  }))
  assert.equal(forged.status, 400)
  assert.equal(calls.length, 1)
})

test('RBAC02 denies Member, unauthenticated and unmapped identities before RPC', async () => {
  for (const [resolver, expectedStatus] of [
    [identity('member', 'member-a'), 403],
    [async () => null, 401],
    [identity('admin', undefined), 403],
  ] as const) {
    let dbCalls = 0
    const handler = createRbac02AccountOverridesHandler({
      enabled: () => true,
      resolveUser: resolver,
      createClient: async () => { dbCalls++; return { rpc: async () => ({ data: [], error: null }) } as never },
    })
    assert.equal((await handler.GET(request())).status, expectedStatus)
    assert.equal(dbCalls, 0)
  }
})

test('RBAC02 rejects unsupported permission and invalid payload at API boundary', async () => {
  let dbCalls = 0
  const handler = createRbac02AccountOverridesHandler({
    enabled: () => true, resolveUser: identity('admin', 'business-admin'),
    createClient: async () => { dbCalls++; return { rpc: async () => ({ data: true, error: null }) } as never },
  })
  const response = await handler.POST(request(undefined, {
    action: 'set', targetId: 'leader-a', permission: 'payroll.admin', decision: 'allow',
    reason: 'unsupported permission attempt', expiresAt: null, expectedVersion: 0,
  }))
  assert.equal(response.status, 400)
  assert.equal(dbCalls, 0)
})

test('RBAC02 reset is a distinct RPC and database conflicts are not reported as success', async () => {
  const names: string[] = []
  const handler = createRbac02AccountOverridesHandler({
    enabled: () => true, resolveUser: identity('admin', 'business-admin'),
    createClient: async () => ({ rpc: async (name: string) => {
      names.push(name); return { data: null, error: { message: 'RBAC02_VERSION_CONFLICT' } }
    } }) as never,
  })
  const response = await handler.POST(request(undefined, {
    action: 'reset', targetId: 'leader-a', permission: 'audit.view_team',
    reason: 'restore role baseline', expectedVersion: 2,
  }))
  assert.equal(response.status, 409)
  assert.deepEqual(names, ['rbac02_reset_account_override'])
})
