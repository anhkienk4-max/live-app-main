-- RC19 W4: ordinary PASS and Exchange must transition exact registrations and
-- evaluate availability/capacity against their persisted assignment intervals.
BEGIN;

DO $dependencies$
BEGIN
  IF to_regclass('public.shifts') IS NULL
     OR to_regclass('public.shift_registrations') IS NULL
     OR to_regclass('public.shift_staffing_segments') IS NULL
     OR to_regclass('public.swap_requests') IS NULL
     OR to_regprocedure('private.require_shift_actor(boolean)') IS NULL
     OR to_regprocedure('private.assert_shift_role_eligibility(text,text)') IS NULL
     OR to_regprocedure('private.lock_swap_registrations(text[])') IS NULL
     OR to_regprocedure('private.lock_swap_shifts(text[])') IS NULL
     OR to_regprocedure('private.lock_swap_rows(text[])') IS NULL
     OR to_regprocedure('private.lock_swap_users(text[])') IS NULL
     OR to_regprocedure('private.rc19_has_active_agency_membership(text,uuid,timestamp with time zone)') IS NULL
     OR NOT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'shifts'
         AND column_name = 'authoritative_agency_id'
     ) THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'W4_SEGMENT_SWAP_BASELINE_PRECONDITION_FAILED';
  END IF;
END
$dependencies$;

-- Exchange is only meaningful for two concrete registrations. Same-parent
-- exchanges are valid when the registrations target distinct or overlapping
-- persisted segments; the RPCs below perform the authoritative interval checks.
ALTER TABLE public.swap_requests DROP CONSTRAINT swap_source_target_not_equal;
ALTER TABLE public.swap_requests ADD CONSTRAINT swap_source_target_not_equal
  CHECK (target_shift_id IS NULL OR mode = 'exchange' OR source_shift_id <> target_shift_id);

CREATE FUNCTION private.rc19_swap_assignment_range(
  p_shift_id text,
  p_segment_id text,
  p_strict boolean DEFAULT true
) RETURNS tstzrange
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_shift public.shifts%ROWTYPE;
  v_segment public.shift_staffing_segments%ROWTYPE;
  v_has_segments boolean;
BEGIN
  SELECT * INTO v_shift FROM public.shifts WHERE id = p_shift_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SWAP_SHIFT_NOT_FOUND';
  END IF;
  SELECT EXISTS (SELECT 1 FROM public.shift_staffing_segments WHERE shift_id = p_shift_id)
    INTO v_has_segments;
  IF p_segment_id IS NULL THEN
    IF v_has_segments AND p_strict THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SWAP_SEGMENT_SELECTION_REQUIRED';
    END IF;
    RETURN tstzrange(v_shift.start_at, v_shift.end_at, '[)');
  END IF;
  SELECT * INTO v_segment
  FROM public.shift_staffing_segments
  WHERE id = p_segment_id AND shift_id = p_shift_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SWAP_SEGMENT_SHIFT_MISMATCH';
  END IF;
  RETURN tstzrange(v_segment.start_at, v_segment.end_at, '[)');
END;
$function$;
ALTER FUNCTION private.rc19_swap_assignment_range(text,text,boolean) OWNER TO postgres;
REVOKE ALL ON FUNCTION private.rc19_swap_assignment_range(text,text,boolean)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION private.rc19_assert_swap_agency_scope(
  p_business_user_id text,
  p_shift_id text
) RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_agency_id uuid;
  v_membership_id uuid;
BEGIN
  SELECT authoritative_agency_id INTO v_agency_id
  FROM public.shifts WHERE id = p_shift_id;
  IF NOT FOUND OR v_agency_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'RC19_AGENCY_SCOPE_UNRESOLVED';
  END IF;
  SELECT membership.id INTO v_membership_id
  FROM private.rc19_business_user_agency_memberships AS membership
  JOIN private.rc19_agencies AS agency ON agency.id = membership.agency_id
  JOIN public.business_users AS business_user ON business_user.id = membership.business_user_id
  WHERE membership.business_user_id = p_business_user_id
    AND membership.agency_id = v_agency_id
    AND membership.status = 'active'
    AND membership.effective_from <= statement_timestamp()
    AND (membership.effective_until IS NULL OR statement_timestamp() < membership.effective_until)
    AND agency.is_active
    AND business_user.status = 'active' AND business_user.account_status = 'active'
    AND business_user.deleted_at IS NULL AND business_user.archived_at IS NULL
  FOR SHARE OF membership, agency, business_user;
  IF v_membership_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'RC19_AGENCY_MEMBERSHIP_REQUIRED';
  END IF;
