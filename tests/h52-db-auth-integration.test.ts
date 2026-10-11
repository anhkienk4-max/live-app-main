import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { PGlite } from 'file:///C:/Users/KienNguyen/.gemini/antigravity-ide/brain/880f22af-577e-49c1-85de-b9f809e7099f/scratch/node_modules/@electric-sql/pglite/dist/index.js';

async function createDatabase() {
  const db = new PGlite();

  // 1. Core Supabase Roles & Schemas
  await db.exec(`
    do $$ begin
      if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
      if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
      if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
    end $$;

    create schema if not exists auth;
    create schema if not exists private;
    create schema if not exists supabase_migrations;

    -- auth.users table
    create table if not exists auth.users (
      id uuid primary key,
      email text unique,
      created_at timestamptz default now()
    );

    -- Standard Supabase auth helper functions
    create or replace function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
    $$;

    create or replace function auth.role() returns text language sql stable as $$
      select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'none')::text;
    $$;

    -- Base Reference Tables
    create table if not exists public.brands (
      id text primary key,
      name text not null,
      status text default 'active'
    );

    create table if not exists public.platforms (
      id text primary key,
      name text not null,
      status text default 'active'
    );

    create table if not exists public.campaigns (
      id text primary key,
      name text not null,
      brand_id text references public.brands(id)
    );

    create table if not exists public.business_users (
      id text primary key,
      auth_user_id uuid references auth.users(id),
      email text not null,
      full_name text not null,
      status text default 'active',
      account_status text default 'active',
      system_permission text default 'member',
      operational_roles text[] default '{}',
      avatar_url text,
      archived_at timestamptz,
      deleted_at timestamptz
    );

    -- Production-equivalent private functions (No simulated mocks!)
    create or replace function private.current_business_user_id()
    returns text language sql stable security definer set search_path = '' as $$
      select business_user.id
      from public.business_users as business_user
      where business_user.auth_user_id = (select auth.uid())
        and business_user.status = 'active'
        and business_user.account_status = 'active'
        and business_user.archived_at is null
        and business_user.deleted_at is null
      limit 1;
    $$;

    create or replace function private.current_system_permission()
    returns text language sql stable security definer set search_path = '' as $$
      select business_user.system_permission
      from public.business_users as business_user
      where business_user.auth_user_id = (select auth.uid())
        and business_user.status = 'active'
        and business_user.account_status = 'active'
        and business_user.archived_at is null
        and business_user.deleted_at is null
      limit 1;
    $$;

    create or replace function private.is_leader_or_admin()
    returns boolean language sql stable security definer set search_path = '' as $$
      select coalesce(private.current_system_permission() in ('leader', 'admin'), false);
    $$;

    -- Reports table
    create table if not exists public.reports (
      id text primary key default gen_random_uuid()::text,
      brand_id text references public.brands(id),
      submitted_by text references public.business_users(id),
      status text default 'draft',
      metrics_confirmed boolean default false,
      deleted_at timestamptz,
      archived_at timestamptz,
      ocr_review jsonb,
      final_recap jsonb,
      created_at timestamptz default now()
    );

    -- Report Images table
    create table if not exists public.report_images (
      id text primary key default gen_random_uuid()::text,
      report_id text references public.reports(id),
      image_type text,
      original_name text,
      file_url text not null,
      storage_path text,
      mime_type text,
      size_bytes bigint,
      uploaded_by text references public.business_users(id),
      created_at timestamptz default now()
    );

    -- Live Report Images table
    create table if not exists public.live_report_images (
      id text primary key default gen_random_uuid()::text,
      report_id text references public.reports(id),
      category text not null check (category in ('key_visual','live_session','other')),
      title text,
      description text,
      captured_at timestamptz,
      file_url text not null,
      thumbnail_url text,
      file_name text not null,
      mime_type text,
      size_bytes bigint,
      sort_order integer default 0,
      is_cover boolean default false,
      uploaded_by text references public.business_users(id),
      created_at timestamptz default now(),
      storage_file_name text,
      storage_idempotency_key text
    );

    create unique index if not exists live_report_images_dedupe_key on public.live_report_images (report_id, file_url);
    create unique index if not exists live_report_images_storage_idempotency_key on public.live_report_images (report_id, storage_idempotency_key) where storage_idempotency_key is not null;

    -- Shifts table with Optimistic Locking
    create table if not exists public.shifts (
      id text primary key default gen_random_uuid()::text,
      date date,
      title text,
      brand_id text references public.brands(id),
      version integer default 1,
      updated_at timestamptz default now()
    );

    create or replace function private.bump_concurrency_version()
    returns trigger language plpgsql security invoker set search_path = '' as $$
    begin
      new.version := coalesce(old.version, 1) + 1;
      new.updated_at := statement_timestamp();
      return new;
    end;
    $$;

    drop trigger if exists shifts_bump_concurrency_version on public.shifts;
    create trigger shifts_bump_concurrency_version
    before update on public.shifts
    for each row execute function private.bump_concurrency_version();

    -- Staff Directory RPC (Contract B)
    create or replace function public.get_staff_directory()
    returns table (id text, full_name text, avatar_url text, operational_roles text[])
    language sql stable security definer set search_path = '' as $$
      select bu.id, bu.full_name, bu.avatar_url, bu.operational_roles
      from public.business_users bu
      where bu.status = 'active'
        and bu.account_status = 'active'
        and bu.archived_at is null
        and bu.deleted_at is null
      order by bu.full_name;
    $$;
  `);

  // 2. Apply Forward-Only Provider Migration (Contract A & Delete RPCs)
  const migrationPath = path.resolve(process.cwd(), 'supabase/migrations/20261011221500_rc15_provider_metadata_forward_compat.sql');
  const migrationSql = fs.readFileSync(migrationPath, 'utf8');
  await db.exec(migrationSql);

  // 3. Seed Auth and Business Users
  await db.exec(`
    -- Auth Users
    insert into auth.users (id, email) values
      ('11111111-1111-1111-1111-111111111111', 'admin@example.com'),
      ('22222222-2222-2222-2222-222222222222', 'leader@example.com'),
      ('33333333-3333-3333-3333-333333333333', 'member1@example.com'),
      ('44444444-4444-4444-4444-444444444444', 'member2@example.com'),
      ('55555555-5555-5555-5555-555555555555', 'disabled@example.com'),
      ('66666666-6666-6666-6666-666666666666', 'archived@example.com');

    -- Brands
    insert into public.brands (id, name) values
      ('brand-alpha', 'Brand Alpha'),
      ('brand-beta', 'Brand Beta');

    -- Business Users
    insert into public.business_users (id, auth_user_id, email, full_name, system_permission, status, account_status) values
      ('admin-1', '11111111-1111-1111-1111-111111111111', 'admin@example.com', 'Admin User', 'admin', 'active', 'active'),
      ('leader-1', '22222222-2222-2222-2222-222222222222', 'leader@example.com', 'Leader User', 'leader', 'active', 'active'),
      ('member-1', '33333333-3333-3333-3333-333333333333', 'member1@example.com', 'Member One', 'member', 'active', 'active'),
      ('member-2', '44444444-4444-4444-4444-444444444444', 'member2@example.com', 'Member Two', 'member', 'active', 'active');

    insert into public.business_users (id, auth_user_id, email, full_name, system_permission, status, account_status) values
      ('disabled-user', '55555555-5555-5555-5555-555555555555', 'disabled@example.com', 'Disabled User', 'member', 'suspended', 'suspended');

    insert into public.business_users (id, auth_user_id, email, full_name, system_permission, status, account_status, archived_at) values
      ('archived-user', '66666666-6666-6666-6666-666666666666', 'archived@example.com', 'Archived User', 'member', 'active', 'active', now());

    -- Reports
    insert into public.reports (id, brand_id, submitted_by, status, metrics_confirmed) values
      ('rep-draft-1', 'brand-alpha', 'member-1', 'draft', false),
      ('rep-confirmed-metrics', 'brand-alpha', 'member-1', 'confirmed', true),
      ('rep-status-confirmed-only', 'brand-alpha', 'member-1', 'confirmed', false),
      ('rep-brand-beta', 'brand-beta', 'member-2', 'draft', false);

    insert into public.reports (id, brand_id, submitted_by, status, metrics_confirmed, deleted_at) values
      ('rep-deleted', 'brand-alpha', 'member-1', 'draft', false, now());

    insert into public.reports (id, brand_id, submitted_by, status, metrics_confirmed, archived_at) values
      ('rep-archived', 'brand-alpha', 'member-1', 'draft', false, now());

    -- Report Images
    insert into public.report_images (id, report_id, file_url, uploaded_by, provider, external_file_id) values
      ('img-member1', 'rep-draft-1', 'https://storage/img-1.png', 'member-1', 'google_drive', 'drive-111'),
      ('img-null-uploader', 'rep-draft-1', 'https://storage/img-null.png', null, 'google_drive', 'drive-222'),
      ('img-confirmed-metrics', 'rep-confirmed-metrics', 'https://storage/img-conf1.png', 'member-1', 'google_drive', 'drive-333'),
      ('img-status-confirmed-only', 'rep-status-confirmed-only', 'https://storage/img-conf2.png', 'member-1', 'google_drive', 'drive-444'),
      ('img-deleted-rep', 'rep-deleted', 'https://storage/img-del.png', 'member-1', 'google_drive', 'drive-555'),
      ('img-archived-rep', 'rep-archived', 'https://storage/img-arc.png', 'member-1', 'google_drive', 'drive-666');

    -- Live Report Images
    insert into public.live_report_images (id, report_id, category, file_name, file_url, uploaded_by, provider, external_file_id) values
      ('live-img-member1', 'rep-draft-1', 'key_visual', 'kv1.png', 'https://storage/kv1.png', 'member-1', 'google_drive', 'drive-kv1'),
      ('live-img-null-uploader', 'rep-draft-1', 'key_visual', 'kv-null.png', 'https://storage/kv-null.png', null, 'google_drive', 'drive-kv-null'),
      ('live-img-confirmed-metrics', 'rep-confirmed-metrics', 'key_visual', 'kv-conf1.png', 'https://storage/kv-conf1.png', 'member-1', 'google_drive', 'drive-kv-conf1'),
      ('live-img-status-confirmed-only', 'rep-status-confirmed-only', 'key_visual', 'kv-conf2.png', 'https://storage/kv-conf2.png', 'member-1', 'google_drive', 'drive-kv-conf2'),
      ('live-img-deleted-rep', 'rep-deleted', 'key_visual', 'kv-del.png', 'https://storage/kv-del.png', 'member-1', 'google_drive', 'drive-kv-del'),
      ('live-img-archived-rep', 'rep-archived', 'key_visual', 'kv-arc.png', 'https://storage/kv-arc.png', 'member-1', 'google_drive', 'drive-kv-arc');

    -- Shifts
    insert into public.shifts (id, title, brand_id, version) values
      ('shift-100', 'Morning Live Shift', 'brand-alpha', 1);
  `);

  return db;
}

