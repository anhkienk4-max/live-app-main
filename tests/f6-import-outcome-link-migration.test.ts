import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import test from 'node:test'

const migration = readFileSync(join(process.cwd(), 'supabase/migrations/20260902130000_f6_import_outcome_existing_shift.sql'), 'utf8')

test('F6 outcome RPC keeps created-by-batch and enriched-existing slot validation', () => {
  assert.match(migration, /create or replace function public\.record_schedule_import_batch_outcomes\(\s*p_batch_id text,\s*p_outcomes jsonb/i)
  assert.match(migration, /linked_shift\.import_batch_id = p_batch_id/i)
  assert.match(migration, /linked_shift\.date::text = btrim\(v_source_row->>'date'\)/i)
  assert.match(migration, /left\(linked_shift\.start_time::text, 5\) = btrim\(v_source_row->>'start_time'\)/i)
  assert.match(migration, /left\(linked_shift\.end_time::text, 5\) = btrim\(v_source_row->>'end_time'\)/i)
  assert.match(migration, /source_brand\.id = linked_shift\.brand_id/i)
  assert.match(migration, /source_platform\.id = linked_shift\.platform_id/i)
  assert.match(migration, /source_row jsonb/i)
  assert.match(migration, /IMPORT_OUTCOME_SHIFT_MISMATCH/i)
})

test('F6 outcome RPC preserves provenance and CAS/idempotency guards', () => {
  assert.doesNotMatch(migration, /set\s+import_batch_id\s*=/i)
  assert.match(migration, /v_current_outcome in \('imported', 'warning', 'duplicate_skipped'\)/i)
  assert.match(migration, /IMPORT_ROW_ALREADY_FINALIZED/i)
  assert.match(migration, /v_current_outcome <> v_expected_outcome/i)
  assert.match(migration, /and outcome = v_expected_outcome/i)
  assert.match(migration, /revoke all on function public\.record_schedule_import_batch_outcomes\(text, jsonb\)/i)
  assert.match(migration, /grant execute on function public\.record_schedule_import_batch_outcomes\(text, jsonb\)\s+to authenticated/i)
})

test('F6 outcome RPC fails closed when canonical source fields are absent or dimension names are ambiguous', () => {
  assert.match(migration, /nullif\(btrim\(v_source_row->>'date'\), ''\) is not null/i)
  assert.match(migration, /nullif\(btrim\(v_source_row->>'start_time'\), ''\) is not null/i)
  assert.match(migration, /nullif\(btrim\(v_source_row->>'end_time'\), ''\) is not null/i)
  assert.match(migration, /nullif\(btrim\(v_source_row->>'brand_name'\), ''\) is not null/i)
  assert.match(migration, /nullif\(btrim\(v_source_row->>'platform_name'\), ''\) is not null/i)
  assert.match(migration, /select count\(\*\)\s+from public\.brands/i)
  assert.match(migration, /select count\(\*\)\s+from public\.platforms/i)
})

test('F6 outcome RPC keeps row authority, outcome classes, and controlled failure paths', () => {
  assert.match(migration, /select outcome, shift_id, failure_code, source_row/i)
  assert.match(migration, /v_outcome not in \('imported', 'validation_failed', 'duplicate_skipped', 'warning', 'retryable'\)/i)
  assert.match(migration, /IMPORT_OUTCOME_SHIFT_REQUIRED/i)
  assert.match(migration, /IMPORT_ROW_NOT_FOUND/i)
  assert.match(migration, /IMPORT_OUTCOME_SHIFT_MISMATCH/i)
  assert.match(migration, /v_outcome in \('imported', 'warning'\)/i)
  assert.match(migration, /v_outcome = 'retryable'/i)
  assert.doesNotMatch(migration, /v_item->>'(?:brand_id|platform_id|date|start_time|end_time)'/i)
})

test('F6 outcome RPC preserves duplicate, retry, and validation semantics', () => {
  assert.match(migration, /v_current_outcome in \('imported', 'warning', 'duplicate_skipped'\)/i)
  assert.match(migration, /v_current_outcome = 'duplicate_skipped'/i)
  assert.match(migration, /v_current_outcome <> v_expected_outcome/i)
  assert.match(migration, /v_expected_outcome not in \('pending', 'validation_failed', 'retryable'\)/i)
  assert.match(migration, /v_requested_failure_code is null/i)
  assert.match(migration, /and outcome = v_expected_outcome/i)
})
