-- OPS P0.2: READ-ONLY, aggregate performance baseline (no SQL payload/PII).
-- These are cumulative pg_stat_statements statistics, NOT browser p95.
-- Execute independently on each project; label the project outside this query.
WITH tracked AS (
  SELECT
    CASE
      WHEN query LIKE '%"get_shift_list_page"%' THEN 'get_shift_list_page'
      WHEN query LIKE '%"get_shift_staffing_summary"%' THEN 'get_shift_staffing_summary'
      WHEN query LIKE '%"get_report_list_page"%' THEN 'get_report_list_page'
      WHEN query LIKE '%"get_swap_list_page"%' THEN 'get_swap_list_page'
      WHEN query LIKE '%"update_report"%' THEN 'update_report'
    END AS operation,
    calls, total_exec_time, max_exec_time
  FROM pg_stat_statements
  WHERE dbid = (SELECT oid FROM pg_database WHERE datname = current_database())
    AND query LIKE 'WITH pgrst_source%'
)
SELECT t.operation,
       SUM(t.calls)::bigint AS calls,
       ROUND((SUM(t.total_exec_time) / NULLIF(SUM(t.calls), 0))::numeric, 2) AS mean_sql_ms,
       ROUND(MAX(t.max_exec_time)::numeric, 2) AS max_sql_ms,
       ROUND(SUM(t.total_exec_time)::numeric, 2) AS cumulative_sql_ms,
       (SELECT stats_reset FROM pg_stat_statements_info) AS stats_reset_at
FROM tracked t
WHERE t.operation IS NOT NULL
GROUP BY t.operation
ORDER BY cumulative_sql_ms DESC;
