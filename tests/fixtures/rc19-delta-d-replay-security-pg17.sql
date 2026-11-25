\set ON_ERROR_STOP on
DO $$ BEGIN
  IF current_database() <> 'rc19_delta_d_persisted_v3_20261125' OR
    shobj_description((SELECT oid FROM pg_database WHERE datname=current_database()),'pg_database') <>
      'CODEX_DISPOSABLE_RC19_DELTA_D_PERSISTED_V3_20261125' THEN
    RAISE EXCEPTION 'DELTA_D_DISPOSABLE_IDENTITY_REQUIRED';
  END IF;
END $$;
BEGIN;
DO $$
DECLARE
  receipt public.rc19_shift_assignment_replacements%ROWTYPE;
  actor_auth uuid;
  member_auth uuid;
  failed boolean;
BEGIN
  SELECT * INTO STRICT receipt FROM public.rc19_shift_assignment_replacements WHERE shift_id='delta-d-shift';
  SELECT auth_user_id INTO STRICT actor_auth FROM public.business_users WHERE id=receipt.actor_business_user_id;
  SELECT auth_user_id INTO STRICT member_auth FROM public.business_users
    WHERE system_permission='member' AND status='active' AND auth_user_id IS NOT NULL ORDER BY id LIMIT 1;
  PERFORM set_config('request.jwt.claim.sub',actor_auth::text,true);
  PERFORM set_config('request.jwt.claim.role','authenticated',true);
  failed := false;
  BEGIN
    PERFORM public.replace_shift_assignment_with_incident_v1(receipt.shift_id,receipt.staffing_segment_id,
      receipt.old_registration_id,receipt.replacement_user_id,receipt.operational_role,
      receipt.expected_shift_version,receipt.expected_registration_version,receipt.effective_at,
      receipt.reason,receipt.is_emergency,receipt.idempotency_key,'absent',NULL);
  EXCEPTION WHEN unique_violation THEN
    IF SQLERRM <> 'IDEMPOTENCY_KEY_REUSED' THEN RAISE; END IF;
    failed := true;
  END;
  IF NOT failed THEN RAISE EXCEPTION 'CHANGED_PAYLOAD_ACCEPTED'; END IF;
  -- Replay must recheck the original actor's current authorization.
  UPDATE public.business_users SET status='inactive' WHERE id=receipt.actor_business_user_id;
  failed := false;
  BEGIN
    PERFORM public.replace_shift_assignment_with_incident_v1(receipt.shift_id,receipt.staffing_segment_id,
      receipt.old_registration_id,receipt.replacement_user_id,receipt.operational_role,
      receipt.expected_shift_version,receipt.expected_registration_version,receipt.effective_at,
      receipt.reason,receipt.is_emergency,receipt.idempotency_key,'skip',NULL);
  EXCEPTION WHEN insufficient_privilege THEN failed := true;
  END;
  IF NOT failed THEN RAISE EXCEPTION 'INACTIVE_ACTOR_REPLAY_ACCEPTED'; END IF;
  UPDATE public.business_users SET status='active' WHERE id=receipt.actor_business_user_id;
  PERFORM set_config('request.jwt.claim.sub',member_auth::text,true);
  failed := false;
  BEGIN
    PERFORM public.replace_shift_assignment_with_incident_v1(receipt.shift_id,receipt.staffing_segment_id,
      receipt.old_registration_id,receipt.replacement_user_id,receipt.operational_role,
      receipt.expected_shift_version,receipt.expected_registration_version,receipt.effective_at,
      receipt.reason,receipt.is_emergency,receipt.idempotency_key,'skip',NULL);
  EXCEPTION WHEN insufficient_privilege THEN failed := true;
  END;
  IF NOT failed THEN RAISE EXCEPTION 'MEMBER_REPLAY_ACCEPTED'; END IF;
  IF (SELECT count(*) FROM private.rc19_staff_incidents WHERE shift_id=receipt.shift_id) <> 1 OR
     (SELECT count(*) FROM public.rc19_shift_assignment_replacements WHERE shift_id=receipt.shift_id) <> 1 THEN
    RAISE EXCEPTION 'REPLAY_CREATED_DUPLICATE';
  END IF;
END $$;
ROLLBACK;
