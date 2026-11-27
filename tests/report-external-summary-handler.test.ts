import assert from 'node:assert/strict'
import test from 'node:test'
import { createReportExternalSummaryHandler } from '../lib/server/reportExternalSummaryHandler.ts'

const admin = async () => ({ id: 'auth-admin', businessUserId: 'business-admin', systemPermission: 'admin' as const })
const idempotencyKey = '4fdc4c27-c59b-4cc7-91d6-b2e17e67bf85'
const summaryId = '9a0e98c5-90ef-4f44-8baa-733f47fa237e'

const summaryState = {
  id: summaryId,
  content: 'Broadcast completed on schedule.',
  workflowState: 'draft',
  version: 1,
  createdBy: 'business-admin',
  updatedBy: 'business-admin',
  submittedBy: null,
  submittedAt: null,
  reviewedBy: null,
  reviewedAt: null,
  reviewReason: null,
  createdAt: '2026-11-26T08:00:00Z',
  updatedAt: '2026-11-26T08:00:00Z',
}

function makeRequest(body: unknown, origin = 'https://ops.example') {
  return new Request('https://ops.example/api/reports/external-operational-summary', {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

test('save draft requires exact same origin before it resolves the actor or RPC client', async () => {
  let rpcCalls = 0
  const handler = createReportExternalSummaryHandler({
    resolveUser: admin,
    createClient: () => ({ rpc: async () => { rpcCalls += 1; return { data: null, error: null } } }) as never,
  })
  const response = await handler.POST(makeRequest({
    action: 'save_draft', reportId: 'report-1', summaryId: null, content: 'summary',
    expectedVersion: 0, reason: null, idempotencyKey,
  }, 'https://attacker.example'))
  assert.equal(response.status, 403)
  assert.equal((await response.json()).error.code, 'REPORT_EXTERNAL_SUMMARY_ORIGIN_INVALID')
  assert.equal(rpcCalls, 0)
})

test('save draft calls one workflow RPC and requires authoritative readback', async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = []
  const handler = createReportExternalSummaryHandler({
    resolveUser: admin,
    createClient: () => ({ rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args })
      if (name === 'external_report_summary_workflow_v1') return { data: {
        reportId: 'report-1', summaryId, version: 1, workflowState: 'draft', replayed: false, reportRevisionId: null,
      }, error: null }
      return { data: { reportId: 'report-1', summary: summaryState }, error: null }
    } }) as never,
  })

  const response = await handler.POST(makeRequest({
    action: 'save_draft', reportId: 'report-1', summaryId: null, content: 'Broadcast completed on schedule.',
    expectedVersion: 0, reason: null, idempotencyKey,
  }))
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('Cache-Control'), 'no-store')
  assert.deepEqual(calls, [
    { name: 'external_report_summary_workflow_v1', args: {
      p_action: 'save_draft', p_report_id: 'report-1', p_summary_id: null,
      p_content: 'Broadcast completed on schedule.', p_expected_version: 0,
      p_reason: null, p_idempotency_key: idempotencyKey,
    } },
    { name: 'get_report_external_summary_workflow_v1', args: { p_report_id: 'report-1' } },
  ])
  const body = await response.json()
  assert.equal(body.data.mutation.summaryId, summaryId)
  assert.equal(body.data.readback.summary.version, 1)
})

test('workflow RPC error returns a stable conflict and does not report success', async () => {
  const handler = createReportExternalSummaryHandler({
    resolveUser: admin,
    createClient: () => ({ rpc: async () => ({ data: null, error: { code: '40001', message: 'REPORT_EXTERNAL_SUMMARY_VERSION_CONFLICT' } }) }) as never,
  })
  const response = await handler.POST(makeRequest({
    action: 'save_draft', reportId: 'report-1', summaryId, content: 'changed',
    expectedVersion: 4, reason: null, idempotencyKey,
  }))
  assert.equal(response.status, 409)
  assert.equal((await response.json()).error.code, 'REPORT_EXTERNAL_SUMMARY_VERSION_CONFLICT')
})

test('readback mismatch fails closed after a committed workflow receipt', async () => {
  let calls = 0
  const handler = createReportExternalSummaryHandler({
    resolveUser: admin,
    createClient: () => ({ rpc: async (name: string) => {
      calls += 1
      return name === 'external_report_summary_workflow_v1'
        ? { data: { reportId: 'report-1', summaryId, version: 2, workflowState: 'submitted', replayed: false, reportRevisionId: null }, error: null }
        : { data: { reportId: 'report-1', summary: { ...summaryState, version: 1 } }, error: null }
    } }) as never,
  })
  const response = await handler.POST(makeRequest({
    action: 'submit', reportId: 'report-1', summaryId, content: null,
    expectedVersion: 1, reason: null, idempotencyKey,
  }))
  assert.equal(response.status, 503)
  assert.equal((await response.json()).error.code, 'REPORT_EXTERNAL_SUMMARY_READBACK_REQUIRED')
  assert.equal(calls, 2)
})
