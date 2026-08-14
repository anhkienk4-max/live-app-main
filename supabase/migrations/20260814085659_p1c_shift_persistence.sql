-- P1C-B1 shift persistence foundation only.
-- Runtime adapters remain unchanged. This migration contains no demo shifts.

create table public.shifts (
  id text primary key default gen_random_uuid()::text,
  date date not null,
  start_time time(0) without time zone not null,
  end_time time(0) without time zone not null,
  timezone text not null default 'Asia/Ho_Chi_Minh',
  start_at timestamptz not null,
  end_at timestamptz not null,
  end_date date not null,
  crosses_midnight boolean not null,
  duration_minutes smallint not null,
  brand_id text not null references public.brands(id) on delete restrict,
  platform_id text not null references public.platforms(id) on delete restrict,
  campaign_id text null references public.campaigns(id) on delete set null,
  title text null,
  studio text null,
  host_id text null references public.business_users(id) on delete set null,
  support_id text null references public.business_users(id) on delete set null,
  technical_id text null references public.business_users(id) on delete set null,
  required_host_count smallint not null default 1,
  required_support_count smallint not null default 1,
  required_technical_count smallint not null default 1,
  registration_locked boolean not null default false,
  registration_cutoff_at timestamptz not null,
  allow_multi_role boolean not null default false,
  import_batch_id text null,
  status text not null default 'scheduled',
  live_link text null,
  product_notes text null,
  updated_by text null references public.business_users(id) on delete set null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  deleted_at timestamptz null,
  deleted_by text null references public.business_users(id) on delete set null,
  archived_at timestamptz null,
  archived_by text null references public.business_users(id) on delete set null,
  deletion_reason text null,
  constraint shifts_id_not_blank check (btrim(id) <> ''),
  constraint shifts_timezone_check check (timezone = 'Asia/Ho_Chi_Minh'),
  constraint shifts_time_order_check check (end_at > start_at),
  constraint shifts_end_date_check check (end_date >= date and end_date <= date + 1),
  constraint shifts_crosses_midnight_check
    check (crosses_midnight = (end_date > date)),
  constraint shifts_duration_check check (duration_minutes between 1 and 1439),
  constraint shifts_registration_cutoff_check check (registration_cutoff_at <= start_at),
  constraint shifts_required_host_count_check check (required_host_count between 0 and 100),
  constraint shifts_required_support_count_check check (required_support_count between 0 and 100),
  constraint shifts_required_technical_count_check check (required_technical_count between 0 and 100),
  constraint shifts_status_check
    check (status in ('scheduled', 'preparing', 'live', 'paused', 'completed', 'cancelled'))
);

create table public.shift_registrations (
  id text primary key default gen_random_uuid()::text,
  shift_id text not null references public.shifts(id) on delete restrict,
  user_id text not null references public.business_users(id) on delete restrict,
  operational_role text not null,
  status text not null,
  source text not null,
  requested_at timestamptz not null default statement_timestamp(),
  reviewed_by text null references public.business_users(id) on delete set null,
  reviewed_at timestamptz null,
  review_notes text null,
  cancelled_at timestamptz null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint shift_registrations_id_not_blank check (btrim(id) <> ''),
  constraint shift_registrations_role_check
    check (operational_role in ('host', 'support', 'technical')),
  constraint shift_registrations_status_check
    check (status in ('pending', 'approved', 'rejected', 'cancelled', 'manually_assigned', 'removed')),
  constraint shift_registrations_source_check
    check (source in ('self_registration', 'manual_assignment', 'legacy_assignment'))
);

create unique index shifts_active_slot_uidx
  on public.shifts (brand_id, platform_id, date, start_time, end_time)
  where deleted_at is null and archived_at is null;
create index shifts_calendar_idx
  on public.shifts (date, start_time)
  where deleted_at is null and archived_at is null;
create index shifts_time_range_idx
  on public.shifts (start_at, end_at)
  where deleted_at is null and archived_at is null and status <> 'cancelled';
create index shifts_open_registration_idx
  on public.shifts (end_at, registration_cutoff_at)
  where deleted_at is null and archived_at is null
    and status = 'scheduled' and registration_locked = false;
