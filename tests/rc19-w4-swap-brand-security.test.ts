import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const migration = readFileSync(new URL('../supabase/migrations/20261117160000_rc19_w4_pass_recipient_visibility.sql', import.meta.url), 'utf8')

test('migration 20261117160000 enforces strict Brand and Actor isolation for swaps and shifts', () => {
  assert.match(migration, /^BEGIN;/)
  assert.match(migration.trimEnd(), /COMMIT;$/)
  assert.match(migration, /W4_PASS_RECIPIENT_VISIBILITY_PRECONDITION_FAILED/)

  // 1. swap_requests_select RLS policy
  assert.match(migration, /CREATE POLICY swap_requests_select ON public\.swap_requests/)
  assert.match(migration, /replacement_staff_id = \(SELECT private\.current_business_user_id\(\)\)/)
  assert.match(migration, /counterpart_id = \(SELECT private\.current_business_user_id\(\)\)/)
  assert.match(migration, /requester_id = \(SELECT private\.current_business_user_id\(\)\)/)
  // Leader must be constrained by brand scope of the underlying shift
  assert.match(migration, /\(SELECT private\.current_system_permission\(\)\) = 'leader'/)
  assert.match(migration, /private\.can_read_shift\(s\.id\)/)

  // 2. can_read_shift function
  assert.match(migration, /CREATE OR REPLACE FUNCTION private\.can_read_shift\(p_shift_id text\)/)
  assert.match(migration, /private\.rc19_has_any_leader_brand_scope\(shift\.brand_id/)
  assert.match(migration, /shift\.status = 'scheduled' AND shift\.end_at > statement_timestamp\(\)/)
  assert.match(migration, /sw\.replacement_staff_id = private\.current_business_user_id\(\)/)

  // 3. get_swap_list_page RPC
  assert.match(migration, /CREATE OR REPLACE FUNCTION public\.get_swap_list_page/)
  assert.match(migration, /private\.filtered_shift_ids\('all'/)
  assert.match(migration, /sw\.replacement_staff_id = actor/)
})