// Helper to set PostgreSQL transaction auth context
async function setAuthContext(db: PGlite, authSub: string | null) {
  if (!authSub) {
    await db.exec(`
      set request.jwt.claim.sub = '';
      set request.jwt.claim.role = 'none';
    `);
  } else {
    await db.exec(`
      set request.jwt.claim.sub = '${authSub}';
      set request.jwt.claim.role = 'authenticated';
    `);
  }
}

test('H.5.2 Database Auth Integration: Unauthenticated caller is rejected with 42501 AUTHENTICATION_REQUIRED', async () => {
  const db = await createDatabase();
  await setAuthContext(db, null);

  await assert.rejects(
    async () => db.query('select public.authorize_report_image_delete($1);', ['img-member1']),
    (err: unknown) => {
      const e = err as { message?: string };
      return /AUTHENTICATION_REQUIRED/i.test(e?.message || '');
    }
  );

  await assert.rejects(
    async () => db.query('select public.authorize_live_report_image_delete($1);', ['live-img-member1']),
    (err: unknown) => {
      const e = err as { message?: string };
      return /AUTHENTICATION_REQUIRED/i.test(e?.message || '');
    }
  );
});

test('H.5.2 Database Auth Integration: Suspended or Archived users resolve actor_id to NULL and are rejected', async () => {
  const db = await createDatabase();

  // Suspended user
  await setAuthContext(db, '55555555-5555-5555-5555-555555555555');
  await assert.rejects(
    async () => db.query('select public.authorize_report_image_delete($1);', ['img-member1']),
    (err: unknown) => /AUTHENTICATION_REQUIRED/i.test((err as Error).message)
  );

  // Archived user
  await setAuthContext(db, '66666666-6666-6666-6666-666666666666');
  await assert.rejects(
    async () => db.query('select public.authorize_report_image_delete($1);', ['img-member1']),
    (err: unknown) => /AUTHENTICATION_REQUIRED/i.test((err as Error).message)
  );
});

