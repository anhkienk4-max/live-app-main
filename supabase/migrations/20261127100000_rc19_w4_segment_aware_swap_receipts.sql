-- RC19 W4 Issue #93: actor/action/payload-bound PASS/Swap operation receipts.
-- The prior mutation RPCs remain callable only from SECURITY DEFINER code;
-- authenticated clients use shift_swap_operation_v1 for every mutation.
BEGIN;

DO $dependencies$
BEGIN
  IF to_regclass('public.swap_requests') IS NULL
     OR to_regclass('public.shift_registrations') IS NULL
     OR to_regclass('public.shifts') IS NULL
     OR to_regclass('public.business_users') IS NULL
     OR to_regprocedure('public.create_shift_swap_request(text,text,text,text,text,text,text)') IS NULL
     OR to_regprocedure('public.approve_shift_swap_request(text,text,integer)') IS NULL
     OR to_regprocedure('public.respond_shift_swap_request(text,text,text,integer)') IS NULL
     OR to_regprocedure('public.reject_shift_swap_request(text,text,integer)') IS NULL
     OR to_regprocedure('public.cancel_own_shift_swap_request(text,text,integer)') IS NULL
     OR to_regprocedure('private.current_business_user_id()') IS NULL
     OR to_regprocedure('private.current_business_user_is_active()') IS NULL
     OR to_regprocedure('private.require_shift_actor(boolean)') IS NULL
     OR to_regprocedure('private.current_system_permission()') IS NULL
     OR to_regprocedure('private.rc19_has_any_leader_brand_scope(text,text[])') IS NULL
     OR to_regprocedure('private.rc19_assert_swap_agency_scope(text,text)') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'SWAP_RECEIPT_BASELINE_MISSING';
  END IF;
END
$dependencies$;

CREATE TABLE private.rc19_swap_operation_receipts (
  actor_id text NOT NULL REFERENCES public.business_users(id) ON DELETE RESTRICT,
  idempotency_key uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('create','approve','accept','respond_reject','reject','cancel')),
  request_id text,
  request_payload jsonb NOT NULL CHECK (jsonb_typeof(request_payload) = 'object'),
  response jsonb NOT NULL CHECK (jsonb_typeof(response) = 'object'),
  created_at timestamptz NOT NULL DEFAULT statement_timestamp(),
  PRIMARY KEY (actor_id, idempotency_key),
  CHECK ((action = 'create' AND request_id IS NULL) OR (action <> 'create' AND request_id IS NOT NULL))
);
ALTER TABLE private.rc19_swap_operation_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE private.rc19_swap_operation_receipts OWNER TO postgres;
REVOKE ALL ON private.rc19_swap_operation_receipts FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION private.rc19_assert_swap_receipt_replay(
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
    IF live_request.counterpart_id IS DISTINCT FROM p_actor_id THEN
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

CREATE FUNCTION public.shift_swap_operation_v1(
  p_action text,
  p_request_id text,
  p_payload jsonb,
  p_idempotency_key uuid
) RETURNS public.swap_requests
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor_id text;
  receipt private.rc19_swap_operation_receipts%ROWTYPE;
  result_row public.swap_requests%ROWTYPE;
  payload jsonb;
  allowed_keys text[];
BEGIN
  IF p_idempotency_key IS NULL OR p_action IS NULL OR p_action NOT IN ('create','approve','accept','respond_reject','reject','cancel')
     OR p_payload IS NULL OR jsonb_typeof(p_payload) <> 'object'
     OR (p_action = 'create' AND p_request_id IS NOT NULL)
     OR (p_action <> 'create' AND p_request_id IS NULL) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SWAP_OPERATION_REQUEST_INVALID';
  END IF;
  v_actor_id := private.require_shift_actor(p_action IN ('approve', 'reject'));
  IF v_actor_id IS NULL OR NOT private.current_business_user_is_active() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'SWAP_ACTOR_NOT_AUTHORIZED';
  END IF;

  allowed_keys := CASE p_action
    WHEN 'create' THEN ARRAY['source_registration_id','mode','reason','target_shift_id','replacement_staff_id','counterpart_registration_id','notes']::text[]
    WHEN 'approve' THEN ARRAY['notes','expected_version']::text[]
    WHEN 'accept' THEN ARRAY['notes','expected_version']::text[]
    WHEN 'respond_reject' THEN ARRAY['notes','expected_version']::text[]
    WHEN 'reject' THEN ARRAY['notes','expected_version']::text[]
    WHEN 'cancel' THEN ARRAY['reason','expected_version']::text[]
    ELSE ARRAY[]::text[]
  END;
  IF EXISTS (
    SELECT 1 FROM jsonb_object_keys(p_payload) AS payload_key(key)
    WHERE NOT (payload_key.key = ANY (allowed_keys))
  ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SWAP_OPERATION_PAYLOAD_INVALID';
  END IF;
  IF p_action <> 'create' AND nullif(p_payload->>'expected_version','') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'EXPECTED_VERSION_REQUIRED';
  END IF;
  payload := p_payload;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_actor_id || ':' || p_idempotency_key::text, 91732)
  );
  SELECT * INTO receipt
  FROM private.rc19_swap_operation_receipts AS existing_receipt
  WHERE existing_receipt.actor_id = v_actor_id
    AND existing_receipt.idempotency_key = p_idempotency_key
  FOR UPDATE;
  IF FOUND THEN
    IF receipt.action IS DISTINCT FROM p_action
       OR receipt.request_id IS DISTINCT FROM p_request_id
       OR receipt.request_payload IS DISTINCT FROM payload THEN
      RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'SWAP_IDEMPOTENCY_KEY_REUSED';
    END IF;
    PERFORM private.rc19_assert_swap_receipt_replay(v_actor_id,p_action,p_request_id,payload,receipt.response);
    SELECT * INTO result_row
    FROM jsonb_populate_record(NULL::public.swap_requests, receipt.response);
    RETURN result_row;
  END IF;

  CASE p_action
    WHEN 'create' THEN
      result_row := public.create_shift_swap_request(
        p_payload->>'source_registration_id',p_payload->>'mode',p_payload->>'reason',
        p_payload->>'target_shift_id',p_payload->>'replacement_staff_id',
        p_payload->>'counterpart_registration_id',p_payload->>'notes'
      );
    WHEN 'approve' THEN
      result_row := public.approve_shift_swap_request(
        p_request_id,p_payload->>'notes',(p_payload->>'expected_version')::integer
      );
    WHEN 'accept' THEN
      result_row := public.respond_shift_swap_request(
        p_request_id,'accept',p_payload->>'notes',(p_payload->>'expected_version')::integer
      );
    WHEN 'respond_reject' THEN
      result_row := public.respond_shift_swap_request(
        p_request_id,'reject',p_payload->>'notes',(p_payload->>'expected_version')::integer
      );
    WHEN 'reject' THEN
      result_row := public.reject_shift_swap_request(
        p_request_id,p_payload->>'notes',(p_payload->>'expected_version')::integer
      );
    WHEN 'cancel' THEN
      result_row := public.cancel_own_shift_swap_request(
        p_request_id,p_payload->>'reason',(p_payload->>'expected_version')::integer
      );
  END CASE;

  INSERT INTO private.rc19_swap_operation_receipts(
    actor_id,idempotency_key,action,request_id,request_payload,response
  ) VALUES (
    v_actor_id,p_idempotency_key,p_action,p_request_id,payload,to_jsonb(result_row)
  );
  RETURN result_row;
