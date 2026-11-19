SELECT current_database() AS database_name,
       current_setting('server_version') AS postgresql_version,
       shobj_description(d.oid, 'pg_database') AS database_marker
FROM pg_database d
WHERE d.datname = current_database();

SELECT count(*) AS migration_receipts,
       max(version) AS migration_head,
       bool_and(statements IS NOT NULL) AS every_receipt_has_statements_array
FROM supabase_migrations.schema_migrations;

SELECT extname, extversion, n.nspname AS extension_schema
FROM pg_extension e
JOIN pg_namespace n ON n.oid = e.extnamespace
WHERE extname IN ('pg_cron','pgcrypto')
ORDER BY extname;

SELECT rolname, rolsuper, rolbypassrls
FROM pg_roles
WHERE rolname IN ('postgres','anon','authenticated','service_role')
ORDER BY rolname;

SELECT 'business_users' AS relation, count(*) AS row_count FROM public.business_users
UNION ALL SELECT 'shifts', count(*) FROM public.shifts
UNION ALL SELECT 'reports', count(*) FROM public.reports
UNION ALL SELECT 'storage_resources', count(*) FROM public.storage_resources
UNION ALL SELECT 'storage_resource_audit_events', count(*) FROM public.storage_resource_audit_events
UNION ALL SELECT 'storage.objects', count(*) FROM storage.objects
ORDER BY relation;
