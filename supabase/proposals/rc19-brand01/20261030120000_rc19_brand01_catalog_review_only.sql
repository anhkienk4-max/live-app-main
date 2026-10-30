-- BRAND-01 #99 schema proposal only. This file is NOT in supabase/migrations.
-- Requires the approved STO-02 schema before any disposable integration test.
-- Never apply to Production without separate migration approval.

do $$ begin
  if to_regclass('public.brands') is null or to_regclass('public.platforms') is null
    or to_regclass('public.campaigns') is null or to_regclass('public.storage_resources') is null
    or to_regclass('public.business_users') is null
    or to_regprocedure('private.current_business_user_is_active()') is null
    or to_regprocedure('private.current_business_user_id()') is null
    or to_regprocedure('private.is_admin()') is null then
    raise exception using errcode = '55000', message = 'BRAND01_REQUIRED_MASTER_OR_STO02_SCHEMA_MISSING';
  end if;
end $$;

create table public.brand01_products (
  id text primary key default gen_random_uuid()::text,
  product_code text not null,
  name text not null check (btrim(name) <> '' and length(name) <= 200),
  category text,
  description text,
  lifecycle_status text not null default 'draft' check (lifecycle_status in ('draft','active','inactive','archived')),
  owner_id text not null references public.business_users(id) on delete restrict,
  version integer not null default 1 check (version > 0),
  created_by text not null references public.business_users(id) on delete restrict,
  updated_by text not null references public.business_users(id) on delete restrict,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  archived_at timestamptz,
  archived_by text references public.business_users(id) on delete restrict,
  constraint brand01_products_code_not_blank check (btrim(product_code) <> '' and length(product_code) <= 120),
  constraint brand01_products_archive_pair check ((archived_at is null) = (archived_by is null)),
  unique (product_code)
);

create unique index brand01_products_code_lower_uidx on public.brand01_products (lower(product_code));

create table public.brand01_product_brands (
  product_id text not null references public.brand01_products(id) on delete restrict,
  brand_id text not null references public.brands(id) on delete restrict,
  is_active boolean not null default true,
  created_by text not null references public.business_users(id) on delete restrict,
  updated_by text not null references public.business_users(id) on delete restrict,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  primary key (product_id, brand_id)
);

-- Brand membership is explicit and Admin-managed. No default cross-brand grant.
create table public.brand01_user_brand_access (
  grant_id text primary key default gen_random_uuid()::text,
  user_id text not null references public.business_users(id) on delete restrict,
  brand_id text not null references public.brands(id) on delete restrict,
  access_level text not null default 'read' check (access_level = 'read'),
  granted_by text not null references public.business_users(id) on delete restrict,
  granted_at timestamptz not null default statement_timestamp(),
  expires_at timestamptz,
  revoked_at timestamptz,
  revoked_by text references public.business_users(id) on delete restrict,
  constraint brand01_access_expiry_after_grant check (expires_at is null or expires_at > granted_at),
  constraint brand01_access_revoke_after_grant check (revoked_at is null or revoked_at >= granted_at)
);

create table public.brand01_product_skus (
  id text primary key default gen_random_uuid()::text,
  product_id text not null references public.brand01_products(id) on delete restrict,
  sku_code text not null check (btrim(sku_code) <> '' and length(sku_code) <= 120),
  variant_name text not null check (btrim(variant_name) <> '' and length(variant_name) <= 200),
  size_or_package text,
  packaging_type text,
  lifecycle_status text not null default 'active' check (lifecycle_status in ('active','inactive','archived')),
  owner_id text not null references public.business_users(id) on delete restrict,
  version integer not null default 1 check (version > 0),
  created_by text not null references public.business_users(id) on delete restrict,
  updated_by text not null references public.business_users(id) on delete restrict,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  unique (product_id, sku_code)
);

create unique index brand01_product_skus_code_lower_uidx on public.brand01_product_skus (product_id, lower(sku_code));

create table public.brand01_product_platform_skus (
  sku_id text not null references public.brand01_product_skus(id) on delete restrict,
  platform_id text not null references public.platforms(id) on delete restrict,
  external_sku_id text not null check (btrim(external_sku_id) <> '' and length(external_sku_id) <= 160),
  created_by text not null references public.business_users(id) on delete restrict,
  created_at timestamptz not null default statement_timestamp(),
  primary key (sku_id, platform_id)
);

create unique index brand01_platform_sku_external_lower_uidx on public.brand01_product_platform_skus (platform_id, lower(external_sku_id));

create table public.brand01_campaign_product_skus (
  campaign_id text not null references public.campaigns(id) on delete restrict,
  sku_id text not null references public.brand01_product_skus(id) on delete restrict,
  owner_id text not null references public.business_users(id) on delete restrict,
  created_by text not null references public.business_users(id) on delete restrict,
  created_at timestamptz not null default statement_timestamp(),
  primary key (campaign_id, sku_id)
);

create table public.brand01_campaign_schemes (
  id text primary key default gen_random_uuid()::text,
  campaign_id text not null references public.campaigns(id) on delete restrict,
  sku_id text references public.brand01_product_skus(id) on delete restrict,
  scheme_name text not null check (btrim(scheme_name) <> '' and length(scheme_name) <= 200),
  terms text not null,
  eligibility text,
  exclusions text,
  valid_from timestamptz not null,
  valid_to timestamptz not null,
  owner_id text not null references public.business_users(id) on delete restrict,
  status text not null default 'draft' check (status in ('draft','pending_review','approved','rejected','expired')),
  source_resource_id text references public.storage_resources(id) on delete restrict,
  source_url text,
  reviewed_by text references public.business_users(id) on delete restrict,
  reviewed_at timestamptz,
  version integer not null default 1 check (version > 0),
  created_by text not null references public.business_users(id) on delete restrict,
  updated_by text not null references public.business_users(id) on delete restrict,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint brand01_campaign_scheme_dates check (valid_to > valid_from),
  constraint brand01_campaign_scheme_approval check (status <> 'approved' or (
    (source_resource_id is not null or nullif(btrim(source_url), '') is not null)
    and reviewed_by is not null and reviewed_at is not null and reviewed_by <> owner_id
  ))
);

create table public.brand01_product_knowledge_versions (
  id text primary key default gen_random_uuid()::text,
  product_id text not null references public.brand01_products(id) on delete restrict,
  sku_id text references public.brand01_product_skus(id) on delete restrict,
  knowledge_type text not null check (knowledge_type in ('description','ingredient','feature','claim','restriction','disclaimer','usage_note','faq','training')),
  content jsonb not null check (jsonb_typeof(content) in ('object','array','string')),
  version integer not null check (version > 0),
  status text not null check (status in ('draft','pending_review','approved','rejected','retired')),
  source_resource_id text references public.storage_resources(id) on delete restrict,
  source_url text,
  source_reference text,
  effective_from date,
  effective_to date,
  owner_id text not null references public.business_users(id) on delete restrict,
  created_by text not null references public.business_users(id) on delete restrict,
  reviewed_by text references public.business_users(id) on delete restrict,
  reviewed_at timestamptz,
  created_at timestamptz not null default statement_timestamp(),
  constraint brand01_knowledge_source_required check (
    status <> 'approved' or (source_resource_id is not null or nullif(btrim(source_url), '') is not null or nullif(btrim(source_reference), '') is not null)
  ),
  constraint brand01_knowledge_approval_required check (
    status <> 'approved' or (reviewed_by is not null and reviewed_at is not null and reviewed_by <> owner_id and effective_from is not null)
  ),
  constraint brand01_knowledge_effective_dates check (effective_to is null or effective_from is null or effective_to >= effective_from),
  unique (product_id, sku_id, knowledge_type, version)
);

