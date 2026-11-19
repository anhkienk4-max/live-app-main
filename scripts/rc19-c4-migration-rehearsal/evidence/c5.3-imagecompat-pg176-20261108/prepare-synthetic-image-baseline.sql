\set ON_ERROR_STOP on
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
DO $guard$
BEGIN
  IF EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'live-dashboard-images') THEN
    RAISE EXCEPTION 'REFUSED_SYNTHETIC_BUCKET_ALREADY_EXISTS';
  END IF;
  IF EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = 'live-dashboard-images') THEN
    RAISE EXCEPTION 'REFUSED_SYNTHETIC_OBJECTS_ALREADY_EXIST';
  END IF;
END
$guard$;
INSERT INTO storage.buckets (id, name, public)
VALUES ('live-dashboard-images', 'live-dashboard-images', true);
INSERT INTO storage.objects (id, bucket_id, name, metadata)
VALUES ('c5530000-0000-4000-8000-000000000001', 'live-dashboard-images',
        'synthetic/compatibility-probe.txt', '{"test_only":true,"bytes_not_present":true}'::jsonb);
SELECT current_database() AS database_name,
       shobj_description(oid, 'pg_database') AS marker,
       current_setting('server_version') AS server_version
FROM pg_database WHERE datname = current_database();
SELECT id, public FROM storage.buckets WHERE id = 'live-dashboard-images';
SELECT count(*) AS synthetic_metadata_rows FROM storage.objects
WHERE bucket_id = 'live-dashboard-images' AND name = 'synthetic/compatibility-probe.txt';
