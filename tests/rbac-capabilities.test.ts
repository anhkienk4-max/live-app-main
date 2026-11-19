import assert from 'node:assert/strict'
import test from 'node:test'
import { createRbacCapabilitiesHandler } from '../lib/server/rbacCapabilitiesHandler'
import { permissionMatrix, type Permission } from '../lib/permissions'
import { ROLE_DEFAULTS_CATALOG } from '../lib/rbac/roleDefaults'
import type { AuthenticatedServerUser } from '../lib/server/authGuards'

const user = (systemPermission: AuthenticatedServerUser['systemPermission']): AuthenticatedServerUser => ({
  id: `auth-${systemPermission}`,
  businessUserId: `business-${systemPermission}`,
  systemPermission,
})

const request = () => new Request('https://local/api/rbac/capabilities')

test('RBAC capability contract requires a mapped business identity and never caches', async () => {
  const handler = createRbacCapabilitiesHandler({
    resolveUser: async () => user('member'),
    auditTeamEnforcementEnabled: () => false,
  })
  const response = await handler(request())
  const body = await response.json()
  assert.equal(response.status, 200)
  assert.match(response.headers.get('cache-control') ?? '', /no-store/)
  assert.equal(body.role, 'member')
  assert.ok(body.permissions.every((item: { source: string; reason: string; accountOverrideGrantable: boolean }) =>
    typeof item.source === 'string' && typeof item.reason === 'string' && typeof item.accountOverrideGrantable === 'boolean'))
  assert.deepEqual(
    body.permissions.filter((item: { allowed: boolean }) => item.allowed).map((item: { permission: string }) => item.permission).sort(),
    [...permissionMatrix.member].sort(),
  )
})

test('RBAC capability contract applies the signed-user audit RPC result without caching', async () => {
  let calls = 0
  const handler = createRbacCapabilitiesHandler({
    resolveUser: async () => user('leader'),
    auditTeamEnforcementEnabled: () => true,
    createClient: async () => ({
      rpc: async (name, args) => {
        calls += 1
        assert.equal(name, 'rbac01_effective_permission')
        assert.deepEqual(args, { p_permission: 'audit.view_team' })
        return { data: false, error: null }
      },
    }),
  })

  for (let index = 0; index < 2; index += 1) {
    const response = await handler(request())
    const body = await response.json()
    const auditCapability = body.permissions.find((item: { permission: string }) => item.permission === 'audit.view_team')
    assert.equal(response.status, 200)
    assert.equal(auditCapability.allowed, false)
    assert.equal(auditCapability.source, 'database')
  }
  assert.equal(calls, 2)
})

test('RBAC capability contract fails closed when dynamic permission state is unavailable', async () => {
  const handler = createRbacCapabilitiesHandler({
    resolveUser: async () => user('leader'),
    auditTeamEnforcementEnabled: () => true,
    createClient: async () => ({ rpc: async () => ({ data: null, error: { message: 'unavailable' } }) }),
  })
  const response = await handler(request())
  assert.equal(response.status, 503)
  assert.deepEqual(await response.json(), { ok: false, error: { code: 'RBAC_CAPABILITIES_UNAVAILABLE' } })
})

test('dynamic capabilities use the same database decisions as API guards and include provenance', async () => {
  let calls = 0
  const handler = createRbacCapabilitiesHandler({
    resolveUser: async () => user('leader'),
    dynamicEnforcementEnabled: () => true,
    createClient: async () => ({
      rpc: async (name) => {
        calls += 1
        assert.equal(name, 'rbac_permission_decisions')
        return { data: ROLE_DEFAULTS_CATALOG.map(entry => ({
          actor_business_user_id: 'business-leader', role: 'leader', permission: entry.permission,
          allowed: permissionMatrix.leader.has(entry.permission as Permission),
          source: 'legacy_default', reason: 'database legacy decision', version: null,
          expires_at: null, effective_at: null,
          ...(entry.permission === 'audit.view_team' ? {
            allowed: false, source: 'account_deny', reason: 'temporary account restriction',
            expires_at: '2026-11-05T00:00:00.000Z',
          } : {}),
        })), error: null }
      },
    }),
  })
  const response = await handler(request())
  const body = await response.json()
  const audit = body.permissions.find((item: { permission: string }) => item.permission === 'audit.view_team')
  assert.equal(response.status, 200)
  assert.equal(calls, 1)
  assert.deepEqual({ allowed: audit.allowed, source: audit.source, reason: audit.reason, expiresAt: audit.expiresAt }, {
    allowed: false, source: 'account_deny', reason: 'temporary account restriction',
    expiresAt: '2026-11-05T00:00:00.000Z',
  })
})

test('dynamic capabilities fail closed on missing or foreign database decisions', async () => {
  for (const decisions of [
    ROLE_DEFAULTS_CATALOG.slice(1).map(entry => ({
      actor_business_user_id: 'business-leader', role: 'leader', permission: entry.permission,
      allowed: false, source: 'role_override', reason: 'denied', version: 1, expires_at: null, effective_at: null,
    })),
    ROLE_DEFAULTS_CATALOG.map(entry => ({
      actor_business_user_id: 'other-business-user', role: 'leader', permission: entry.permission,
      allowed: false, source: 'role_override', reason: 'denied', version: 1, expires_at: null, effective_at: null,
    })),
  ]) {
    const handler = createRbacCapabilitiesHandler({
      resolveUser: async () => user('leader'),
      dynamicEnforcementEnabled: () => true,
      createClient: async () => ({ rpc: async () => ({ data: decisions, error: null }) }),
    })
    const response = await handler(request())
    assert.equal(response.status, 503)
  }
})

test('RBAC capability contract rejects unmapped and unauthenticated identities', async () => {
  const unmapped = createRbacCapabilitiesHandler({
    resolveUser: async () => ({ id: 'auth-only', systemPermission: 'member' }),
  })
  const unmappedResponse = await unmapped(request())
  assert.equal(unmappedResponse.status, 403)

  const unauthenticated = createRbacCapabilitiesHandler({ resolveUser: async () => null })
  const unauthenticatedResponse = await unauthenticated(request())
  assert.equal(unauthenticatedResponse.status, 401)
})
