-- Bulk staffing approval for Calendar.
-- The existing single-registration RPCs remain the canonical mutation path.

create or replace function public.approve_shift_registration(
  p_registration_id text,
  p_notes text default null
)
returns public.shift_registrations
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id text;
  target_shift public.shifts;
  target_registration public.shift_registrations;
begin
  actor_id := private.require_shift_actor(true);
  select shift_id into target_registration.shift_id
  from public.shift_registrations where id = p_registration_id;
  if target_registration.shift_id is null then
    raise exception using errcode = 'P0001', message = 'REGISTRATION_NOT_FOUND';
  end if;
  select * into target_shift from public.shifts
  where id = target_registration.shift_id and deleted_at is null and archived_at is null
  for update;
  select * into target_registration from public.shift_registrations
  where id = p_registration_id for update;
  if target_registration.status <> 'pending' then
    raise exception using errcode = 'P0001', message = 'INVALID_REGISTRATION_TRANSITION';
  end if;
  if target_shift.status in ('completed', 'cancelled') then
    raise exception using errcode = 'P0001', message = 'SHIFT_NOT_OPEN';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(target_registration.user_id, 91731));
  perform private.assert_shift_role_eligibility(
    target_registration.user_id,
    target_registration.operational_role
  );
  perform private.assert_shift_capacity(target_shift, target_registration.operational_role, p_registration_id);
  perform private.assert_no_shift_registration_conflict(
    target_registration.user_id, target_shift, target_registration.operational_role, p_registration_id
  );
  update public.shift_registrations
  set status = 'approved', reviewed_by = actor_id,
      reviewed_at = statement_timestamp(), review_notes = p_notes
  where id = p_registration_id
  returning * into target_registration;
  perform private.refresh_shift_registration_lock(target_shift.id, false);
  return target_registration;
end;
$$;

create or replace function public.bulk_review_shift_registrations(
  p_registration_ids text[],
  p_action text,
  p_notes text default null
)
returns table (
  registration_id text,
  review_action text,
  success boolean,
  error_code text,
  error_message text,
  reviewed_registration jsonb
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  input_id text;
  reviewed public.shift_registrations;
  diagnostic_state text;
  diagnostic_message text;
  processed_ids text[] := array[]::text[];
begin
  -- Fail the whole request when the actor is not an active Leader/Admin.
  -- Row-level failures below are isolated only after authority is established.
  perform private.require_shift_actor(true);

  if p_action is null or p_action not in ('approve', 'reject') then
    raise exception using errcode = '22023', message = 'REGISTRATION_REVIEW_ACTION_INVALID';
  end if;
  if p_registration_ids is null or cardinality(p_registration_ids) = 0 then
    raise exception using errcode = '22023', message = 'REGISTRATION_SELECTION_REQUIRED';
  end if;
  if cardinality(p_registration_ids) > 100 then
    raise exception using errcode = '22023', message = 'REGISTRATION_SELECTION_LIMIT_EXCEEDED';
  end if;

  -- Match the canonical single-review lock order (shift -> registration -> user)
  -- and acquire each group deterministically before processing the batch.
  -- This prevents two overlapping bulk requests from locking the same rows in
  -- opposite orders while keeping all validation inside the canonical RPCs.
  perform 1
  from public.shifts as shift
  where shift.id in (
    select distinct registration.shift_id
    from public.shift_registrations as registration
    where registration.id = any(p_registration_ids)
  )
  order by shift.id
  for update;

  perform 1
  from public.shift_registrations as registration
  where registration.id = any(p_registration_ids)
  order by registration.id
  for update;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(staff.user_id, 91731))
  from (
    select distinct registration.user_id
    from public.shift_registrations as registration
    where registration.id = any(p_registration_ids)
    order by registration.user_id
  ) as staff;

  foreach input_id in array p_registration_ids loop
    input_id := btrim(coalesce(input_id, ''));
    if input_id = '' or input_id = any(processed_ids) then
      continue;
    end if;
    processed_ids := array_append(processed_ids, input_id);

    registration_id := input_id;
    review_action := p_action;
    begin
      if p_action = 'approve' then
        reviewed := public.approve_shift_registration(input_id, p_notes);
      else
        reviewed := public.reject_shift_registration(input_id, p_notes);
      end if;
      success := true;
      error_code := null;
      error_message := null;
      reviewed_registration := to_jsonb(reviewed);
      return next;
    exception when others then
      get stacked diagnostics
        diagnostic_state = returned_sqlstate,
        diagnostic_message = message_text;
      success := false;
      error_code := case
        when diagnostic_message in (
          'REGISTRATION_NOT_FOUND',
          'INVALID_REGISTRATION_TRANSITION',
          'SHIFT_NOT_OPEN',
          'SHIFT_FULL',
          'SHIFT_CONFLICT',
          'ALREADY_REGISTERED',
          'MULTI_ROLE_NOT_ALLOWED',
          'ROLE_NOT_QUALIFIED'
        ) then diagnostic_message
        else diagnostic_state
      end;
      error_message := case
        when diagnostic_message in (
          'REGISTRATION_NOT_FOUND',
          'INVALID_REGISTRATION_TRANSITION',
          'SHIFT_NOT_OPEN',
          'SHIFT_FULL',
          'SHIFT_CONFLICT',
          'ALREADY_REGISTERED',
          'MULTI_ROLE_NOT_ALLOWED',
          'ROLE_NOT_QUALIFIED'
        ) then diagnostic_message
        else 'REGISTRATION_REVIEW_FAILED'
      end;
      reviewed_registration := null;
      return next;
    end;
  end loop;
end;
$$;

revoke all on function public.bulk_review_shift_registrations(text[], text, text) from public, anon;
grant execute on function public.bulk_review_shift_registrations(text[], text, text) to authenticated;
