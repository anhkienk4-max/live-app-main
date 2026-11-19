SELECT jsonb_build_object(
  'columns', (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'udt', c.udt_name,
      'type', c.data_type,
      'table', c.table_schema || '.' || c.table_name,
      'column', c.column_name,
      'default', c.column_default,
      'nullable', c.is_nullable,
      'position', c.ordinal_position
    ) ORDER BY c.table_schema, c.table_name, c.ordinal_position), '[]'::jsonb)
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = ANY (ARRAY[
        'operational_storage_routes', 'report_images', 'report_revisions',
        'reports', 'shifts', 'storage_resource_audit_events',
        'storage_resource_scopes', 'storage_resource_user_grants', 'storage_resources'
      ])
  ),
  'routines', (
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'acl', p.proacl::text,
      'owner', pg_get_userbyid(p.proowner),
      'schema', n.nspname,
      'returns', pg_get_function_result(p.oid),
      'language', l.lanname,
      'name', p.proname,
      'argument_types', coalesce((
        SELECT jsonb_agg(format_type(a.arg_type, NULL) ORDER BY a.ordinality)
        FROM unnest(p.proargtypes) WITH ORDINALITY AS a(arg_type, ordinality)
      ), '[]'::jsonb),
      'configuration', p.proconfig,
      'security_definer', p.prosecdef
    ) ORDER BY n.nspname, p.proname, p.proargtypes::text), '[]'::jsonb)
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    JOIN pg_language l ON l.oid = p.prolang
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
  )
)::text;
