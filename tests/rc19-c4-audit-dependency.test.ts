import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const migration = readFileSync(new URL('../supabase/migrations/20261113083000_rc19_c4_audit_dependency.sql', import.meta.url), 'utf8')

test('C4 audit dependency preserves existing helpers and fails on audit errors', () => {
  assert.match(migration, /IF to_regprocedure\('private\.log_shift_audit\(text,text,text,text,text,jsonb,text\[\]\)'\) IS NULL THEN/)
  assert.match(migration, /SECURITY DEFINER SET search_path = ''/)
  assert.match(migration, /INSERT INTO public\.audit_logs/)
  assert.match(migration, /FROM PUBLIC, anon, authenticated, service_role/)
  assert.doesNotMatch(migration, /exception\s+when\s+others/i)
  assert.doesNotMatch(migration, /supabase_migrations\.schema_migrations/i)
})
