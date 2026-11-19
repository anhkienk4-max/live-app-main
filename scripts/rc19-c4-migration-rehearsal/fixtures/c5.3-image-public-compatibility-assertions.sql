\set ON_ERROR_STOP on
DO $catalog$
DECLARE marker text; bucket_public boolean; policy_sql text;
BEGIN
  SELECT shobj_description(oid,'pg_database') INTO marker FROM pg_database WHERE datname=current_database();
  IF current_user <> 'postgres' OR marker IS DISTINCT FROM 'CODEX_DISPOSABLE_RC19_C5_3_BASELINE_ONLY' THEN
    RAISE EXCEPTION 'C5_3_IMAGE_ASSERTION_REFUSED_DATABASE:%', current_database();
  END IF;
  SELECT public INTO bucket_public FROM storage.buckets WHERE id='live-dashboard-images';
  IF bucket_public IS DISTINCT FROM true THEN RAISE EXCEPTION 'C5_3_LEGACY_IMAGE_BUCKET_NOT_PUBLIC'; END IF;
  SELECT qual INTO policy_sql FROM pg_policies
   WHERE schemaname='storage' AND tablename='objects' AND policyname='live dashboard image public read' AND cmd='SELECT';
  IF policy_sql IS NULL OR policy_sql NOT ILIKE '%live-dashboard-images%' THEN
    RAISE EXCEPTION 'C5_3_LEGACY_PUBLIC_IMAGE_POLICY_MISSING';
  END IF;
  IF (SELECT count(*) FROM storage.objects WHERE bucket_id='live-dashboard-images' AND name='synthetic/compatibility-probe.txt') <> 1 THEN
    RAISE EXCEPTION 'C5_3_SYNTHETIC_IMAGE_METADATA_MISSING';
  END IF;
END
$catalog$;
BEGIN;
SET LOCAL ROLE anon;
DO $anon$
BEGIN
  IF (SELECT count(*) FROM storage.objects WHERE bucket_id='live-dashboard-images' AND name='synthetic/compatibility-probe.txt') <> 1 THEN
    RAISE EXCEPTION 'C5_3_LEGACY_ANON_IMAGE_METADATA_READ_FAILED';
  END IF;
END
$anon$;
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
COMMIT;
SELECT 'C5_3_LEGACY_PUBLIC_IMAGE_POLICY_AND_METADATA_RLS: PASS';
SELECT 'C5_3_PROVIDER_BYTES: NOT TESTED (synthetic metadata row only)';