test('H.5.2 Database Auth Integration: NULL uploaded_by is strictly rejected for Member (P0 Guard)', async () => {
  const db = await createDatabase();
  await setAuthContext(db, '33333333-3333-3333-3333-333333333333'); // member-1

  await assert.rejects(
    async () => db.query('select public.authorize_report_image_delete($1);', ['img-null-uploader']),
    (err: unknown) => /OPERATION_NOT_ALLOWED/i.test((err as Error).message)
  );

  await assert.rejects(
    async () => db.query('select public.authorize_live_report_image_delete($1);', ['live-img-null-uploader']),
    (err: unknown) => /OPERATION_NOT_ALLOWED/i.test((err as Error).message)
  );
});

test('H.5.2 Database Auth Integration: Cross-member deletion is rejected', async () => {
  const db = await createDatabase();
  await setAuthContext(db, '44444444-4444-4444-4444-444444444444'); // member-2 attempting to delete member-1 image

  await assert.rejects(
    async () => db.query('select public.authorize_report_image_delete($1);', ['img-member1']),
    (err: unknown) => /OPERATION_NOT_ALLOWED/i.test((err as Error).message)
  );

  await assert.rejects(
    async () => db.query('select public.authorize_live_report_image_delete($1);', ['live-img-member1']),
    (err: unknown) => /OPERATION_NOT_ALLOWED/i.test((err as Error).message)
  );
});

