-- REG-02 isolated PostgreSQL 17 fixture. Test-only schema; never run on Production.
create role authenticated nologin;
create role anon nologin;
create schema auth;
create schema private;
create or replace function auth.uid() returns uuid language sql stable set search_path=''
as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create table public.business_users (
  id text primary key,
  auth_user_id uuid unique not null,
  system_permission text not null,
  operational_roles text[] not null,
  status text not null default 'active',
  account_status text not null default 'active',
  archived_at timestamptz,
  deleted_at timestamptz
);
create table public.system_settings (
  id text primary key,
  require_registration_approval boolean not null default false,
  auto_lock_filled_shifts boolean not null default false,
  allow_multi_role_per_shift boolean not null default false
);
insert into public.system_settings(id,require_registration_approval,auto_lock_filled_shifts,allow_multi_role_per_shift)
values('singleton',false,false,false);
create table public.shifts (
  id text primary key,
  status text not null default 'scheduled',
  start_at timestamptz not null,
  end_at timestamptz not null,
  registration_cutoff_at timestamptz not null,
  required_host_count smallint not null default 1,
  required_support_count smallint not null default 1,
  required_technical_count smallint not null default 1,
  allow_multi_role boolean not null default false,
  registration_locked boolean not null default false,
  deleted_at timestamptz,
  archived_at timestamptz,
  version integer not null default 1
);
create table public.shift_registrations (
  id text primary key default pg_catalog.gen_random_uuid()::text,
  shift_id text not null references public.shifts(id),
  user_id text not null references public.business_users(id),
  operational_role text not null check (operational_role in('host','support','technical')),
  status text not null check (status in('pending','approved','rejected','cancelled','manually_assigned','removed')),
  source text not null,
  requested_at timestamptz not null default statement_timestamp(),
  reviewed_by text,
  reviewed_at timestamptz,
  review_notes text,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  version integer not null default 1
);
create unique index shift_registrations_active_role_uidx
  on public.shift_registrations(shift_id,user_id,operational_role)
  where status in('pending','approved','manually_assigned');
create or replace function private.bump_registration_version()
returns trigger language plpgsql set search_path=''
as $$ begin new.version := old.version + 1; return new; end $$;
create trigger reg02_bump_version before update on public.shift_registrations
  for each row execute function private.bump_registration_version();
create or replace function private.current_business_user_id()
returns text language sql stable security definer set search_path=''
as $$ select u.id from public.business_users u where u.auth_user_id=auth.uid()
 and u.status='active' and u.account_status='active'
 and u.archived_at is null and u.deleted_at is null limit 1 $$;
create or replace function private.require_shift_actor(p_leader_required boolean)
returns text language plpgsql stable security definer set search_path=''
as $$
declare actor_id text; v_role text;
begin
 actor_id := private.current_business_user_id();
 if actor_id is null then raise exception using errcode='42501',message='AUTHENTICATION_REQUIRED'; end if;
 select system_permission into v_role from public.business_users where id=actor_id;
 if p_leader_required and v_role not in('leader','admin') then
 raise exception using errcode='42501',message='OPERATION_NOT_ALLOWED'; end if;
 return actor_id;
end $$;
create or replace function private.assert_expected_version(p_entity text,p_expected_version integer,p_actual_version integer)
returns void language plpgsql security definer set search_path=''
as $$
begin
 if p_expected_version is null or p_expected_version<1
 then raise exception using errcode='P0001',message='EXPECTED_VERSION_REQUIRED'; end if;
 if p_expected_version<>p_actual_version
 then raise exception using errcode='P0001',message='STALE_WRITE'; end if;
end $$;
alter table public.shift_registrations enable row level security;
create policy shift_registrations_scoped_select on public.shift_registrations
for select to authenticated using (
 private.current_business_user_id() is not null
 and ((select system_permission from public.business_users where id=private.current_business_user_id()) in ('leader','admin')
      or user_id=private.current_business_user_id())
);
grant usage on schema private to authenticated;
grant select on public.business_users, public.shifts, public.shift_registrations to authenticated;
revoke all on function private.require_shift_actor(boolean) from public,anon,authenticated;
revoke all on function private.assert_expected_version(text,integer,integer) from public,anon,authenticated;
insert into public.business_users(id,auth_user_id,system_permission,operational_roles) values
('member1','00000000-0000-4000-8000-000000000001','member',array['host','support','technical']),
('member2','00000000-0000-4000-8000-000000000002','member',array['host','support','technical']),
('member3','00000000-0000-4000-8000-000000000003','member',array['host','support','technical']),
('member4','00000000-0000-4000-8000-000000000004','member',array['host','support','technical']),
('unqualified','00000000-0000-4000-8000-000000000005','member',array['support']),
('leader','00000000-0000-4000-8000-000000000006','leader',array['host','support','technical']),
('admin','00000000-0000-4000-8000-000000000007','admin',array['host','support','technical']);
insert into public.shifts(id,start_at,end_at,registration_cutoff_at,required_host_count,required_support_count,required_technical_count)
values
('one','2031-01-02T03:00:00Z','2031-01-02T05:00:00Z','2031-01-02T02:00:00Z',1,1,1),
('two','2031-01-03T03:00:00Z','2031-01-03T05:00:00Z','2031-01-03T02:00:00Z',2,1,1),
('manual','2031-01-04T03:00:00Z','2031-01-04T05:00:00Z','2031-01-04T02:00:00Z',1,1,1),
('night','2031-01-05T16:00:00Z','2031-01-05T18:00:00Z','2031-01-05T15:00:00Z',1,1,1),
('overlap','2031-01-05T17:30:00Z','2031-01-05T20:00:00Z','2031-01-05T17:00:00Z',1,1,1),
('concurrent','2031-01-07T03:00:00Z','2031-01-07T05:00:00Z','2031-01-07T02:00:00Z',1,1,1),
('zero','2031-01-08T03:00:00Z','2031-01-08T05:00:00Z','2031-01-08T02:00:00Z',0,1,1);
