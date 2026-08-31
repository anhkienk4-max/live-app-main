import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const migration = readFileSync(
  'supabase/migrations/20260830113000_core_v1_persistent_audit.sql',
  'utf8',
)
const patchMigration = readFileSync(
  'supabase/migrations/20260830114000_core_v1_persistent_audit_read_permission.sql',
  'utf8',
)
const auditSnapshotFixMigration = readFileSync(
  'supabase/migrations/20260831130000_core_v1_audit_update_before_state.sql',
  'utf8',
)
const auditService = readFileSync('lib/services/auditService.ts', 'utf8')
const supabaseService = readFileSync('lib/services/supabaseAuditService.ts', 'utf8')
const auditHistory = readFileSync('components/features/audit/AuditHistory.tsx', 'utf8')

test('persistent audit schema is append-only and read-only to application roles', () => {
  assert.match(migration, /create table public\.audit_logs/i)
  assert.match(migration, /alter table public\.audit_logs enable row level security/i)
  assert.match(migration, /revoke all on table public\.audit_logs from anon, authenticated/i)
  assert.match(migration, /grant select on table public\.audit_logs to authenticated/i)
  assert.doesNotMatch(migration, /grant (insert|update|delete).*audit_logs.*authenticated/i)
  assert.doesNotMatch(migration, /create policy .* for (insert|update|delete).*audit_logs/i)
})

test('audit events are database-owned and attached to every Core V1 source of record', () => {
  for (const table of [
    'business_users', 'brands', 'platforms', 'campaigns', 'shifts', 'shift_registrations',
    'swap_requests', 'reports', 'report_revisions', 'report_images', 'live_report_images',
    'schedule_import_batches', 'schedule_import_batch_rows',
  ]) {
    assert.match(migration, new RegExp(`audit_${table}_change after insert or update or delete on public\\.${table}`, 'i'))
  }
  assert.match(migration, /security definer\s+set search_path = ''[\s\S]*insert into public\.audit_logs/i)
  assert.doesNotMatch(auditService, /from\(['"]audit_logs['"]\)/i)
})

test('actor identity is derived from auth.uid and mapped business identity', () => {
  assert.match(migration, /actor_auth_id := auth\.uid\(\)/i)
  assert.match(migration, /actor_business_id := private\.current_business_user_id\(\)/i)
  assert.match(migration, /actor_auth_user_id, actor_business_user_id/i)
  assert.doesNotMatch(migration, /p_actor|p_user_id|p_actor_id/i)
})

// A. Member has no audit.view / audit.view_team → audit SELECT unavailable via RLS
test('A: Member cannot read audit_logs — own-event clause is removed by patch', () => {
  // Original migration has the defective own-event clause
  assert.match(migration, /actor_business_user_id = \(select private\.current_business_user_id\(\)\)/i)
  // Patch drops and replaces the policy WITHOUT the own-event clause
  assert.match(patchMigration, /drop policy if exists audit_logs_read on public\.audit_logs/i)
  assert.match(patchMigration, /create policy audit_logs_read/i)
  assert.doesNotMatch(patchMigration, /actor_business_user_id/i)
})

// B. Admin read remains allowed
test('B: Admin read access is preserved in the patched policy', () => {
  assert.match(patchMigration, /current_system_permission\(\)\) = 'admin'/i)
})

// C. Leader audit.view_team scoped to permitted modules only
test('C: Leader access is scoped to permitted operational modules', () => {
  assert.match(patchMigration, /current_system_permission\(\)\) = 'leader'/i)
  assert.match(patchMigration, /module in \('calendar', 'live', 'reports', 'campaigns', 'swaps', 'imports'\)/i)
  assert.doesNotMatch(patchMigration, /module in.*'staff'/i)
  assert.doesNotMatch(patchMigration, /module in.*'settings'/i)
})

// D. Anon access is blocked — no select grant to anon, policy is authenticated-only
test('D: Anon has no read access to audit_logs', () => {
  assert.match(migration, /revoke all on table public\.audit_logs from anon/i)
  assert.match(patchMigration, /for select to authenticated/i)
  assert.doesNotMatch(patchMigration, /to anon/i)
})

// E. audit_log_reviews remains Admin-only
test('E: audit_log_reviews read is Admin-only', () => {
  assert.match(migration, /create policy audit_log_reviews_read/i)
  assert.match(migration, /revoke all on table public\.audit_log_reviews from anon, authenticated/i)
  assert.match(migration, /grant select on table public\.audit_log_reviews to authenticated/i)
  assert.match(migration, /current_system_permission\(\)\) = 'admin'/i)
})

