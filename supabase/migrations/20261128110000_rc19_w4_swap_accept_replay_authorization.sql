-- RC19 W4: reauthorize accepted replacement PASS receipt retries against the
-- selected replacement actor while preserving current membership and Agency checks.
BEGIN;

DO $dependencies$
BEGIN
  IF to_regprocedure('private.rc19_assert_swap_receipt_replay(text,text,text,jsonb,jsonb)') IS NULL
     OR to_regclass('public.swap_requests') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'SWAP_RECEIPT_REPLAY_BASELINE_MISSING';
  END IF;
END
$dependencies$;

CREATE OR REPLACE FUNCTION private.rc19_assert_swap_receipt_replay(
  p_actor_id text,
  p_action text,
  p_request_id text,
  p_payload jsonb,
  p_response jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  saved_request public.swap_requests%ROWTYPE;
  live_request public.swap_requests%ROWTYPE;
  source_registration public.shift_registrations%ROWTYPE;
  counterpart_registration public.shift_registrations%ROWTYPE;
  source_shift public.shifts%ROWTYPE;
  target_shift public.shifts%ROWTYPE;
  actor_permission text;
BEGIN
  IF p_actor_id IS NULL OR NOT private.current_business_user_is_active() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'SWAP_RECEIPT_REPLAY_ACTOR_INACTIVE';
  END IF;

  SELECT * INTO saved_request
  FROM jsonb_populate_record(NULL::public.swap_requests, p_response);
  IF saved_request.id IS NULL
     OR (p_action = 'create' AND p_request_id IS NOT NULL)
     OR (p_action <> 'create' AND p_request_id IS DISTINCT FROM saved_request.id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'SWAP_RECEIPT_REPLAY_NOT_AUTHORIZED';
  END IF;

  SELECT * INTO live_request FROM public.swap_requests WHERE id = saved_request.id;
  IF live_request.id IS NULL
     OR live_request.requester_id IS DISTINCT FROM saved_request.requester_id
     OR live_request.source_registration_id IS DISTINCT FROM saved_request.source_registration_id
     OR live_request.source_shift_id IS DISTINCT FROM saved_request.source_shift_id
     OR live_request.target_shift_id IS DISTINCT FROM saved_request.target_shift_id
     OR live_request.counterpart_registration_id IS DISTINCT FROM saved_request.counterpart_registration_id
     OR live_request.counterpart_id IS DISTINCT FROM saved_request.counterpart_id THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'SWAP_RECEIPT_REPLAY_NOT_AUTHORIZED';
  END IF;

  SELECT * INTO source_shift FROM public.shifts WHERE id = live_request.source_shift_id;
  IF source_shift.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'SWAP_RECEIPT_REPLAY_SCOPE_UNRESOLVED';
  END IF;

  actor_permission := private.current_system_permission();
  IF p_action = 'create' THEN
    SELECT * INTO source_registration
    FROM public.shift_registrations
    WHERE id = live_request.source_registration_id;
    IF live_request.requester_id <> p_actor_id
       OR p_payload->>'source_registration_id' IS DISTINCT FROM live_request.source_registration_id
       OR source_registration.id IS NULL
       OR source_registration.user_id <> p_actor_id
       OR source_registration.shift_id <> live_request.source_shift_id THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'SWAP_RECEIPT_REPLAY_NOT_AUTHORIZED';
    END IF;
    PERFORM private.rc19_assert_swap_agency_scope(p_actor_id, live_request.source_shift_id);
    IF live_request.mode = 'exchange' THEN
      SELECT * INTO target_shift FROM public.shifts WHERE id = live_request.target_shift_id;
      SELECT * INTO counterpart_registration
      FROM public.shift_registrations WHERE id = live_request.counterpart_registration_id;
      IF target_shift.id IS NULL OR counterpart_registration.id IS NULL
         OR counterpart_registration.user_id <> live_request.counterpart_id
         OR counterpart_registration.shift_id <> live_request.target_shift_id
         OR p_payload->>'counterpart_registration_id' IS DISTINCT FROM live_request.counterpart_registration_id THEN
        RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'SWAP_RECEIPT_REPLAY_NOT_AUTHORIZED';
      END IF;
      PERFORM private.rc19_assert_swap_agency_scope(p_actor_id, live_request.target_shift_id);
    END IF;
    RETURN;
  END IF;

  IF p_action IN ('accept', 'respond_reject') THEN
    -- A replacement PASS is addressed to replacement_staff_id; an exchange is
    -- addressed to counterpart_id. Keep the original actor and both Agency
    -- scope checks on replay after the request changes status.
    IF (live_request.mode = 'replacement'
        AND live_request.replacement_staff_id IS DISTINCT FROM p_actor_id)
       OR (live_request.mode = 'exchange'
        AND live_request.counterpart_id IS DISTINCT FROM p_actor_id)
       OR live_request.mode NOT IN ('replacement', 'exchange') THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'SWAP_RECEIPT_REPLAY_NOT_AUTHORIZED';
    END IF;
    PERFORM private.rc19_assert_swap_agency_scope(p_actor_id, live_request.source_shift_id);
    IF live_request.mode = 'exchange' THEN
      PERFORM private.rc19_assert_swap_agency_scope(p_actor_id, live_request.target_shift_id);
    END IF;
    RETURN;
  END IF;

  IF p_action = 'cancel' THEN
    IF live_request.requester_id IS DISTINCT FROM p_actor_id THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'SWAP_RECEIPT_REPLAY_NOT_AUTHORIZED';
    END IF;
    PERFORM private.rc19_assert_swap_agency_scope(p_actor_id, live_request.source_shift_id);
    RETURN;
  END IF;

  IF p_action IN ('approve', 'reject') THEN
    IF actor_permission NOT IN ('admin', 'leader') THEN
      RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'SWAP_RECEIPT_REPLAY_NOT_AUTHORIZED';
    END IF;
    IF actor_permission = 'leader' THEN
      IF NOT private.rc19_has_any_leader_brand_scope(source_shift.brand_id, ARRAY['shifts.manage']::text[]) THEN
        RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'SWAP_RECEIPT_REPLAY_NOT_AUTHORIZED';
      END IF;
      PERFORM private.rc19_assert_swap_agency_scope(p_actor_id, live_request.source_shift_id);
      IF live_request.mode = 'exchange' THEN
        PERFORM private.rc19_assert_swap_agency_scope(p_actor_id, live_request.target_shift_id);
      END IF;
    END IF;
    RETURN;
  END IF;

  RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SWAP_RECEIPT_ACTION_INVALID';
END;
$function$;
ALTER FUNCTION private.rc19_assert_swap_receipt_replay(text,text,text,jsonb,jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION private.rc19_assert_swap_receipt_replay(text,text,text,jsonb,jsonb)
  FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION private.rc19_assert_swap_receipt_replay(text,text,text,jsonb,jsonb) IS
  'Reauthorizes receipt replay against the actor selected for the action (replacement_staff_id for replacement PASS, counterpart_id for exchange), current actor activity, and current Agency scope.';

COMMIT;
