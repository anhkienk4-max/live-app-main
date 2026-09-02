import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const migration = readFileSync(
  'supabase/migrations/20260902180000_f9_delete_archive_integrity.sql',
  'utf8',
)
const masterDataMigration = readFileSync(
  'supabase/migrations/20260811110239_p1b_master_data.sql',
  'utf8',
)
const shiftPersistenceMigration = readFileSync(
  'supabase/migrations/20260814085659_p1c_shift_persistence.sql',
  'utf8',
)
const patch1Migration = readFileSync(
  'supabase/migrations/20260902170000_f9_campaign_leader_edit.sql',
  'utf8',
)
const persistentAuditMigration = readFileSync(
  'supabase/migrations/20260830113000_core_v1_persistent_audit.sql',
  'utf8',
)
const dataService = readFileSync('lib/services/dataService.ts', 'utf8')
const repository = readFileSync('lib/services/supabaseMasterDataService.ts', 'utf8')

test('authenticated DELETE is removed for every master-data table', () => {
  for (const table of ['brands', 'platforms', 'campaigns']) {
    assert.match(migration, new RegExp(`revoke delete on table public\\.${table} from public, anon, authenticated`, 'i'))
  }
  assert.doesNotMatch(migration, /grant\s+delete/i)
})

test('Admin read, insert, and update remain available without a DELETE policy', () => {
  for (const table of ['brands', 'platforms', 'campaigns']) {
    assert.match(migration, new RegExp(`create policy ${table}_admin_select[\\s\\S]*?for select[\\s\\S]*?private\\.is_admin\\(\\)`, 'i'))
    assert.match(migration, new RegExp(`create policy ${table}_admin_insert[\\s\\S]*?for insert[\\s\\S]*?private\\.is_admin\\(\\)`, 'i'))
    assert.match(migration, new RegExp(`create policy ${table}_admin_update[\\s\\S]*?for update[\\s\\S]*?private\\.is_admin\\(\\)`, 'i'))
  }
  assert.doesNotMatch(migration, /create policy .*_admin_all|^\s*for all\b/im)
})

test('application delete methods remain soft archive operations', () => {
  for (const service of ['brandService', 'platformService', 'campaignService']) {
    const block = dataService.match(new RegExp(`export const ${service} = \\{[\\s\\S]*?\\r?\\n\\}`, 'i'))?.[0] || ''
    assert.ok(block.includes('async delete(id: string): Promise<boolean> {'))
    assert.ok(block.includes('return Boolean(await this.archive(id))'))
  }
  assert.doesNotMatch(repository, /from\(['"](?:brands|platforms|campaigns)['"]\)[\\s\\S]*?\.delete\(/i)
  assert.ok(repository.includes('async archive(id, actorId, reason)'))
  assert.ok(repository.includes('updateOne<CampaignRow>'))
})

test('campaign and master-data references preserve history', () => {
  assert.match(masterDataMigration, /brand_id text not null references public\.brands\(id\) on delete restrict/i)
  assert.match(shiftPersistenceMigration, /platform_id text not null references public\.platforms\(id\) on delete restrict/i)
  assert.match(shiftPersistenceMigration, /campaign_id text null references public\.campaigns\(id\) on delete set null/i)
  assert.match(migration, /drop constraint if exists shifts_campaign_id_fkey/i)
  assert.match(migration, /foreign key \(campaign_id\)[\s\S]*?references public\.campaigns\(id\)[\s\S]*?on delete restrict[\s\S]*?not valid/i)
  assert.doesNotMatch(migration, /on delete cascade/i)
})

test('campaign platform IDs are validated on insert and only when changed', () => {
  assert.match(migration, /create or replace function private\.validate_campaign_platform_ids\(\)/i)
  assert.match(migration, /before insert or update of platform_ids on public\.campaigns/i)
  assert.match(migration, /platform_record\.id = referenced_platform_id/i)
  assert.match(migration, /platform_record\.deleted_at is null/i)
  assert.match(migration, /errcode = '23503'/i)
  assert.match(migration, /Campaign platform reference does not exist/i)
  assert.match(migration, /elsif new\.platform_ids is distinct from old\.platform_ids/i)
  assert.doesNotMatch(migration, /platform_record\.archived_at is null/i)
})

test('platform validation is hardened and cannot be called as an API privilege boundary', () => {
  assert.match(migration, /security definer\s+set search_path = ''/i)
  assert.match(migration, /revoke all on function private\.validate_campaign_platform_ids\(\) from public, anon, authenticated/i)
  assert.doesNotMatch(migration, /service_role|execute format|execute immediate/i)
  assert.doesNotMatch(migration, /grant execute on function/i)
})

test('Patch-1 Leader campaign editing and persistent campaign audit remain intact', () => {
  assert.match(patch1Migration, /create policy campaigns_leader_operational_update/i)
  assert.match(patch1Migration, /enforce_campaign_leader_update_scope/i)
  assert.match(persistentAuditMigration, /audit_campaigns_change after insert or update or delete on public\.campaigns[\s\S]*?private\.capture_audit_row_change\(\)/i)
})

test('the migration changes only master-data deletion safety and campaign platform integrity', () => {
  assert.doesNotMatch(migration, /create policy .*business_users|create policy .*shifts|create policy .*reports/i)
  assert.doesNotMatch(migration, /brands.*campaigns_leader|platforms.*campaigns_leader/i)
  assert.doesNotMatch(migration, /alter table public\.(brands|platforms)\s+drop|alter table public\.(brands|platforms)\s+add/i)
})
