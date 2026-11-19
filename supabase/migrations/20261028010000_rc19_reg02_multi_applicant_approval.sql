-- REG-02 #128 | P1 registration/approval source migration only
-- Isolated branch: no Production DDL, no setting or flag modification.
-- Baseline: feat/ops-full-app-upgrade-rc19 @ 1b96f38a17768e96b92f23056efba4b61cc76f84
begin;
do $reg02$ begin
  if to_regclass('public.shift_registrations') is null
     or to_regclass('public.shifts') is null
     or to_regclass('public.system_settings') is null
     or to_regprocedure('private.assert_shift_capacity(public.shifts,text,text)') is null
     or to_regprocedure('private.refresh_shift_registration_lock(text,boolean)') is null
     or to_regprocedure('private.assert_expected_version(text,integer,integer)') is null
     or not (select relrowsecurity from pg_catalog.pg_class where oid = 'public.shift_registrations'::regclass)
  then
    raise exception using errcode='42501',message='REG02_BASELINE_PRECONDITION_FAILED';
  end if;
end $reg02$;

-- Keep 3-role role eligibility, overlap and approved-only capacity logic intact.
create or replace function public.register_for_shift(p_shift_id text, p_role text)
returns public.shift_registrations
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id text;
  target_shift public.shifts;
  created_registration public.shift_registrations;
  settings_row public.system_settings;
begin
  actor_id := private.require_shift_actor(false);
  select * into settings_row from public.system_settings limit 1;
  if settings_row.id is null then
    raise exception using errcode = 'P0001', message = 'OPERATIONAL_SETTINGS_NOT_CONFIGURED';
  end if;
  select * into target_shift
  from public.shifts
  where id = p_shift_id and deleted_at is null and archived_at is null
  for update;
  if target_shift.id is null then
    raise exception using errcode = 'P0001', message = 'SHIFT_NOT_FOUND';
  end if;
  if target_shift.status <> 'scheduled'
    or target_shift.registration_locked
    or target_shift.end_at <= statement_timestamp()
    or target_shift.registration_cutoff_at <= statement_timestamp()
  then
    raise exception using errcode = 'P0001', message = 'REGISTRATION_CLOSED';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(actor_id, 91731));
  perform private.assert_shift_role_eligibility(actor_id, p_role);
  perform private.assert_shift_capacity(target_shift, p_role, null);
  perform private.assert_no_shift_registration_conflict(actor_id, target_shift, p_role, null);

  insert into public.shift_registrations (
    shift_id, user_id, operational_role, status, source, reviewed_by, reviewed_at
  ) values (
    p_shift_id,
    actor_id,
    p_role,
    case when settings_row.require_registration_approval then 'pending' else 'approved' end,
    'self_registration',
    case when settings_row.require_registration_approval then null else actor_id end,
    case when settings_row.require_registration_approval then null else statement_timestamp() end
  ) returning * into created_registration;
  if not settings_row.require_registration_approval and settings_row.auto_lock_filled_shifts then
    perform private.refresh_shift_registration_lock(p_shift_id, false);
  end if;
  return created_registration;
end;
$$;

