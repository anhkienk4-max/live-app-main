-- Final Shift Swap production semantics.
-- New requests support only REPLACEMENT and EXCHANGE. Historical MOVE rows
-- remain readable, but are intentionally not actionable through current RPCs.

revoke all on table public.swap_requests from public, anon, authenticated;
grant select on table public.swap_requests to authenticated;

drop policy if exists swap_requests_select on public.swap_requests;
create policy swap_requests_select on public.swap_requests
for select to authenticated
using (
  (select private.current_business_user_is_active())
  and (
    requester_id = (select private.current_business_user_id())
    or counterpart_id = (select private.current_business_user_id())
    or replacement_staff_id = (select private.current_business_user_id())
    or (select private.is_leader_or_admin())
  )
);

create or replace function private.enforce_swap_request_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status <> old.status and not (
    old.mode in ('replacement', 'exchange')
    and (
      (old.status = 'pending' and new.status in ('accepted', 'rejected', 'cancelled'))
      or (old.status = 'accepted' and new.status in ('approved', 'rejected', 'cancelled'))
      or (old.status = 'approved' and new.status = 'completed')
    )
  ) then
    raise exception using errcode = '22023', message = 'SWAP_ILLEGAL_TRANSITION';
  end if;
  return new;
end
$$;
revoke all on function private.enforce_swap_request_transition() from public, anon, authenticated;

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

  if exists (
    select 1 from public.swap_requests
    where source_registration_id = source_registration.id
      and status in ('pending', 'accepted', 'approved')
  ) then
    raise exception using errcode = '23505', message = 'DUPLICATE_ACTIVE_SWAP';
  end if;

  if p_mode = 'replacement' then
    if p_replacement_staff_id = actor_id then
      raise exception using errcode = '22023', message = 'REPLACEMENT_SELF_NOT_ALLOWED';
    end if;
    select * into replacement_user
    from public.business_users
    where id = p_replacement_staff_id;
    if replacement_user.id is null or replacement_user.status <> 'active' or replacement_user.archived_at is not null then
      raise exception using errcode = 'P0001', message = 'REPLACEMENT_INACTIVE';
    end if;
    perform private.assert_shift_role_eligibility(replacement_user.id, role_name);
    if exists (
      select 1 from public.shift_registrations
      where shift_id = source_shift.id
        and user_id = replacement_user.id
        and status in ('approved', 'manually_assigned')
    ) then
      raise exception using errcode = '23505', message = 'REPLACEMENT_ALREADY_ASSIGNED';
    end if;
    perform private.assert_shift_capacity(source_shift, role_name, source_registration.id);
    perform private.assert_no_shift_registration_conflict(replacement_user.id, source_shift, role_name, null);
  else
    if p_target_shift_id = source_shift.id then
      raise exception using errcode = '22023', message = 'SWAP_SAME_SHIFT_EXCHANGE_NOT_ALLOWED';
    end if;
    select * into target_shift from public.shifts where id = p_target_shift_id;
    select * into counterpart_registration from public.shift_registrations where id = p_counterpart_registration_id;
    if target_shift.id is null or target_shift.deleted_at is not null or target_shift.archived_at is not null then
      raise exception using errcode = 'P0001', message = 'TARGET_SHIFT_NOT_FOUND';
    end if;
    if target_shift.status <> 'scheduled' then
      raise exception using errcode = 'P0001', message = 'TARGET_SHIFT_NOT_SCHEDULED';
    end if;
    if counterpart_registration.id is null or counterpart_registration.status not in ('approved', 'manually_assigned') then
      raise exception using errcode = 'P0001', message = 'COUNTERPART_NOT_ACTIVE';
    end if;
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
    if counterpart_user.id is null or counterpart_user.status <> 'active' or counterpart_user.archived_at is not null then
      raise exception using errcode = 'P0001', message = 'COUNTERPART_INACTIVE';
    end if;
    perform private.assert_shift_role_eligibility(counterpart_user.id, role_name);
    if exists (
      select 1 from public.swap_requests
      where counterpart_registration_id = counterpart_registration.id
        and status in ('pending', 'accepted', 'approved')
    ) then
      raise exception using errcode = '23505', message = 'DUPLICATE_COUNTERPART_SWAP';
    end if;
    perform private.assert_shift_capacity(target_shift, role_name, counterpart_registration.id);
    perform private.assert_shift_capacity(source_shift, role_name, source_registration.id);
    perform private.assert_no_shift_registration_conflict(actor_id, target_shift, role_name, source_registration.id);
    perform private.assert_no_shift_registration_conflict(counterpart_user.id, source_shift, role_name, counterpart_registration.id);
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
    role_name, p_mode, 'pending', btrim(p_reason), nullif(btrim(coalesce(p_notes, '')), ''),
    source_shift.id, actor_id,
    case when p_mode = 'replacement' then replacement_user.id else null end,
    case when p_mode = 'replacement' and role_name = 'host' then replacement_user.id else null end,
    case when p_mode = 'replacement' and role_name = 'support' then replacement_user.id else null end,
    case when p_mode = 'replacement' and role_name = 'technical' then replacement_user.id else null end,
    '[]'::jsonb
  ) returning * into created_request;

  history_entry := jsonb_build_object(
    'action', 'created', 'actor_id', actor_id, 'requester_id', actor_id,
    'counterpart_id', created_request.counterpart_id,
    'replacement_staff_id', created_request.replacement_staff_id,
    'source_registration_id', created_request.source_registration_id,
    'counterpart_registration_id', created_request.counterpart_registration_id,
    'source_shift_id', created_request.source_shift_id, 'target_shift_id', created_request.target_shift_id,
    'mode', created_request.mode, 'operational_role', created_request.operational_role,
    'from_status', null, 'to_status', 'pending', 'reason', created_request.reason,
    'at', statement_timestamp()
  );
  update public.swap_requests
  set approval_history = jsonb_build_array(history_entry)
  where id = created_request.id
  returning * into created_request;
  return created_request;
