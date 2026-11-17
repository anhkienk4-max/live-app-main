BEGIN;

DO $guard$
BEGIN
  IF to_regclass('public.swap_requests') IS NULL
    OR to_regclass('public.shifts') IS NULL
    OR to_regprocedure('private.can_read_shift(text)') IS NULL
    OR to_regprocedure('public.get_swap_list_page(integer,integer,jsonb)') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'W4_PASS_RECIPIENT_VISIBILITY_PRECONDITION_FAILED';
  END IF;
END;
$guard$;

-- 1. Extend RLS on swap_requests to allow the replacement staff (PASS recipient)
-- to view their pending, accepted, and completed swap requests.
DROP POLICY IF EXISTS swap_requests_select ON public.swap_requests;
CREATE POLICY swap_requests_select ON public.swap_requests FOR SELECT TO authenticated USING (
  (SELECT private.current_business_user_is_active()) AND (
    requester_id = (SELECT private.current_business_user_id())
    OR counterpart_id = (SELECT private.current_business_user_id())
    OR replacement_staff_id = (SELECT private.current_business_user_id())
    OR new_host_id = (SELECT private.current_business_user_id())
    OR new_support_id = (SELECT private.current_business_user_id())
    OR new_technical_id = (SELECT private.current_business_user_id())
    OR (SELECT private.is_leader_or_admin())
    OR EXISTS (
      SELECT 1 FROM public.shift_registrations sr
      WHERE sr.shift_id = source_shift_id
        AND sr.user_id = (SELECT private.current_business_user_id())
        AND sr.status IN ('approved','manually_assigned')
    )
  )
);