test('H.5.2 Database Auth Integration: Admin and Leader can delete member image on draft report', async () => {
  const db = await createDatabase();

  // Admin
  await setAuthContext(db, '11111111-1111-1111-1111-111111111111');
  const adminRes = await db.query('select public.authorize_report_image_delete($1) as allowed;', ['img-member1']);
  assert.equal(adminRes.rows[0].allowed, true);
  const adminLiveRes = await db.query('select public.authorize_live_report_image_delete($1) as allowed;', ['live-img-member1']);
  assert.equal(adminLiveRes.rows[0].allowed, true);

  // Leader
  await setAuthContext(db, '22222222-2222-2222-2222-222222222222');
  const leaderRes = await db.query('select public.authorize_report_image_delete($1) as allowed;', ['img-member1']);
  assert.equal(leaderRes.rows[0].allowed, true);
  const leaderLiveRes = await db.query('select public.authorize_live_report_image_delete($1) as allowed;', ['live-img-member1']);
  assert.equal(leaderLiveRes.rows[0].allowed, true);
});

test('H.5.2 Database Auth Integration: Confirmed report images are immutable (metrics_confirmed = true)', async () => {
  const db = await createDatabase();

  // Member
  await setAuthContext(db, '33333333-3333-3333-3333-333333333333');
  await assert.rejects(
    async () => db.query('select public.authorize_report_image_delete($1);', ['img-confirmed-metrics']),
    (err: unknown) => /REPORT_CONFIRMED/i.test((err as Error).message)
  );

  // Admin
  await setAuthContext(db, '11111111-1111-1111-1111-111111111111');
  await assert.rejects(
    async () => db.query('select public.authorize_report_image_delete($1);', ['img-confirmed-metrics']),
    (err: unknown) => /REPORT_CONFIRMED/i.test((err as Error).message)
  );

  // Live report image - Leader
  await setAuthContext(db, '22222222-2222-2222-2222-222222222222');
  await assert.rejects(
    async () => db.query('select public.authorize_live_report_image_delete($1);', ['live-img-confirmed-metrics']),
    (err: unknown) => /REPORT_CONFIRMED/i.test((err as Error).message)
  );
});