create index shifts_brand_platform_idx on public.shifts (brand_id, platform_id);
create index shifts_campaign_id_idx on public.shifts (campaign_id);
create index shifts_host_id_idx on public.shifts (host_id) where host_id is not null;
create index shifts_support_id_idx on public.shifts (support_id) where support_id is not null;
create index shifts_technical_id_idx on public.shifts (technical_id) where technical_id is not null;

create unique index shift_registrations_active_role_uidx
  on public.shift_registrations (shift_id, user_id, operational_role)
  where status in ('pending', 'approved', 'manually_assigned');
create index shift_registrations_capacity_idx
  on public.shift_registrations (shift_id, operational_role, status);
create index shift_registrations_user_schedule_idx
  on public.shift_registrations (user_id, status, shift_id);
create index shift_registrations_reviewed_by_idx
  on public.shift_registrations (reviewed_by) where reviewed_by is not null;

create or replace function private.set_shift_derived_fields()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  old_cutoff_was_default boolean := false;
begin
  if new.timezone is distinct from 'Asia/Ho_Chi_Minh' then
    raise exception using errcode = '22023', message = 'SHIFT_TIMEZONE_INVALID';
  end if;
  if new.start_time = new.end_time then
    raise exception using errcode = '22023', message = 'SHIFT_DURATION_INVALID';
  end if;

  if tg_op = 'UPDATE' then
    old_cutoff_was_default := old.registration_cutoff_at = old.start_at - interval '6 hours';
  end if;

  new.end_date := new.date + case when new.end_time < new.start_time then 1 else 0 end;
  new.crosses_midnight := new.end_date > new.date;
  new.start_at := (new.date + new.start_time) at time zone 'Asia/Ho_Chi_Minh';
  new.end_at := (new.end_date + new.end_time) at time zone 'Asia/Ho_Chi_Minh';
  new.duration_minutes := (extract(epoch from (new.end_at - new.start_at)) / 60)::smallint;

  if new.registration_cutoff_at is null
    or (
      tg_op = 'UPDATE'
      and old_cutoff_was_default
      and (
        new.date is distinct from old.date
        or new.start_time is distinct from old.start_time
        or new.end_time is distinct from old.end_time
      )
    )
  then
    new.registration_cutoff_at := new.start_at - interval '6 hours';
  end if;
  return new;
end;
$$;

revoke all on function private.set_shift_derived_fields() from public, anon, authenticated;

create trigger shifts_derive_fields
before insert or update of date, start_time, end_time, timezone, registration_cutoff_at
on public.shifts
for each row execute function private.set_shift_derived_fields();

create trigger shifts_set_updated_at
before update on public.shifts
for each row execute function private.set_updated_at();

create trigger shift_registrations_set_updated_at
before update on public.shift_registrations
for each row execute function private.set_updated_at();

