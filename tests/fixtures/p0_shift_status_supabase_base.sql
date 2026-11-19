-- Narrow disposable baseline for the real P0 migration.
-- Roles/auth/identity/shift-status/version/audit contracts are copied from
-- 20260811110239_p1b_master_data.sql, 20260814085659_p1c_shift_persistence.sql,
-- 20260829130000_core_v1_data_integrity_p1b.sql, and
-- 20260913120000_shift_status_mode_and_auto_completion.sql.
-- This is not a full Supabase database; it includes only direct dependencies
-- required to execute and verify 20261021034515 against real PostgreSQL.

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;

create schema if not exists auth;
create or replace function auth.uid()
returns uuid language sql stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub'
  )::uuid;
$$;

create table public.business_users (
  id text primary key,
  auth_user_id uuid not null unique,
  system_permission text not null,
  status text not null default 'active',
  account_status text not null default 'active',
  archived_at timestamptz,
  deleted_at timestamptz
);

create schema if not exists private;
create or replace function private.current_business_user_id()
returns text language sql stable security definer set search_path = ''
as $$
  select business_user.id from public.business_users as business_user
  where business_user.auth_user_id = (select auth.uid())
    and business_user.status = 'active' and business_user.account_status = 'active'
    and business_user.archived_at is null and business_user.deleted_at is null
  limit 1;
$$;
create or replace function private.current_system_permission()
returns text language sql stable security definer set search_path = ''
as $$
  select business_user.system_permission from public.business_users as business_user
  where business_user.auth_user_id = (select auth.uid())
    and business_user.status = 'active' and business_user.account_status = 'active'
    and business_user.archived_at is null and business_user.deleted_at is null
  limit 1;
$$;
create or replace function private.is_leader_or_admin()
returns boolean language sql stable security definer set search_path = ''
as $$ select coalesce((select private.current_system_permission()) in ('leader', 'admin'), false); $$;
create or replace function private.require_shift_actor(p_leader_required boolean)
returns text language plpgsql stable security definer set search_path = ''
as $$
declare actor_id text;
begin
  actor_id := private.current_business_user_id();
  if actor_id is null then raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED'; end if;
  if p_leader_required and not private.is_leader_or_admin() then
    raise exception using errcode = '42501', message = 'OPERATION_NOT_ALLOWED';
  end if;
  return actor_id;
end;
$$;
revoke all on function private.current_business_user_id() from public, anon, authenticated;
revoke all on function private.current_system_permission() from public, anon, authenticated;
revoke all on function private.is_leader_or_admin() from public, anon, authenticated;
revoke all on function private.require_shift_actor(boolean) from public, anon, authenticated;
grant execute on function private.current_business_user_id() to authenticated;
grant execute on function private.current_system_permission() to authenticated;
grant execute on function private.is_leader_or_admin() to authenticated;
grant execute on function private.require_shift_actor(boolean) to authenticated;

create table public.shifts (
  id text primary key,
  date date not null,
  start_time time not null,
  end_time time not null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  end_date date not null,
  crosses_midnight boolean not null,
  duration_minutes smallint not null,
  registration_cutoff_at timestamptz not null,
  status text not null check (status in ('scheduled','preparing','live','paused','completed','cancelled')),
  status_mode text not null check (status_mode in ('auto','manual')),
  version integer not null default 1,
  deleted_at timestamptz,
  archived_at timestamptz,
  check (end_at > start_at),
  check (crosses_midnight = (end_date > date)),
  check (duration_minutes between 1 and 1439)
);
create table public.p0_shift_audit (
  id bigint generated always as identity primary key,
  shift_id text not null,
  old_status text,
  new_status text,
  source text not null
);

create or replace function private.set_shift_status_mode()
returns trigger language plpgsql security definer set search_path = ''
as $$
declare override_mode text; source_mode text;
begin
  override_mode := current_setting('app.shift_status_mode_override', true);
  source_mode := current_setting('app.audit_source', true);
  if override_mode in ('auto','manual') then new.status_mode := override_mode;
  elsif new.status is distinct from old.status and coalesce(source_mode,'manual') <> 'system' then
    new.status_mode := 'manual';
  end if;
  return new;
end;
$$;
create trigger set_shift_status_mode_before_update before update of status on public.shifts
for each row execute function private.set_shift_status_mode();

create or replace function private.bump_concurrency_version()
returns trigger language plpgsql security definer set search_path = ''
as $$ begin new.version := old.version + 1; return new; end; $$;
create trigger shifts_bump_concurrency_version before update on public.shifts
for each row execute function private.bump_concurrency_version();

create or replace function private.capture_p0_shift_audit()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    insert into public.p0_shift_audit(shift_id,old_status,new_status,source)
    values(new.id,old.status,new.status,coalesce(nullif(current_setting('app.audit_source',true),''),'manual'));
  end if;
  return new;
end;
$$;
create trigger shifts_capture_p0_audit after update of status on public.shifts
for each row execute function private.capture_p0_shift_audit();

insert into public.business_users(id,auth_user_id,system_permission) values
  ('test-member','00000000-0000-0000-0000-000000000001','member'),
  ('test-leader','00000000-0000-0000-0000-000000000002','leader'),
  ('test-admin','00000000-0000-0000-0000-000000000003','admin');
