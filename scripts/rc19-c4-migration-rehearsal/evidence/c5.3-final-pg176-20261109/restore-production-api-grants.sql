\set ON_ERROR_STOP on
SET ROLE postgres;
BEGIN;
DO $guard$
DECLARE marker text;
BEGIN
  SELECT shobj_description(oid, 'pg_database') INTO marker
    FROM pg_database WHERE datname = current_database();
  IF current_database() <> 'rc19_c5_3_final9_20261109'
     OR marker IS DISTINCT FROM 'CODEX_DISPOSABLE_RC19_C5_3_BASELINE_ONLY'
     OR current_user <> 'postgres' THEN
    RAISE EXCEPTION 'REFUSED_NON_DISPOSABLE_C5_3_GRANT_TARGET:%', current_database();
  END IF;
END
$guard$;

-- private-schema ACL matches the read-only Production capture and historical P1B grant.
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA private TO authenticated;

-- Exact Production C2 relation ACLs captured by a SELECT-only catalog query (2026-11-08T19:11:21Z).
REVOKE ALL ON TABLE public.storage_resources, public.storage_resource_scopes,
  public.storage_resource_user_grants, public.storage_resource_audit_events
  FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
  ON TABLE public.storage_resources, public.storage_resource_scopes,
  public.storage_resource_user_grants, public.storage_resource_audit_events TO service_role;
GRANT INSERT, SELECT, UPDATE ON TABLE public.storage_resources,
  public.storage_resource_scopes, public.storage_resource_user_grants TO authenticated;
GRANT SELECT ON TABLE public.storage_resource_audit_events TO authenticated;
REVOKE ALL ON TABLE public.brands, public.business_users, public.campaigns,
  public.operational_storage_routes, public.platforms, public.report_images,
  public.report_revisions, public.reports, public.shift_registrations,
  public.shifts, public.system_settings
  FROM PUBLIC, anon, authenticated, service_role;
GRANT INSERT, SELECT, UPDATE ON TABLE public.brands, public.campaigns, public.platforms TO authenticated;
GRANT SELECT ON TABLE public.business_users, public.shift_registrations,
  public.report_images, public.report_revisions, public.reports, public.shifts,
  public.system_settings TO authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
  ON TABLE public.brands, public.business_users, public.campaigns,
  public.operational_storage_routes, public.platforms, public.report_images,
  public.reports, public.shift_registrations, public.shifts, public.system_settings
  TO service_role;
GRANT INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER ON TABLE public.report_revisions TO service_role;

-- pg_dump --no-privileges omits function ACLs; restore the exact Production C2 grants.
REVOKE ALL ON FUNCTION private.guard_storage_resource_scope(),
  private.guard_storage_resource_attendance(), private.audit_storage_resource_change(),
  private.guard_storage_resource_grant(), private.current_user_has_storage_resource_grant(text),
  public.storage_resource_registry_create(jsonb,jsonb),
  public.storage_resource_registry_set_grant(text,text,boolean)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.guard_storage_resource_scope(),
  private.guard_storage_resource_attendance(), private.audit_storage_resource_change(),
  private.guard_storage_resource_grant() TO postgres;
GRANT EXECUTE ON FUNCTION private.current_user_has_storage_resource_grant(text)
  TO postgres, authenticated;
GRANT EXECUTE ON FUNCTION public.storage_resource_registry_create(jsonb,jsonb),
  public.storage_resource_registry_set_grant(text,text,boolean) TO postgres, authenticated, service_role;

