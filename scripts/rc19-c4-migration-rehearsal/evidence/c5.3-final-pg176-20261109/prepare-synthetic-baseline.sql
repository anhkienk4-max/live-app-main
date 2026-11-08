\set ON_ERROR_STOP on
SET ROLE postgres;
DO $guard$
DECLARE marker text;
BEGIN
  SELECT shobj_description(oid, 'pg_database') INTO marker
    FROM pg_database WHERE datname = current_database();
  IF current_database() <> 'rc19_c5_3_final8_20261109'
     OR marker IS DISTINCT FROM 'CODEX_DISPOSABLE_RC19_C5_3_BASELINE_ONLY' THEN
    RAISE EXCEPTION 'REFUSED_NON_DISPOSABLE_C5_3_BASELINE:%', current_database();
  END IF;
  IF EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'live-dashboard-images')
     OR EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'live-dashboard-images') THEN
    RAISE EXCEPTION 'REFUSED_SYNTHETIC_IMAGE_BASELINE_ALREADY_PRESENT';
  END IF;
  IF EXISTS (SELECT 1 FROM public.system_settings) THEN
    RAISE EXCEPTION 'REFUSED_SYNTHETIC_OPERATIONAL_SETTINGS_ALREADY_PRESENT';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='supabase_admin' AND rolsuper AND NOT rolcanlogin)
     OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='supabase_storage_admin' AND NOT rolsuper AND NOT rolcanlogin)
     OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='dashboard_user' AND NOT rolcanlogin)
     OR (SELECT nspowner FROM pg_namespace WHERE nspname='storage') <> 'postgres'::regrole
     OR EXISTS (
       SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
       WHERE n.nspname='storage' AND c.relname IN ('objects','buckets')
         AND c.relowner <> 'postgres'::regrole
     ) THEN
    RAISE EXCEPTION 'REFUSED_UNEXPECTED_STORAGE_OWNER_BASELINE';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname = 'storage' AND tablename = 'objects'
       AND policyname = 'live dashboard image public read'
       AND cmd = 'SELECT' AND roles @> ARRAY['public']::name[]
  ) THEN
    RAISE EXCEPTION 'REFUSED_LEGACY_PUBLIC_READ_POLICY_MISSING';
  END IF;
END
$guard$;

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- Restore Supabase Storage API grants omitted by the schema-only --no-privileges dump.
ALTER SCHEMA public OWNER TO pg_database_owner;
REVOKE ALL ON SCHEMA public FROM PUBLIC, anon, authenticated, service_role, supabase_auth_admin, postgres;
REVOKE ALL ON SCHEMA public FROM pg_database_owner;
GRANT USAGE ON SCHEMA public TO PUBLIC, anon, authenticated, service_role, supabase_auth_admin, postgres;
GRANT CREATE, USAGE ON SCHEMA public TO pg_database_owner;
REVOKE ALL ON SCHEMA storage FROM PUBLIC, anon, authenticated, service_role,
  postgres, supabase_storage_admin, dashboard_user;
ALTER SCHEMA storage OWNER TO supabase_admin;
GRANT CREATE, USAGE ON SCHEMA storage TO supabase_admin;
GRANT CREATE, USAGE ON SCHEMA storage TO supabase_storage_admin WITH GRANT OPTION;
GRANT CREATE, USAGE ON SCHEMA storage TO dashboard_user;
GRANT USAGE ON SCHEMA storage TO postgres WITH GRANT OPTION;
GRANT USAGE ON SCHEMA storage TO anon, authenticated, service_role;
ALTER TABLE storage.objects OWNER TO supabase_storage_admin;
ALTER TABLE storage.buckets OWNER TO supabase_storage_admin;
ALTER TABLE storage.buckets ENABLE ROW LEVEL SECURITY;
ALTER TABLE storage.buckets NO FORCE ROW LEVEL SECURITY;
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
ALTER TABLE storage.objects NO FORCE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE storage.objects, storage.buckets FROM PUBLIC, anon, authenticated, service_role;
GRANT DELETE, INSERT, SELECT, UPDATE ON storage.objects, storage.buckets TO anon, authenticated;
GRANT DELETE, INSERT, MAINTAIN, REFERENCES, SELECT, TRIGGER, TRUNCATE, UPDATE
  ON storage.objects, storage.buckets TO service_role;