END;
$function$;
ALTER FUNCTION public.shift_swap_operation_v1(text,text,jsonb,uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.shift_swap_operation_v1(text,text,jsonb,uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.shift_swap_operation_v1(text,text,jsonb,uuid) TO authenticated;

-- Retire direct authenticated mutation paths so every client mutation obtains a receipt.
REVOKE ALL ON FUNCTION public.create_shift_swap_request(text,text,text,text,text,text,text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.approve_shift_swap_request(text,text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.approve_shift_swap_request(text,text,integer) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.respond_shift_swap_request(text,text,text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.respond_shift_swap_request(text,text,text,integer) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.reject_shift_swap_request(text,text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.reject_shift_swap_request(text,text,integer) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.cancel_own_shift_swap_request(text,text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.cancel_own_shift_swap_request(text,text,integer) FROM PUBLIC, anon, authenticated, service_role;

DO $privileges$
BEGIN
  IF NOT has_function_privilege('authenticated','public.shift_swap_operation_v1(text,text,jsonb,uuid)','EXECUTE')
     OR has_function_privilege('anon','public.shift_swap_operation_v1(text,text,jsonb,uuid)','EXECUTE')
     OR has_function_privilege('authenticated','public.create_shift_swap_request(text,text,text,text,text,text,text)','EXECUTE')
     OR has_function_privilege('authenticated','public.approve_shift_swap_request(text,text,integer)','EXECUTE')
     OR has_function_privilege('authenticated','public.respond_shift_swap_request(text,text,text,integer)','EXECUTE')
     OR has_function_privilege('authenticated','public.reject_shift_swap_request(text,text,integer)','EXECUTE')
     OR has_function_privilege('authenticated','public.cancel_own_shift_swap_request(text,text,integer)','EXECUTE') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'SWAP_RECEIPT_RPC_PRIVILEGES_INVALID';
  END IF;
END
$privileges$;

COMMENT ON TABLE private.rc19_swap_operation_receipts IS
  'Actor/action/request/payload-bound PASS/Swap receipts; response is committed atomically with the mutation and only replayed after current authorization checks.';
COMMENT ON FUNCTION public.shift_swap_operation_v1(text,text,jsonb,uuid) IS
  'Authenticated PASS/Swap mutation entrypoint. Requires a stable client idempotency key; replay is actor-bound, payload-bound and reauthorized.';

COMMIT;
