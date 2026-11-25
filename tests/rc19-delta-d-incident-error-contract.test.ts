import assert from 'node:assert/strict'
import test from 'node:test'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createStaffingIncidentReplacementHandler } from '../lib/server/staffingIncidentReplacementHandler.ts'

const body = {
  shiftId: 'synthetic-shift',
  staffingSegmentId: 'synthetic-segment',
  registrationId: 'synthetic-registration',
  replacementUserId: 'ineligible-staff',
  role: 'host',
  expectedShiftVersion: 1,
  expectedRegistrationVersion: 1,
  effectiveAt: '2026-11-26T12:00:00+07:00',
  reason: 'Synthetic candidate eligibility rejection',
  isEmergency: false,
  idempotencyKey: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
  incidentType: 'planned_reassignment',
  evidenceReferenceId: null,
}

test('incident replacement preserves the database role eligibility error code', async () => {
  let rpcCalls = 0
  const handler = createStaffingIncidentReplacementHandler({
    resolveUser: async () => ({ id: 'auth-leader', businessUserId: 'leader-1', systemPermission: 'leader' }),
    createClient: async () => ({
      rpc: () => {
        rpcCalls += 1
        return { single: async () => ({ data: null, error: { code: '22023', message: 'ROLE_NOT_QUALIFIED' } }) }
      },
    } as unknown as SupabaseClient),
  })

  const response = await handler(new Request('https://ops.test/api/staffing/replacements/incident-v1', {
    method: 'POST',
    headers: { origin: 'https://ops.test', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  }))

  assert.equal(response.status, 400)
  assert.deepEqual(await response.json(), { ok: false, error: { code: 'ROLE_NOT_QUALIFIED' } })
  assert.equal(rpcCalls, 1)
})
