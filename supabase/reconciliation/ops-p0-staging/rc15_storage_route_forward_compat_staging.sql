-- STAGING ONLY. Reconcile RC13A storage routing shape with RC15 production.
-- Preserve two existing routes and never infer approvals/profile classifications.
-- approved_at remains NULLABLE for legacy routes because RC13A stored no approval
-- provenance. Deliberate deviation vs Production NOT NULL until owner reviews.
set local lock_timeout='3s';
set local statement_timeout='45s';
do $guard$
declare
  brand_constraint text;
  route_constraint text;
begin
  if to_regclass('public.operational_files') is null
    or to_regclass('public.workforce_payroll_lines') is not null
    or (select count(*) from public.operational_storage_routes) <> 2
    or (select count(*) from public.brands) <> 3
  then raise exception 'P0_STORAGE_ROUTE_STAGING_TARGET_GUARD_FAILED'; end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='operational_storage_routes'
      and column_name in ('period_label_overrides','period_date_ranges',
        'folder_label_overrides','approved_by','approved_at')
  ) or exists(
    select 1 from information_schema.columns
    where table_schema='public' and table_name='brands'
      and column_name in ('storage_profile_reviewed_by','storage_profile_reviewed_at')
  ) then raise exception 'P0_STORAGE_ROUTE_ALREADY_UPGRADED'; end if;
  select pg_get_constraintdef(oid,true) into brand_constraint from pg_constraint
  where conrelid='public.brands'::regclass and conname='brands_storage_profile_check';
  select pg_get_constraintdef(oid,true) into route_constraint from pg_constraint
  where conrelid='public.operational_storage_routes'::regclass
    and conname='operational_storage_routes_profile_check';
  if brand_constraint is null or route_constraint is null
    or position('CANONICAL_V1' in brand_constraint)=0
    or position('EXISTING_BRAND_YEAR_PERIOD_PLATFORM' in brand_constraint)>0
    or position('CANONICAL_V1' in route_constraint)=0
    or position('EXISTING_BRAND_YEAR_PERIOD_PLATFORM' in route_constraint)>0
  then raise exception 'P0_STORAGE_PROFILE_CONSTRAINT_DRIFT'; end if;
end;
$guard$;

alter table public.brands
 add column storage_profile_reviewed_by text references public.business_users(id) on delete set null,
 add column storage_profile_reviewed_at timestamptz;
alter table public.brands alter column storage_profile drop default;

alter table public.operational_storage_routes
 add column period_label_overrides jsonb not null default '{}'::jsonb
   check (jsonb_typeof(period_label_overrides)='object'),
 add column period_date_ranges jsonb not null default '[]'::jsonb
   check (jsonb_typeof(period_date_ranges)='array'),
 add column folder_label_overrides jsonb not null default '{}'::jsonb
   check (jsonb_typeof(folder_label_overrides)='object'),
 add column approved_by text references public.business_users(id) on delete set null,
 add column approved_at timestamptz;

-- The two historical routes have no audit trail establishing who approved
-- them: preserve their prior active state and leave approved_at/by NULL.
-- New operator-approved routes may set both fields explicitly.
alter table public.brands
 drop constraint brands_storage_profile_check,
 add constraint brands_storage_profile_check check (
   storage_profile in (
   'LEGACY_CATEGORY_PERIOD','LEGACY_PLATFORM_CATEGORY_PERIOD',
   'LEGACY_PERIOD_CATEGORY','LEGACY_SUBBRAND_PERIOD_CATEGORY',
   'LEGACY_SUBBRAND_CATEGORY_PERIOD','CANONICAL_V1',
   'EXISTING_BRAND_YEAR_PERIOD_PLATFORM'
   )
 );
alter table public.operational_storage_routes
 drop constraint operational_storage_routes_profile_check,
 add constraint operational_storage_routes_storage_profile_check check (
   storage_profile in (
   'LEGACY_CATEGORY_PERIOD','LEGACY_PLATFORM_CATEGORY_PERIOD',
   'LEGACY_PERIOD_CATEGORY','LEGACY_SUBBRAND_PERIOD_CATEGORY',
   'LEGACY_SUBBRAND_CATEGORY_PERIOD','CANONICAL_V1',
   'EXISTING_BRAND_YEAR_PERIOD_PLATFORM'
   )
 );

comment on column public.operational_storage_routes.approved_at is
 'Staging legacy RC13A routes lack approval provenance and retain NULL until operator review; no synthetic approvals.';
