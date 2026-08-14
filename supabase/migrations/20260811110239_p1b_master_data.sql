-- P1B shared business users and master data.
-- Runtime services are not switched by this migration package.

create table public.business_users (
  id text primary key,
  auth_user_id uuid null references auth.users(id) on delete set null,
  email text not null,
  full_name text not null,
  avatar_url text null,
  avatar_storage_path text null,
  phone text null,
  role text not null default 'staff',
  system_permission text not null default 'member',
  operational_roles text[] not null default '{}'::text[],
  department text null,
  status text not null default 'active',
  account_status text not null default 'pending_approval',
  email_verified boolean not null default false,
  auth_provider text null,
  join_date date not null default current_date,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  deleted_at timestamptz null,
  deleted_by text null references public.business_users(id) on delete set null,
  archived_at timestamptz null,
  archived_by text null references public.business_users(id) on delete set null,
  deletion_reason text null,
  constraint business_users_id_not_blank check (btrim(id) <> ''),
  constraint business_users_email_not_blank check (btrim(email) <> ''),
  constraint business_users_full_name_not_blank check (btrim(full_name) <> ''),
  constraint business_users_role_check check (role in ('admin', 'leader', 'staff')),
  constraint business_users_system_permission_check
    check (system_permission in ('member', 'leader', 'admin')),
  constraint business_users_operational_roles_check
    check (operational_roles <@ array['host', 'support', 'technical']::text[]),
  constraint business_users_status_check check (status in ('active', 'inactive')),
  constraint business_users_account_status_check
    check (account_status in ('pending_email_verification', 'pending_approval', 'rejected', 'active')),
  constraint business_users_auth_provider_check
    check (auth_provider is null or auth_provider in ('email', 'google'))
);

create unique index business_users_auth_user_id_uidx
  on public.business_users (auth_user_id)
  where auth_user_id is not null;
create unique index business_users_email_lower_uidx
  on public.business_users (lower(email));
create index business_users_operational_roles_gin_idx
  on public.business_users using gin (operational_roles);
create index business_users_deleted_by_idx on public.business_users (deleted_by);
create index business_users_archived_by_idx on public.business_users (archived_by);
create index business_users_active_idx
  on public.business_users (system_permission, full_name)
  where status = 'active' and account_status = 'active'
    and archived_at is null and deleted_at is null;

create table public.brands (
  id text primary key,
  name text not null,
  logo_url text null,
  color text null,
  description text null,
  category text null,
  status text not null default 'active',
  contact_person text null,
  contact_email text null,
  contact_phone text null,
  brand_guideline text null,
  tone_of_voice text null,
  key_products text[] not null default '{}'::text[],
  mandatory_claims text[] not null default '{}'::text[],
  restricted_claims text[] not null default '{}'::text[],
  dos text[] not null default '{}'::text[],
  donts text[] not null default '{}'::text[],
  asset_links text[] not null default '{}'::text[],
  notes text null,
  updated_by text null references public.business_users(id) on delete set null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  deleted_at timestamptz null,
  deleted_by text null references public.business_users(id) on delete set null,
  archived_at timestamptz null,
  archived_by text null references public.business_users(id) on delete set null,
  deletion_reason text null,
  constraint brands_id_not_blank check (btrim(id) <> ''),
  constraint brands_name_not_blank check (btrim(name) <> ''),
  constraint brands_status_check check (status in ('active', 'inactive', 'draft'))
);

create index brands_updated_by_idx on public.brands (updated_by);
create index brands_deleted_by_idx on public.brands (deleted_by);
create index brands_archived_by_idx on public.brands (archived_by);
create index brands_active_name_idx
  on public.brands (name)
  where archived_at is null and deleted_at is null;

create table public.platforms (
  id text primary key,
  name text not null,
  icon text null,
  logo_url text null,
  platform_type text null,
  platform_url text null,
  status text not null default 'active',
  account_information text null,
  policy_notes text null,
  livestream_rules text[] not null default '{}'::text[],
  content_restrictions text[] not null default '{}'::text[],
  technical_requirements text[] not null default '{}'::text[],
  report_requirements text[] not null default '{}'::text[],
  external_links text[] not null default '{}'::text[],
  updated_by text null references public.business_users(id) on delete set null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  deleted_at timestamptz null,
  deleted_by text null references public.business_users(id) on delete set null,
  archived_at timestamptz null,
  archived_by text null references public.business_users(id) on delete set null,
  deletion_reason text null,
  constraint platforms_id_not_blank check (btrim(id) <> ''),
  constraint platforms_name_not_blank check (btrim(name) <> ''),
  constraint platforms_status_check check (status in ('active', 'inactive', 'draft'))
);

create index platforms_updated_by_idx on public.platforms (updated_by);
create index platforms_deleted_by_idx on public.platforms (deleted_by);
create index platforms_archived_by_idx on public.platforms (archived_by);
create index platforms_active_name_idx
  on public.platforms (name)
  where archived_at is null and deleted_at is null;

