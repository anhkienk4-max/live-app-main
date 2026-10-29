create schema if not exists private;
do $$ begin
  create role authenticated nologin;
exception when duplicate_object then null; end $$;
do $$ begin
  create role anon nologin;
exception when duplicate_object then null; end $$;
do $$ begin
  create role service_role nologin bypassrls;
exception when duplicate_object then null; end $$;

create table public.business_users(id text primary key, system_permission text not null);
create table public.brands(id text primary key,name text not null);
create table public.platforms(id text primary key,name text not null);
create table public.shifts(
  id text primary key, owner_leader_id text not null, date date not null default '2026-10-29',
  start_time time not null default '09:00',end_time time not null default '13:00',
  start_at timestamptz not null default '2026-10-29T09:00:00+07:00',end_at timestamptz not null default '2026-10-29T13:00:00+07:00',
  brand_id text,platform_id text,studio text,title text
);
create table public.self_attendance_events(
  id uuid primary key, request_id uuid not null unique, shift_id text not null references shifts(id),
  staff_id text not null references business_users(id), operational_role text not null,
  event_kind text not null, recorded_at timestamptz not null default now(),
  verification_status text not null default 'pending_verification'
);
create table public.self_attendance_photo_evidence(
  id uuid primary key default gen_random_uuid(), request_id uuid not null unique,
  shift_id text not null references shifts(id), staff_id text not null references business_users(id),
  operational_role text not null, event_kind text not null,
  provider text not null default 'google_drive',external_file_id text not null unique,
  external_parent_id text not null,file_name text not null,mime_type text not null,
  size_bytes integer not null,checksum_sha256 text not null,shift_context jsonb not null,
  capture_source text not null,created_at timestamptz not null default statement_timestamp(),
  unique(shift_id,staff_id,operational_role,event_kind)
);
create table public.workforce_actual_segments(id text primary key, review_status text not null);
create table public.payroll_lines(id text primary key, amount integer not null);

create or replace function private.current_business_user_id() returns text language sql stable as $$
  select nullif(current_setting('rc19.test_actor',true),'')
$$;
create or replace function private.current_system_permission() returns text language sql stable as $$
  select system_permission from public.business_users where id=private.current_business_user_id()
$$;
create or replace function private.is_leader_or_admin() returns boolean language sql stable as $$
  select coalesce(private.current_system_permission() in ('leader','admin'),false)
$$;
create or replace function private.require_shift_actor(p_leader_required boolean) returns text
language plpgsql stable security definer set search_path = '' as $$
declare v_actor text := private.current_business_user_id(); begin
  if v_actor is null then raise exception using errcode='42501',message='AUTHENTICATION_REQUIRED'; end if;
  if p_leader_required and not private.is_leader_or_admin() then raise exception using errcode='42501',message='OPERATION_NOT_ALLOWED'; end if;
  return v_actor;
end $$;
create or replace function private.can_read_shift(p_shift_id text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((select case
    when private.current_system_permission()='admin' then true
    when private.current_system_permission()='leader' then s.owner_leader_id=private.current_business_user_id()
    when private.current_system_permission()='member' then exists(select 1 from public.self_attendance_events e
      where e.shift_id=s.id and e.staff_id=private.current_business_user_id())
    else false end from public.shifts s where s.id=p_shift_id),false)
$$;
create or replace function private.reject_self_attendance_mutation() returns trigger
language plpgsql set search_path = '' as $$ begin raise exception using errcode='42501',message='IMMUTABLE'; end $$;
create trigger self_attendance_immutable before update or delete on public.self_attendance_events
  for each row execute function private.reject_self_attendance_mutation();
create trigger self_attendance_photo_immutable before update or delete on public.self_attendance_photo_evidence
  for each row execute function private.reject_self_attendance_mutation();

insert into public.business_users values
  ('admin-1','admin'),('leader-1','leader'),('leader-2','leader'),('member-1','member');
insert into public.brands values('brand-1','Test Brand');
insert into public.platforms values('platform-1','Test Platform');
insert into public.shifts(id,owner_leader_id,brand_id,platform_id,title) values
  ('shift-1','leader-1','brand-1','platform-1','Synthetic review shift'),
  ('shift-2','leader-2','brand-1','platform-1','Synthetic out-of-scope shift');
insert into public.self_attendance_events(id,request_id,shift_id,staff_id,operational_role,event_kind) values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0001','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0001','shift-1','member-1','host','check_in'),
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0002','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0002','shift-1','leader-1','support','check_out'),
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0003','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0003','shift-1','member-1','technical','check_out'),
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0004','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0004','shift-2','member-1','host','check_in'),
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0005','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0005','shift-1','member-1','support','check_out'),
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0006','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0006','shift-1','member-1','host','check_out'),
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0007','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0007','shift-1','member-1','technical','check_in'),
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0008','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbb0008','shift-1','member-1','technical','check_out');
insert into public.self_attendance_photo_evidence(
  request_id,shift_id,staff_id,operational_role,event_kind,external_file_id,external_parent_id,
  file_name,mime_type,size_bytes,checksum_sha256,shift_context,capture_source
)
select request_id,shift_id,staff_id,operational_role,event_kind,
  'drive-file-'||right(request_id::text,12),'private-attendance-folder-1',
  'synthetic-attendance-evidence.jpg','image/jpeg',32000,repeat('a',64),'{"synthetic":true}'::jsonb,'file_picker'
from public.self_attendance_events;
