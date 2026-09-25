-- RC1.3A: classify shifts explicitly and record operator-approved storage routes.
-- No data backfill, route seed, folder operation, or archive/offload occurs here.

alter table public.shifts
  add column execution_source text null;
alter table public.shifts
  add constraint shifts_execution_source_check
  check (execution_source in ('internal', 'agency'));

-- Existing brands remain unclassified. A brand created after this migration,
-- through the existing insert path, receives the canonical onboarding profile.
alter table public.brands
  add column storage_profile text null;
alter table public.brands
  add constraint brands_storage_profile_check
  check (storage_profile in (
    'LEGACY_CATEGORY_PERIOD', 'LEGACY_PLATFORM_CATEGORY_PERIOD',
    'LEGACY_PERIOD_CATEGORY', 'LEGACY_SUBBRAND_PERIOD_CATEGORY',
    'LEGACY_SUBBRAND_CATEGORY_PERIOD', 'CANONICAL_V1'
  ));
alter table public.brands
  alter column storage_profile set default 'CANONICAL_V1';

-- Route keys are exact IDs, not display-name matches or wildcard fallbacks.
-- NULL platform/subbrand is an explicit part of the key, not "any".
create table public.operational_storage_routes (
  id text primary key default gen_random_uuid()::text,
  provider text not null,
  execution_source text not null,
  brand_id text not null references public.brands(id) on delete restrict,
  platform_id text null references public.platforms(id) on delete restrict,
  subbrand_key text null,
  storage_profile text not null,
  root_folder_id text not null,
  base_folder_id text not null,
  folder_labels jsonb not null default '{}'::jsonb,
  period_naming_style text not null,
  active boolean not null default true,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint operational_storage_routes_provider_check
    check (provider in ('google_drive', 'onedrive')),
  constraint operational_storage_routes_execution_source_check
    check (execution_source in ('internal', 'agency')),
  constraint operational_storage_routes_profile_check
    check (storage_profile in (
      'LEGACY_CATEGORY_PERIOD', 'LEGACY_PLATFORM_CATEGORY_PERIOD',
      'LEGACY_PERIOD_CATEGORY', 'LEGACY_SUBBRAND_PERIOD_CATEGORY',
      'LEGACY_SUBBRAND_CATEGORY_PERIOD', 'CANONICAL_V1'
    )),
  constraint operational_storage_routes_ids_check
    check (btrim(root_folder_id) <> '' and btrim(base_folder_id) <> ''),
  constraint operational_storage_routes_subbrand_check
    check (subbrand_key is null or btrim(subbrand_key) <> ''),
  constraint operational_storage_routes_subbrand_profile_check
    check (
      (storage_profile in ('LEGACY_SUBBRAND_PERIOD_CATEGORY', 'LEGACY_SUBBRAND_CATEGORY_PERIOD'))
      = (subbrand_key is not null)
    ),
  constraint operational_storage_routes_labels_check
    check (jsonb_typeof(folder_labels) = 'object'),
  constraint operational_storage_routes_period_check
    check (btrim(period_naming_style) <> '')
);

-- PostgreSQL 15+ NULLS NOT DISTINCT prevents duplicate active exact keys even
-- when platform/subbrand are NULL. The later resolver must use exact-key lookup.
create unique index operational_storage_routes_active_key_uidx
  on public.operational_storage_routes
  (provider, execution_source, brand_id, platform_id, subbrand_key)
  nulls not distinct where active;

create trigger operational_storage_routes_set_updated_at
before update on public.operational_storage_routes
for each row execute function private.set_updated_at();

alter table public.operational_storage_routes enable row level security;
revoke all on table public.operational_storage_routes from public, anon, authenticated;
-- No Data API grants or policies: only a privileged operator/database owner may
-- manage or inspect mappings until the server-side resolver is introduced.

