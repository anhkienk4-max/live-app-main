-- Read-only release preflight for the STO-02 proposal. Review the manifest first.
do $sto02_preflight$
declare
  required_relation text;
  missing text := '';
  applied boolean := false;
begin
  foreach required_relation in array array[
    'public.business_users', 'public.brands', 'public.campaigns', 'public.platforms',
    'public.shifts', 'public.operational_storage_routes'
  ] loop
    if to_regclass(required_relation) is null then
      missing := concat_ws(', ', nullif(missing, ''), required_relation);
    end if;
  end loop;
  if missing <> '' then
    raise exception using errcode = '55000', message = 'STO02_PREFLIGHT_MISSING_DEPENDENCY: ' || missing;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'operational_storage_routes' and column_name = 'id'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'operational_storage_routes' and column_name = 'root_folder_id'
  ) then
    raise exception using errcode = '55000', message = 'STO02_PREFLIGHT_STORAGE_ROUTE_CONTRACT_MISMATCH';
  end if;

  if to_regprocedure('private.current_business_user_id()') is null
    or to_regprocedure('private.current_business_user_is_active()') is null
    or to_regprocedure('private.is_admin()') is null then
    raise exception using errcode = '55000', message = 'STO02_PREFLIGHT_AUTHORIZATION_HELPER_MISSING';
  end if;

  if to_regclass('public.storage_resources') is not null
    or to_regclass('public.storage_resource_scopes') is not null
    or to_regclass('public.storage_resource_user_grants') is not null
    or to_regclass('public.storage_resource_audit_events') is not null then
    raise exception using errcode = '55000', message = 'STO02_PREFLIGHT_REGISTRY_OBJECT_COLLISION';
  end if;

  if to_regclass('supabase_migrations.schema_migrations') is not null then
    execute 'select exists (select 1 from supabase_migrations.schema_migrations where version = $1)'
      into applied using '20261027150000';
  end if;
  if applied then
    raise exception using errcode = '55000', message = 'STO02_PREFLIGHT_PROPOSAL_ALREADY_RECORDED_AS_APPLIED';
  end if;

  raise notice 'STO02_PREFLIGHT_PASS: dependencies present; proposal unapplied; operational_storage_routes untouched';
end;
$sto02_preflight$;