-- Apply rejection only if approved + manually_assigned fills THIS role.
create or replace function private.reg02_reject_surplus(
  p_shift_id text,
  p_role text,
  p_actor_id text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_capacity integer;
  v_filled integer;
  v_rejected integer;
begin
  -- Caller MUST already hold public.shifts row FOR UPDATE. All canonical
  -- approval and manual-assignment writers acquire this lock before calling.
  if p_role not in ('host', 'support', 'technical') or p_role is null then
    raise exception using errcode = '22023', message = 'OPERATIONAL_ROLE_INVALID';
  end if;
  select private.shift_required_capacity(s, p_role) into v_capacity
  from public.shifts s where s.id = p_shift_id;
  if v_capacity is null then
    raise exception using errcode = 'P0001', message = 'SHIFT_NOT_FOUND';
  end if;
  select count(*) into v_filled
  from public.shift_registrations r
  where r.shift_id = p_shift_id and r.operational_role = p_role
    and r.status in ('approved', 'manually_assigned');
  if v_filled < v_capacity then return 0; end if;
  if v_filled > v_capacity then
    raise exception using errcode = 'P0001', message = 'SHIFT_CAPACITY_BELOW_STAFFING';
  end if;
  -- UPDATE and approval live inside ONE PostgreSQL transaction. No row outside
  -- the completed role may be affected. Existing audit/version triggers fire.
  with surplus as (
    select r.id from public.shift_registrations r
    where r.shift_id = p_shift_id and r.operational_role = p_role
      and r.status = 'pending'
    order by r.requested_at, r.id
    for update
  ), changed as (
    update public.shift_registrations r
    set status = 'rejected', reviewed_by = p_actor_id,
        reviewed_at = statement_timestamp(),
        review_notes = 'ROLE_CAPACITY_FILLED'
    where r.id in (select id from surplus) and r.status = 'pending'
    returning r.id
  )
  select count(*) into v_rejected from changed;
  return v_rejected;
end;
$$;

-- Existing private manual-assignment helper is reused. Do not create a second ledger.
create or replace function private.insert_manual_shift_assignment(
  p_shift_id text,
  p_user_id text,
  p_role text,
  p_actor_id text,
  p_notes text,
  p_auto_lock boolean
)
returns public.shift_registrations
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_shift public.shifts;
  created_registration public.shift_registrations;
begin
  select * into target_shift
  from public.shifts
  where id = p_shift_id and deleted_at is null and archived_at is null
  for update;
  if target_shift.id is null then
    raise exception using errcode = 'P0001', message = 'SHIFT_NOT_FOUND';
  end if;
  if target_shift.status <> 'scheduled' or target_shift.registration_locked then
    raise exception using errcode = 'P0001', message = 'SHIFT_NOT_OPEN';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_user_id, 91731));
  perform private.assert_shift_role_eligibility(p_user_id, p_role);
  perform private.assert_shift_capacity(target_shift, p_role, null);
  perform private.assert_no_shift_registration_conflict(p_user_id, target_shift, p_role, null);

  insert into public.shift_registrations (
    shift_id, user_id, operational_role, status, source,
    reviewed_by, reviewed_at, review_notes
  ) values (
    p_shift_id, p_user_id, p_role, 'manually_assigned', 'manual_assignment',
    p_actor_id, statement_timestamp(), p_notes
  ) returning * into created_registration;

  perform private.reg02_reject_surplus(p_shift_id, p_role, p_actor_id);
  if p_auto_lock then
    perform private.refresh_shift_registration_lock(p_shift_id, false);
  end if;
  return created_registration;
end;
$$;

-- Standalone approval shares exactly one transaction with surplus rejection.
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
  perform private.reg02_reject_surplus(target_shift.id, target_registration.operational_role, actor_id);
  perform private.refresh_shift_registration_lock(target_shift.id, false);
  return target_registration;
end;
$$;

-- Repair expected-version wrapper lock order for concurrent reviewers.
create or replace function public.approve_shift_registration(p_registration_id text, p_notes text, p_expected_version integer)
returns public.shift_registrations
language plpgsql security definer set search_path = ''
as $$
declare current_version integer;
        current_shift_id text;
begin
  -- Order: shift -> registration -> user advisory (matches canonical RPC and bulk review).
  select shift_id into current_shift_id from public.shift_registrations where id = p_registration_id;
  if current_shift_id is null then raise exception using errcode = 'P0001', message = 'REGISTRATION_NOT_FOUND'; end if;
  perform 1 from public.shifts where id = current_shift_id for update;
  select version into current_version from public.shift_registrations where id = p_registration_id and shift_id = current_shift_id for update;
  if current_version is null then raise exception using errcode = 'P0001', message = 'REGISTRATION_NOT_FOUND'; end if;
  perform private.assert_expected_version('ShiftRegistration', p_expected_version, current_version);
  return public.approve_shift_registration(p_registration_id, p_notes);
end;
$$;

-- No authenticated client may call unguarded approval or private capacity helper.
revoke all on function private.reg02_reject_surplus(text,text,text) from public, anon, authenticated;
revoke all on function public.approve_shift_registration(text,text) from public, anon, authenticated;
revoke all on function public.approve_shift_registration(text,text,integer) from public, anon;
grant execute on function public.approve_shift_registration(text,text,integer) to authenticated;
revoke all on function public.register_for_shift(text,text) from public, anon;
grant execute on function public.register_for_shift(text,text) to authenticated;
commit;
