-- Core V1 P1-B: server-controlled optimistic concurrency for operational writes.
-- Existing rows start at revision 1; callers may supply the revision they read.
-- The guarded overloads lock and validate before delegating to the existing RPCs.

alter table public.shifts
  add column if not exists version integer not null default 1;
alter table public.shift_registrations
  add column if not exists version integer not null default 1;
alter table public.swap_requests
  add column if not exists version integer not null default 1;

update public.shifts set version = 1 where version is null or version < 1;
update public.shift_registrations set version = 1 where version is null or version < 1;
update public.swap_requests set version = 1 where version is null or version < 1;

alter table public.shifts
  drop constraint if exists shifts_version_positive_check;
alter table public.shift_registrations
  drop constraint if exists shift_registrations_version_positive_check;
alter table public.swap_requests
  drop constraint if exists swap_requests_version_positive_check;

alter table public.shifts
  add constraint shifts_version_positive_check check (version > 0);
alter table public.shift_registrations
  add constraint shift_registrations_version_positive_check check (version > 0);
alter table public.swap_requests
  add constraint swap_requests_version_positive_check check (version > 0);

create or replace function private.bump_concurrency_version()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.version := old.version + 1;
  new.updated_at := statement_timestamp();
  return new;
end;
$$;
revoke all on function private.bump_concurrency_version() from public, anon, authenticated;

drop trigger if exists shifts_bump_concurrency_version on public.shifts;
create trigger shifts_bump_concurrency_version
before update on public.shifts
for each row execute function private.bump_concurrency_version();

drop trigger if exists shift_registrations_bump_concurrency_version on public.shift_registrations;
create trigger shift_registrations_bump_concurrency_version
before update on public.shift_registrations
for each row execute function private.bump_concurrency_version();

drop trigger if exists swap_requests_bump_concurrency_version on public.swap_requests;
create trigger swap_requests_bump_concurrency_version
before update on public.swap_requests
for each row execute function private.bump_concurrency_version();

