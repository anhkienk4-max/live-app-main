WITH fingerprints AS (
  SELECT 'relations' AS object_type, md5(coalesce((
    SELECT string_agg(format('%s|%s|%s|%s|%s|%s', n.nspname, c.relname, c.relkind,
      pg_get_userbyid(c.relowner), c.relrowsecurity, c.relforcerowsecurity),
      E'\n' ORDER BY n.nspname, c.relname)
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname IN ('public','private','auth','storage','extensions','cron','supabase_migrations')
  ),'')) AS fingerprint
  UNION ALL
  SELECT 'columns', md5(coalesce((
    SELECT string_agg(format('%s|%s|%s|%s|%s|%s', n.nspname, c.relname, a.attnum, a.attname,
      format_type(a.atttypid,a.atttypmod), a.attnotnull||'|'||coalesce(pg_get_expr(d.adbin,d.adrelid,true),'')),
      E'\n' ORDER BY n.nspname, c.relname, a.attnum)
    FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid
      JOIN pg_namespace n ON n.oid=c.relnamespace
      LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
    WHERE n.nspname IN ('public','private','auth','storage','extensions','cron','supabase_migrations')
      AND a.attnum>0 AND NOT a.attisdropped
  ),''))
  UNION ALL
  SELECT 'constraints', md5(coalesce((
    SELECT string_agg(format('%s|%s|%s|%s|%s|%s|%s|%s|%s|%s', n.nspname, c.relname, x.conname,
      x.contype, x.conkey, x.confrelid::regclass::text, x.confkey, x.convalidated,
      x.condeferrable, x.condeferred||'|'||x.connoinherit), E'\n' ORDER BY n.nspname,c.relname,x.conname)
    FROM pg_constraint x JOIN pg_class c ON c.oid=x.conrelid
      JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname IN ('public','private','auth','storage','extensions','cron','supabase_migrations')
  ),''))
  UNION ALL
  SELECT 'indexes', md5(coalesce((
    SELECT string_agg(format('%s|%s|%s|%s|%s|%s', n.nspname, c.relname,
      i.indisunique, i.indisprimary, i.indisvalid, pg_get_indexdef(i.indexrelid)),
      E'\n' ORDER BY n.nspname,c.relname,i.indexrelid::regclass::text)
    FROM pg_index i JOIN pg_class c ON c.oid=i.indrelid
      JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname IN ('public','private','auth','storage','extensions','cron','supabase_migrations')
  ),''))
  UNION ALL
  SELECT 'triggers', md5(coalesce((
    SELECT string_agg(format('%s|%s|%s|%s', n.nspname, c.relname, t.tgname,
      t.tgenabled::text||'|'||pg_get_triggerdef(t.oid,true)), E'\n' ORDER BY n.nspname,c.relname,t.tgname)
    FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid
      JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname IN ('public','private','auth','storage','extensions','cron','supabase_migrations')
      AND NOT t.tgisinternal
  ),''))
  UNION ALL
  SELECT 'policies', md5(coalesce((
    SELECT string_agg(format('%s|%s|%s|%s|%s|%s', n.nspname,c.relname,p.polname,
      p.polcmd,p.polpermissive,(SELECT array_to_string(array_agg(r.rolname ORDER BY r.rolname),',')
        FROM unnest(p.polroles) x(role_oid) JOIN pg_roles r ON r.oid=x.role_oid)),
      E'\n' ORDER BY n.nspname,c.relname,p.polname)
    FROM pg_policy p JOIN pg_class c ON c.oid=p.polrelid
      JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname IN ('public','private','auth','storage','extensions','cron','supabase_migrations')
  ),''))
  UNION ALL
  SELECT 'functions', md5(coalesce((
    SELECT string_agg(format('%s|%s|%s|%s|%s|%s|%s|%s|%s|%s', n.nspname,p.proname,
      pg_get_function_identity_arguments(p.oid),pg_get_function_result(p.oid),l.lanname,
      pg_get_userbyid(p.proowner),p.prosecdef,p.provolatile,coalesce(p.proconfig::text,''),
      coalesce(p.proacl::text,'default')||'|'||md5(replace(replace(p.prosrc,E'\r\n',E'\n'),E'\r',E'\n'))),
      E'\n' ORDER BY n.nspname,p.proname,pg_get_function_identity_arguments(p.oid))
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      JOIN pg_language l ON l.oid=p.prolang
    WHERE n.nspname IN ('public','private','auth','storage','extensions','cron','supabase_migrations')
  ),''))
  UNION ALL
  SELECT 'table_grants', md5(coalesce((
    SELECT string_agg(format('%s|%s|%s|%s|%s|%s', table_schema,table_name,grantor,grantee,privilege_type,is_grantable),
      E'\n' ORDER BY table_schema,table_name,grantor,grantee,privilege_type)
    FROM information_schema.table_privileges
    WHERE table_schema IN ('public','private','auth','storage','extensions','cron','supabase_migrations')
  ),''))
  UNION ALL
  SELECT 'default_privileges', md5(coalesce((
    SELECT string_agg(format('%s|%s|%s|%s', pg_get_userbyid(d.defaclrole),
      coalesce(n.nspname,'<default>'),d.defaclobjtype,d.defaclacl::text),
      E'\n' ORDER BY pg_get_userbyid(d.defaclrole),n.nspname,d.defaclobjtype)
    FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid=d.defaclnamespace
  ),''))
)
SELECT object_type, fingerprint FROM fingerprints ORDER BY object_type;
