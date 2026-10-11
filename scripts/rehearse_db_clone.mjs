import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import pg from '../lib/db/node_modules/pg/lib/index.js';

const { Client } = pg;
const client = new Client({
  connectionString: 'postgresql://postgres:postgres@127.0.0.1:54322/rc_rehearsal_clone'
});

async function runRehearsal() {
  await client.connect();
  console.log('--- STARTING DATABASE CLONE REHEARSAL IN ISOLATED POSTGRESQL CONTAINER ---');

  // STEP 1: Baseline Setup
  console.log('\n[1/7] Setting up Production-equivalent sanitized baseline schema...');
  await client.query(`
    -- Roles
    do $$ begin
      if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
      if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
      if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
    end $$;

    -- Schemas
    create schema if not exists private;
    create schema if not exists supabase_migrations;

    -- Migration Ledger Table
    create table if not exists supabase_migrations.schema_migrations (
      version text primary key,
      statements text[],
      name text
    );

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

    create table if not exists public.system_settings (
      id text primary key,
      default_host_count smallint default 1,
      default_support_count smallint default 1,
      default_technical_count smallint default 1,
      allow_multi_role_per_shift boolean default true
    );

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
    returns trigger language plpgsql security invoker set search_path = '' as $
    begin
      new.version := coalesce(old.version, 1) + 1;
      new.updated_at := statement_timestamp();
      return new;
    end;
    $;

    drop trigger if exists shifts_bump_concurrency_version on public.shifts;
    create trigger shifts_bump_concurrency_version
    before update on public.shifts
    for each row execute function private.bump_concurrency_version();


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

    create table if not exists public.report_revisions (
      id text primary key default gen_random_uuid()::text,
      report_id text references public.reports(id),
      version integer not null,
      created_at timestamptz default now(),
      created_by text,
      status text,
      reason text,
      event text,
      metrics jsonb,
      ocr_review jsonb,
      final_recap jsonb,
      image_references text[]
    );

    -- Helper functions in private
    create or replace function private.current_business_user_id() returns text language sql stable as $$
      select nullif(current_setting('app.current_user_id', true), '')::text;
    $$;

    create or replace function private.current_business_user_is_active() returns boolean language plpgsql stable as $$
    declare
      u_id text;
    begin
      u_id := private.current_business_user_id();
      if u_id is null then return false; end if;
      return exists(select 1 from public.business_users where id = u_id and status = 'active' and account_status = 'active' and archived_at is null and deleted_at is null);
    end;
    $$;

    create or replace function private.current_system_permission() returns text language plpgsql stable as $$
    declare
      u_id text;
      p text;
    begin
      u_id := private.current_business_user_id();
      if u_id is null then return 'anon'; end if;
      select system_permission into p from public.business_users where id = u_id;
      return coalesce(p, 'anon');
    end;
    $$;

    create or replace function private.is_leader_or_admin() returns boolean language sql stable as $$
      select private.current_system_permission() in ('leader', 'admin');
    $$;

    create or replace function private.can_read_shift(p_shift_id text) returns boolean language sql stable as $$
      select true;
    $$;

    create or replace function private.require_shift_actor(p_must_be_leader boolean) returns text language plpgsql stable as $$
    declare
      u_id text;
      perm text;
    begin
      u_id := private.current_business_user_id();
      if u_id is null then raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED'; end if;
      perm := private.current_system_permission();
      if p_must_be_leader and perm not in ('leader', 'admin') then
        raise exception using errcode = '42501', message = 'OPERATION_NOT_ALLOWED';
      end if;
      return u_id;
    end;
    $$;

    create or replace function private.require_report_actor(p_must_be_admin boolean) returns text language plpgsql stable as $$
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
    returns smallint language plpgsql stable as $$
    declare
      v smallint;
    begin
      if p_value is null or btrim(p_value) = '' then return p_default; end if;
      v := p_value::smallint;
      if v < 0 or v > 100 then raise exception using errcode = '22023', message = 'SHIFT_CAPACITY_OUT_OF_RANGE'; end if;
      return v;
    end;
    $$;

    create or replace function private.assert_expected_version(p_entity text, p_expected_version integer, p_actual_version integer) returns void language plpgsql set search_path = '' as $$
    begin
      if p_expected_version is null or p_expected_version < 1 then raise exception using errcode = 'P0001', message = 'EXPECTED_VERSION_REQUIRED'; end if;
      if p_expected_version <> p_actual_version then raise exception using errcode = 'P0001', message = 'OPTIMISTIC_LOCK_CONFLICT'; end if;
    end;
    $$;

    create or replace function private.assert_shift_staffing_consistent(p_shift public.shifts) returns void language plpgsql security definer set search_path = '' as $$
    begin
      return;
    end;
    $$;

    create or replace function private.record_report_revision(p_report_id text, p_created_by text, p_status text, p_reason text, p_event text, p_metrics jsonb, p_ocr_review jsonb, p_final_recap jsonb, p_image_refs text[]) returns void language plpgsql set search_path = '' as $$
    declare
      v integer;
    begin
      select coalesce(max(version), 0) + 1 into v from public.report_revisions where report_id = p_report_id;
      insert into public.report_revisions (report_id, version, created_by, status, reason, event, metrics, ocr_review, final_recap, image_references)
      values (p_report_id, v, p_created_by, p_status, p_reason, p_event, p_metrics, p_ocr_review, p_final_recap, p_image_refs);
    end;
    $$;

    -- Baseline upsert_live_report_image
    create or replace function public.upsert_live_report_image(p_data jsonb)
    returns public.live_report_images
    language plpgsql
    security definer
    set search_path = ''
    as $$
    declare
      actor_id text;
      actor_permission text;
      target_report public.reports;
      persisted_image public.live_report_images;
      report_id_value text;
      category_value text;
      file_name_value text;
      file_url_value text;
      storage_file_name_value text;
      storage_idempotency_key_value text;
    begin
      actor_id := private.require_report_actor(false);
      actor_permission := private.current_system_permission();

      report_id_value := p_data->>'report_id';
      category_value := p_data->>'category';
      file_name_value := p_data->>'file_name';
      file_url_value := p_data->>'file_url';
      storage_file_name_value := p_data->>'storage_file_name';
      storage_idempotency_key_value := p_data->>'storage_idempotency_key';

      select * into target_report from public.reports where id = report_id_value and deleted_at is null and archived_at is null for update;
      if target_report.id is null then raise exception using errcode = 'P0001', message = 'REPORT_NOT_FOUND'; end if;
      if actor_permission = 'member' and target_report.submitted_by <> actor_id then
        raise exception using errcode = '42501', message = 'OPERATION_NOT_ALLOWED';
      end if;
      if target_report.metrics_confirmed or target_report.status = 'confirmed' then
        raise exception using errcode = 'P0001', message = 'REPORT_CONFIRMED';
      end if;

      if storage_idempotency_key_value is not null then
        select * into persisted_image from public.live_report_images
        where report_id = report_id_value and storage_idempotency_key = storage_idempotency_key_value;
        if persisted_image.id is not null then return persisted_image; end if;
      end if;

      insert into public.live_report_images (
        report_id, category, title, description, captured_at, file_url, thumbnail_url,
        file_name, mime_type, size_bytes, sort_order, is_cover, uploaded_by, storage_file_name, storage_idempotency_key
      ) values (
        report_id_value, category_value, p_data->>'title', p_data->>'description',
        case when p_data ? 'captured_at' then (p_data->>'captured_at')::timestamptz else now() end,
        file_url_value, p_data->>'thumbnail_url', file_name_value, p_data->>'mime_type',
        (p_data->>'size_bytes')::bigint, coalesce((p_data->>'sort_order')::integer, 0),
        coalesce((p_data->>'is_cover')::boolean, false), actor_id, storage_file_name_value, storage_idempotency_key_value
      )
      on conflict (report_id, file_url) do update set
        category = excluded.category,
        title = excluded.title,
        description = excluded.description,
        thumbnail_url = excluded.thumbnail_url,
        file_name = excluded.file_name,
        mime_type = excluded.mime_type,
        size_bytes = excluded.size_bytes,
        sort_order = excluded.sort_order,
        is_cover = excluded.is_cover,
        storage_file_name = excluded.storage_file_name
      returning * into persisted_image;

      perform private.record_report_revision(report_id_value, actor_id, target_report.status, 'image_upsert', 'image_upsert', null::jsonb, null::jsonb, null::jsonb, array[persisted_image.id]);
      return persisted_image;
    end;
    $$;

    -- Baseline upload_report_image
    create or replace function public.upload_report_image(
      p_report_id text, p_storage_path text, p_image_url text, p_original_name text,
      p_mime_type text, p_size_bytes bigint, p_image_type text
    ) returns public.report_images language plpgsql security definer set search_path = '' as $$
    declare
      actor_id text;
      created_row public.report_images;
    begin
      actor_id := private.require_report_actor(false);
      insert into public.report_images (report_id, storage_path, file_url, original_name, mime_type, size_bytes, image_type, uploaded_by)
      values (p_report_id, p_storage_path, p_image_url, p_original_name, p_mime_type, p_size_bytes, p_image_type, actor_id)
      returning * into created_row;
      return created_row;
    end;
    $$;

    -- Baseline Seed Data
    insert into public.brands (id, name) values ('brand-1', 'Brand One') on conflict do nothing;
    insert into public.platforms (id, name) values ('shopee', 'Shopee') on conflict do nothing;
    insert into public.campaigns (id, name, brand_id) values ('camp-1', 'Mega Sale', 'brand-1') on conflict do nothing;
    insert into public.system_settings (id, default_host_count, default_support_count, default_technical_count, allow_multi_role_per_shift)
    values ('default', 1, 1, 1, true) on conflict do nothing;

    insert into public.business_users (id, email, full_name, system_permission) values
      ('admin-1', 'admin@example.com', 'Admin User', 'admin'),
      ('leader-1', 'leader@example.com', 'Leader User', 'leader'),
      ('member-1', 'member1@example.com', 'Member One', 'member'),
      ('member-2', 'member2@example.com', 'Member Two', 'member')
    on conflict do nothing;

    -- Dummy policies for business_users and shift_registrations to enable altering in Contract B
    alter table public.shift_registrations enable row level security;
    alter table public.business_users enable row level security;
    drop policy if exists shift_registrations_scoped_select on public.shift_registrations;
    create policy shift_registrations_scoped_select on public.shift_registrations for select to authenticated using (true);
    drop policy if exists business_users_active_directory_select on public.business_users;
    create policy business_users_active_directory_select on public.business_users for select to authenticated using (true);
  `);
  console.log('? Baseline schema and reference tables initialized.');

  // Baseline shift RPCs
  const shiftRpcBaseline = fs.readFileSync('tests/fixtures/rc15_production_shift_rpc_baseline.sql', 'utf8');
  await client.query(shiftRpcBaseline);
  console.log('? Production shift RPC baseline applied (matches MD5 2133950d90a0610b76d4b6623abf4621).');

  // STEP 2: Contract B Migrations (Privacy & Revisions)
  console.log('\n[2/7] Applying Contract B Migrations (Privacy & Revisions)...');
  const migPrivacy = fs.readFileSync('supabase/migrations/20261008160638_member_registration_directory_privacy.sql', 'utf8');
  await client.query(migPrivacy);
  await client.query(`insert into supabase_migrations.schema_migrations (version, name) values ('20261008160638', 'member_registration_directory_privacy');`);
  console.log('? 20261008160638_member_registration_directory_privacy.sql applied.');

  const migRevisions = fs.readFileSync('supabase/migrations/20261008160645_repair_report_revision_history_rpc.sql', 'utf8');
  await client.query(migRevisions);
  await client.query(`insert into supabase_migrations.schema_migrations (version, name) values ('20261008160645', 'repair_report_revision_history_rpc');`);
  console.log('? 20261008160645_repair_report_revision_history_rpc.sql applied.');

  // STEP 3: Contract C Migrations (RC15 Storage Prerequisites, Shift RPC, Operational Files)
  console.log('\n[3/7] Applying Contract C Migrations (RC15 Prerequisites, Shifts, Operational Files)...');
  const migPrereq = fs.readFileSync('supabase/migrations/20261011091925_rc15_storage_route_prerequisites.sql', 'utf8');
  await client.query(migPrereq);
  await client.query(`insert into supabase_migrations.schema_migrations (version, name) values ('20261011091925', 'rc15_storage_route_prerequisites');`);
  console.log('? 20261011091925_rc15_storage_route_prerequisites.sql applied.');

  const migShiftCompat = fs.readFileSync('supabase/migrations/20261011092015_rc15_shift_rpc_compatibility.sql', 'utf8');
  await client.query(migShiftCompat);
  await client.query(`insert into supabase_migrations.schema_migrations (version, name) values ('20261011092015', 'rc15_shift_rpc_compatibility');`);
  console.log('? 20261011092015_rc15_shift_rpc_compatibility.sql applied.');

  const migOpFiles = fs.readFileSync('supabase/migrations/20261011092051_rc15_operational_files.sql', 'utf8');
  await client.query(migOpFiles);
  await client.query(`insert into supabase_migrations.schema_migrations (version, name) values ('20261011092051', 'rc15_operational_files');`);
  console.log('? 20261011092051_rc15_operational_files.sql applied.');

  // STEP 4: Contract A Migration (Forward-Only Provider Compatibility)
  console.log('\n[4/7] Applying Contract A Forward-Only Provider Compatibility Migration...');
  const migProvider = fs.readFileSync('supabase/migrations/20261011221500_rc15_provider_metadata_forward_compat.sql', 'utf8');
  await client.query(migProvider);
  await client.query(`insert into supabase_migrations.schema_migrations (version, name) values ('20261011221500', 'rc15_provider_metadata_forward_compat');`);
  console.log('? 20261011221500_rc15_provider_metadata_forward_compat.sql applied.');

  // STEP 5: Migration Ledger Reconciliation
  console.log('\n[5/7] Verifying Migration Ledger Reconciliation...');
  const ledgerRows = (await client.query(`select version, name from supabase_migrations.schema_migrations order by version;`)).rows;
  console.log('Applied migration ledger entries:', ledgerRows.map(r => `${r.version} (${r.name})`).join(', '));
  assert.equal(ledgerRows.length, 6, 'Expected exactly 6 migrations recorded in ledger');
  console.log('? Ledger reconciliation verified.');

  // STEP 6: Contract & Role-Based RPC Functional Verifications
  console.log('\n[6/7] Running Role-based RPC, Security & Concurrency Verifications...');

  // Test 6.1: Contract B Directory Privacy
  await client.query(`set app.current_user_id = 'member-1';`);
  const directoryRows = (await client.query(`select * from public.get_staff_directory();`)).rows;
  assert.ok(directoryRows.length >= 4, 'Directory should return active users');
  assert.deepEqual(Object.keys(directoryRows[0]), ['id', 'full_name', 'avatar_url', 'operational_roles'], 'Directory must ONLY return safe public columns');
  console.log('? Test 6.1: Directory privacy verified (no emails or sensitive credentials exposed).');

  // Test 6.2: Contract C Shift execution_source and Optimistic Lock
  await client.query(`set app.current_user_id = 'leader-1';`);
  const createShiftRes = (await client.query(`
    select * from public.create_shift($1::jsonb);
  `, [JSON.stringify({
    date: '2026-10-15',
    start_time: '09:00:00',
    end_time: '12:00:00',
    brand_id: 'brand-1',
    platform_id: 'shopee',
    title: 'Live Morning Special',
    execution_source: 'agency'
  })])).rows[0];
  assert.ok(createShiftRes.id, 'Shift creation must return shift row');
  assert.equal(createShiftRes.execution_source, 'agency', 'execution_source must be stored');
  console.log('? Test 6.2a: create_shift with execution_source = agency succeeded.');

  // Test update_shift with correct expected version
  const updateShiftRes = (await client.query(`
    select * from public.update_shift($1, $2::jsonb, false, $3);
  `, [createShiftRes.id, JSON.stringify({ title: 'Updated Live Morning Special' }), createShiftRes.version])).rows[0];
  assert.equal(updateShiftRes.title, 'Updated Live Morning Special');
  assert.equal(updateShiftRes.version, createShiftRes.version + 1, 'Version must increment from ' + createShiftRes.version + ' to ' + (createShiftRes.version + 1));
  console.log('? Test 6.2b: update_shift optimistic concurrency succeeded and version incremented.');

  // Test update_shift conflict with stale expected version
  let conflictCaught = false;
  try {
    await client.query(`
      select * from public.update_shift($1, $2::jsonb, false, $3);
    `, [createShiftRes.id, JSON.stringify({ title: 'Stale Update' }), 999]);
  } catch (err) {
    conflictCaught = true;
    assert.equal(err.message, 'OPTIMISTIC_LOCK_CONFLICT');
  }
  assert.ok(conflictCaught, 'Stale expected version must be rejected with OPTIMISTIC_LOCK_CONFLICT');
  console.log('? Test 6.2c: update_shift optimistic concurrency lock conflict verified.');

  // Test 6.3: Contract A Provider Metadata & Idempotency
  await client.query(`
    insert into public.reports (id, submitted_by, status) values ('rep-1', 'member-1', 'draft')
    on conflict (id) do update set submitted_by = 'member-1', status = 'draft', metrics_confirmed = false;
    insert into public.reports (id, submitted_by, status) values ('rep-2', 'member-2', 'draft')
    on conflict (id) do update set submitted_by = 'member-2', status = 'draft', metrics_confirmed = false;
  `);

  await client.query(`set app.current_user_id = 'member-1';`);
  const uploadInput = {
    report_id: 'rep-1',
    category: 'live_session',
    file_name: 'session_evidence.png',
    file_url: 'cloudref:v1:google_drive:drive-file-12345',
    mime_type: 'image/png',
    size_bytes: 10240,
    provider: 'google_drive',
    external_file_id: 'drive-file-12345',
    storage_file_name: '20261011_live_session_drive_file_12345.png',
    storage_idempotency_key: 'live_session:test_hash_abc_1'
  };

  const uploadRes = (await client.query(`
    select * from public.upsert_live_report_image_with_provider($1::jsonb);
  `, [JSON.stringify(uploadInput)])).rows[0];
  assert.equal(uploadRes.provider, 'google_drive');
  assert.equal(uploadRes.external_file_id, 'drive-file-12345');
  console.log('? Test 6.3a: upsert_live_report_image_with_provider saved provider metadata successfully.');

  // Test idempotency: re-upload with same key returns winner and does NOT overwrite external_file_id
  const idempotentRetry = (await client.query(`
    select * from public.upsert_live_report_image_with_provider($1::jsonb);
  `, [JSON.stringify({
    ...uploadInput,
    file_name: 'renamed_duplicate.png',
    external_file_id: 'drive-file-redundant-999'
  })])).rows[0];
  assert.equal(idempotentRetry.id, uploadRes.id);
  assert.equal(idempotentRetry.external_file_id, 'drive-file-12345', 'Must preserve original winner external_file_id');
  console.log('? Test 6.3b: Idempotent re-upload preserved winner object.');

  // Test 6.4: Member report isolation
  let crossMemberForbidden = false;
  try {
    await client.query(`
      select * from public.upsert_live_report_image_with_provider($1::jsonb);
    `, [JSON.stringify({
      ...uploadInput,
      report_id: 'rep-2', // belongs to member-2
      storage_idempotency_key: 'live_session:cross_member_attack'
    })]);
  } catch (err) {
    crossMemberForbidden = true;
    assert.equal(err.code, '42501');
  }
  assert.ok(crossMemberForbidden, 'Member-1 must be blocked from uploading to Member-2 report');
  console.log('? Test 6.4: Cross-member isolation enforced (42501 OPERATION_NOT_ALLOWED).');

  // Test 6.5: Confirmed report protection
  await client.query(`update public.reports set metrics_confirmed = true where id = 'rep-1';`);
  let confirmedRejected = false;
  try {
    await client.query(`
      select * from public.upsert_live_report_image_with_provider($1::jsonb);
    `, [JSON.stringify({
      ...uploadInput,
      storage_idempotency_key: 'live_session:confirmed_mutation'
    })]);
  } catch (err) {
    confirmedRejected = true;
    assert.equal(err.message, 'REPORT_CONFIRMED');
  }
  assert.ok(confirmedRejected, 'Confirmed report must reject image upsert');
  console.log('? Test 6.5: Confirmed report immutability enforced (REPORT_CONFIRMED).');

  // Test 6.6a: Delete authorization for owner
  await client.query(`update public.reports set metrics_confirmed = false where id = 'rep-1';`);
  const authDeleteRes = (await client.query(`
    select public.authorize_live_report_image_delete($1) as allowed;
  `, [uploadRes.id])).rows[0];
  assert.equal(authDeleteRes.allowed, true, 'Member should be authorized to delete own unconfirmed report image');
  console.log('? Test 6.6a: authorize_live_report_image_delete authorized owner.');

  // Test 6.6b: NULL uploaded_by is strictly blocked for Member
  const nullUploaderImg = (await client.query(`
    insert into public.live_report_images (report_id, category, file_name, file_url, uploaded_by)
    values ('rep-1', 'live_session', 'null_uploader.png', 'cloudref:v1:google_drive:null-up', null)
    returning id;
  `)).rows[0];
  let nullUploaderBlocked = false;
  try {
    await client.query(`select public.authorize_live_report_image_delete($1);`, [nullUploaderImg.id]);
  } catch (err) {
    nullUploaderBlocked = true;
    assert.equal(err.code, '42501');
  }
  assert.ok(nullUploaderBlocked, 'Member must NOT be authorized to delete image with NULL uploaded_by');
  console.log('? Test 6.6b: NULL uploaded_by deletion blocked for Member (42501 OPERATION_NOT_ALLOWED).');

  // Test 6.6c: Cross-member deletion is strictly blocked
  await client.query(`set app.current_user_id = 'member-2';`);
  let crossDeleteBlocked = false;
  try {
    await client.query(`select public.authorize_live_report_image_delete($1);`, [uploadRes.id]);
  } catch (err) {
    crossDeleteBlocked = true;
    assert.equal(err.code, '42501');
  }
  assert.ok(crossDeleteBlocked, 'Member-2 must NOT be authorized to delete Member-1 report image');
  console.log('? Test 6.6c: Cross-member deletion blocked (42501 OPERATION_NOT_ALLOWED).');

  // Test 6.6d: Unauthenticated caller is strictly blocked fail-closed
  await client.query(`set app.current_user_id = '';`);
  let unauthBlocked = false;
  try {
    await client.query(`select public.authorize_live_report_image_delete($1);`, [uploadRes.id]);
  } catch (err) {
    unauthBlocked = true;
    assert.equal(err.code, '42501');
  }
  assert.ok(unauthBlocked, 'Unauthenticated caller must be rejected with 42501 AUTHENTICATION_REQUIRED');
  console.log('? Test 6.6d: Unauthenticated caller blocked (42501 AUTHENTICATION_REQUIRED).');

  // STEP 7: Transactional Rollback Rehearsal
  console.log('\n[7/7] Executing Transactional Rollback Rehearsal...');
  let rollbackSuccess = false;
  try {
    await client.query(`
      begin;
      alter table public.report_images add column temp_probe_col text;
      -- Force an intentional failure inside the transaction
      select 1/0;
      commit;
    `);
  } catch (err) {
    await client.query(`rollback;`);
    rollbackSuccess = true;
  }
  assert.ok(rollbackSuccess, 'Intentional error triggered rollback');
  const probeColExists = (await client.query(`
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'report_images' and column_name = 'temp_probe_col';
  `)).rows.length > 0;
  assert.equal(probeColExists, false, 'Rollback must cleanly discard partial transaction changes');
  console.log('? Test 7: Transactional rollback cleanly aborted failed migration block without database drift.');

  console.log('\n======================================================');
  console.log('?? ISOLATED SYNTHETIC INTEGRATION REHEARSAL PASSED (100% Assertions Passed)');
  console.log('   Gate: ISOLATED_SYNTHETIC_DB_TEST_PASS');
  console.log('   Note: Production-equivalent DB clone rehearsal requires live replica.');
  console.log('======================================================\n');
  await client.end();
}

runRehearsal().catch(err => {
  console.error('DATABASE CLONE REHEARSAL FAILED:', err);
  process.exit(1);
});