end
$$;
revoke all on function public.create_shift_swap_request(text,text,text,text,text,text,text) from public, anon, authenticated;
grant execute on function public.create_shift_swap_request(text,text,text,text,text,text,text) to authenticated;

create or replace function public.respond_shift_swap_request(
  p_request_id text,
  p_action text,
  p_notes text default null
) returns public.swap_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id text;
  request_row public.swap_requests;
  participant_id text;
  next_status text;
  history_entry jsonb;
begin
  actor_id := private.require_shift_actor(false);
  if p_action not in ('accept', 'reject') then
    raise exception using errcode = '22023', message = 'SWAP_ACTION_INVALID';
  end if;
  select * into request_row from public.swap_requests where id = p_request_id for update;
  if request_row.id is null then raise exception using errcode = 'P0001', message = 'SWAP_NOT_FOUND'; end if;
  if request_row.mode not in ('replacement', 'exchange') then
    raise exception using errcode = '22023', message = 'SWAP_MODE_READ_ONLY';
  end if;
  if request_row.status <> 'pending' then raise exception using errcode = 'P0001', message = 'SWAP_NOT_PENDING'; end if;
  participant_id := case when request_row.mode = 'replacement' then request_row.replacement_staff_id else request_row.counterpart_id end;
  if participant_id <> actor_id then raise exception using errcode = '42501', message = 'SWAP_NOT_SELECTED_PARTICIPANT'; end if;
  next_status := case when p_action = 'accept' then 'accepted' else 'rejected' end;
  history_entry := jsonb_build_object(
    'action', case when p_action = 'accept' then 'accepted' else 'rejected' end,
    'actor_id', actor_id, 'requester_id', request_row.requester_id,
    'counterpart_id', request_row.counterpart_id, 'replacement_staff_id', request_row.replacement_staff_id,
    'source_registration_id', request_row.source_registration_id,
    'counterpart_registration_id', request_row.counterpart_registration_id,
    'source_shift_id', request_row.source_shift_id, 'target_shift_id', request_row.target_shift_id,
    'mode', request_row.mode, 'operational_role', request_row.operational_role,
    'from_status', request_row.status, 'to_status', next_status,
    'reason', request_row.reason, 'notes', p_notes, 'at', statement_timestamp()
  );
  update public.swap_requests
  set status = next_status, responded_at = statement_timestamp(), responded_by = actor_id,
      notes = coalesce(p_notes, notes), updated_at = statement_timestamp(),
      approval_history = approval_history || jsonb_build_array(history_entry)
  where id = p_request_id
  returning * into request_row;
  return request_row;
