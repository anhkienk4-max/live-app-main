-- OPS P0.2 schema-only fingerprint inventory: READ-ONLY.
-- Execute on Production, a Supabase preview branch, and legacy Staging.
-- App-owned schemas only. This query returns no business rows or secrets.
-- Compare object counts + hashes, then inspect per-object diffs if needed.
-- A matching digest is a prerequisite for credible performance testing, NOT
-- proof that seed data, JWT authorization or environment config is equivalent.
WITH objects AS (
  SELECT 'relations'::text AS category,
         n.nspname || '.' || c.relname AS identifier,
         md5(concat_ws('|', c.relkind::text, c.relrowsecurity::text,
           c.relforcerowsecurity::text, coalesce(c.reloptions::text,''))) AS fingerprint
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname IN ('public','private')
    AND c.relkind IN ('r','p','v','m','f','S')
  UNION ALL
  SELECT 'columns', n.nspname || '.' || c.relname || '.' || a.attname,
         md5(concat_ws('|', a.attnum::text, format_type(a.atttypid,a.atttypmod),
           a.attnotnull::text, a.attidentity::text, a.attgenerated::text,
           coalesce(pg_get_expr(d.adbin,d.adrelid),''),a.attcollation::text))
  FROM pg_attribute a
  JOIN pg_class c ON c.oid=a.attrelid
  JOIN pg_namespace n ON n.oid=c.relnamespace
  LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
  WHERE n.nspname IN ('public','private')
    AND a.attnum>0 AND NOT a.attisdropped AND c.relkind IN ('r','p','v','m','f')
  UNION ALL
  SELECT 'constraints', n.nspname || '.' || c.relname || '.' || co.conname,
         md5(pg_get_constraintdef(co.oid,true))
  FROM pg_constraint co JOIN pg_class c ON c.oid=co.conrelid
  JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname IN ('public','private')
  UNION ALL
  SELECT 'indexes', schemaname || '.' || indexname,
         md5(indexdef)
  FROM pg_indexes WHERE schemaname IN ('public','private')
  UNION ALL
  SELECT 'rls_policies', schemaname || '.' || tablename || '.' || policyname,
         md5(concat_ws('|', permissive, roles::text, cmd, coalesce(qual,''),
                       coalesce(with_check,'')))
  FROM pg_policies WHERE schemaname IN ('public','private')
  UNION ALL
  SELECT 'functions',
         n.nspname || '.' || p.proname || '(' ||
           pg_get_function_identity_arguments(p.oid) || ')',
         md5(pg_get_functiondef(p.oid) || '|owner=' ||
           pg_get_userbyid(p.proowner) || '|acl=' ||
           coalesce(p.proacl::text,'NULL'))
  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname IN ('public','private')
  UNION ALL
  SELECT 'triggers', n.nspname || '.' || c.relname || '.' || t.tgname,
         md5(pg_get_triggerdef(t.oid,true))
  FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
  JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname IN ('public','private') AND NOT t.tgisinternal
  UNION ALL
  SELECT 'relation_grants', n.nspname || '.' || c.relname,
         md5(concat_ws('|',pg_get_userbyid(c.relowner),
           coalesce(c.relacl::text,'NULL')))
  FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname IN ('public','private') AND c.relkind IN ('r','p','v','m','f','S')
)
SELECT category, count(*) AS object_count,
       md5(string_agg(identifier || ':' || fingerprint,'|' ORDER BY identifier)) AS category_fingerprint
FROM objects
GROUP BY category ORDER BY category;
