import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import type { SupabaseClient } from '@supabase/supabase-js'

import { createSupabaseSwapRequestRepository } from '../lib/services/supabaseSwapRequestService.ts'

const migrationPath = new URL('../supabase/migrations/20260826082055_shift_swap_p0_hardening.sql', import.meta.url)
const lockFixMigrationPath = new URL('../supabase/migrations/20260826083723_shift_swap_lock_helper_fix.sql', import.meta.url)
const readText = async (path: URL) => (await readFile(path, 'utf8')).replace(/\r\n/g, '\n')

test('P0 migration uses a typed swap request row for RETURNING and explicit modes', async () => {
  const sql = await readText(migrationPath)
  assert.match(sql, /created_request\s+public\.swap_requests;/)
  assert.match(sql, /p_source_registration_id\s+text,\s*\n\s*p_mode\s+text,/)
  assert.match(sql, /p_mode\s+not in \('replacement','move','exchange'\)/)
  assert.match(sql, /returning \* into created_request;/)
  assert.doesNotMatch(sql, /source_registration\s+public\.shift_registrations;[\s\S]{0,2000}returning \* into source_registration;/)
})

test('lock helper fixes the unnamed unnest column with an explicit alias', async () => {
  const sql = await readText(lockFixMigrationPath)
  assert.match(sql, /from unnest\(coalesce\(p_ids, '\{\}'::text\[\]\)\) as u\(value\)/)
  assert.match(sql, /select distinct u\.value[\s\S]*order by u\.value/)
  assert.doesNotMatch(sql, /select distinct value from unnest/)
  assert.match(sql, /security definer[\s\S]*set search_path = ''/)
  assert.match(sql, /revoke all on function private\.lock_swap_rows\(text\[\]\)/)
})

test('P0 migration defines replacement/move/exchange guards and corrected exchange exclusions', async () => {
  const sql = await readText(migrationPath)
  assert.match(sql, /p_mode = 'replacement'/)
  assert.match(sql, /p_mode = 'move'/)
  assert.match(sql, /else\n\s+if p_target_shift_id is null or p_counterpart_registration_id is null/)
  assert.match(sql, /assert_shift_capacity\(target_shift, request_row\.operational_role, counterpart_registration\.id\)/)
  assert.match(sql, /assert_shift_capacity\(source_shift, request_row\.operational_role, source_registration\.id\)/)
  assert.match(sql, /assert_no_shift_registration_conflict\(requester\.id, target_shift, request_row\.operational_role, source_registration\.id\)/)
  assert.match(sql, /assert_no_shift_registration_conflict\(counterpart_user\.id, source_shift, request_row\.operational_role, counterpart_registration\.id\)/)
})

