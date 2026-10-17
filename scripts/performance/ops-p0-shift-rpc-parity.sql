-- OPS P0.2: READ-ONLY parity preflight before benchmarking shift list/RLS.
-- Baseline captured from Production project egdjnpmoasarrttvhgds, main 28f904a4,
-- on 2026-10-17. DO NOT apply functions or migrations from this diagnostic.
-- Run against BOTH Production (read-only) and STAGING; never paste credentials here.
--
-- Definitions differ after legitimate future migrations: update fingerprints only
-- after reviewing source, role contracts, and migration provenance.
WITH expected(schema_name, function_name, signature, expected_md5) AS (
  VALUES
    ('private','can_read_shift','p_shift_id text','76f4a8e13c72e29f2932044cb9ed51d0'),
    ('private','filtered_shift_ids','p_scope text, p_filters jsonb','bdb629b93dfa26cc9d6c234a1e875581'),
    ('public','get_report_list_page','p_page integer, p_page_size integer, p_filters jsonb, p_summary boolean','297bca1d0c7faad09cf298b59b42127b'),
    ('public','get_shift_list_page','p_scope text, p_page integer, p_page_size integer, p_filters jsonb, p_pending_page integer, p_include_live boolean','a87046c601b7591d584fd494b8d84913'),
    ('public','get_shift_staffing_summary','p_shift_ids text[]','450888d2d1891d247cc832937f5125ea'),
    ('public','get_swap_list_page','p_page integer, p_page_size integer, p_filters jsonb','b0db928a367c71ed1da736d8b1b4273d')
), actual AS (
  SELECT n.nspname AS schema_name, p.proname AS function_name,
         pg_get_function_identity_arguments(p.oid) AS signature,
         md5(pg_get_functiondef(p.oid)) AS actual_md5
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname IN ('private','public')
)
SELECT current_database() AS database_name,
       e.schema_name || '.' || e.function_name AS function_name,
       e.signature, e.expected_md5, a.actual_md5,
       CASE WHEN a.actual_md5 IS NULL THEN 'MISSING'
            WHEN a.actual_md5 <> e.expected_md5 THEN 'DIFFERENT'
            ELSE 'MATCH' END AS parity_status
FROM expected e
LEFT JOIN actual a USING (schema_name, function_name, signature)
ORDER BY e.schema_name, e.function_name;
