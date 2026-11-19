BEGIN;

DO $guard$
BEGIN
  IF to_regclass('public.shifts') IS NULL
    OR to_regclass('public.shift_registrations') IS NULL
    OR to_regclass('public.shift_staffing_segments') IS NULL
    OR to_regclass('public.swap_requests') IS NULL
    OR to_regprocedure('private.require_shift_actor(boolean)') IS NULL
    OR to_regprocedure('private.assert_shift_role_eligibility(text,text)') IS NULL
    OR to_regprocedure('private.assert_no_shift_registration_conflict(text,public.shifts,text,text)') IS NULL
    OR to_regprocedure('private.assert_shift_capacity(public.shifts,text,text)') IS NULL
    OR to_regprocedure('private.can_read_shift(text)') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'W4_SWAP_PREFLIGHT_BASELINE_PRECONDITION_FAILED';
  END IF;
END;
$guard$;

-- Serialize capacity checks on the segment row; the authoritative write path
-- still validates the same invariant in its transaction.
CREATE OR REPLACE FUNCTION private.enforce_staffing_segment_capacity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  segment public.shift_staffing_segments%ROWTYPE;
  capacity integer;
  active_count integer;
BEGIN
  IF NEW.status NOT IN ('approved', 'manually_assigned') OR NEW.staffing_segment_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE'
    AND NEW.status IS NOT DISTINCT FROM OLD.status
    AND NEW.staffing_segment_id IS NOT DISTINCT FROM OLD.staffing_segment_id
    AND NEW.operational_role IS NOT DISTINCT FROM OLD.operational_role
    AND NEW.shift_id IS NOT DISTINCT FROM OLD.shift_id THEN
    RETURN NEW;
  END IF;

  SELECT * INTO segment
  FROM public.shift_staffing_segments
  WHERE id = NEW.staffing_segment_id AND shift_id = NEW.shift_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ASSIGNMENT_SEGMENT_MISMATCH';
  END IF;

  capacity := CASE NEW.operational_role::text
    WHEN 'host' THEN segment.required_host_count
    WHEN 'support' THEN segment.required_support_count
    WHEN 'technical' THEN segment.required_technical_count
    ELSE 0
  END;
  IF capacity <= 0 THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ASSIGNMENT_SEGMENT_ROLE_INCOMPATIBLE';
  END IF;

  SELECT count(*) INTO active_count
  FROM public.shift_registrations
  WHERE staffing_segment_id = NEW.staffing_segment_id
    AND operational_role = NEW.operational_role
    AND status IN ('approved', 'manually_assigned')
    AND id IS DISTINCT FROM NEW.id;
  IF active_count + 1 > capacity THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'STAFFING_SEGMENT_CAPACITY_EXCEEDED';
  END IF;
  RETURN NEW;
END;
$$;
ALTER FUNCTION private.enforce_staffing_segment_capacity() OWNER TO postgres;
REVOKE ALL ON FUNCTION private.enforce_staffing_segment_capacity() FROM PUBLIC, anon, authenticated, service_role;

DROP TRIGGER IF EXISTS shift_registrations_enforce_segment_capacity ON public.shift_registrations;
CREATE TRIGGER shift_registrations_enforce_segment_capacity
BEFORE INSERT OR UPDATE OF shift_id, staffing_segment_id, operational_role, status
ON public.shift_registrations
FOR EACH ROW EXECUTE FUNCTION private.enforce_staffing_segment_capacity();

CREATE OR REPLACE FUNCTION private.swap_conflict_exists(
  p_user_id text,
  p_shift_id text,
  p_role text,
  p_exclude_registration_id text DEFAULT NULL
) RETURNS boolean
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
  target_shift public.shifts;
  error_message text;
BEGIN
  SELECT * INTO target_shift FROM public.shifts WHERE id = p_shift_id;
  IF target_shift.id IS NULL THEN RETURN true; END IF;
  BEGIN
    PERFORM private.assert_no_shift_registration_conflict(p_user_id, target_shift, p_role, p_exclude_registration_id);
    RETURN false;
  EXCEPTION
    WHEN unique_violation THEN RETURN true;
    WHEN SQLSTATE 'P0001' THEN
      GET STACKED DIAGNOSTICS error_message = MESSAGE_TEXT;
      IF error_message IN ('SHIFT_CONFLICT', 'MULTI_ROLE_NOT_ALLOWED') THEN RETURN true; END IF;
      RAISE;
  END;
