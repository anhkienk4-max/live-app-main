import assert from 'node:assert/strict'
import test from 'node:test'
import { createReportRevisionSnapshotHandler } from '../lib/server/reportRevisionSnapshotHandler.ts'

const admin = async () => ({ id: 'auth-admin', businessUserId: 'business-admin', systemPermission: 'admin' as const })

const sourceSnapshot = {
  schemaVersion: 1,
  notes: [],
  noteRefs: [],
  incidents: [],
  incidentRefs: [],
}

const externalProjection = {
  schemaVersion: 1,
  reportId: 'report-1',
  revisionVersion: 2,
  status: 'draft',
  metrics: {
    revenue: 100,
    orders: 1,
    peakViewer: 10,
    averageViewer: 5,
    gmv: null,
    viewers: null,
    productClicks: null,
    ctr: null,
    cvr: null,
    averageOrderValue: null,
    liveDurationMinutes: null,
    dashboardPlatform: 'other',
  },
}

test('report snapshot preview uses authenticated RPC and returns no-store typed data', async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = []
  const handler = createReportRevisionSnapshotHandler({
    resolveUser: admin,
    createClient: () => ({ rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args })
      return { data: {
        kind: 'preview', reportId: 'report-1', shiftId: 'shift-1', currentVersion: 2,
        audience: 'internal', sourceSnapshot,
      }, error: null }
    } }) as never,
  })

  const response = await handler.GET(new Request('https://ops.example/api/reports/revision-snapshots?report_id=report-1'))
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('Cache-Control'), 'no-store')
  assert.deepEqual(calls, [{ name: 'preview_report_revision_sources_v1', args: {
    p_report_id: 'report-1', p_audience: 'internal',
  } }])
  assert.equal((await response.json()).data.sourceSnapshot.schemaVersion, 1)
})

test('persisted revision read requests one version and enforces response version', async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = []
  const handler = createReportRevisionSnapshotHandler({
    resolveUser: admin,
    createClient: () => ({ rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args })
      return { data: {
        kind: 'revision', reportId: 'report-1', revisionId: 'revision-2', revisionVersion: 2,
        createdAt: '2026-11-26T00:00:00Z', audience: 'external', externalProjection,
      }, error: null }
    } }) as never,
  })

  const response = await handler.GET(new Request('https://ops.example/api/reports/revision-snapshots?report_id=report-1&revision_version=2&audience=external'))
  assert.equal(response.status, 200)
  assert.deepEqual(calls, [{ name: 'get_report_revision_sources_v1', args: {
    p_report_id: 'report-1', p_revision_version: 2, p_audience: 'external',
  } }])
})

test('member internal snapshot denial is preserved as 403', async () => {
  const handler = createReportRevisionSnapshotHandler({
    resolveUser: async () => ({ id: 'auth-member', businessUserId: 'business-member', systemPermission: 'member' }),
    createClient: () => ({ rpc: async () => ({
      data: null, error: { code: '42501', message: 'REPORT_INTERNAL_SNAPSHOT_FORBIDDEN' },
    }) }) as never,
  })
  const response = await handler.GET(new Request('https://ops.example/api/reports/revision-snapshots?report_id=report-1'))
  assert.equal(response.status, 403)
  assert.equal((await response.json()).error.code, 'REPORT_SNAPSHOT_FORBIDDEN')
})

test('invalid query and malformed RPC payload fail closed', async () => {
  let calls = 0
  const handler = createReportRevisionSnapshotHandler({
    resolveUser: admin,
    createClient: () => ({ rpc: async () => { calls += 1; return { data: { kind: 'preview' }, error: null } } }) as never,
  })
  const invalidQuery = await handler.GET(new Request('https://ops.example/api/reports/revision-snapshots?report_id=report-1&revision_version=0'))
  assert.equal(invalidQuery.status, 400)
  assert.equal(calls, 0)

  const malformed = await handler.GET(new Request('https://ops.example/api/reports/revision-snapshots?report_id=report-1'))
  assert.equal(malformed.status, 502)
  assert.equal((await malformed.json()).error.code, 'REPORT_SNAPSHOT_INVALID')
})

