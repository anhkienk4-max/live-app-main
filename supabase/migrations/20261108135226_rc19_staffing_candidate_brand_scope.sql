-- Reinstates the 1B3 read contract on Production with current C3 authority.
-- This forward repair intentionally fails if another environment already has the RPC.
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.shifts') IS NULL
    OR to_regclass('public.business_users') IS NULL
    OR to_regclass('public.shift_registrations') IS NULL
    OR to_regclass('public.rc19_leader_brand_scopes') IS NULL
    OR to_regclass('private.rbac_permission_catalog') IS NULL
    OR to_regprocedure('private.require_shift_actor(boolean)') IS NULL
    OR to_regprocedure('private.current_system_permission()') IS NULL
    OR to_regprocedure('private.rbac_has_permission(text)') IS NULL
    OR to_regprocedure('private.rc19_has_any_leader_brand_scope(text,text[])') IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM private.rbac_permission_catalog
      WHERE permission = 'shifts.assign_staff'
    ) THEN
    RAISE EXCEPTION 'STAFFING_CANDIDATE_DEPENDENCIES_MISSING';
  END IF;

  IF to_regprocedure('public.search_staffing_candidates(text,text,text,integer,integer)') IS NOT NULL THEN
    RAISE EXCEPTION 'STAFFING_CANDIDATE_RPC_EXISTS_REQUIRES_RECONCILIATION';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'postgres') THEN
    RAISE EXCEPTION 'STAFFING_CANDIDATE_DEFINER_OWNER_MISSING';
  END IF;
END;
$$;

CREATE FUNCTION public.search_staffing_candidates(
  p_shift_id text,
  p_role text,
  p_search text DEFAULT '',
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_role text;
  target_shift public.shifts;
  normalized_search text;
  result jsonb;
BEGIN
  PERFORM private.require_shift_actor(true);

  IF NOT private.rbac_has_permission('shifts.assign_staff') THEN
    RAISE EXCEPTION 'RBAC_PERMISSION_DENIED' USING ERRCODE = '42501';
  END IF;

  actor_role := private.current_system_permission();
  IF actor_role NOT IN ('admin', 'leader') THEN
    RAISE EXCEPTION 'OPERATION_NOT_ALLOWED' USING ERRCODE = '42501';
  END IF;

  IF p_role IS NULL OR p_role NOT IN ('host', 'support', 'technical') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'OPERATIONAL_ROLE_INVALID';
  END IF;
  IF p_limit IS NULL OR p_limit < 1 OR p_limit > 50
    OR p_offset IS NULL OR p_offset < 0 OR p_offset > 10000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'PAGINATION_INVALID';
  END IF;
  IF pg_catalog.length(coalesce(p_search, '')) > 100 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SEARCH_TOO_LONG';
  END IF;

  SELECT s.* INTO target_shift
  FROM public.shifts AS s
  WHERE s.id = p_shift_id
    AND s.deleted_at IS NULL
    AND s.archived_at IS NULL
    AND (
      actor_role = 'admin'
      OR (actor_role = 'leader'
        AND private.rc19_has_any_leader_brand_scope(s.brand_id, ARRAY['shifts.manage']::text[]))
    );
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SHIFT_NOT_FOUND';
  END IF;

  normalized_search := pg_catalog.lower(pg_catalog.btrim(coalesce(p_search, '')));

  WITH eligible AS MATERIALIZED (
    SELECT u.id AS user_id, u.full_name
    FROM public.business_users AS u
    WHERE u.status = 'active'
      AND u.account_status = 'active'
      AND u.archived_at IS NULL
      AND u.deleted_at IS NULL
      AND u.operational_roles @> ARRAY[p_role]::text[]
      AND (normalized_search = '' OR pg_catalog.strpos(pg_catalog.lower(u.full_name), normalized_search) > 0)
  ), paged_users AS MATERIALIZED (
    SELECT user_id, full_name FROM eligible
    ORDER BY pg_catalog.lower(full_name), user_id
    LIMIT p_limit OFFSET p_offset
  ), availability_rows AS (
    SELECT e.user_id, e.full_name,
      CASE
        WHEN EXISTS (
          SELECT 1 FROM public.shift_registrations AS same_shift
          WHERE same_shift.shift_id = target_shift.id
            AND same_shift.user_id = e.user_id
            AND same_shift.status IN ('pending', 'approved', 'manually_assigned')
            AND (same_shift.operational_role = p_role OR NOT target_shift.allow_multi_role)
        ) THEN 'already_on_shift'
        WHEN EXISTS (
          SELECT 1
          FROM public.shift_registrations AS r
          JOIN public.shifts AS other_shift ON other_shift.id = r.shift_id
          WHERE r.user_id = e.user_id
            AND r.shift_id <> target_shift.id
            AND r.status IN ('pending', 'approved', 'manually_assigned')
            AND other_shift.deleted_at IS NULL
            AND other_shift.archived_at IS NULL
            AND other_shift.status <> 'cancelled'
            AND other_shift.start_at < target_shift.end_at
            AND other_shift.end_at > target_shift.start_at
        ) THEN 'conflict'
        ELSE 'available'
      END AS availability
    FROM paged_users AS e
  )
  SELECT pg_catalog.jsonb_build_object(
    'total', (SELECT count(*) FROM eligible),
    'items', coalesce((
      SELECT pg_catalog.jsonb_agg(pg_catalog.to_jsonb(availability_rows)
        ORDER BY pg_catalog.lower(availability_rows.full_name), availability_rows.user_id)
      FROM availability_rows
    ), '[]'::jsonb)
  ) INTO result;

  RETURN result;
END;
$$;

ALTER FUNCTION public.search_staffing_candidates(text, text, text, integer, integer) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.search_staffing_candidates(text, text, text, integer, integer)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.search_staffing_candidates(text, text, text, integer, integer)
  TO authenticated;

COMMIT;