END;
$function$;
ALTER FUNCTION private.rc19_assert_swap_agency_scope(text,text) OWNER TO postgres;
REVOKE ALL ON FUNCTION private.rc19_assert_swap_agency_scope(text,text)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION private.rc19_assert_swap_capacity(
  p_shift_id text,
  p_segment_id text,
  p_role text,
  p_excluded_registration_ids text[],
  p_incoming_count integer DEFAULT 1
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_capacity integer;
  v_existing integer;
BEGIN
  IF p_role NOT IN ('host', 'support', 'technical') OR p_incoming_count < 1 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SWAP_CAPACITY_PAYLOAD_INVALID';
  END IF;
  IF p_segment_id IS NOT NULL THEN
    SELECT CASE p_role WHEN 'host' THEN required_host_count
                       WHEN 'support' THEN required_support_count
                       ELSE required_technical_count END
      INTO v_capacity
    FROM public.shift_staffing_segments
    WHERE id = p_segment_id AND shift_id = p_shift_id
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SWAP_SEGMENT_SHIFT_MISMATCH';
    END IF;
    SELECT count(*) INTO v_existing
    FROM public.shift_registrations
    WHERE staffing_segment_id = p_segment_id
      AND operational_role::text = p_role
      AND status IN ('approved', 'manually_assigned')
      AND NOT (id = ANY(coalesce(p_excluded_registration_ids, ARRAY[]::text[])));
  ELSE
    IF EXISTS (SELECT 1 FROM public.shift_staffing_segments WHERE shift_id = p_shift_id) THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SWAP_SEGMENT_SELECTION_REQUIRED';
    END IF;
    SELECT CASE p_role WHEN 'host' THEN required_host_count
                       WHEN 'support' THEN required_support_count
                       ELSE required_technical_count END
      INTO v_capacity
    FROM public.shifts WHERE id = p_shift_id FOR SHARE;
    SELECT count(*) INTO v_existing
    FROM public.shift_registrations
    WHERE shift_id = p_shift_id AND staffing_segment_id IS NULL
      AND operational_role::text = p_role
      AND status IN ('approved', 'manually_assigned')
      AND NOT (id = ANY(coalesce(p_excluded_registration_ids, ARRAY[]::text[])));
  END IF;
  IF coalesce(v_capacity, 0) < v_existing + p_incoming_count THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'STAFFING_CAPACITY_EXCEEDED';
  END IF;
END;
$function$;
ALTER FUNCTION private.rc19_assert_swap_capacity(text,text,text,text[],integer) OWNER TO postgres;
REVOKE ALL ON FUNCTION private.rc19_assert_swap_capacity(text,text,text,text[],integer)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION private.rc19_assert_swap_interval_clear(
  p_user_id text,
  p_role text,
  p_target_shift_id text,
  p_target_segment_id text,
  p_excluded_registration_ids text[] DEFAULT ARRAY[]::text[]
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_target public.shifts%ROWTYPE;
  v_target_range tstzrange;
  v_existing record;
  v_existing_range tstzrange;
  v_multi_role_allowed boolean;
BEGIN
  SELECT * INTO v_target FROM public.shifts WHERE id = p_target_shift_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SWAP_SHIFT_NOT_FOUND';
  END IF;
  v_target_range := private.rc19_swap_assignment_range(p_target_shift_id, p_target_segment_id, true);
  v_multi_role_allowed := coalesce(v_target.allow_multi_role, false)
    OR coalesce((SELECT allow_multi_role_per_shift FROM public.system_settings LIMIT 1), false);

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id, 91731));
  FOR v_existing IN
    SELECT registration.id, registration.shift_id, registration.staffing_segment_id,
           registration.operational_role::text AS operational_role,
           shift.start_at, shift.end_at
    FROM public.shift_registrations AS registration
    JOIN public.shifts AS shift ON shift.id = registration.shift_id
    WHERE registration.user_id = p_user_id
      AND registration.status IN ('pending', 'approved', 'manually_assigned')
      AND NOT (registration.id = ANY(coalesce(p_excluded_registration_ids, ARRAY[]::text[])))
      AND shift.deleted_at IS NULL AND shift.archived_at IS NULL AND shift.status <> 'cancelled'
    ORDER BY registration.id
  LOOP
    IF v_existing.shift_id = p_target_shift_id THEN
      IF v_existing.operational_role <> p_role THEN
        IF NOT v_multi_role_allowed THEN
          RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'MULTI_ROLE_NOT_ALLOWED';
        END IF;
        CONTINUE;
      END IF;
      v_existing_range := private.rc19_swap_assignment_range(
        v_existing.shift_id, v_existing.staffing_segment_id, false
      );
      IF v_existing_range && v_target_range THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SHIFT_CONFLICT';
      END IF;
    ELSE
      v_existing_range := private.rc19_swap_assignment_range(
        v_existing.shift_id, v_existing.staffing_segment_id, false
      );
      IF v_existing_range && v_target_range THEN
        RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SHIFT_CONFLICT';
      END IF;
    END IF;
  END LOOP;
