import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

import { PGlite } from '@electric-sql/pglite'

const migrationPath = fileURLToPath(new URL('../supabase/migrations/20261102110001_rc19_batch05a_report_storage_expand.sql', import.meta.url))

test('Batch 05A expand migration preserves public dashboard reads and enforces provider metadata and screenshot ownership', async () => {
  const db = new PGlite()
  try {
    const version = String((await db.query('select version()')).rows[0]?.version)
    assert.match(version, /^PostgreSQL 17\./u)
    await db.exec(`
      create role anon;
      create role authenticated;
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
      create table public.shifts (id text primary key, status text, deleted_at timestamptz, archived_at timestamptz);
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
      create function public.upload_report_image_with_provider(
        text,text,text,text,text,bigint,text,text,text
      ) returns public.report_images language plpgsql as $$
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
        values ('live-image-1', $1->>'provider', $1->>'external_file_id')
        returning * into result;
        return result;
      end $$;
      create function private.current_business_user_id() returns text language sql security definer set search_path = '' as $$
        select actor_id from private.actor_context limit 1 $$;
      create function private.current_system_permission() returns text language sql security definer set search_path = '' as $$
        select permission from private.actor_context limit 1 $$;
      create function private.is_leader_or_admin() returns boolean language sql security definer set search_path = '' as $$
        select private.current_system_permission() in ('leader', 'admin') $$;
      create function private.require_shift_actor(p_leader_required boolean) returns text
        language plpgsql security definer set search_path = '' as $$
      declare actor_id text;
      begin
        actor_id := private.current_business_user_id();
        if actor_id is null then
          raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED';
        end if;
        if p_leader_required and not private.is_leader_or_admin() then
          raise exception using errcode = '42501', message = 'OPERATION_NOT_ALLOWED';
        end if;
        return actor_id;
      end $$;
      create function private.can_read_shift(text) returns boolean language sql as $$
        select true $$;
      insert into public.shifts(id, status) values ('shift-1', 'live');
    `)
    await db.exec(await readFile(migrationPath, 'utf8'))
    assert.equal((await db.query(`select public from storage.buckets where id='live-dashboard-images'`)).rows[0]?.public, true)
    const imagePolicies = await db.query(`select policyname from pg_policies where schemaname='storage' and tablename='objects' order by policyname`)
    assert.deepEqual(imagePolicies.rows, [
      { policyname: 'live dashboard image public read' },
      { policyname: 'live dashboard image scoped read' },
    ])
    const rpcPrivileges = await db.query(`select
      has_function_privilege('anon', 'public.create_dashboard_update(jsonb)', 'execute') as anon_can_execute,
      has_function_privilege('authenticated', 'public.create_dashboard_update(jsonb)', 'execute') as authenticated_can_execute`)
    assert.deepEqual(rpcPrivileges.rows[0], { anon_can_execute: false, authenticated_can_execute: true })

    const uploaded = await db.query(`select (public.upload_report_image_with_storage_metadata(
      'report-1', 'report/path.png', 'report/path.png', 'image.png', 'image/png', 3,
      'receipt', 'google_drive', 'drive-report-image', 'report-folder', '${'a'.repeat(64)}'
    )).external_parent_id as parent_id`)
    assert.equal(uploaded.rows[0]?.parent_id, 'report-folder')
    await assert.rejects(() => db.query(`select public.upload_report_image_with_storage_metadata(
      'report-1', 'path', 'path', 'image.png', 'image/png', 3, 'receipt', null,
      'drive-id', 'folder-id', '${'a'.repeat(64)}')`))

    assert.equal((await db.query(`select private.can_read_shift('shift-1') as can_read`)).rows[0]?.can_read, true)
    await db.exec(`update private.actor_context set permission='member'`)
    await assert.rejects(() => db.query(`select public.create_dashboard_update(jsonb_build_object(
      'shift_id', 'shift-1'
    ))`), /OPERATION_NOT_ALLOWED/u)
    await db.exec(`update private.actor_context set actor_id=null`)
    await assert.rejects(() => db.query(`select public.create_dashboard_update(jsonb_build_object(
      'shift_id', 'shift-1'
    ))`), /AUTHENTICATION_REQUIRED/u)
    await db.exec(`update private.actor_context set actor_id='business-1', permission='leader'`)

    await db.exec(`update private.actor_context set permission='admin'`)
    const adminUpdate = await db.query(`select created_by from public.create_dashboard_update(jsonb_build_object(
      'shift_id', 'shift-1'
    ))`)
    assert.equal(adminUpdate.rows[0]?.created_by, 'business-1')
    await db.exec(`update private.actor_context set permission='leader'`)

    const live = await db.query(`select (public.upsert_live_report_image_with_storage_metadata(jsonb_build_object(
      'provider', 'google_drive', 'external_file_id', 'drive-live-image',
      'external_parent_id', 'live-folder', 'checksum_sha256', '${'b'.repeat(64)}'
    ))).checksum_sha256 as checksum`)
    assert.equal(live.rows[0]?.checksum, 'b'.repeat(64))

    await db.exec(`insert into public.operational_files values (
      'file-1', 'shift:shift-1', 'live_snapshot', 'google_drive', 'shift-1',
      'sha256_verified', 'drive-screenshot', 'snapshot-folder', '${'c'.repeat(64)}', 'image/png', null
    )`)
    const update = await db.query(`select screenshot_file_id, screenshot_url, screenshot_storage_path
      from public.create_dashboard_update(jsonb_build_object(
        'shift_id', 'shift-1', 'screenshot_file_id', 'file-1', 'screenshot_url', 'blob:temporary'
      ))`)
    assert.deepEqual(update.rows[0], {
      screenshot_file_id: 'file-1',
      screenshot_url: '/api/dashboard-screenshots?file_id=file-1',
      screenshot_storage_path: 'dashboard/shift-1/file-1',
    })
    const legacy = await db.query(`select screenshot_url from public.create_dashboard_update(jsonb_build_object(
      'shift_id', 'shift-1', 'screenshot_storage_path', 'dashboard/shift-1/old.png',
      'screenshot_url', 'https://example.test/public-image.png'
    ))`)
    assert.equal(legacy.rows[0]?.screenshot_url, '/api/dashboard-screenshots?storage_path=dashboard/shift-1/old.png')
    await db.exec(`insert into public.operational_files values (
      'file-2', 'shift:shift-2', 'live_snapshot', 'google_drive', 'shift-2',
      'sha256_verified', 'drive-other-screenshot', 'snapshot-folder', '${'d'.repeat(64)}', 'image/png', null
    )`)
    await assert.rejects(() => db.query(`select public.create_dashboard_update(jsonb_build_object(
      'shift_id', 'shift-1', 'screenshot_file_id', 'file-2'
    ))`), /DASHBOARD_SCREENSHOT_NOT_ALLOWED/u)
    await assert.rejects(() => db.query(`select public.create_dashboard_update(jsonb_build_object(
      'shift_id', 'shift-1', 'screenshot_url', 'blob:temporary'
    ))`), /DASHBOARD_SCREENSHOT_NOT_ALLOWED/u)
    await assert.rejects(() => db.query(`select public.create_dashboard_update(jsonb_build_object(
      'shift_id', 'shift-1', 'screenshot_file_id', 'missing-file'
    ))`), /DASHBOARD_SCREENSHOT_NOT_ALLOWED/u)
  } finally {
    await db.close()
  }
})
