import assert from 'node:assert/strict'
import test from 'node:test'
import { AuthorizationError, requirePermission, type AuthenticatedServerUser } from '../lib/server/authGuards.ts'

const leader: AuthenticatedServerUser = {
  id: 'auth-leader', businessUserId: 'leader-a', systemPermission: 'leader',
}
const request = () => new Request('https://ops.example/api/reports')
const decision = (overrides: Record<string, unknown> = {}) => ({
  actor_business_user_id: 'leader-a', role: 'leader', permission: 'reports.review',
  allowed: true, source: 'legacy_default', reason: 'legacy', version: null,
  expires_at: null, effective_at: null, ...overrides,
})

test('dynamic server guard uses the authenticated database decision', async (t) => {
  const previous = process.env.FEATURE_RBAC_DYNAMIC_ENFORCEMENT
  process.env.FEATURE_RBAC_DYNAMIC_ENFORCEMENT = 'true'
  t.after(() => {
    if (previous === undefined) delete process.env.FEATURE_RBAC_DYNAMIC_ENFORCEMENT
    else process.env.FEATURE_RBAC_DYNAMIC_ENFORCEMENT = previous
  })

  let calls = 0
  await assert.doesNotReject(() => requirePermission(request(), 'reports.review', async () => leader, async () => ({
    rpc: async (name, args) => {
      calls += 1
      assert.equal(name, 'rbac_permission_decision')
      assert.deepEqual(args, { p_permission: 'reports.review' })
      return { data: decision(), error: null }
    },
  })))
  assert.equal(calls, 1)

  await assert.rejects(
    () => requirePermission(request(), 'reports.review', async () => leader, async () => ({
      rpc: async () => ({ data: decision({ allowed: false, source: 'role_override' }), error: null }),
    })),
    (error: unknown) => error instanceof AuthorizationError && error.status === 403 && error.code === 'PERMISSION_DENIED',
  )
})

test('dynamic server guard fails closed on RPC failure or identity/policy mismatch', async (t) => {
  const previous = process.env.FEATURE_RBAC_DYNAMIC_ENFORCEMENT
  process.env.FEATURE_RBAC_DYNAMIC_ENFORCEMENT = 'true'
  t.after(() => {
    if (previous === undefined) delete process.env.FEATURE_RBAC_DYNAMIC_ENFORCEMENT
    else process.env.FEATURE_RBAC_DYNAMIC_ENFORCEMENT = previous
  })

  const cases = [
    async () => ({ rpc: async () => ({ data: null, error: new Error('offline') }) }),
    async () => ({ rpc: async () => ({ data: decision({ actor_business_user_id: 'other-user' }), error: null }) }),
    async () => ({ rpc: async () => ({ data: decision({ role: 'member' }), error: null }) }),
    async () => ({ rpc: async () => ({ data: decision({ permission: 'storage.upload' }), error: null }) }),
    async () => ({ rpc: async () => ({ data: decision({ allowed: false, source: 'malformed' }), error: null }) }),
  ]
  for (const createDb of cases) {
    await assert.rejects(
      () => requirePermission(request(), 'reports.review', async () => leader, createDb as never),
      (error: unknown) => error instanceof AuthorizationError && error.status === 503
        && error.code === 'RBAC_AUTHORIZATION_UNAVAILABLE',
    )
  }
})

test('dynamic database grants cannot override hard finance restrictions', async (t) => {
  const previous = process.env.FEATURE_RBAC_DYNAMIC_ENFORCEMENT
  process.env.FEATURE_RBAC_DYNAMIC_ENFORCEMENT = 'true'
  t.after(() => {
    if (previous === undefined) delete process.env.FEATURE_RBAC_DYNAMIC_ENFORCEMENT
    else process.env.FEATURE_RBAC_DYNAMIC_ENFORCEMENT = previous
  })
  const member = { id: 'auth-member', businessUserId: 'member-a', systemPermission: 'member' as const }
  await assert.rejects(
    () => requirePermission(request(), 'payroll.manage', async () => member, async () => ({
      rpc: async () => ({ data: {
        ...decision(), actor_business_user_id: 'member-a', role: 'member',
        permission: 'payroll.manage', allowed: true, source: 'account_allow',
      }, error: null }),
    })),
    (error: unknown) => error instanceof AuthorizationError && error.status === 503,
  )
})
