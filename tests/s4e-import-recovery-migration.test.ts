import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const migrationUrl = new URL(
  '../supabase/migrations/20260822144531_s4e_import_recovery_reconciliation.sql',
  import.meta.url,
)

test('S4E outcome RPC uses CAS and keeps finalized rows immutable', async () => {
  const sql = await readFile(migrationUrl, 'utf8')

  assert.match(sql, /create or replace function public\.record_schedule_import_batch_outcomes/i)
  assert.match(sql, /v_expected_outcome := v_item->>'expected_outcome'/i)
  assert.match(sql, /outcome = v_expected_outcome/i)
  assert.match(sql, /IMPORT_ROW_OUTCOME_CONFLICT/i)
  assert.match(sql, /IMPORT_ROW_ALREADY_FINALIZED/i)
  assert.match(sql, /IMPORT_ROW_NOT_FOUND/i)
  assert.match(sql, /v_current_outcome in \('imported', 'warning', 'duplicate_skipped'\)/i)
})

test('S4E outcome RPC retains hardened SECURITY DEFINER grants', async () => {
  const sql = await readFile(migrationUrl, 'utf8')

  assert.match(sql, /security definer\s+set search_path = ''/i)
  assert.match(
    sql,
    /revoke all on function public\.record_schedule_import_batch_outcomes\(text, jsonb\)\s+from public, anon, authenticated/i,
  )
  assert.match(
    sql,
    /grant execute on function public\.record_schedule_import_batch_outcomes\(text, jsonb\)\s+to authenticated/i,
  )
  assert.match(sql, /private\.require_shift_actor\(true\)/i)
})
