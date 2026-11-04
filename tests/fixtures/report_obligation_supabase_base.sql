-- Minimal disposable Auth/RLS fixture for the report-obligation RPC contract.
create schema auth;
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

create table public.business_users (
  id text primary key, auth_user_id uuid not null unique, system_permission text not null,
  status text not null default 'active', account_status text not null default 'active',
  archived_at timestamptz, deleted_at timestamptz
);
create schema private;
create function private.current_business_user_id() returns text language sql stable security definer set search_path = '' as $$
  select u.id from public.business_users u where u.auth_user_id = (select auth.uid())
    and u.status = 'active' and u.account_status = 'active' and u.archived_at is null and u.deleted_at is null limit 1;
$$;
create function private.current_system_permission() returns text language sql stable security definer set search_path = '' as $$
  select u.system_permission from public.business_users u where u.auth_user_id = (select auth.uid())
    and u.status = 'active' and u.account_status = 'active' and u.archived_at is null and u.deleted_at is null limit 1;
$$;
revoke all on function private.current_business_user_id() from public, anon, authenticated, service_role;
revoke all on function private.current_system_permission() from public, anon, authenticated, service_role;
grant execute on function private.current_business_user_id() to authenticated;
grant execute on function private.current_system_permission() to authenticated;
grant usage on schema private to authenticated;

create table public.brands (id text primary key, name text not null);
create table public.platforms (id text primary key, name text not null);
create table public.campaigns (id text primary key, name text not null);
create table public.shifts (
  id text primary key, date date not null, start_time time not null, end_time time not null,
  start_at timestamptz, end_at timestamptz, status text not null, registration_locked boolean not null default false,
  brand_id text, platform_id text, campaign_id text,
  title text, host_id text, support_id text, technical_id text,
  deleted_at timestamptz, archived_at timestamptz
);
create table public.shift_registrations (
  shift_id text not null, user_id text not null, operational_role text not null,
  status text not null check (status in ('pending','approved','manually_assigned','rejected','cancelled'))
);
create table public.reports (
  id text primary key, shift_id text not null unique, status text not null default 'draft',
  metrics_confirmed boolean not null default false, submitted_by text,
  deleted_at timestamptz, archived_at timestamptz,
  created_at timestamptz not null default statement_timestamp(), updated_at timestamptz not null default statement_timestamp()
);

create function private.can_read_shift(p_shift_id text) returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((select case
    when private.current_system_permission() in ('admin','leader') then true
    when s.deleted_at is not null or s.archived_at is not null then false
    when s.status = 'scheduled' and s.registration_locked = false and s.end_at > statement_timestamp() then true
    else private.current_business_user_id() in (s.host_id,s.support_id,s.technical_id)
      or exists(select 1 from public.shift_registrations r where r.shift_id=s.id and r.user_id=private.current_business_user_id() and r.status in ('pending','approved','manually_assigned'))
  end from public.shifts s where s.id=p_shift_id and private.current_business_user_id() is not null), false);
$$;
revoke all on function private.can_read_shift(text) from public, anon, authenticated, service_role;
grant execute on function private.can_read_shift(text) to authenticated;
alter table public.shifts enable row level security;
alter table public.shift_registrations enable row level security;
alter table public.reports enable row level security;
create policy shifts_read on public.shifts for select to authenticated using ((select private.can_read_shift(id)));
create policy registrations_read on public.shift_registrations for select to authenticated using ((select private.can_read_shift(shift_id)));
create policy reports_read on public.reports for select to authenticated using (deleted_at is null and archived_at is null);
grant select on public.shifts, public.shift_registrations, public.reports, public.brands, public.platforms, public.campaigns to authenticated;

insert into public.business_users(id,auth_user_id,system_permission) values
  ('member','00000000-0000-0000-0000-000000000001','member'),
  ('leader','00000000-0000-0000-0000-000000000002','leader'),
  ('admin','00000000-0000-0000-0000-000000000003','admin'),
  ('inactive','00000000-0000-0000-0000-000000000004','member') ;
update public.business_users set status='inactive' where id='inactive';
insert into public.brands values ('page-brand','Page Brand'),('other-brand','Other Brand');
insert into public.platforms values ('platform','Platform');
insert into public.campaigns values ('campaign','Campaign');