INSERT INTO public.system_settings DEFAULT VALUES;
INSERT INTO storage.buckets (id, name, public)
VALUES ('live-dashboard-images', 'live-dashboard-images', true);
INSERT INTO storage.objects (id, bucket_id, name, metadata)
VALUES ('c5530000-0000-4000-8000-000000000001', 'live-dashboard-images',
        'synthetic/compatibility-probe.txt', '{"test_only":true,"bytes_not_present":true}'::jsonb);

DO $verify_grants$
BEGIN
  IF NOT has_schema_privilege('anon', 'storage', 'USAGE')
     OR NOT has_table_privilege('anon', 'storage.objects', 'SELECT') THEN
    RAISE EXCEPTION 'C5_3_ANON_STORAGE_READ_GRANT_MISSING';
  END IF;
  IF NOT has_table_privilege('authenticated', 'storage.objects', 'SELECT')
     OR NOT has_table_privilege('service_role', 'storage.objects', 'SELECT')
     OR NOT has_schema_privilege('anon', 'public', 'USAGE')
     OR NOT has_schema_privilege('authenticated', 'public', 'USAGE')
     OR NOT has_schema_privilege('service_role', 'public', 'USAGE') THEN
    RAISE EXCEPTION 'C5_3_STORAGE_API_GRANTS_MISSING';
  END IF;
END
$verify_grants$;

DO $verify_settings$
BEGIN
  IF (SELECT count(*) FROM public.system_settings) <> 1
     OR NOT EXISTS (
       SELECT 1 FROM public.system_settings
        WHERE registration_cutoff_hours = 6
          AND require_registration_approval
          AND auto_lock_filled_shifts
          AND NOT allow_multi_role_per_shift
          AND default_host_count = 1
          AND default_support_count = 1
          AND default_technical_count = 1
     ) THEN
    RAISE EXCEPTION 'C5_3_SYNTHETIC_OPERATIONAL_SETTINGS_INVALID';
  END IF;
END
$verify_settings$;

DO $verify_schema_acl$
DECLARE actual text[]; storage_api_acl text[];
BEGIN
  IF (SELECT nspowner FROM pg_namespace WHERE nspname='public') <> 'pg_database_owner'::regrole THEN
    RAISE EXCEPTION 'C5_3_PUBLIC_SCHEMA_OWNER_MISMATCH';
  END IF;
  SELECT coalesce(array_agg(
           (CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE a.grantee::regrole::text END || ':' ||
             a.privilege_type || ':grantable=' || a.is_grantable) ORDER BY
             (CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE a.grantee::regrole::text END || ':' ||
             a.privilege_type || ':grantable=' || a.is_grantable) COLLATE "C"), ARRAY[]::text[])
    INTO actual
    FROM pg_namespace n
    CROSS JOIN LATERAL aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a
   WHERE n.nspname='public';
  IF actual IS DISTINCT FROM ARRAY[
    'PUBLIC:USAGE:grantable=false',
    'anon:USAGE:grantable=false',
    'authenticated:USAGE:grantable=false',
    'pg_database_owner:CREATE:grantable=false',
    'pg_database_owner:USAGE:grantable=false',
    'postgres:USAGE:grantable=false',
    'service_role:USAGE:grantable=false',
    'supabase_auth_admin:USAGE:grantable=false'
  ]::text[] THEN
    RAISE EXCEPTION 'C5_3_PUBLIC_SCHEMA_ACL_MISMATCH:%', actual;
  END IF;
  SELECT coalesce(array_agg(
           (a.grantee::regrole::text || ':' || a.privilege_type || ':grantable=' || a.is_grantable)
           ORDER BY (a.grantee::regrole::text || ':' || a.privilege_type || ':grantable=' || a.is_grantable) COLLATE "C"), ARRAY[]::text[])
    INTO storage_api_acl
    FROM pg_namespace n
    CROSS JOIN LATERAL aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a
   WHERE n.nspname='storage' AND a.grantee IN ('anon'::regrole,'authenticated'::regrole,'service_role'::regrole);
  IF storage_api_acl IS DISTINCT FROM ARRAY[
    'anon:USAGE:grantable=false',
    'authenticated:USAGE:grantable=false',
    'service_role:USAGE:grantable=false'
  ]::text[] OR EXISTS (
    SELECT 1 FROM pg_namespace n CROSS JOIN LATERAL aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a
     WHERE n.nspname='storage' AND a.grantee=0
  ) THEN
    RAISE EXCEPTION 'C5_3_STORAGE_SCHEMA_API_ACL_MISMATCH:%', storage_api_acl;
  END IF;
  SELECT coalesce(array_agg(
           (CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE a.grantee::regrole::text END || ':' ||
             a.privilege_type || ':grantable=' || a.is_grantable) ORDER BY
             (CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE a.grantee::regrole::text END || ':' ||
             a.privilege_type || ':grantable=' || a.is_grantable) COLLATE "C"), ARRAY[]::text[])
    INTO actual
    FROM pg_namespace n CROSS JOIN LATERAL aclexplode(coalesce(n.nspacl,acldefault('n',n.nspowner))) a
   WHERE n.nspname='storage';
  IF (SELECT nspowner FROM pg_namespace WHERE nspname='storage') <> 'supabase_admin'::regrole
     OR actual IS DISTINCT FROM ARRAY[
       'anon:USAGE:grantable=false',
       'authenticated:USAGE:grantable=false',
       'dashboard_user:CREATE:grantable=false',
       'dashboard_user:USAGE:grantable=false',
       'postgres:USAGE:grantable=true',
       'service_role:USAGE:grantable=false',
       'supabase_admin:CREATE:grantable=false',
       'supabase_admin:USAGE:grantable=false',
       'supabase_storage_admin:CREATE:grantable=true',
       'supabase_storage_admin:USAGE:grantable=true'
     ]::text[] THEN
    RAISE EXCEPTION 'C5_3_STORAGE_SCHEMA_PRODUCTION_ACL_MISMATCH:%', actual;
  END IF;