END;
$function$;
ALTER FUNCTION private.rc19_assert_swap_interval_clear(text,text,text,text,text[]) OWNER TO postgres;
REVOKE ALL ON FUNCTION private.rc19_assert_swap_interval_clear(text,text,text,text,text[])
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.get_swap_exchange_candidates_v2(
  p_shift_id text,
  p_role text
) RETURNS TABLE (
  registration_id text,
  user_id text,
  full_name text,
  operational_role text,
  shift_id text,
  staffing_segment_id text,
  segment_index smallint,
  effective_start_at timestamptz,
  effective_end_at timestamptz,
  brand_id text,
  authoritative_agency_id uuid
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_actor text := private.current_business_user_id();
BEGIN
  IF v_actor IS NULL OR NOT private.current_business_user_is_active() THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'AUTHENTICATION_REQUIRED';
  END IF;
  IF p_role IS NULL OR p_role NOT IN ('host', 'support', 'technical') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SWAP_ROLE_INVALID';
  END IF;
  IF NOT private.can_read_shift(p_shift_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'OPERATION_NOT_ALLOWED';
  END IF;
  PERFORM private.rc19_assert_swap_agency_scope(v_actor, p_shift_id);
  RETURN QUERY
  SELECT registration.id, business_user.id, business_user.full_name,
         registration.operational_role::text,
         shift.id, registration.staffing_segment_id, segment.segment_index,
         coalesce(segment.start_at, shift.start_at), coalesce(segment.end_at, shift.end_at),
         shift.brand_id, shift.authoritative_agency_id
  FROM public.shift_registrations AS registration
  JOIN public.shifts AS shift ON shift.id = registration.shift_id
  JOIN public.business_users AS business_user ON business_user.id = registration.user_id
  LEFT JOIN public.shift_staffing_segments AS segment
    ON segment.id = registration.staffing_segment_id AND segment.shift_id = registration.shift_id
  WHERE shift.id = p_shift_id AND shift.status = 'scheduled'
    AND shift.archived_at IS NULL AND shift.deleted_at IS NULL
    AND registration.operational_role::text = p_role
    AND registration.status IN ('approved', 'manually_assigned')
    AND business_user.id <> v_actor AND business_user.status = 'active'
    AND business_user.account_status = 'active'
    AND business_user.archived_at IS NULL AND business_user.deleted_at IS NULL
    AND private.rc19_has_active_agency_membership(business_user.id, shift.authoritative_agency_id)
    AND (registration.staffing_segment_id IS NOT NULL OR NOT EXISTS (
      SELECT 1 FROM public.shift_staffing_segments AS any_segment
      WHERE any_segment.shift_id = shift.id
    ))
  ORDER BY segment.segment_index NULLS FIRST, coalesce(segment.start_at, shift.start_at),
           business_user.full_name, registration.id;
END;
$function$;
ALTER FUNCTION public.get_swap_exchange_candidates_v2(text,text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_swap_exchange_candidates_v2(text,text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_swap_exchange_candidates_v2(text,text) TO authenticated;

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
AS $function$
DECLARE
  v_actor text := private.require_shift_actor(false);
  v_source public.shift_registrations%ROWTYPE;
  v_counterpart public.shift_registrations%ROWTYPE;
  v_source_shift public.shifts%ROWTYPE;
  v_target_shift public.shifts%ROWTYPE;
  v_candidate public.business_users%ROWTYPE;
  v_source_capacity integer;
  v_target_capacity integer;
  v_incoming integer := 1;
  v_exclusions text[];
BEGIN
  IF p_source_registration_id IS NULL OR p_mode IS NULL OR p_mode NOT IN ('replacement', 'exchange') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SWAP_PREFLIGHT_PAYLOAD_INVALID';
  END IF;
  SELECT * INTO v_source FROM public.shift_registrations
    WHERE id = p_source_registration_id FOR UPDATE;
  IF NOT FOUND OR v_source.user_id <> v_actor THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'SWAP_NOT_OWNER';
  END IF;
  IF v_source.status NOT IN ('approved', 'manually_assigned') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SOURCE_NOT_ACTIVE';
  END IF;
  SELECT * INTO v_source_shift FROM public.shifts WHERE id = v_source.shift_id FOR SHARE;
  IF NOT FOUND OR v_source_shift.deleted_at IS NOT NULL OR v_source_shift.archived_at IS NOT NULL
     OR v_source_shift.status <> 'scheduled' OR NOT private.can_read_shift(v_source_shift.id) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SOURCE_SHIFT_NOT_SCHEDULED';
  END IF;
  PERFORM private.assert_shift_role_eligibility(v_actor, v_source.operational_role::text);
  PERFORM private.rc19_assert_swap_agency_scope(v_actor, v_source_shift.id);
  PERFORM private.rc19_swap_assignment_range(v_source.shift_id, v_source.staffing_segment_id, true);

  IF p_mode = 'replacement' THEN
    IF p_replacement_staff_id IS NULL OR p_target_shift_id IS NOT NULL
       OR p_counterpart_registration_id IS NOT NULL OR p_replacement_staff_id = v_actor THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SWAP_REPLACEMENT_PAYLOAD_INVALID';
    END IF;
    PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_replacement_staff_id, 91731));
    SELECT * INTO v_candidate FROM public.business_users
      WHERE id = p_replacement_staff_id AND status = 'active' AND account_status = 'active'
        AND archived_at IS NULL AND deleted_at IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'REPLACEMENT_INACTIVE'; END IF;
    PERFORM private.assert_shift_role_eligibility(v_candidate.id, v_source.operational_role::text);
    PERFORM private.rc19_assert_swap_agency_scope(v_candidate.id, v_source_shift.id);
    BEGIN
      PERFORM private.rc19_assert_swap_capacity(
        v_source.shift_id, v_source.staffing_segment_id, v_source.operational_role::text,
        ARRAY[v_source.id], 1
      );
      PERFORM private.rc19_assert_swap_interval_clear(
        v_candidate.id, v_source.operational_role::text,
        v_source.shift_id, v_source.staffing_segment_id, ARRAY[v_source.id]
      );
      RETURN 'VERIFIED_CLEAR';
    EXCEPTION WHEN unique_violation THEN RETURN 'CONFLICT';
      WHEN SQLSTATE 'P0001' THEN
        IF SQLERRM IN ('SHIFT_CONFLICT', 'MULTI_ROLE_NOT_ALLOWED', 'STAFFING_CAPACITY_EXCEEDED') THEN
          RETURN 'CONFLICT';
        END IF;
        RAISE;
    END;
  END IF;

  IF p_replacement_staff_id IS NOT NULL OR p_target_shift_id IS NULL
     OR p_counterpart_registration_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SWAP_EXCHANGE_PAYLOAD_INVALID';
  END IF;
  SELECT * INTO v_target_shift FROM public.shifts WHERE id = p_target_shift_id FOR SHARE;
  IF NOT FOUND OR v_target_shift.deleted_at IS NOT NULL OR v_target_shift.archived_at IS NOT NULL
     OR v_target_shift.status <> 'scheduled' OR NOT private.can_read_shift(v_target_shift.id) THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'TARGET_SHIFT_NOT_ELIGIBLE';
  END IF;
  SELECT * INTO v_counterpart FROM public.shift_registrations
    WHERE id = p_counterpart_registration_id AND shift_id = v_target_shift.id FOR UPDATE;
  IF NOT FOUND OR v_counterpart.status NOT IN ('approved', 'manually_assigned')
     OR v_counterpart.operational_role <> v_source.operational_role
     OR v_counterpart.user_id = v_actor THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'COUNTERPART_NOT_ELIGIBLE';
  END IF;
  PERFORM private.rc19_assert_swap_agency_scope(v_actor, v_target_shift.id);
  PERFORM private.rc19_assert_swap_agency_scope(v_counterpart.user_id, v_target_shift.id);
  PERFORM private.rc19_assert_swap_agency_scope(v_counterpart.user_id, v_source_shift.id);
  PERFORM private.rc19_swap_assignment_range(v_counterpart.shift_id, v_counterpart.staffing_segment_id, true);
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_counterpart.user_id, 91731));
  SELECT * INTO v_candidate FROM public.business_users
    WHERE id = v_counterpart.user_id AND status = 'active' AND account_status = 'active'
      AND archived_at IS NULL AND deleted_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'COUNTERPART_INACTIVE'; END IF;
  PERFORM private.assert_shift_role_eligibility(v_candidate.id, v_source.operational_role::text);

  v_exclusions := ARRAY[v_source.id, v_counterpart.id];
  IF v_source.shift_id = v_counterpart.shift_id
     AND v_source.staffing_segment_id IS NOT DISTINCT FROM v_counterpart.staffing_segment_id THEN
    v_incoming := 2;
  END IF;
  BEGIN
    PERFORM private.rc19_assert_swap_capacity(
      v_target_shift.id, v_counterpart.staffing_segment_id, v_source.operational_role::text,
      v_exclusions, v_incoming
    );
    IF v_target_shift.id <> v_source_shift.id
       OR v_counterpart.staffing_segment_id IS DISTINCT FROM v_source.staffing_segment_id THEN
      PERFORM private.rc19_assert_swap_capacity(
        v_source_shift.id, v_source.staffing_segment_id, v_source.operational_role::text,
        v_exclusions, 1
      );
    END IF;
    PERFORM private.rc19_assert_swap_interval_clear(
      v_actor, v_source.operational_role::text, v_target_shift.id,
      v_counterpart.staffing_segment_id, v_exclusions
    );
    PERFORM private.rc19_assert_swap_interval_clear(
      v_counterpart.user_id, v_source.operational_role::text, v_source_shift.id,
      v_source.staffing_segment_id, v_exclusions
    );
    RETURN 'VERIFIED_CLEAR';
  EXCEPTION WHEN unique_violation THEN RETURN 'CONFLICT';
    WHEN SQLSTATE 'P0001' THEN
      IF SQLERRM IN ('SHIFT_CONFLICT', 'MULTI_ROLE_NOT_ALLOWED', 'STAFFING_CAPACITY_EXCEEDED') THEN
        RETURN 'CONFLICT';
      END IF;
      RAISE;
  END;
