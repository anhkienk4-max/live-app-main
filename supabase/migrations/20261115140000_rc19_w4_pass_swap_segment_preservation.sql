BEGIN;
DO $guard$
BEGIN
  IF to_regclass('public.shift_registrations') IS NULL
    OR to_regclass('public.shift_staffing_segments') IS NULL
    OR to_regprocedure('public.approve_shift_swap_request(text,text)') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='55000', MESSAGE='W4_PASS_SWAP_SEGMENT_BASELINE_PRECONDITION_FAILED';
  END IF;
END;
$guard$;
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
  if requester.id is null or requester.status <> 'active' or requester.archived_at is not null then
    raise exception using errcode = 'P0001', message = 'REQUESTER_INACTIVE';
  end if;
  perform private.assert_shift_role_eligibility(requester.id, request_row.operational_role);

  if request_row.mode = 'replacement' then
    if request_row.replacement_staff_id is null or request_row.replacement_staff_id = requester.id then
      raise exception using errcode = '22023', message = 'REPLACEMENT_MISSING';
    end if;
    select * into participant from public.business_users where id = request_row.replacement_staff_id;
    if participant.id is null or participant.status <> 'active' or participant.archived_at is not null then
      raise exception using errcode = 'P0001', message = 'REPLACEMENT_INACTIVE';
    end if;
    if request_row.responded_by <> participant.id then
      raise exception using errcode = 'P0001', message = 'REPLACEMENT_ACCEPTANCE_STALE';
    end if;
    perform private.assert_shift_role_eligibility(participant.id, request_row.operational_role);
    if exists (
      select 1 from public.shift_registrations
      where shift_id = source_shift.id and user_id = participant.id
        and status in ('approved', 'manually_assigned')
    ) then
      raise exception using errcode = '23505', message = 'REPLACEMENT_ALREADY_ASSIGNED';
    end if;
    perform private.assert_shift_capacity(source_shift, request_row.operational_role, source_registration.id);
    perform private.assert_no_shift_registration_conflict(participant.id, source_shift, request_row.operational_role, null);

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
    select * into participant from public.business_users where id = request_row.counterpart_id;
    if participant.id is null or participant.status <> 'active' or participant.archived_at is not null then
      raise exception using errcode = 'P0001', message = 'COUNTERPART_INACTIVE';
    end if;
    if request_row.responded_by <> participant.id then
      raise exception using errcode = 'P0001', message = 'COUNTERPART_ACCEPTANCE_STALE';
    end if;
    perform private.assert_shift_role_eligibility(participant.id, request_row.operational_role);
    if exists (
      select 1 from public.swap_requests
      where counterpart_registration_id = counterpart_registration.id
        and id <> request_row.id
        and status in ('pending', 'accepted', 'approved')
    ) then
      raise exception using errcode = '23505', message = 'DUPLICATE_COUNTERPART_SWAP';
    end if;
    perform private.assert_shift_capacity(target_shift, request_row.operational_role, counterpart_registration.id);
    perform private.assert_shift_capacity(source_shift, request_row.operational_role, source_registration.id);
    perform private.assert_no_shift_registration_conflict(requester.id, target_shift, request_row.operational_role, source_registration.id);
    perform private.assert_no_shift_registration_conflict(participant.id, source_shift, request_row.operational_role, counterpart_registration.id);

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
ALTER FUNCTION public.approve_shift_swap_request(text,text) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.approve_shift_swap_request(text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_shift_swap_request(text,text) TO authenticated;

COMMIT;
