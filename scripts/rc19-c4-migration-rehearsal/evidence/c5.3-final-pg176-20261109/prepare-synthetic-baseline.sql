\set ON_ERROR_STOP on
SET ROLE postgres;
DO $guard$
DECLARE marker text;
BEGIN
  SELECT shobj_description(oid, 'pg_database') INTO marker
    FROM pg_database WHERE datname = current_database();
  IF current_database() <> 'rc19_c5_3_final4_20261109'
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
GRANT USAGE ON SCHEMA storage TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON storage.objects TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON storage.buckets TO service_role;

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