create table public.brand01_product_resource_links (
  id text primary key default gen_random_uuid()::text,
  resource_id text not null references public.storage_resources(id) on delete restrict,
  product_id text references public.brand01_products(id) on delete restrict,
  sku_id text references public.brand01_product_skus(id) on delete restrict,
  campaign_id text references public.campaigns(id) on delete restrict,
  relation_type text not null check (relation_type in ('image','kv','guideline','script','training','faq','scheme','marketing_data','document','other')),
  owner_id text not null references public.business_users(id) on delete restrict,
  created_by text not null references public.business_users(id) on delete restrict,
  created_at timestamptz not null default statement_timestamp(),
  constraint brand01_resource_one_target check (num_nonnulls(product_id, sku_id, campaign_id) = 1),
  unique nulls not distinct (resource_id, product_id, sku_id, campaign_id, relation_type)
);

create table public.brand01_catalog_audit_events (
  id bigint generated always as identity primary key,
  table_name text not null,
  record_id text not null,
  action text not null check (action in ('insert','update')),
  actor_id text,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default statement_timestamp()
);

create table public.brand01_knowledge_reviews (
  id text primary key default gen_random_uuid()::text,
  knowledge_version_id text not null references public.brand01_product_knowledge_versions(id) on delete restrict,
  decision text not null check (decision in ('approved','rejected','changes_requested')),
  reviewer_id text not null references public.business_users(id) on delete restrict,
  reason text,
  created_at timestamptz not null default statement_timestamp(),
  unique (knowledge_version_id, reviewer_id, created_at)
);

create index brand01_products_status_name_idx on public.brand01_products (lifecycle_status, name) where archived_at is null;
create index brand01_product_brands_brand_idx on public.brand01_product_brands (brand_id, product_id);
create unique index brand01_user_brand_access_active_uidx on public.brand01_user_brand_access(user_id, brand_id) where revoked_at is null;
create index brand01_user_brand_access_brand_idx on public.brand01_user_brand_access (brand_id, user_id) where revoked_at is null;
create index brand01_user_brand_access_expiry_idx on public.brand01_user_brand_access (user_id, expires_at) where revoked_at is null;
create index brand01_product_skus_product_idx on public.brand01_product_skus (product_id, lifecycle_status);
create index brand01_platform_skus_platform_idx on public.brand01_product_platform_skus (platform_id, sku_id);
create index brand01_campaign_skus_campaign_idx on public.brand01_campaign_product_skus (campaign_id, sku_id);
create index brand01_schemes_campaign_dates_idx on public.brand01_campaign_schemes (campaign_id, valid_from, valid_to, status);
create index brand01_knowledge_product_status_idx on public.brand01_product_knowledge_versions (product_id, status, effective_from desc);
create index brand01_knowledge_reviews_latest_idx on public.brand01_knowledge_reviews (knowledge_version_id, created_at desc);
create index brand01_resource_product_idx on public.brand01_product_resource_links (product_id, created_at desc) where product_id is not null;
create index brand01_resource_sku_idx on public.brand01_product_resource_links (sku_id, created_at desc) where sku_id is not null;
create index brand01_resource_campaign_idx on public.brand01_product_resource_links (campaign_id, created_at desc) where campaign_id is not null;
create index brand01_audit_record_idx on public.brand01_catalog_audit_events (table_name, record_id, created_at desc);

create or replace function private.brand01_catalog_audit()
returns trigger language plpgsql security definer set search_path = '' as $$
declare before_row jsonb; after_row jsonb; row_data jsonb; actor text;
begin
  before_row := case when tg_op = 'UPDATE' then to_jsonb(old) else null end;
  after_row := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  row_data := coalesce(after_row, before_row);
  actor := private.current_business_user_id();
  insert into public.brand01_catalog_audit_events(table_name,record_id,action,actor_id,before_data,after_data)
  values (tg_table_name, row_data->>'id', lower(tg_op), actor, before_row, after_row);
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

create or replace function private.brand01_can_read_brand(p_brand_id text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(private.current_business_user_is_active() and (
    private.is_admin() or exists (
      select 1 from public.brand01_user_brand_access access
      where access.user_id = private.current_business_user_id()
        and access.brand_id = p_brand_id and access.revoked_at is null
        and (access.expires_at is null or access.expires_at > statement_timestamp())
    )
  ), false)
$$;

create or replace function public.brand01_admin_create_product(
  p_product_code text, p_name text, p_category text, p_internal_description text,
  p_owner_id text, p_brand_ids text[]
)
returns public.brand01_products language plpgsql security invoker set search_path = '' as $$
declare actor text; created public.brand01_products; brand_id text;
begin
  actor := private.current_business_user_id();
  if not private.current_business_user_is_active() or not private.is_admin() then
    raise exception using errcode = '42501', message = 'BRAND01_ADMIN_REQUIRED';
  end if;
  if nullif(btrim(p_product_code), '') is null or nullif(btrim(p_name), '') is null
    or coalesce(cardinality(p_brand_ids), 0) = 0 then
    raise exception using errcode = '22023', message = 'BRAND01_PRODUCT_INPUT_INVALID';
  end if;
  if (select count(distinct value) from unnest(p_brand_ids) as value) <> cardinality(p_brand_ids) then
    raise exception using errcode = '22023', message = 'BRAND01_DUPLICATE_BRAND_LINK';
  end if;
  if exists (select 1 from unnest(p_brand_ids) as requested(id)
      left join public.brands b on b.id=requested.id and b.status='active' and b.archived_at is null and b.deleted_at is null
      where b.id is null) then
    raise exception using errcode = '23503', message = 'BRAND01_BRAND_UNAVAILABLE';
  end if;
  insert into public.brand01_products(product_code,name,category,description,lifecycle_status,owner_id,created_by,updated_by)
  values (btrim(p_product_code),btrim(p_name),nullif(btrim(p_category),''),nullif(btrim(p_internal_description),''),'draft',coalesce(p_owner_id,actor),actor,actor)
  returning * into created;
  foreach brand_id in array p_brand_ids loop
    insert into public.brand01_product_brands(product_id,brand_id,created_by,updated_by) values(created.id,brand_id,actor,actor);
  end loop;
  return created;
end $$;

create or replace function public.brand01_admin_replace_product_brands(
  p_product_id text, p_brand_ids text[], p_expected_version integer
)
returns public.brand01_products language plpgsql security invoker set search_path = '' as $$
declare actor text; current_product public.brand01_products; brand_id text;
begin
  actor := private.current_business_user_id();
  if not private.current_business_user_is_active() or not private.is_admin() then
    raise exception using errcode = '42501', message = 'BRAND01_ADMIN_REQUIRED';
  end if;
  if coalesce(cardinality(p_brand_ids),0)=0 or p_expected_version is null then
    raise exception using errcode = '22023', message = 'BRAND01_PRODUCT_INPUT_INVALID';
  end if;
  select * into current_product from public.brand01_products where id=p_product_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'BRAND01_PRODUCT_NOT_FOUND'; end if;
  if current_product.version <> p_expected_version then raise exception using errcode = '40001', message = 'BRAND01_VERSION_CONFLICT'; end if;
  if (select count(distinct value) from unnest(p_brand_ids) as value) <> cardinality(p_brand_ids)
    or exists (select 1 from unnest(p_brand_ids) as requested(id)
      left join public.brands b on b.id=requested.id and b.status='active' and b.archived_at is null and b.deleted_at is null where b.id is null) then
    raise exception using errcode = '23503', message = 'BRAND01_BRAND_UNAVAILABLE';
  end if;
  if exists (
    select 1 from public.brand01_campaign_product_skus cps
    join public.brand01_product_skus s on s.id=cps.sku_id
    join public.campaigns c on c.id=cps.campaign_id
    join public.brand01_product_brands pb on pb.product_id=s.product_id and pb.brand_id=c.brand_id
    where s.product_id=p_product_id and pb.is_active and not (c.brand_id = any(p_brand_ids))
  ) then raise exception using errcode = '23514', message = 'BRAND01_CAMPAIGN_BRAND_LINK_IN_USE'; end if;
  update public.brand01_product_brands set is_active=false,updated_by=actor,updated_at=statement_timestamp()
   where product_id=p_product_id and is_active and not (brand_id=any(p_brand_ids));
  foreach brand_id in array p_brand_ids loop
    insert into public.brand01_product_brands(product_id,brand_id,created_by,updated_by)
      values(p_product_id,brand_id,actor,actor)
      on conflict on constraint brand01_product_brands_pkey do update set is_active=true,updated_by=excluded.updated_by,updated_at=statement_timestamp();
  end loop;
  update public.brand01_products set version=version+1,updated_by=actor where id=p_product_id returning * into current_product;
  return current_product;
end $$;

create or replace function private.brand01_campaign_sku_brand_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare campaign_brand text; product text;
begin
  select c.brand_id into campaign_brand from public.campaigns c where c.id = new.campaign_id and c.deleted_at is null and c.archived_at is null;
  select s.product_id into product from public.brand01_product_skus s where s.id = new.sku_id and s.lifecycle_status = 'active';
  if campaign_brand is null or product is null or not exists (
    select 1 from public.brand01_product_brands pb where pb.product_id = product and pb.brand_id = campaign_brand
  ) then
    raise exception using errcode = '23514', message = 'BRAND01_CAMPAIGN_SKU_BRAND_MISMATCH';
  end if;
  return new;
end $$;

create or replace function private.brand01_resource_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from public.storage_resources r where r.id = new.resource_id and r.is_active and r.resource_type <> 'attendance_evidence') then
    raise exception using errcode = '23514', message = 'BRAND01_RESOURCE_UNAVAILABLE_OR_PRIVATE';
  end if;
  return new;
