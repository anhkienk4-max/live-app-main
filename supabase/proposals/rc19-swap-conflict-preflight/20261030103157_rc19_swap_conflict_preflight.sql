-- Return only an eligibility result; never return another employee's schedule.
create or replace function private.swap_conflict_exists(
  p_user_id text,
  p_shift_id text,
  p_role text,
  p_exclude_registration_id text default null
) returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_shift public.shifts;
  error_message text;
begin
  select * into target_shift from public.shifts where id = p_shift_id;
  if target_shift.id is null then return true; end if;
  begin
    perform private.assert_no_shift_registration_conflict(p_user_id, target_shift, p_role, p_exclude_registration_id);
    return false;
  exception
    when unique_violation then return true;
    when sqlstate 'P0001' then
      get stacked diagnostics error_message = message_text;
      if error_message in ('SHIFT_CONFLICT', 'MULTI_ROLE_NOT_ALLOWED') then return true; end if;
      raise;
  end;
end;
$$;
revoke all on function private.swap_conflict_exists(text,text,text,text) from public, anon, authenticated;

create or replace function public.check_shift_swap_conflict(
  p_source_registration_id text,
  p_mode text,
  p_replacement_staff_id text default null,
  p_target_shift_id text default null,
  p_counterpart_registration_id text default null
) returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id text := private.require_shift_actor(false);
  source_registration public.shift_registrations;
  counterpart_registration public.shift_registrations;
  source_shift public.shifts;
  target_shift public.shifts;
  candidate public.business_users;
  role_name text;
begin
  if p_source_registration_id is null or p_mode is null or p_mode not in ('replacement','exchange') then
    raise exception using errcode = '22023', message = 'SWAP_PREFLIGHT_PAYLOAD_INVALID';
  end if;

  select * into source_registration from public.shift_registrations where id = p_source_registration_id;
  if source_registration.id is null or source_registration.user_id <> actor_id then
    raise exception using errcode = '42501', message = 'SWAP_NOT_OWNER';
  end if;
  if source_registration.status not in ('approved','manually_assigned') then
    raise exception using errcode = 'P0001', message = 'SOURCE_NOT_ACTIVE';
  end if;
  select * into source_shift from public.shifts where id = source_registration.shift_id;
  if source_shift.id is null or source_shift.deleted_at is not null or source_shift.archived_at is not null or source_shift.status <> 'scheduled' then
    raise exception using errcode = 'P0001', message = 'SOURCE_SHIFT_NOT_SCHEDULED';
  end if;
  role_name := source_registration.operational_role::text;
  perform private.assert_shift_role_eligibility(actor_id, role_name);

  if p_mode = 'replacement' then
    if p_replacement_staff_id is null or p_target_shift_id is not null or p_counterpart_registration_id is not null or p_replacement_staff_id = actor_id then
      raise exception using errcode = '22023', message = 'SWAP_REPLACEMENT_PAYLOAD_INVALID';
    end if;
    select * into candidate from public.business_users
    where id = p_replacement_staff_id and status = 'active' and account_status = 'active' and archived_at is null and deleted_at is null;
    if candidate.id is null then raise exception using errcode = 'P0001', message = 'REPLACEMENT_INACTIVE'; end if;
    perform private.assert_shift_role_eligibility(candidate.id, role_name);
    if exists (
      select 1 from public.shift_registrations
      where shift_id = source_shift.id and user_id = candidate.id and status in ('approved','manually_assigned')
    ) then return 'CONFLICT'; end if;
    perform private.assert_shift_capacity(source_shift, role_name, source_registration.id);
    if private.swap_conflict_exists(candidate.id, source_shift.id, role_name, null) then return 'CONFLICT'; end if;
    return 'VERIFIED_CLEAR';
  end if;

  if p_replacement_staff_id is not null or p_target_shift_id is null or p_counterpart_registration_id is null or p_target_shift_id = source_shift.id then
    raise exception using errcode = '22023', message = 'SWAP_EXCHANGE_PAYLOAD_INVALID';
  end if;
  select * into target_shift from public.shifts where id = p_target_shift_id;
  if target_shift.id is null or target_shift.deleted_at is not null or target_shift.archived_at is not null or target_shift.status <> 'scheduled' or not private.can_read_shift(target_shift.id) then
    raise exception using errcode = 'P0001', message = 'TARGET_SHIFT_NOT_ELIGIBLE';
  end if;
  select * into counterpart_registration from public.shift_registrations where id = p_counterpart_registration_id;
  if counterpart_registration.id is null or counterpart_registration.shift_id <> target_shift.id or counterpart_registration.operational_role::text <> role_name or counterpart_registration.status not in ('approved','manually_assigned') or counterpart_registration.user_id = actor_id then
    raise exception using errcode = 'P0001', message = 'COUNTERPART_NOT_ELIGIBLE';
  end if;
  select * into candidate from public.business_users
  where id = counterpart_registration.user_id and status = 'active' and account_status = 'active' and archived_at is null and deleted_at is null;
  if candidate.id is null then raise exception using errcode = 'P0001', message = 'COUNTERPART_INACTIVE'; end if;
  perform private.assert_shift_role_eligibility(candidate.id, role_name);
  perform private.assert_shift_capacity(source_shift, role_name, source_registration.id);
  perform private.assert_shift_capacity(target_shift, role_name, counterpart_registration.id);
  if private.swap_conflict_exists(actor_id, target_shift.id, role_name, source_registration.id)
    or private.swap_conflict_exists(candidate.id, source_shift.id, role_name, counterpart_registration.id) then
    return 'CONFLICT';
  end if;
  return 'VERIFIED_CLEAR';
end;
$$;
revoke all on function public.check_shift_swap_conflict(text,text,text,text,text) from public, anon, authenticated;
grant execute on function public.check_shift_swap_conflict(text,text,text,text,text) to authenticated;
