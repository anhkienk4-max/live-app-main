BEGIN;

DO $guard$
BEGIN
  IF to_regclass('public.shift_registrations') IS NULL
    OR to_regclass('public.shift_staffing_segments') IS NULL
    OR to_regprocedure('private.c511_guard_segment_registration()') IS NULL
    OR to_regprocedure('public.replace_shift_assignment(text,text,text,text,text,integer,integer,timestamp with time zone,text,boolean,uuid)') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'W4_LEGACY_SEGMENT_COMPATIBILITY_PRECONDITION_FAILED';
  END IF;
END;
$guard$;

CREATE OR REPLACE FUNCTION private.c511_guard_segment_registration()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_segment public.shift_staffing_segments%ROWTYPE;
  v_shift public.shifts%ROWTYPE;
  v_segment_count integer;
  v_role_segment_count integer;
  v_filled integer;
  v_capacity smallint;
BEGIN
  IF NEW.status IN ('approved', 'manually_assigned')
    AND private.current_system_permission() = 'leader'
    AND NOT private.rc19_has_any_leader_brand_scope(
      (SELECT s.brand_id FROM public.shifts s WHERE s.id = NEW.shift_id),
      ARRAY['shifts.manage']::text[]
    ) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'LEADER_BRAND_SCOPE_REQUIRED';
  END IF;

  IF NEW.staffing_segment_id IS NULL THEN
    IF TG_OP <> 'INSERT' THEN
      RETURN NEW;
    END IF;

    SELECT s.* INTO v_shift
    FROM public.shifts s
    WHERE s.id = NEW.shift_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RETURN NEW;
    END IF;

    SELECT count(*), count(*) FILTER (WHERE CASE NEW.operational_role
      WHEN 'host' THEN s.required_host_count
      WHEN 'support' THEN s.required_support_count
      WHEN 'technical' THEN s.required_technical_count
      ELSE 0
    END > 0)
    INTO v_segment_count, v_role_segment_count
    FROM public.shift_staffing_segments s
    WHERE s.shift_id = NEW.shift_id;

    IF v_segment_count = 0 THEN
      RETURN NEW;
    END IF;
    IF v_role_segment_count = 0 THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'STAFFING_SEGMENT_ROLE_INCOMPATIBLE';
    END IF;
    IF v_role_segment_count > 1 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'STAFFING_SEGMENT_SELECTION_REQUIRED';
    END IF;

    SELECT s.* INTO v_segment
    FROM public.shift_staffing_segments s
    WHERE s.shift_id = NEW.shift_id
      AND CASE NEW.operational_role
        WHEN 'host' THEN s.required_host_count
        WHEN 'support' THEN s.required_support_count
        WHEN 'technical' THEN s.required_technical_count
        ELSE 0
      END > 0;
    NEW.staffing_segment_id := v_segment.id;
  ELSE
    SELECT s.* INTO v_segment
    FROM public.shift_staffing_segments s
    WHERE s.id = NEW.staffing_segment_id AND s.shift_id = NEW.shift_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'STAFFING_SEGMENT_SHIFT_MISMATCH';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.staffing_segment_id IS NOT NULL
    AND OLD.staffing_segment_id <> NEW.staffing_segment_id THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'STAFFING_SEGMENT_REGISTRATION_IMMUTABLE';
  END IF;

  IF NEW.status IN ('approved', 'manually_assigned') THEN
    v_capacity := CASE NEW.operational_role
      WHEN 'host' THEN v_segment.required_host_count
      WHEN 'support' THEN v_segment.required_support_count
      WHEN 'technical' THEN v_segment.required_technical_count
      ELSE NULL
    END;
    IF v_capacity IS NULL OR v_capacity <= 0 THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'STAFFING_SEGMENT_ROLE_INCOMPATIBLE';
    END IF;
    SELECT count(*) INTO v_filled
    FROM public.shift_registrations r
    WHERE r.staffing_segment_id = v_segment.id
      AND r.operational_role = NEW.operational_role
      AND r.status IN ('approved', 'manually_assigned')
      AND r.id <> NEW.id;
    IF v_filled >= v_capacity THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'STAFFING_SEGMENT_FULL';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
