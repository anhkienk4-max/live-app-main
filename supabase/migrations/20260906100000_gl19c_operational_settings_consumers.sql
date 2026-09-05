-- GL-19C: make the seven operational settings authoritative for production RPCs.

alter table public.system_settings
  add column if not exists registration_cutoff_hours smallint not null default 6,
  add column if not exists require_registration_approval boolean not null default true,
  add column if not exists auto_lock_filled_shifts boolean not null default true,
  add column if not exists allow_multi_role_per_shift boolean not null default false,
  add column if not exists default_host_count smallint not null default 1,
  add column if not exists default_support_count smallint not null default 1,
  add column if not exists default_technical_count smallint not null default 1;

alter table public.system_settings
  drop constraint if exists system_settings_registration_cutoff_hours_check,
  drop constraint if exists system_settings_default_host_count_check,
  drop constraint if exists system_settings_default_support_count_check,
  drop constraint if exists system_settings_default_technical_count_check;

alter table public.system_settings
  add constraint system_settings_registration_cutoff_hours_check
    check (registration_cutoff_hours >= 0),
  add constraint system_settings_default_host_count_check
    check (default_host_count between 0 and 100),
  add constraint system_settings_default_support_count_check
    check (default_support_count between 0 and 100),
  add constraint system_settings_default_technical_count_check
    check (default_technical_count between 0 and 100);

revoke all on table public.system_settings from anon, authenticated;
grant select on table public.system_settings to authenticated;
drop policy if exists "Settings are updatable by admin only" on public.system_settings;

create or replace function public.update_operational_settings(p_patch jsonb)
returns public.system_settings
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id text;
  settings_row public.system_settings;
  input_key text;
begin
  actor_id := private.current_business_user_id();
  if actor_id is null then
    raise exception using errcode = '42501', message = 'AUTHENTICATION_REQUIRED';
  end if;
  if not private.is_leader_or_admin() then
    raise exception using errcode = '42501', message = 'OPERATION_NOT_ALLOWED';
  end if;
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' then
    raise exception using errcode = '22023', message = 'OPERATIONAL_SETTINGS_PAYLOAD_INVALID';
  end if;

  for input_key in select jsonb_object_keys(p_patch)
  loop
    if input_key <> all (array[
      'registration_cutoff_hours', 'require_registration_approval',
      'auto_lock_filled_shifts', 'allow_multi_role_per_shift',
      'default_host_count', 'default_support_count', 'default_technical_count'
    ]::text[]) then
      raise exception using errcode = '22023', message = 'OPERATIONAL_SETTING_NOT_ALLOWED';
    end if;
  end loop;

  if p_patch ? 'registration_cutoff_hours'
    and (jsonb_typeof(p_patch->'registration_cutoff_hours') <> 'number'
      or (p_patch->>'registration_cutoff_hours')::numeric < 0
      or trunc((p_patch->>'registration_cutoff_hours')::numeric) <> (p_patch->>'registration_cutoff_hours')::numeric)
  then
    raise exception using errcode = '22023', message = 'REGISTRATION_CUTOFF_INVALID';
  end if;
  if p_patch ? 'default_host_count'
    and (jsonb_typeof(p_patch->'default_host_count') <> 'number'
      or (p_patch->>'default_host_count')::numeric not between 0 and 100
      or trunc((p_patch->>'default_host_count')::numeric) <> (p_patch->>'default_host_count')::numeric)
  then
    raise exception using errcode = '22023', message = 'DEFAULT_HOST_COUNT_INVALID';
  end if;
  if p_patch ? 'default_support_count'
    and (jsonb_typeof(p_patch->'default_support_count') <> 'number'
      or (p_patch->>'default_support_count')::numeric not between 0 and 100
      or trunc((p_patch->>'default_support_count')::numeric) <> (p_patch->>'default_support_count')::numeric)
  then
    raise exception using errcode = '22023', message = 'DEFAULT_SUPPORT_COUNT_INVALID';
  end if;
  if p_patch ? 'default_technical_count'
    and (jsonb_typeof(p_patch->'default_technical_count') <> 'number'
      or (p_patch->>'default_technical_count')::numeric not between 0 and 100
      or trunc((p_patch->>'default_technical_count')::numeric) <> (p_patch->>'default_technical_count')::numeric)
  then
    raise exception using errcode = '22023', message = 'DEFAULT_TECHNICAL_COUNT_INVALID';
  end if;
  if (p_patch ? 'require_registration_approval'
    and jsonb_typeof(p_patch->'require_registration_approval') <> 'boolean')
    or (p_patch ? 'auto_lock_filled_shifts'
      and jsonb_typeof(p_patch->'auto_lock_filled_shifts') <> 'boolean')
    or (p_patch ? 'allow_multi_role_per_shift'
      and jsonb_typeof(p_patch->'allow_multi_role_per_shift') <> 'boolean')
  then
    raise exception using errcode = '22023', message = 'OPERATIONAL_SETTING_BOOLEAN_INVALID';
  end if;

  select * into settings_row
  from public.system_settings
  limit 1
  for update;
  if settings_row.id is null then
    raise exception using errcode = 'P0001', message = 'OPERATIONAL_SETTINGS_NOT_CONFIGURED';
  end if;

  update public.system_settings
  set registration_cutoff_hours = case when p_patch ? 'registration_cutoff_hours' then (p_patch->>'registration_cutoff_hours')::smallint else registration_cutoff_hours end,
      require_registration_approval = case when p_patch ? 'require_registration_approval' then (p_patch->>'require_registration_approval')::boolean else require_registration_approval end,
      auto_lock_filled_shifts = case when p_patch ? 'auto_lock_filled_shifts' then (p_patch->>'auto_lock_filled_shifts')::boolean else auto_lock_filled_shifts end,
      allow_multi_role_per_shift = case when p_patch ? 'allow_multi_role_per_shift' then (p_patch->>'allow_multi_role_per_shift')::boolean else allow_multi_role_per_shift end,
      default_host_count = case when p_patch ? 'default_host_count' then (p_patch->>'default_host_count')::smallint else default_host_count end,
      default_support_count = case when p_patch ? 'default_support_count' then (p_patch->>'default_support_count')::smallint else default_support_count end,
      default_technical_count = case when p_patch ? 'default_technical_count' then (p_patch->>'default_technical_count')::smallint else default_technical_count end,
      updated_at = statement_timestamp()
  where id = settings_row.id
  returning * into settings_row;
  return settings_row;