test('P0 migration protects direct writes, legal transitions and counterpart reuse', async () => {
  const sql = await readText(migrationPath)
  assert.match(sql, /revoke all on table public\.swap_requests from public, anon, authenticated;/)
  assert.match(sql, /grant select on table public\.swap_requests to authenticated;/)
  assert.match(sql, /swap_requests_counterpart_active_unique/)
  assert.match(sql, /old\.status = 'pending' and new\.status in \('accepted','approved','rejected','cancelled'\)/)
  assert.match(sql, /old\.status = 'accepted' and new\.status in \('approved','rejected','cancelled'\)/)
  assert.match(sql, /old\.status = 'approved' and new\.status = 'completed'/)
  assert.match(sql, /create or replace function public\.reject_shift_swap_request/)
  assert.match(sql, /update public\.swap_requests set status='approved'/)
  assert.match(sql, /update public\.swap_requests set status='completed'/)
  assert.match(sql, /lock_swap_registrations\(array_remove\(array\[request_row\.source_registration_id,request_row\.counterpart_registration_id\]/)
  assert.match(sql, /lock_swap_shifts\(array_remove\(array\[request_row\.source_shift_id,coalesce\(request_row\.target_shift_id,request_row\.source_shift_id\)\]/)
  assert.match(sql, /lock_swap_users\(array_remove\(array\[[\s\S]*request_row\.requester_id,[\s\S]*request_row\.counterpart_id,[\s\S]*request_row\.replacement_staff_id/)
})

test('participant lock sets are normalized as complete deterministic sets', async () => {
  const sql = await readText(migrationPath)
  assert.match(sql, /perform private\.lock_swap_rows\(array_remove\(array\[/)
  assert.match(sql, /lock_swap_registrations\(array_remove\(array\[p_source_registration_id,[\s\S]*p_counterpart_registration_id/)
  assert.match(sql, /case when p_mode = 'replacement' then 'user:' \|\| p_replacement_staff_id end/)
  assert.match(sql, /'user:' \|\| request_row\.replacement_staff_id/)
  assert.doesNotMatch(sql, /perform private\.lock_swap_users\(array\[requester\.id, replacement_id\]\)/)

  const normalized = (ids: Array<string | null | undefined>) => [...new Set(ids.filter((id): id is string => Boolean(id)))].sort()
  const exchangeA = normalized(['registration:source', 'registration:counterpart', 'shift:source', 'shift:target', 'user:requester', 'user:counterpart'])
  const exchangeB = normalized(['registration:counterpart', 'registration:source', 'shift:target', 'shift:source', 'user:counterpart', 'user:requester'])
  const replacementA = normalized(['registration:source-a', 'shift:source-a', 'user:requester-a', 'user:replacement-b'])
  const replacementB = normalized(['user:replacement-b', 'registration:source-a', 'user:requester-a', 'shift:source-a'])
  assert.deepEqual(exchangeA, exchangeB)
  assert.deepEqual(replacementA, replacementB)

  const createBody = sql.slice(sql.indexOf('create or replace function public.create_shift_swap_request'), sql.indexOf('revoke all on function public.create_shift_swap_request'))
  assert.ok(createBody.indexOf('lock_swap_registrations') < createBody.indexOf('lock_swap_shifts'))
  assert.ok(createBody.indexOf('lock_swap_shifts') < createBody.indexOf('lock_swap_rows'))
  assert.ok(createBody.indexOf('lock_swap_rows') < createBody.indexOf('lock_swap_users'))
  const approvalBody = sql.slice(sql.indexOf('create or replace function public.approve_shift_swap_request'), sql.indexOf('revoke all on function public.approve_shift_swap_request'))
  assert.ok(approvalBody.indexOf('lock_swap_registrations') < approvalBody.indexOf('lock_swap_shifts'))
  assert.ok(approvalBody.indexOf('lock_swap_shifts') < approvalBody.indexOf('lock_swap_rows'))
  assert.ok(approvalBody.indexOf('lock_swap_rows') < approvalBody.indexOf('lock_swap_users'))
})

test('SQL and TypeScript use canonical actor_id history entries', async () => {
  const sql = await readFile(migrationPath, 'utf8')
  assert.match(sql, /'actor_id',actor_id/)
  assert.doesNotMatch(sql, /jsonb_build_object\([^\n]*'by'/)
  const source = await readText(new URL('../lib/services/dataService.ts', import.meta.url))
  const mock = await readText(new URL('../lib/services/mockData.ts', import.meta.url))
  const excel = await readText(new URL('../lib/utils/excelUtils.ts', import.meta.url))
  assert.doesNotMatch(source, /approval_history:[^\n]*\bby:/)
  assert.doesNotMatch(mock, /approval_history:[^\n]*\bby:/)
  assert.match(excel, /item\.actor_id/)
  assert.match(source, /mode: request\.mode/)
  assert.match(source, /newRequest\.approval_history = \[swapHistoryEntry\(newRequest, 'created'/)
  assert.match(mock, /approval_history: \[\{ action: 'created', actor_id: '3', mode: 'replacement'/)
  assert.match(sql, /'mode',created_request\.mode/)
})

test('mock create history is canonical for replacement and exchange', async () => {
  const source = await readText(new URL('../lib/services/dataService.ts', import.meta.url))
  const createBranches = [...source.matchAll(/const newRequest: SwapRequest = \{[\s\S]*?\n      \} as SwapRequest\n      newRequest\.approval_history = \[swapHistoryEntry\(newRequest, 'created',[\s\S]*?\n      swapRequests\.push\(newRequest\)/g)]
  assert.equal(createBranches.length, 2)
  assert.match(source, /source_registration_id: request\.source_registration_id/)
  assert.match(source, /counterpart_registration_id: request\.counterpart_registration_id \?\? null/)
})

test('Supabase service sends explicit mode and exact registration identifiers', async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = []
  const row = {
    id: 'swap-1', requester_id: 'user-1', source_registration_id: 'reg-1', source_shift_id: 'shift-1',
    target_shift_id: 'shift-2', counterpart_registration_id: 'reg-2', counterpart_id: 'user-2',
    operational_role: 'host', mode: 'exchange', status: 'pending', reason: 'coverage', notes: null,
    created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', approval_history: [],
  }
  const client = {
    from: () => ({ select: () => ({}) }),
    rpc: (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args })
      return { single: async () => ({ data: row, error: null }) }
    },
  } as unknown as SupabaseClient
  const repository = createSupabaseSwapRequestRepository(client)
  await repository.create({
    sourceRegistrationId: 'reg-1', targetShiftId: 'shift-2', counterpartRegistrationId: 'reg-2',
    replacementStaffId: null, operational_role: 'host', reason: 'coverage', notes: 'swap', mode: 'exchange',
  })
  await repository.reject('swap-1', 'not available')
  assert.deepEqual(calls[0], {
    name: 'create_shift_swap_request',
    args: {
      p_source_registration_id: 'reg-1', p_mode: 'exchange', p_reason: 'coverage',
      p_target_shift_id: 'shift-2', p_replacement_staff_id: null,
      p_counterpart_registration_id: 'reg-2', p_notes: 'swap',
    },
  })
  assert.equal(calls[1].name, 'reject_shift_swap_request')
  assert.deepEqual(calls[1].args, { p_request_id: 'swap-1', p_notes: 'not available', p_expected_version: null })
})
