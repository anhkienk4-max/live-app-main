import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { formatRegistrationErrorMessage } from '@/lib/utils/shiftRegistration'

const migration = readFileSync(new URL('../supabase/migrations/20261115120000_rc19_w4_legacy_segment_compatibility.sql', import.meta.url), 'utf8')
const manualAssignmentMigration = readFileSync(new URL('../supabase/migrations/20261115130000_rc19_w4_segmented_manual_assignment.sql', import.meta.url), 'utf8')
const passSwapMigration = readFileSync(new URL('../supabase/migrations/20261115140000_rc19_w4_pass_swap_segment_preservation.sql', import.meta.url), 'utf8')
const swapApprovalGuardMigration = readFileSync(new URL('../supabase/migrations/20261115174231_rc19_w4_retire_unguarded_swap_approval.sql', import.meta.url), 'utf8')
const migrationRunner = readFileSync(new URL('../scripts/rc19-c4-migration-rehearsal/run-c5.11-isolated-db.py', import.meta.url), 'utf8')
const dialog = readFileSync(new URL('../components/features/calendar/AtomicStaffingReplacementDialog.tsx', import.meta.url), 'utf8')
const staffingPanel = readFileSync(new URL('../components/features/calendar/StaffingActionPanel.tsx', import.meta.url), 'utf8')
const repository = readFileSync(new URL('../lib/services/supabaseShiftRegistrationService.ts', import.meta.url), 'utf8')

test('legacy segment migration maps only deterministic new assignments and keeps old rows untouched', () => {
  const triggerStart = migration.indexOf('CREATE OR REPLACE FUNCTION private.c511_guard_segment_registration()')
  const triggerEnd = migration.indexOf('CREATE OR REPLACE FUNCTION public.replace_shift_assignment(', triggerStart)
  const trigger = migration.slice(triggerStart, triggerEnd)
  assert.ok(triggerStart >= 0 && triggerEnd > triggerStart)
  assert.match(migration, /^BEGIN;/)
  assert.match(migration.trimEnd(), /COMMIT;$/)
  assert.match(migration, /W4_LEGACY_SEGMENT_COMPATIBILITY_PRECONDITION_FAILED/)
  assert.match(trigger, /IF TG_OP <> 'INSERT' THEN\s+RETURN NEW;/)
  assert.match(trigger, /IF v_segment_count = 0 THEN\s+RETURN NEW;/)
  assert.match(trigger, /IF v_role_segment_count = 0 THEN[\s\S]*STAFFING_SEGMENT_ROLE_INCOMPATIBLE/)
  assert.match(trigger, /IF v_role_segment_count > 1 THEN[\s\S]*STAFFING_SEGMENT_SELECTION_REQUIRED/)
  assert.match(trigger, /NEW\.staffing_segment_id := v_segment\.id/)
  assert.match(trigger, /FOR UPDATE/)
  assert.match(trigger, /STAFFING_SEGMENT_FULL/)
  assert.doesNotMatch(trigger, /UPDATE\s+public\.shift_registrations/i)
})

