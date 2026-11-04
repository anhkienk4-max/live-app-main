import assert from 'node:assert/strict'
import test from 'node:test'
import { createWorkforceOverviewHandler } from '@/lib/server/workforceOverviewHandler'
import { createWorkforceCapabilitiesHandler } from '@/lib/server/workforceCapabilitiesHandler'

test('Leader identities fail closed before Workforce reads, including a forged staff_id', async () => {
  let privilegedReads = 0
  for (const businessUserId of ['leader-ada', 'leader-snap']) {
    const response = await createWorkforceOverviewHandler({
      isEnabled: () => true,
      resolveUser: async () => ({ id: `auth-${businessUserId}`, businessUserId, systemPermission: 'leader' }),
      createClient: () => { privilegedReads += 1; throw new Error('must not query without authoritative Brand scope') },
    }).GET(new Request('https://ops.example/api/workforce/overview?period=2026&role=host&staff_id=forged-staff'))

    assert.equal(response.status, 503)
    assert.equal((await response.json()).error.code, 'WORKFORCE_LEADER_SCOPE_UNAVAILABLE')
  }
  assert.equal(privilegedReads, 0)
})

test('Workforce Admin remains eligible for the approved global view', async () => {
  const handler = createWorkforceOverviewHandler({
    isEnabled: () => false,
    resolveUser: async () => ({ id: 'auth-admin', businessUserId: 'admin', systemPermission: 'admin' }),
    createClient: () => { throw new Error('feature gate must run before database access') },
  })
  const response = await handler.GET(new Request('https://ops.example/api/workforce/overview?period=2026&role=host'))
  assert.equal(response.status, 503)
  assert.equal((await response.json()).error.code, 'WORKFORCE_FEATURE_DISABLED')
})

test('Workforce capabilities hide team performance from Leaders while retaining their shift-scoped tools', async () => {
  for (const role of ['leader', 'admin'] as const) {
    const handler = createWorkforceCapabilitiesHandler({
      resolveUser: async () => ({ id: `auth-${role}`, businessUserId: `${role}-1`, systemPermission: role }),
      enabled: flag => flag === 'actual_staffing',
    })
    const response = await handler.GET(new Request('https://ops.example/api/workforce/capabilities'))
    assert.equal(response.status, 200)
    const { capabilities } = await response.json() as { capabilities: Record<string, boolean> }
    assert.equal(capabilities.team_performance, role === 'admin')
    assert.equal(capabilities.actual_staffing, true)
    assert.equal(capabilities.own_performance, true)
  }
})