create table public.campaigns (
  id text primary key,
  name text not null,
  brand_id text not null references public.brands(id) on delete restrict,
  start_date date not null,
  end_date date not null,
  type text null,
  notes text null,
  campaign_url text null,
  website_url text null,
  website_title text null,
  website_preview_image text null,
  website_embed_enabled boolean not null default false,
  platform_source text null,
  platform_ids text[] not null default '{}'::text[],
  status text not null default 'draft',
  owner_id text null references public.business_users(id) on delete set null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  deleted_at timestamptz null,
  deleted_by text null references public.business_users(id) on delete set null,
  archived_at timestamptz null,
  archived_by text null references public.business_users(id) on delete set null,
  deletion_reason text null,
  constraint campaigns_id_not_blank check (btrim(id) <> ''),
  constraint campaigns_name_not_blank check (btrim(name) <> ''),
  constraint campaigns_date_order_check check (end_date >= start_date),
  constraint campaigns_status_check
    check (status in ('draft', 'active', 'completed', 'cancelled'))
);

create index campaigns_brand_id_idx on public.campaigns (brand_id);
create index campaigns_owner_id_idx on public.campaigns (owner_id);
create index campaigns_deleted_by_idx on public.campaigns (deleted_by);
create index campaigns_archived_by_idx on public.campaigns (archived_by);
create index campaigns_platform_ids_gin_idx on public.campaigns using gin (platform_ids);
create index campaigns_status_dates_idx
  on public.campaigns (status, start_date, end_date)
  where archived_at is null and deleted_at is null;

create trigger business_users_set_updated_at
before update on public.business_users
for each row execute function private.set_updated_at();

create trigger brands_set_updated_at
before update on public.brands
for each row execute function private.set_updated_at();

create trigger platforms_set_updated_at
before update on public.platforms
for each row execute function private.set_updated_at();

create trigger campaigns_set_updated_at
before update on public.campaigns
for each row execute function private.set_updated_at();

create or replace function private.current_business_user_id()
returns text
language sql
stable
security definer
set search_path = ''
as $$
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
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
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
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select business_user.system_permission
  from public.business_users as business_user
  where business_user.auth_user_id = (select auth.uid())
    and business_user.status = 'active'
    and business_user.account_status = 'active'
    and business_user.archived_at is null
    and business_user.deleted_at is null
  limit 1;
$$;

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select private.current_system_permission()) = 'admin', false);
$$;

create or replace function private.is_leader_or_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select private.current_system_permission()) in ('leader', 'admin'),
    false
  );
$$;

revoke all on function private.current_business_user_id() from public, anon, authenticated;
revoke all on function private.current_business_user_is_active() from public, anon, authenticated;
revoke all on function private.current_system_permission() from public, anon, authenticated;
revoke all on function private.is_admin() from public, anon, authenticated;
revoke all on function private.is_leader_or_admin() from public, anon, authenticated;

grant execute on function private.current_business_user_id() to authenticated;
grant execute on function private.current_business_user_is_active() to authenticated;
grant execute on function private.current_system_permission() to authenticated;
grant execute on function private.is_admin() to authenticated;
grant execute on function private.is_leader_or_admin() to authenticated;

alter table public.business_users enable row level security;
alter table public.brands enable row level security;
alter table public.platforms enable row level security;
alter table public.campaigns enable row level security;

revoke all on table public.business_users from anon, authenticated;
revoke all on table public.brands from anon, authenticated;
revoke all on table public.platforms from anon, authenticated;
revoke all on table public.campaigns from anon, authenticated;

grant select, insert, update, delete on table public.business_users to authenticated;
grant select, insert, update, delete on table public.brands to authenticated;
grant select, insert, update, delete on table public.platforms to authenticated;
grant select, insert, update, delete on table public.campaigns to authenticated;

create policy business_users_active_directory_select
on public.business_users
for select
to authenticated
using (
  (select private.current_business_user_is_active())
  and status = 'active'
  and account_status = 'active'
  and archived_at is null
  and deleted_at is null
);

create policy business_users_admin_all
on public.business_users
for all
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

create policy brands_shared_select
on public.brands
for select
to authenticated
using (
  (select private.current_business_user_is_active())
  and archived_at is null
  and deleted_at is null
);

create policy brands_admin_all
on public.brands
for all
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

create policy platforms_shared_select
on public.platforms
for select
to authenticated
using (
  (select private.current_business_user_is_active())
  and archived_at is null
  and deleted_at is null
);

create policy platforms_admin_all
on public.platforms
for all
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

create policy campaigns_shared_select
on public.campaigns
for select
to authenticated
using (
  (select private.current_business_user_is_active())
  and archived_at is null
  and deleted_at is null
);

create policy campaigns_admin_all
on public.campaigns
for all
to authenticated
using ((select private.is_admin()))
with check ((select private.is_admin()));

comment on column public.business_users.auth_user_id is
  'Supabase Auth UUID. Domain relations continue to use business_users.id.';
comment on column public.business_users.email_verified is
  'Business workflow metadata only; Supabase Auth remains authoritative for authentication.';
comment on column public.platforms.account_information is
  'Operational account description only. Credentials are prohibited.';
comment on column public.campaigns.platform_ids is
  'P1 compatibility array. Referential validation is performed by the migration and future adapter.';
