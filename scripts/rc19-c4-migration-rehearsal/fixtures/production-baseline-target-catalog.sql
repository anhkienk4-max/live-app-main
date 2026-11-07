WITH targets(name) AS (
  SELECT unnest(ARRAY[
    'business_users', 'operational_schedule_source_files', 'operational_storage_domain_folders',
    'operational_storage_drive_probe_rate_limits', 'operational_storage_drive_probe_runs',
    'operational_storage_routes', 'rc19_leader_brand_scope_events', 'rc19_leader_brand_scopes',
    'rc19_report_artifact_deletion_events', 'rc19_report_artifact_deletions',
    'rc19_report_export_audit', 'report_images', 'report_revisions', 'reports', 'shifts',
    'storage_resource_audit_events', 'storage_resource_scopes',
    'storage_resource_user_grants', 'storage_resources'
  ])
),
constraint_targets(name) AS (
  SELECT unnest(ARRAY[
    'storage_resources', 'storage_resource_scopes', 'storage_resource_user_grants',
    'operational_storage_routes', 'shifts',
    'reports', 'report_revisions', 'report_images'
  ])
),
index_targets(name) AS (
  SELECT unnest(ARRAY[
    'storage_resources', 'operational_storage_routes', 'shifts',
    'reports', 'report_revisions', 'report_images'
  ])
),
policy_targets(name) AS (
  SELECT unnest(ARRAY[
    'storage_resources', 'storage_resource_scopes', 'storage_resource_user_grants',
    'storage_resource_audit_events', 'operational_storage_routes', 'shifts',
    'reports', 'report_revisions', 'report_images'
  ])
),
relations AS (
  SELECT json_agg(json_build_object(
    'name', 'public.' || c.relname,
    'exists', true,
    'rls', c.relrowsecurity,
    'force_rls', c.relforcerowsecurity
  ) ORDER BY c.relname) AS value
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname='public' AND c.relkind IN ('r','p')
    AND c.relname IN (SELECT name FROM targets)
),
constraints AS (
  SELECT json_agg(json_build_object(
    'name', co.conname,
    'type', co.contype,
    'table', cl.relname,
    'definition', pg_get_constraintdef(co.oid)
  ) ORDER BY cl.relname, co.conname) AS value
  FROM pg_constraint co JOIN pg_class cl ON cl.oid=co.conrelid
  JOIN pg_namespace n ON n.oid=cl.relnamespace
  WHERE n.nspname='public' AND cl.relname IN (SELECT name FROM constraint_targets)
),
indexes AS (
  SELECT json_agg(json_build_object(
    'index', indexname,
    'table', 'public.' || tablename,
    'definition', indexdef
  ) ORDER BY tablename, indexname) AS value
  FROM pg_indexes WHERE schemaname='public' AND tablename IN (SELECT name FROM index_targets)
),
policies AS (
  SELECT json_agg(json_build_object(
    'check', with_check,
    'roles', roles,
    'table', schemaname || '.' || tablename,
    'using', qual,
    'policy', policyname,
    'command', cmd
  ) ORDER BY tablename, policyname) AS value
  FROM pg_policies WHERE schemaname='public' AND tablename IN (SELECT name FROM policy_targets)
),
grants AS (
  SELECT json_agg(json_build_object(
    'table', 'public.' || table_name,
    'grantee', grantee,
    'privilege', privilege_type
  ) ORDER BY table_name, grantee, privilege_type) AS value
  FROM information_schema.role_table_grants
  WHERE table_schema='public' AND table_name IN (SELECT name FROM policy_targets)
    AND grantee IN ('anon','authenticated','service_role')
),
storage_functions AS (
  SELECT json_agg(json_build_object(
    'acl', p.proacl::text,
    'owner', pg_get_userbyid(p.proowner),
    'signature', 'public.' || p.proname || '(' || pg_get_function_arguments(p.oid) || ')',
    'search_path', p.proconfig,
    'security_definer', p.prosecdef
  ) ORDER BY p.proname, p.proargtypes::text) AS value
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public'
    AND p.proname IN ('storage_resource_registry_create','storage_resource_registry_set_grant')
)
SELECT json_build_object(
  'relations', coalesce((SELECT value FROM relations), '[]'::json),
  'constraints', coalesce((SELECT value FROM constraints), '[]'::json),
  'indexes', coalesce((SELECT value FROM indexes), '[]'::json),
  'policies', coalesce((SELECT value FROM policies), '[]'::json),
  'grants', coalesce((SELECT value FROM grants), '[]'::json),
  'functions', coalesce((SELECT value FROM storage_functions), '[]'::json)
)::text;
