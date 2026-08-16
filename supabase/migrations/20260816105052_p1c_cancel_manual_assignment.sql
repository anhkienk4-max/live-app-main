-- P1C staffing hotfix: prevent self-cancel of a manually assigned registration.
-- A staff member assigned by Admin/Leader (source manual_assignment or status
-- manually_assigned) must not be able to self-cancel; removal is handled by
-- Admin/Leader through remove_shift_staffing. Self-registration (pending /
-- approved, source self_registration) keeps the existing cutoff/lock rules.

create or replace function public.cancel_own_shift_registration(
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
  was_staffed boolean;
begin
  actor_id := private.require_shift_actor(false);
  select shift_id into target_registration.shift_id
  from public.shift_registrations
  where id = p_registration_id and user_id = actor_id;
  if target_registration.shift_id is null then
    raise exception using errcode = 'P0001', message = 'REGISTRATION_NOT_FOUND';
  end if;

  select * into target_shift from public.shifts
  where id = target_registration.shift_id and deleted_at is null and archived_at is null
  for update;
  select * into target_registration from public.shift_registrations
  where id = p_registration_id and user_id = actor_id
  for update;

  if target_registration.source = 'manual_assignment'
     or target_registration.status = 'manually_assigned' then
    raise exception using errcode = 'P0001', message = 'MANUAL_ASSIGNMENT_REQUIRES_MANAGER_REMOVAL';
  end if;
  if target_registration.status not in ('pending', 'approved') then
    raise exception using errcode = 'P0001', message = 'INVALID_REGISTRATION_TRANSITION';
  end if;
  if target_shift.status <> 'scheduled'
    or target_shift.registration_locked
    or target_shift.registration_cutoff_at <= statement_timestamp()
  then
    raise exception using errcode = 'P0001', message = 'CANCELLATION_CLOSED';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(actor_id, 91731));
  was_staffed := target_registration.status = 'approved';
  update public.shift_registrations
  set status = 'cancelled', cancelled_at = statement_timestamp(),
      review_notes = coalesce(p_notes, review_notes)
  where id = p_registration_id
  returning * into target_registration;
  if was_staffed then
    perform private.refresh_shift_registration_lock(target_shift.id, true);
  end if;
  return target_registration;
end;
$$;

revoke all on function public.cancel_own_shift_registration(text, text) from public, anon, authenticated;
grant execute on function public.cancel_own_shift_registration(text, text) to authenticated;

comment on function public.cancel_own_shift_registration(text, text) is
  'Self-cancel is limited to self-registered pending/approved registrations; manually assigned staffing must be removed via remove_shift_staffing.';
