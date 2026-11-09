import assert from 'node:assert/strict'
import test from 'node:test'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createWorkforceOverviewHandler } from '@/lib/server/workforceOverviewHandler'
import { createWorkforceCapabilitiesHandler } from '@/lib/server/workforceCapabilitiesHandler'
import type { AuthenticatedServerUser } from '@/lib/server/authGuards'

type Row = Record<string, unknown>
function workforceDb(tables: Record<string, Row[]>, reads: Array<{ table: string; brandIds?: unknown[]; ids?: unknown[] }> = []) {
  return {
    from(table: string) {
      const filters: Array<(row: Row) => boolean> = []
      const query = {
        select() { return query },
        eq(field: string, value: unknown) { filters.push(row => row[field] === value); return query },
        is(field: string, value: unknown) { filters.push(row => row[field] === value); return query },
        gte(field: string, value: unknown) { filters.push(row => String(row[field]) >= String(value)); return query },
        lte(field: string, value: unknown) { filters.push(row => String(row[field]) <= String(value)); return query },
        in(field: string, values: unknown[]) {
          if (field === 'brand_id') reads.push({ table, brandIds: [...values] })
          if (field === 'id') reads.push({ table, ids: [...values] })
          filters.push(row => values.includes(row[field]))
          return query
        },
        order() { return query },
        range(first: number, last: number) {
          const rows = (tables[table] ?? []).filter(row => filters.every(filter => filter(row)))
            .sort((a, b) => String(a.id).localeCompare(String(b.id)))
          return Promise.resolve({ data: rows.slice(first, last + 1), count: rows.length, error: null })
        },
      }
      return query
    },
  } as unknown as SupabaseClient
}

const leader = (id: string): AuthenticatedServerUser => ({
  id: `auth-${id}`, businessUserId: id, systemPermission: 'leader',
})
const admin: AuthenticatedServerUser = { id: 'auth-admin', businessUserId: 'admin', systemPermission: 'admin' }
const request = (staffId?: string) => new Request(
  `https://ops.example/api/workforce/overview?period=2026&role=host&page=1&page_size=50${staffId ? `&staff_id=${staffId}` : ''}`,
)

function scopedHandler(actor: AuthenticatedServerUser, scopeBrands: string[], db: SupabaseClient, onPrivilegedRead: () => void = () => {}) {
  return createWorkforceOverviewHandler({
    isEnabled: () => true,
    grace: () => 0,
    leaderboardMin: () => null,
    resolveUser: async () => actor,
    createScopeClient: async () => ({
      rpc: async () => ({ data: scopeBrands, error: null }),
    }),
    createClient: () => { onPrivilegedRead(); return db },
  })
}

const fixture = {
  shifts: [
    { id: 'shift-x', date: '2026-05-01', start_at: '2026-05-01T10:00:00Z', status: 'completed', brand_id: 'brand-x', host_id: 'staff-x', support_id: null, technical_id: null, deleted_at: null, archived_at: null },
    { id: 'shift-y', date: '2026-05-02', start_at: '2026-05-02T10:00:00Z', status: 'completed', brand_id: 'brand-y', host_id: 'staff-y', support_id: null, technical_id: null, deleted_at: null, archived_at: null },
  ],
  shift_registrations: [],
  workforce_actual_segments: [],
  business_users: [
    { id: 'staff-x', full_name: 'Brand X staff', department: 'Host', status: 'active', deleted_at: null },
    { id: 'staff-y', full_name: 'Brand Y staff', department: 'Host', status: 'active', deleted_at: null },
  ],
}

test('Leader A and B reads are bounded by their independent database Brand grants', async () => {
  for (const [actor, brand, staffId] of [
    [leader('leader-a'), 'brand-x', 'staff-x'],
    [leader('leader-b'), 'brand-y', 'staff-y'],
  ] as const) {
    const reads: Array<{ table: string; brandIds?: unknown[]; ids?: unknown[] }> = []
    const response = await scopedHandler(actor, [brand], workforceDb(fixture, reads)).GET(request())
    assert.equal(response.status, 200)
    const body = await response.json() as { staff: Array<{ staffId: string; name: string | null }>; team: unknown }
    assert.deepEqual(body.staff.map(row => row.staffId), [staffId])
    assert.equal(body.staff.some(row => row.name?.includes(brand === 'brand-x' ? 'Brand Y' : 'Brand X')), false)
    assert.deepEqual(reads.find(read => read.table === 'shifts')?.brandIds, [brand])
    assert.deepEqual(reads.find(read => read.table === 'business_users')?.ids, [staffId])
  }
})

test('Forged staff_id cannot return a person outside the Leader Brand scope', async () => {
  const reads: Array<{ table: string; brandIds?: unknown[]; ids?: unknown[] }> = []
  const response = await scopedHandler(leader('leader-a'), ['brand-x'], workforceDb(fixture, reads)).GET(request('staff-y'))
  assert.equal(response.status, 200)
  const body = await response.json() as { staff: unknown[]; staff_pagination: { total_count: number } }
  assert.deepEqual(body.staff, [])
  assert.equal(body.staff_pagination.total_count, 0)
  assert.deepEqual(reads.find(read => read.table === 'business_users')?.ids, ['staff-x'])
})

