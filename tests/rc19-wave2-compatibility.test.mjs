import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const read = path => readFileSync(path, 'utf8')
const staffing = read('supabase/migrations/20261029120000_rc19_staffing_role_scoped_gap_filter.sql')
const registration = read('supabase/migrations/20261028010000_rc19_reg02_multi_applicant_approval.sql')
const staffingSummary = read('supabase/migrations/20261008160638_member_registration_directory_privacy.sql')
const boundedLists = read('supabase/migrations/20261012171503_rc16k_bounded_shift_lists.sql')

test('Wave 2 migrations keep distinct identities and chronological apply order', () => {
  const migrations = [
    '20261028010000_rc19_reg02_multi_applicant_approval.sql',
    '20261029120000_rc19_staffing_role_scoped_gap_filter.sql',
  ]

  assert.deepEqual(migrations, [...migrations].sort())
  assert.match(registration, /(?:^|\n)begin;\s*\n/i)
  assert.match(registration, /commit;\s*$/i)
  assert.match(staffing, /^-- Reviewable additive replacement/i)
})

test('registration approval policy remains opt-in and preserves legacy auto-approval', () => {
  assert.match(registration, /case when settings_row\.require_registration_approval then 'pending' else 'approved' end/i)
  assert.match(registration, /case when settings_row\.require_registration_approval then null else actor_id end/i)
  assert.match(registration, /if not settings_row\.require_registration_approval and settings_row\.auto_lock_filled_shifts then/i)
  assert.match(registration, /r\.status in \('approved', 'manually_assigned'\)/i)
  assert.match(registration, /r\.status = 'pending'/i)
})

test('role filters consume the shared staffing summary and the registration status contract', () => {
  assert.match(staffing, /'registrationStatuses','statuses'/i)
  assert.match(staffing, /value not in \('pending','approved','manually_assigned'\)/i)
  assert.match(staffing, /public\.get_shift_staffing_summary\(array\[s\.id\]\)/i)
  assert.match(staffingSummary, /count\(r\.id\) filter \(where r\.status in \('approved', 'manually_assigned'\)\)/i)
  assert.match(staffingSummary, /count\(r\.id\) filter \(where r\.status = 'pending'\)/i)
})

test('shared filtered_shift_ids call sites and authenticated-only execution remain intact', () => {
  assert.match(boundedLists, /create function private\.filtered_shift_ids\(p_scope text,p_filters jsonb\)/i)
  assert.match(boundedLists, /select\s+\*\s+from\s+private\.filtered_shift_ids\(p_scope,p_filters\)/i)
  assert.match(boundedLists, /revoke all on function private\.filtered_shift_ids\(text,jsonb\) from public,anon,service_role/i)
  assert.match(staffing, /revoke all on function private\.filtered_shift_ids\(text,jsonb\) from public,anon,service_role/i)
  assert.match(staffing, /grant execute on function private\.filtered_shift_ids\(text,jsonb\) to authenticated/i)
  assert.doesNotMatch(registration, /grant\s+.*service_role/i)
})
