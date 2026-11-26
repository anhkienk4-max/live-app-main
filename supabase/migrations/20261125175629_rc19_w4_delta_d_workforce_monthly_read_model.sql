-- Delta D3: scoped, server-authoritative monthly incident read model.
-- Uses the canonical business_date stored on incidents (Asia/Ho_Chi_Minh
-- business date), never client-paginated rows or mutable shift summaries.
BEGIN;

-- Admins use the canonical permission decision. Leader access is enforced by
-- active per-Brand workforce.read scopes below, so this permission is not a
-- global Leader grant.
INSERT INTO private.rbac_permission_catalog
  (permission, legacy_defaults, hard_restricted, role_override_roles, account_override_roles, account_allow_roles)
VALUES
  ('workforce.read', '{"member":false,"leader":false,"admin":true}', true, '{}', '{}', '{}')
ON CONFLICT (permission) DO NOTHING;

DO $assert_workforce_read_permission$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM private.rbac_permission_catalog
    WHERE permission = 'workforce.read'
      AND legacy_defaults = '{"member":false,"leader":false,"admin":true}'::jsonb
      AND hard_restricted
      AND cardinality(role_override_roles) = 0
      AND cardinality(account_override_roles) = 0
      AND cardinality(account_allow_roles) = 0
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'WORKFORCE_READ_PERMISSION_CONFIGURATION_CONFLICT';
  END IF;
END
$assert_workforce_read_permission$;

CREATE INDEX IF NOT EXISTS rc19_staff_incidents_monthly_scope_idx
  ON private.rc19_staff_incidents (business_date, original_staff_id, shift_id)
  INCLUDE (incident_type, review_state, operational_role, staffing_segment_id,
           verified_late_minutes, version);

CREATE OR REPLACE FUNCTION public.rc19_workforce_incident_monthly(
  p_month date,
  p_staff_id text DEFAULT NULL,
  p_brand_id text DEFAULT NULL,
  p_role text DEFAULT NULL,
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
) RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor text := private.current_business_user_id();
  v_permission text := private.current_system_permission();
  v_staff_id text := p_staff_id;
  v_result jsonb;