END;
$$;
REVOKE ALL ON FUNCTION private.swap_conflict_exists(text, text, text, text) FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.check_shift_swap_conflict(
  p_source_registration_id text,
  p_mode text,
  p_replacement_staff_id text DEFAULT NULL,
  p_target_shift_id text DEFAULT NULL,
  p_counterpart_registration_id text DEFAULT NULL
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_id text := private.require_shift_actor(false);
  source_registration public.shift_registrations;
  counterpart_registration public.shift_registrations;
  source_shift public.shifts;
  target_shift public.shifts;
  source_segment public.shift_staffing_segments;
  target_segment public.shift_staffing_segments;
  candidate public.business_users;
  role_name text;
  source_capacity integer;
  target_capacity integer;
  active_count integer;
BEGIN
  IF p_source_registration_id IS NULL OR p_mode IS NULL OR p_mode NOT IN ('replacement', 'exchange') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SWAP_PREFLIGHT_PAYLOAD_INVALID';
  END IF;

  SELECT * INTO source_registration
  FROM public.shift_registrations
  WHERE id = p_source_registration_id
  FOR UPDATE;
  IF source_registration.id IS NULL OR source_registration.user_id <> actor_id THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'SWAP_NOT_OWNER';
  END IF;
  IF source_registration.status NOT IN ('approved', 'manually_assigned') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SOURCE_NOT_ACTIVE';
  END IF;

  SELECT * INTO source_shift
  FROM public.shifts
  WHERE id = source_registration.shift_id
  FOR SHARE;
  IF source_shift.id IS NULL OR source_shift.deleted_at IS NOT NULL OR source_shift.archived_at IS NOT NULL
    OR source_shift.status <> 'scheduled' OR NOT private.can_read_shift(source_shift.id) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SOURCE_SHIFT_NOT_SCHEDULED';
  END IF;
  role_name := source_registration.operational_role::text;
  PERFORM private.assert_shift_role_eligibility(actor_id, role_name);

  IF p_mode = 'replacement' THEN
    IF p_replacement_staff_id IS NULL OR p_target_shift_id IS NOT NULL
      OR p_counterpart_registration_id IS NOT NULL OR p_replacement_staff_id = actor_id THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SWAP_REPLACEMENT_PAYLOAD_INVALID';
    END IF;
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_replacement_staff_id, 91731));
    SELECT * INTO candidate FROM public.business_users
    WHERE id = p_replacement_staff_id AND status = 'active' AND account_status = 'active'
      AND archived_at IS NULL AND deleted_at IS NULL;
    IF candidate.id IS NULL THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'REPLACEMENT_INACTIVE'; END IF;
    PERFORM private.assert_shift_role_eligibility(candidate.id, role_name);
    IF EXISTS (SELECT 1 FROM public.shift_registrations
      WHERE shift_id = source_shift.id AND user_id = candidate.id
        AND status IN ('approved', 'manually_assigned')) THEN RETURN 'CONFLICT'; END IF;

    IF source_registration.staffing_segment_id IS NULL THEN
      PERFORM private.assert_shift_capacity(source_shift, role_name, source_registration.id);
    ELSE
      SELECT * INTO source_segment FROM public.shift_staffing_segments
      WHERE id = source_registration.staffing_segment_id AND shift_id = source_shift.id FOR SHARE;
      IF source_segment.id IS NULL THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SOURCE_SEGMENT_INVALID'; END IF;
      source_capacity := CASE role_name WHEN 'host' THEN source_segment.required_host_count
        WHEN 'support' THEN source_segment.required_support_count ELSE source_segment.required_technical_count END;
      SELECT count(*) INTO active_count FROM public.shift_registrations
      WHERE staffing_segment_id = source_segment.id AND operational_role::text = role_name
        AND status IN ('approved', 'manually_assigned') AND id <> source_registration.id;
      IF source_capacity <= 0 OR active_count + 1 > source_capacity THEN RETURN 'CONFLICT'; END IF;
    END IF;
    IF private.swap_conflict_exists(candidate.id, source_shift.id, role_name, NULL) THEN RETURN 'CONFLICT'; END IF;
    RETURN 'VERIFIED_CLEAR';
  END IF;

  IF p_replacement_staff_id IS NOT NULL OR p_target_shift_id IS NULL
    OR p_counterpart_registration_id IS NULL OR p_target_shift_id = source_shift.id THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SWAP_EXCHANGE_PAYLOAD_INVALID';
  END IF;
  SELECT * INTO target_shift FROM public.shifts WHERE id = p_target_shift_id FOR SHARE;
  IF target_shift.id IS NULL OR target_shift.deleted_at IS NOT NULL OR target_shift.archived_at IS NOT NULL
    OR target_shift.status <> 'scheduled' OR NOT private.can_read_shift(target_shift.id) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'TARGET_SHIFT_NOT_ELIGIBLE';
  END IF;
  SELECT * INTO counterpart_registration FROM public.shift_registrations
  WHERE id = p_counterpart_registration_id AND shift_id = target_shift.id FOR UPDATE;
  IF counterpart_registration.id IS NULL OR counterpart_registration.operational_role::text <> role_name
    OR counterpart_registration.status NOT IN ('approved', 'manually_assigned')
    OR counterpart_registration.user_id = actor_id THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'COUNTERPART_NOT_ELIGIBLE';
  END IF;
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(counterpart_registration.user_id, 91731));
  SELECT * INTO candidate FROM public.business_users
  WHERE id = counterpart_registration.user_id AND status = 'active' AND account_status = 'active'
    AND archived_at IS NULL AND deleted_at IS NULL;
  IF candidate.id IS NULL THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'COUNTERPART_INACTIVE'; END IF;
  PERFORM private.assert_shift_role_eligibility(candidate.id, role_name);

  IF source_registration.staffing_segment_id IS NULL THEN
    PERFORM private.assert_shift_capacity(target_shift, role_name, counterpart_registration.id);
  ELSE
    SELECT * INTO target_segment FROM public.shift_staffing_segments
    WHERE id = counterpart_registration.staffing_segment_id AND shift_id = target_shift.id FOR SHARE;
    IF target_segment.id IS NULL THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'TARGET_SEGMENT_INVALID'; END IF;
    target_capacity := CASE role_name WHEN 'host' THEN target_segment.required_host_count
      WHEN 'support' THEN target_segment.required_support_count ELSE target_segment.required_technical_count END;
    SELECT count(*) INTO active_count FROM public.shift_registrations
    WHERE staffing_segment_id = target_segment.id AND operational_role::text = role_name
      AND status IN ('approved', 'manually_assigned') AND id <> counterpart_registration.id;
    IF target_capacity <= 0 OR active_count + 1 > target_capacity THEN RETURN 'CONFLICT'; END IF;
  END IF;

  IF counterpart_registration.staffing_segment_id IS NULL THEN
    PERFORM private.assert_shift_capacity(source_shift, role_name, source_registration.id);
  ELSE
    SELECT * INTO source_segment FROM public.shift_staffing_segments
    WHERE id = source_registration.staffing_segment_id AND shift_id = source_shift.id FOR SHARE;
    IF source_segment.id IS NULL THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SOURCE_SEGMENT_INVALID'; END IF;
    source_capacity := CASE role_name WHEN 'host' THEN source_segment.required_host_count
      WHEN 'support' THEN source_segment.required_support_count ELSE source_segment.required_technical_count END;
    SELECT count(*) INTO active_count FROM public.shift_registrations
    WHERE staffing_segment_id = source_segment.id AND operational_role::text = role_name
      AND status IN ('approved', 'manually_assigned') AND id <> source_registration.id;
    IF source_capacity <= 0 OR active_count + 1 > source_capacity THEN RETURN 'CONFLICT'; END IF;
  END IF;

  IF private.swap_conflict_exists(actor_id, target_shift.id, role_name, source_registration.id)
    OR private.swap_conflict_exists(candidate.id, source_shift.id, role_name, counterpart_registration.id) THEN
    RETURN 'CONFLICT';
  END IF;
  RETURN 'VERIFIED_CLEAR';
END;
$$;
ALTER FUNCTION public.check_shift_swap_conflict(text, text, text, text, text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.check_shift_swap_conflict(text, text, text, text, text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.check_shift_swap_conflict(text, text, text, text, text) TO authenticated;

DO $verify$
BEGIN
  IF has_function_privilege('anon', 'public.check_shift_swap_conflict(text,text,text,text,text)', 'EXECUTE')
    OR NOT has_function_privilege('authenticated', 'public.check_shift_swap_conflict(text,text,text,text,text)', 'EXECUTE')
    OR has_function_privilege('authenticated', 'private.enforce_staffing_segment_capacity()', 'EXECUTE') THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'W4_SWAP_PREFLIGHT_PRIVILEGE_CHECK_FAILED';
  END IF;
END;
$verify$;

COMMIT;
