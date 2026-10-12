create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create table public.business_users (id text primary key, system_permission text not null default 'admin', status text not null default 'active', account_status text not null default 'active', deleted_at timestamptz);
create table public.shifts (id text primary key, date date not null, status text not null default 'completed', deleted_at timestamptz);
insert into public.business_users(id) values ('staff-1'),('admin-1'),('finance-1');
insert into public.shifts(id,date) values ('shift-1','2026-09-30');

grant select on public.business_users, public.shifts to service_role;
