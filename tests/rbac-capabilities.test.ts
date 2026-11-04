import assert from 'node:assert/strict'
import test from 'node:test'
import { createRbacCapabilitiesHandler } from '../lib/server/rbacCapabilitiesHandler'
import { permissionMatrix } from '../lib/permissions'
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
