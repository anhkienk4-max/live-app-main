import assert from 'node:assert/strict'
import test from 'node:test'
import type { SupabaseClient } from '@supabase/supabase-js'
import { createSupabaseSwapRequestRepository } from '../lib/services/supabaseSwapRequestService.ts'

test('SWAP-01 preflight calls the actor-scoped RPC and accepts only known statuses', async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = []
  let response: { data: unknown; error: { message: string; code?: string } | null } = { data: 'VERIFIED_CLEAR', error: null }
  const client = {
    rpc: (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args })
      return Promise.resolve(response)
    },
  } as unknown as SupabaseClient
  const repository = createSupabaseSwapRequestRepository(client)
  const input = { sourceRegistrationId: 'source-1', mode: 'exchange' as const, targetShiftId: 'target-1', counterpartRegistrationId: 'counterpart-1' }
  assert.equal(await repository.verifyConflict(input), 'VERIFIED_CLEAR')
  assert.deepEqual(calls[0], {
    name: 'check_shift_swap_conflict',
    args: {
      p_source_registration_id: 'source-1', p_mode: 'exchange',
      p_replacement_staff_id: null, p_target_shift_id: 'target-1', p_counterpart_registration_id: 'counterpart-1',
    },
  })
  response = { data: 'CONFLICT', error: null }
  assert.equal(await repository.verifyConflict(input), 'CONFLICT')
  response = { data: 'unexpected', error: null }
  assert.equal(await repository.verifyConflict(input), 'UNKNOWN')
  response = { data: null, error: { message: 'offline', code: 'NETWORK' } }
  await assert.rejects(() => repository.verifyConflict(input), /offline/)
})
