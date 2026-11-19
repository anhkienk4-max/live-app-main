BEGIN;

DO $guard$
BEGIN
  IF to_regclass('public.workforce_overtime_requests') IS NULL
    OR to_regclass('public.workforce_overtime_request_events') IS NULL
    OR to_regclass('public.workforce_actual_segments') IS NULL
    OR to_regclass('public.workforce_rate_cards') IS NULL
    OR to_regclass('public.workforce_payroll_periods') IS NULL
    OR to_regclass('public.workforce_payroll_lines') IS NULL
    OR to_regprocedure('private.current_business_user_id()') IS NULL
    OR to_regprocedure('private.current_business_user_is_active()') IS NULL
    OR to_regprocedure('private.current_system_permission()') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'W4_ATOMIC_OVERTIME_PAYROLL_SYNC_PRECONDITION_FAILED';
  END IF;
END;
$guard$;

-- Redefine rc19_c515_decide_overtime_request with atomic draft payroll synchronization.
-- When overtime is approved (admin_confirm) or rejected, any associated draft payroll line
-- is synchronously locked (FOR UPDATE) and its overtime fields and monetary amounts (gross_vnd, net_vnd)
-- are recalculated and updated atomically within the single PostgreSQL transaction.
-- Locked payroll periods (p.status = 'locked') are NEVER mutated.
CREATE OR REPLACE FUNCTION public.rc19_c515_decide_overtime_request(
  p_request_id uuid,
  p_expected_version integer,
  p_action text,
  p_reason text,
  p_idempotency_key uuid
) RETURNS public.workforce_overtime_requests
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_actor text := private.current_business_user_id();
  v_request public.workforce_overtime_requests%rowtype;
  v_segment public.workforce_actual_segments%rowtype;
  v_shift public.shifts%rowtype;
  v_rate public.workforce_rate_cards%rowtype;
  v_count integer;
  v_next text;
  v_action text;
  v_replay public.workforce_overtime_request_events%rowtype;
  v_line public.workforce_payroll_lines%rowtype;
  v_ot_mins integer;
  v_regular_secs integer;
  v_regular_mins integer;
  v_numerator bigint;
  v_gross bigint;
  v_net bigint;
  v_multiplier bigint;
