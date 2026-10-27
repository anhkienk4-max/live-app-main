-- STO-02 proposal: metadata-only links; never changes approved upload routing.
create table public.storage_resources (
  id text primary key default gen_random_uuid()::text,
  provider text not null check (provider in ('google_drive', 'onedrive')),
  canonical_id text not null check (btrim(canonical_id) <> '' and canonical_id !~ '[/\\?#]'),
  canonical_url text not null check (
    canonical_url ~ '^https://(www\.)?(drive\.google\.com|docs\.google\.com|onedrive\.live\.com|[A-Za-z0-9-]+\.sharepoint\.com)/'
    and canonical_url !~ '[?#@]'
  ),
  title text not null check (btrim(title) <> '' and length(title) <= 200),
  resource_type text not null check (resource_type in (
    'root_folder', 'google_sheet', 'report_data', 'product_document', 'sku_document',
    'kv', 'image', 'livecut', 'marketing_asset', 'campaign_scheme', 'script',
    'guideline', 'contract', 'acceptance', 'attendance_evidence', 'other'
  )),
  owner_id text not null references public.business_users(id) on delete restrict,
  visibility text not null check (visibility in ('admin_only', 'owner_only', 'granted_users')),
  verification_status text not null default 'unverified' check (verification_status in (
    'unverified', 'verified_metadata', 'broken', 'verification_error'
  )),
  verification_checked_at timestamptz,
  verification_error_code text,
  is_active boolean not null default true,
  created_by text not null references public.business_users(id) on delete restrict,
  updated_by text not null references public.business_users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider, canonical_id),
  unique (provider, canonical_url),
  constraint storage_resources_attendance_visibility check (
    resource_type <> 'attendance_evidence' or visibility = 'owner_only'
  ),
  constraint storage_resources_verification_pair check (
    (verification_status = 'unverified' and verification_checked_at is null)
    or (verification_status <> 'unverified' and verification_checked_at is not null)
  )
);