end $$;

create or replace function private.brand01_knowledge_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op <> 'INSERT' then
    raise exception using errcode = '55000', message = 'BRAND01_KNOWLEDGE_VERSIONS_IMMUTABLE';
  end if;
  if new.sku_id is not null and not exists (
    select 1 from public.brand01_product_skus s where s.id = new.sku_id and s.product_id = new.product_id
  ) then
    raise exception using errcode = '23514', message = 'BRAND01_KNOWLEDGE_SKU_PRODUCT_MISMATCH';
  end if;
  if new.status = 'approved' then raise exception using errcode = '23514', message = 'BRAND01_APPROVAL_REQUIRES_SEPARATE_REVIEW'; end if;
  if new.source_resource_id is not null and not exists (
    select 1 from public.storage_resources r where r.id = new.source_resource_id and r.is_active and r.resource_type <> 'attendance_evidence'
  ) then
    raise exception using errcode = '23514', message = 'BRAND01_SOURCE_RESOURCE_UNAVAILABLE';
  end if;
  return new;
end $$;

create or replace function private.brand01_review_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare owner_id text;
begin
  if tg_op <> 'INSERT' or not private.is_admin() or new.reviewer_id is distinct from private.current_business_user_id() then
    raise exception using errcode = '42501', message = 'BRAND01_ADMIN_REVIEW_REQUIRED';
  end if;
  select owner_id into owner_id from public.brand01_product_knowledge_versions where id=new.knowledge_version_id;
  if owner_id is null or owner_id=new.reviewer_id then
    raise exception using errcode = '42501', message = 'BRAND01_INDEPENDENT_REVIEW_REQUIRED';
  end if;
  return new;
end $$;

create or replace function private.brand01_scheme_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.sku_id is not null and not exists (
    select 1 from public.brand01_campaign_product_skus cps where cps.campaign_id=new.campaign_id and cps.sku_id=new.sku_id
  ) then raise exception using errcode = '23514', message = 'BRAND01_SCHEME_SKU_NOT_IN_CAMPAIGN'; end if;
  if new.status='approved' and (not private.is_admin() or new.reviewed_by is distinct from private.current_business_user_id()
    or new.reviewed_by=new.owner_id or (new.source_resource_id is null and nullif(btrim(new.source_url),'') is null)) then
    raise exception using errcode = '42501', message = 'BRAND01_SCHEME_APPROVAL_INVALID';
  end if;
  if new.source_resource_id is not null and not exists(select 1 from public.storage_resources r where r.id=new.source_resource_id and r.is_active and r.resource_type <> 'attendance_evidence') then
    raise exception using errcode = '23514', message = 'BRAND01_SOURCE_RESOURCE_UNAVAILABLE';
  end if;
  return new;
end $$;

revoke all on function private.brand01_catalog_audit() from public, anon, authenticated;
revoke all on function private.brand01_campaign_sku_brand_guard() from public, anon, authenticated;
revoke all on function private.brand01_resource_guard() from public, anon, authenticated;
revoke all on function private.brand01_knowledge_guard() from public, anon, authenticated;
revoke all on function private.brand01_can_read_brand(text) from public, anon;
grant execute on function private.brand01_can_read_brand(text) to authenticated;
revoke all on function private.brand01_review_guard() from public, anon, authenticated;
revoke all on function private.brand01_scheme_guard() from public, anon, authenticated;
revoke all on function public.brand01_admin_create_product(text,text,text,text,text,text[]) from public, anon;
grant execute on function public.brand01_admin_create_product(text,text,text,text,text,text[]) to authenticated;
revoke all on function public.brand01_admin_replace_product_brands(text,text[],integer) from public, anon;
grant execute on function public.brand01_admin_replace_product_brands(text,text[],integer) to authenticated;

create trigger brand01_products_audit after insert or update on public.brand01_products for each row execute function private.brand01_catalog_audit();
create trigger brand01_skus_audit after insert or update on public.brand01_product_skus for each row execute function private.brand01_catalog_audit();
create trigger brand01_campaign_sku_brand before insert or update on public.brand01_campaign_product_skus for each row execute function private.brand01_campaign_sku_brand_guard();
create trigger brand01_resource_active before insert or update on public.brand01_product_resource_links for each row execute function private.brand01_resource_guard();
create trigger brand01_knowledge_append_only before insert or update or delete on public.brand01_product_knowledge_versions for each row execute function private.brand01_knowledge_guard();
create trigger brand01_knowledge_audit after insert on public.brand01_product_knowledge_versions for each row execute function private.brand01_catalog_audit();
create trigger brand01_campaign_scheme_audit after insert or update on public.brand01_campaign_schemes for each row execute function private.brand01_catalog_audit();
create trigger brand01_knowledge_review_guard before insert or update or delete on public.brand01_knowledge_reviews for each row execute function private.brand01_review_guard();
create trigger brand01_knowledge_review_audit after insert on public.brand01_knowledge_reviews for each row execute function private.brand01_catalog_audit();
create trigger brand01_campaign_scheme_guard before insert or update on public.brand01_campaign_schemes for each row execute function private.brand01_scheme_guard();