test('Missing Leader scope denies before any service-role read', async () => {
  let privilegedReads = 0
  const response = await scopedHandler(leader('leader-a'), [], workforceDb(fixture), () => { privilegedReads += 1 })
    .GET(request('forged-staff'))
  assert.equal(response.status, 403)
  assert.equal((await response.json()).error.code, 'WORKFORCE_LEADER_SCOPE_DENIED')
  assert.equal(privilegedReads, 0)
})

test('Malformed or unavailable Leader scope fails closed before privileged reads', async () => {
  for (const scopeResult of [
    { data: null, error: { message: 'RPC unavailable' } },
    { data: ['brand-x', 7], error: null },
  ]) {
    let privilegedReads = 0
    const handler = createWorkforceOverviewHandler({
      isEnabled: () => true,
      resolveUser: async () => leader('leader-a'),
      createScopeClient: async () => ({ rpc: async () => scopeResult }),
      createClient: () => { privilegedReads += 1; throw new Error('out-of-scope read') },
    })
    const response = await handler.GET(request())
    assert.equal(response.status, 503)
    assert.equal((await response.json()).error.code, 'WORKFORCE_LEADER_SCOPE_UNAVAILABLE')
    assert.equal(privilegedReads, 0)
  }
})

test('Workforce Admin retains the global view and Member is denied before data reads', async () => {
  let reads = 0
  const adminResponse = await scopedHandler(admin, [], workforceDb(fixture), () => { reads += 1 }).GET(request())
  assert.equal(adminResponse.status, 200)
  assert.equal((await adminResponse.json() as { staff: unknown[] }).staff.length, 2)
  const memberResponse = await createWorkforceOverviewHandler({
    resolveUser: async () => ({ id: 'auth-member', businessUserId: 'member', systemPermission: 'member' }),
    createClient: () => { reads += 1; throw new Error('Member must be denied') },
  }).GET(request())
  assert.equal(memberResponse.status, 403)
  assert.equal(reads, 1)
})

test('Workforce feature gate runs before scope and database reads', async () => {
  let reads = 0
  const response = await createWorkforceOverviewHandler({
    isEnabled: () => false,
    resolveUser: async () => admin,
    createClient: () => { reads += 1; throw new Error('feature gate must run before database access') },
  }).GET(request())
  assert.equal(response.status, 503)
  assert.equal((await response.json()).error.code, 'WORKFORCE_FEATURE_DISABLED')
  assert.equal(reads, 0)
})

test('Workforce capabilities expose Leader team view only with an active authoritative Brand grant', async () => {
  const leaderCases = [
    { data: ['brand-x'], error: null, expected: true },
    { data: [], error: null, expected: false },
    { data: ['brand-x', null], error: null, expected: false },
    { data: null, error: { message: 'scope unavailable' }, expected: false },
  ]
  for (const scopeResult of leaderCases) {
    let requestedScope: unknown
    const handler = createWorkforceCapabilitiesHandler({
      resolveUser: async () => leader('leader-a'),
      enabled: flag => flag === 'actual_staffing',
      createScopeClient: async () => ({
        rpc: async (name, args) => {
          assert.equal(name, 'rc19_current_leader_brand_ids')
          requestedScope = args.p_scope_key
          return scopeResult
        },
      }),
    })
    const response = await handler.GET(new Request('https://ops.example/api/workforce/capabilities'))
    assert.equal(response.status, 200)
    const { capabilities } = await response.json() as { capabilities: Record<string, boolean> }
    assert.equal(capabilities.team_performance, scopeResult.expected)
    assert.equal(capabilities.actual_staffing, true)
    assert.equal(capabilities.own_performance, true)
    assert.equal(requestedScope, 'workforce.read')
  }
})

test('Workforce Admin remains global and Member never receives team capability', async () => {
  for (const [role, expectedTeam] of [['admin', true], ['member', false]] as const) {
    let scopeReads = 0
    const handler = createWorkforceCapabilitiesHandler({
      resolveUser: async () => ({ id: `auth-${role}`, businessUserId: `${role}-1`, systemPermission: role }),
      enabled: flag => flag === 'actual_staffing',
      createScopeClient: async () => {
        scopeReads += 1
        return { rpc: async () => ({ data: ['brand-x'], error: null }) }
      },
    })
    const response = await handler.GET(new Request('https://ops.example/api/workforce/capabilities'))
    assert.equal(response.status, 200)
    const { capabilities } = await response.json() as { capabilities: Record<string, boolean> }
    assert.equal(capabilities.team_performance, expectedTeam)
    assert.equal(capabilities.actual_staffing, role === 'admin')
    assert.equal(scopeReads, 0)
  }
})