// F. INSERT/UPDATE/DELETE on audit_logs unavailable to application roles
test('F: INSERT/UPDATE/DELETE on audit_logs denied to application roles', () => {
  assert.doesNotMatch(migration, /grant (insert|update|delete).*audit_logs.*authenticated/i)
  assert.doesNotMatch(patchMigration, /grant (insert|update|delete).*audit_logs/i)
})

// G. Patch does not alter schema, triggers, or immutability
test('G: compensating migration does not alter schema, triggers, or redaction', () => {
  assert.doesNotMatch(patchMigration, /create table/i)
  assert.doesNotMatch(patchMigration, /alter table/i)
  assert.doesNotMatch(patchMigration, /create trigger/i)
  assert.doesNotMatch(patchMigration, /create or replace function/i)
  assert.doesNotMatch(patchMigration, /grant insert|grant update|grant delete/i)
})

test('sensitive and oversized snapshot fields are redacted', () => {
  assert.match(migration, /password\|token\|secret\|api\[_-\]\?key/i)
  assert.match(migration, /redacted_large_value/i)
  assert.match(migration, /redacted_reference/i)
  assert.doesNotMatch(migration, /access_token|refresh_token|service_role/i)
})

test('audit captures lifecycle semantics and changed fields in the same transaction', () => {
  for (const action of ['create', 'delete', 'soft_delete', 'restore', 'archive', 'lock', 'reopen', 'approve', 'reject', 'cancel_registration', 'confirm', 'update']) {
    assert.match(migration, new RegExp(`return '${action}'`, 'i'))
  }
  assert.match(migration, /after insert or update or delete/i)
  assert.match(migration, /insert into public\.audit_logs/i)
  assert.match(migration, /written after the mutation and roll back with it/i)
})

test('audit snapshots preserve OLD/NEW state for every DML operation', () => {
  assert.match(
    auditSnapshotFixMigration,
    /before_row\s*:=\s*private\.audit_sanitize_row\(case\s+when\s+tg_op\s*<>\s*'INSERT'\s+then\s+to_jsonb\(old\)\s+else\s+null\s+end\)/i,
  )
  assert.match(
    auditSnapshotFixMigration,
    /after_row\s*:=\s*private\.audit_sanitize_row\(case\s+when\s+tg_op\s*<>\s*'DELETE'\s+then\s+to_jsonb\(new\)\s+else\s+null\s+end\)/i,
  )
  assert.doesNotMatch(auditSnapshotFixMigration, /case\s+when\s+tg_op\s*=\s*'DELETE'\s+then\s+to_jsonb\(old\)/i)
  assert.match(auditSnapshotFixMigration, /security definer\s+set search_path = ''/i)
  assert.match(auditSnapshotFixMigration, /revoke all on function private\.capture_audit_row_change\(\) from public, anon, authenticated/i)
})

test('administrative review metadata is separate and server-authorized', () => {
  assert.match(migration, /create table public\.audit_log_reviews/i)
  assert.match(migration, /update_audit_review/i)
  assert.match(migration, /current_system_permission\(\) <> 'admin'/i)
  assert.match(migration, /grant execute on function public\.update_audit_review\(text, text, text, text\) to authenticated/i)
  assert.doesNotMatch(migration, /grant update on table public\.audit_logs/i)
})

test('Supabase audit service is DB-backed with no mock fallback', () => {
  assert.match(auditService, /getAuthMode\(\) === 'supabase'/i)
  assert.match(auditService, /getSupabaseAuditRepository\(\)\.getAuditLogs/i)
  assert.match(auditService, /if \(getAuthMode\(\) === 'supabase'\) return entry/i)
  assert.match(supabaseService, /client\.from\('audit_logs'\)/i)
  assert.doesNotMatch(supabaseService, /mockAudit|sessionStorage|localStorage/i)
})

test('Supabase audit service client permission gate blocks Member before DB query', () => {
  // Secondary UX guard; DB/RLS is the authoritative security boundary
  assert.match(auditHistory, /hasAnyPermission.*audit\.view.*audit\.view_team/i)
  assert.match(auditHistory, /canView/i)
})

test('audit query supports pagination and existing Audit UI filters', () => {
  for (const method of ['range', 'order', 'gte', 'lt', 'eq', 'ilike']) assert.match(supabaseService, new RegExp(`\\.${method}\\(`))
  assert.match(supabaseService, /totalPages/i)
  assert.match(supabaseService, /actors/i)
})

test('audit schema avoids binary payload persistence', () => {
  assert.doesNotMatch(migration, /create table public\.audit_logs[\s\S]*bytea/i)
  assert.match(migration, /file\|image\|thumbnail.*url/i)
  assert.match(migration, /redacted_reference/i)
})
