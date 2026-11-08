SELECT current_database() AS database_name,
       current_setting('server_version') AS postgresql_version,
       shobj_description(d.oid, 'pg_database') AS database_marker
FROM pg_database d
WHERE d.datname = current_database();

SELECT policyname, roles, cmd, qual, with_check
FROM pg_policies
WHERE schemaname = 'storage'
  AND tablename = 'objects'
  AND policyname ILIKE '%dashboard%'
ORDER BY policyname;

SELECT id, public, file_size_limit
FROM storage.buckets
WHERE id = 'live-dashboard-images';

SELECT extname, extversion, n.nspname AS extension_schema
FROM pg_extension e
JOIN pg_namespace n ON n.oid = e.extnamespace
WHERE extname IN ('pg_cron','pgcrypto')
ORDER BY extname;
