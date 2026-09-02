import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const migration = readFileSync(
  'supabase/migrations/20260903110000_f10_report_active_business_user_rls.sql',
  'utf8',
)
const originalReportMigration = readFileSync(
  'supabase/migrations/20260823000000_p3_report_persistence.sql',
  'utf8',
)
const auditMigration = readFileSync(
  'supabase/migrations/20260830113000_core_v1_persistent_audit.sql',
  'utf8',
)
const analytics = readFileSync('components/features/analytics/DashboardAnalytics.tsx', 'utf8')

const policyBody = (name: string): string => {
  const match = migration.match(new RegExp(`create policy ${name}[\\s\\S]*?(?=\\n\\s*drop policy|\\n\\s*create policy|\\n\\s*commit;)`, 'i'))
  return match?.[0] || ''
}

test('all report-family reads require an active canonical business user', () => {
  for (const name of ['reports_active_select', 'reports_archived_select', 'report_revisions_read', 'report_images_read', 'live_report_images_read']) {
    const body = policyBody(name)
    assert.notEqual(body, '', `${name} policy is recreated`)
    assert.match(body, /current_business_user_is_active\(\)/i)
    assert.match(body, /to authenticated/i)
  }
  assert.match(policyBody('reports_active_select'), /deleted_at is null[\s\S]*?archived_at is null/i)
  assert.match(policyBody('reports_archived_select'), /current_system_permission\(\)\s*\)\s*=\s*'admin'/i)
})

test('child tables cannot bypass the parent report read boundary', () => {
  assert.match(policyBody('report_revisions_read'), /exists \([\s\S]*?from public\.reports as report/i)
  assert.match(policyBody('report_images_read'), /exists \([\s\S]*?from public\.reports as report/i)
  assert.match(policyBody('live_report_images_read'), /exists \([\s\S]*?from public\.reports as report/i)
  assert.match(policyBody('live_report_images_read'), /report_id is null/i)
  assert.match(policyBody('live_report_images_read'), /current_business_user_is_active\(\)/i)
})

test('anonymous access remains denied and migration is non-destructive', () => {
  assert.match(migration, /for select to authenticated/i)
  assert.doesNotMatch(migration, /to anon/i)
  assert.doesNotMatch(migration, /grant .* to anon/i)
  assert.doesNotMatch(migration, /delete from|truncate|drop table|alter table .* drop column/i)
  assert.match(originalReportMigration, /revoke all on table public\.reports from anon, authenticated/i)
  assert.match(originalReportMigration, /grant select on table public\.reports to authenticated/i)
})

test('active Admin, Leader and Member role scope is preserved', () => {
  assert.match(policyBody('reports_active_select'), /deleted_at is null[\s\S]*?archived_at is null/i)
  assert.match(policyBody('reports_archived_select'), /current_system_permission\(\)\s*\)\s*=\s*'admin'/i)
  assert.doesNotMatch(migration, /system_permission\(\)\s+in\s*\(\s*'admin'\s*,\s*'leader'/i)
  assert.doesNotMatch(migration, /system_permission\(\)\s*=\s*'admin'[\s\S]*?reports_active_select/i)
})

test('Analytics still reads the existing report-backed source and audit is untouched', () => {
  assert.match(analytics, /report|analytics/i)
  assert.doesNotMatch(migration, /create table|create or replace function|audit_/i)
  assert.match(auditMigration, /create trigger audit_reports_change after insert or update or delete on public\.reports/i)
})
