-- RC19 W4 D3: authoritative filtered-scope totals and complete server filters.
-- The v1 RPC remains available for existing clients; v2 adds filters and totals
-- without deriving aggregate values from a paged details response.
-- This follow-up adds complete category/status/minute totals to the same V2 RPC.
BEGIN;

DO $dependencies$
BEGIN
  IF to_regclass('public.shifts') IS NULL
     OR to_regclass('private.rc19_staff_incidents') IS NULL
     OR to_regclass('private.rc19_business_user_agency_memberships') IS NULL
     OR to_regprocedure('private.current_business_user_id()') IS NULL
     OR to_regprocedure('private.current_system_permission()') IS NULL
     OR to_regprocedure('private.rc19_has_active_agency_membership(text,uuid,timestamp with time zone)') IS NULL
     OR to_regprocedure('private.rc19_has_leader_brand_scope(text,text)') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'WORKFORCE_MONTHLY_V2_BASELINE_MISSING';
  END IF;
END
$dependencies$;

CREATE OR REPLACE FUNCTION public.rc19_workforce_incident_monthly_v2(
  p_month date,
  p_staff_id text DEFAULT NULL,
  p_brand_id text DEFAULT NULL,
  p_role text DEFAULT NULL,
  p_agency_id uuid DEFAULT NULL,
  p_platform_id text DEFAULT NULL,
  p_review_state text DEFAULT NULL,
  p_incident_type text DEFAULT NULL,
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
  IF p_review_state IS NOT NULL AND p_review_state NOT IN ('pending', 'confirmed', 'rejected', 'corrected') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'WORKFORCE_REVIEW_STATE_INVALID';
  END IF;
  IF p_incident_type IS NOT NULL AND p_incident_type NOT IN (
    'skip', 'absent', 'authorized_absence', 'late', 'early_leave',
    'approved_pass', 'approved_swap', 'planned_reassignment', 'other'
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'WORKFORCE_INCIDENT_TYPE_INVALID';
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
    IF p_agency_id IS NOT NULL
       AND NOT private.rc19_has_active_agency_membership(v_actor, p_agency_id) THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'WORKFORCE_AGENCY_SCOPE_REQUIRED';
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
      AND (p_agency_id IS NULL OR s.authoritative_agency_id = p_agency_id)
      AND (p_platform_id IS NULL OR s.platform_id = p_platform_id)
      AND (p_review_state IS NULL OR i.review_state = p_review_state)
      AND (p_incident_type IS NULL OR i.incident_type = p_incident_type)
      AND (
        (v_permission = 'admin' AND public.rbac01_effective_permission('workforce.read'))
        OR (v_permission = 'leader'
            AND private.rc19_has_leader_brand_scope(s.brand_id, 'workforce.read')
            AND private.rc19_has_active_agency_membership(v_actor, s.authoritative_agency_id))
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
      count(*) FILTER (WHERE review_state = 'confirmed' AND incident_type = 'planned_reassignment')::integer AS confirmed_planned_reassignment_count,
      count(*) FILTER (WHERE review_state = 'confirmed' AND incident_type = 'other')::integer AS confirmed_other_count,
      count(*) FILTER (WHERE review_state = 'confirmed' AND incident_type = 'late' AND verified_late_minutes IS NULL)::integer AS unknown_late_minutes_count,
      coalesce(sum(verified_late_minutes) FILTER (
        WHERE review_state = 'confirmed' AND incident_type = 'late' AND verified_late_minutes IS NOT NULL
      ), 0)::integer AS verified_late_minutes_total
    FROM scoped
    GROUP BY staff_id
  ), global_summary AS (
    SELECT count(*) FILTER (WHERE review_state = 'pending')::integer AS pending_count,
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
      count(*) FILTER (WHERE review_state = 'confirmed' AND incident_type = 'planned_reassignment')::integer AS confirmed_planned_reassignment_count,
      count(*) FILTER (WHERE review_state = 'confirmed' AND incident_type = 'other')::integer AS confirmed_other_count,
      count(*) FILTER (WHERE review_state = 'confirmed' AND incident_type = 'late' AND verified_late_minutes IS NULL)::integer AS unknown_late_minutes_count,
      coalesce(sum(verified_late_minutes) FILTER (
        WHERE review_state = 'confirmed' AND incident_type = 'late' AND verified_late_minutes IS NOT NULL
      ), 0)::integer AS verified_late_minutes_total
    FROM scoped
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
    'totalDistinctShifts', (SELECT count(DISTINCT shift_id)::integer FROM scoped),
    'totalDistinctStaff', (SELECT count(DISTINCT staff_id)::integer FROM scoped),
    'summary', (SELECT jsonb_build_object(
      'pendingCount', pending_count,
      'confirmedCount', confirmed_count,
      'rejectedCount', rejected_count,
      'correctedCount', corrected_count,
      'confirmedSkipCount', confirmed_skip_count,
      'confirmedAbsentCount', confirmed_absent_count,
      'confirmedAuthorizedAbsenceCount', confirmed_authorized_absence_count,
      'confirmedLateCount', confirmed_late_count,
      'confirmedEarlyLeaveCount', confirmed_early_leave_count,
      'approvedPassCount', approved_pass_count,
      'approvedSwapCount', approved_swap_count,
      'confirmedPlannedReassignmentCount', confirmed_planned_reassignment_count,
      'confirmedOtherCount', confirmed_other_count,
      'unknownLateMinutesCount', unknown_late_minutes_count,
      'verifiedLateMinutesTotal', verified_late_minutes_total
    ) FROM global_summary),
    'staff', coalesce((
      SELECT jsonb_agg(to_jsonb(per_staff) || jsonb_build_object('items', coalesce(details.items, '[]'::jsonb))
                       ORDER BY per_staff.staff_id)
      FROM per_staff LEFT JOIN details USING (staff_id)
    ), '[]'::jsonb)
  ) INTO v_result;
  RETURN v_result;
END;
$function$;

ALTER FUNCTION public.rc19_workforce_incident_monthly_v2(date,text,text,text,uuid,text,text,text,integer,integer) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.rc19_workforce_incident_monthly_v2(date,text,text,text,uuid,text,text,text,integer,integer)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.rc19_workforce_incident_monthly_v2(date,text,text,text,uuid,text,text,text,integer,integer)
  TO authenticated;
COMMENT ON FUNCTION public.rc19_workforce_incident_monthly_v2(date,text,text,text,uuid,text,text,text,integer,integer) IS
  'Filtered, authorized monthly incident read model. Counts and distinct shift/staff totals are computed before pagination; Leader rows require both active Brand permission and canonical Agency membership.';

COMMIT;
