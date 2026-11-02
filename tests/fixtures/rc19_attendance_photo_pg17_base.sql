do $$ begin
  create role anon nologin;
exception when duplicate_object then null;
end $$;
do $$ begin
  create role authenticated nologin;
exception when duplicate_object then null;
end $$;
do $$ begin
  create role service_role nologin bypassrls;
exception when duplicate_object then null;
end $$;

create schema if not exists private;
create table public.business_users (
  id text primary key,
  full_name text not null
);
create table public.brands (
  id text primary key,
  name text not null
);
create table public.platforms (
  id text primary key,
  name text not null
);
create table public.shifts (
  id text primary key,
  date date not null,
  start_time time not null,
  end_time time not null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  status text not null,
  deleted_at timestamptz,
  archived_at timestamptz,
  brand_id text references public.brands(id),
  platform_id text references public.platforms(id),
  studio text,
  title text,
  host_id text references public.business_users(id),
  support_id text references public.business_users(id),
  technical_id text references public.business_users(id)
);
create table public.shift_registrations (
  shift_id text not null references public.shifts(id),
  user_id text not null references public.business_users(id),
  operational_role text not null,
  status text not null,
  primary key (shift_id,user_id,operational_role)
);
create table public.swap_requests (
  id uuid primary key default gen_random_uuid(),
  status text not null,
  deleted_at timestamptz,
  mode text not null,
  source_shift_id text,
  shift_id text,
  requester_id text,
  operational_role text,
  target_shift_id text,
  counterpart_id text,
  replacement_staff_id text
);

create or replace function private.require_shift_actor(boolean)
returns text language plpgsql stable security definer set search_path = '' as $$
declare v_actor text := nullif(current_setting('app.test_actor', true), '');
begin
  if v_actor is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED';
  end if;
  return v_actor;
end;
$$;