test('versioned report save uses one atomic idempotent RPC and returns its receipt', async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = []
  const handler = createReportRevisionSnapshotHandler({
    resolveUser: admin,
    createClient: () => ({ rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args })
      return { data: {
        report: { id: 'report-1', version_number: 3, final_recap: { summary: 'manual' } },
        revisionId: 'revision-3', revisionVersion: 3, replayed: true,
      }, error: null }
    } }) as never,
  })
  const response = await handler.POST(new Request('https://ops.example/api/reports/revision-snapshots', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', origin: 'https://ops.example' },
    body: JSON.stringify({
      reportId: 'report-1', patch: { revenue: 100 }, expectedVersion: 2,
      reason: null, event: 'save', idempotencyKey: '4fdc4c27-c59b-4cc7-91d6-b2e17e67bf85',
    }),
  }))
  assert.equal(response.status, 200)
  assert.equal((await response.json()).data.replayed, true)
  assert.deepEqual(calls, [{ name: 'update_report_with_revision_snapshot_v1', args: {
    p_report_id: 'report-1', p_patch: { revenue: 100 }, p_expected_version: 2,
    p_reason: null, p_event: 'save', p_idempotency_key: '4fdc4c27-c59b-4cc7-91d6-b2e17e67bf85',
  } }])
})

test('versioned report save preserves CAS and idempotency conflicts as 409', async () => {
  const handler = createReportRevisionSnapshotHandler({
    resolveUser: admin,
    createClient: () => ({ rpc: async () => ({
      data: null, error: { code: 'P0001', message: 'REPORT_VERSION_CONFLICT' },
    }) }) as never,
  })
  const response = await handler.POST(new Request('https://ops.example/api/reports/revision-snapshots', {
    method: 'POST', headers: { 'Content-Type': 'application/json', origin: 'https://ops.example' },
    body: JSON.stringify({
      reportId: 'report-1', patch: { revenue: 100 }, expectedVersion: 2,
      event: 'save', idempotencyKey: '4fdc4c27-c59b-4cc7-91d6-b2e17e67bf85',
    }),
  }))
  assert.equal(response.status, 409)
  assert.equal((await response.json()).error.code, 'REPORT_VERSION_CONFLICT')
})

test('versioned report save returns a safe conflict when saved sources violate shift scope', async () => {
  const handler = createReportRevisionSnapshotHandler({
    resolveUser: admin,
    createClient: () => ({ rpc: async () => ({
      data: null, error: { code: '23514', message: 'REPORT_SOURCE_SCOPE_INVALID' },
    }) }) as never,
  })
  const response = await handler.POST(new Request('https://ops.example/api/reports/revision-snapshots', {
    method: 'POST', headers: { 'Content-Type': 'application/json', origin: 'https://ops.example' },
    body: JSON.stringify({
      reportId: 'report-1', patch: { revenue: 100 }, expectedVersion: 2,
      event: 'save', idempotencyKey: '4fdc4c27-c59b-4cc7-91d6-b2e17e67bf85',
    }),
  }))
  assert.equal(response.status, 409)
  assert.equal((await response.json()).error.code, 'REPORT_SOURCE_SCOPE_INVALID')
})

test('versioned report save rejects missing or cross-origin requests with 403', async () => {
  const handler = createReportRevisionSnapshotHandler({ resolveUser: admin })
  const missingOrigin = await handler.POST(new Request('https://ops.example/api/reports/revision-snapshots', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reportId: 'report-1', patch: { revenue: 100 }, expectedVersion: 2, event: 'save', idempotencyKey: '4fdc4c27-c59b-4cc7-91d6-b2e17e67bf85' }),
  }))
  assert.equal(missingOrigin.status, 403)
  assert.equal((await missingOrigin.json()).error.code, 'REPORT_SNAPSHOT_ORIGIN_INVALID')

  const crossOrigin = await handler.POST(new Request('https://ops.example/api/reports/revision-snapshots', {
    method: 'POST', headers: { 'Content-Type': 'application/json', origin: 'https://attacker.example' },
    body: JSON.stringify({ reportId: 'report-1', patch: { revenue: 100 }, expectedVersion: 2, event: 'save', idempotencyKey: '4fdc4c27-c59b-4cc7-91d6-b2e17e67bf85' }),
  }))
  assert.equal(crossOrigin.status, 403)
  assert.equal((await crossOrigin.json()).error.code, 'REPORT_SNAPSHOT_ORIGIN_INVALID')
})