-- 2. Update can_read_shift so that:
-- a) Members can read future scheduled shifts (end_at > statement_timestamp())
--    even if filled/locked, allowing exchange candidate browsing.
-- b) Members involved in a swap request (as requester, counterpart, or replacement staff)
--    can read the shift even if it has ended or was locked.
CREATE OR REPLACE FUNCTION private.can_read_shift(p_shift_id text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT coalesce((
    SELECT CASE
      WHEN private.current_system_permission() = 'admin' THEN true
      WHEN shift.deleted_at IS NOT NULL OR shift.archived_at IS NOT NULL THEN false
      WHEN private.current_system_permission() = 'leader' THEN
        private.rc19_has_any_leader_brand_scope(shift.brand_id, ARRAY[
          'shifts.read', 'shifts.manage'
        ]::text[])
      ELSE (
        (shift.status = 'scheduled' AND shift.end_at > statement_timestamp())
        OR private.current_business_user_id() IN (shift.host_id, shift.support_id, shift.technical_id)
        OR EXISTS (
          SELECT 1 FROM public.shift_registrations AS registration
          WHERE registration.shift_id = shift.id
            AND registration.user_id = private.current_business_user_id()
            AND registration.status IN ('pending', 'approved', 'manually_assigned')
        )
        OR EXISTS (
          SELECT 1 FROM public.swap_requests AS sw
          WHERE (sw.shift_id = shift.id OR sw.source_shift_id = shift.id OR sw.target_shift_id = shift.id)
            AND (
              sw.requester_id = private.current_business_user_id()
              OR sw.counterpart_id = private.current_business_user_id()
              OR sw.replacement_staff_id = private.current_business_user_id()
              OR sw.new_host_id = private.current_business_user_id()
              OR sw.new_support_id = private.current_business_user_id()
              OR sw.new_technical_id = private.current_business_user_id()
            )
            AND sw.deleted_at IS NULL
        )
      )
    END
    FROM public.shifts AS shift
    WHERE shift.id = p_shift_id AND private.current_business_user_is_active()
  ), false);
$$;
ALTER FUNCTION private.can_read_shift(text) OWNER TO postgres;
REVOKE ALL ON FUNCTION private.can_read_shift(text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.can_read_shift(text) TO authenticated;

-- 3. Update get_swap_list_page:
-- Support scope='forMe' for both replacement_staff_id and counterpart_id.
-- Ensure counts and matching rows respect the caller's brand and shift scope.
CREATE OR REPLACE FUNCTION public.get_swap_list_page(p_page integer default 1,p_page_size integer default 20,p_filters jsonb default '{}')
RETURNS jsonb language plpgsql stable security invoker set search_path=''
AS $$
DECLARE
  actor text := private.current_business_user_id();
  result jsonb;
  search_text text;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'AUTHENTICATION_REQUIRED'; END IF;
  IF p_page IS NULL OR p_page < 1 OR p_page > 100000 OR p_page_size IS NULL OR p_page_size NOT IN (10, 20, 50)
    OR jsonb_typeof(p_filters) IS DISTINCT FROM 'object' OR octet_length(p_filters::text) > 16384
    OR coalesce(p_filters->>'scope', 'all') NOT IN ('all', 'mine', 'forMe')
    OR length(coalesce(p_filters->>'search', '')) > 256 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'LIST_QUERY_INVALID';
  END IF;
  IF (p_filters ? 'statuses' AND (jsonb_typeof(p_filters->'statuses') <> 'array' OR jsonb_array_length(p_filters->'statuses') > 50))
    OR (p_filters ? 'roles' AND (jsonb_typeof(p_filters->'roles') <> 'array' OR jsonb_array_length(p_filters->'roles') > 3))
    OR (p_filters ? 'requesterIds' AND (jsonb_typeof(p_filters->'requesterIds') <> 'array' OR jsonb_array_length(p_filters->'requesterIds') > 50)) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'LIST_FILTER_INVALID';
  END IF;
  search_text := replace(replace(replace(lower(coalesce(p_filters->>'search', '')), chr(92), chr(92)||chr(92)), '%', chr(92)||'%'), '_', chr(92)||'_');

  WITH shift_ids AS MATERIALIZED (
    SELECT * FROM private.filtered_shift_ids('all', p_filters - 'scope' - 'roles' - 'statuses' - 'requesterIds' - 'search')
  ), directory AS MATERIALIZED (
    SELECT id, full_name FROM public.get_staff_directory() WHERE search_text <> ''
    UNION SELECT id, full_name FROM public.business_users WHERE search_text <> ''
  ), all_rows AS MATERIALIZED (
    SELECT sw.* FROM public.swap_requests sw
    JOIN shift_ids ids ON ids.id = coalesce(nullif(sw.shift_id, ''), sw.source_shift_id)
    WHERE sw.deleted_at IS NULL
  ), matching AS MATERIALIZED (
    SELECT sw.* FROM all_rows sw
    JOIN public.shifts s ON s.id = coalesce(nullif(sw.shift_id, ''), sw.source_shift_id)
    WHERE (
      coalesce(p_filters->>'scope', 'all') = 'all'
      OR (p_filters->>'scope' = 'mine' AND sw.requester_id = actor)
      OR (p_filters->>'scope' = 'forMe' AND (
        sw.counterpart_id = actor
        OR sw.replacement_staff_id = actor
        OR sw.new_host_id = actor
        OR sw.new_support_id = actor
        OR sw.new_technical_id = actor
      ))
    )
    AND (jsonb_array_length(coalesce(p_filters->'requesterIds', '[]')) = 0 OR sw.requester_id IN (SELECT jsonb_array_elements_text(p_filters->'requesterIds')))
    AND (jsonb_array_length(coalesce(p_filters->'roles', '[]')) = 0 OR coalesce(sw.operational_role, CASE WHEN sw.new_support_id IS NOT NULL THEN 'support' WHEN sw.new_technical_id IS NOT NULL THEN 'technical' ELSE 'host' END) IN (SELECT jsonb_array_elements_text(p_filters->'roles')))
    AND (jsonb_array_length(coalesce(p_filters->'statuses', '[]')) = 0 OR sw.status::text IN (SELECT jsonb_array_elements_text(p_filters->'statuses')))
    AND (search_text = '' OR lower(concat_ws(' ', sw.id, s.title, sw.reason,
      (SELECT full_name FROM directory WHERE id = sw.requester_id LIMIT 1),
      (SELECT full_name FROM directory WHERE id = coalesce(sw.replacement_staff_id, sw.new_host_id, sw.new_support_id, sw.new_technical_id, sw.counterpart_id) LIMIT 1))) LIKE '%'||search_text||'%' ESCAPE E'\\')
  ), stats AS (
    SELECT count(*) total, least(p_page, greatest(1, ceil(count(*)::numeric / p_page_size)::integer)) page FROM matching
  ), selected AS (
    SELECT * FROM matching ORDER BY created_at DESC, id LIMIT p_page_size OFFSET ((SELECT page FROM stats) - 1) * p_page_size
  ), counts AS (
    SELECT jsonb_build_object(
      'all', count(*),
      'mine', count(*) FILTER (WHERE requester_id = actor),
      'forMe', count(*) FILTER (WHERE counterpart_id = actor OR replacement_staff_id = actor OR new_host_id = actor OR new_support_id = actor OR new_technical_id = actor),
      'pending', count(*) FILTER (WHERE status = 'pending'),
      'accepted', count(*) FILTER (WHERE status IN ('accepted', 'approved')),
      'completed', count(*) FILTER (WHERE status = 'completed'),
      'rejected', count(*) FILTER (WHERE status = 'rejected'),
      'cancelled', count(*) FILTER (WHERE status = 'cancelled')
    ) value FROM all_rows
  )
  SELECT jsonb_build_object(
    'rows', coalesce(jsonb_agg(to_jsonb(selected) ORDER BY created_at DESC, id), '[]'::jsonb),
    'total', (SELECT total FROM stats),
    'page', (SELECT page FROM stats),
    'pageSize', p_page_size,
    'counts', (SELECT value FROM counts)
  ) INTO result FROM selected;
  RETURN result;
END;
$$;
ALTER FUNCTION public.get_swap_list_page(integer, integer, jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_swap_list_page(integer, integer, jsonb) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_swap_list_page(integer, integer, jsonb) TO authenticated;

COMMIT;
