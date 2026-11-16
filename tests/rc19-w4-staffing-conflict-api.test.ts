import assert from 'node:assert/strict'
import test from 'node:test'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createStaffingReplacementHandler } from '../lib/server/staffingReplacementHandler.ts'
import { createSupabaseShiftRegistrationRepository } from '../lib/services/supabaseShiftRegistrationService.ts'

const input = {
  shiftId: 'shift-a', staffingSegmentId: 'segment-a', registrationId: 'registration-a',
  replacementUserId: 'member-b', role: 'host', expectedShiftVersion: 3,
  expectedRegistrationVersion: 2, effectiveAt: '2026-11-16T12:00:00+07:00',
  reason: 'Coverage replacement', emergency: false, idempotencyKey: '9a93cace-ea80-40d4-9bf5-16cc93df711d',
}

function request(body = input, origin = 'https://ops.test') {
  return new Request('https://ops.test/api/staffing/replacements', {
    method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(body),
  })
}

test('staffing replacement maps only its SQLSTATE 40001 version conflicts to HTTP 409', async () => {
  const seen: string[] = []
  let error: { code: string; message: string } = { code: '40001', message: 'SHIFT_VERSION_CONFLICT' }
  const handler = createStaffingReplacementHandler({
    resolveUser: async () => ({ id: 'auth-admin', businessUserId: 'admin-1', systemPermission: 'admin' }),
    createClient: async () => ({ rpc: (name: string) => {
      seen.push(name)
      return { single: async () => ({ data: null, error }) }
    } } as unknown as SupabaseClient),
  })
  const response = await handler(request())
  assert.equal(response.status, 409)
  assert.deepEqual(await response.json(), { ok: false, error: { code: 'SHIFT_VERSION_CONFLICT' } })
  error = { code: '40001', message: 'REGISTRATION_VERSION_CONFLICT' }
  const registrationConflict = await handler(request())
  assert.equal(registrationConflict.status, 409)
  assert.deepEqual(await registrationConflict.json(), { ok: false, error: { code: 'REGISTRATION_VERSION_CONFLICT' } })
  assert.equal(seen.length, 2)
})

test('staffing replacement denies Member before calling the mutation RPC', async () => {
  let calls = 0
  const member = createStaffingReplacementHandler({
    resolveUser: async () => ({ id: 'auth-member', businessUserId: 'member-1', systemPermission: 'member' }),
    createClient: async () => ({ rpc: () => { calls += 1; return { single: async () => ({ data: null, error: null }) } } } as unknown as SupabaseClient),
  })
  const denied = await member(request())
  assert.equal(denied.status, 403)
  assert.equal(calls, 0)
})

test('replacement client sends one same-origin API request and surfaces the structured conflict code', async () => {
  const originalFetch = globalThis.fetch
  const requests: Array<{ url: RequestInfo | URL; init?: RequestInit }> = []
  globalThis.fetch = async (url, init) => {
    requests.push({ url, init })
    return Response.json({ ok: false, error: { code: 'SHIFT_VERSION_CONFLICT' } }, { status: 409 })
  }
  try {
    const repository = createSupabaseShiftRegistrationRepository({} as SupabaseClient)
    await assert.rejects(repository.replaceAssignment(input), error => {
      assert.equal((error as { code?: string }).code, 'SHIFT_VERSION_CONFLICT')
      return true
    })
    assert.equal(requests.length, 1)
    assert.equal(requests[0].url, '/api/staffing/replacements')
    assert.equal(requests[0].init?.method, 'POST')
    assert.equal(JSON.parse(String(requests[0].init?.body)).idempotencyKey, input.idempotencyKey)
  } finally {
    globalThis.fetch = originalFetch
  }
})