do $$ declare table_name text;
begin
  foreach table_name in array array[
    'brand01_products','brand01_product_brands','brand01_user_brand_access','brand01_product_skus','brand01_product_platform_skus',
    'brand01_campaign_product_skus','brand01_campaign_schemes','brand01_product_knowledge_versions','brand01_product_resource_links','brand01_catalog_audit_events','brand01_knowledge_reviews'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
  end loop;
end $$;

revoke all on public.brand01_products, public.brand01_product_brands, public.brand01_user_brand_access, public.brand01_product_skus,
  public.brand01_product_platform_skus, public.brand01_campaign_product_skus, public.brand01_campaign_schemes,
  public.brand01_product_knowledge_versions, public.brand01_product_resource_links, public.brand01_catalog_audit_events, public.brand01_knowledge_reviews
from public, anon, authenticated;
grant select, insert, update on public.brand01_products, public.brand01_product_brands, public.brand01_product_skus,
  public.brand01_product_platform_skus, public.brand01_campaign_product_skus, public.brand01_campaign_schemes,
  public.brand01_product_knowledge_versions, public.brand01_product_resource_links to authenticated;
grant select on public.brand01_catalog_audit_events to authenticated;
grant select, insert, update on public.brand01_user_brand_access, public.brand01_knowledge_reviews to authenticated;
grant usage, select on sequence public.brand01_catalog_audit_events_id_seq to authenticated;

create policy brand01_products_read on public.brand01_products for select to authenticated using (
  private.current_business_user_is_active() and (private.is_admin() or (lifecycle_status = 'active' and archived_at is null
    and exists (select 1 from public.brand01_product_brands pb where pb.product_id=id and pb.is_active and private.brand01_can_read_brand(pb.brand_id))))
);
create policy brand01_products_admin_insert on public.brand01_products for insert to authenticated with check (
  private.current_business_user_is_active() and private.is_admin() and created_by = private.current_business_user_id() and updated_by = private.current_business_user_id()
);
create policy brand01_products_admin_update on public.brand01_products for update to authenticated using (private.is_admin()) with check (
  private.is_admin() and updated_by = private.current_business_user_id()
);

create policy brand01_product_brands_read on public.brand01_product_brands for select to authenticated using (
  private.current_business_user_is_active() and is_active and private.brand01_can_read_brand(brand_id)
);
create policy brand01_product_brands_admin_insert on public.brand01_product_brands for insert to authenticated with check (private.is_admin() and created_by = private.current_business_user_id() and updated_by=private.current_business_user_id());
create policy brand01_product_brands_admin_update on public.brand01_product_brands for update to authenticated using (private.is_admin()) with check (private.is_admin() and updated_by=private.current_business_user_id());

create policy brand01_user_brand_access_admin_read on public.brand01_user_brand_access for select to authenticated using (private.is_admin());
create policy brand01_user_brand_access_admin_insert on public.brand01_user_brand_access for insert to authenticated with check (private.is_admin() and granted_by=private.current_business_user_id());
create policy brand01_user_brand_access_admin_update on public.brand01_user_brand_access for update to authenticated using (private.is_admin()) with check (private.is_admin() and revoked_by=private.current_business_user_id());

create policy brand01_skus_read on public.brand01_product_skus for select to authenticated using (
  private.current_business_user_is_active() and (private.is_admin() or (lifecycle_status = 'active' and exists (select 1 from public.brand01_products p where p.id = product_id and p.lifecycle_status = 'active' and p.archived_at is null and exists(select 1 from public.brand01_product_brands pb where pb.product_id=p.id and pb.is_active and private.brand01_can_read_brand(pb.brand_id)))))
);
create policy brand01_skus_admin_insert on public.brand01_product_skus for insert to authenticated with check (private.is_admin() and created_by = private.current_business_user_id() and updated_by = private.current_business_user_id());
create policy brand01_skus_admin_update on public.brand01_product_skus for update to authenticated using (private.is_admin()) with check (private.is_admin() and updated_by = private.current_business_user_id());

create policy brand01_platform_skus_read on public.brand01_product_platform_skus for select to authenticated using (private.current_business_user_is_active() and exists (select 1 from public.brand01_product_skus s join public.brand01_products p on p.id=s.product_id join public.brand01_product_brands pb on pb.product_id=p.id where s.id=sku_id and pb.is_active and (private.is_admin() or (p.lifecycle_status='active' and private.brand01_can_read_brand(pb.brand_id)))));
create policy brand01_platform_skus_admin_insert on public.brand01_product_platform_skus for insert to authenticated with check (private.is_admin() and created_by = private.current_business_user_id());
create policy brand01_campaign_skus_read on public.brand01_campaign_product_skus for select to authenticated using (
  private.current_business_user_is_active() and exists (select 1 from public.campaigns c join public.brand01_product_skus s on s.id=sku_id join public.brand01_products p on p.id=s.product_id where c.id = campaign_id and c.deleted_at is null and c.archived_at is null and c.brand_id in (select pb.brand_id from public.brand01_product_brands pb where pb.product_id=p.id and pb.is_active) and (private.is_admin() or private.brand01_can_read_brand(c.brand_id)))
);
create policy brand01_campaign_skus_admin_insert on public.brand01_campaign_product_skus for insert to authenticated with check (private.is_admin() and created_by = private.current_business_user_id());

create policy brand01_schemes_read on public.brand01_campaign_schemes for select to authenticated using (
  private.current_business_user_is_active() and (private.is_admin() or (status = 'approved' and valid_from <= statement_timestamp() and valid_to > statement_timestamp() and exists(select 1 from public.campaigns c where c.id=campaign_id and private.brand01_can_read_brand(c.brand_id))))
);
create policy brand01_schemes_admin_insert on public.brand01_campaign_schemes for insert to authenticated with check (private.is_admin() and created_by = private.current_business_user_id() and updated_by = private.current_business_user_id());
create policy brand01_schemes_admin_update on public.brand01_campaign_schemes for update to authenticated using (private.is_admin()) with check (private.is_admin() and updated_by = private.current_business_user_id());

create policy brand01_knowledge_read on public.brand01_product_knowledge_versions for select to authenticated using (
  private.current_business_user_is_active() and (
    private.is_admin() or (status = 'pending_review' and effective_from <= current_date and (effective_to is null or effective_to >= current_date)
      and exists (select 1 from public.brand01_knowledge_reviews review where review.knowledge_version_id=id and review.decision='approved' and not exists(select 1 from public.brand01_knowledge_reviews later where later.knowledge_version_id=id and later.created_at>review.created_at))
      and exists (select 1 from public.brand01_products p join public.brand01_product_brands pb on pb.product_id=p.id where p.id = product_id and p.lifecycle_status = 'active' and p.archived_at is null and pb.is_active and private.brand01_can_read_brand(pb.brand_id)))
  )
);
create policy brand01_knowledge_admin_insert on public.brand01_product_knowledge_versions for insert to authenticated with check (
  private.is_admin() and created_by = private.current_business_user_id()
);

create policy brand01_resource_link_read on public.brand01_product_resource_links for select to authenticated using (
  private.current_business_user_is_active() and exists (
    select 1 from public.storage_resources r where r.id = resource_id and r.is_active and r.resource_type <> 'attendance_evidence'
  ) and (
    private.is_admin()
    or (product_id is not null and exists (select 1 from public.brand01_products p join public.brand01_product_brands pb on pb.product_id=p.id where p.id = product_id and p.lifecycle_status = 'active' and p.archived_at is null and pb.is_active and private.brand01_can_read_brand(pb.brand_id)))
    or (sku_id is not null and exists (select 1 from public.brand01_product_skus s join public.brand01_products p on p.id=s.product_id join public.brand01_product_brands pb on pb.product_id=p.id where s.id=sku_id and s.lifecycle_status='active' and p.lifecycle_status='active' and p.archived_at is null and pb.is_active and private.brand01_can_read_brand(pb.brand_id)))
    or (campaign_id is not null and exists (select 1 from public.campaigns c where c.id=campaign_id and c.archived_at is null and c.deleted_at is null and private.brand01_can_read_brand(c.brand_id)))
  )
);
create policy brand01_resource_link_admin_insert on public.brand01_product_resource_links for insert to authenticated with check (private.is_admin() and created_by = private.current_business_user_id());

create policy brand01_catalog_audit_admin_read on public.brand01_catalog_audit_events for select to authenticated using (private.is_admin());
create policy brand01_knowledge_reviews_admin_read on public.brand01_knowledge_reviews for select to authenticated using (private.is_admin());
create policy brand01_knowledge_reviews_admin_insert on public.brand01_knowledge_reviews for insert to authenticated with check (private.is_admin() and reviewer_id=private.current_business_user_id());

comment on table public.brand01_products is 'BRAND-01 review-only product catalog. Brand/platform relationships are many-to-many; binaries remain in provider storage.';
comment on table public.brand01_product_knowledge_versions is 'Append-only sourced knowledge versions. Non-Admin reads require approved, effective content.';
comment on table public.brand01_product_resource_links is 'Links existing STO-02 metadata only. Link scope does not grant registry or provider visibility.';
-- BRAND-01 security/integrity completion. Review-only; never placed in migrations.

create unique index brand01_knowledge_version_natural_uidx
  on public.brand01_product_knowledge_versions (product_id, coalesce(sku_id, ''), knowledge_type, version);

create or replace function private.brand01_catalog_audit()
returns trigger language plpgsql security definer set search_path = '' as $$
declare before_row jsonb; after_row jsonb; row_data jsonb; actor text; record_key text;
begin
  before_row := case when tg_op = 'UPDATE' then to_jsonb(old) else null end;
  after_row := case when tg_op = 'DELETE' then null else to_jsonb(new) end;
  row_data := coalesce(after_row, before_row);
  actor := private.current_business_user_id();
  record_key := coalesce(row_data->>'id', row_data->>'grant_id',
    case when row_data ? 'sku_id' and row_data ? 'platform_id' then (row_data->>'sku_id') || ':' || (row_data->>'platform_id') end,
    case when row_data ? 'user_id' and row_data ? 'brand_id' then (row_data->>'user_id') || ':' || (row_data->>'brand_id') end,
    case when row_data ? 'product_id' and row_data ? 'brand_id' then (row_data->>'product_id') || ':' || (row_data->>'brand_id') end,
    case when row_data ? 'campaign_id' and row_data ? 'sku_id' then (row_data->>'campaign_id') || ':' || (row_data->>'sku_id') end);
  insert into public.brand01_catalog_audit_events(table_name,record_id,action,actor_id,before_data,after_data)
  values (tg_table_name, coalesce(record_key, 'unknown'), lower(tg_op), actor, before_row, after_row);
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;

create or replace function private.brand01_user_brand_access_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not private.current_business_user_is_active() or not private.is_admin() then
    raise exception using errcode='42501', message='BRAND01_ADMIN_REQUIRED';
  end if;
  if tg_op='INSERT' then
    if not exists(select 1 from public.business_users u where u.id=new.user_id and u.status='active' and u.account_status='active' and u.archived_at is null and u.deleted_at is null)
      or not exists(select 1 from public.brands b where b.id=new.brand_id and b.status='active' and b.archived_at is null and b.deleted_at is null)
      or (new.expires_at is not null and new.expires_at<=statement_timestamp()) then
      raise exception using errcode='23514', message='BRAND01_SCOPE_TARGET_INVALID';
    end if;
    if new.granted_by is distinct from private.current_business_user_id() or new.revoked_at is not null or new.revoked_by is not null then
      raise exception using errcode='42501', message='BRAND01_SCOPE_GRANT_ACTOR_INVALID';
    end if;
  elsif tg_op='UPDATE' then
    if new.user_id is distinct from old.user_id or new.brand_id is distinct from old.brand_id
      or new.access_level is distinct from old.access_level or new.granted_by is distinct from old.granted_by
      or new.granted_at is distinct from old.granted_at then
      raise exception using errcode='55000', message='BRAND01_SCOPE_GRANT_IMMUTABLE';
    end if;
    if old.revoked_at is null and (new.revoked_at is null or new.revoked_by is distinct from private.current_business_user_id()) then
      raise exception using errcode='42501', message='BRAND01_SCOPE_REVOKE_ACTOR_INVALID';
    end if;
    if old.revoked_at is not null then
      raise exception using errcode='55000', message='BRAND01_SCOPE_GRANT_REISSUE_REQUIRED';
    end if;
  else
    raise exception using errcode='55000', message='BRAND01_SCOPE_GRANT_DELETE_FORBIDDEN';
  end if;
  return new;
end $$;

create or replace function public.brand01_admin_set_brand_access(
  p_user_id text, p_brand_id text, p_active boolean, p_expires_at timestamptz default null
)
returns public.brand01_user_brand_access language plpgsql security invoker set search_path = '' as $$
declare actor text; target public.business_users; current_access public.brand01_user_brand_access; result public.brand01_user_brand_access;
begin
  actor := private.current_business_user_id();
  if not private.current_business_user_is_active() or not private.is_admin() then
    raise exception using errcode='42501', message='BRAND01_ADMIN_REQUIRED';
  end if;
  if p_user_id is null or p_brand_id is null then raise exception using errcode='22023', message='BRAND01_SCOPE_INPUT_INVALID'; end if;
  if p_expires_at is not null and p_expires_at <= statement_timestamp() then raise exception using errcode='22023', message='BRAND01_SCOPE_EXPIRY_INVALID'; end if;
  select * into target from public.business_users where id=p_user_id and status='active' and account_status='active' and archived_at is null and deleted_at is null;
  if not found then raise exception using errcode='P0002', message='BRAND01_SCOPE_USER_NOT_FOUND'; end if;
  if not exists(select 1 from public.brands where id=p_brand_id and status='active' and archived_at is null and deleted_at is null) then
    raise exception using errcode='P0002', message='BRAND01_SCOPE_BRAND_NOT_FOUND';
  end if;
  select * into current_access from public.brand01_user_brand_access where user_id=p_user_id and brand_id=p_brand_id and revoked_at is null for update;
  if p_active then
    if found then raise exception using errcode='23505', message='BRAND01_SCOPE_ALREADY_ACTIVE'; end if;
    insert into public.brand01_user_brand_access(user_id,brand_id,access_level,granted_by,expires_at)
      values(p_user_id,p_brand_id,'read',actor,p_expires_at) returning * into result;
  else
    if not found or current_access.revoked_at is not null then raise exception using errcode='P0002', message='BRAND01_SCOPE_NOT_ACTIVE'; end if;
    update public.brand01_user_brand_access set revoked_at=statement_timestamp(), revoked_by=actor
      where user_id=p_user_id and brand_id=p_brand_id returning * into result;
  end if;
  return result;
end $$;

create or replace function public.brand01_admin_update_product(
  p_product_id text, p_expected_version integer, p_product_code text, p_name text,
  p_category text, p_internal_description text, p_lifecycle_status text, p_brand_ids text[]
)
returns public.brand01_products language plpgsql security invoker set search_path = '' as $$
declare actor text; current_product public.brand01_products; brand_id text;
begin
  actor := private.current_business_user_id();
  if not private.current_business_user_is_active() or not private.is_admin() then
    raise exception using errcode='42501', message='BRAND01_ADMIN_REQUIRED';
  end if;
  if p_expected_version is null or p_expected_version <= 0 or nullif(btrim(p_product_code),'') is null
    or nullif(btrim(p_name),'') is null or p_lifecycle_status not in ('draft','active','inactive','archived')
    or coalesce(cardinality(p_brand_ids),0)=0 then
    raise exception using errcode='22023', message='BRAND01_PRODUCT_INPUT_INVALID';
  end if;
  select * into current_product from public.brand01_products where id=p_product_id for update;
  if not found then raise exception using errcode='P0002', message='BRAND01_PRODUCT_NOT_FOUND'; end if;
  if current_product.version<>p_expected_version then raise exception using errcode='40001', message='BRAND01_VERSION_CONFLICT'; end if;
  if (select count(distinct value) from unnest(p_brand_ids) as value)<>cardinality(p_brand_ids)
    or exists(select 1 from unnest(p_brand_ids) requested(id) left join public.brands b
      on b.id=requested.id and b.status='active' and b.archived_at is null and b.deleted_at is null where b.id is null) then
    raise exception using errcode='23503', message='BRAND01_BRAND_UNAVAILABLE';
  end if;
  if exists (
    select 1 from public.brand01_campaign_product_skus cps
    join public.brand01_product_skus s on s.id=cps.sku_id
    join public.campaigns c on c.id=cps.campaign_id
    where s.product_id=p_product_id and c.brand_id <> all(p_brand_ids)
  ) then raise exception using errcode='23514', message='BRAND01_CAMPAIGN_BRAND_LINK_IN_USE'; end if;
  update public.brand01_products set product_code=btrim(p_product_code),name=btrim(p_name),category=nullif(btrim(p_category),''),
    description=nullif(btrim(p_internal_description),''),lifecycle_status=p_lifecycle_status,
    version=version+1,updated_by=actor,updated_at=statement_timestamp(),
    archived_at=case when p_lifecycle_status='archived' then coalesce(archived_at,statement_timestamp()) else null end,
    archived_by=case when p_lifecycle_status='archived' then coalesce(archived_by,actor) else null end
    where id=p_product_id returning * into current_product;
  update public.brand01_product_brands as product_brand set is_active=false,updated_by=actor,updated_at=statement_timestamp()
    where product_brand.product_id=p_product_id and product_brand.is_active and not (product_brand.brand_id=any(p_brand_ids));
  foreach brand_id in array p_brand_ids loop
    insert into public.brand01_product_brands(product_id,brand_id,created_by,updated_by) values(p_product_id,brand_id,actor,actor)
    on conflict(product_id,brand_id) do update set is_active=true,updated_by=actor,updated_at=statement_timestamp();
  end loop;
  return current_product;
end $$;

create or replace function private.brand01_has_current_knowledge_approval(p_knowledge_id text)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.current_business_user_is_active() and exists (
    select 1 from public.brand01_product_knowledge_versions k
    join public.brand01_knowledge_reviews r on r.knowledge_version_id=k.id
    where k.id=p_knowledge_id and k.status='pending_review'
      and r.decision='approved'
      and not exists(select 1 from public.brand01_knowledge_reviews later where later.knowledge_version_id=k.id and later.created_at>r.created_at)
      and k.effective_from<=current_date and (k.effective_to is null or k.effective_to>=current_date)
      and exists(select 1 from public.brand01_product_brands pb where pb.product_id=k.product_id and pb.is_active and private.brand01_can_read_brand(pb.brand_id))
  )
$$;

create or replace function private.brand01_review_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare knowledge_owner text; knowledge_status text;
begin
  if tg_op<>'INSERT' or not private.current_business_user_is_active() or not private.is_admin()
    or new.reviewer_id is distinct from private.current_business_user_id() then
    raise exception using errcode='42501', message='BRAND01_ADMIN_REVIEW_REQUIRED';
  end if;
  select k.created_by,k.status into knowledge_owner,knowledge_status
    from public.brand01_product_knowledge_versions k where k.id=new.knowledge_version_id for update;
  if not found or knowledge_owner=new.reviewer_id or knowledge_status<>'pending_review'
    or exists(select 1 from public.brand01_knowledge_reviews r where r.knowledge_version_id=new.knowledge_version_id) then
    raise exception using errcode='42501', message='BRAND01_INDEPENDENT_REVIEW_REQUIRED';
  end if;
  if new.decision='approved' and not exists (
    select 1 from public.brand01_product_knowledge_versions k
    where k.id=new.knowledge_version_id and (k.source_resource_id is not null or nullif(btrim(k.source_url),'') is not null or nullif(btrim(k.source_reference),'') is not null)
      and k.effective_from is not null
  ) then raise exception using errcode='23514', message='BRAND01_APPROVAL_SOURCE_AND_EFFECTIVE_DATE_REQUIRED'; end if;
  return new;
end $$;

create or replace function private.brand01_resource_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
declare target_brand text;
begin
  if not private.current_business_user_is_active() or not private.is_admin() then
    raise exception using errcode='42501', message='BRAND01_ADMIN_REQUIRED';
  end if;
  if not exists(select 1 from public.storage_resources r where r.id=new.resource_id and r.is_active and r.resource_type<>'attendance_evidence') then
    raise exception using errcode='23514', message='BRAND01_RESOURCE_UNAVAILABLE_OR_PRIVATE';
  end if;
  if new.product_id is not null then
    if not exists(select 1 from public.brand01_product_brands pb where pb.product_id=new.product_id and pb.is_active) then raise exception using errcode='23514', message='BRAND01_RESOURCE_PRODUCT_BRAND_REQUIRED'; end if;
    if exists(select 1 from public.storage_resource_scopes rs where rs.resource_id=new.resource_id and rs.brand_id is not null)
      and not exists(select 1 from public.storage_resource_scopes rs join public.brand01_product_brands pb on pb.brand_id=rs.brand_id where rs.resource_id=new.resource_id and pb.product_id=new.product_id and pb.is_active) then
      raise exception using errcode='23514', message='BRAND01_RESOURCE_SCOPE_MISMATCH';
    end if;
  elsif new.sku_id is not null then
    if not exists(select 1 from public.brand01_product_skus s join public.brand01_products p on p.id=s.product_id
      where s.id=new.sku_id and s.lifecycle_status <> 'archived' and p.archived_at is null
      and exists(select 1 from public.brand01_product_brands pb where pb.product_id=p.id and pb.is_active)) then
      raise exception using errcode='23514', message='BRAND01_RESOURCE_SKU_NOT_FOUND';
    end if;
    if exists(select 1 from public.storage_resource_scopes rs where rs.resource_id=new.resource_id and rs.brand_id is not null)
      and not exists(select 1 from public.storage_resource_scopes rs join public.brand01_product_skus s on s.id=new.sku_id
        join public.brand01_product_brands pb on pb.product_id=s.product_id and pb.brand_id=rs.brand_id and pb.is_active
        where rs.resource_id=new.resource_id) then
      raise exception using errcode='23514', message='BRAND01_RESOURCE_SCOPE_MISMATCH';
    end if;
    if exists(select 1 from public.storage_resource_scopes rs where rs.resource_id=new.resource_id and rs.campaign_id is not null)
      and not exists(select 1 from public.storage_resource_scopes rs join public.brand01_campaign_product_skus cps
        on cps.campaign_id=rs.campaign_id and cps.sku_id=new.sku_id
        join public.campaigns c on c.id=cps.campaign_id and c.deleted_at is null and c.archived_at is null
        join public.brand01_product_skus s on s.id=cps.sku_id
        join public.brand01_product_brands pb on pb.product_id=s.product_id and pb.brand_id=c.brand_id and pb.is_active
        where rs.resource_id=new.resource_id) then
      raise exception using errcode='23514', message='BRAND01_RESOURCE_CAMPAIGN_SCOPE_MISMATCH';
    end if;
  else
    select c.brand_id into target_brand from public.campaigns c where c.id=new.campaign_id and c.deleted_at is null and c.archived_at is null;
    if target_brand is null then raise exception using errcode='23514', message='BRAND01_RESOURCE_CAMPAIGN_NOT_FOUND'; end if;
    if exists(select 1 from public.storage_resource_scopes rs where rs.resource_id=new.resource_id and rs.brand_id is not null and rs.brand_id<>target_brand)
      or exists(select 1 from public.storage_resource_scopes rs where rs.resource_id=new.resource_id and rs.campaign_id is not null and rs.campaign_id<>new.campaign_id) then
      raise exception using errcode='23514', message='BRAND01_RESOURCE_SCOPE_MISMATCH';
    end if;
  end if;
  return new;
end $$;

create or replace function private.brand01_scheme_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not private.current_business_user_is_active() or not private.is_admin() then raise exception using errcode='42501', message='BRAND01_ADMIN_REQUIRED'; end if;
  if new.sku_id is not null and not exists(select 1 from public.brand01_campaign_product_skus cps where cps.campaign_id=new.campaign_id and cps.sku_id=new.sku_id) then
    raise exception using errcode='23514', message='BRAND01_SCHEME_SKU_NOT_IN_CAMPAIGN';
  end if;
  if tg_op='UPDATE' and (new.created_by is distinct from old.created_by or new.owner_id is distinct from old.owner_id or new.campaign_id is distinct from old.campaign_id or new.id is distinct from old.id) then
    raise exception using errcode='55000', message='BRAND01_SCHEME_IDENTITY_IMMUTABLE';
  end if;
  if new.status='approved' and (new.reviewed_by is distinct from private.current_business_user_id()
    or new.reviewed_by=new.created_by or (new.source_resource_id is null and nullif(btrim(new.source_url),'') is null)
    or new.reviewed_at is null) then
    raise exception using errcode='42501', message='BRAND01_SCHEME_APPROVAL_INVALID';
  end if;
  if new.source_resource_id is not null and not exists(select 1 from public.storage_resources r where r.id=new.source_resource_id and r.is_active and r.resource_type<>'attendance_evidence') then
    raise exception using errcode='23514', message='BRAND01_SOURCE_RESOURCE_UNAVAILABLE';
  end if;
  return new;
end $$;

drop policy if exists brand01_knowledge_read on public.brand01_product_knowledge_versions;
create policy brand01_knowledge_read on public.brand01_product_knowledge_versions for select to authenticated using (
  private.current_business_user_is_active() and (
    private.is_admin() or private.brand01_has_current_knowledge_approval(id)
  )
);

create policy brand01_access_own_read on public.brand01_user_brand_access for select to authenticated using (
  private.current_business_user_is_active() and user_id=private.current_business_user_id()
  and revoked_at is null and (expires_at is null or expires_at>statement_timestamp())
);

drop trigger if exists brand01_access_guard on public.brand01_user_brand_access;
create trigger brand01_access_guard before insert or update or delete on public.brand01_user_brand_access for each row execute function private.brand01_user_brand_access_guard();
create trigger brand01_access_audit after insert or update on public.brand01_user_brand_access for each row execute function private.brand01_catalog_audit();
create trigger brand01_product_brands_audit after insert or update on public.brand01_product_brands for each row execute function private.brand01_catalog_audit();
create trigger brand01_platform_skus_audit after insert or update on public.brand01_product_platform_skus for each row execute function private.brand01_catalog_audit();
create trigger brand01_campaign_skus_audit after insert or update on public.brand01_campaign_product_skus for each row execute function private.brand01_catalog_audit();

revoke all on function private.brand01_user_brand_access_guard() from public, anon, authenticated;
revoke all on function private.brand01_has_current_knowledge_approval(text) from public, anon;
grant execute on function private.brand01_has_current_knowledge_approval(text) to authenticated;
revoke all on function public.brand01_admin_update_product(text,integer,text,text,text,text,text,text[]) from public, anon;
grant execute on function public.brand01_admin_update_product(text,integer,text,text,text,text,text,text[]) to authenticated;
revoke all on function public.brand01_admin_set_brand_access(text,text,boolean,timestamptz) from public, anon;
grant execute on function public.brand01_admin_set_brand_access(text,text,boolean,timestamptz) to authenticated;
create or replace function public.brand01_knowledge_approval_status(p_version_ids text[])
returns table(knowledge_version_id text, decision text, reviewed_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select k.id, r.decision, r.created_at
  from public.brand01_product_knowledge_versions k
  join lateral (
    select review.decision, review.created_at
    from public.brand01_knowledge_reviews review
    where review.knowledge_version_id=k.id
    order by review.created_at desc, review.id desc limit 1
  ) r on true
  where k.id=any(coalesce(p_version_ids, '{}'::text[]))
    and private.current_business_user_is_active()
    and (private.is_admin() or (r.decision='approved' and k.effective_from<=current_date
      and (k.effective_to is null or k.effective_to>=current_date)
      and exists(select 1 from public.brand01_product_brands pb where pb.product_id=k.product_id and pb.is_active and private.brand01_can_read_brand(pb.brand_id))))
$$;

create or replace function public.brand01_admin_review_campaign_scheme(p_scheme_id text, p_decision text)
returns public.brand01_campaign_schemes language plpgsql security invoker set search_path = '' as $$
declare actor text; scheme public.brand01_campaign_schemes;
begin
  actor:=private.current_business_user_id();
  if not private.current_business_user_is_active() or not private.is_admin() then raise exception using errcode='42501', message='BRAND01_ADMIN_REQUIRED'; end if;
  if p_decision not in ('approved','rejected') then raise exception using errcode='22023', message='BRAND01_SCHEME_DECISION_INVALID'; end if;
  select * into scheme from public.brand01_campaign_schemes where id=p_scheme_id for update;
  if not found then raise exception using errcode='P0002', message='BRAND01_SCHEME_NOT_FOUND'; end if;
  if scheme.created_by=actor then raise exception using errcode='42501', message='BRAND01_INDEPENDENT_REVIEW_REQUIRED'; end if;
  update public.brand01_campaign_schemes set status=p_decision,reviewed_by=actor,reviewed_at=statement_timestamp(),
    updated_by=actor,updated_at=statement_timestamp(),version=version+1 where id=p_scheme_id returning * into scheme;
  return scheme;
end $$;

create or replace function private.brand01_scheme_guard()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if not private.current_business_user_is_active() or not private.is_admin() then raise exception using errcode='42501', message='BRAND01_ADMIN_REQUIRED'; end if;
  if tg_op='UPDATE' and (new.created_by is distinct from old.created_by or new.owner_id is distinct from old.owner_id or new.campaign_id is distinct from old.campaign_id or new.id is distinct from old.id) then
    raise exception using errcode='55000', message='BRAND01_SCHEME_IDENTITY_IMMUTABLE';
  end if;
  if new.sku_id is not null and not exists(select 1 from public.brand01_campaign_product_skus cps where cps.campaign_id=new.campaign_id and cps.sku_id=new.sku_id) then
    raise exception using errcode='23514', message='BRAND01_SCHEME_SKU_NOT_IN_CAMPAIGN';
  end if;
  if new.status in ('approved','rejected') and (new.reviewed_by is distinct from private.current_business_user_id()
    or new.reviewed_by=new.created_by or new.reviewed_at is null) then
    raise exception using errcode='42501', message='BRAND01_SCHEME_APPROVAL_INVALID';
  end if;
  if new.status='approved' and (new.source_resource_id is null and nullif(btrim(new.source_url),'') is null) then
    raise exception using errcode='23514', message='BRAND01_SOURCE_REQUIRED';
  end if;
  if new.source_resource_id is not null and not exists(select 1 from public.storage_resources r where r.id=new.source_resource_id and r.is_active and r.resource_type<>'attendance_evidence') then
    raise exception using errcode='23514', message='BRAND01_SOURCE_RESOURCE_UNAVAILABLE';
  end if;
  return new;
end $$;

drop policy if exists brand01_user_brand_access_admin_update on public.brand01_user_brand_access;
create policy brand01_user_brand_access_admin_update on public.brand01_user_brand_access for update to authenticated using (private.is_admin()) with check (
  private.is_admin() and revoked_by=private.current_business_user_id()
);
revoke all on function public.brand01_knowledge_approval_status(text[]) from public, anon;
grant execute on function public.brand01_knowledge_approval_status(text[]) to authenticated;
revoke all on function public.brand01_admin_review_campaign_scheme(text,text) from public, anon;
grant execute on function public.brand01_admin_review_campaign_scheme(text,text) to authenticated;

create or replace function public.brand01_admin_create_sku(
  p_product_id text, p_sku_code text, p_variant_name text, p_size_or_package text,
  p_packaging_type text, p_platform_mappings jsonb
)
returns public.brand01_product_skus language plpgsql security invoker set search_path = '' as $$
declare actor text; created public.brand01_product_skus; mapping jsonb;
begin
  actor:=private.current_business_user_id();
  if not private.current_business_user_is_active() or not private.is_admin() then raise exception using errcode='42501', message='BRAND01_ADMIN_REQUIRED'; end if;
  if nullif(btrim(p_sku_code),'') is null or nullif(btrim(p_variant_name),'') is null
    or p_product_id is null or (p_platform_mappings is not null and jsonb_typeof(p_platform_mappings)<>'array') then
    raise exception using errcode='22023', message='BRAND01_SKU_INPUT_INVALID';
  end if;
  if not exists(select 1 from public.brand01_products p where p.id=p_product_id and p.lifecycle_status<>'archived' and p.archived_at is null) then
    raise exception using errcode='P0002', message='BRAND01_PRODUCT_NOT_FOUND';
  end if;
  if exists (
    select 1 from jsonb_array_elements(coalesce(p_platform_mappings,'[]'::jsonb)) e
    where nullif(btrim(e->>'platform_id'),'') is null or nullif(btrim(e->>'external_sku_id'),'') is null
      or not exists(select 1 from public.platforms p where p.id=e->>'platform_id' and p.status='active' and p.archived_at is null and p.deleted_at is null)
  ) then raise exception using errcode='23503', message='BRAND01_PLATFORM_MAPPING_INVALID'; end if;
  if (select count(*) from jsonb_array_elements(coalesce(p_platform_mappings,'[]'::jsonb)))
    <> (select count(distinct e->>'platform_id') from jsonb_array_elements(coalesce(p_platform_mappings,'[]'::jsonb)) e) then
    raise exception using errcode='22023', message='BRAND01_PLATFORM_MAPPING_DUPLICATE';
  end if;
  insert into public.brand01_product_skus(product_id,sku_code,variant_name,size_or_package,packaging_type,owner_id,created_by,updated_by)
    values(p_product_id,btrim(p_sku_code),btrim(p_variant_name),nullif(btrim(p_size_or_package),''),nullif(btrim(p_packaging_type),''),actor,actor,actor)
    returning * into created;
  for mapping in select value from jsonb_array_elements(coalesce(p_platform_mappings,'[]'::jsonb)) loop
    insert into public.brand01_product_platform_skus(sku_id,platform_id,external_sku_id,created_by)
      values(created.id,mapping->>'platform_id',btrim(mapping->>'external_sku_id'),actor);
  end loop;
  return created;
end $$;

create or replace function public.brand01_admin_set_sku_platform(
  p_sku_id text, p_platform_id text, p_external_sku_id text
)
returns public.brand01_product_platform_skus language plpgsql security invoker set search_path = '' as $$
declare actor text; result public.brand01_product_platform_skus;
begin
  actor:=private.current_business_user_id();
  if not private.current_business_user_is_active() or not private.is_admin() then raise exception using errcode='42501', message='BRAND01_ADMIN_REQUIRED'; end if;
  if nullif(btrim(p_external_sku_id),'') is null then raise exception using errcode='22023', message='BRAND01_PLATFORM_SKU_INVALID'; end if;
  if not exists(select 1 from public.brand01_product_skus where id=p_sku_id) then raise exception using errcode='P0002', message='BRAND01_SKU_NOT_FOUND'; end if;
  if not exists(select 1 from public.platforms where id=p_platform_id and status='active' and archived_at is null and deleted_at is null) then raise exception using errcode='P0002', message='BRAND01_PLATFORM_NOT_FOUND'; end if;
  insert into public.brand01_product_platform_skus(sku_id,platform_id,external_sku_id,created_by)
    values(p_sku_id,p_platform_id,btrim(p_external_sku_id),actor)
    on conflict(sku_id,platform_id) do update set external_sku_id=excluded.external_sku_id
    returning * into result;
  return result;
end $$;

revoke all on function public.brand01_admin_create_sku(text,text,text,text,text,jsonb) from public, anon;
grant execute on function public.brand01_admin_create_sku(text,text,text,text,text,jsonb) to authenticated;
revoke all on function public.brand01_admin_set_sku_platform(text,text,text) from public, anon;
grant execute on function public.brand01_admin_set_sku_platform(text,text,text) to authenticated;

create policy brand01_platform_skus_admin_update on public.brand01_product_platform_skus for update to authenticated using (private.is_admin()) with check (private.is_admin());

create trigger brand01_resource_links_audit after insert on public.brand01_product_resource_links
for each row execute function private.brand01_catalog_audit();

create or replace function public.brand01_admin_create_knowledge_version(
  p_product_id text, p_sku_id text, p_knowledge_type text, p_content jsonb,
  p_source_resource_id text, p_source_url text, p_source_reference text,
  p_effective_from date, p_effective_to date
)
returns public.brand01_product_knowledge_versions
language plpgsql security invoker set search_path = '' as $$
declare actor text; parent_product public.brand01_products; next_version integer; created public.brand01_product_knowledge_versions;
begin
  actor := private.current_business_user_id();
  if not private.current_business_user_is_active() or not private.is_admin() then
    raise exception using errcode='42501', message='BRAND01_ADMIN_REQUIRED';
  end if;
  select * into parent_product from public.brand01_products p where p.id=p_product_id and p.archived_at is null for update;
  if not found then raise exception using errcode='P0002', message='BRAND01_PRODUCT_NOT_FOUND'; end if;
  if p_sku_id is not null and not exists(select 1 from public.brand01_product_skus s where s.id=p_sku_id and s.product_id=p_product_id and s.lifecycle_status<>'archived') then
    raise exception using errcode='23514', message='BRAND01_KNOWLEDGE_SKU_PRODUCT_MISMATCH';
  end if;
  select coalesce(max(k.version),0)+1 into next_version from public.brand01_product_knowledge_versions k
    where k.product_id=p_product_id and k.knowledge_type=p_knowledge_type;
  insert into public.brand01_product_knowledge_versions(
    product_id,sku_id,knowledge_type,content,version,status,source_resource_id,source_url,
    source_reference,effective_from,effective_to,owner_id,created_by
  ) values (
    p_product_id,p_sku_id,p_knowledge_type,p_content,next_version,'pending_review',p_source_resource_id,
    nullif(btrim(p_source_url),''),nullif(btrim(p_source_reference),''),p_effective_from,p_effective_to,actor,actor
  ) returning * into created;
  return created;
end $$;

revoke all on function public.brand01_admin_create_knowledge_version(text,text,text,jsonb,text,text,text,date,date) from public, anon;
grant execute on function public.brand01_admin_create_knowledge_version(text,text,text,jsonb,text,text,text,date,date) to authenticated;
