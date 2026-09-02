import { readFileSync } from 'node:fs'
import test from 'node:test'
import assert from 'node:assert/strict'

const migration = readFileSync(
  'supabase/migrations/20260902170000_f9_campaign_leader_edit.sql',
  'utf8',
)
const masterDataMigration = readFileSync(
  'supabase/migrations/20260811110239_p1b_master_data.sql',
  'utf8',
)
const persistentAuditMigration = readFileSync(
  'supabase/migrations/20260830113000_core_v1_persistent_audit.sql',
  'utf8',
)
const permissions = readFileSync('lib/permissions.ts', 'utf8')
const campaignUi = readFileSync('components/features/campaigns/CampaignList.tsx', 'utf8')
const dataService = readFileSync('lib/services/dataService.ts', 'utf8')
const memberPermissionBlock = permissions.match(/const memberPermissions: Permission\[\] = \[[\s\S]*?\n\]/i)?.[0] || ''

test('Leader campaign updates use the canonical database permission and preserve Admin policy', () => {
  assert.match(migration, /create policy campaigns_leader_operational_update[\s\S]*?for update[\s\S]*?current_system_permission\(\)\) = 'leader'/i)
  assert.match(masterDataMigration, /create policy campaigns_admin_all[\s\S]*?select private\.is_admin\(\)/i)
  assert.doesNotMatch(migration, /using\s*\(\s*true\s*\)|with check\s*\(\s*true\s*\)/i)
  assert.doesNotMatch(migration, /create policy .*brands|create policy .*platforms/i)
})

test('Leader field scope protects identity, master-data, date, archive, and system fields', () => {
  assert.match(migration, /create or replace function private\.enforce_campaign_leader_update_scope\(\)/i)
  assert.match(migration, /security definer\s+set search_path = ''/i)
  for (const field of [
    'id', 'name', 'brand_id', 'start_date', 'end_date', 'platform_ids',
    'created_at', 'updated_at', 'deleted_at', 'deleted_by', 'archived_at',
    'archived_by', 'deletion_reason',
  ]) {
    assert.match(migration, new RegExp(`new\\.${field}\\s+is distinct from old\\.${field}`, 'i'))
  }
  assert.match(migration, /Leader campaign updates are limited to operational fields/i)
  assert.match(migration, /errcode\s*=\s*'42501'/i)
})

test('the service permits Leader operational updates while keeping create/archive Admin-only', () => {
  assert.match(dataService, /const requireSupabaseCampaignEditor[\s\S]*?hasPermission\(actor, 'campaigns\.edit_operational'\)/i)
  assert.match(dataService, /const actor = requireSupabaseCampaignEditor\(actorId\)[\s\S]*?getSupabaseMasterDataRepository\(\)\.campaigns\.update/i)
  assert.match(dataService, /async create\([\s\S]*?const actor = requireSupabaseAdmin\(\)[\s\S]*?campaigns\.create/i)
  assert.match(dataService, /async archive\([\s\S]*?const actor = requireSupabaseAdmin\(actorId\)[\s\S]*?campaigns\.archive/i)
})

test('the existing UI and permission matrix expose only campaign edit to Leader, not create/archive', () => {
  assert.match(permissions, /const leaderPermissions[\s\S]*?'campaigns\.edit_operational'/i)
  assert.match(campaignUi, /const canManage = [\s\S]*?hasPermission\(currentUser, 'campaigns\.manage'\)/i)
  assert.match(campaignUi, /const canEdit = [\s\S]*?'campaigns\.edit_operational'/i)
  assert.match(campaignUi, /\{canManage && [\s\S]*?Archive campaign/i)
})

test('database grants and RLS keep Member and anonymous mutation denied', () => {
  assert.match(masterDataMigration, /grant select, insert, update, delete on table public\.campaigns to authenticated/i)
  assert.match(migration, /to authenticated/i)
  assert.doesNotMatch(migration, /to anon/i)
  assert.match(migration, /using \([\s\S]*?archived_at is null[\s\S]*?deleted_at is null/i)
  assert.match(migration, /with check \([\s\S]*?archived_at is null[\s\S]*?deleted_at is null/i)
  assert.match(memberPermissionBlock, /settings\.member/i)
  assert.doesNotMatch(memberPermissionBlock, /campaigns\.(manage|edit_operational)/i)
})

test('the scope trigger is hardened and rerunnable without changing the audit architecture', () => {
  assert.match(migration, /revoke all on function private\.enforce_campaign_leader_update_scope\(\) from public, anon, authenticated/i)
  assert.match(migration, /drop trigger if exists campaigns_leader_update_scope/i)
  assert.match(migration, /create trigger campaigns_leader_update_scope[\s\S]*?before update on public\.campaigns/i)
  assert.doesNotMatch(migration, /service_role|auth\.uid\(\)\s*:=|execute format|execute immediate/i)
  assert.match(persistentAuditMigration, /audit_campaigns_change after insert or update or delete on public\.campaigns[\s\S]*?private\.capture_audit_row_change\(\)/i)
})

test('Leader operational fields remain explicit and do not grant role or actor control', () => {
  for (const field of [
    'status', 'type', 'notes', 'campaign_url', 'website_url', 'website_title',
    'website_preview_image', 'website_embed_enabled', 'platform_source', 'owner_id',
  ]) {
    assert.match(`${campaignUi}\n${dataService}`, new RegExp(field, 'i'))
  }
  assert.doesNotMatch(migration, /auth_user_id|updated_by|p_actor|p_role/i)
})
