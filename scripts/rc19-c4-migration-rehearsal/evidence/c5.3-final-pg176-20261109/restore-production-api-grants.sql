\set ON_ERROR_STOP on
SET ROLE postgres;
BEGIN;
DO $guard$
DECLARE marker text;
BEGIN
  SELECT shobj_description(oid, 'pg_database') INTO marker
    FROM pg_database WHERE datname = current_database();
  IF current_database() <> 'rc19_c5_3_final5_20261109'
     OR marker IS DISTINCT FROM 'CODEX_DISPOSABLE_RC19_C5_3_BASELINE_ONLY'
     OR current_user <> 'postgres' THEN
    RAISE EXCEPTION 'REFUSED_NON_DISPOSABLE_C5_3_GRANT_TARGET:%', current_database();
  END IF;
END
$guard$;

-- private-schema ACL matches the read-only Production capture and historical P1B grant.
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated;

-- Exact non-C2 table grants grouped from production-catalog-snapshot.json (2026-11-06).

GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
  ON TABLE public.operational_storage_routes TO service_role;
GRANT SELECT ON TABLE public.report_images, public.report_revisions, public.reports, public.shifts TO authenticated;
GRANT DELETE, INSERT, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
  ON TABLE public.report_images, public.reports, public.shifts TO service_role;
GRANT INSERT, REFERENCES, SELECT, TRIGGER ON TABLE public.report_revisions TO service_role;

DO $verify$
DECLARE expected record; actual text[]; has_grant_option boolean; private_acl text[];
BEGIN
  SELECT coalesce(array_agg(
           (CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE a.grantee::regrole::text END || ':' ||
             a.privilege_type || ':grantable=' || a.is_grantable) ORDER BY
             (CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE a.grantee::regrole::text END || ':' ||
             a.privilege_type || ':grantable=' || a.is_grantable) COLLATE "C"), ARRAY[]::text[])
    INTO private_acl
    FROM pg_namespace n
    CROSS JOIN LATERAL aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a
   WHERE n.nspname='private';
  IF (SELECT nspowner FROM pg_namespace WHERE nspname='private') <> 'postgres'::regrole
     OR private_acl IS DISTINCT FROM ARRAY[
       'authenticated:USAGE:grantable=false',
       'postgres:CREATE:grantable=false',
       'postgres:USAGE:grantable=false'
     ]::text[] THEN
    RAISE EXCEPTION 'C5_3_PRIVATE_SCHEMA_BASELINE_GRANT_MISMATCH';
  END IF;

  FOR expected IN
    SELECT * FROM (VALUES
      ('public.operational_storage_routes','authenticated',ARRAY[]::text[]),
      ('public.operational_storage_routes','service_role',ARRAY['DELETE','INSERT','REFERENCES','SELECT','TRIGGER','TRUNCATE','UPDATE']::text[]),
      ('public.report_images','authenticated',ARRAY['SELECT']::text[]),
      ('public.report_images','service_role',ARRAY['DELETE','INSERT','REFERENCES','SELECT','TRIGGER','TRUNCATE','UPDATE']::text[]),
      ('public.report_revisions','authenticated',ARRAY['SELECT']::text[]),
      ('public.report_revisions','service_role',ARRAY['INSERT','REFERENCES','SELECT','TRIGGER']::text[]),
      ('public.reports','authenticated',ARRAY['SELECT']::text[]),
      ('public.reports','service_role',ARRAY['DELETE','INSERT','REFERENCES','SELECT','TRIGGER','TRUNCATE','UPDATE']::text[]),
      ('public.shifts','authenticated',ARRAY['SELECT']::text[]),
      ('public.shifts','service_role',ARRAY['DELETE','INSERT','REFERENCES','SELECT','TRIGGER','TRUNCATE','UPDATE']::text[])
    ) AS grants(table_name, role_name, expected_privileges)
  LOOP
    SELECT coalesce(array_agg(a.privilege_type ORDER BY a.privilege_type), ARRAY[]::text[]),
           coalesce(bool_or(a.is_grantable), false)
      INTO actual, has_grant_option
      FROM pg_class c
      CROSS JOIN LATERAL aclexplode(coalesce(c.relacl, acldefault('r', c.relowner))) a
     WHERE c.oid = to_regclass(expected.table_name)
       AND a.grantee = expected.role_name::regrole;
    IF actual IS DISTINCT FROM expected.expected_privileges OR has_grant_option THEN
      RAISE EXCEPTION 'C5_3_PRODUCTION_SNAPSHOT_API_GRANTS_MISMATCH:%:%:%',
        expected.table_name, expected.role_name, actual;
    END IF;
  END LOOP;
END
$verify$;
COMMIT;

SELECT 'C5_3_PRODUCTION_SNAPSHOT_API_TABLE_GRANTS: PASS';