END;
$function$;
ALTER FUNCTION public.check_shift_swap_conflict(text,text,text,text,text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.check_shift_swap_conflict(text,text,text,text,text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.check_shift_swap_conflict(text,text,text,text,text) TO authenticated;

-- Request and approval keep the established public signatures and lifecycle.
create or replace function public.create_shift_swap_request(
  p_source_registration_id text,
  p_mode text,
  p_reason text,
  p_target_shift_id text,
  p_replacement_staff_id text,
  p_counterpart_registration_id text,
  p_notes text
) returns public.swap_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id text;
  source_registration public.shift_registrations;
  source_shift public.shifts;
  target_shift public.shifts;
  counterpart_registration public.shift_registrations;
  replacement_user public.business_users;
  counterpart_user public.business_users;
  created_request public.swap_requests;
  role_name text;
  history_entry jsonb;
begin
  actor_id := private.require_shift_actor(false);
  if p_mode not in ('replacement', 'exchange') then
    raise exception using errcode = '22023', message = 'SWAP_MODE_NOT_CREATABLE';
  end if;
  if btrim(coalesce(p_reason, '')) = '' then
    raise exception using errcode = '22023', message = 'SWAP_REASON_REQUIRED';
  end if;
  if p_mode = 'replacement' and (
    p_target_shift_id is not null
    or p_counterpart_registration_id is not null
    or p_replacement_staff_id is null
  ) then
    raise exception using errcode = '22023', message = 'SWAP_REPLACEMENT_PAYLOAD_INVALID';
  end if;
  if p_mode = 'exchange' and (
    p_target_shift_id is null
    or p_counterpart_registration_id is null
    or p_replacement_staff_id is not null
  ) then
    raise exception using errcode = '22023', message = 'SWAP_EXCHANGE_PAYLOAD_INVALID';
  end if;

  select * into source_registration
  from public.shift_registrations
  where id = p_source_registration_id;
  if source_registration.id is null then
    raise exception using errcode = 'P0001', message = 'SOURCE_REGISTRATION_NOT_FOUND';
  end if;
  if p_mode = 'exchange' then
    select * into counterpart_registration
    from public.shift_registrations
    where id = p_counterpart_registration_id;
  end if;

  perform private.lock_swap_registrations(array_remove(array[
    p_source_registration_id,
    case when p_mode = 'exchange' then p_counterpart_registration_id end
  ]::text[], null));
  select * into source_registration
  from public.shift_registrations
  where id = p_source_registration_id;
  if p_mode = 'exchange' then
    select * into counterpart_registration
    from public.shift_registrations
    where id = p_counterpart_registration_id;
  end if;
  perform private.lock_swap_shifts(array_remove(array[
    source_registration.shift_id,
    case when p_mode = 'exchange' then p_target_shift_id end
  ]::text[], null));
  perform private.lock_swap_rows(array_remove(array[
    'user:' || actor_id,
    case when p_mode = 'replacement' then 'user:' || p_replacement_staff_id end,
    case when p_mode = 'exchange' then 'user:' || counterpart_registration.user_id end
  ]::text[], null));
  perform private.lock_swap_users(array_remove(array[
    actor_id,
    case when p_mode = 'replacement' then p_replacement_staff_id end,
    case when p_mode = 'exchange' then counterpart_registration.user_id end
  ]::text[], null));

  select * into source_registration
  from public.shift_registrations
  where id = p_source_registration_id;
  if source_registration.id is null then
    raise exception using errcode = 'P0001', message = 'SOURCE_REGISTRATION_NOT_FOUND';
  end if;
  if source_registration.user_id <> actor_id then
    raise exception using errcode = '42501', message = 'SWAP_NOT_OWNER';
  end if;
  if source_registration.status not in ('approved', 'manually_assigned') then
    raise exception using errcode = 'P0001', message = 'SOURCE_NOT_ACTIVE';
  end if;

  select * into source_shift from public.shifts where id = source_registration.shift_id;
  if source_shift.id is null or source_shift.deleted_at is not null or source_shift.archived_at is not null then
    raise exception using errcode = 'P0001', message = 'SOURCE_SHIFT_NOT_FOUND';
  end if;
  if source_shift.status <> 'scheduled' then
    raise exception using errcode = 'P0001', message = 'SOURCE_SHIFT_NOT_SCHEDULED';
  end if;

  role_name := source_registration.operational_role;
  perform private.assert_shift_role_eligibility(actor_id, role_name);
  perform private.rc19_assert_swap_agency_scope(actor_id, source_shift.id);
  perform private.rc19_swap_assignment_range(source_registration.shift_id, source_registration.staffing_segment_id, true);

  if exists (
    select 1 from public.swap_requests
    where source_registration_id = source_registration.id
      and status in ('pending', 'accepted', 'approved')
  ) then
    raise exception using errcode = '23505', message = 'DUPLICATE_ACTIVE_SWAP';
  end if;

  -- 1. REPLACEMENT MODE (PASS)
  if p_mode = 'replacement' then
    -- Ordinary PASS prohibited during live
    if statement_timestamp() >= source_shift.start_at then
      raise exception using errcode = 'P0001', message = 'PASS_DURING_LIVE_NOT_ALLOWED';
    end if;

    -- Enforce lead times for PASS: Campaign vs Daily
    -- QUY TẮC: Ca có campaign_id luôn là ca Campaign, kể cả khi campaign đã archived.
    -- Campaign archived KHÔNG BAO GIỜ hạ cấp thành ca Daily!
    if source_shift.campaign_id is not null
       and btrim(source_shift.campaign_id) <> ''
       and lower(btrim(source_shift.campaign_id)) <> 'none' then
      -- Campaign PASS requires minimum 24 hours lead time
      if statement_timestamp() > (source_shift.start_at - interval '24 hours') then
        raise exception using errcode = 'P0001', message = 'CAMPAIGN_PASS_DEADLINE_EXCEEDED';
      end if;
    else
      -- Daily PASS requires minimum 2 hours (120 minutes) lead time
      if statement_timestamp() > (source_shift.start_at - interval '2 hours') then
        raise exception using errcode = 'P0001', message = 'DAILY_PASS_DEADLINE_EXCEEDED';
      end if;
    end if;

    if p_replacement_staff_id = actor_id then
      raise exception using errcode = '22023', message = 'REPLACEMENT_SELF_NOT_ALLOWED';
    end if;
    select * into replacement_user
    from public.business_users
    where id = p_replacement_staff_id;
    if replacement_user.id is null or replacement_user.status <> 'active'
       or replacement_user.account_status <> 'active' or replacement_user.deleted_at is not null
       or replacement_user.archived_at is not null then
      raise exception using errcode = 'P0001', message = 'REPLACEMENT_INACTIVE';
    end if;
    perform private.assert_shift_role_eligibility(replacement_user.id, role_name);
    perform private.rc19_assert_swap_agency_scope(replacement_user.id, source_shift.id);
    perform private.rc19_assert_swap_capacity(
      source_shift.id, source_registration.staffing_segment_id, role_name,
      ARRAY[source_registration.id], 1
    );
    perform private.rc19_assert_swap_interval_clear(
      replacement_user.id, role_name, source_shift.id,
      source_registration.staffing_segment_id, ARRAY[source_registration.id]
    );
  else
    -- 2. EXCHANGE MODE (Swap between two assigned staff)
    select * into target_shift from public.shifts where id = p_target_shift_id;
    select * into counterpart_registration from public.shift_registrations where id = p_counterpart_registration_id;
    if target_shift.id is null or target_shift.deleted_at is not null or target_shift.archived_at is not null then
      raise exception using errcode = 'P0001', message = 'TARGET_SHIFT_NOT_FOUND';
    end if;
    if target_shift.status <> 'scheduled' then
      raise exception using errcode = 'P0001', message = 'TARGET_SHIFT_NOT_SCHEDULED';
    end if;

    -- Exchange cannot be initiated if either shift has already started live or ended
    if statement_timestamp() >= source_shift.start_at or statement_timestamp() >= target_shift.start_at then
      raise exception using errcode = 'P0001', message = 'EXCHANGE_DURING_LIVE_NOT_ALLOWED';
    end if;

    if counterpart_registration.id is null or counterpart_registration.status not in ('approved', 'manually_assigned') then
      raise exception using errcode = 'P0001', message = 'COUNTERPART_NOT_ACTIVE';
    end if;
    perform private.rc19_swap_assignment_range(counterpart_registration.shift_id, counterpart_registration.staffing_segment_id, true);
    if counterpart_registration.shift_id <> target_shift.id then
      raise exception using errcode = '22023', message = 'COUNTERPART_SHIFT_MISMATCH';
    end if;
    if counterpart_registration.operational_role <> role_name then
      raise exception using errcode = '22023', message = 'SWAP_ROLE_MISMATCH';
    end if;
    if counterpart_registration.user_id = actor_id then
      raise exception using errcode = '22023', message = 'SWAP_SELF_EXCHANGE_NOT_ALLOWED';
    end if;
    select * into counterpart_user from public.business_users where id = counterpart_registration.user_id;
    if counterpart_user.id is null or counterpart_user.status <> 'active'
       or counterpart_user.account_status <> 'active' or counterpart_user.deleted_at is not null
       or counterpart_user.archived_at is not null then
      raise exception using errcode = 'P0001', message = 'COUNTERPART_INACTIVE';
    end if;
    perform private.assert_shift_role_eligibility(counterpart_user.id, role_name);
    perform private.rc19_assert_swap_agency_scope(actor_id, target_shift.id);
    perform private.rc19_assert_swap_agency_scope(counterpart_user.id, target_shift.id);
    perform private.rc19_assert_swap_agency_scope(counterpart_user.id, source_shift.id);
    if exists (
      select 1 from public.swap_requests
      where counterpart_registration_id = counterpart_registration.id
        and status in ('pending', 'accepted', 'approved')
    ) then
      raise exception using errcode = '23505', message = 'DUPLICATE_COUNTERPART_SWAP';
    end if;
    IF source_shift.id = target_shift.id
       AND source_registration.staffing_segment_id IS NOT DISTINCT FROM counterpart_registration.staffing_segment_id THEN
      perform private.rc19_assert_swap_capacity(
        target_shift.id, counterpart_registration.staffing_segment_id, role_name,
        ARRAY[source_registration.id, counterpart_registration.id], 2
      );
    ELSE
      perform private.rc19_assert_swap_capacity(
        target_shift.id, counterpart_registration.staffing_segment_id, role_name,
        ARRAY[source_registration.id, counterpart_registration.id], 1
      );
      perform private.rc19_assert_swap_capacity(
        source_shift.id, source_registration.staffing_segment_id, role_name,
        ARRAY[source_registration.id, counterpart_registration.id], 1
      );
    END IF;
    perform private.rc19_assert_swap_interval_clear(
      actor_id, role_name, target_shift.id, counterpart_registration.staffing_segment_id,
      ARRAY[source_registration.id, counterpart_registration.id]
    );
    perform private.rc19_assert_swap_interval_clear(
      counterpart_user.id, role_name, source_shift.id, source_registration.staffing_segment_id,
      ARRAY[source_registration.id, counterpart_registration.id]
    );
  end if;

  insert into public.swap_requests (
    requester_id, source_registration_id, source_shift_id, target_shift_id,
    counterpart_registration_id, counterpart_id, operational_role, mode, status,
    reason, notes, shift_id, original_staff_id, replacement_staff_id,
    new_host_id, new_support_id, new_technical_id, approval_history
  ) values (
    actor_id, source_registration.id, source_shift.id,
    case when p_mode = 'exchange' then target_shift.id else null end,
    case when p_mode = 'exchange' then counterpart_registration.id else null end,
    case when p_mode = 'exchange' then counterpart_registration.user_id else null end,
    role_name, p_mode, 'pending',
    btrim(p_reason), p_notes, source_shift.id, actor_id,
    case when p_mode = 'replacement' then p_replacement_staff_id else null end,
    case when p_mode = 'replacement' and role_name = 'host' then p_replacement_staff_id else null end,
    case when p_mode = 'replacement' and role_name = 'support' then p_replacement_staff_id else null end,
    case when p_mode = 'replacement' and role_name = 'technical' then p_replacement_staff_id else null end,
    '[]'::jsonb
  ) returning * into created_request;

  history_entry := jsonb_build_object(
    'action', 'created',
    'actor_id', actor_id,
    'at', to_char(statement_timestamp(), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'mode', p_mode,
    'from_status', null,
    'to_status', 'pending',
    'reason', btrim(p_reason),
    'notes', p_notes,
    'requester_id', actor_id,
    'source_registration_id', source_registration.id,
    'source_shift_id', source_shift.id,
    'operational_role', role_name,
    'target_shift_id', case when p_mode = 'exchange' then target_shift.id else null end,
    'counterpart_registration_id', case when p_mode = 'exchange' then counterpart_registration.id else null end,
    'counterpart_id', case when p_mode = 'exchange' then counterpart_registration.user_id else null end,
    'replacement_staff_id', case when p_mode = 'replacement' then p_replacement_staff_id else null end
  );

  update public.swap_requests
  set approval_history = jsonb_build_array(history_entry)
  where id = created_request.id
  returning * into created_request;

  perform private.log_shift_audit(
    'swaps', 'create', 'swap_request', created_request.id,
    'Swap created: ' || p_mode || ' (' || role_name || ')',
    jsonb_build_object('request_id', created_request.id, 'mode', p_mode, 'role', role_name),
    array_remove(array[source_shift.id, case when p_mode = 'exchange' then target_shift.id end], null)
  );

  return created_request;
end;
$$;

create or replace function public.approve_shift_swap_request(p_request_id text, p_notes text default null)
returns public.swap_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id text;
  request_row public.swap_requests;
  source_registration public.shift_registrations;
  counterpart_registration public.shift_registrations;
  source_shift public.shifts;
  target_shift public.shifts;
  requester public.business_users;
  participant public.business_users;
  approved_history jsonb;
  completed_history jsonb;
  now_at timestamptz := statement_timestamp();
  new_target_reg_id text := gen_random_uuid()::text;
  new_source_reg_id text := gen_random_uuid()::text;
  new_replacement_reg_id text := gen_random_uuid()::text;
begin
  actor_id := private.require_shift_actor(true);
  select * into request_row from public.swap_requests where id = p_request_id for update;
  if request_row.id is null then raise exception using errcode = 'P0001', message = 'SWAP_NOT_FOUND'; end if;
  if request_row.mode not in ('replacement', 'exchange') then raise exception using errcode = '22023', message = 'SWAP_MODE_READ_ONLY'; end if;
  if request_row.status <> 'accepted' then raise exception using errcode = 'P0001', message = 'SWAP_NOT_ACCEPTED'; end if;

  perform private.lock_swap_registrations(array_remove(array[
    request_row.source_registration_id,
    request_row.counterpart_registration_id
  ]::text[], null));
  perform private.lock_swap_shifts(array_remove(array[
    request_row.source_shift_id,
    coalesce(request_row.target_shift_id, request_row.source_shift_id)
  ]::text[], null));
  perform private.lock_swap_rows(array_remove(array[
    'user:' || request_row.requester_id,
    'user:' || request_row.counterpart_id,
    'user:' || request_row.replacement_staff_id
  ]::text[], null));
  perform private.lock_swap_users(array_remove(array[
    request_row.requester_id,
    request_row.counterpart_id,
    request_row.replacement_staff_id
  ]::text[], null));

  select * into source_registration from public.shift_registrations where id = request_row.source_registration_id;
  if source_registration.id is null or source_registration.status not in ('approved', 'manually_assigned') then
    raise exception using errcode = 'P0001', message = 'SOURCE_STALE';
  end if;
  if source_registration.user_id <> request_row.requester_id
     or source_registration.shift_id <> request_row.source_shift_id
     or source_registration.operational_role <> request_row.operational_role then
    raise exception using errcode = 'P0001', message = 'SOURCE_OWNER_MISMATCH';
  end if;
  PERFORM private.rc19_swap_assignment_range(source_registration.shift_id, source_registration.staffing_segment_id, true);
  select * into source_shift from public.shifts where id = request_row.source_shift_id;
  select * into target_shift from public.shifts where id = coalesce(request_row.target_shift_id, request_row.source_shift_id);
  if source_shift.id is null or target_shift.id is null
     or source_shift.deleted_at is not null or source_shift.archived_at is not null
     or target_shift.deleted_at is not null or target_shift.archived_at is not null then
    raise exception using errcode = 'P0001', message = 'SHIFT_STALE';
  end if;
  if source_shift.status <> 'scheduled' or target_shift.status <> 'scheduled' then
    raise exception using errcode = 'P0001', message = 'SHIFT_NOT_SCHEDULED';
  end if;

  -- Issue #93: Validation on Approval Timing
  if request_row.mode = 'replacement' then
    -- Ordinary PASS cannot be approved during or after live
    if now_at >= source_shift.start_at then
      raise exception using errcode = 'P0001', message = 'PASS_DURING_LIVE_NOT_ALLOWED';
    end if;

    -- Campaign PASS MUST be approved at least 24 hours (1440 minutes) before live start
    -- QUY TẮC: Ca có campaign_id luôn là ca Campaign, kể cả khi campaign đã archived.
    -- Campaign archived KHÔNG BAO GIỜ hạ cấp thành ca Daily!
    if source_shift.campaign_id is not null
       and btrim(source_shift.campaign_id) <> ''
       and lower(btrim(source_shift.campaign_id)) <> 'none' then
      if now_at > (source_shift.start_at - interval '24 hours') then
        raise exception using errcode = 'P0001', message = 'CAMPAIGN_PASS_APPROVAL_DEADLINE_EXCEEDED';
      end if;
    end if;
  else
    -- Exchange cannot be approved during live
    if now_at >= source_shift.start_at or now_at >= target_shift.start_at then
      raise exception using errcode = 'P0001', message = 'EXCHANGE_DURING_LIVE_NOT_ALLOWED';
    end if;
  end if;

  select * into requester from public.business_users where id = request_row.requester_id;
  if requester.id is null or requester.status <> 'active' or requester.account_status <> 'active'
     or requester.deleted_at is not null or requester.archived_at is not null then
    raise exception using errcode = 'P0001', message = 'REQUESTER_INACTIVE';
  end if;
  perform private.assert_shift_role_eligibility(requester.id, request_row.operational_role);
  perform private.rc19_assert_swap_agency_scope(requester.id, source_shift.id);

  if request_row.mode = 'replacement' then
    if request_row.replacement_staff_id is null or request_row.replacement_staff_id = requester.id then
      raise exception using errcode = '22023', message = 'REPLACEMENT_MISSING';
    end if;
    select * into participant from public.business_users where id = request_row.replacement_staff_id;
    if participant.id is null or participant.status <> 'active' or participant.account_status <> 'active'
       or participant.deleted_at is not null or participant.archived_at is not null then
      raise exception using errcode = 'P0001', message = 'REPLACEMENT_INACTIVE';
    end if;
    if request_row.responded_by <> participant.id then
      raise exception using errcode = 'P0001', message = 'REPLACEMENT_ACCEPTANCE_STALE';
    end if;
    perform private.assert_shift_role_eligibility(participant.id, request_row.operational_role);
    perform private.rc19_assert_swap_agency_scope(participant.id, source_shift.id);
    IF EXISTS (
      SELECT 1 FROM public.shift_registrations
      WHERE shift_id = source_shift.id AND user_id = participant.id
        AND operational_role::text = request_row.operational_role
        AND staffing_segment_id IS NOT DISTINCT FROM source_registration.staffing_segment_id
        AND status IN ('approved', 'manually_assigned')
    ) THEN
      RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'REPLACEMENT_ALREADY_ASSIGNED';
    END IF;
    PERFORM private.rc19_assert_swap_capacity(
      source_shift.id, source_registration.staffing_segment_id, request_row.operational_role,
      ARRAY[source_registration.id], 1
    );
    PERFORM private.rc19_assert_swap_interval_clear(
      participant.id, request_row.operational_role, source_shift.id,
      source_registration.staffing_segment_id, ARRAY[source_registration.id]
    );

    update public.shift_registrations
    set status = 'cancelled', cancelled_at = now_at, updated_at = now_at
    where id = source_registration.id;

    insert into public.shift_registrations (
      id, shift_id, user_id, operational_role, status, source,
      requested_at, reviewed_by, reviewed_at, created_at, updated_at, staffing_segment_id
    ) values (
      new_replacement_reg_id, source_shift.id, participant.id, request_row.operational_role,
      'approved', 'manual_assignment', now_at, actor_id, now_at, now_at, now_at, source_registration.staffing_segment_id
    );
  else
    select * into counterpart_registration
    from public.shift_registrations
    where id = request_row.counterpart_registration_id;
    if counterpart_registration.id is null or counterpart_registration.status not in ('approved', 'manually_assigned') then
      raise exception using errcode = 'P0001', message = 'COUNTERPART_STALE';
    end if;
    if counterpart_registration.shift_id <> target_shift.id
       or counterpart_registration.operational_role <> request_row.operational_role
       or counterpart_registration.user_id <> request_row.counterpart_id
       or counterpart_registration.user_id = requester.id then
      raise exception using errcode = '22023', message = 'COUNTERPART_MISMATCH';
    end if;
    PERFORM private.rc19_swap_assignment_range(counterpart_registration.shift_id, counterpart_registration.staffing_segment_id, true);
    select * into participant from public.business_users where id = request_row.counterpart_id;
    if participant.id is null or participant.status <> 'active' or participant.account_status <> 'active'
       or participant.deleted_at is not null or participant.archived_at is not null then
      raise exception using errcode = 'P0001', message = 'COUNTERPART_INACTIVE';
    end if;
    if request_row.responded_by <> participant.id then
      raise exception using errcode = 'P0001', message = 'COUNTERPART_ACCEPTANCE_STALE';
    end if;
    perform private.assert_shift_role_eligibility(participant.id, request_row.operational_role);
    perform private.rc19_assert_swap_agency_scope(requester.id, target_shift.id);
    perform private.rc19_assert_swap_agency_scope(participant.id, target_shift.id);
    perform private.rc19_assert_swap_agency_scope(participant.id, source_shift.id);
    if exists (
      select 1 from public.swap_requests
      where counterpart_registration_id = counterpart_registration.id
        and id <> request_row.id
        and status in ('pending', 'accepted', 'approved')
    ) then
      raise exception using errcode = '23505', message = 'DUPLICATE_COUNTERPART_SWAP';
    end if;
    IF source_shift.id = target_shift.id
       AND source_registration.staffing_segment_id IS NOT DISTINCT FROM counterpart_registration.staffing_segment_id THEN
      PERFORM private.rc19_assert_swap_capacity(
        target_shift.id, counterpart_registration.staffing_segment_id, request_row.operational_role,
        ARRAY[source_registration.id, counterpart_registration.id], 2
      );
    ELSE
      PERFORM private.rc19_assert_swap_capacity(
        target_shift.id, counterpart_registration.staffing_segment_id, request_row.operational_role,
        ARRAY[source_registration.id, counterpart_registration.id], 1
      );
      PERFORM private.rc19_assert_swap_capacity(
        source_shift.id, source_registration.staffing_segment_id, request_row.operational_role,
        ARRAY[source_registration.id, counterpart_registration.id], 1
      );
    END IF;
    PERFORM private.rc19_assert_swap_interval_clear(
      requester.id, request_row.operational_role, target_shift.id,
      counterpart_registration.staffing_segment_id,
      ARRAY[source_registration.id, counterpart_registration.id]
    );
    PERFORM private.rc19_assert_swap_interval_clear(
      participant.id, request_row.operational_role, source_shift.id,
      source_registration.staffing_segment_id,
      ARRAY[source_registration.id, counterpart_registration.id]
    );

    update public.shift_registrations
    set status = 'cancelled', cancelled_at = now_at, updated_at = now_at
    where id in (source_registration.id, counterpart_registration.id);

    insert into public.shift_registrations (
      id, shift_id, user_id, operational_role, status, source,
      requested_at, reviewed_by, reviewed_at, created_at, updated_at, staffing_segment_id
    ) values
      (new_target_reg_id, target_shift.id, requester.id, request_row.operational_role, 'approved', 'manual_assignment', now_at, actor_id, now_at, now_at, now_at, counterpart_registration.staffing_segment_id),
      (new_source_reg_id, source_shift.id, participant.id, request_row.operational_role, 'approved', 'manual_assignment', now_at, actor_id, now_at, now_at, now_at, source_registration.staffing_segment_id);
  end if;

  approved_history := jsonb_build_object(
    'action', 'approved',
    'actor_id', actor_id,
    'at', to_char(now_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'mode', request_row.mode,
    'from_status', 'accepted',
    'to_status', 'approved',
    'notes', p_notes,
    'source_shift_id', source_shift.id,
    'target_shift_id', case when request_row.mode = 'exchange' then target_shift.id else null end
  );
  completed_history := jsonb_build_object(
    'action', 'completed',
    'actor_id', actor_id,
    'at', to_char(now_at, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'mode', request_row.mode,
    'from_status', 'approved',
    'to_status', 'completed',
    'notes', p_notes,
    'source_shift_id', source_shift.id,
    'target_shift_id', case when request_row.mode = 'exchange' then target_shift.id else null end
  );

  update public.swap_requests
  set status = 'approved',
      approved_by = actor_id,
      approved_at = now_at,
      updated_at = now_at,
      version = coalesce(version, 1) + 1,
      approval_history = coalesce(approval_history, '[]'::jsonb) || jsonb_build_array(approved_history)
  where id = request_row.id
  returning * into request_row;

  update public.swap_requests
  set status = 'completed',
      completed_at = now_at,
      updated_at = now_at,
      version = coalesce(version, 1) + 1,
      approval_history = coalesce(approval_history, '[]'::jsonb) || jsonb_build_array(completed_history)
  where id = request_row.id
  returning * into request_row;

  perform private.log_shift_audit(
    'swaps', 'approve', 'swap_request', request_row.id,
    'Swap approved & completed: ' || request_row.mode,
    jsonb_build_object('request_id', request_row.id, 'mode', request_row.mode),
    array_remove(array[source_shift.id, case when request_row.mode = 'exchange' then target_shift.id end], null)
  );

  return request_row;
end;
$$;

ALTER FUNCTION public.create_shift_swap_request(text,text,text,text,text,text,text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.create_shift_swap_request(text,text,text,text,text,text,text)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.create_shift_swap_request(text,text,text,text,text,text,text)
  TO authenticated;
ALTER FUNCTION public.approve_shift_swap_request(text,text) OWNER TO postgres;
-- The two-argument implementation remains an internal SECURITY DEFINER core.
-- Client callers must use the version-fenced three-argument wrapper.
REVOKE ALL ON FUNCTION public.approve_shift_swap_request(text,text)
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.approve_shift_swap_request(text,text,integer)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.approve_shift_swap_request(text,text,integer)
  TO authenticated;

DO $privileges$
BEGIN
  IF NOT has_function_privilege('authenticated', 'public.check_shift_swap_conflict(text,text,text,text,text)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.create_shift_swap_request(text,text,text,text,text,text,text)', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.approve_shift_swap_request(text,text,integer)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.check_shift_swap_conflict(text,text,text,text,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.create_shift_swap_request(text,text,text,text,text,text,text)', 'EXECUTE')
     OR has_function_privilege('authenticated', 'public.approve_shift_swap_request(text,text)', 'EXECUTE')
     OR has_function_privilege('anon', 'public.approve_shift_swap_request(text,text,integer)', 'EXECUTE') THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'W4_SEGMENT_SWAP_RPC_PRIVILEGE_CHECK_FAILED';
  END IF;
END
$privileges$;

COMMIT;
