import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const migration = readFileSync(new URL('../supabase/migrations/20261113084154_rc19_c4_atomic_staffing_replacement.sql', import.meta.url), 'utf8')
const repository = readFileSync(new URL('../lib/services/supabaseShiftRegistrationService.ts', import.meta.url), 'utf8')
const dataService = readFileSync(new URL('../lib/services/dataService.ts', import.meta.url), 'utf8')

test('replacement is a fail-closed atomic, idempotent RPC over persisted staffing segments', () => {
  const rpcStart = migration.indexOf('CREATE OR REPLACE FUNCTION public.replace_shift_assignment(')
  const rpcEnd = migration.indexOf('ALTER FUNCTION public.replace_shift_assignment(', rpcStart)
  const rpc = migration.slice(rpcStart, rpcEnd)
  assert.ok(rpcStart >= 0 && rpcEnd > rpcStart)
  assert.match(migration, /^BEGIN;/)
  assert.match(migration.trimEnd(), /COMMIT;$/)
  assert.match(migration, /C4_REPLACEMENT_BASELINE_PRECONDITION_FAILED/)
  assert.match(migration, /public\.shift_staffing_segments/)
  assert.match(rpc, /SECURITY DEFINER\s+SET search_path = ''/i)
  assert.match(rpc, /private\.require_shift_actor\(true\)/)
  assert.match(rpc, /private\.current_business_user_is_active\(\)/)
  assert.match(rpc, /public\.rbac01_effective_permission\('shifts\.assign_staff'\)/)
  assert.match(rpc, /private\.rc19_has_any_leader_brand_scope\(v_shift\.brand_id/)
  assert.match(rpc, /v_permission <> 'admin'/)
  assert.match(rpc, /FOR UPDATE/)
  assert.match(rpc, /pg_advisory_xact_lock/)
  assert.match(rpc, /SHIFT_VERSION_CONFLICT/)
  assert.match(rpc, /REGISTRATION_VERSION_CONFLICT/)
  assert.match(rpc, /private\.assert_shift_role_eligibility/)
  assert.match(rpc, /private\.assert_no_shift_registration_conflict/)
  assert.match(rpc, /STAFFING_SEGMENT_CAPACITY_EXCEEDED/)
  assert.match(rpc, /old_assignment_snapshot/)
  assert.ok(rpc.indexOf('v_old_assignment_snapshot :=') < rpc.indexOf('UPDATE public.shift_registrations'))
  assert.ok(rpc.indexOf('INSERT INTO public.shift_registrations') < rpc.indexOf('INSERT INTO public.rc19_shift_assignment_replacements'))
  assert.match(rpc, /IDEMPOTENCY_KEY_REUSED/)
  assert.match(rpc, /private\.log_shift_audit/)
  assert.doesNotMatch(rpc, /UPDATE\s+(?:public\.)?(?:attendance|payroll)/i)
  assert.doesNotMatch(rpc, /DELETE\s+FROM\s+public\.shift_registrations/i)
})

test('replacement RPC is executable only by authenticated callers and never exposes its history table directly', () => {
  assert.match(migration, /ALTER TABLE public\.rc19_shift_assignment_replacements ENABLE ROW LEVEL SECURITY/i)
  assert.match(migration, /REVOKE ALL ON public\.rc19_shift_assignment_replacements FROM PUBLIC, anon, authenticated, service_role/i)
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.replace_shift_assignment\([\s\S]*?FROM PUBLIC, anon, service_role/i)
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.replace_shift_assignment\([\s\S]*?TO authenticated/i)
})

test('typed service forwards the complete request to the single authoritative RPC', () => {
  assert.match(repository, /replaceAssignment\(input: ReplaceShiftAssignmentInput\)/)
  assert.match(repository, /client\.rpc\('replace_shift_assignment'/)
  for (const field of [
    'p_shift_id', 'p_staffing_segment_id', 'p_registration_id', 'p_replacement_user_id',
    'p_role', 'p_expected_shift_version', 'p_expected_registration_version', 'p_effective_at',
    'p_reason', 'p_is_emergency', 'p_idempotency_key',
  ]) assert.match(repository, new RegExp(`${field}: input\\.`))
  assert.match(dataService, /replaceAssignment\(input: ReplaceShiftAssignmentInput\)/)
  assert.match(dataService, /getSupabaseShiftRegistrationRepository\(\)\.replaceAssignment\(input\)/)
})

test('UI capability gate uses the authenticated RPC and stops at a missing segment without mutation', () => {
  assert.match(repository, /verifyReplacementCapability\(shiftId: string, role: OperationalRole\)/)
  assert.match(repository, /p_staffing_segment_id: crypto\.randomUUID\(\)/)
  assert.match(repository, /STAFFING_SEGMENT_SHIFT_MISMATCH/)
  assert.match(dataService, /verifyReplacementCapability\(shiftId: string, role: OperationalRole\)/)
  assert.match(dataService, /getSupabaseShiftRegistrationRepository\(\)\.verifyReplacementCapability\(shiftId, role\)/)
})