ALTER FUNCTION private.c511_guard_segment_registration() OWNER TO postgres;
REVOKE ALL ON FUNCTION private.c511_guard_segment_registration() FROM PUBLIC, anon, authenticated, service_role;
CREATE OR REPLACE FUNCTION public.replace_shift_assignment(
  p_shift_id text,
  p_staffing_segment_id text,
  p_registration_id text,
  p_replacement_user_id text,
  p_role text,
  p_expected_shift_version integer,
  p_expected_registration_version integer,
  p_effective_at timestamptz,
  p_reason text,
  p_is_emergency boolean,
  p_idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_actor_id text;
  v_permission text;
  v_now timestamptz := statement_timestamp();
  v_effective_at timestamptz;
  v_shift public.shifts%ROWTYPE;
  v_segment public.shift_staffing_segments%ROWTYPE;
  v_old public.shift_registrations%ROWTYPE;
  v_old_assignment_snapshot jsonb;
  v_new public.shift_registrations%ROWTYPE;
  v_receipt public.rc19_shift_assignment_replacements%ROWTYPE;
  v_request jsonb;
  v_replacement_id uuid := gen_random_uuid();
  v_active_count integer;
  v_roster jsonb;
  v_replayed boolean := false;
BEGIN
  v_actor_id := private.require_shift_actor(true);
  v_permission := private.current_system_permission();

  IF v_actor_id IS NULL OR NOT private.current_business_user_is_active()
    OR v_permission NOT IN ('admin', 'leader') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'ACTOR_NOT_AUTHORIZED';
  END IF;
  IF NOT public.rbac01_effective_permission('shifts.assign_staff') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'STAFFING_PERMISSION_REQUIRED';
  END IF;
  IF p_is_emergency IS NULL OR (p_is_emergency AND v_permission <> 'admin') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'EMERGENCY_REPLACEMENT_ADMIN_ONLY';
  END IF;
  IF p_shift_id IS NULL OR btrim(p_shift_id) = ''
    OR p_staffing_segment_id IS NULL OR btrim(p_staffing_segment_id) = ''
    OR p_registration_id IS NULL OR btrim(p_registration_id) = ''
    OR p_replacement_user_id IS NULL OR btrim(p_replacement_user_id) = ''
    OR p_role IS NULL OR p_role NOT IN ('host', 'support', 'technical')
    OR p_expected_shift_version IS NULL OR p_expected_shift_version < 1
    OR p_expected_registration_version IS NULL OR p_expected_registration_version < 1
    OR p_effective_at IS NULL
    OR p_idempotency_key IS NULL
    OR p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 1 AND 1000 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'REPLACEMENT_REQUEST_INVALID';
  END IF;

  SELECT * INTO v_shift
  FROM public.shifts
  WHERE id = p_shift_id AND deleted_at IS NULL AND archived_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SHIFT_NOT_FOUND';
  END IF;

  IF v_permission = 'leader'
    AND NOT private.rc19_has_any_leader_brand_scope(v_shift.brand_id, ARRAY['shifts.manage']::text[]) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'LEADER_BRAND_SCOPE_REQUIRED';
  END IF;

  SELECT * INTO v_segment
  FROM public.shift_staffing_segments
  WHERE id = p_staffing_segment_id AND shift_id = p_shift_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'STAFFING_SEGMENT_SHIFT_MISMATCH';
  END IF;

  v_request := jsonb_build_object(
    'shift_id', p_shift_id,
    'staffing_segment_id', p_staffing_segment_id,
    'registration_id', p_registration_id,
    'replacement_user_id', p_replacement_user_id,
    'role', p_role,
    'expected_shift_version', p_expected_shift_version,
    'expected_registration_version', p_expected_registration_version,
    'effective_at_epoch', extract(epoch FROM p_effective_at)::numeric,
    'reason', btrim(p_reason),
    'is_emergency', p_is_emergency
  );

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_actor_id || ':' || p_idempotency_key::text, 91732)
  );
  SELECT * INTO v_receipt
  FROM public.rc19_shift_assignment_replacements
  WHERE actor_business_user_id = v_actor_id AND idempotency_key = p_idempotency_key
  FOR UPDATE;
  IF FOUND THEN
    IF v_receipt.request_payload IS DISTINCT FROM v_request THEN
      RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'IDEMPOTENCY_KEY_REUSED';
    END IF;
    SELECT * INTO v_new FROM public.shift_registrations WHERE id = v_receipt.new_registration_id;
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'registration_id', r.id,
      'user_id', r.user_id,
      'role', r.operational_role,
      'status', r.status,
      'version', r.version
    ) ORDER BY r.operational_role, r.requested_at, r.id), '[]'::jsonb)
    INTO v_roster
    FROM public.shift_registrations r
    WHERE r.staffing_segment_id = p_staffing_segment_id
      AND r.status IN ('approved', 'manually_assigned');
    SELECT version INTO v_shift.version FROM public.shifts WHERE id = p_shift_id;
    v_replayed := true;
    RETURN jsonb_build_object(
      'replacement_id', v_receipt.id,
      'shift_id', p_shift_id,
      'staffing_segment_id', p_staffing_segment_id,
      'old_registration_id', v_receipt.old_registration_id,
      'registration', jsonb_build_object(
        'id', v_new.id, 'shift_id', v_new.shift_id, 'user_id', v_new.user_id,
        'operational_role', v_new.operational_role, 'status', v_new.status,
        'source', v_new.source, 'staffing_segment_id', v_new.staffing_segment_id,
        'reviewed_by', v_new.reviewed_by, 'reviewed_at', v_new.reviewed_at,
        'review_notes', v_new.review_notes, 'version', v_new.version
      ),
      'effective_at', v_receipt.effective_at,
      'shift_version', v_shift.version,
      'roster', v_roster,
      'replayed', v_replayed
    );
  END IF;

  IF v_shift.version <> p_expected_shift_version THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'SHIFT_VERSION_CONFLICT';
  END IF;
  IF v_shift.status IN ('completed', 'cancelled') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SHIFT_NOT_REPLACEABLE';
  END IF;
  IF NOT p_is_emergency AND v_shift.status NOT IN ('scheduled', 'preparing') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'EMERGENCY_REPLACEMENT_REQUIRED';
  END IF;

  IF p_is_emergency THEN
    IF p_effective_at > v_now OR p_effective_at < v_segment.start_at OR p_effective_at >= v_segment.end_at THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'EMERGENCY_EFFECTIVE_TIME_OUTSIDE_SEGMENT';
    END IF;
    v_effective_at := p_effective_at;
  ELSE
    IF p_effective_at < v_now - interval '30 seconds'
      OR p_effective_at > v_now + interval '30 seconds' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'REPLACEMENT_EFFECTIVE_TIME_INVALID';
    END IF;
    v_effective_at := v_now;
  END IF;

  SELECT * INTO v_old
  FROM public.shift_registrations
  WHERE id = p_registration_id AND shift_id = p_shift_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ASSIGNMENT_NOT_FOUND';
  END IF;
  IF v_old.version <> p_expected_registration_version THEN
    RAISE EXCEPTION USING ERRCODE = '40001', MESSAGE = 'REGISTRATION_VERSION_CONFLICT';
  END IF;
  IF v_old.status NOT IN ('approved', 'manually_assigned') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'ASSIGNMENT_NOT_ACTIVE';
  END IF;
  IF v_old.staffing_segment_id IS NOT NULL
    AND v_old.staffing_segment_id IS DISTINCT FROM p_staffing_segment_id THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'ASSIGNMENT_SEGMENT_MISMATCH';
  END IF;
  IF v_old.staffing_segment_id IS NULL AND (CASE p_role
    WHEN 'host' THEN v_segment.required_host_count
    WHEN 'support' THEN v_segment.required_support_count
    ELSE v_segment.required_technical_count
  END) <= 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'ASSIGNMENT_SEGMENT_ROLE_INCOMPATIBLE';
  END IF;
  IF v_old.operational_role IS DISTINCT FROM p_role THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'ASSIGNMENT_ROLE_MISMATCH';
  END IF;
  IF v_old.user_id = p_replacement_user_id THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'REPLACEMENT_TARGET_IS_CURRENT_STAFF';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_replacement_user_id, 91731));
  PERFORM private.assert_shift_role_eligibility(p_replacement_user_id, p_role);
  PERFORM private.assert_no_shift_registration_conflict(p_replacement_user_id, v_shift, p_role, p_registration_id);

  SELECT count(*) INTO v_active_count
  FROM public.shift_registrations r
  WHERE r.staffing_segment_id = p_staffing_segment_id
    AND r.operational_role = p_role
    AND r.status IN ('approved', 'manually_assigned')
    AND r.id <> p_registration_id;
  IF v_active_count + 1 > (CASE p_role
    WHEN 'host' THEN v_segment.required_host_count
    WHEN 'support' THEN v_segment.required_support_count
    ELSE v_segment.required_technical_count
  END) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'STAFFING_SEGMENT_CAPACITY_EXCEEDED';
  END IF;

  v_old_assignment_snapshot := jsonb_build_object(
    'id', v_old.id, 'user_id', v_old.user_id, 'status', v_old.status,
    'operational_role', v_old.operational_role, 'source', v_old.source,
    'staffing_segment_id', v_old.staffing_segment_id, 'version', v_old.version,
    'reviewed_by', v_old.reviewed_by, 'reviewed_at', v_old.reviewed_at,
    'review_notes', v_old.review_notes, 'cancelled_at', v_old.cancelled_at
  );

  UPDATE public.shift_registrations
  SET status = 'removed',
      reviewed_by = v_actor_id,
      reviewed_at = v_now,
      review_notes = concat_ws(E'\n', nullif(btrim(review_notes), ''), 'REPLACED: ' || btrim(p_reason)),
      cancelled_at = v_now
  WHERE id = v_old.id
  RETURNING * INTO v_old;

  INSERT INTO public.shift_registrations (
    shift_id, user_id, operational_role, status, source,
    requested_at, reviewed_by, reviewed_at, review_notes, staffing_segment_id
  ) VALUES (
    p_shift_id, p_replacement_user_id, p_role, 'manually_assigned', 'manual_assignment',
    v_now, v_actor_id, v_now, btrim(p_reason), p_staffing_segment_id
  ) RETURNING * INTO v_new;

  UPDATE public.shifts SET updated_at = v_now, updated_by = v_actor_id WHERE id = p_shift_id;
  SELECT version INTO v_shift.version FROM public.shifts WHERE id = p_shift_id;

  INSERT INTO public.rc19_shift_assignment_replacements (
    id, actor_business_user_id, idempotency_key, request_payload,
    shift_id, staffing_segment_id, old_registration_id, new_registration_id,
    old_user_id, replacement_user_id, operational_role, old_assignment_snapshot,
    expected_shift_version, expected_registration_version, effective_at, reason, is_emergency
  ) VALUES (
    v_replacement_id, v_actor_id, p_idempotency_key, v_request,
    p_shift_id, p_staffing_segment_id, v_old.id, v_new.id,
    v_old.user_id, p_replacement_user_id, p_role,
    v_old_assignment_snapshot,
    p_expected_shift_version, p_expected_registration_version, v_effective_at,
    btrim(p_reason), p_is_emergency
  ) RETURNING * INTO v_receipt;

  PERFORM private.log_shift_audit(
    'staffing', 'assignment_replaced', 'shift_registration', v_new.id,
    btrim(p_reason),
    jsonb_build_object(
      'replacement_id', v_receipt.id,
      'old_registration_id', v_old.id,
      'new_registration_id', v_new.id,
      'staffing_segment_id', p_staffing_segment_id,
      'operational_role', p_role,
      'effective_at', v_effective_at,
      'is_emergency', p_is_emergency,
      'legacy_parent_assignment_mapped', v_old.staffing_segment_id IS NULL,
      'expected_shift_version', p_expected_shift_version,
      'expected_registration_version', p_expected_registration_version
    ),
    ARRAY[p_shift_id]::text[]
  );

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'registration_id', r.id,
    'user_id', r.user_id,
    'role', r.operational_role,
    'status', r.status,
    'version', r.version
  ) ORDER BY r.operational_role, r.requested_at, r.id), '[]'::jsonb)
  INTO v_roster
  FROM public.shift_registrations r
  WHERE r.staffing_segment_id = p_staffing_segment_id
    AND r.status IN ('approved', 'manually_assigned');

  RETURN jsonb_build_object(
    'replacement_id', v_receipt.id,
    'shift_id', p_shift_id,
    'staffing_segment_id', p_staffing_segment_id,
    'old_registration_id', v_old.id,
    'registration', jsonb_build_object(
      'id', v_new.id, 'shift_id', v_new.shift_id, 'user_id', v_new.user_id,
      'operational_role', v_new.operational_role, 'status', v_new.status,
      'source', v_new.source, 'staffing_segment_id', v_new.staffing_segment_id,
      'reviewed_by', v_new.reviewed_by, 'reviewed_at', v_new.reviewed_at,
      'review_notes', v_new.review_notes, 'version', v_new.version
    ),
    'effective_at', v_effective_at,
    'shift_version', v_shift.version,
    'roster', v_roster,
    'replayed', false
  );
END;
$$;
ALTER FUNCTION public.replace_shift_assignment(
  text, text, text, text, text, integer, integer, timestamptz, text, boolean, uuid
) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.replace_shift_assignment(
  text, text, text, text, text, integer, integer, timestamptz, text, boolean, uuid
) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.replace_shift_assignment(
  text, text, text, text, text, integer, integer, timestamptz, text, boolean, uuid
) TO authenticated;
COMMENT ON FUNCTION public.replace_shift_assignment(
  text, text, text, text, text, integer, integer, timestamptz, text, boolean, uuid
) IS 'Atomically replaces segment-linked assignments and permits an authorized explicit segment choice for legacy parent-level assignments without rewriting the original row.';

COMMIT;
