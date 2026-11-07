\echo 'DEFAULT_SEARCH_PATH'
SELECT current_setting('search_path'), md5(string_agg(
  a.attnum||'|'||a.attname||'|'||format_type(a.atttypid,a.atttypmod)||'|'||a.attnotnull::text||'|'||
  coalesce(pg_get_expr(d.adbin,d.adrelid),''), E'\n' ORDER BY a.attnum))
FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
WHERE a.attrelid='public.storage_resources'::regclass AND a.attnum>0 AND NOT a.attisdropped;

\echo 'PUBLIC_THEN_PG_CATALOG'
SET search_path=public,pg_catalog;
SELECT current_setting('search_path'), md5(string_agg(
  a.attnum||'|'||a.attname||'|'||format_type(a.atttypid,a.atttypmod)||'|'||a.attnotnull::text||'|'||
  coalesce(pg_get_expr(d.adbin,d.adrelid),''), E'\n' ORDER BY a.attnum))
FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
WHERE a.attrelid='public.storage_resources'::regclass AND a.attnum>0 AND NOT a.attisdropped;

\echo 'PG_CATALOG_THEN_PUBLIC'
SET search_path=pg_catalog,public;
SELECT current_setting('search_path'), md5(string_agg(
  a.attnum||'|'||a.attname||'|'||format_type(a.atttypid,a.atttypmod)||'|'||a.attnotnull::text||'|'||
  coalesce(pg_get_expr(d.adbin,d.adrelid),''), E'\n' ORDER BY a.attnum))
FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
WHERE a.attrelid='public.storage_resources'::regclass AND a.attnum>0 AND NOT a.attisdropped;

\echo 'EMPTY_SEARCH_PATH'
SET search_path='';
SELECT current_setting('search_path'), md5(string_agg(
  a.attnum||'|'||a.attname||'|'||format_type(a.atttypid,a.atttypmod)||'|'||a.attnotnull::text||'|'||
  coalesce(pg_get_expr(d.adbin,d.adrelid),''), E'\n' ORDER BY a.attnum))
FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
WHERE a.attrelid='public.storage_resources'::regclass AND a.attnum>0 AND NOT a.attisdropped;
