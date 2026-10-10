-- RC1.5 Production readiness audit (READ-ONLY).
-- DO NOT apply any migration, seed routes or classify shifts here.
-- Run on the target Supabase project before consolidated physical UAT.

with environment as (
  select
    to_regclass('public.operational_storage_routes') is not null as has_route_table,
    to_regclass('public.operational_files') is not null as has_v2_registry,
    exists(select 1 from information_schema.columns
      where table_schema='public' and table_name='shifts'
        and column_name='execution_source') as has_shift_source,
    exists(select 1 from information_schema.columns
      where table_schema='public' and table_name='brands'
        and column_name='storage_profile') as has_brand_profile,
    exists(select 1 from information_schema.columns
      where table_schema='public' and table_name='operational_files'
        and column_name='integrity_status') as has_integrity,
    exists(select 1 from information_schema.columns
      where table_schema='public' and table_name='operational_storage_routes'
        and column_name='period_label_overrides' and udt_name='jsonb') as has_month_overrides,
    exists(select 1 from information_schema.columns
      where table_schema='public' and table_name='operational_storage_routes'
        and column_name='period_date_ranges' and udt_name='jsonb') as has_period_ranges,
    exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname='create_shift'
        and pg_get_function_arguments(p.oid) like 'p_data jsonb%'
        and position('execution_source' in pg_get_functiondef(p.oid)) > 0
    ) as create_shift_supports_source,
    (select count(*) = 2 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname='update_shift'
        and position('execution_source' in pg_get_functiondef(p.oid)) > 0
    ) as update_shift_supports_source,
    exists(select 1 from supabase_migrations.schema_migrations where version='20261007183831') as rc14_report_data_installed
)
select
  case when has_route_table and has_v2_registry and has_shift_source
    and has_brand_profile and has_integrity and has_month_overrides
    and has_period_ranges and create_shift_supports_source
    and update_shift_supports_source and rc14_report_data_installed
    then 'SCHEMA_READY_REVIEW_ROUTE_DATA'
    else 'BLOCKED_DO_NOT_DEPLOY_STORAGE_V2'
  end as release_state,
  has_route_table, has_v2_registry, has_shift_source, has_brand_profile,
  has_integrity, has_month_overrides, has_period_ranges,
  create_shift_supports_source, update_shift_supports_source,
  rc14_report_data_installed
from environment;

-- Operator follow-up after schema is compatible:
-- (1) verify exact brand/platform/execution_source routes, profiles, root IDs.
-- (2) count unclassified historical shifts; choose explicitly (never infer).
-- (3) complete safe RPC migration review against CURRENT functions.
-- (4) perform provider readback/ACL review before confidential physical UAT.