create or replace function private.sync_shift_staffing_projection(p_shift_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.shifts as shift
  set
    host_id = (
      select registration.user_id
      from public.shift_registrations as registration
      where registration.shift_id = p_shift_id
        and registration.operational_role = 'host'
        and registration.status in ('approved', 'manually_assigned')
      order by registration.created_at, registration.id
      limit 1
    ),
    support_id = (
      select registration.user_id
      from public.shift_registrations as registration
      where registration.shift_id = p_shift_id
        and registration.operational_role = 'support'
        and registration.status in ('approved', 'manually_assigned')
      order by registration.created_at, registration.id
      limit 1
    ),
    technical_id = (
      select registration.user_id
      from public.shift_registrations as registration
      where registration.shift_id = p_shift_id
        and registration.operational_role = 'technical'
        and registration.status in ('approved', 'manually_assigned')
      order by registration.created_at, registration.id
      limit 1
    ),
    updated_by = coalesce((select private.current_business_user_id()), shift.updated_by)
  where shift.id = p_shift_id;
end;
$$;

revoke all on function private.sync_shift_staffing_projection(text) from public, anon, authenticated;

create or replace function private.sync_shift_staffing_projection_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    perform private.sync_shift_staffing_projection(old.shift_id);
    return old;
  end if;
  perform private.sync_shift_staffing_projection(new.shift_id);
  if tg_op = 'UPDATE' and new.shift_id is distinct from old.shift_id then
    perform private.sync_shift_staffing_projection(old.shift_id);
  end if;
  return new;
end;
$$;

revoke all on function private.sync_shift_staffing_projection_trigger() from public, anon, authenticated;

create trigger shift_registrations_sync_projection
after insert or update or delete on public.shift_registrations
for each row execute function private.sync_shift_staffing_projection_trigger();

create or replace function private.can_read_shift(p_shift_id text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case
      when (select private.current_system_permission()) = 'admin' then true
      when shift.deleted_at is not null or shift.archived_at is not null then false
      when (select private.current_system_permission()) = 'leader' then true
      else (
        (
          shift.status = 'scheduled'
          and shift.registration_locked = false
          and shift.end_at > statement_timestamp()
        )
        or (select private.current_business_user_id()) in
          (shift.host_id, shift.support_id, shift.technical_id)
        or exists (
          select 1
          from public.shift_registrations as registration
          where registration.shift_id = shift.id
            and registration.user_id = (select private.current_business_user_id())
            and registration.status in ('pending', 'approved', 'manually_assigned')
        )
      )
    end
    from public.shifts as shift
    where shift.id = p_shift_id
      and (select private.current_business_user_is_active())
  ), false);
$$;

revoke all on function private.can_read_shift(text) from public, anon, authenticated;
grant execute on function private.can_read_shift(text) to authenticated;

alter table public.shifts enable row level security;
alter table public.shift_registrations enable row level security;

revoke all on table public.shifts from anon, authenticated;
revoke all on table public.shift_registrations from anon, authenticated;
grant select on table public.shifts to authenticated;
grant select on table public.shift_registrations to authenticated;

create policy shifts_scoped_select
on public.shifts
for select
to authenticated
using ((select private.can_read_shift(id)));

create policy shift_registrations_scoped_select
on public.shift_registrations
for select
to authenticated
using ((select private.can_read_shift(shift_id)));

create or replace function private.require_shift_actor(p_leader_required boolean)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  actor_id text;
begin
  actor_id := private.current_business_user_id();
  if actor_id is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED';
  end if;
  if p_leader_required and not private.is_leader_or_admin() then
    raise exception using errcode = '42501', message = 'OPERATION_NOT_ALLOWED';
  end if;
  return actor_id;
end;
$$;

revoke all on function private.require_shift_actor(boolean) from public, anon, authenticated;

create or replace function private.normalize_shift_capacity(p_value text, p_default smallint)
returns smallint
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  parsed numeric;
begin
  if p_value is null or btrim(p_value) = '' then
    return p_default;
  end if;
  begin
    parsed := p_value::numeric;
  exception when others then
    raise exception using errcode = '22023', message = 'SHIFT_CAPACITY_INVALID';
  end;
  if parsed < 0 or parsed > 100 or trunc(parsed) <> parsed then
    raise exception using errcode = '22023', message = 'SHIFT_CAPACITY_INVALID';
  end if;
  return parsed::smallint;
end;
$$;

revoke all on function private.normalize_shift_capacity(text, smallint) from public, anon, authenticated;