-- Preserve the current actor/settings/staffing contract; only admit and persist
-- the new nullable business field.
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
      'host_names', 'assistant_names', 'technical_names',
      'required_host_count', 'required_support_count', 'required_technical_count',
      'registration_cutoff_at', 'allow_multi_role', 'import_batch_id', 'status',
      'live_link', 'product_notes', 'execution_source'
    ]::text[]) then
      raise exception using errcode = '22023', message = 'SHIFT_FIELD_NOT_ALLOWED';
    end if;
  end loop;
  if p_data->>'execution_source' is not null
    and p_data->>'execution_source' not in ('internal', 'agency') then
    raise exception using errcode = '22023', message = 'SHIFT_EXECUTION_SOURCE_INVALID';
  end if;
  if (p_data ? 'host_names' and jsonb_typeof(p_data->'host_names') <> 'array')
    or (p_data ? 'assistant_names' and jsonb_typeof(p_data->'assistant_names') <> 'array')
    or (p_data ? 'technical_names' and jsonb_typeof(p_data->'technical_names') <> 'array')
  then
    raise exception using errcode = '22023', message = 'SHIFT_STAFFING_NAMES_INVALID';
  end if;

  insert into public.shifts (
    date, start_time, end_time, timezone, brand_id, platform_id, campaign_id,
    title, studio, host_names, assistant_names, technical_names,
    required_host_count, required_support_count, required_technical_count,
    registration_cutoff_at, allow_multi_role, import_batch_id, status,
    live_link, product_notes, updated_by, execution_source
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
    array(select value from jsonb_array_elements_text(coalesce(p_data->'host_names', '[]'::jsonb)) as names(value)),
    array(select value from jsonb_array_elements_text(coalesce(p_data->'assistant_names', '[]'::jsonb)) as names(value)),
    array(select value from jsonb_array_elements_text(coalesce(p_data->'technical_names', '[]'::jsonb)) as names(value)),
    private.normalize_shift_capacity(p_data->>'required_host_count', settings_row.default_host_count),
    private.normalize_shift_capacity(p_data->>'required_support_count', settings_row.default_support_count),
    private.normalize_shift_capacity(p_data->>'required_technical_count', settings_row.default_technical_count),
    nullif(p_data->>'registration_cutoff_at', '')::timestamptz,
    coalesce((p_data->>'allow_multi_role')::boolean, settings_row.allow_multi_role_per_shift),
    nullif(p_data->>'import_batch_id', ''),
    coalesce(nullif(p_data->>'status', ''), 'scheduled'),
    nullif(p_data->>'live_link', ''),
    nullif(p_data->>'product_notes', ''),
    actor_id,
    p_data->>'execution_source'
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

revoke all on function public.create_shift(jsonb) from public, anon, authenticated;
grant execute on function public.create_shift(jsonb) to authenticated;

-- Keep the current optimistic-version, lifecycle, and impact guards intact.
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
      'registration_cutoff_at', 'allow_multi_role', 'execution_source'
    ]::text[]) then
      raise exception using errcode = '22023', message = 'SHIFT_FIELD_NOT_ALLOWED';
    end if;
    if actor_permission = 'leader'
      and input_key in ('registration_cutoff_at', 'allow_multi_role')
    then
      raise exception using errcode = '42501', message = 'OPERATION_NOT_ALLOWED';
    end if;
  end loop;
  if p_patch->>'execution_source' is not null
    and p_patch->>'execution_source' not in ('internal', 'agency') then
    raise exception using errcode = '22023', message = 'SHIFT_EXECUTION_SOURCE_INVALID';
  end if;
  select * into existing_shift
  from public.shifts
  where id = p_shift_id and deleted_at is null and archived_at is null
  for update;
  if existing_shift.id is null then
    raise exception using errcode = 'P0001', message = 'SHIFT_NOT_FOUND';
  end if;
  perform private.assert_expected_version('Shift', p_expected_version, existing_shift.version);
  requested_status := coalesce(nullif(p_patch->>'status', ''), existing_shift.status);
  if actor_permission in ('leader', 'admin')
    and requested_status <> existing_shift.status and not (
      (existing_shift.status = 'scheduled' and requested_status in ('scheduled', 'preparing', 'cancelled'))
      or (existing_shift.status = 'preparing' and requested_status in ('scheduled', 'preparing', 'live', 'paused', 'cancelled'))
      or (existing_shift.status = 'live' and requested_status in ('live', 'paused', 'completed'))
      or (existing_shift.status = 'paused' and requested_status in ('live', 'paused', 'completed'))
      or (existing_shift.status = 'completed' and existing_shift.status_mode = 'auto'
        and requested_status in ('scheduled', 'preparing', 'live', 'paused', 'completed'))
      or (existing_shift.status = 'completed' and existing_shift.status_mode = 'manual' and requested_status = 'completed')
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
    execution_source = case when p_patch ? 'execution_source' then p_patch->>'execution_source' else shift.execution_source end,
    updated_by = actor_id
  where shift.id = p_shift_id
  returning * into updated_shift;
  perform private.assert_shift_staffing_consistent(updated_shift);
  return updated_shift;
end;
$$;

revoke all on function public.update_shift(text, jsonb, boolean, integer) from public, anon, authenticated;
grant execute on function public.update_shift(text, jsonb, boolean, integer) to authenticated;