create or replace function private.assert_expected_version(
  p_entity text,
  p_expected_version integer,
  p_actual_version integer
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_expected_version is null or p_expected_version < 1 then
    raise exception using
      errcode = 'P0001',
      message = 'EXPECTED_VERSION_REQUIRED',
      detail = pg_catalog.format('%s mutations require the positive revision that was read by the caller', p_entity);
  end if;
  if p_expected_version <> p_actual_version then
    raise exception using
      errcode = 'P0001',
      message = 'STALE_WRITE',
      detail = pg_catalog.format('%s revision is stale; expected %s, actual %s', p_entity, p_expected_version, p_actual_version);
  end if;
end;
$$;
revoke all on function private.assert_expected_version(text, integer, integer) from public, anon, authenticated;

-- Shift guards. The expected revision is checked while the row is locked.
create or replace function public.update_shift(
  p_shift_id text,
  p_patch jsonb,
  p_confirm_impact boolean,
  p_expected_version integer
)
returns public.shifts
language plpgsql
security definer
set search_path = ''
as $$
declare current_version integer;
begin
  select version into current_version from public.shifts
  where id = p_shift_id and deleted_at is null and archived_at is null for update;
  if current_version is null then
    raise exception using errcode = 'P0001', message = 'SHIFT_NOT_FOUND';
  end if;
  perform private.assert_expected_version('Shift', p_expected_version, current_version);
  return public.update_shift(p_shift_id, p_patch, p_confirm_impact);
end;
$$;

create or replace function public.update_shift_staffing_labels(
  p_shift_id text,
  p_host_names text[],
  p_assistant_names text[],
  p_technical_names text[],
  p_expected_version integer
)
returns public.shifts
language plpgsql
security definer
set search_path = ''
as $$
declare current_version integer;
begin
  select version into current_version from public.shifts
  where id = p_shift_id and deleted_at is null and archived_at is null for update;
  if current_version is null then
    raise exception using errcode = 'P0001', message = 'SHIFT_NOT_FOUND';
  end if;
  perform private.assert_expected_version('Shift', p_expected_version, current_version);
  return public.update_shift_staffing_labels(p_shift_id, p_host_names, p_assistant_names, p_technical_names);
end;
$$;

create or replace function public.set_shift_registration_lock(
  p_shift_id text,
  p_locked boolean,
  p_expected_version integer
)
returns public.shifts
language plpgsql
security definer
set search_path = ''
as $$
declare current_version integer;
begin
  select version into current_version from public.shifts where id = p_shift_id for update;
  if current_version is null then raise exception using errcode = 'P0001', message = 'SHIFT_NOT_FOUND'; end if;
  perform private.assert_expected_version('Shift', p_expected_version, current_version);
  return public.set_shift_registration_lock(p_shift_id, p_locked);
end;
$$;

create or replace function public.soft_delete_shift(p_shift_id text, p_reason text, p_expected_version integer)
returns public.shifts
language plpgsql security definer set search_path = ''
as $$
declare current_version integer;
begin
  select version into current_version from public.shifts where id = p_shift_id for update;
  if current_version is null then raise exception using errcode = 'P0001', message = 'SHIFT_NOT_FOUND'; end if;
  perform private.assert_expected_version('Shift', p_expected_version, current_version);
  return public.soft_delete_shift(p_shift_id, p_reason);
end;
$$;

create or replace function public.restore_shift(p_shift_id text, p_expected_version integer)
returns public.shifts
language plpgsql security definer set search_path = ''
as $$
declare current_version integer;
begin
  select version into current_version from public.shifts where id = p_shift_id for update;
  if current_version is null then raise exception using errcode = 'P0001', message = 'SHIFT_NOT_FOUND'; end if;
  perform private.assert_expected_version('Shift', p_expected_version, current_version);
  return public.restore_shift(p_shift_id);
end;
$$;

-- Registration guards.
create or replace function public.cancel_own_shift_registration(p_registration_id text, p_notes text, p_expected_version integer)
returns public.shift_registrations
language plpgsql security definer set search_path = ''
as $$
declare current_version integer;
begin
  select version into current_version from public.shift_registrations where id = p_registration_id for update;
  if current_version is null then raise exception using errcode = 'P0001', message = 'REGISTRATION_NOT_FOUND'; end if;
  perform private.assert_expected_version('ShiftRegistration', p_expected_version, current_version);
  return public.cancel_own_shift_registration(p_registration_id, p_notes);
end;
$$;

create or replace function public.approve_shift_registration(p_registration_id text, p_notes text, p_expected_version integer)
returns public.shift_registrations
language plpgsql security definer set search_path = ''
as $$
declare current_version integer;
begin
  select version into current_version from public.shift_registrations where id = p_registration_id for update;
  if current_version is null then raise exception using errcode = 'P0001', message = 'REGISTRATION_NOT_FOUND'; end if;
  perform private.assert_expected_version('ShiftRegistration', p_expected_version, current_version);
  return public.approve_shift_registration(p_registration_id, p_notes);
end;
$$;

create or replace function public.reject_shift_registration(p_registration_id text, p_notes text, p_expected_version integer)
returns public.shift_registrations
language plpgsql security definer set search_path = ''
as $$
declare current_version integer;
begin
  select version into current_version from public.shift_registrations where id = p_registration_id for update;
  if current_version is null then raise exception using errcode = 'P0001', message = 'REGISTRATION_NOT_FOUND'; end if;
  perform private.assert_expected_version('ShiftRegistration', p_expected_version, current_version);
  return public.reject_shift_registration(p_registration_id, p_notes);
end;
$$;

create or replace function public.manual_assign_shift_staff(p_shift_id text, p_user_id text, p_role text, p_notes text, p_expected_version integer)
returns public.shift_registrations
language plpgsql security definer set search_path = ''
as $$
declare current_version integer;
begin
  select version into current_version from public.shifts where id = p_shift_id for update;
  if current_version is null then raise exception using errcode = 'P0001', message = 'SHIFT_NOT_FOUND'; end if;
  perform private.assert_expected_version('Shift', p_expected_version, current_version);
  return public.manual_assign_shift_staff(p_shift_id, p_user_id, p_role, p_notes);
end;
$$;

create or replace function public.manual_assign_imported_shift_staff(p_shift_id text, p_user_id text, p_role text, p_imported_name text, p_match_method text, p_notes text, p_expected_version integer)
returns public.shift_registrations
language plpgsql security definer set search_path = ''
as $$
declare current_version integer;
begin
  select version into current_version from public.shifts where id = p_shift_id for update;
  if current_version is null then raise exception using errcode = 'P0001', message = 'SHIFT_NOT_FOUND'; end if;
  perform private.assert_expected_version('Shift', p_expected_version, current_version);
  return public.manual_assign_imported_shift_staff(p_shift_id, p_user_id, p_role, p_imported_name, p_match_method, p_notes);
end;
$$;

create or replace function public.remove_shift_staffing(p_registration_id text, p_notes text, p_expected_version integer)
returns public.shift_registrations
language plpgsql security definer set search_path = ''
as $$
declare current_version integer;
begin
  select version into current_version from public.shift_registrations where id = p_registration_id for update;
  if current_version is null then raise exception using errcode = 'P0001', message = 'REGISTRATION_NOT_FOUND'; end if;
  perform private.assert_expected_version('ShiftRegistration', p_expected_version, current_version);
  return public.remove_shift_staffing(p_registration_id, p_notes);
end;
$$;

-- Shift Swap state-transition guards.
create or replace function public.respond_shift_swap_request(p_request_id text, p_action text, p_notes text, p_expected_version integer)
returns public.swap_requests
language plpgsql security definer set search_path = ''
as $$
declare current_version integer;
begin
  select version into current_version from public.swap_requests where id = p_request_id for update;
  if current_version is null then raise exception using errcode = 'P0001', message = 'SWAP_NOT_FOUND'; end if;
  perform private.assert_expected_version('SwapRequest', p_expected_version, current_version);
  return public.respond_shift_swap_request(p_request_id, p_action, p_notes);
end;
$$;

create or replace function public.reject_shift_swap_request(p_request_id text, p_notes text, p_expected_version integer)
returns public.swap_requests
language plpgsql security definer set search_path = ''
as $$
declare current_version integer;
begin
  select version into current_version from public.swap_requests where id = p_request_id for update;
  if current_version is null then raise exception using errcode = 'P0001', message = 'SWAP_NOT_FOUND'; end if;
  perform private.assert_expected_version('SwapRequest', p_expected_version, current_version);
  return public.reject_shift_swap_request(p_request_id, p_notes);
end;
$$;

create or replace function public.cancel_own_shift_swap_request(p_request_id text, p_reason text, p_expected_version integer)
returns public.swap_requests
language plpgsql security definer set search_path = ''
as $$
declare current_version integer;
begin
  select version into current_version from public.swap_requests where id = p_request_id for update;
  if current_version is null then raise exception using errcode = 'P0001', message = 'SWAP_NOT_FOUND'; end if;
  perform private.assert_expected_version('SwapRequest', p_expected_version, current_version);
  return public.cancel_own_shift_swap_request(p_request_id, p_reason);
end;
$$;

create or replace function public.approve_shift_swap_request(p_request_id text, p_notes text, p_expected_version integer)
returns public.swap_requests
language plpgsql security definer set search_path = ''
as $$
declare current_version integer;
begin
  select version into current_version from public.swap_requests where id = p_request_id for update;
  if current_version is null then raise exception using errcode = 'P0001', message = 'SWAP_NOT_FOUND'; end if;
  perform private.assert_expected_version('SwapRequest', p_expected_version, current_version);
  return public.approve_shift_swap_request(p_request_id, p_notes);
end;
$$;

-- Retire the unguarded public overloads. Internal SECURITY DEFINER callers may
-- still invoke them, while authenticated clients must use a revision guard.
revoke all on function public.update_shift(text, jsonb, boolean) from public, anon, authenticated;
revoke all on function public.update_shift_staffing_labels(text, text[], text[], text[]) from public, anon, authenticated;
revoke all on function public.set_shift_registration_lock(text, boolean) from public, anon, authenticated;
revoke all on function public.soft_delete_shift(text, text) from public, anon, authenticated;
revoke all on function public.restore_shift(text) from public, anon, authenticated;
revoke all on function public.cancel_own_shift_registration(text, text) from public, anon, authenticated;
revoke all on function public.approve_shift_registration(text, text) from public, anon, authenticated;
revoke all on function public.reject_shift_registration(text, text) from public, anon, authenticated;
revoke all on function public.manual_assign_shift_staff(text, text, text, text) from public, anon, authenticated;
revoke all on function public.manual_assign_imported_shift_staff(text, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.remove_shift_staffing(text, text) from public, anon, authenticated;
revoke all on function public.respond_shift_swap_request(text, text, text) from public, anon, authenticated;
revoke all on function public.reject_shift_swap_request(text, text) from public, anon, authenticated;
revoke all on function public.cancel_own_shift_swap_request(text, text) from public, anon, authenticated;
revoke all on function public.approve_shift_swap_request(text, text) from public, anon, authenticated;

grant execute on function public.update_shift(text, jsonb, boolean, integer) to authenticated;
grant execute on function public.update_shift_staffing_labels(text, text[], text[], text[], integer) to authenticated;
grant execute on function public.set_shift_registration_lock(text, boolean, integer) to authenticated;
grant execute on function public.soft_delete_shift(text, text, integer) to authenticated;
grant execute on function public.restore_shift(text, integer) to authenticated;
grant execute on function public.cancel_own_shift_registration(text, text, integer) to authenticated;
grant execute on function public.approve_shift_registration(text, text, integer) to authenticated;
grant execute on function public.reject_shift_registration(text, text, integer) to authenticated;
grant execute on function public.manual_assign_shift_staff(text, text, text, text, integer) to authenticated;
grant execute on function public.manual_assign_imported_shift_staff(text, text, text, text, text, text, integer) to authenticated;
grant execute on function public.remove_shift_staffing(text, text, integer) to authenticated;
grant execute on function public.respond_shift_swap_request(text, text, text, integer) to authenticated;
grant execute on function public.reject_shift_swap_request(text, text, integer) to authenticated;
grant execute on function public.cancel_own_shift_swap_request(text, text, integer) to authenticated;
grant execute on function public.approve_shift_swap_request(text, text, integer) to authenticated;

-- Bulk registration review is revision-guarded per row.  The original
-- three-argument overload remains available only to SECURITY DEFINER callers;
-- authenticated clients must provide the snapshot version for every row.
create or replace function public.bulk_review_shift_registrations(
  p_registration_ids text[],
  p_action text,
  p_notes text,
  p_expected_versions jsonb
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
  expected_text text;
  expected_version integer;
  current_registration public.shift_registrations;
  valid_ids text[] := array[]::text[];
  processed_ids text[] := array[]::text[];
begin
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
  if p_expected_versions is null or jsonb_typeof(p_expected_versions) <> 'object' then
    raise exception using errcode = 'P0001', message = 'EXPECTED_VERSION_REQUIRED';
  end if;

  -- Match the existing bulk RPC lock order before checking any row version.
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
    select * into current_registration
    from public.shift_registrations
    where id = input_id;
    if not found then
      success := false;
      error_code := 'REGISTRATION_NOT_FOUND';
      error_message := 'REGISTRATION_NOT_FOUND';
      reviewed_registration := null;
      return next;
      continue;
    end if;

    expected_text := p_expected_versions ->> input_id;
    begin
      if expected_text is null or expected_text !~ '^[1-9][0-9]*$' then
        raise exception using errcode = 'P0001', message = 'EXPECTED_VERSION_REQUIRED';
      end if;
      expected_version := expected_text::integer;
      perform private.assert_expected_version('ShiftRegistration', expected_version, current_registration.version);
      valid_ids := array_append(valid_ids, input_id);
    exception when others then
      success := false;
      error_code := case
        when sqlerrm in ('EXPECTED_VERSION_REQUIRED', 'STALE_WRITE') then sqlerrm
        else sqlstate
      end;
      error_message := case
        when sqlerrm in ('EXPECTED_VERSION_REQUIRED', 'STALE_WRITE') then sqlerrm
        else 'REGISTRATION_REVIEW_FAILED'
      end;
      reviewed_registration := null;
      return next;
    end;
  end loop;

  if cardinality(valid_ids) > 0 then
    return query
      select * from public.bulk_review_shift_registrations(valid_ids, p_action, p_notes);
  end if;
end;
$$;

revoke all on function public.bulk_review_shift_registrations(text[], text, text) from public, anon, authenticated;
revoke all on function public.bulk_review_shift_registrations(text[], text, text, jsonb) from public, anon;
grant execute on function public.bulk_review_shift_registrations(text[], text, text, jsonb) to authenticated;
