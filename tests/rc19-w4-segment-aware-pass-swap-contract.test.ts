import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const migration = readFileSync(new URL('../supabase/migrations/20261126150000_rc19_w4_segment_aware_pass_swap.sql', import.meta.url), 'utf8')
const receiptMigration = readFileSync(new URL('../supabase/migrations/20261127100000_rc19_w4_segment_aware_swap_receipts.sql', import.meta.url), 'utf8')

function body(name: string) {
  const start = migration.indexOf(`function public.${name}(`)
  assert.notEqual(start, -1, `missing ${name}`)
  const end = migration.indexOf('$$function$', start) >= 0
    ? migration.indexOf('$$function$', start) + '$$function$'.length
    : migration.indexOf('$$;', start) + 3
  assert.ok(end > start, `missing body terminator for ${name}`)
  return migration.slice(start, end)
}

test('segment-aware swap uses exact registration identity and allows same-parent exchange', () => {
  assert.match(migration, /CHECK \(target_shift_id IS NULL OR mode = 'exchange' OR source_shift_id <> target_shift_id\)/u)
  assert.doesNotMatch(migration, /SWAP_SAME_SHIFT_EXCHANGE_NOT_ALLOWED/u)
  const create = body('create_shift_swap_request')
  const approve = body('approve_shift_swap_request')
  assert.match(create, /source_registration_id, source_shift_id, target_shift_id/u)
  assert.match(create, /p_source_registration_id/u)
  assert.match(create, /counterpart_registration\.id/u)
  assert.match(approve, /request_row\.source_registration_id/u)
  assert.match(approve, /request_row\.counterpart_registration_id/u)
  assert.match(approve, /source_registration\.staffing_segment_id/u)
  assert.match(approve, /counterpart_registration\.staffing_segment_id/u)
  assert.match(migration, /CREATE FUNCTION public\.get_swap_exchange_candidates_v2/u)
  assert.match(migration, /operational_role text,[\s\S]*staffing_segment_id text,[\s\S]*segment_index smallint,[\s\S]*effective_start_at timestamptz,[\s\S]*effective_end_at timestamptz/u)
  assert.match(migration, /registration\.operational_role::text/u)
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.get_swap_exchange_candidates_v2\(text,text\) TO authenticated/u)
})

test('segment interval and capacity checks are half-open, segment-scoped, and fail closed on ambiguous segmented rows', () => {
  assert.match(migration, /RETURN tstzrange\(v_shift\.start_at, v_shift\.end_at, '\[\)'\)/u)
  assert.match(migration, /RETURN tstzrange\(v_segment\.start_at, v_segment\.end_at, '\[\)'\)/u)
  assert.match(migration, /SWAP_SEGMENT_SELECTION_REQUIRED/u)
  assert.match(migration, /v_existing_range && v_target_range/u)
  assert.match(migration, /WHERE staffing_segment_id = p_segment_id/u)
  assert.match(migration, /where shift_id = p_shift_id and staffing_segment_id is null/iu)
  assert.match(migration, /ARRAY\[source_registration\.id, counterpart_registration\.id\], 2/u)
})

test('PASS preserves approved daily/campaign timing and the live-start denial', () => {
  const create = body('create_shift_swap_request')
  const approve = body('approve_shift_swap_request')
  assert.match(create, /DAILY_PASS_DEADLINE_EXCEEDED/u)
  assert.match(create, /interval '2 hours'/u)
  assert.match(create, /CAMPAIGN_PASS_DEADLINE_EXCEEDED/u)
  assert.match(create, /interval '24 hours'/u)
  assert.match(create, /PASS_DURING_LIVE_NOT_ALLOWED/u)
  assert.match(approve, /PASS_DURING_LIVE_NOT_ALLOWED/u)
  assert.match(approve, /CAMPAIGN_PASS_APPROVAL_DEADLINE_EXCEEDED/u)
  assert.match(approve, /EXCHANGE_DURING_LIVE_NOT_ALLOWED/u)
})

test('version-fenced approval remains behind the authenticated receipt entrypoint', () => {
  assert.match(migration, /REVOKE ALL ON FUNCTION public\.approve_shift_swap_request\(text,text\)\s+FROM PUBLIC, anon, authenticated, service_role/u)
  assert.match(migration, /GRANT EXECUTE ON FUNCTION public\.approve_shift_swap_request\(text,text,integer\)\s+TO authenticated/u)
  assert.match(migration, /W4_SEGMENT_SWAP_RPC_PRIVILEGE_CHECK_FAILED/u)
  assert.match(receiptMigration, /REVOKE ALL ON FUNCTION public\.approve_shift_swap_request\(text,text,integer\) FROM PUBLIC, anon, authenticated, service_role/u)
  assert.match(receiptMigration, /GRANT EXECUTE ON FUNCTION public\.shift_swap_operation_v1\(text,text,jsonb,uuid\) TO authenticated/u)
})

test('swap mutations check canonical active Agency membership for incoming assignments', () => {
  assert.match(migration, /private\.rc19_assert_swap_agency_scope\(replacement_user\.id, source_shift\.id\)/u)
  assert.match(migration, /private\.rc19_assert_swap_agency_scope\(counterpart_user\.id, source_shift\.id\)/u)
  assert.match(migration, /private\.rc19_assert_swap_agency_scope\(participant\.id, source_shift\.id\)/u)
  assert.match(migration, /RC19_AGENCY_SCOPE_UNRESOLVED/u)
})