test('H.5.2 Database Auth Integration: status=confirmed with metrics_confirmed=false is immutable against all roles', async () => {
  const db = await createDatabase();

  // Member
  await setAuthContext(db, '33333333-3333-3333-3333-333333333333');
  await assert.rejects(
    async () => db.query('select public.authorize_report_image_delete($1);', ['img-status-confirmed-only']),
    (err: unknown) => /REPORT_CONFIRMED/i.test((err as Error).message)
  );

  // Admin
  await setAuthContext(db, '11111111-1111-1111-1111-111111111111');
  await assert.rejects(
    async () => db.query('select public.authorize_report_image_delete($1);', ['img-status-confirmed-only']),
    (err: unknown) => /REPORT_CONFIRMED/i.test((err as Error).message)
  );

  // Live report image - Leader
  await setAuthContext(db, '22222222-2222-2222-2222-222222222222');
  await assert.rejects(
    async () => db.query('select public.authorize_live_report_image_delete($1);', ['live-img-status-confirmed-only']),
    (err: unknown) => /REPORT_CONFIRMED/i.test((err as Error).message)
  );
});

test('H.5.2 Database Auth Integration: Deleted or Archived reports reject deletion as REPORT_NOT_FOUND', async () => {
  const db = await createDatabase();
  await setAuthContext(db, '11111111-1111-1111-1111-111111111111'); // Even Admin is rejected

  // Deleted report image
  await assert.rejects(
    async () => db.query('select public.authorize_report_image_delete($1);', ['img-deleted-rep']),
    (err: unknown) => /REPORT_NOT_FOUND/i.test((err as Error).message)
  );

  // Archived report image
  await assert.rejects(
    async () => db.query('select public.authorize_report_image_delete($1);', ['img-archived-rep']),
    (err: unknown) => /REPORT_NOT_FOUND/i.test((err as Error).message)
  );

  // Live image on deleted report
  await assert.rejects(
    async () => db.query('select public.authorize_live_report_image_delete($1);', ['live-img-deleted-rep']),
    (err: unknown) => /REPORT_NOT_FOUND/i.test((err as Error).message)
  );
});

test('H.5.2 Database Auth Integration: Staff Directory (Contract B) only returns safe columns', async () => {
  const db = await createDatabase();
  await setAuthContext(db, '33333333-3333-3333-3333-333333333333'); // member-1

  const dirRes = await db.query('select * from public.get_staff_directory();');
  assert.ok(dirRes.rows.length >= 4, 'Directory should return active users');
  const cols = Object.keys(dirRes.rows[0]);
  assert.deepEqual(cols.sort(), ['avatar_url', 'full_name', 'id', 'operational_roles'].sort(), 'Directory must ONLY expose safe public columns');
  assert.equal(cols.includes('email'), false, 'Email must NEVER be exposed in staff directory');
  assert.equal(cols.includes('system_permission'), false, 'system_permission must not be exposed');
});

test('H.5.2 Database Auth Integration: Optimistic Concurrency version bump in shifts table', async () => {
  const db = await createDatabase();

  const initial = await db.query('select version from public.shifts where id = $1;', ['shift-100']);
  assert.equal(initial.rows[0].version, 1);

  // Trigger update
  await db.query('update public.shifts set title = $1 where id = $2;', ['Updated Title', 'shift-100']);

  const updated = await db.query('select version from public.shifts where id = $1;', ['shift-100']);
  assert.equal(updated.rows[0].version, 2, 'Version must increment from 1 to 2 via trigger');
});