create table public.storage_resource_scopes (
  id text primary key default gen_random_uuid()::text,
  resource_id text not null references public.storage_resources(id) on delete cascade,
  brand_id text references public.brands(id) on delete restrict,
  campaign_id text references public.campaigns(id) on delete restrict,
  platform_id text references public.platforms(id) on delete restrict,
  shift_id text references public.shifts(id) on delete restrict,
  staff_id text references public.business_users(id) on delete restrict,
  client_group_key text,
  sku_key text,
  year integer check (year is null or year between 2000 and 2200),
  month integer check (month is null or month between 1 and 12),
  created_by text not null references public.business_users(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint storage_resource_scopes_month_needs_year check (month is null or year is not null),
  unique nulls not distinct (
    resource_id, brand_id, campaign_id, platform_id, shift_id, staff_id,
    client_group_key, sku_key, year, month
  )
);

create table public.storage_resource_user_grants (
  resource_id text not null references public.storage_resources(id) on delete cascade,
  user_id text not null references public.business_users(id) on delete restrict,
  granted_by text not null references public.business_users(id) on delete restrict,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  primary key (resource_id, user_id)
);

create table public.storage_resource_audit_events (
  id bigint generated always as identity primary key,
  resource_id text not null,
  action text not null check (action in ('resource_insert', 'resource_update', 'resource_delete', 'scope_insert', 'scope_update', 'scope_delete', 'grant_insert', 'grant_update', 'grant_delete')),
  actor_id text,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);

create index storage_resource_scopes_resource_idx on public.storage_resource_scopes(resource_id);
create index storage_resource_scopes_brand_campaign_idx on public.storage_resource_scopes(brand_id, campaign_id);
create index storage_resource_grants_user_idx on public.storage_resource_user_grants(user_id) where revoked_at is null;
create index storage_resource_audit_resource_idx on public.storage_resource_audit_events(resource_id, created_at desc);

create or replace function private.guard_storage_resource_scope()
returns trigger language plpgsql security definer set search_path = '' as $$
declare kind text;
begin
  select resource_type into kind from public.storage_resources where id = new.resource_id;
  if kind = 'attendance_evidence' and (
    new.brand_id is not null or new.campaign_id is not null or new.client_group_key is not null
  ) then
    raise exception using errcode = '23514', message = 'ATTENDANCE_RESOURCE_SCOPE_PRIVATE';
  end if;
  return new;
end;
$$;
create trigger storage_resource_scopes_private_attendance
before insert or update on public.storage_resource_scopes
for each row execute function private.guard_storage_resource_scope();

create or replace function private.guard_storage_resource_attendance()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.resource_type = 'attendance_evidence' and exists (
    select 1 from public.storage_resource_scopes s
    where s.resource_id = new.id and (
      s.brand_id is not null or s.campaign_id is not null or s.client_group_key is not null
    )
  ) then
    raise exception using errcode = '23514', message = 'ATTENDANCE_RESOURCE_SCOPE_PRIVATE';
  end if;
  return new;
end;
$$;
create trigger storage_resources_private_attendance
before update of resource_type, visibility on public.storage_resources
for each row execute function private.guard_storage_resource_attendance();

create or replace function private.audit_storage_resource_change()
returns trigger language plpgsql security definer set search_path = '' as $$
declare rid text; action_name text;
begin
  if tg_table_name = 'storage_resources' then rid := coalesce(new.id, old.id);
  else rid := coalesce(new.resource_id, old.resource_id); end if;
  action_name := case
    when tg_table_name = 'storage_resources' then 'resource_' || lower(tg_op)
    when tg_table_name = 'storage_resource_scopes' then 'scope_' || lower(tg_op)
    else 'grant_' || lower(tg_op)
  end;
  insert into public.storage_resource_audit_events(resource_id, action, actor_id, before_data, after_data)
  values (
    rid, action_name,
    private.current_business_user_id(),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end
  );
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
create trigger storage_resources_audit after insert or update or delete on public.storage_resources
for each row execute function private.audit_storage_resource_change();
create trigger storage_resource_scopes_audit after insert or update or delete on public.storage_resource_scopes
for each row execute function private.audit_storage_resource_change();
create trigger storage_resource_grants_audit after insert or update or delete on public.storage_resource_user_grants
for each row execute function private.audit_storage_resource_change();

alter table public.storage_resources enable row level security;
alter table public.storage_resource_scopes enable row level security;
alter table public.storage_resource_user_grants enable row level security;
alter table public.storage_resource_audit_events enable row level security;
revoke all on public.storage_resources, public.storage_resource_scopes,
  public.storage_resource_user_grants, public.storage_resource_audit_events from public, anon, authenticated;
grant select, insert, update on public.storage_resources, public.storage_resource_scopes,
  public.storage_resource_user_grants to authenticated;
grant select on public.storage_resource_audit_events to authenticated;
grant usage, select on sequence public.storage_resource_audit_events_id_seq to authenticated;

create policy storage_resources_read_allowed on public.storage_resources for select to authenticated
using (
  private.current_business_user_is_active() and (
    (private.is_admin())
    or (is_active and visibility in ('owner_only', 'granted_users') and owner_id = private.current_business_user_id())
    or (is_active and visibility = 'granted_users' and exists (
      select 1 from public.storage_resource_user_grants g
      where g.resource_id = id and g.user_id = private.current_business_user_id() and g.revoked_at is null
    ))
  )
);
create policy storage_resources_admin_insert on public.storage_resources for insert to authenticated
with check (private.is_admin() and created_by = private.current_business_user_id() and updated_by = private.current_business_user_id());
create policy storage_resources_admin_update on public.storage_resources for update to authenticated
using (private.is_admin()) with check (private.is_admin() and updated_by = private.current_business_user_id());

create policy storage_resource_scopes_read_allowed on public.storage_resource_scopes for select to authenticated
using (exists (select 1 from public.storage_resources r where r.id = resource_id));
create policy storage_resource_scopes_admin_insert on public.storage_resource_scopes for insert to authenticated
with check (private.is_admin() and created_by = private.current_business_user_id());
create policy storage_resource_scopes_admin_update on public.storage_resource_scopes for update to authenticated
using (private.is_admin()) with check (private.is_admin());

create policy storage_resource_grants_read_own_or_admin on public.storage_resource_user_grants for select to authenticated
using (private.is_admin() or user_id = private.current_business_user_id());
create policy storage_resource_grants_admin_insert on public.storage_resource_user_grants for insert to authenticated
with check (private.is_admin() and granted_by = private.current_business_user_id());
create policy storage_resource_grants_admin_update on public.storage_resource_user_grants for update to authenticated
using (private.is_admin()) with check (private.is_admin());

create policy storage_resource_audit_admin_read on public.storage_resource_audit_events for select to authenticated
using (private.is_admin());

comment on table public.storage_resources is 'Metadata-only provider resource registry. Provider binaries are never stored here; registry visibility does not imply provider access.';
comment on table public.storage_resource_scopes is 'Descriptive resource associations only; these links do not grant registry or provider access.';