END
$verify_schema_acl$;

DO $verify_storage_acl$
DECLARE expected record; actual text[]; has_grant_option boolean; owner_acl text[]; owner_grant_option boolean;
BEGIN
  IF (SELECT relowner::regrole::text FROM pg_class WHERE oid='storage.objects'::regclass) <> 'supabase_storage_admin'
     OR (SELECT relowner::regrole::text FROM pg_class WHERE oid='storage.buckets'::regclass) <> 'supabase_storage_admin'
     OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid='storage.objects'::regclass)
     OR NOT (SELECT relrowsecurity FROM pg_class WHERE oid='storage.buckets'::regclass)
     OR (SELECT relforcerowsecurity FROM pg_class WHERE oid='storage.objects'::regclass)
     OR (SELECT relforcerowsecurity FROM pg_class WHERE oid='storage.buckets'::regclass) THEN
    RAISE EXCEPTION 'C5_3_STORAGE_RELATION_OWNER_OR_RLS_MISMATCH';
  END IF;

  FOR expected IN
    SELECT * FROM (VALUES
      ('storage.objects'), ('storage.buckets')
    ) AS relations(table_name)
  LOOP
    SELECT coalesce(array_agg(a.privilege_type ORDER BY a.privilege_type), ARRAY[]::text[]),
           coalesce(bool_and(a.is_grantable), false)
      INTO owner_acl, owner_grant_option
      FROM pg_class c
      CROSS JOIN LATERAL aclexplode(coalesce(c.relacl, acldefault('r',c.relowner))) a
     WHERE c.oid=to_regclass(expected.table_name)
       AND a.grantee='supabase_storage_admin'::regrole;
    IF owner_acl IS DISTINCT FROM ARRAY['DELETE','INSERT','MAINTAIN','REFERENCES','SELECT','TRIGGER','TRUNCATE','UPDATE']::text[]
       OR NOT owner_grant_option THEN
      RAISE EXCEPTION 'C5_3_STORAGE_OWNER_ACL_MISMATCH:%:%', expected.table_name, owner_acl;
    END IF;
  END LOOP;

  FOR expected IN
    SELECT * FROM (VALUES
      ('storage.objects','anon',ARRAY['DELETE','INSERT','SELECT','UPDATE']::text[]),
      ('storage.objects','authenticated',ARRAY['DELETE','INSERT','SELECT','UPDATE']::text[]),
      ('storage.objects','service_role',ARRAY['DELETE','INSERT','MAINTAIN','REFERENCES','SELECT','TRIGGER','TRUNCATE','UPDATE']::text[]),
      ('storage.buckets','anon',ARRAY['DELETE','INSERT','SELECT','UPDATE']::text[]),
      ('storage.buckets','authenticated',ARRAY['DELETE','INSERT','SELECT','UPDATE']::text[]),
      ('storage.buckets','service_role',ARRAY['DELETE','INSERT','MAINTAIN','REFERENCES','SELECT','TRIGGER','TRUNCATE','UPDATE']::text[])
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
      RAISE EXCEPTION 'C5_3_STORAGE_API_ACL_MISMATCH:%:%:%', expected.table_name, expected.role_name, actual;
    END IF;
  END LOOP;

  IF (SELECT count(*) FROM pg_policies WHERE schemaname='storage' AND tablename IN ('objects','buckets')) <> 10
     OR EXISTS (
       SELECT 1 FROM (VALUES
         ('objects','live dashboard image delete','DELETE',ARRAY['authenticated']::name[],'bdf831e200e32c8ba34f4a4dc5026609','d41d8cd98f00b204e9800998ecf8427e'),
         ('objects','live dashboard image public read','SELECT',ARRAY['public']::name[],'d367915a79988cd2f3363c0e4772d6d5','d41d8cd98f00b204e9800998ecf8427e'),
         ('objects','live dashboard image upload','INSERT',ARRAY['authenticated']::name[],'d41d8cd98f00b204e9800998ecf8427e','e0b6482e2175e1aedb89bf852f389103'),
         ('objects','profile avatars delete own','DELETE',ARRAY['authenticated']::name[],'0caf0695e411ea9921b316a8845b646a','d41d8cd98f00b204e9800998ecf8427e'),
         ('objects','profile avatars public read','SELECT',ARRAY['public']::name[],'ee45d0f75d1b107d3711a211bf6b7710','d41d8cd98f00b204e9800998ecf8427e'),
         ('objects','profile avatars replace own','UPDATE',ARRAY['authenticated']::name[],'0caf0695e411ea9921b316a8845b646a','f8ac0c34364647b391a38496c4868727'),
         ('objects','profile avatars upload own','INSERT',ARRAY['authenticated']::name[],'d41d8cd98f00b204e9800998ecf8427e','4246a7ba55dff9736b01d4e8ba9ca0de'),
         ('objects','report-images-authenticated-read','SELECT',ARRAY['authenticated']::name[],'1adb38ae8ebbbfe869275ca4a12e45d6','d41d8cd98f00b204e9800998ecf8427e'),
         ('objects','report-images-delete','DELETE',ARRAY['authenticated']::name[],'9754b5515667ad77ad1fd7e9e382caae','d41d8cd98f00b204e9800998ecf8427e'),
         ('objects','report-images-upload','INSERT',ARRAY['authenticated']::name[],'d41d8cd98f00b204e9800998ecf8427e','c6459c3eac5707c8df4c60c3439d0ec7')
       ) AS expected(tablename,policyname,cmd,roles,qual_md5,with_check_md5)
       WHERE NOT EXISTS (
         SELECT 1 FROM pg_policies p
         WHERE p.schemaname='storage' AND p.tablename=expected.tablename
           AND p.policyname=expected.policyname AND p.cmd=expected.cmd AND p.roles=expected.roles
           AND md5(coalesce(p.qual,''))=expected.qual_md5
           AND md5(coalesce(p.with_check,''))=expected.with_check_md5
       )
     ) THEN
    RAISE EXCEPTION 'C5_3_STORAGE_POLICY_DEFINITION_MISMATCH';
  END IF;
END
$verify_storage_acl$;

BEGIN;
SET LOCAL ROLE anon;
DO $public_read$
BEGIN
  IF (SELECT count(*) FROM storage.objects
       WHERE bucket_id = 'live-dashboard-images'
         AND name = 'synthetic/compatibility-probe.txt') <> 1 THEN
    RAISE EXCEPTION 'C5_3_ANON_PUBLIC_IMAGE_READ_BASELINE_FAILED';
  END IF;
END
$public_read$;
DO $anon_write_denied$
DECLARE denied boolean := false;
BEGIN
  BEGIN
    INSERT INTO storage.objects (id, bucket_id, name, metadata)
    VALUES ('c5530000-0000-4000-8000-000000000002', 'live-dashboard-images',
            'synthetic/anon-write-denied.txt', '{"test_only":true}'::jsonb);
  EXCEPTION WHEN insufficient_privilege THEN
    denied := true;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'C5_3_ANON_STORAGE_WRITE_UNEXPECTEDLY_ALLOWED';
  END IF;
END
$anon_write_denied$;
ROLLBACK;

SELECT current_database() AS database_name,
       shobj_description(oid, 'pg_database') AS marker,
       current_setting('server_version') AS server_version
  FROM pg_database WHERE datname = current_database();
SELECT id, public FROM storage.buckets WHERE id = 'live-dashboard-images';
SELECT count(*) AS synthetic_metadata_rows FROM storage.objects
 WHERE bucket_id = 'live-dashboard-images'
   AND name = 'synthetic/compatibility-probe.txt';