BEGIN
  IF v_actor IS NULL OR NOT private.current_business_user_is_active() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'WORKFORCE_ACTOR_NOT_AUTHORIZED';
  END IF;
  IF p_month IS NULL OR date_trunc('month', p_month)::date <> p_month THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'WORKFORCE_MONTH_INVALID';
  END IF;
  IF p_role IS NOT NULL AND p_role NOT IN ('host', 'support', 'technical') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'WORKFORCE_ROLE_INVALID';
  END IF;
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100
    OR p_offset IS NULL OR p_offset NOT BETWEEN 0 AND 100000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'WORKFORCE_PAGE_INVALID';
  END IF;

  IF v_permission = 'member' THEN
    IF p_staff_id IS NOT NULL AND p_staff_id <> v_actor THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'WORKFORCE_SELF_SCOPE_REQUIRED';
    END IF;
    v_staff_id := v_actor;
  ELSIF v_permission = 'admin' THEN
    IF NOT public.rbac01_effective_permission('workforce.read') THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'WORKFORCE_READ_REQUIRED';
    END IF;
  ELSIF v_permission = 'leader' THEN
    IF p_brand_id IS NOT NULL
      AND NOT private.rc19_has_leader_brand_scope(p_brand_id, 'workforce.read') THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'WORKFORCE_BRAND_SCOPE_REQUIRED';
    END IF;
  ELSE
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'WORKFORCE_ACTOR_NOT_AUTHORIZED';
  END IF;

  WITH scoped AS MATERIALIZED (
    SELECT i.id AS incident_id,
           i.original_staff_id AS staff_id,
           i.shift_id,
           i.staffing_segment_id,
           i.operational_role,
           i.business_date,
           i.incident_type,
           i.review_state,
           i.verified_late_minutes,
           i.version,
           s.brand_id
    FROM private.rc19_staff_incidents AS i
    JOIN public.shifts AS s ON s.id = i.shift_id
    WHERE i.business_date >= p_month
      AND i.business_date < (p_month + interval '1 month')::date
      AND (v_staff_id IS NULL OR i.original_staff_id = v_staff_id)
      AND (p_brand_id IS NULL OR s.brand_id = p_brand_id)
      AND (p_role IS NULL OR i.operational_role = p_role)
      AND (
        (v_permission = 'admin' AND public.rbac01_effective_permission('workforce.read'))
        OR (v_permission = 'leader'
            AND private.rc19_has_leader_brand_scope(s.brand_id, 'workforce.read'))
        OR (v_permission = 'member' AND i.original_staff_id = v_actor)
      )
  ), per_staff AS (
    SELECT staff_id,
      count(*)::integer AS incident_count,
      count(DISTINCT shift_id)::integer AS distinct_shift_count,
      count(*) FILTER (WHERE review_state = 'pending')::integer AS pending_count,
      count(*) FILTER (WHERE review_state = 'confirmed')::integer AS confirmed_count,
      count(*) FILTER (WHERE review_state = 'rejected')::integer AS rejected_count,
      count(*) FILTER (WHERE review_state = 'corrected')::integer AS corrected_count,
      count(*) FILTER (WHERE review_state = 'confirmed' AND incident_type = 'skip')::integer AS confirmed_skip_count,
      count(*) FILTER (WHERE review_state = 'confirmed' AND incident_type = 'absent')::integer AS confirmed_absent_count,
      count(*) FILTER (WHERE review_state = 'confirmed' AND incident_type = 'authorized_absence')::integer AS confirmed_authorized_absence_count,
      count(*) FILTER (WHERE review_state = 'confirmed' AND incident_type = 'late')::integer AS confirmed_late_count,
      count(*) FILTER (WHERE review_state = 'confirmed' AND incident_type = 'early_leave')::integer AS confirmed_early_leave_count,
      count(*) FILTER (WHERE review_state = 'confirmed' AND incident_type = 'approved_pass')::integer AS approved_pass_count,
      count(*) FILTER (WHERE review_state = 'confirmed' AND incident_type = 'approved_swap')::integer AS approved_swap_count,
      count(*) FILTER (WHERE review_state = 'confirmed' AND incident_type = 'late' AND verified_late_minutes IS NULL)::integer AS unknown_late_minutes_count,
      coalesce(sum(verified_late_minutes) FILTER (
        WHERE review_state = 'confirmed' AND incident_type = 'late' AND verified_late_minutes IS NOT NULL
      ), 0)::integer AS verified_late_minutes_total
    FROM scoped
    GROUP BY staff_id
  ), paged AS (
    SELECT * FROM scoped
    ORDER BY business_date DESC, shift_id, incident_id
    LIMIT p_limit OFFSET p_offset
  ), details AS (
    SELECT staff_id,
      jsonb_agg(jsonb_build_object(
        'incidentId', incident_id,
        'shiftId', shift_id,
        'staffingSegmentId', staffing_segment_id,
        'role', operational_role,
        'businessDate', business_date,
        'type', incident_type,
        'reviewState', review_state,
        'verifiedLateMinutes', CASE
          WHEN review_state = 'confirmed' AND incident_type = 'late'
            THEN verified_late_minutes
          ELSE NULL
        END,
        'version', version
      ) ORDER BY business_date, shift_id, incident_id) AS items
    FROM paged
    GROUP BY staff_id
  )
  SELECT jsonb_build_object(
    'month', to_char(p_month, 'YYYY-MM'),
    'timezone', 'Asia/Ho_Chi_Minh',
    'pageLimit', p_limit,
    'pageOffset', p_offset,
    'totalIncidents', coalesce((SELECT sum(incident_count) FROM per_staff), 0),
    'staff', coalesce((
      SELECT jsonb_agg(to_jsonb(per_staff) || jsonb_build_object('items', coalesce(details.items, '[]'::jsonb))
                       ORDER BY per_staff.staff_id)
      FROM per_staff LEFT JOIN details USING (staff_id)
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.rc19_workforce_incident_monthly(date, text, text, text, integer, integer)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.rc19_workforce_incident_monthly(date, text, text, text, integer, integer)
  TO authenticated;

COMMENT ON FUNCTION public.rc19_workforce_incident_monthly(date, text, text, text, integer, integer) IS
  'Delta D3 scoped monthly incident summary. Members are self-only; leaders are filtered by active workforce.read Brand grants; administrators require workforce.read. Reasons and evidence are not exposed.';

COMMIT;