test('legacy replacement requires an explicit role-compatible segment and preserves null in history', () => {
  const rpcStart = migration.indexOf('CREATE OR REPLACE FUNCTION public.replace_shift_assignment(')
  const rpcEnd = migration.indexOf('ALTER FUNCTION public.replace_shift_assignment(', rpcStart)
  const rpc = migration.slice(rpcStart, rpcEnd)
  assert.ok(rpcStart >= 0 && rpcEnd > rpcStart)
  assert.match(rpc, /v_old\.staffing_segment_id IS NOT NULL[\s\S]*ASSIGNMENT_SEGMENT_MISMATCH/)
  assert.match(rpc, /v_old\.staffing_segment_id IS NULL AND \(CASE p_role[\s\S]*ASSIGNMENT_SEGMENT_ROLE_INCOMPATIBLE/)
  assert.match(rpc, /'staffing_segment_id', v_old\.staffing_segment_id/)
  assert.match(rpc, /'legacy_parent_assignment_mapped', v_old\.staffing_segment_id IS NULL/)
  assert.ok(rpc.indexOf('v_old_assignment_snapshot :=') < rpc.indexOf('UPDATE public.shift_registrations'))
})

test('legacy replacement UI reads authorized segments and requires explicit choice when ambiguous', () => {
  assert.match(repository, /getSegmentsForShift\(shiftId: string\)/)
  assert.match(repository, /from\('shift_staffing_segments'\)[\s\S]*?eq\('shift_id', shiftId\)/)
  assert.match(dialog, /shiftRegistrationService\.getSegmentsForShift\(shift\.id\)/)
  assert.match(dialog, /roleCompatibleLegacySegments\.length === 1/)
  assert.match(dialog, /roleCompatibleLegacySegments\.length > 1/)
  assert.match(dialog, /Chọn phân đoạn phù hợp/)
  assert.match(dialog, /original|phân công cũ không đổi/i)
  assert.match(dialog, /legacySegments\.length === 0/)
})

test('ambiguous and role-incompatible parent-level assignment errors are actionable', () => {
  assert.match(formatRegistrationErrorMessage('STAFFING_SEGMENT_SELECTION_REQUIRED'), /chọn rõ phân đoạn/i)
  assert.match(formatRegistrationErrorMessage('STAFFING_SEGMENT_ROLE_INCOMPATIBLE'), /không có phân đoạn/i)
})

test('explicit segmented manual assignment is actor-, capability-, Brand- and version-checked', () => {
  const rpc = manualAssignmentMigration.slice(
    manualAssignmentMigration.indexOf('CREATE OR REPLACE FUNCTION public.manual_assign_shift_staff_to_segment('),
    manualAssignmentMigration.indexOf('ALTER FUNCTION public.manual_assign_shift_staff_to_segment('),
  )
  assert.match(rpc, /SECURITY DEFINER\s+SET search_path = ''/i)
  assert.match(rpc, /private\.require_shift_actor\(true\)/)
  assert.match(rpc, /rbac01_effective_permission\('shifts\.assign_staff'\)/)
  assert.match(rpc, /rc19_has_any_leader_brand_scope/)
  assert.match(rpc, /assert_expected_version/)
  assert.match(rpc, /insert_manual_shift_assignment_to_segment/)
  assert.match(manualAssignmentMigration, /GRANT EXECUTE[\s\S]*TO authenticated/)
  assert.match(manualAssignmentMigration, /REVOKE ALL[\s\S]*FROM PUBLIC, anon, service_role/)
  assert.match(repository, /client\.rpc\('manual_assign_shift_staff_to_segment'/)
  assert.match(staffingPanel, /Chọn phân đoạn phân công/)
})

test('PASS replacement and exchange retain the users persisted segment positions', () => {
  const rpc = passSwapMigration.slice(
    passSwapMigration.indexOf('create or replace function public.approve_shift_swap_request('),
    passSwapMigration.indexOf('ALTER FUNCTION public.approve_shift_swap_request('),
  )
  assert.match(
    rpc,
    /if request_row\.mode = 'replacement' then[\s\S]*?set status = 'cancelled'[\s\S]*?where id = source_registration\.id;[\s\S]*?insert into public\.shift_registrations/i,
    'free the incumbent segment capacity before inserting its replacement; the transaction rolls back if insertion fails',
  )
  assert.match(rpc, /source_registration\.staffing_segment_id/)
  assert.match(rpc, /counterpart_registration\.staffing_segment_id/)
  assert.equal((rpc.match(/updated_at, staffing_segment_id/g) ?? []).length, 2)
  assert.match(rpc, /set status = 'approved'[\s\S]*?returning \* into request_row;[\s\S]*?set status = 'completed'[\s\S]*?returning \* into request_row;/i)
})

test('swap approval exposes only the locked expected-version RPC to authenticated clients', () => {
  const approvalRpc = passSwapMigration.slice(
    passSwapMigration.indexOf('create or replace function public.approve_shift_swap_request('),
    passSwapMigration.indexOf('ALTER FUNCTION public.approve_shift_swap_request('),
  )
  assert.match(approvalRpc, /SECURITY DEFINER[\s\S]*?private\.require_shift_actor\(true\)/i)
  assert.match(swapApprovalGuardMigration, /SELECT version INTO current_version[\s\S]*?FOR UPDATE/i)
  assert.match(swapApprovalGuardMigration, /private\.assert_expected_version\('SwapRequest', p_expected_version, current_version\)/)
  assert.match(swapApprovalGuardMigration, /REVOKE ALL ON FUNCTION public\.approve_shift_swap_request\(text, text\) FROM PUBLIC, anon, authenticated, service_role/i)
  assert.match(swapApprovalGuardMigration, /GRANT EXECUTE ON FUNCTION public\.approve_shift_swap_request\(text, text, integer\) TO authenticated/i)
  assert.match(swapApprovalGuardMigration, /REVOKE ALL ON FUNCTION public\.approve_shift_swap_request\(text, text, integer\) FROM PUBLIC, anon, service_role/i)
  assert.match(swapApprovalGuardMigration, /W4_SWAP_APPROVAL_VERSION_GUARD_PRIVILEGE_CHECK_FAILED/)
  assert.match(migrationRunner, /\("20261115174231", ROOT \/ "supabase\/migrations\/20261115174231_rc19_w4_retire_unguarded_swap_approval\.sql"/)
  assert.match(migrationRunner, /\("20261116120000", ROOT \/ "supabase\/migrations\/20261116120000_rc19_w4_swap_preflight_and_segment_capacity\.sql"/)
})
