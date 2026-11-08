-- Disposable PG17.6 clone of the sanitized 89-receipt schema-only baseline.
DO $guard$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_database WHERE datname = 'rc19_c5_3_final6_20261109') THEN
    RAISE EXCEPTION 'REFUSED_EXISTING_C5_3_TARGET_DATABASE';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_database
     WHERE datname = 'rc19_c4_schema_base_20261107_pg176'
       AND shobj_description(oid, 'pg_database') = 'CODEX_DISPOSABLE_RC19_C4_REHEARSAL_ONLY'
  ) THEN
    RAISE EXCEPTION 'REFUSED_UNVERIFIED_C5_3_SCHEMA_BASELINE';
  END IF;
END
$guard$;

CREATE DATABASE rc19_c5_3_final6_20261109
  WITH TEMPLATE = rc19_c4_schema_base_20261107_pg176
       OWNER = postgres;
COMMENT ON DATABASE rc19_c5_3_final6_20261109
  IS 'CODEX_DISPOSABLE_RC19_C5_3_BASELINE_ONLY';
