-- Read-only schema shape inventory for OPS P0.2 (catalog metadata only).
-- Run independently on Production and Staging with the same SQL.
-- No table data, emails, credentials, user names, or row samples returned.
WITH important(name) AS (
  VALUES ('business_users'), ('shifts'), ('shift_registrations'), ('reports'),
         ('swap_requests'), ('operational_storage_routes'), ('operational_files'),
         ('workforce_payroll_lines')
)
SELECT i.name AS relation_name,
       to_regclass('public.' || i.name) IS NOT NULL AS relation_exists,
       (SELECT count(*) FROM information_schema.columns c
        WHERE c.table_schema='public' AND c.table_name=i.name) AS columns,
       (SELECT md5(string_agg(format('%s:%s:%s:%s',
            c.ordinal_position,c.column_name,c.udt_name,c.is_nullable),
            '|' ORDER BY c.ordinal_position))
        FROM information_schema.columns c
        WHERE c.table_schema='public' AND c.table_name=i.name) AS column_shape_md5,
       (SELECT count(*) FROM pg_indexes ix
        WHERE ix.schemaname='public' AND ix.tablename=i.name) AS indexes,
       (SELECT md5(string_agg(ix.indexdef,'|' ORDER BY ix.indexname))
        FROM pg_indexes ix
        WHERE ix.schemaname='public' AND ix.tablename=i.name) AS index_signature_md5,
       (SELECT count(*) FROM pg_policies p
        WHERE p.schemaname='public' AND p.tablename=i.name) AS rls_policies
FROM important i
ORDER BY i.name;