create or replace function private.assert_shift_role_eligibility(p_user_id text, p_role text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_role is null or p_role not in ('host', 'support', 'technical') then
    raise exception using errcode = '22023', message = 'OPERATIONAL_ROLE_INVALID';
  end if;
  if not exists (
    select 1
    from public.business_users as business_user
    where business_user.id = p_user_id
      and business_user.status = 'active'
      and business_user.account_status = 'active'
      and business_user.archived_at is null
      and business_user.deleted_at is null
      and business_user.operational_roles @> array[p_role]::text[]
  ) then
    raise exception using errcode = '22023', message = 'ROLE_NOT_QUALIFIED';
  end if;
end;
$$;

revoke all on function private.assert_shift_role_eligibility(text, text) from public, anon, authenticated;

create or replace function private.shift_required_capacity(p_shift public.shifts, p_role text)
returns smallint
language sql
immutable
security invoker
set search_path = ''
as $$
  select case p_role
    when 'host' then p_shift.required_host_count
    when 'support' then p_shift.required_support_count
    when 'technical' then p_shift.required_technical_count
    else null
  end;
$$;

revoke all on function private.shift_required_capacity(public.shifts, text) from public, anon, authenticated;

create or replace function private.assert_shift_capacity(
  p_shift public.shifts,
  p_role text,
  p_exclude_registration_id text default null
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  staffed_count integer;
begin
  select count(*)
  into staffed_count
  from public.shift_registrations as registration
  where registration.shift_id = p_shift.id
    and registration.operational_role = p_role
    and registration.status in ('approved', 'manually_assigned')
    and (p_exclude_registration_id is null or registration.id <> p_exclude_registration_id);

  if staffed_count >= private.shift_required_capacity(p_shift, p_role) then
    raise exception using errcode = 'P0001', message = 'SHIFT_FULL';
  end if;
end;
$$;

revoke all on function private.assert_shift_capacity(public.shifts, text, text) from public, anon, authenticated;

create or replace function private.assert_no_shift_registration_conflict(
  p_user_id text,
  p_shift public.shifts,
  p_role text,
  p_exclude_registration_id text default null
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from public.shift_registrations as registration
    where registration.shift_id = p_shift.id
      and registration.user_id = p_user_id
      and registration.operational_role = p_role
      and registration.status in ('pending', 'approved', 'manually_assigned')
      and (p_exclude_registration_id is null or registration.id <> p_exclude_registration_id)
  ) then
    raise exception using errcode = '23505', message = 'ALREADY_REGISTERED';
  end if;

  if not p_shift.allow_multi_role and exists (
    select 1
    from public.shift_registrations as registration
    where registration.shift_id = p_shift.id
      and registration.user_id = p_user_id
      and registration.status in ('pending', 'approved', 'manually_assigned')
      and (p_exclude_registration_id is null or registration.id <> p_exclude_registration_id)
  ) then
    raise exception using errcode = 'P0001', message = 'MULTI_ROLE_NOT_ALLOWED';
  end if;

  if exists (
    select 1
    from public.shift_registrations as registration
    join public.shifts as other_shift on other_shift.id = registration.shift_id
    where registration.user_id = p_user_id
      and registration.shift_id <> p_shift.id
      and registration.status in ('pending', 'approved', 'manually_assigned')
      and (p_exclude_registration_id is null or registration.id <> p_exclude_registration_id)
      and other_shift.deleted_at is null
      and other_shift.archived_at is null
      and other_shift.status <> 'cancelled'
      and other_shift.start_at < p_shift.end_at
      and other_shift.end_at > p_shift.start_at
  ) then
    raise exception using errcode = 'P0001', message = 'SHIFT_CONFLICT';
  end if;
end;
$$;

revoke all on function private.assert_no_shift_registration_conflict(text, public.shifts, text, text)
from public, anon, authenticated;

create or replace function private.refresh_shift_registration_lock(
  p_shift_id text,
  p_unlock_when_understaffed boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  fully_staffed boolean;
begin
  select
    (select count(*) from public.shift_registrations r where r.shift_id = shift.id and r.operational_role = 'host' and r.status in ('approved', 'manually_assigned')) >= shift.required_host_count
    and (select count(*) from public.shift_registrations r where r.shift_id = shift.id and r.operational_role = 'support' and r.status in ('approved', 'manually_assigned')) >= shift.required_support_count
    and (select count(*) from public.shift_registrations r where r.shift_id = shift.id and r.operational_role = 'technical' and r.status in ('approved', 'manually_assigned')) >= shift.required_technical_count
  into fully_staffed
  from public.shifts as shift
  where shift.id = p_shift_id;

  if fully_staffed then
    update public.shifts set registration_locked = true where id = p_shift_id;
  elsif p_unlock_when_understaffed then
    update public.shifts set registration_locked = false where id = p_shift_id;
  end if;
end;
$$;

revoke all on function private.refresh_shift_registration_lock(text, boolean) from public, anon, authenticated;

create or replace function private.assert_shift_staffing_consistent(p_shift public.shifts)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  registrant_id text;
begin
  if (select count(*) from public.shift_registrations r where r.shift_id = p_shift.id and r.operational_role = 'host' and r.status in ('approved', 'manually_assigned')) > p_shift.required_host_count
    or (select count(*) from public.shift_registrations r where r.shift_id = p_shift.id and r.operational_role = 'support' and r.status in ('approved', 'manually_assigned')) > p_shift.required_support_count
    or (select count(*) from public.shift_registrations r where r.shift_id = p_shift.id and r.operational_role = 'technical' and r.status in ('approved', 'manually_assigned')) > p_shift.required_technical_count
  then
    raise exception using errcode = 'P0001', message = 'SHIFT_CAPACITY_BELOW_STAFFING';
  end if;

  if not p_shift.allow_multi_role and exists (
    select 1
    from public.shift_registrations as registration
    where registration.shift_id = p_shift.id
      and registration.status in ('pending', 'approved', 'manually_assigned')
    group by registration.user_id
    having count(*) > 1
  ) then
    raise exception using errcode = 'P0001', message = 'MULTI_ROLE_NOT_ALLOWED';
  end if;

  for registrant_id in
    select distinct registration.user_id
    from public.shift_registrations as registration
    where registration.shift_id = p_shift.id
      and registration.status in ('pending', 'approved', 'manually_assigned')
    order by registration.user_id
  loop
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(registrant_id, 91731));
    if exists (
      select 1
      from public.shift_registrations as other_registration
      join public.shifts as other_shift on other_shift.id = other_registration.shift_id
      where other_registration.user_id = registrant_id
        and other_registration.shift_id <> p_shift.id
        and other_registration.status in ('pending', 'approved', 'manually_assigned')
        and other_shift.deleted_at is null
        and other_shift.archived_at is null
        and other_shift.status <> 'cancelled'
        and other_shift.start_at < p_shift.end_at
        and other_shift.end_at > p_shift.start_at
    ) then
      raise exception using errcode = 'P0001', message = 'SHIFT_CONFLICT';
    end if;
  end loop;
end;
$$;

revoke all on function private.assert_shift_staffing_consistent(public.shifts) from public, anon, authenticated;

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

  if p_auto_lock then
    perform private.refresh_shift_registration_lock(p_shift_id, false);
  end if;
  return created_registration;
end;
$$;

revoke all on function private.insert_manual_shift_assignment(text, text, text, text, text, boolean)
from public, anon, authenticated;

create or replace function public.create_shift(p_data jsonb)
returns public.shifts
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id text;
  created_shift public.shifts;
  input_key text;
  initial_user_id text;
  role_name text;
begin
  actor_id := private.require_shift_actor(true);
  if p_data is null or jsonb_typeof(p_data) <> 'object' then
    raise exception using errcode = '22023', message = 'SHIFT_PAYLOAD_INVALID';
  end if;
  for input_key in select jsonb_object_keys(p_data)
  loop
    if input_key <> all (array[
      'date', 'start_time', 'end_time', 'timezone', 'brand_id', 'platform_id',
      'campaign_id', 'title', 'studio', 'host_id', 'support_id', 'technical_id',
      'required_host_count', 'required_support_count', 'required_technical_count',
      'registration_cutoff_at', 'allow_multi_role', 'import_batch_id', 'status',
      'live_link', 'product_notes'
    ]::text[]) then
      raise exception using errcode = '22023', message = 'SHIFT_FIELD_NOT_ALLOWED';
    end if;
  end loop;

  insert into public.shifts (
    date, start_time, end_time, timezone, brand_id, platform_id, campaign_id,
    title, studio, required_host_count, required_support_count,
    required_technical_count, registration_cutoff_at, allow_multi_role,
    import_batch_id, status, live_link, product_notes, updated_by
  ) values (
    (p_data->>'date')::date,
    (p_data->>'start_time')::time,
    (p_data->>'end_time')::time,
    coalesce(nullif(p_data->>'timezone', ''), 'Asia/Ho_Chi_Minh'),
    nullif(p_data->>'brand_id', ''),
    nullif(p_data->>'platform_id', ''),
    nullif(p_data->>'campaign_id', ''),
    nullif(p_data->>'title', ''),
    nullif(p_data->>'studio', ''),
    private.normalize_shift_capacity(p_data->>'required_host_count', 1::smallint),
    private.normalize_shift_capacity(p_data->>'required_support_count', 1::smallint),
    private.normalize_shift_capacity(p_data->>'required_technical_count', 1::smallint),
    nullif(p_data->>'registration_cutoff_at', '')::timestamptz,
    coalesce((p_data->>'allow_multi_role')::boolean, false),
    nullif(p_data->>'import_batch_id', ''),
    coalesce(nullif(p_data->>'status', ''), 'scheduled'),
    nullif(p_data->>'live_link', ''),
    nullif(p_data->>'product_notes', ''),
    actor_id
  ) returning * into created_shift;

  foreach role_name in array array['host', 'support', 'technical']::text[]
  loop
    initial_user_id := nullif(p_data->>(role_name || '_id'), '');
    if initial_user_id is not null then
      perform private.insert_manual_shift_assignment(
        created_shift.id, initial_user_id, role_name, actor_id, 'Initial shift assignment', false
      );
    end if;
  end loop;

  update public.shifts set registration_locked = false where id = created_shift.id;
  select * into created_shift from public.shifts where id = created_shift.id;
  return created_shift;
end;
$$;

create or replace function public.update_shift(
  p_shift_id text,
  p_patch jsonb,
  p_confirm_impact boolean default false
)
returns public.shifts
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id text;
  actor_permission text;
  existing_shift public.shifts;
  updated_shift public.shifts;
  input_key text;
  requested_status text;
begin
  actor_id := private.require_shift_actor(true);
  actor_permission := private.current_system_permission();
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception using errcode = '22023', message = 'SHIFT_PAYLOAD_INVALID';
  end if;
  if p_patch ?| array['host_id', 'support_id', 'technical_id'] then
    raise exception using errcode = '22023', message = 'STAFFING_FIELDS_USE_STAFFING_RPC';
  end if;

  for input_key in select jsonb_object_keys(p_patch)
  loop
    if input_key <> all (array[
      'date', 'start_time', 'end_time', 'brand_id', 'platform_id', 'campaign_id',
      'title', 'studio', 'required_host_count', 'required_support_count',
      'required_technical_count', 'status', 'live_link', 'product_notes',
      'registration_cutoff_at', 'allow_multi_role'
    ]::text[]) then
      raise exception using errcode = '22023', message = 'SHIFT_FIELD_NOT_ALLOWED';
    end if;
    if actor_permission = 'leader'
      and input_key in ('registration_cutoff_at', 'allow_multi_role')
    then
      raise exception using errcode = '42501', message = 'OPERATION_NOT_ALLOWED';
    end if;
  end loop;

  select * into existing_shift
  from public.shifts
  where id = p_shift_id and deleted_at is null and archived_at is null
  for update;
  if existing_shift.id is null then
    raise exception using errcode = 'P0001', message = 'SHIFT_NOT_FOUND';
  end if;

  requested_status := coalesce(nullif(p_patch->>'status', ''), existing_shift.status);
  if actor_permission = 'leader' and requested_status <> existing_shift.status and not (
    (existing_shift.status = 'scheduled' and requested_status in ('scheduled', 'preparing'))
    or (existing_shift.status = 'preparing' and requested_status in ('scheduled', 'preparing', 'live', 'paused'))
    or (existing_shift.status = 'live' and requested_status in ('live', 'paused', 'completed'))
    or (existing_shift.status = 'paused' and requested_status in ('live', 'paused', 'completed'))
    or (existing_shift.status = 'completed' and requested_status = 'completed')
    or (existing_shift.status = 'cancelled' and requested_status = 'cancelled')
  ) then
    raise exception using errcode = '42501', message = 'SHIFT_STATUS_TRANSITION_NOT_ALLOWED';
  end if;
  if existing_shift.status = 'live' and p_patch ?| array['date', 'start_time', 'platform_id'] then
    raise exception using errcode = 'P0001', message = 'LIVE_SHIFT_FIELD_LOCKED';
  end if;
  if existing_shift.status = 'completed'
    and p_patch ?| array['date', 'start_time', 'end_time', 'platform_id', 'campaign_id']
    and not p_confirm_impact
  then
    raise exception using errcode = 'P0001', message = 'COMPLETED_SHIFT_IMPACT_CONFIRMATION_REQUIRED';
  end if;

  update public.shifts as shift
  set
    date = case when p_patch ? 'date' then (p_patch->>'date')::date else shift.date end,
    start_time = case when p_patch ? 'start_time' then (p_patch->>'start_time')::time else shift.start_time end,
    end_time = case when p_patch ? 'end_time' then (p_patch->>'end_time')::time else shift.end_time end,
    brand_id = case when p_patch ? 'brand_id' then nullif(p_patch->>'brand_id', '') else shift.brand_id end,
    platform_id = case when p_patch ? 'platform_id' then nullif(p_patch->>'platform_id', '') else shift.platform_id end,
    campaign_id = case when p_patch ? 'campaign_id' then nullif(p_patch->>'campaign_id', '') else shift.campaign_id end,
    title = case when p_patch ? 'title' then nullif(p_patch->>'title', '') else shift.title end,
    studio = case when p_patch ? 'studio' then nullif(p_patch->>'studio', '') else shift.studio end,
    required_host_count = case when p_patch ? 'required_host_count' then private.normalize_shift_capacity(p_patch->>'required_host_count', 1::smallint) else shift.required_host_count end,
    required_support_count = case when p_patch ? 'required_support_count' then private.normalize_shift_capacity(p_patch->>'required_support_count', 1::smallint) else shift.required_support_count end,
    required_technical_count = case when p_patch ? 'required_technical_count' then private.normalize_shift_capacity(p_patch->>'required_technical_count', 1::smallint) else shift.required_technical_count end,
    registration_cutoff_at = case when p_patch ? 'registration_cutoff_at' then nullif(p_patch->>'registration_cutoff_at', '')::timestamptz else shift.registration_cutoff_at end,
    allow_multi_role = case when p_patch ? 'allow_multi_role' then (p_patch->>'allow_multi_role')::boolean else shift.allow_multi_role end,
    status = requested_status,
    live_link = case when p_patch ? 'live_link' then nullif(p_patch->>'live_link', '') else shift.live_link end,
    product_notes = case when p_patch ? 'product_notes' then nullif(p_patch->>'product_notes', '') else shift.product_notes end,
    updated_by = actor_id
  where shift.id = p_shift_id
  returning * into updated_shift;

  perform private.assert_shift_staffing_consistent(updated_shift);
  return updated_shift;
end;
$$;

create or replace function public.set_shift_registration_lock(p_shift_id text, p_locked boolean)
returns public.shifts
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id text;
  target_shift public.shifts;
begin
  actor_id := private.require_shift_actor(true);
  select * into target_shift
  from public.shifts
  where id = p_shift_id and deleted_at is null and archived_at is null
  for update;
  if target_shift.id is null then
    raise exception using errcode = 'P0001', message = 'SHIFT_NOT_FOUND';
  end if;
  if not p_locked and (
    target_shift.status <> 'scheduled' or target_shift.end_at <= statement_timestamp()
  ) then
    raise exception using errcode = 'P0001', message = 'SHIFT_CANNOT_REOPEN';
  end if;
  update public.shifts
  set registration_locked = p_locked, updated_by = actor_id
  where id = p_shift_id
  returning * into target_shift;
  return target_shift;
end;
$$;

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
begin
  actor_id := private.require_shift_actor(false);
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
    shift_id, user_id, operational_role, status, source
  ) values (
    p_shift_id, actor_id, p_role, 'pending', 'self_registration'
  ) returning * into created_registration;
  return created_registration;
end;
$$;

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

  if target_registration.status not in ('pending', 'approved', 'manually_assigned') then
    raise exception using errcode = 'P0001', message = 'INVALID_REGISTRATION_TRANSITION';
  end if;
  if target_shift.status <> 'scheduled'
    or target_shift.registration_locked
    or target_shift.registration_cutoff_at <= statement_timestamp()
  then
    raise exception using errcode = 'P0001', message = 'CANCELLATION_CLOSED';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(actor_id, 91731));
  was_staffed := target_registration.status in ('approved', 'manually_assigned');
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