BEGIN
  IF v_actor IS NULL OR NOT private.current_business_user_is_active()
    OR private.current_system_permission() NOT IN ('leader', 'admin') THEN
    RAISE EXCEPTION 'C515_OT_ACTOR_FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  IF p_idempotency_key IS NULL OR p_expected_version < 1 OR p_action NOT IN ('leader_preapprove', 'admin_confirm', 'reject')
    OR char_length(btrim(coalesce(p_reason, ''))) NOT BETWEEN 8 AND 2000 THEN
    RAISE EXCEPTION 'C515_OT_DECISION_INVALID';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('c515_ot_decide:' || p_idempotency_key::text, 0));

  SELECT * INTO v_replay FROM public.workforce_overtime_request_events WHERE idempotency_key = p_idempotency_key;
  IF FOUND THEN
    IF v_replay.request_id <> p_request_id
      OR v_replay.action IS DISTINCT FROM (CASE p_action WHEN 'admin_confirm' THEN 'admin_confirmed'
        WHEN 'reject' THEN 'rejected' ELSE p_action END)
      OR v_replay.reason <> btrim(p_reason) THEN
      RAISE EXCEPTION 'C515_OT_IDEMPOTENCY_CONFLICT' USING ERRCODE = '23505';
    END IF;
    SELECT * INTO v_request FROM public.workforce_overtime_requests WHERE id = p_request_id;
    RETURN v_request;
  END IF;

  SELECT * INTO v_request FROM public.workforce_overtime_requests WHERE id = p_request_id FOR UPDATE;
  IF NOT FOUND OR v_request.version <> p_expected_version THEN
    RAISE EXCEPTION 'C515_OT_STALE_REQUEST' USING ERRCODE = '40001';
  END IF;

  SELECT * INTO v_segment FROM public.workforce_actual_segments WHERE id = v_request.segment_id FOR SHARE;
  SELECT * INTO v_shift FROM public.shifts WHERE id = v_segment.shift_id AND deleted_at IS NULL;
  IF NOT FOUND OR v_segment.review_status <> 'approved' OR v_segment.event_kind <> 'worked'
    OR v_request.overtime_start_at < v_segment.actual_start_at OR v_request.overtime_end_at > v_segment.actual_end_at THEN
    RAISE EXCEPTION 'C515_OT_ACTUAL_CHANGED';
  END IF;

  IF private.current_system_permission() = 'leader' THEN
    IF NOT private.rc19_has_any_leader_brand_scope(v_shift.brand_id, ARRAY['staff.manage', 'workforce.read']) THEN
      RAISE EXCEPTION 'C515_OT_BRAND_SCOPE_DENIED' USING ERRCODE = '42501';
    END IF;
    IF p_action <> 'leader_preapprove' OR v_request.state <> 'pending_admin_confirmation'
      OR v_actor = v_segment.staff_id OR v_request.leader_preapproved_by IS NOT NULL THEN
      RAISE EXCEPTION 'C515_OT_ADMIN_CONFIRM_REQUIRED' USING ERRCODE = '42501';
    END IF;
    UPDATE public.workforce_overtime_requests
    SET leader_preapproved_by = v_actor,
        version = version + 1,
        updated_at = statement_timestamp()
    WHERE id = p_request_id
    RETURNING * INTO v_request;

    INSERT INTO public.workforce_overtime_request_events (
      request_id, actor_id, action, from_state, to_state, reason, version, idempotency_key
    ) VALUES (
      v_request.id, v_actor, 'leader_preapproved', 'pending_admin_confirmation', 'pending_admin_confirmation',
      btrim(p_reason), v_request.version, p_idempotency_key
    );
    RETURN v_request;
  END IF;

  IF p_action = 'leader_preapprove' THEN
    RAISE EXCEPTION 'C515_OT_LEADER_REQUIRED';
  END IF;

  IF v_actor = v_segment.staff_id OR (
    v_actor = v_request.requested_by
    AND NOT (private.current_system_permission() = 'admin' AND v_request.leader_preapproved_by IS NULL)
  ) THEN
    RAISE EXCEPTION 'C515_OT_SELF_CONFIRM_BLOCKED' USING ERRCODE = '42501';
  END IF;

  IF p_action = 'reject' THEN
    v_next := 'rejected';
    v_action := 'rejected';
  ELSE
    IF v_request.state <> 'pending_admin_confirmation' THEN
      RAISE EXCEPTION 'C515_OT_INVALID_TRANSITION';
    END IF;

    SELECT count(*) INTO v_count
    FROM public.workforce_rate_cards r
    WHERE r.operational_role = v_segment.operational_role
      AND r.approved_by IS NOT NULL AND r.approved_at IS NOT NULL
      AND (r.staff_id = v_segment.staff_id OR r.staff_id IS NULL)
      AND r.effective_from <= v_shift.date AND (r.effective_through IS NULL OR r.effective_through >= v_shift.date)
      AND (r.staff_id = v_segment.staff_id OR NOT EXISTS (
        SELECT 1 FROM public.workforce_rate_cards specific
        WHERE specific.staff_id = v_segment.staff_id AND specific.operational_role = v_segment.operational_role
          AND specific.approved_by IS NOT NULL AND specific.approved_at IS NOT NULL
          AND specific.effective_from <= v_shift.date AND (specific.effective_through IS NULL OR specific.effective_through >= v_shift.date)
      ));

    IF v_count <> 1 THEN
      RAISE EXCEPTION 'C515_OT_RATE_NOT_CONFIGURED';
    END IF;

    SELECT r.* INTO v_rate
    FROM public.workforce_rate_cards r
    WHERE r.operational_role = v_segment.operational_role
      AND r.approved_by IS NOT NULL AND r.approved_at IS NOT NULL
      AND (r.staff_id = v_segment.staff_id OR r.staff_id IS NULL)
      AND r.effective_from <= v_shift.date AND (r.effective_through IS NULL OR r.effective_through >= v_shift.date)
      AND (r.staff_id = v_segment.staff_id OR NOT EXISTS (
        SELECT 1 FROM public.workforce_rate_cards specific
        WHERE specific.staff_id = v_segment.staff_id AND specific.operational_role = v_segment.operational_role
          AND specific.approved_by IS NOT NULL AND specific.approved_at IS NOT NULL
          AND specific.effective_from <= v_shift.date AND (specific.effective_through IS NULL OR specific.effective_through >= v_shift.date)
      ));

    v_next := 'admin_confirmed';
    v_action := 'admin_confirmed';
  END IF;

  UPDATE public.workforce_overtime_requests
  SET state = v_next,
      admin_confirmed_by = CASE WHEN v_next = 'admin_confirmed' THEN v_actor ELSE NULL END,
      rate_card_id = CASE WHEN v_next = 'admin_confirmed' THEN v_rate.id ELSE NULL END,
      multiplier_basis_points = CASE WHEN v_next = 'admin_confirmed' THEN v_rate.overtime_multiplier_basis_points ELSE NULL END,
      version = version + 1,
      updated_at = statement_timestamp()
  WHERE id = p_request_id
  RETURNING * INTO v_request;

  INSERT INTO public.workforce_overtime_request_events (
    request_id, actor_id, action, from_state, to_state, reason, version, idempotency_key
  ) VALUES (
    v_request.id, v_actor, v_action, 'pending_admin_confirmation', v_next,
    btrim(p_reason), v_request.version, p_idempotency_key
  );

  -- ATOMIC PAYROLL DRAFT LINE SYNCHRONIZATION:
  IF v_next = 'admin_confirmed' THEN
    SELECT l.* INTO v_line
    FROM public.workforce_payroll_lines l
    JOIN public.workforce_payroll_periods p ON p.id = l.period_id
    WHERE l.segment_id = v_request.segment_id
      AND l.voided_at IS NULL
      AND p.status = 'draft'
    FOR UPDATE;

    IF FOUND THEN
      v_ot_mins := floor(v_request.overtime_seconds / 60)::integer;
      v_multiplier := v_rate.overtime_multiplier_basis_points::bigint;

      IF v_line.actual_seconds IS NOT NULL AND v_line.payable_seconds IS NOT NULL THEN
        v_regular_secs := v_line.payable_seconds - v_request.overtime_seconds;
        IF v_regular_secs < 0 THEN
          RAISE EXCEPTION 'C515_OT_EXCEEDS_PAYABLE_SECONDS';
        END IF;
        v_numerator := v_rate.vnd_per_hour::bigint * (v_regular_secs::bigint * 10000::bigint + v_request.overtime_seconds::bigint * v_multiplier);
        v_gross := (v_numerator + 18000000::bigint) / 36000000::bigint;
        v_net := v_gross + coalesce(v_line.adjustment_vnd, 0);
      ELSIF v_line.payable_minutes IS NOT NULL THEN
        v_regular_mins := v_line.payable_minutes - v_ot_mins;
        IF v_regular_mins < 0 THEN
          RAISE EXCEPTION 'C515_OT_EXCEEDS_PAYABLE_MINUTES';
        END IF;
        v_numerator := v_rate.vnd_per_hour::bigint * (v_regular_mins::bigint * 10000::bigint + v_ot_mins::bigint * v_multiplier);
        v_gross := (v_numerator + 300000::bigint) / 600000::bigint;
        v_net := v_gross + coalesce(v_line.adjustment_vnd, 0);
      ELSE
        v_gross := round((v_rate.vnd_per_hour::numeric * coalesce(v_line.payable_minutes, 0)::numeric) / 60.0)::bigint;
        v_net := v_gross + coalesce(v_line.adjustment_vnd, 0);
      END IF;

      UPDATE public.workforce_payroll_lines
      SET overtime_seconds = v_request.overtime_seconds,
          overtime_minutes = v_ot_mins,
          overtime_request_id = v_request.id,
          overtime_day_class = v_request.day_class,
          overtime_time_class = v_request.time_class,
          overtime_multiplier_basis_points = v_rate.overtime_multiplier_basis_points,
          rate_card_id = v_rate.id,
          gross_vnd = v_gross,
          net_vnd = v_net,
          version = version + 1,
          updated_at = statement_timestamp()
      WHERE id = v_line.id;
    END IF;
  ELSIF v_next = 'rejected' THEN
    SELECT l.* INTO v_line
    FROM public.workforce_payroll_lines l
    JOIN public.workforce_payroll_periods p ON p.id = l.period_id
    WHERE l.overtime_request_id = v_request.id
      AND l.voided_at IS NULL
      AND p.status = 'draft'
    FOR UPDATE;

    IF FOUND THEN
      IF v_line.actual_seconds IS NOT NULL AND v_line.payable_seconds IS NOT NULL THEN
        v_numerator := v_line.rate_vnd_per_hour::bigint * v_line.payable_seconds::bigint * 10000::bigint;
        v_gross := (v_numerator + 18000000::bigint) / 36000000::bigint;
        v_net := v_gross + coalesce(v_line.adjustment_vnd, 0);
      ELSIF v_line.payable_minutes IS NOT NULL THEN
        v_numerator := v_line.rate_vnd_per_hour::bigint * v_line.payable_minutes::bigint * 10000::bigint;
        v_gross := (v_numerator + 300000::bigint) / 600000::bigint;
        v_net := v_gross + coalesce(v_line.adjustment_vnd, 0);
      ELSE
        v_gross := round((v_line.rate_vnd_per_hour::numeric * coalesce(v_line.payable_minutes, 0)::numeric) / 60.0)::bigint;
        v_net := v_gross + coalesce(v_line.adjustment_vnd, 0);
      END IF;

      UPDATE public.workforce_payroll_lines
      SET overtime_seconds = 0,
          overtime_minutes = 0,
          overtime_request_id = NULL,
          overtime_day_class = NULL,
          overtime_time_class = NULL,
          gross_vnd = v_gross,
          net_vnd = v_net,
          version = version + 1,
          updated_at = statement_timestamp()
      WHERE id = v_line.id;
    END IF;
  END IF;

  RETURN v_request;
END;
$$;

ALTER FUNCTION public.rc19_c515_decide_overtime_request(uuid, integer, text, text, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.rc19_c515_decide_overtime_request(uuid, integer, text, text, uuid) FROM public, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rc19_c515_decide_overtime_request(uuid, integer, text, text, uuid) TO authenticated;

COMMIT;
