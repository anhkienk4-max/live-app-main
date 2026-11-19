-- Future contract migration. Keep outside supabase/migrations until the proxy-capable
-- release is deployed and the supported rollback target is also proxy-capable.
-- Deliberate execution requires session attestations:
--   rc19.dashboard_image_proxy_ready=true
--   rc19.dashboard_image_rollback_target=proxy-capable
BEGIN;

DO $guard$
DECLARE
  v_proxy_ready text := current_setting('rc19.dashboard_image_proxy_ready', true);
  v_rollback_target text := current_setting('rc19.dashboard_image_rollback_target', true);
BEGIN
  IF v_proxy_ready IS DISTINCT FROM 'true'
    OR v_rollback_target IS DISTINCT FROM 'proxy-capable' THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'DASHBOARD_IMAGE_PRIVATE_CONTRACT_NOT_ATTESTED';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM storage.buckets
    WHERE id = 'live-dashboard-images' AND public IS TRUE
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'DASHBOARD_IMAGE_BUCKET_NOT_IN_EXPECTED_EXPAND_STATE';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'live dashboard image scoped read'
      AND cmd = 'SELECT'
      AND qual LIKE '%private.can_read_shift%'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'DASHBOARD_IMAGE_SCOPED_READ_POLICY_MISSING';
  END IF;
END;
$guard$;

UPDATE storage.buckets
SET public = false
WHERE id = 'live-dashboard-images' AND public IS TRUE;

DO $assert$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM storage.buckets
    WHERE id = 'live-dashboard-images' AND public IS FALSE
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'DASHBOARD_IMAGE_PRIVATE_ACTIVATION_FAILED';
  END IF;
END;
$assert$;

DROP POLICY IF EXISTS "live dashboard image public read" ON storage.objects;
COMMIT;
