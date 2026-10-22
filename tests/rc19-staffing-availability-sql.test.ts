import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const migration = readFileSync(new URL('../docs/rc19/staffing_candidate_availability.MIGRATION_DRAFT.sql', import.meta.url), 'utf8')

test('RC19.1B SQL contract: permission, safe reads and overlap', () => {
  assert.match(migration, /perform private\.require_shift_actor\(true\)/i)
  assert.match(migration, /security definer[\s\S]*set search_path\s*=\s*''/i)
  assert.match(migration, /r\.status in \('pending', 'approved', 'manually_assigned'\)/i)
  assert.match(migration, /other_shift\.start_at < target_shift\.end_at/i)
  assert.match(migration, /other_shift\.end_at > target_shift\.start_at/i)
  assert.match(migration, /revoke all on function public\.search_staffing_candidates/i)
  assert.match(migration, /to authenticated/i)
  assert.doesNotMatch(migration, /\b(insert into|delete from|update public\.)\b/i)
})

test('RC19.1B2 SQL has honest empty-page totals and restricted candidate roles', () => {
  assert.match(migration, /returns jsonb/i)
  assert.match(migration, /'total',\s*\(select count\(\*\) from eligible\)/i)
  assert.match(migration, /'items',\s*coalesce/i)
  assert.match(migration, /paged_users as materialized/i)
  assert.match(migration, /from paged_users as e/i)
  assert.doesNotMatch(migration, /availability_rows as materialized/i)
  assert.match(migration, /and u\.operational_roles @> array\[p_role\]/i)
  assert.match(migration, /p_limit is null or p_limit < 1 or p_limit > 50/i)
  assert.match(migration, /pg_catalog\.strpos\(pg_catalog\.lower\(u\.full_name\), normalized_search\)/i)
})
