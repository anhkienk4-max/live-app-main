-- Disposable PG17.6 clone of the sanitized 89-receipt schema-only baseline.
DO $guard$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_database WHERE datname = 'rc19_c5_3_final8_20261109') THEN
    RAISE EXCEPTION 'REFUSED_EXISTING_C5_3_TARGET_DATABASE';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_database
     WHERE datname = 'rc19_c4_schema_base_20261107_pg176'
       AND shobj_description(oid, 'pg_database') = 'CODEX_DISPOSABLE_RC19_C4_REHEARSAL_ONLY'
  ) THEN
    RAISE EXCEPTION 'REFUSED_UNVERIFIED_C5_3_SCHEMA_BASELINE';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='supabase_admin' AND rolsuper AND NOT rolcanlogin)
     OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='supabase_storage_admin' AND NOT rolsuper AND NOT rolcanlogin)
     OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='dashboard_user' AND NOT rolcanlogin)
     OR NOT EXISTS (
       SELECT 1 FROM pg_auth_members m
       JOIN pg_roles parent ON parent.oid=m.roleid
       JOIN pg_roles child ON child.oid=m.member
       WHERE parent.rolname='supabase_storage_admin' AND child.rolname='authenticator'
     ) THEN
    RAISE EXCEPTION 'REFUSED_MISSING_LOCAL_C5_3_INFRA_ROLE_FIXTURE';
  END IF;
END
$guard$;

CREATE DATABASE rc19_c5_3_final8_20261109
  WITH TEMPLATE = rc19_c4_schema_base_20261107_pg176
       OWNER = postgres;
COMMENT ON DATABASE rc19_c5_3_final8_20261109
  IS 'CODEX_DISPOSABLE_RC19_C5_3_BASELINE_ONLY';