end;
$$;

revoke all on function public.update_operational_settings(jsonb) from public, anon, authenticated;
grant execute on function public.update_operational_settings(jsonb) to authenticated;

create or replace function private.set_shift_derived_fields()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  cutoff_hours smallint;
  old_cutoff_was_default boolean := false;
begin
  select registration_cutoff_hours into cutoff_hours
  from public.system_settings
  limit 1;
  if cutoff_hours is null then
    raise exception using errcode = 'P0001', message = 'OPERATIONAL_SETTINGS_NOT_CONFIGURED';
  end if;
  if new.timezone is distinct from 'Asia/Ho_Chi_Minh' then
    raise exception using errcode = '22023', message = 'SHIFT_TIMEZONE_INVALID';
  end if;
  if new.start_time = new.end_time then
    raise exception using errcode = '22023', message = 'SHIFT_DURATION_INVALID';
  end if;
  if tg_op = 'UPDATE' then
    old_cutoff_was_default := old.registration_cutoff_at = old.start_at - (cutoff_hours * interval '1 hour');
  end if;

  new.end_date := new.date + case when new.end_time < new.start_time then 1 else 0 end;
  new.crosses_midnight := new.end_date > new.date;
  new.start_at := (new.date + new.start_time) at time zone 'Asia/Ho_Chi_Minh';
  new.end_at := (new.end_date + new.end_time) at time zone 'Asia/Ho_Chi_Minh';
  new.duration_minutes := (extract(epoch from (new.end_at - new.start_at)) / 60)::smallint;

  if new.registration_cutoff_at is null
    or (tg_op = 'UPDATE' and old_cutoff_was_default and (
      new.date is distinct from old.date
      or new.start_time is distinct from old.start_time
      or new.end_time is distinct from old.end_time
    ))
  then
    new.registration_cutoff_at := new.start_at - (cutoff_hours * interval '1 hour');
  end if;
  return new;
end;
$$;

