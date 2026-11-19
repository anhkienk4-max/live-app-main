-- Bounded Audit History reads. The invoker keeps the existing audit_logs RLS
-- policy authoritative; this function only changes pagination and query shape.
CREATE INDEX IF NOT EXISTS audit_logs_cursor_created_at_id_idx
  ON public.audit_logs (created_at DESC, id DESC);

DO $$
DECLARE
  v_policy_qual text;
  v_permission_is_stable boolean;
BEGIN
  SELECT qual INTO v_policy_qual FROM pg_catalog.pg_policies
  WHERE schemaname = 'public' AND tablename = 'audit_logs' AND policyname = 'audit_logs_read'
    AND cmd = 'SELECT' AND roles = ARRAY['authenticated']::name[] AND permissive = 'PERMISSIVE';
  IF v_policy_qual IS NULL OR v_policy_qual !~ $re$rbac_has_permission\('audit\.view'.*rbac_has_permission\('audit\.view_team'.*module.*calendar.*imports$re$ THEN
    RAISE EXCEPTION 'C12_AUDIT_POLICY_DEFINITION_DRIFT';
  END IF;
  SELECT provolatile = 's' INTO v_permission_is_stable
  FROM pg_catalog.pg_proc WHERE oid = 'private.rbac_has_permission(text)'::regprocedure;
  IF v_permission_is_stable IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'C12_AUDIT_PERMISSION_VOLATILITY_DRIFT';
  END IF;
END;
$$;

-- Scalar subqueries let PostgreSQL cache stable RBAC decisions per statement,
-- instead of rerunning the effective-permission lookup for every audit row.
ALTER POLICY audit_logs_read ON public.audit_logs USING (
  (SELECT private.rbac_has_permission('audit.view'))
  OR ((SELECT private.rbac_has_permission('audit.view_team'))
    AND module IN ('calendar', 'live', 'reports', 'campaigns', 'swaps', 'imports'))
);

CREATE OR REPLACE FUNCTION public.get_audit_history_page(
  p_filters jsonb DEFAULT '{}'::jsonb,
  p_cursor_created_at timestamptz DEFAULT NULL,
  p_cursor_id text DEFAULT NULL,
  p_snapshot_at timestamptz DEFAULT NULL,
  p_page_size integer DEFAULT 20,
  p_sort text DEFAULT 'newest'
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  v_from date;
  v_to date;
  v_snapshot timestamptz := least(coalesce(p_snapshot_at, statement_timestamp()), statement_timestamp());
  v_rows jsonb;
  v_count integer;
  v_last_created_at timestamptz;
  v_last_id text;
  v_has_more boolean;
  v_key text;
  v_query text;
BEGIN
  IF jsonb_typeof(p_filters) IS DISTINCT FROM 'object'
    OR octet_length(p_filters::text) > 16384
    OR p_page_size IS NULL OR p_page_size NOT IN (10, 20, 50)
    OR p_sort IS NULL OR p_sort NOT IN ('newest', 'oldest')
    OR ((p_cursor_created_at IS NULL) <> (p_cursor_id IS NULL))
    OR ((p_cursor_created_at IS NOT NULL) <> (p_snapshot_at IS NOT NULL)) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'AUDIT_QUERY_INVALID';
  END IF;

  FOR v_key IN SELECT jsonb_object_keys(p_filters) LOOP
    IF v_key NOT IN ('from', 'to', 'actor', 'brand_id', 'role', 'module', 'action', 'status', 'source', 'entity_type', 'entity_id', 'query') THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'AUDIT_FILTER_INVALID';
    END IF;
    IF v_key IN ('actor', 'brand_id', 'role', 'module', 'action', 'status', 'source')
      AND (jsonb_typeof(p_filters->v_key) IS DISTINCT FROM 'array'
        OR jsonb_array_length(p_filters->v_key) > 50
        OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_filters->v_key) item WHERE jsonb_typeof(item) IS DISTINCT FROM 'string' OR length(item #>> '{}') > 128)) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'AUDIT_FILTER_INVALID';
    END IF;
  END LOOP;

  IF p_filters ? 'from' AND (p_filters->>'from') !~ '^\d{4}-\d{2}-\d{2}$'
    OR p_filters ? 'to' AND (p_filters->>'to') !~ '^\d{4}-\d{2}-\d{2}$'
    OR length(coalesce(p_filters->>'entity_type', '')) > 128
    OR length(coalesce(p_filters->>'entity_id', '')) > 256
    OR length(coalesce(p_filters->>'query', '')) > 160 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'AUDIT_FILTER_INVALID';
  END IF;

  BEGIN
    v_to := coalesce(nullif(p_filters->>'to', '')::date, (statement_timestamp() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date);
    v_from := coalesce(nullif(p_filters->>'from', '')::date, v_to - 29);
  EXCEPTION WHEN datetime_field_overflow OR invalid_datetime_format THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'AUDIT_FILTER_INVALID';
  END;
  IF v_to < v_from OR v_to - v_from > 365 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'AUDIT_DATE_RANGE_INVALID';
  END IF;
  v_query := nullif(btrim(p_filters->>'query'), '');

  IF p_sort = 'newest' THEN
    WITH candidates AS MATERIALIZED (
      SELECT a.* FROM public.audit_logs a
      WHERE a.created_at >= (v_from::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')
        AND a.created_at < ((v_to + 1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')
        AND a.created_at <= v_snapshot
        AND (p_cursor_created_at IS NULL OR (a.created_at, a.id) < (p_cursor_created_at, p_cursor_id))
        AND (NOT (p_filters ? 'actor') OR jsonb_array_length(p_filters->'actor') = 0 OR a.actor_business_user_id IN (SELECT jsonb_array_elements_text(p_filters->'actor')) OR a.actor_auth_user_id::text IN (SELECT jsonb_array_elements_text(p_filters->'actor')))
        AND (NOT (p_filters ? 'brand_id') OR jsonb_array_length(p_filters->'brand_id') = 0 OR a.after_data->>'brand_id' IN (SELECT jsonb_array_elements_text(p_filters->'brand_id')) OR a.before_data->>'brand_id' IN (SELECT jsonb_array_elements_text(p_filters->'brand_id')) OR a.metadata->>'brand_id' IN (SELECT jsonb_array_elements_text(p_filters->'brand_id')))
        AND (NOT (p_filters ? 'role') OR jsonb_array_length(p_filters->'role') = 0 OR a.actor_role IN (SELECT jsonb_array_elements_text(p_filters->'role')))
        AND (NOT (p_filters ? 'module') OR jsonb_array_length(p_filters->'module') = 0 OR a.module IN (SELECT jsonb_array_elements_text(p_filters->'module')))
        AND (NOT (p_filters ? 'action') OR jsonb_array_length(p_filters->'action') = 0 OR a.action IN (SELECT jsonb_array_elements_text(p_filters->'action')))
        AND (NOT (p_filters ? 'status') OR jsonb_array_length(p_filters->'status') = 0 OR a.status IN (SELECT jsonb_array_elements_text(p_filters->'status')))
        AND (NOT (p_filters ? 'source') OR jsonb_array_length(p_filters->'source') = 0 OR a.source IN (SELECT jsonb_array_elements_text(p_filters->'source')))
        AND (NOT (p_filters ? 'entity_type') OR a.entity_type = p_filters->>'entity_type')
        AND (NOT (p_filters ? 'entity_id') OR a.entity_id = p_filters->>'entity_id')
        AND (v_query IS NULL OR a.entity_name ILIKE '%' || replace(replace(replace(v_query, E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_') || '%' ESCAPE E'\\')
      ORDER BY a.created_at DESC, a.id DESC
      LIMIT p_page_size + 1
    ), page_rows AS (
      SELECT * FROM candidates ORDER BY created_at DESC, id DESC LIMIT p_page_size
    ), last_row AS (
      SELECT created_at, id FROM page_rows ORDER BY created_at ASC, id ASC LIMIT 1
    )
    SELECT coalesce((SELECT jsonb_agg(to_jsonb(page_rows) ORDER BY created_at DESC, id DESC) FROM page_rows), '[]'::jsonb),
      (SELECT count(*)::integer FROM candidates), (SELECT created_at FROM last_row), (SELECT id FROM last_row)
    INTO v_rows, v_count, v_last_created_at, v_last_id;
  ELSE
    WITH candidates AS MATERIALIZED (
      SELECT a.* FROM public.audit_logs a
      WHERE a.created_at >= (v_from::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')
        AND a.created_at < ((v_to + 1)::timestamp AT TIME ZONE 'Asia/Ho_Chi_Minh')
        AND a.created_at <= v_snapshot
        AND (p_cursor_created_at IS NULL OR (a.created_at, a.id) > (p_cursor_created_at, p_cursor_id))
        AND (NOT (p_filters ? 'actor') OR jsonb_array_length(p_filters->'actor') = 0 OR a.actor_business_user_id IN (SELECT jsonb_array_elements_text(p_filters->'actor')) OR a.actor_auth_user_id::text IN (SELECT jsonb_array_elements_text(p_filters->'actor')))
        AND (NOT (p_filters ? 'brand_id') OR jsonb_array_length(p_filters->'brand_id') = 0 OR a.after_data->>'brand_id' IN (SELECT jsonb_array_elements_text(p_filters->'brand_id')) OR a.before_data->>'brand_id' IN (SELECT jsonb_array_elements_text(p_filters->'brand_id')) OR a.metadata->>'brand_id' IN (SELECT jsonb_array_elements_text(p_filters->'brand_id')))
        AND (NOT (p_filters ? 'role') OR jsonb_array_length(p_filters->'role') = 0 OR a.actor_role IN (SELECT jsonb_array_elements_text(p_filters->'role')))
        AND (NOT (p_filters ? 'module') OR jsonb_array_length(p_filters->'module') = 0 OR a.module IN (SELECT jsonb_array_elements_text(p_filters->'module')))
        AND (NOT (p_filters ? 'action') OR jsonb_array_length(p_filters->'action') = 0 OR a.action IN (SELECT jsonb_array_elements_text(p_filters->'action')))
        AND (NOT (p_filters ? 'status') OR jsonb_array_length(p_filters->'status') = 0 OR a.status IN (SELECT jsonb_array_elements_text(p_filters->'status')))
        AND (NOT (p_filters ? 'source') OR jsonb_array_length(p_filters->'source') = 0 OR a.source IN (SELECT jsonb_array_elements_text(p_filters->'source')))
        AND (NOT (p_filters ? 'entity_type') OR a.entity_type = p_filters->>'entity_type')
        AND (NOT (p_filters ? 'entity_id') OR a.entity_id = p_filters->>'entity_id')
        AND (v_query IS NULL OR a.entity_name ILIKE '%' || replace(replace(replace(v_query, E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_') || '%' ESCAPE E'\\')
      ORDER BY a.created_at ASC, a.id ASC
      LIMIT p_page_size + 1
    ), page_rows AS (
      SELECT * FROM candidates ORDER BY created_at ASC, id ASC LIMIT p_page_size
    ), last_row AS (
      SELECT created_at, id FROM page_rows ORDER BY created_at DESC, id DESC LIMIT 1
    )
    SELECT coalesce((SELECT jsonb_agg(to_jsonb(page_rows) ORDER BY created_at ASC, id ASC) FROM page_rows), '[]'::jsonb),
      (SELECT count(*)::integer FROM candidates), (SELECT created_at FROM last_row), (SELECT id FROM last_row)
    INTO v_rows, v_count, v_last_created_at, v_last_id;
  END IF;

  v_has_more := v_count > p_page_size;
  RETURN jsonb_build_object(
    'items', v_rows,
    'has_more', v_has_more,
    'next_cursor', CASE WHEN v_has_more THEN jsonb_build_object('created_at', v_last_created_at, 'id', v_last_id, 'snapshot_at', v_snapshot) ELSE NULL END,
    'page_size', p_page_size,
    'range', jsonb_build_object('from', v_from, 'to', v_to)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_audit_history_page(jsonb, timestamptz, text, timestamptz, integer, text) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_audit_history_page(jsonb, timestamptz, text, timestamptz, integer, text) TO authenticated;
