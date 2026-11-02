import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

import { PGlite } from '@electric-sql/pglite'

const migrationPaths = [
  '../supabase/migrations/20261102110000_rc19_batch05a_report_storage.sql',
  '../supabase/migrations/20261102135047_rc19_batch05a3_domain_storage_routes.sql',
  '../supabase/migrations/20261102150000_rc19_batch05a4_storage_runtime.sql',
  '../supabase/migrations/20261102160334_rc19_batch05a41_storage_release_blockers.sql',
].map(path => fileURLToPath(new URL(path, import.meta.url)))

test('05A -> 05A.3 -> 05A.4 -> 05A.4.1 applies sequentially and enforces Excel receipt gates', async () => {
  const db = new PGlite()
  try {
    assert.match(String((await db.query('select version()')).rows[0]?.version), /^PostgreSQL 17\./u)
    await db.exec(`
      create role anon;
      create role authenticated;
      create role service_role bypassrls;
      create schema private;
      create schema storage;
      create table storage.buckets (id text primary key, public boolean not null);
      create table storage.objects (bucket_id text not null, name text not null);
      insert into storage.buckets values ('live-dashboard-images', true);
      create policy "live dashboard image public read" on storage.objects for select
        using (bucket_id = 'live-dashboard-images');
      create table public.report_images (id text primary key, provider text, external_file_id text);
      create table public.live_report_images (id text primary key, provider text, external_file_id text);
      create table public.operational_files (
        id text primary key, scope_key text, category text, provider text, shift_id text,
        integrity_status text, external_file_id text, external_parent_id text,
        checksum_sha256 text, mime_type text, deleted_at timestamptz
      );
      create table public.shifts (
        id text primary key, status text, deleted_at timestamptz, archived_at timestamptz,
        import_batch_id text
      );
      create table public.schedule_import_batches (
        id text primary key, source text not null, status text not null,
        created_by text, deleted_at timestamptz
      );
      create table private.actor_context (singleton boolean primary key default true, actor_id text, permission text);
      insert into private.actor_context (actor_id, permission) values ('business-1', 'leader');
      create table public.dashboard_updates (
        id text primary key default gen_random_uuid()::text, shift_id text not null,
        time timestamptz not null, revenue numeric not null, gmv numeric, orders integer not null,
        peak_viewers integer not null, current_viewers integer not null, total_views integer,
        total_viewers integer, likes integer, comments integer, shares integer,
        screenshot_url text, screenshot_storage_path text, dashboard_platform text not null,
        normalized_metrics jsonb, ocr_review jsonb, raw_ocr_output text, notes text,
        created_by text, deleted_at timestamptz,
        check (screenshot_storage_path is null or screenshot_storage_path like 'dashboard/%')
      );
      create function public.upload_report_image_with_provider(text,text,text,text,text,bigint,text,text,text)
        returns public.report_images language plpgsql as $$
        declare result public.report_images;
        begin
          insert into public.report_images(id, provider, external_file_id)
          values ('report-image-1', $8, $9) returning * into result;
          return result;
        end $$;
      create function public.upsert_live_report_image_with_provider(jsonb)
        returns public.live_report_images language plpgsql as $$
        declare result public.live_report_images;
        begin
          insert into public.live_report_images(id, provider, external_file_id)
          values ('live-image-1', $1->>'provider', $1->>'external_file_id') returning * into result;
          return result;
        end $$;
      create function private.current_business_user_id() returns text language sql security definer set search_path = '' as $$
        select actor_id from private.actor_context limit 1 $$;
      create function private.current_system_permission() returns text language sql security definer set search_path = '' as $$
        select permission from private.actor_context limit 1 $$;
      create function private.is_leader_or_admin() returns boolean language sql security definer set search_path = '' as $$
        select private.current_system_permission() in ('leader', 'admin') $$;
      create function private.require_shift_actor(boolean) returns text language plpgsql security definer set search_path = '' as $$
        declare actor_id text;
        begin
          actor_id := private.current_business_user_id();
          if actor_id is null then raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED'; end if;
          if $1 and not private.is_leader_or_admin() then raise exception using errcode = '42501', message = 'OPERATION_NOT_ALLOWED'; end if;
          return actor_id;
        end $$;
      create function private.can_read_shift(text) returns boolean language sql as $$ select true $$;
    `)

    for (const path of migrationPaths) await db.exec(await readFile(path, 'utf8'))

    const routes = await db.query(`select
      count(*)::int as total,
      count(*) filter (where active and verified_created)::int as active_verified,
      count(*) filter (where access_classification = 'pending_restriction_no_sensitive_upload')::int as pending,
      count(*) filter (where access_classification = 'restricted_verified')::int as restricted_verified
      from public.operational_storage_domain_folders`)
    assert.deepEqual(routes.rows[0], { total: 93, active_verified: 93, pending: 16, restricted_verified: 0 })

    await db.exec(`insert into public.schedule_import_batches (id, source, status, created_by)
      values ('excel-batch', 'excel', 'previewed', 'business-1'), ('sheets-batch', 'google_sheets', 'previewed', 'business-1')`)
    await assert.rejects(() => db.exec(`insert into public.shifts (id, status, import_batch_id)
      values ('blocked-shift', 'scheduled', 'excel-batch')`), /SCHEDULE_SOURCE_REQUIRED_BEFORE_IMPORT/u)
    await assert.rejects(() => db.exec(`update public.schedule_import_batches set status = 'confirmed' where id = 'excel-batch'`),
      /SCHEDULE_SOURCE_REQUIRED_BEFORE_CONFIRM/u)

    await db.exec(`insert into public.operational_schedule_source_files (
      batch_id, external_file_id, external_parent_id, folder_path, file_name, mime_type,
      size_bytes, checksum_sha256, reconciliation_status, uploaded_by
    ) values (
      'excel-batch', 'drive-file-1', 'drive-folder-1', 'raw', 'source.xlsx',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 12,
      '${'a'.repeat(64)}', 'provider_verified', 'business-1'
    )`)
    await db.exec(`insert into public.shifts (id, status, import_batch_id)
      values ('allowed-shift', 'scheduled', 'excel-batch')`)
    await db.exec(`update public.schedule_import_batches set status = 'confirmed' where id = 'excel-batch'`)
    assert.equal((await db.query(`select status from public.schedule_import_batches where id='excel-batch'`)).rows[0]?.status, 'confirmed')
    await assert.rejects(() => db.exec(`insert into public.operational_schedule_source_files (
      batch_id, folder_path, file_name, mime_type, size_bytes, checksum_sha256, uploaded_by
    ) values ('unknown-batch', 'raw', 'x.xlsx', 'application/octet-stream', 1, '${'b'.repeat(64)}', 'business-1')`),
    /operational_schedule_source_files_batch_id_fkey/u)
  } finally {
    await db.close()
  }
})
