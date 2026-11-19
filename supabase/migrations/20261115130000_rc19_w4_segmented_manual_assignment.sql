BEGIN;

DO $guard$
BEGIN
  IF to_regclass('public.shifts') IS NULL
    OR to_regclass('public.shift_registrations') IS NULL
    OR to_regclass('public.shift_staffing_segments') IS NULL
    OR to_regprocedure('private.require_shift_actor(boolean)') IS NULL
    OR to_regprocedure('private.assert_shift_role_eligibility(text,text)') IS NULL
    OR to_regprocedure('private.assert_no_shift_registration_conflict(text,public.shifts,text,text)') IS NULL
    OR to_regprocedure('public.rbac01_effective_permission(text)') IS NULL
    OR to_regprocedure('private.rc19_has_any_leader_brand_scope(text,text[])') IS NULL
    OR to_regprocedure('private.refresh_shift_registration_lock(text,boolean)') IS NULL
    OR to_regprocedure('private.assert_expected_version(text,integer,integer)') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'W4_SEGMENT_ASSIGNMENT_BASELINE_PRECONDITION_FAILED';
  END IF;
END;
$guard$;

CREATE OR REPLACE FUNCTION private.insert_manual_shift_assignment_to_segment(
  p_shift_id text,
  p_user_id text,
  p_role text,
  p_actor_id text,
  p_notes text,
  p_staffing_segment_id text
)
RETURNS public.shift_registrations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  target_shift public.shifts;
  created_registration public.shift_registrations;
BEGIN
  SELECT * INTO target_shift
  FROM public.shifts
  WHERE id = p_shift_id AND deleted_at IS NULL AND archived_at IS NULL
  FOR UPDATE;
  IF target_shift.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SHIFT_NOT_FOUND';
  END IF;
  IF target_shift.status <> 'scheduled' OR target_shift.registration_locked THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SHIFT_NOT_OPEN';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id, 91731));
  PERFORM private.assert_shift_role_eligibility(p_user_id, p_role);
  PERFORM private.assert_no_shift_registration_conflict(p_user_id, target_shift, p_role, NULL);

  INSERT INTO public.shift_registrations (
    shift_id, user_id, operational_role, status, source,
    reviewed_by, reviewed_at, review_notes, staffing_segment_id
  ) VALUES (
    p_shift_id, p_user_id, p_role, 'manually_assigned', 'manual_assignment',
    p_actor_id, statement_timestamp(), p_notes, p_staffing_segment_id
  ) RETURNING * INTO created_registration;

  PERFORM private.refresh_shift_registration_lock(p_shift_id, false);
  RETURN created_registration;
END;
$$;
ALTER FUNCTION private.insert_manual_shift_assignment_to_segment(text,text,text,text,text,text) OWNER TO postgres;
REVOKE ALL ON FUNCTION private.insert_manual_shift_assignment_to_segment(text,text,text,text,text,text)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.manual_assign_shift_staff_to_segment(
  p_shift_id text,
  p_user_id text,
  p_role text,
  p_notes text,
  p_expected_version integer,
  p_staffing_segment_id text
)
RETURNS public.shift_registrations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_id text;
  target_shift public.shifts;
  current_version integer;
BEGIN
  actor_id := private.require_shift_actor(true);
  IF NOT private.current_business_user_is_active()
    OR NOT public.rbac01_effective_permission('shifts.assign_staff') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'STAFFING_PERMISSION_REQUIRED';
  END IF;
  IF p_shift_id IS NULL OR btrim(p_shift_id) = '' OR p_user_id IS NULL OR btrim(p_user_id) = ''
    OR p_staffing_segment_id IS NULL OR btrim(p_staffing_segment_id) = ''
    OR p_role IS NULL OR p_role NOT IN ('host','support','technical') OR p_expected_version IS NULL
    OR p_expected_version < 1 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SEGMENT_ASSIGNMENT_REQUEST_INVALID';
  END IF;

  SELECT * INTO target_shift
  FROM public.shifts
  WHERE id = p_shift_id AND deleted_at IS NULL AND archived_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SHIFT_NOT_FOUND';
  END IF;
  IF private.current_system_permission() = 'leader'
    AND NOT private.rc19_has_any_leader_brand_scope(target_shift.brand_id, ARRAY['shifts.manage']::text[]) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'LEADER_BRAND_SCOPE_REQUIRED';
  END IF;
  current_version := target_shift.version;
  PERFORM private.assert_expected_version('Shift', p_expected_version, current_version);

  RETURN private.insert_manual_shift_assignment_to_segment(
    p_shift_id, p_user_id, p_role, actor_id, p_notes, p_staffing_segment_id
  );
END;
$$;
ALTER FUNCTION public.manual_assign_shift_staff_to_segment(text,text,text,text,integer,text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.manual_assign_shift_staff_to_segment(text,text,text,text,integer,text)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.manual_assign_shift_staff_to_segment(text,text,text,text,integer,text)
  TO authenticated;
COMMENT ON FUNCTION public.manual_assign_shift_staff_to_segment(text,text,text,text,integer,text) IS
  'Assigns staff to an explicitly selected persisted staffing segment with actor, permission, Brand, version, qualification, availability and segment-capacity checks.';

COMMIT;
