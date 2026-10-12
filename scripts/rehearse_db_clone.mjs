import assert from 'node:assert/strict';
import fs from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

async function runIsolatedFixtureRehearsal() {
  console.log('--- STARTING ISOLATED FIXTURE DATABASE REHEARSAL (SYNTHETIC SCHEMA) ---');
  const db = new PGlite();

  // Synthetic schema fixture only; never substitute for a Production schema dump.
  console.log('\n[1/7] Setting up Hand-built fixture baseline schema with authentic Supabase auth...');
  await db.exec(`
    -- Roles
    do $$ begin
      if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
      if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
      if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
    end $$;

    -- Schemas
    create schema if not exists auth;
    create schema if not exists private;
    create schema if not exists supabase_migrations;

    -- Migration Ledger Table
    create table if not exists supabase_migrations.schema_migrations (
      version text primary key,
      statements text[],
      name text
    );

    -- Standard Supabase auth helper functions
    create table if not exists auth.users (
      id uuid primary key,
      email text unique,
      created_at timestamptz default now()
    );

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

    -- Authentic Production private helper functions (strictly query business_users via auth.uid())
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

    create or replace function private.current_business_user_is_active()
    returns boolean language sql stable security definer set search_path = '' as $$
      select exists (
        select 1
        from public.business_users as business_user
        where business_user.auth_user_id = (select auth.uid())
          and business_user.status = 'active'
          and business_user.account_status = 'active'
          and business_user.archived_at is null
          and business_user.deleted_at is null
      );
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

    create or replace function private.require_shift_actor(p_leader_required boolean)
    returns text language plpgsql stable security definer set search_path = '' as $$
    declare
      actor_id text;
    begin
      actor_id := private.current_business_user_id();
      if actor_id is null then
        raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED';
      end if;
      if p_leader_required and not private.is_leader_or_admin() then
        raise exception using errcode = '42501', message = 'OPERATION_NOT_ALLOWED';
      end if;
      return actor_id;
    end;
    $$;

    create or replace function private.require_report_actor(p_must_be_admin boolean)
    returns text language plpgsql stable security definer set search_path = '' as $$
    declare
      u_id text;
      perm text;
    begin
      u_id := private.current_business_user_id();
      if u_id is null then raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED'; end if;
      perm := private.current_system_permission();
      if p_must_be_admin and perm <> 'admin' then
        raise exception using errcode = '42501', message = 'OPERATION_NOT_ALLOWED';
      end if;
      return u_id;
    end;
    $$;

    create or replace function private.normalize_shift_capacity(p_value text, p_default smallint)
    returns smallint language plpgsql immutable security invoker set search_path = '' as $$
    declare
      parsed numeric;
    begin
      if p_value is null or btrim(p_value) = '' then return p_default; end if;
      begin
        parsed := p_value::numeric;
      exception when others then
        raise exception using errcode = '22023', message = 'SHIFT_CAPACITY_INVALID';
      end;
      if parsed < 0 or parsed > 100 or trunc(parsed) <> parsed then
        raise exception using errcode = '22023', message = 'SHIFT_CAPACITY_INVALID';
      end if;
      return parsed::smallint;
    end;
    $$;

    create table if not exists public.system_settings (
      id text primary key,
      default_host_count smallint default 1,
      default_support_count smallint default 1,
      default_technical_count smallint default 1,
      allow_multi_role_per_shift boolean default true
    );

    insert into public.system_settings (id, default_host_count, default_support_count, default_technical_count, allow_multi_role_per_shift)
    values ('default', 1, 1, 1, true)
    on conflict (id) do nothing;

    create table if not exists public.shifts (
      id text primary key default gen_random_uuid()::text,
      date date,
      start_time time,
      end_time time,
      timezone text default 'Asia/Ho_Chi_Minh',
      brand_id text references public.brands(id),
      platform_id text references public.platforms(id),
      campaign_id text references public.campaigns(id),
      title text,
      studio text,
      host_id text references public.business_users(id),
      support_id text references public.business_users(id),
      technical_id text references public.business_users(id),
      host_names text[] default '{}'::text[],
      assistant_names text[] default '{}'::text[],
      technical_names text[] default '{}'::text[],
      required_host_count integer default 1,
      required_support_count integer default 1,
      required_technical_count integer default 1,
      registration_cutoff_at timestamptz,
      allow_multi_role boolean default false,
      registration_locked boolean default false,
      start_at timestamptz default now(),
      end_at timestamptz default now() + interval '3 hours',
      end_date date default current_date,
      crosses_midnight boolean default false,
      duration_minutes smallint default 180,
      import_batch_id text,
      status text default 'scheduled',
      status_mode text default 'auto',
      live_link text,
      product_notes text,
      updated_by text references public.business_users(id),
      updated_at timestamptz default now(),
      deleted_at timestamptz,
      archived_at timestamptz,
      version integer default 1
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

    create or replace function private.assert_shift_staffing_consistent(p_shift public.shifts)
    returns void language plpgsql security definer set search_path = '' as $$
    begin
      return;
    end;
    $$;

    create or replace function private.assert_expected_version(
      p_entity text,
      p_expected_version integer,
      p_actual_version integer
    )
    returns void language plpgsql security invoker set search_path = '' as $$
    begin
      if p_expected_version is null or p_expected_version < 1 then
        raise exception using errcode = 'P0001', message = 'EXPECTED_VERSION_REQUIRED';
      end if;
      if p_expected_version <> p_actual_version then
        raise exception using errcode = 'P0001', message = 'OPTIMISTIC_LOCK_CONFLICT';
      end if;
    end;
    $$;

    create table if not exists public.shift_registrations (
      id text primary key default gen_random_uuid()::text,
      shift_id text references public.shifts(id),
      user_id text references public.business_users(id),
      role text,
      status text default 'pending',
      applied_at timestamptz default now()
    );

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

    -- Base upload_report_image function from 20260823000000
    create or replace function public.upload_report_image(
      p_report_id text,
      p_storage_path text,
      p_image_url text,
      p_original_name text,
      p_mime_type text,
      p_size_bytes bigint,
      p_image_type text
    )
    returns public.report_images
    language plpgsql
    security definer
    set search_path = ''
    as $$
    declare
      actor_id text;
      target_report public.reports;
      created_image public.report_images;
    begin
      actor_id := private.require_report_actor(false);
      select * into target_report
      from public.reports
      where id = p_report_id and deleted_at is null and archived_at is null
      for update;
      if target_report.id is null then
        raise exception using errcode = 'P0001', message = 'REPORT_NOT_FOUND';
      end if;
      if target_report.metrics_confirmed or target_report.status = 'confirmed' then
        raise exception using errcode = 'P0001', message = 'REPORT_CONFIRMED';
      end if;
      if private.current_system_permission() = 'member'
        and target_report.submitted_by <> actor_id then
        raise exception using errcode = '42501', message = 'OPERATION_NOT_ALLOWED';
      end if;

      insert into public.report_images (
        report_id, file_url, storage_path, original_name,
        mime_type, size_bytes, image_type, uploaded_by
      ) values (
        p_report_id, p_image_url, p_storage_path, p_original_name,
        p_mime_type, p_size_bytes, p_image_type, actor_id
      ) returning * into created_image;

      return created_image;
    end;
    $$;

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

    -- Contract B Staff Directory function
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

  // Record baseline migrations already on Production
  await db.exec(`
    insert into supabase_migrations.schema_migrations (version, name) values
      ('20260811110239', 'p1b_master_data'),
      ('20260814085659', 'p1c_shift_persistence'),
      ('20260823000000', 'p3_report_persistence');
  `);
  console.log('✔ Production baseline schema ready.');

  // STEP 2: Apply the 3 RC15 Migrations Existing on Production
  console.log('\n[2/7] Loading existing Production RC15 migrations (20261011091925, 20261011092015, 20261011092051)...');
  const migRoutes = fs.readFileSync('supabase/migrations/20261011091925_rc15_storage_route_prerequisites.sql', 'utf8');
  await db.exec(migRoutes);
  await db.exec(`insert into supabase_migrations.schema_migrations (version, name) values ('20261011091925', 'rc15_storage_route_prerequisites');`);

  const fixtureShiftBaseline = fs.readFileSync('tests/fixtures/rc15_production_shift_rpc_baseline.sql', 'utf8');
  await db.exec(fixtureShiftBaseline);

  const migShiftRpc = fs.readFileSync('supabase/migrations/20261011092015_rc15_shift_rpc_compatibility.sql', 'utf8');
  await db.exec(migShiftRpc);
  await db.exec(`insert into supabase_migrations.schema_migrations (version, name) values ('20261011092015', 'rc15_shift_rpc_compatibility');`);

  const migOpFiles = fs.readFileSync('supabase/migrations/20261011092051_rc15_operational_files.sql', 'utf8');
  await db.exec(migOpFiles);
  await db.exec(`insert into supabase_migrations.schema_migrations (version, name) values ('20261011092051', 'rc15_operational_files');`);
  console.log('✔ Existing Production RC15 migrations loaded.');

  // STEP 3: Seed Reference Data (Sanitized, No PII)
  console.log('\n[3/7] Seeding sanitized operational master data...');
  await db.exec(`
    insert into auth.users (id, email) values
      ('11111111-1111-1111-1111-111111111111', 'admin@example.com'),
      ('22222222-2222-2222-2222-222222222222', 'leader@example.com'),
      ('33333333-3333-3333-3333-333333333333', 'member1@example.com'),
      ('44444444-4444-4444-4444-444444444444', 'member2@example.com'),
      ('55555555-5555-5555-5555-555555555555', 'suspended@example.com');

    insert into public.brands (id, name) values
      ('brand-1', 'Alpha Cosmetics'),
      ('brand-2', 'Beta Electronics');

    insert into public.platforms (id, name) values
      ('shopee', 'Shopee Live'),
      ('tiktok', 'TikTok Shop');

    insert into public.business_users (id, auth_user_id, email, full_name, system_permission, operational_roles) values
      ('admin-1', '11111111-1111-1111-1111-111111111111', 'admin@example.com', 'Admin Lead', 'admin', array['host', 'support']),
      ('leader-1', '22222222-2222-2222-2222-222222222222', 'leader@example.com', 'Shift Supervisor', 'leader', array['host']),
      ('member-1', '33333333-3333-3333-3333-333333333333', 'member1@example.com', 'Host Member', 'member', array['host']),
      ('member-2', '44444444-4444-4444-4444-444444444444', 'member2@example.com', 'Support Member', 'member', array['support']),
      ('suspended-1', '55555555-5555-5555-5555-555555555555', 'suspended@example.com', 'Suspended Member', 'member', array['host']);

    update public.business_users set status = 'suspended', account_status = 'suspended' where id = 'suspended-1';
  `);
  console.log('✔ Master data seeded.');

  // STEP 4: Apply Candidate Forward Migration (Contract A)
  console.log('\n[4/7] Applying Candidate Migration 20261011221500_rc15_provider_metadata_forward_compat.sql...');
  const migCandidate = fs.readFileSync('supabase/migrations/20261011221500_rc15_provider_metadata_forward_compat.sql', 'utf8');
  await db.exec(migCandidate);
  await db.exec(`insert into supabase_migrations.schema_migrations (version, name) values ('20261011221500', 'rc15_provider_metadata_forward_compat');`);
  console.log('✔ Candidate migration applied.');

  // STEP 5: Migration Rollback and Re-Apply Rehearsal
  console.log('\n[5/7] Rehearsing Migration Rollback and Idempotent Re-application...');
  // Rollback 20261011221500
  await db.exec(`
    alter table public.report_images drop constraint if exists report_images_file_provider_pair;
    alter table public.live_report_images drop constraint if exists live_report_images_file_provider_pair;
    drop function if exists public.upload_report_image_with_provider(text, text, text, text, text, bigint, text, text, text);
    drop function if exists public.upsert_live_report_image_with_provider(jsonb);
    drop function if exists public.authorize_report_image_delete(text);
    drop function if exists public.authorize_live_report_image_delete(text);
    delete from supabase_migrations.schema_migrations where version = '20261011221500';
  `);
  const postRollbackLedger = (await db.query(`select version from supabase_migrations.schema_migrations order by version;`)).rows;
  assert.equal(postRollbackLedger.length, 6, 'Ledger after rollback must have exactly 6 baseline entries');
  console.log('✔ Rollback successful: 6 baseline migrations remaining in ledger.');

  // Re-apply 20261011221500 cleanly
  await db.exec(migCandidate);
  await db.exec(`insert into supabase_migrations.schema_migrations (version, name) values ('20261011221500', 'rc15_provider_metadata_forward_compat');`);
  const finalLedger = (await db.query(`select version, name from supabase_migrations.schema_migrations order by version;`)).rows;
  assert.equal(finalLedger.length, 7, 'Ledger after re-apply must have exactly 7 entries');
  console.log('✔ Re-apply successful: exactly 7 migrations recorded:', finalLedger.map(r => r.version).join(', '));

  // STEP 6: Execute Functional & Security Verifications under Authentic Auth Context
  console.log('\n[6/7] Running Functional, Concurrency, and Authorization Verifications...');

  // Test 6.1: Contract B Directory Privacy under Authenticated Member
  await db.exec(`
    set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
    set request.jwt.claim.role = 'authenticated';
  `);
  const dirRows = (await db.query(`select * from public.get_staff_directory();`)).rows;
  assert.ok(dirRows.length >= 4, 'Directory must return active users');
  assert.deepEqual(Object.keys(dirRows[0]).sort(), ['avatar_url', 'full_name', 'id', 'operational_roles'].sort(), 'Directory must ONLY return safe public columns');
  console.log('✔ Test 6.1: Staff directory privacy verified.');

  // Test 6.2: Contract C Shift creation with execution_source & Optimistic Lock under Leader
  await db.exec(`
    set request.jwt.claim.sub = '22222222-2222-2222-2222-222222222222';
    set request.jwt.claim.role = 'authenticated';
  `);
  const shiftCreated = (await db.query(`
    select * from public.create_shift($1::jsonb);
  `, [JSON.stringify({
    date: '2026-10-15',
    start_time: '09:00:00',
    end_time: '12:00:00',
    brand_id: 'brand-1',
    platform_id: 'shopee',
    title: 'Morning Flash Sale',
    execution_source: 'agency'
  })])).rows[0];
  assert.ok(shiftCreated.id, 'Shift creation must return shift row');
  assert.equal(shiftCreated.execution_source, 'agency', 'execution_source must be stored');
  console.log('✔ Test 6.2a: create_shift with execution_source = agency succeeded.');

  // Test 6.2b: update_shift optimistic lock check
  const shiftUpdated = (await db.query(`
    select * from public.update_shift($1, $2::jsonb, false, $3);
  `, [shiftCreated.id, JSON.stringify({ title: 'Updated Morning Flash Sale' }), shiftCreated.version])).rows[0];
  assert.equal(shiftUpdated.title, 'Updated Morning Flash Sale');
  assert.equal(shiftUpdated.version, shiftCreated.version + 1, 'Shift version must increment on update');
  console.log('✔ Test 6.2b: update_shift version increment verified.');

  // Test 6.2c: update_shift conflict with stale expected version
  let conflictCaught = false;
  try {
    await db.query(`select * from public.update_shift($1, $2::jsonb, false, $3);`, [shiftCreated.id, JSON.stringify({ title: 'Stale Write' }), 1]);
  } catch (err) {
    conflictCaught = /OPTIMISTIC_LOCK_CONFLICT|STALE_WRITE/i.test(err.message);
  }
  assert.ok(conflictCaught, 'Stale expected_version must be rejected with OPTIMISTIC_LOCK_CONFLICT');
  console.log('✔ Test 6.2c: Optimistic lock conflict rejection verified.');

  // Test 6.3: Contract A Provider Metadata Validation
  await db.exec(`
    set request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
    set request.jwt.claim.role = 'authenticated';
  `);
  // Seed draft report for member-1
  const draftRep = (await db.query(`
    insert into public.reports (brand_id, submitted_by, status, metrics_confirmed)
    values ('brand-1', 'member-1', 'draft', false) returning id;
  `)).rows[0];

  // Upload with valid google_drive metadata
  const uploadRes = (await db.query(`
    select * from public.upload_report_image_with_provider(
      $1, 'reports/kv.png', 'https://storage/kv.png', 'kv.png', 'image/png', 1024, 'key_visual', 'google_drive', 'drive-file-abc'
    );
  `, [draftRep.id])).rows[0];
  assert.ok(uploadRes.id, 'Image upload with provider must succeed');
  assert.equal(uploadRes.provider, 'google_drive');
  assert.equal(uploadRes.external_file_id, 'drive-file-abc');
  console.log('✔ Test 6.3a: upload_report_image_with_provider succeeded.');

  // Invalid provider metadata rejection
  let invalidMetaCaught = false;
  try {
    await db.query(`
      select * from public.upload_report_image_with_provider(
        $1, 'reports/kv2.png', 'https://storage/kv2.png', 'kv2.png', 'image/png', 1024, 'key_visual', 'dropbox', 'dbx-123'
      );
    `, [draftRep.id]);
  } catch (err) {
    invalidMetaCaught = /REPORT_FILE_PROVIDER_METADATA_INVALID/i.test(err.message);
  }
  assert.ok(invalidMetaCaught, 'Unsupported provider must be rejected with REPORT_FILE_PROVIDER_METADATA_INVALID');
  console.log('✔ Test 6.3b: Invalid provider rejection verified.');

  // Test 6.4: Legacy Delete Contract Parity (status = 'confirmed', metrics_confirmed = false)
  const confRep = (await db.query(`
    insert into public.reports (brand_id, submitted_by, status, metrics_confirmed)
    values ('brand-1', 'member-1', 'confirmed', false) returning id;
  `)).rows[0];
  const confImg = (await db.query(`
    insert into public.report_images (report_id, file_url, uploaded_by, provider, external_file_id)
    values ($1, 'https://storage/conf.png', 'member-1', 'google_drive', 'drive-conf') returning id;
  `, [confRep.id])).rows[0];

  let deleteConfirmedCaught = false;
  try {
    await db.query(`select public.authorize_report_image_delete($1);`, [confImg.id]);
  } catch (err) {
    deleteConfirmedCaught = /REPORT_CONFIRMED/i.test(err.message);
  }
  assert.ok(deleteConfirmedCaught, 'authorize_report_image_delete must reject when status = confirmed even if metrics_confirmed = false');
  console.log('✔ Test 6.4: Legacy delete contract parity verified.');

  // STEP 7: Audit Absence of Simulated Helpers
  console.log('\n[7/7] Auditing Schema Integrity: Verifying absence of simulated helper functions...');
  const simulatedHelpers = (await db.query(`
    select routine_name
    from information_schema.routines
    where routine_schema in ('public', 'private')
      and routine_name in ('simulate_auth_context', 'set_mock_user', 'mock_jwt_claims');
  `)).rows;
  assert.equal(simulatedHelpers.length, 0, 'No simulated helper functions may exist in isolated fixture schema');
  console.log('✔ No simulated helper functions found in schema.');

  console.log('\n================================================================');
  console.log('*** ISOLATED_FIXTURE_REHEARSAL_PASS ***');
  console.log('Hand-built fixture only; does not verify the 60-migration Production baseline.');
  console.log('SQL fixture regressions only; PostgreSQL 17 Production schema rehearsal remains a separate release gate.');
  console.log('================================================================\n');
  await db.close();
}

runIsolatedFixtureRehearsal().catch(err => {
  console.error('Rehearsal failed:', err);
  process.exit(1);
});