end
$$;
revoke all on function public.respond_shift_swap_request(text,text,text) from public, anon, authenticated;
grant execute on function public.respond_shift_swap_request(text,text,text) to authenticated;

create or replace function public.reject_shift_swap_request(p_request_id text, p_notes text default null)
returns public.swap_requests
language plpgsql
security definer
set search_path = ''
as $$
declare actor_id text; request_row public.swap_requests; history_entry jsonb;
begin
  actor_id := private.require_shift_actor(true);
  select * into request_row from public.swap_requests where id = p_request_id for update;
  if request_row.id is null then raise exception using errcode = 'P0001', message = 'SWAP_NOT_FOUND'; end if;
  if request_row.mode not in ('replacement', 'exchange') then raise exception using errcode = '22023', message = 'SWAP_MODE_READ_ONLY'; end if;
  if request_row.status not in ('pending', 'accepted') then raise exception using errcode = 'P0001', message = 'SWAP_NOT_REJECTABLE'; end if;
  history_entry := jsonb_build_object(
    'action', 'rejected', 'actor_id', actor_id, 'requester_id', request_row.requester_id,
    'counterpart_id', request_row.counterpart_id, 'replacement_staff_id', request_row.replacement_staff_id,
    'source_registration_id', request_row.source_registration_id,
    'counterpart_registration_id', request_row.counterpart_registration_id,
    'source_shift_id', request_row.source_shift_id, 'target_shift_id', request_row.target_shift_id,
    'mode', request_row.mode, 'operational_role', request_row.operational_role,
    'from_status', request_row.status, 'to_status', 'rejected',
    'reason', request_row.reason, 'notes', p_notes, 'at', statement_timestamp()
  );
  update public.swap_requests
  set status = 'rejected', approved_by = actor_id, approved_at = statement_timestamp(),
      notes = coalesce(p_notes, notes), updated_at = statement_timestamp(),
      approval_history = approval_history || jsonb_build_array(history_entry)
  where id = p_request_id
  returning * into request_row;
  return request_row;
end
$$;
revoke all on function public.reject_shift_swap_request(text,text) from public, anon, authenticated;
grant execute on function public.reject_shift_swap_request(text,text) to authenticated;

create or replace function public.cancel_own_shift_swap_request(p_request_id text, p_reason text default null)
returns public.swap_requests
language plpgsql
security definer
set search_path = ''
as $$
declare actor_id text; request_row public.swap_requests; history_entry jsonb;
begin
  actor_id := private.require_shift_actor(false);
  select * into request_row from public.swap_requests where id = p_request_id for update;
  if request_row.id is null then raise exception using errcode = 'P0001', message = 'SWAP_NOT_FOUND'; end if;
  if request_row.mode not in ('replacement', 'exchange') then raise exception using errcode = '22023', message = 'SWAP_MODE_READ_ONLY'; end if;
  if request_row.requester_id <> actor_id then raise exception using errcode = '42501', message = 'SWAP_NOT_OWNER'; end if;
  if request_row.status not in ('pending', 'accepted') then raise exception using errcode = 'P0001', message = 'SWAP_NOT_CANCELLABLE'; end if;
  history_entry := jsonb_build_object(
    'action', 'cancelled', 'actor_id', actor_id, 'requester_id', request_row.requester_id,
    'counterpart_id', request_row.counterpart_id, 'replacement_staff_id', request_row.replacement_staff_id,
    'source_registration_id', request_row.source_registration_id,
    'counterpart_registration_id', request_row.counterpart_registration_id,
    'source_shift_id', request_row.source_shift_id, 'target_shift_id', request_row.target_shift_id,
    'mode', request_row.mode, 'operational_role', request_row.operational_role,
    'from_status', request_row.status, 'to_status', 'cancelled',
    'reason', coalesce(p_reason, request_row.reason), 'at', statement_timestamp()
  );
  update public.swap_requests
  set status = 'cancelled', deleted_at = statement_timestamp(), deleted_by = actor_id,
      deletion_reason = coalesce(p_reason, deletion_reason), updated_at = statement_timestamp(),
      approval_history = approval_history || jsonb_build_array(history_entry)
  where id = p_request_id
  returning * into request_row;
  return request_row;