DO $verify$
DECLARE expected record; actual text[]; actual_function_acl text; has_grant_option boolean; private_acl text[];
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
      ('public.operational_storage_routes','service_role',ARRAY['DELETE','INSERT','MAINTAIN','REFERENCES','SELECT','TRIGGER','TRUNCATE','UPDATE']::text[]),
      ('public.report_images','authenticated',ARRAY['SELECT']::text[]),
      ('public.report_images','service_role',ARRAY['DELETE','INSERT','MAINTAIN','REFERENCES','SELECT','TRIGGER','TRUNCATE','UPDATE']::text[]),
      ('public.report_revisions','authenticated',ARRAY['SELECT']::text[]),
      ('public.report_revisions','service_role',ARRAY['INSERT','MAINTAIN','REFERENCES','SELECT','TRIGGER']::text[]),
      ('public.reports','authenticated',ARRAY['SELECT']::text[]),
      ('public.reports','service_role',ARRAY['DELETE','INSERT','MAINTAIN','REFERENCES','SELECT','TRIGGER','TRUNCATE','UPDATE']::text[]),
      ('public.shifts','authenticated',ARRAY['SELECT']::text[]),
      ('public.shifts','service_role',ARRAY['DELETE','INSERT','MAINTAIN','REFERENCES','SELECT','TRIGGER','TRUNCATE','UPDATE']::text[]),
      ('public.brands','authenticated',ARRAY['INSERT','SELECT','UPDATE']::text[]),
      ('public.brands','service_role',ARRAY['DELETE','INSERT','MAINTAIN','REFERENCES','SELECT','TRIGGER','TRUNCATE','UPDATE']::text[]),
      ('public.business_users','authenticated',ARRAY['SELECT']::text[]),
      ('public.business_users','service_role',ARRAY['DELETE','INSERT','MAINTAIN','REFERENCES','SELECT','TRIGGER','TRUNCATE','UPDATE']::text[]),
      ('public.campaigns','authenticated',ARRAY['INSERT','SELECT','UPDATE']::text[]),
      ('public.campaigns','service_role',ARRAY['DELETE','INSERT','MAINTAIN','REFERENCES','SELECT','TRIGGER','TRUNCATE','UPDATE']::text[]),
      ('public.platforms','authenticated',ARRAY['INSERT','SELECT','UPDATE']::text[]),
      ('public.platforms','service_role',ARRAY['DELETE','INSERT','MAINTAIN','REFERENCES','SELECT','TRIGGER','TRUNCATE','UPDATE']::text[]),
      ('public.shift_registrations','authenticated',ARRAY['SELECT']::text[]),
      ('public.shift_registrations','service_role',ARRAY['DELETE','INSERT','MAINTAIN','REFERENCES','SELECT','TRIGGER','TRUNCATE','UPDATE']::text[]),
      ('public.system_settings','authenticated',ARRAY['SELECT']::text[]),
      ('public.system_settings','service_role',ARRAY['DELETE','INSERT','MAINTAIN','REFERENCES','SELECT','TRIGGER','TRUNCATE','UPDATE']::text[])
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

  IF EXISTS (
    SELECT 1 FROM pg_class c
    JOIN pg_namespace n ON n.oid=c.relnamespace
    CROSS JOIN LATERAL aclexplode(coalesce(c.relacl, acldefault('r',c.relowner))) a
    WHERE n.nspname='public'
      AND c.relname IN ('brands','business_users','campaigns','operational_storage_routes','platforms','report_images','report_revisions','reports','shift_registrations','shifts','system_settings')
      AND a.grantee IN (0, 'anon'::regrole)
  ) THEN
    RAISE EXCEPTION 'C5_3_UNEXPECTED_PUBLIC_OR_ANON_BUSINESS_TABLE_GRANT';
  END IF;

  IF (SELECT relacl::text FROM pg_class WHERE oid='public.storage_resources'::regclass)
       IS DISTINCT FROM '{postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres,authenticated=arw/postgres}'
     OR (SELECT relacl::text FROM pg_class WHERE oid='public.storage_resource_scopes'::regclass)
       IS DISTINCT FROM '{postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres,authenticated=arw/postgres}'
     OR (SELECT relacl::text FROM pg_class WHERE oid='public.storage_resource_user_grants'::regclass)
       IS DISTINCT FROM '{postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres,authenticated=arw/postgres}'
     OR (SELECT relacl::text FROM pg_class WHERE oid='public.storage_resource_audit_events'::regclass)
       IS DISTINCT FROM '{postgres=arwdDxtm/postgres,service_role=arwdDxtm/postgres,authenticated=r/postgres}' THEN
    RAISE EXCEPTION 'C5_3_PRODUCTION_SNAPSHOT_C2_RELATION_GRANTS_MISMATCH';
  END IF;

  FOR expected IN
    SELECT * FROM (VALUES
      ('private.guard_storage_resource_scope()','{postgres=X/postgres}'),
      ('private.guard_storage_resource_attendance()','{postgres=X/postgres}'),
      ('private.audit_storage_resource_change()','{postgres=X/postgres}'),
      ('private.guard_storage_resource_grant()','{postgres=X/postgres}'),
      ('private.current_user_has_storage_resource_grant(text)','{postgres=X/postgres,authenticated=X/postgres}'),
      ('public.storage_resource_registry_create(jsonb,jsonb)','{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}'),
      ('public.storage_resource_registry_set_grant(text,text,boolean)','{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}')
    ) AS routines(signature, expected_acl)
  LOOP
    SELECT p.proacl::text INTO actual_function_acl
      FROM pg_proc p WHERE p.oid=to_regprocedure(expected.signature);
    IF actual_function_acl IS DISTINCT FROM expected.expected_acl THEN
      RAISE EXCEPTION 'C5_3_PRODUCTION_C2_ROUTINE_ACL_MISMATCH:%:%',
        expected.signature, coalesce(actual_function_acl,'default');
    END IF;
  END LOOP;
END
$verify$;
COMMIT;

SELECT 'C5_3_PRODUCTION_SNAPSHOT_API_TABLE_GRANTS: PASS';
