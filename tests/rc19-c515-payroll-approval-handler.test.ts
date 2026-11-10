import assert from 'node:assert/strict'
import test from 'node:test'
import { createWorkforceActualHandler } from '../lib/server/workforceActualHandler.ts'

const admin = async () => ({
  id: 'auth-admin', businessUserId: 'business-admin', systemPermission: 'admin' as const,
})
const leader = async () => ({
  id: 'auth-leader', businessUserId: 'business-leader', systemPermission: 'leader' as const,
})
const emptyDb = () => ({}) as never

function cancelledReviewDb(auditRows: Array<Record<string, unknown>>) {
  return (() => ({
    from(table: string) {
      let columns = ''
      const result = () => {
        if (table === 'workforce_actual_segments') {
          return columns === 'id,shift_id'
            ? { data: { id: 'segment-cancelled', shift_id: 'shift-cancelled' }, error: null }
            : { data: {
              id: 'segment-cancelled', shift_id: 'shift-cancelled', staff_id: 'staff-1',
              operational_role: 'host', event_kind: 'worked', coverage_kind: 'planned',
              evidence_note: 'Verified evidence', actual_start_at: '2026-11-10T02:00:00.000Z',
              actual_end_at: '2026-11-10T03:00:00.000Z', review_status: 'draft', version: 1,
              created_by: 'another-user',
            }, error: null }
        }
        if (table === 'shifts') return { data: { id: 'shift-cancelled', brand_id: 'brand-a', status: 'cancelled', host_id: 'staff-1' }, error: null }
        if (table === 'audit_logs') return { data: auditRows, error: null }
        return { data: [], error: null }
      }
      const query = {
        select(value: string) { columns = value; return query },
        eq() { return query }, is() { return query }, order() { return query }, limit() { return query },
        in() { return query }, or() { return query }, neq() { return query }, lt() { return query }, gt() { return query },
        async maybeSingle() { return result() },
        then(resolve: (value: ReturnType<typeof result>) => unknown, reject?: (reason: unknown) => unknown) {
          return Promise.resolve(result()).then(resolve, reject)
        },
      }
      return query
    },
  })) as never
}

const cancellationAudit = {
  created_at: '2026-11-10T03:30:00.000Z', actor_role: 'admin', actor_business_user_id: 'business-admin',
  before_data: { status: 'live' }, after_data: { id: 'shift-cancelled', status: 'cancelled' },
}

async function reviewCancelledSegment(db: ReturnType<typeof cancelledReviewDb>) {
  return createWorkforceActualHandler({ isEnabled: () => true, client: db, resolveUser: admin }).POST(
    new Request('https://ops.example/api/workforce/actual', {
      method: 'POST',
      body: JSON.stringify({ action: 'review', segment_id: 'segment-cancelled', expected_version: 1, decision: 'approved', review_note: 'Verified actual work' }),
    }),
  )
}

test('Admin confirmation uses authenticated RPC and returns the persisted hold state', async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = []
  const handler = createWorkforceActualHandler({
    isEnabled: () => true,
    client: emptyDb,
    resolveUser: admin,
    createScopeClient: () => ({ rpc: async (name, args) => {
      calls.push({ name, args: args as Record<string, unknown> })
      return { data: { state: 'payroll_hold', version: 2, missing_evidence: ['final_report'], replayed: false }, error: null }
    } }) as never,
  })
  const response = await handler.POST(new Request('https://ops.example/api/workforce/actual', {
    method: 'POST',
    body: JSON.stringify({
      action: 'confirm_payroll', segment_id: 'segment-1', expected_version: 1,
      idempotency_key: '10000000-0000-4000-8000-000000000001',
      reason: 'Reviewed the persisted report evidence',
    }),
  }))
  assert.equal(response.status, 200)
  assert.deepEqual(calls, [{
    name: 'rc19_c515_confirm_payroll_segment',
    args: {
      p_segment_id: 'segment-1', p_expected_version: 1,
      p_idempotency_key: '10000000-0000-4000-8000-000000000001',
      p_reason: 'Reviewed the persisted report evidence',
    },
  }])
  assert.deepEqual((await response.json()).decision.missing_evidence, ['final_report'])
})

test('cancelled-shift Actual approval rejects without a matching cancellation audit', async () => {
  const response = await reviewCancelledSegment(cancelledReviewDb([]))
  assert.equal(response.status, 409)
  assert.equal((await response.json()).error.code, 'WORKFORCE_CANCELLED_SHIFT_NOT_AUDITED')
})

test('cancelled-shift Actual approval rejects work ending after the audited cancellation', async () => {
  const response = await reviewCancelledSegment(cancelledReviewDb([{
    ...cancellationAudit, created_at: '2026-11-10T02:59:59.000Z',
  }]))
  assert.equal(response.status, 409)
  assert.equal((await response.json()).error.code, 'WORKFORCE_CANCELLED_SHIFT_ACTUAL_AFTER_CANCELLATION')
})

test('Leader cannot invoke final Admin Payroll confirmation', async () => {
  let rpcCalls = 0
  const handler = createWorkforceActualHandler({
    isEnabled: () => true,
    client: () => { throw new Error('unauthorized actor reached privileged database client') },
    resolveUser: leader,
    createScopeClient: () => ({ rpc: async () => { rpcCalls++; return { data: null, error: null } } }) as never,
  })
  const response = await handler.POST(new Request('https://ops.example/api/workforce/actual', {
    method: 'POST',
    body: JSON.stringify({
      action: 'confirm_payroll', segment_id: 'segment-1', expected_version: 1,
      idempotency_key: '10000000-0000-4000-8000-000000000002',
      reason: 'Trying to approve own Leader decision',
    }),
  }))
  assert.equal(response.status, 403)
  assert.equal(rpcCalls, 0)
})