create or replace function private.assert_no_shift_registration_conflict(
  p_user_id text,
  p_shift public.shifts,
  p_role text,
  p_exclude_registration_id text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.shift_registrations as registration
    where registration.shift_id = p_shift.id
      and registration.user_id = p_user_id
      and registration.operational_role = p_role
      and registration.status in ('pending', 'approved', 'manually_assigned')
      and (p_exclude_registration_id is null or registration.id <> p_exclude_registration_id)
  ) then
    raise exception using errcode = '23505', message = 'ALREADY_REGISTERED';
  end if;

  if not coalesce(p_shift.allow_multi_role, false)
    and not coalesce((select allow_multi_role_per_shift from public.system_settings limit 1), false)
    and exists (
      select 1 from public.shift_registrations as registration
      where registration.shift_id = p_shift.id
        and registration.user_id = p_user_id
        and registration.status in ('pending', 'approved', 'manually_assigned')
        and (p_exclude_registration_id is null or registration.id <> p_exclude_registration_id)
    )
  then
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
  auto_lock boolean;
begin
  select auto_lock_filled_shifts into auto_lock
  from public.system_settings
  limit 1;
  if auto_lock is null then
    raise exception using errcode = 'P0001', message = 'OPERATIONAL_SETTINGS_NOT_CONFIGURED';
  end if;
  select
    (select count(*) from public.shift_registrations r where r.shift_id = shift.id and r.operational_role = 'host' and r.status in ('approved', 'manually_assigned')) >= shift.required_host_count
    and (select count(*) from public.shift_registrations r where r.shift_id = shift.id and r.operational_role = 'support' and r.status in ('approved', 'manually_assigned')) >= shift.required_support_count
    and (select count(*) from public.shift_registrations r where r.shift_id = shift.id and r.operational_role = 'technical' and r.status in ('approved', 'manually_assigned')) >= shift.required_technical_count
  into fully_staffed
  from public.shifts as shift
  where shift.id = p_shift_id;

  if fully_staffed and auto_lock then
    update public.shifts set registration_locked = true where id = p_shift_id;
  elsif not fully_staffed and p_unlock_when_understaffed then
    update public.shifts set registration_locked = false where id = p_shift_id;
  end if;
end;
$$;

create or replace function private.assert_shift_staffing_consistent(p_shift public.shifts)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  registrant_id text;
  multi_role_allowed boolean;
begin
  select allow_multi_role_per_shift into multi_role_allowed
  from public.system_settings
  limit 1;
  if multi_role_allowed is null then
    raise exception using errcode = 'P0001', message = 'OPERATIONAL_SETTINGS_NOT_CONFIGURED';
  end if;
  if (select count(*) from public.shift_registrations r where r.shift_id = p_shift.id and r.operational_role = 'host' and r.status in ('approved', 'manually_assigned')) > p_shift.required_host_count
    or (select count(*) from public.shift_registrations r where r.shift_id = p_shift.id and r.operational_role = 'support' and r.status in ('approved', 'manually_assigned')) > p_shift.required_support_count
    or (select count(*) from public.shift_registrations r where r.shift_id = p_shift.id and r.operational_role = 'technical' and r.status in ('approved', 'manually_assigned')) > p_shift.required_technical_count
  then
    raise exception using errcode = 'P0001', message = 'SHIFT_CAPACITY_BELOW_STAFFING';
  end if;

  if not p_shift.allow_multi_role and not multi_role_allowed and exists (
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

create or replace function public.create_shift(p_data jsonb)
returns public.shifts
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id text;
  created_shift public.shifts;
  settings_row public.system_settings;
  input_key text;
  initial_user_id text;
  role_name text;
begin
  actor_id := private.require_shift_actor(true);
  select * into settings_row from public.system_settings limit 1;
  if settings_row.id is null then
    raise exception using errcode = 'P0001', message = 'OPERATIONAL_SETTINGS_NOT_CONFIGURED';
  end if;
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
    private.normalize_shift_capacity(p_data->>'required_host_count', settings_row.default_host_count),
    private.normalize_shift_capacity(p_data->>'required_support_count', settings_row.default_support_count),
    private.normalize_shift_capacity(p_data->>'required_technical_count', settings_row.default_technical_count),
    nullif(p_data->>'registration_cutoff_at', '')::timestamptz,
    coalesce((p_data->>'allow_multi_role')::boolean, settings_row.allow_multi_role_per_shift),
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

revoke all on function public.create_shift(jsonb) from public, anon, authenticated;
revoke all on function public.register_for_shift(text, text) from public, anon, authenticated;
grant execute on function public.create_shift(jsonb) to authenticated;
grant execute on function public.register_for_shift(text, text) to authenticated;
