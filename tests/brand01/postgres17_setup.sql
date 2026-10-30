create role anon nologin;
create role authenticated nologin;
create schema supabase_migrations;

create table supabase_migrations.schema_migrations(version text primary key);
create table public.business_users(
  id text primary key, full_name text not null, system_permission text not null,
  status text not null, account_status text not null, archived_at timestamptz, deleted_at timestamptz
);
insert into public.business_users values
  ('admin-a','Admin Author','admin','active','active',null,null),
  ('admin-b','Admin Reviewer','admin','active','active',null,null),
  ('leader-a','Scoped Leader','leader','active','active',null,null),
  ('member-a','Scoped Member','member','active','active',null,null),
  ('member-b','Unscoped Member','member','active','active',null,null);
create table public.brands(
  id text primary key, name text not null, status text not null default 'active',
  archived_at timestamptz, deleted_at timestamptz, description text
);
insert into public.brands(id,name) values ('brand-a','Brand A'),('brand-b','Brand B');
create table public.platforms(
  id text primary key, name text not null, status text not null default 'active',
  archived_at timestamptz, deleted_at timestamptz
);
insert into public.platforms(id,name) values ('platform-a','Platform A');
create table public.campaigns(
  id text primary key, name text not null, brand_id text not null references public.brands(id),
  start_date date not null, end_date date not null, status text not null default 'draft',
  platform_ids text[] not null default '{}', notes text, archived_at timestamptz, deleted_at timestamptz
);
insert into public.campaigns(id,name,brand_id,start_date,end_date,status,platform_ids)
values ('campaign-a','Campaign A','brand-a','2026-10-01','2026-10-31','active',array['platform-a']),
       ('campaign-b','Campaign B','brand-b','2026-10-01','2026-10-31','active',array['platform-a']);
create table public.shifts(id text primary key);
create table public.operational_storage_routes(id text primary key, root_folder_id text not null);
insert into public.operational_storage_routes values ('approved-route','approved-root');
create function private.current_business_user_id() returns text language sql stable security definer set search_path='' as $$
  select nullif(current_setting('brand01.actor',true),'')
$$;
create function private.current_business_user_is_active() returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.business_users where id=private.current_business_user_id() and status='active' and account_status='active' and archived_at is null and deleted_at is null)
$$;
create function private.current_system_permission() returns text language sql stable security definer set search_path='' as $$
  select system_permission from public.business_users where id=private.current_business_user_id() and status='active' and account_status='active' and archived_at is null and deleted_at is null
$$;
create function private.is_admin() returns boolean language sql stable security definer set search_path='' as $$
  select coalesce(private.current_system_permission()='admin',false)
$$;
grant usage on schema public,private to authenticated;
grant execute on function private.current_business_user_id(),private.current_business_user_is_active(),private.current_system_permission(),private.is_admin() to authenticated;
grant select on public.business_users,public.brands,public.platforms,public.campaigns to authenticated;
alter table public.business_users enable row level security;
alter table public.brands enable row level security;
alter table public.platforms enable row level security;
alter table public.campaigns enable row level security;
create policy fixture_business_read on public.business_users for select to authenticated using (private.current_business_user_is_active() and (private.is_admin() or id=private.current_business_user_id()));
create policy fixture_brand_read on public.brands for select to authenticated using (private.current_business_user_is_active() and archived_at is null and deleted_at is null);
create policy fixture_platform_read on public.platforms for select to authenticated using (private.current_business_user_is_active() and archived_at is null and deleted_at is null);
create policy fixture_campaign_read on public.campaigns for select to authenticated using (private.current_business_user_is_active() and archived_at is null and deleted_at is null);