test('Admin confirmation fails closed when the database authorization RPC is unavailable', async () => {
  const handler = createWorkforceActualHandler({
    isEnabled: () => true,
    client: emptyDb,
    resolveUser: admin,
    createScopeClient: () => ({ rpc: async () => ({ data: null, error: { message: 'C515_PAYROLL_ADMIN_CONFIRMATION_FORBIDDEN' } }) }) as never,
  })
  const response = await handler.POST(new Request('https://ops.example/api/workforce/actual', {
    method: 'POST',
    body: JSON.stringify({
      action: 'confirm_payroll', segment_id: 'segment-1', expected_version: 0,
      idempotency_key: '10000000-0000-4000-8000-000000000003',
      reason: 'Review only after verified evidence',
    }),
  }))
  assert.equal(response.status, 409)
  assert.equal((await response.json()).ok, false)
})

const compensationBody = {
  action: 'propose_cancellation_compensation', shift_id: 'shift-a', staff_id: 'staff-a',
  operational_role: 'host', actual_segment_id: 'actual-a', registration_id: null,
  period_id: 'period-a', cancellation_reason: 'Brand cancelled after partial work',
  reason: 'Exceptional travel cost reviewed', evidence_receipt_id: 'receipt-a',
  proposed_amount_vnd: 45000, idempotency_key: '10000000-0000-4000-8000-000000000014',
}

test('Leader compensation proposal goes through authenticated RPC and waits for Admin', async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = []
  const handler = createWorkforceActualHandler({
    isEnabled: () => true,
    client: emptyDb,
    resolveUser: leader,
    createScopeClient: () => ({ rpc: async (name, args) => {
      calls.push({ name, args: args as Record<string, unknown> })
      return { data: { case: { state: 'pending_admin_confirmation' }, adjustment: null, replayed: false }, error: null }
    } }) as never,
  })
  const response = await handler.POST(new Request('https://ops.example/api/workforce/actual', {
    method: 'POST', body: JSON.stringify(compensationBody),
  }))
  assert.equal(response.status, 201)
  assert.equal((await response.json()).case.state, 'pending_admin_confirmation')
  assert.equal(calls.length, 1)
  assert.equal(calls[0].name, 'rc19_c515_propose_cancellation_compensation')
  assert.equal(calls[0].args.p_shift_id, 'shift-a')
  assert.equal(calls[0].args.p_proposed_amount_vnd, 45000)
  assert.equal('p_actor_id' in calls[0].args, false)
})

test('foreign Brand compensation proposal is denied by the authoritative authenticated RPC', async () => {
  let rpcCalls = 0
  const handler = createWorkforceActualHandler({
    isEnabled: () => true,
    client: emptyDb,
    resolveUser: leader,
    createScopeClient: () => ({ rpc: async () => {
      rpcCalls++
      return { data: null, error: { message: 'C515_COMPENSATION_BRAND_SCOPE_DENIED', code: '42501' } }
    } }) as never,
  })
  const response = await handler.POST(new Request('https://ops.example/api/workforce/actual', {
    method: 'POST', body: JSON.stringify(compensationBody),
  }))
  assert.equal(response.status, 403)
  assert.equal(rpcCalls, 1)
  assert.equal((await response.json()).ok, false)
})

test('Member compensation proposal is denied before authenticated RPC or database access', async () => {
  let rpcCalls = 0
  const handler = createWorkforceActualHandler({
    isEnabled: () => true,
    client: () => { throw new Error('member reached privileged database client') },
    resolveUser: async () => ({ id: 'auth-member', businessUserId: 'business-member', systemPermission: 'member' as const }),
    createScopeClient: () => ({ rpc: async () => { rpcCalls++; return { data: null, error: null } } }) as never,
  })
  const response = await handler.POST(new Request('https://ops.example/api/workforce/actual', {
    method: 'POST', body: JSON.stringify(compensationBody),
  }))
  assert.equal(response.status, 403)
  assert.equal(rpcCalls, 0)
})

test('Admin compensation proposal uses the same RPC and may return an immediate confirmed adjustment', async () => {
  const handler = createWorkforceActualHandler({
    isEnabled: () => true,
    client: emptyDb,
    resolveUser: admin,
    createScopeClient: () => ({ rpc: async name => name === 'rc19_c515_propose_cancellation_compensation'
      ? { data: { case: { state: 'admin_confirmed' }, adjustment: { amount_vnd: 45000 }, replayed: false }, error: null }
      : { data: null, error: { message: 'UNEXPECTED_RPC' } } }) as never,
  })
  const response = await handler.POST(new Request('https://ops.example/api/workforce/actual', {
    method: 'POST', body: JSON.stringify(compensationBody),
  }))
  assert.equal(response.status, 201)
  const body = await response.json()
  assert.equal(body.case.state, 'admin_confirmed')
  assert.equal(body.adjustment.amount_vnd, 45000)
})

test('concurrent compensation proposals for the same actual assignment surface as a conflict', async () => {
  const handler = createWorkforceActualHandler({
    isEnabled: () => true,
    client: emptyDb,
    resolveUser: leader,
    createScopeClient: () => ({ rpc: async () => ({
      data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' },
    }) }) as never,
  })
  const response = await handler.POST(new Request('https://ops.example/api/workforce/actual', {
    method: 'POST', body: JSON.stringify(compensationBody),
  }))
  assert.equal(response.status, 409)
  assert.equal((await response.json()).ok, false)
})
