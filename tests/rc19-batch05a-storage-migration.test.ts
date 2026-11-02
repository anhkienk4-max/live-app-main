import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

import { PGlite } from '@electric-sql/pglite'

const migrationPath = fileURLToPath(new URL('../supabase/migrations/20261102110000_rc19_batch05a_report_storage.sql', import.meta.url))

test('Batch 05A migration applies on isolated PostgreSQL 17 and enforces provider metadata and screenshot ownership', async () => {
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
      create function private.current_business_user_id() returns text language sql as $$
        select 'business-1'::text $$;
      create function private.can_read_shift(text) returns boolean language sql as $$
        select true $$;
      insert into public.shifts(id, status) values ('shift-1', 'live');
    `)
    await db.exec(await readFile(migrationPath, 'utf8'))
    assert.equal((await db.query(`select public from storage.buckets where id='live-dashboard-images'`)).rows[0]?.public, false)
    const imagePolicies = await db.query(`select policyname from pg_policies where schemaname='storage' and tablename='objects'`)
    assert.deepEqual(imagePolicies.rows, [{ policyname: 'live dashboard image scoped read' }])

    const uploaded = await db.query(`select (public.upload_report_image_with_storage_metadata(
      'report-1', 'report/path.png', 'report/path.png', 'image.png', 'image/png', 3,
      'receipt', 'google_drive', 'drive-report-image', 'report-folder', '${'a'.repeat(64)}'
    )).external_parent_id as parent_id`)
    assert.equal(uploaded.rows[0]?.parent_id, 'report-folder')
    await assert.rejects(() => db.query(`select public.upload_report_image_with_storage_metadata(
      'report-1', 'path', 'path', 'image.png', 'image/png', 3, 'receipt', null,
      'drive-id', 'folder-id', '${'a'.repeat(64)}')`))

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
