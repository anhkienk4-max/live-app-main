import assert from 'node:assert/strict'
import test from 'node:test'
import { createWorkforceIncidentMonthlyHandler } from '../lib/server/workforceIncidentMonthlyHandler.ts'

const admin = async () => ({
  id: 'auth-admin', businessUserId: 'business-admin', systemPermission: 'admin' as const,
})

const data = {
  month: '2026-11', timezone: 'Asia/Ho_Chi_Minh', pageLimit: 50, pageOffset: 0,
  totalIncidents: 2, totalDistinctShifts: 1, totalDistinctStaff: 1, staff: [{
    staff_id: 'staff-a', incident_count: 2, distinct_shift_count: 1,
    pending_count: 0, confirmed_count: 2, rejected_count: 0, corrected_count: 0,
    confirmed_skip_count: 0, confirmed_absent_count: 0, confirmed_authorized_absence_count: 0,
    confirmed_late_count: 2, confirmed_early_leave_count: 0,
    approved_pass_count: 0, approved_swap_count: 0,
    unknown_late_minutes_count: 1, verified_late_minutes_total: 7,
    items: [
      { incidentId: 'incident-a', shiftId: 'shift-a', staffingSegmentId: 'segment-a', role: 'host', businessDate: '2026-11-03', type: 'late', reviewState: 'confirmed', verifiedLateMinutes: 7, version: 2 },
      { incidentId: 'incident-b', shiftId: 'shift-a', staffingSegmentId: 'segment-a', role: 'host', businessDate: '2026-11-03', type: 'late', reviewState: 'confirmed', verifiedLateMinutes: null, version: 1 },
    ],
  }],
}

test('monthly incident API forwards all filters and validates server-authoritative totals', async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = []
  const handler = createWorkforceIncidentMonthlyHandler({
    resolveUser: admin,
    createClient: () => ({ rpc: async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args }); return { data, error: null }
    } }) as never,
  })
  const response = await handler.GET(new Request('https://ops.example/api/workforce/incidents/monthly?month=2026-11&agency_id=11111111-1111-4111-8111-111111111111&platform_id=platform-a&status=confirmed&incident_type=late'))
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('Cache-Control'), 'no-store')
  assert.deepEqual(calls, [{ name: 'rc19_workforce_incident_monthly_v2', args: {
      p_month: '2026-11-01', p_staff_id: null, p_brand_id: null, p_role: null,
      p_agency_id: '11111111-1111-4111-8111-111111111111', p_platform_id: 'platform-a',
      p_review_state: 'confirmed', p_incident_type: 'late', p_limit: 50, p_offset: 0,
  } }])
  const payload = await response.json()
  assert.equal(payload.data.staff[0].unknown_late_minutes_count, 1)
  assert.equal(payload.data.staff[0].verified_late_minutes_total, 7)
  assert.equal(payload.data.totalDistinctShifts, 1)
  assert.equal(payload.data.totalDistinctStaff, 1)
})

test('monthly incident API rejects malformed month without querying the database', async () => {
  let called = false
  const handler = createWorkforceIncidentMonthlyHandler({
    resolveUser: admin,
    createClient: () => ({ rpc: async () => { called = true; return { data, error: null } } }) as never,
  })
  const response = await handler.GET(new Request('https://ops.example/api/workforce/incidents/monthly?month=2026-13'))
  assert.equal(response.status, 400)
  assert.equal((await response.json()).error.code, 'WORKFORCE_MONTH_QUERY_INVALID')
  assert.equal(called, false)
})

test('monthly incident API rejects malformed RPC data rather than returning an untyped payload', async () => {
  const handler = createWorkforceIncidentMonthlyHandler({
    resolveUser: admin,
    createClient: () => ({ rpc: async () => ({ data: { ...data, timezone: 'UTC' }, error: null }) }) as never,
  })
  const response = await handler.GET(new Request('https://ops.example/api/workforce/incidents/monthly?month=2026-11'))
  assert.equal(response.status, 502)
  assert.equal((await response.json()).error.code, 'WORKFORCE_INCIDENT_SUMMARY_INVALID')
})

test('monthly incident API rejects invalid scope filters before querying the database', async () => {
  let called = false
  const handler = createWorkforceIncidentMonthlyHandler({
    resolveUser: admin,
    createClient: () => ({ rpc: async () => { called = true; return { data, error: null } } }) as never,
  })
  const response = await handler.GET(new Request('https://ops.example/api/workforce/incidents/monthly?month=2026-11&agency_id=bad&status=unknown'))
  assert.equal(response.status, 400)
  assert.equal(called, false)
})