end
$$;
revoke all on function public.cancel_own_shift_swap_request(text,text) from public, anon, authenticated;
grant execute on function public.cancel_own_shift_swap_request(text,text) to authenticated;

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
  end if;

  approved_history := jsonb_build_object(
    'action', 'approved', 'actor_id', actor_id, 'requester_id', request_row.requester_id,
    'counterpart_id', request_row.counterpart_id, 'replacement_staff_id', request_row.replacement_staff_id,
    'source_registration_id', request_row.source_registration_id,
    'counterpart_registration_id', request_row.counterpart_registration_id,
    'source_shift_id', request_row.source_shift_id, 'target_shift_id', request_row.target_shift_id,
    'mode', request_row.mode, 'operational_role', request_row.operational_role,
    'from_status', 'accepted', 'to_status', 'approved',
    'reason', request_row.reason, 'notes', p_notes, 'at', now_at
  );
  update public.swap_requests
  set status = 'approved', approved_by = actor_id, approved_at = now_at,
      notes = coalesce(p_notes, notes), updated_at = now_at,
      approval_history = approval_history || jsonb_build_array(approved_history)
  where id = p_request_id
  returning * into request_row;

  if request_row.mode = 'replacement' then
    insert into public.shift_registrations (
      shift_id, user_id, operational_role, status, source, requested_at, reviewed_by, reviewed_at
    ) values (
      source_shift.id, participant.id, request_row.operational_role,
      'approved', 'manual_assignment', now_at, actor_id, now_at
    );
    update public.shift_registrations
    set status = 'cancelled', cancelled_at = now_at, updated_at = now_at
    where id = source_registration.id;
    perform private.refresh_shift_registration_lock(source_shift.id, true);
  else
    update public.shift_registrations
    set status = 'cancelled', cancelled_at = now_at, updated_at = now_at
    where id in (source_registration.id, counterpart_registration.id);
    insert into public.shift_registrations (
      shift_id, user_id, operational_role, status, source, requested_at, reviewed_by, reviewed_at
    ) values
      (target_shift.id, requester.id, request_row.operational_role, 'approved', 'manual_assignment', now_at, actor_id, now_at),
      (source_shift.id, participant.id, request_row.operational_role, 'approved', 'manual_assignment', now_at, actor_id, now_at);
    perform private.refresh_shift_registration_lock(source_shift.id, true);
    perform private.refresh_shift_registration_lock(target_shift.id, true);
  end if;

  completed_history := jsonb_build_object(
    'action', 'completed', 'actor_id', actor_id, 'requester_id', request_row.requester_id,
    'counterpart_id', request_row.counterpart_id, 'replacement_staff_id', request_row.replacement_staff_id,
    'source_registration_id', request_row.source_registration_id,
    'counterpart_registration_id', request_row.counterpart_registration_id,
    'source_shift_id', request_row.source_shift_id, 'target_shift_id', request_row.target_shift_id,
    'mode', request_row.mode, 'operational_role', request_row.operational_role,
    'from_status', 'approved', 'to_status', 'completed',
    'reason', request_row.reason, 'at', statement_timestamp()
  );
  update public.swap_requests
  set status = 'completed', completed_at = statement_timestamp(), updated_at = statement_timestamp(),
      approval_history = approval_history || jsonb_build_array(completed_history)
  where id = p_request_id
  returning * into request_row;
  return request_row;
end
$$;
revoke all on function public.approve_shift_swap_request(text,text) from public, anon, authenticated;
grant execute on function public.approve_shift_swap_request(text,text) to authenticated;