create or replace function public.reject_shift_registration(
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
  target_shift_id text;
  target_registration public.shift_registrations;
begin
  actor_id := private.require_shift_actor(true);
  select shift_id into target_shift_id
  from public.shift_registrations where id = p_registration_id;
  if target_shift_id is null then
    raise exception using errcode = 'P0001', message = 'REGISTRATION_NOT_FOUND';
  end if;
  perform 1 from public.shifts where id = target_shift_id for update;
  select * into target_registration from public.shift_registrations
  where id = p_registration_id for update;
  if target_registration.status <> 'pending' then
    raise exception using errcode = 'P0001', message = 'INVALID_REGISTRATION_TRANSITION';
  end if;
  update public.shift_registrations
  set status = 'rejected', reviewed_by = actor_id,
      reviewed_at = statement_timestamp(), review_notes = p_notes
  where id = p_registration_id
  returning * into target_registration;
  return target_registration;
end;
$$;

create or replace function public.manual_assign_shift_staff(
  p_shift_id text,
  p_user_id text,
  p_role text,
  p_notes text default null
)
returns public.shift_registrations
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id text;
begin
  actor_id := private.require_shift_actor(true);
  return private.insert_manual_shift_assignment(
    p_shift_id, p_user_id, p_role, actor_id, p_notes, true
  );
end;
$$;

create or replace function public.remove_shift_staffing(
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
  if target_registration.status not in ('approved', 'manually_assigned') then
    raise exception using errcode = 'P0001', message = 'INVALID_REGISTRATION_TRANSITION';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(target_registration.user_id, 91731));
  update public.shift_registrations
  set status = 'removed', reviewed_by = actor_id,
      reviewed_at = statement_timestamp(), review_notes = p_notes,
      cancelled_at = statement_timestamp()
  where id = p_registration_id
  returning * into target_registration;
  perform private.refresh_shift_registration_lock(target_shift.id, true);
  return target_registration;
end;
$$;

revoke all on function public.create_shift(jsonb) from public, anon, authenticated;
revoke all on function public.update_shift(text, jsonb, boolean) from public, anon, authenticated;
revoke all on function public.set_shift_registration_lock(text, boolean) from public, anon, authenticated;
revoke all on function public.register_for_shift(text, text) from public, anon, authenticated;
revoke all on function public.cancel_own_shift_registration(text, text) from public, anon, authenticated;
revoke all on function public.approve_shift_registration(text, text) from public, anon, authenticated;
revoke all on function public.reject_shift_registration(text, text) from public, anon, authenticated;
revoke all on function public.manual_assign_shift_staff(text, text, text, text) from public, anon, authenticated;
revoke all on function public.remove_shift_staffing(text, text) from public, anon, authenticated;

grant execute on function public.create_shift(jsonb) to authenticated;
grant execute on function public.update_shift(text, jsonb, boolean) to authenticated;
grant execute on function public.set_shift_registration_lock(text, boolean) to authenticated;
grant execute on function public.register_for_shift(text, text) to authenticated;
grant execute on function public.cancel_own_shift_registration(text, text) to authenticated;
grant execute on function public.approve_shift_registration(text, text) to authenticated;
grant execute on function public.reject_shift_registration(text, text) to authenticated;
grant execute on function public.manual_assign_shift_staff(text, text, text, text) to authenticated;
grant execute on function public.remove_shift_staffing(text, text) to authenticated;

comment on table public.shifts is
  'P1C canonical shift schedule. Direct role IDs are compatibility projections only.';
comment on table public.shift_registrations is
  'Canonical P1C staffing and registration history.';
comment on column public.shifts.timezone is
  'Business wall-clock timezone, fixed to Asia/Ho_Chi_Minh for P1C.';
comment on column public.shifts.host_id is
  'Compatibility projection of the first active staffed Host registration.';
comment on column public.shifts.support_id is
  'Compatibility projection of the first active staffed Support registration.';
comment on column public.shifts.technical_id is
  'Compatibility projection of the first active staffed Technical registration.';
