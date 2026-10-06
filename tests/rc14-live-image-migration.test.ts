import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const sql = readFileSync(new URL('../supabase/migrations/20261006160000_rc14_live_image_storage_contract.sql', import.meta.url), 'utf8')

test('live storage migration is additive and legacy NULL rows remain valid without provider-column prerequisites', () => {
  assert.match(sql, /add column if not exists storage_file_name text/u)
  assert.match(sql, /add column if not exists storage_idempotency_key text/u)
  assert.match(sql, /storage_file_name is null and storage_idempotency_key is null/u)
  assert.match(sql, /create unique index if not exists[\s\S]*\(report_id, storage_idempotency_key\)[\s\S]*where storage_idempotency_key is not null/u)
  assert.match(sql, /to_regprocedure\('public.upsert_live_report_image_with_provider\(jsonb\)'\) is not null/u)
  assert.doesNotMatch(sql, /alter[\s\S]*row level security|create policy|drop policy|disable trigger|service_role|delete from|truncate /iu)
  assert.match(sql, /^begin;/mu)
  assert.match(sql, /commit;\s*$/u)
})

test('RPC authorizes before returning a retry and returns before limits, cover updates and audit side effects', () => {
  const rpc = sql.slice(sql.indexOf('create or replace function public.upsert_live_report_image('), sql.indexOf('-- Compat Production'))
  const retry = rpc.indexOf('if created_image.id is not null then return created_image; end if;')
  assert.ok(rpc.indexOf('private.require_report_actor(false)') < retry)
  assert.ok(rpc.indexOf('for update;') < retry)
  assert.ok(rpc.indexOf("message = 'REPORT_CONFIRMED'") < retry)
  assert.ok(rpc.indexOf("message = 'OPERATION_NOT_ALLOWED'") < retry)
  assert.ok(retry < rpc.indexOf('select count(*) into image_count'))
  assert.ok(retry < rpc.indexOf('set is_cover = false'))
  assert.ok(retry < rpc.indexOf('private.record_report_revision'))
  assert.match(rpc, /security definer\s+set search_path = ''/u)
  assert.match(rpc, /revoke all on function public.upsert_live_report_image\(jsonb\) from public, anon, authenticated/u)
  assert.match(rpc, /grant execute on function public.upsert_live_report_image\(jsonb\) to authenticated/u)
  assert.match(rpc, /LIVE_REPORT_IMAGE_FIELD_NOT_ALLOWED/u)
})

test('storage key has full digest/category validation and category edits preserve content identity', () => {
  assert.match(sql, /storage_idempotency_key ~ '\^\(key_visual\|live_session\|other\):\[a-f0-9\]\{64\}\$'/u)
  assert.match(sql, /split_part\(storage_idempotency_key, ':', 1\) = category/u)
  assert.match(sql, /char_length\(storage_file_name\) between 1 and 180/u)
  assert.match(sql, /before update of category on public.live_report_images/u)
  assert.match(sql, /new.category \|\| ':' \|\| split_part\(new.storage_idempotency_key, ':', 2\)/u)
})

test('database-mode retry preserves the winning provider reference instead of overwriting it', () => {
  const wrapper = sql.slice(sql.indexOf('create or replace function public.upsert_live_report_image_with_provider('))
  assert.ok(wrapper.indexOf('if created_image.external_file_id is not null then return created_image; end if;')
    < wrapper.indexOf('set provider = provider_value'))
  assert.match(wrapper, /p_data - 'provider' - 'external_file_id'/u)
})
