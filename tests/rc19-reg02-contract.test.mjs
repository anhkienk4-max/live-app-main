import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = path => readFileSync(path, 'utf8')
const migration = read('supabase/migrations/20261028010000_rc19_reg02_multi_applicant_approval.sql')
const old = read('supabase/migrations/20260906100000_gl19c_operational_settings_consumers.sql')
const actions = read('components/features/calendar/ShiftRegistrationActions.tsx')
const detail = read('components/features/shifts/ShiftDetailModal.tsx')
const service = read('lib/services/supabaseShiftRegistrationService.ts')
const board = read('components/features/calendar/ShiftRegistrationBoard.tsx')

test('REG-02 baseline old code reproduces auto-approved registration and no atomic surplus rejection',()=>{
  assert.match(old,/case when settings_row\.require_registration_approval then 'pending' else 'approved' end/)
  assert.doesNotMatch(old,/ROLE_CAPACITY_FILLED/)
})
test('REG-02 preserves legacy auto-approval and requires approval only when the existing workflow setting is enabled',()=>{
  const fn=migration.split('-- Apply rejection')[0]
  assert.match(fn,/case when settings_row\.require_registration_approval then 'pending' else 'approved' end/i)
  assert.match(fn,/case when settings_row\.require_registration_approval then null else actor_id end/i)
  assert.match(fn,/if not settings_row\.require_registration_approval and settings_row\.auto_lock_filled_shifts then[\s\S]*private\.refresh_shift_registration_lock\(p_shift_id, false\)/i)
  assert.match(fn,/private\.assert_shift_capacity\(target_shift, p_role, null\)/i)
  assert.match(fn,/private\.assert_no_shift_registration_conflict\(actor_id, target_shift, p_role, null\)/i)
})
test('REG-02 per-role capacity transitions only pending and records audited reason',()=>{
  assert.match(migration,/v_filled < v_capacity then return 0/i)
  assert.match(migration,/r\.shift_id = p_shift_id and r\.operational_role = p_role[\s\S]*r\.status = 'pending'/i)
  assert.match(migration,/status = 'rejected', reviewed_by = p_actor_id/)
  assert.match(migration,/review_notes = 'ROLE_CAPACITY_FILLED'/)
  assert.match(migration,/perform private\.reg02_reject_surplus\(target_shift\.id, target_registration\.operational_role, actor_id\)/)
  assert.match(migration,/perform private\.reg02_reject_surplus\(p_shift_id, p_role, p_actor_id\)/)
  assert.doesNotMatch(migration,/update public\.system_settings/)
})
test('REG-02 privilege and optimistic concurrency guards preserved',()=>{
  assert.match(migration,/for update;\s*select version into current_version from public\.shift_registrations/)
  assert.match(migration,/private\.assert_expected_version\('ShiftRegistration', p_expected_version, current_version\)/)
  assert.match(migration,/revoke all on function public\.approve_shift_registration\(text,text\) from public, anon, authenticated/)
  assert.match(migration,/grant execute on function public\.approve_shift_registration\(text,text,integer\) to authenticated/)
})
test('REG-02 confirmation requires explicit second click and cancel has no mutation',()=>{
  assert.match(actions,/data-testid=\{\x60registration-confirm-dialog-/)
  assert.match(actions,/onClick=\{\(\) => setConfirmRole\(state\)\}/)
  assert.match(actions,/onClick=\{\(\) => setConfirmRole\(null\)\}/)
  assert.match(actions,/Chờ duyệt/)
  assert.match(actions,/onClick=\{\(\) => \{ if \(confirmRole\) void runRegister\(confirmRole\) \}\}/)
  assert.match(actions,/Brand/)
  assert.match(actions,/Platform/)
  assert.match(board,/if \(throwAfterToast\) throw error/)
  assert.match(detail,/if \(throwAfterToast\) throw error/)
})
test('REG-02 candidate order, role section and member-scoped repository preserved',()=>{
  assert.match(service,/async getForShift\(shiftId\) \{[\s\S]*\.eq\('shift_id', shiftId\)[\s\S]*\.order\('requested_at', \{ ascending: true \}\)[\s\S]*\.order\('id', \{ ascending: true \}\)[\s\S]*\.range\(/)
  assert.match(detail,/reg02-role-group-/)
  assert.match(detail,/left\.requested_at\.localeCompare\(right\.requested_at\)/)
  assert.match(detail,/left\.id\.localeCompare\(right\.id\)/)
  assert.match(detail,/hasPermission\(currentUser, 'shifts\.approve_registration'\)/)
})
