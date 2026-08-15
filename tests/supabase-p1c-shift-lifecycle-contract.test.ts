import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import test from 'node:test'

const root = process.cwd()
const migrationDirectory = path.join(root, 'supabase', 'migrations')

async function lifecycleMigration() {
  const files = await readdir(migrationDirectory)
  const file = files.find(candidate => candidate.endsWith('_p1c_shift_lifecycle.sql'))
  assert.ok(file, 'P1C shift lifecycle migration is missing')
  return {
    file,
    sql: await readFile(path.join(migrationDirectory, file), 'utf8'),
  }
}

test('lifecycle migration defines soft_delete_shift and restore_shift as Admin-only security definer RPCs', async () => {
  const { sql } = await lifecycleMigration()

  assert.match(sql, /create or replace function public\.soft_delete_shift\(p_shift_id text, p_reason text\)/i)
  assert.match(sql, /create or replace function public\.restore_shift\(p_shift_id text\)/i)

  // Security hardening: explicit search_path, security definer, no default public grants.
  assert.match(sql, /security definer/i)
  assert.match(sql, /set search_path = ''/i)
  assert.match(sql, /revoke all on function public\.soft_delete_shift/i)
  assert.match(sql, /revoke all on function public\.restore_shift/i)
  assert.match(sql, /grant execute on function public\.soft_delete_shift\(text, text\) to authenticated/i)
  assert.match(sql, /grant execute on function public\.restore_shift\(text\) to authenticated/i)
})

test('lifecycle migration preserves mock soft-delete/restore semantics', async () => {
  const { sql } = await lifecycleMigration()

  // Soft delete: server-derived actor, Admin-only, deleted_at/deleted_by/deletion_reason,
  // status cancelled, registration_locked true, preserves rows.
  assert.match(sql, /actor_id := private\.current_business_user_id\(\)/i)
  assert.match(sql, /actor_permission := private\.current_system_permission\(\)/i)
  assert.match(sql, /actor_permission <> 'admin'/i)
  assert.match(sql, /deleted_at = statement_timestamp\(\)/i)
  assert.match(sql, /deleted_by = actor_id/i)
  assert.match(sql, /deletion_reason = coalesce\(nullif\(btrim\(p_reason\), ''\), 'Removed by operator'\)/i)
  assert.match(sql, /status = 'cancelled'/i)
  assert.match(sql, /registration_locked = true/i)

  // Restore: Admin-only, clears lifecycle fields, restores status/registration_locked.
  assert.match(sql, /deleted_at = null/i)
  assert.match(sql, /deleted_by = null/i)
  assert.match(sql, /deletion_reason = null/i)
  assert.match(sql, /status = 'scheduled'/i)
  assert.match(sql, /registration_locked = false/i)

  // Fail closed for invalid states.
  assert.match(sql, /SHIFT_NOT_FOUND/i)
  assert.match(sql, /SHIFT_ALREADY_DELETED/i)
  assert.match(sql, /SHIFT_NOT_DELETED/i)

  // No hard delete RPC added prematurely.
  assert.doesNotMatch(sql, /hard_delete_shift/i)
})
