
    do $$ begin
      if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
      if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
      if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
    end $$;

    create schema if not exists auth;
    create schema if not exists private;

    -- auth.users table
    create table if not exists auth.users (
      id uuid primary key,
      email text unique,
      created_at timestamptz default now()
    );

    -- Standard Supabase auth helper functions
    create or replace function auth.uid() returns uuid language sql stable as $$
      select coalesce(
        nullif(current_setting('request.jwt.claim.sub', true), ''),
        nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'sub'
      )::uuid;
    $$;

    create or replace function auth.role() returns text language sql stable as $$
      select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'authenticated')::text;
    $$;

    -- Reference Tables
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
      system_permission text default 'member',
      status text default 'active',
      account_status text default 'active',
      operational_roles text[] default '{}',
      archived_at timestamptz,
      deleted_at timestamptz
    );

    create table if not exists public.system_settings (
      id text primary key,
      default_host_count smallint default 1,
      default_support_count smallint default 1,
      default_technical_count smallint default 1,
      allow_multi_role_per_shift boolean default false
    );

    -- Base Shifts Table
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
      host_names text[],
      assistant_names text[],
      technical_names text[],
      required_host_count smallint default 1,
      required_support_count smallint default 1,
      required_technical_count smallint default 1,
      registration_locked boolean default false,
      registration_cutoff_at timestamptz,
      allow_multi_role boolean default false,
      import_batch_id text,
      status text default 'scheduled',
      live_link text,
      product_notes text,
      updated_by text,
      execution_source text,
      status_mode text default 'auto',
      version integer default 1,
      deleted_at timestamptz,
      archived_at timestamptz,
      deletion_reason text,
      created_at timestamptz default now(),
      updated_at timestamptz default now()
    );

    -- Related tables for referential integrity testing
    create table if not exists public.shift_registrations (
      id text primary key default gen_random_uuid()::text,
      shift_id text not null references public.shifts(id) on delete restrict,
      user_id text not null references public.business_users(id),
      operational_role text not null,
      status text default 'approved',
      created_at timestamptz default now()
    );

    create table if not exists public.reports (
      id text primary key default gen_random_uuid()::text,
      shift_id text references public.shifts(id) on delete restrict,
      brand_id text references public.brands(id),
      submitted_by text references public.business_users(id),
      status text default 'draft',
      created_at timestamptz default now()
    );

    -- Initial legacy unique index (BEFORE migration)
    create unique index if not exists shifts_active_slot_uidx
      on public.shifts (brand_id, platform_id, date, start_time, end_time)
      where deleted_at is null and archived_at is null;

    -- Auth & RPC permission functions
    create or replace function private.current_business_user_id()
    returns text language sql stable security definer as $$
      select bu.id
      from public.business_users bu
      where bu.auth_user_id = auth.uid()
        and bu.status = 'active'
        and bu.account_status = 'active'
        and bu.archived_at is null
        and bu.deleted_at is null
      limit 1;
    $$;

    create or replace function private.current_system_permission()
    returns text language sql stable security definer as $$
      select bu.system_permission
      from public.business_users bu
      where bu.auth_user_id = auth.uid()
        and bu.status = 'active'
        and bu.account_status = 'active'
        and bu.archived_at is null
        and bu.deleted_at is null
      limit 1;
    $$;

    create or replace function private.is_leader_or_admin()
    returns boolean language sql stable security definer as $$
      select coalesce(private.current_system_permission() in ('leader', 'admin'), false);
    $$;

    create or replace function private.require_shift_actor(p_leader_required boolean)
    returns text language plpgsql stable security definer as $$
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

    create or replace function private.normalize_shift_capacity(val text, def smallint)
    returns smallint language sql immutable as $$
      select coalesce(val::smallint, def);
    $$;
    create or replace function private.apply_legacy_single_staffing_assignment(s text, r text, u text, a text)
    returns void language sql as $$ select null; $$;
    create or replace function private.insert_manual_shift_assignment(s text, u text, r text, a text, n text, l boolean)
    returns void language sql as $$ select null; $$;
    create or replace function private.assert_shift_staffing_consistent(s public.shifts)
    returns void language sql as $$ select null; $$;
    create or replace function private.assert_expected_version(e text, exp integer, act integer)
    returns void language sql as $$ select null; $$;
