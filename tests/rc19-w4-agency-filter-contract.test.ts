import assert from 'node:assert/strict'
import test from 'node:test'
import { createOperationsCollectionHandler, listFiltersSchema } from '@/lib/server/operationsCollectionHandler'

function request(entity: string, filters: unknown) {
  const params = new URLSearchParams({ entity, page: '1', pageSize: '10', pendingPage: '1', filters: JSON.stringify(filters) })
  return new Request(`http://localhost/api/operations/collection?${params}`)
}

test('agencyCodes has strict bounded entity-specific enum validation', async () => {
  assert.equal(listFiltersSchema.safeParse({ agencyCodes: ['ada', 'snap', 'live_ai'] }).success, true)
  for (const filters of [
    { agencyCodes: ['unknown'] },
    { agencyCodes: ['ada', 'snap', 'live_ai', 'ada'] },
    { agencyCodes: ['ada', 'ada'] },
    { agencyCodes: [] },
    { agencyCodes: 'ada' },
    { agencyCodes: ['ada'], unexpected: true },
  ]) assert.equal(listFiltersSchema.safeParse(filters).success, false)

  for (const entity of ['reports', 'report_queue']) {
    let rpcFilters: unknown
    const handler = createOperationsCollectionHandler({
      resolveUser: async () => ({ id: 'auth-admin', businessUserId: 'business-admin', systemPermission: 'admin' }) as never,
      createClient: async () => ({
        rpc: async (_name: string, args: Record<string, unknown>) => {
          rpcFilters = args.p_filters
          return { data: entity === 'reports'
            ? { rows: [], historicalShiftContexts: {}, total: 0, page: 1, pageSize: 10 }
            : { rows: [], total: 0, page: 1, pageSize: 10 }, error: null }
        },
      }) as never,
    }).GET
    const response = await handler(request(entity, { agencyCodes: ['ada', 'live_ai'] }))
    assert.equal(response.status, 200)
    assert.deepEqual((rpcFilters as { agencyCodes: string[] }).agencyCodes, ['ada', 'live_ai'])
  }

  const handler = createOperationsCollectionHandler({
    resolveUser: async () => ({ id: 'auth-admin', businessUserId: 'business-admin', systemPermission: 'admin' }) as never,
    createClient: async () => { throw new Error('Invalid filters must fail before database access') },
  }).GET
  for (const [entity, filters] of [
    ['reports', { agencyCodes: ['other'] }],
    ['report_queue', { agencyCodes: ['other'] }],
    ['analytics_reports', { agencyCodes: ['ada'] }],
  ] as const) {
    const response = await handler(request(entity, filters))
    assert.equal(response.status, 400)
  }
})

test('Agency filtering is carried into authenticated RPCs before server pagination', async () => {
  const migration = await import('node:fs/promises').then(fs => fs.readFile(
    new URL('../supabase/migrations/20261128100000_rc19_w4_reports_agency_code_filter.sql', import.meta.url), 'utf8'))
  assert.match(migration, /security invoker/i)
  assert.match(migration, /agency_shift\.agency_code in[\s\S]*p_filters->'agencyCodes'/i)
  assert.match(migration, /scoped\.visible_shift and exists/i,
    'Agency filtering must fail closed for hidden historical shift contexts')
  assert.match(migration, /s\.agency_code in \(select jsonb_array_elements_text\(p_filters->'agencyCodes'\)\)/i)
  assert.match(migration, /agencyCodes'\) not between 1 and 3/u)
  assert.ok(migration.indexOf("'agencyCodes'" ) < migration.indexOf('), stats as'),
    'queue Agency predicate must execute in the matching relation before aggregate count and page selection')
})
