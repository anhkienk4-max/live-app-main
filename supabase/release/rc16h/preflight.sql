-- Assertion-only preflight. No DDL/DML. Execute inside the approved step transaction.
-- Connection/project identity must be verified outside SQL; postgres DB name is not identity.
do $preflight$
declare
  expected record;
begin
  if current_setting('server_version_num')::integer / 10000 not in (16,17) then
    raise exception 'RC16H_POSTGRES_VERSION_UNSUPPORTED';
  end if;
  if not exists(select 1 from pg_roles where rolname='service_role' and rolbypassrls)
    or not exists(select 1 from pg_roles where rolname='anon')
    or not exists(select 1 from pg_roles where rolname='authenticated') then
    raise exception 'RC16H_SECURITY_ROLES_MISSING';
  end if;
  if (select count(*) from supabase_migrations.schema_migrations
    where version in ('20261011091925','20261011092015','20261011092051')) <> 3 then
    raise exception 'RC16H_RC15_LEDGER_MISSING';
  end if;
  for expected in select * from (values
    ('public.create_shift(jsonb)','7f813fa9c9c4b25f2ed965ffc9fe872c'),
    ('public.update_shift(text,jsonb,boolean)','052af1089ed967316d385007828e971c'),
    ('public.update_shift(text,jsonb,boolean,integer)','ead3d98c97a4f293a521e1a6bf4aba3c')
  ) as rpc(signature,digest) loop
    if not exists(select 1 from pg_proc where oid=to_regprocedure(expected.signature)
      and md5(pg_get_functiondef(oid))=expected.digest and prosecdef
      and proconfig=array['search_path=""'] and pg_get_userbyid(proowner)='postgres'
      and proacl::text=case when expected.signature='public.update_shift(text,jsonb,boolean)'
        then '{postgres=X/postgres,service_role=X/postgres}'
        else '{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}' end) then
      raise exception 'RC16H_PRODUCTION_RPC_DRIFT';
    end if;
  end loop;
  if (select count(*) from information_schema.columns
    where table_schema='public' and table_name='operational_storage_routes'
      and column_name in ('period_label_overrides','period_date_ranges','folder_label_overrides','approved_by','approved_at')) <> 5
    or not exists(select 1 from pg_index where indexrelid=
      to_regclass('public.operational_storage_routes_active_key_uidx') and indisunique and indnullsnotdistinct)
    or not exists(select 1 from information_schema.columns where table_schema='public'
      and table_name='operational_files' and column_name='provider_metadata' and data_type='jsonb') then
    raise exception 'RC16H_RC15_STORAGE_SCHEMA_INCOMPATIBLE';
  end if;
  if (select count(*) from information_schema.columns where table_schema='public'
    and table_name='business_users' and column_name in ('system_permission','status','account_status','deleted_at'))<>4
    or not exists(select 1 from pg_attribute where attrelid='public.business_users'::regclass
    and attname='id' and atttypid='text'::regtype and not attisdropped)
    or not exists(select 1 from pg_attribute where attrelid='public.shifts'::regclass
      and attname='id' and atttypid='text'::regtype and not attisdropped) then
    raise exception 'RC16H_WORKFORCE_PREREQUISITES_INCOMPATIBLE';
  end if;
end $preflight$;
