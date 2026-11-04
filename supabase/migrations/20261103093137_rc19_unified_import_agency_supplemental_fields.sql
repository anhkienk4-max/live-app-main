-- RC19 unified Import: agency/source contract and persistent typed supplemental Shift fields.
begin;

alter table public.shifts
  add column if not exists supplemental_fields jsonb not null default '{}'::jsonb;

create or replace function private.is_valid_shift_supplemental_fields(p_fields jsonb)
returns boolean
language sql
immutable
set search_path to ''
as $function$
  select case
    when p_fields is null or jsonb_typeof(p_fields) is distinct from 'object' then false
    when (select count(*) from jsonb_object_keys(p_fields)) > 50 then false
    else not exists (
      select 1
      from jsonb_each(p_fields) as item(field_key, field_value)
      where case
        when jsonb_typeof(item.field_value) <> 'object' then true
        else item.field_key !~ '^[a-z0-9][a-z0-9_-]{0,79}$'
          or (select count(*) from jsonb_object_keys(item.field_value)) <> 3
          or not (item.field_value ?& array['label', 'type', 'value'])
          or jsonb_typeof(item.field_value->'label') <> 'string'
          or length(btrim(item.field_value->>'label')) not between 1 and 80
          or item.field_value->>'type' not in ('text', 'number', 'boolean', 'date', 'time')
          or case item.field_value->>'type'
            when 'text' then jsonb_typeof(item.field_value->'value') <> 'string'
              or length(item.field_value->>'value') > 2000
            when 'number' then jsonb_typeof(item.field_value->'value') <> 'number'
            when 'boolean' then jsonb_typeof(item.field_value->'value') <> 'boolean'
            when 'date' then jsonb_typeof(item.field_value->'value') <> 'string'
              or item.field_value->>'value' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
            when 'time' then jsonb_typeof(item.field_value->'value') <> 'string'
              or item.field_value->>'value' !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
            else true
          end
      end
    )
  end;
$function$;

revoke all on function private.is_valid_shift_supplemental_fields(jsonb) from public;
grant execute on function private.is_valid_shift_supplemental_fields(jsonb) to authenticated, service_role;

alter table public.shifts
  drop constraint if exists shifts_agency_execution_source_check;

do $$
begin
  if exists (
    select 1 from public.shifts
    where agency_code is not null
      and not (
        (agency_code = 'ada' and execution_source = 'internal')
        or (agency_code in ('snap', 'live_ai') and execution_source = 'agency')
      )
  ) then
    raise exception using errcode = '23514',
      message = 'RC19_AGENCY_MAPPING_MIGRATION_REQUIRES_DATA_REVIEW';
  end if;
end $$;

alter table public.shifts
  add constraint shifts_agency_execution_source_check
  check (
    agency_code is null
    or (agency_code = 'ada' and execution_source = 'internal')
    or (agency_code in ('snap', 'live_ai') and execution_source = 'agency')
  );

alter table public.shifts
  add constraint shifts_supplemental_fields_object_check
  check (private.is_valid_shift_supplemental_fields(supplemental_fields));

comment on column public.shifts.supplemental_fields is
  'Typed, RLS-protected operational fields retained from schedule imports; values use {label,type,value}.';
CREATE OR REPLACE FUNCTION public.create_shift(p_data jsonb)
 RETURNS shifts
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor_id text;
  created_shift public.shifts;
  settings_row public.system_settings;
  input_key text;
  initial_user_id text;
  role_name text;
  effective_source text;
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
      'live_link', 'product_notes', 'execution_source', 'agency_code', 'supplemental_fields'
    ]::text[]) then
      raise exception using errcode = '22023', message = 'SHIFT_FIELD_NOT_ALLOWED';
    end if;
  end loop;
  if (p_data ? 'execution_source' and p_data->>'execution_source' is not null
    and p_data->>'execution_source' not in ('internal', 'agency')) then
    raise exception using errcode = '22023', message = 'SHIFT_EXECUTION_SOURCE_INVALID';
  end if;
  if (p_data ? 'agency_code' and p_data->>'agency_code' is not null
    and p_data->>'agency_code' not in ('ada', 'snap', 'live_ai')) then
    raise exception using errcode = '22023', message = 'SHIFT_AGENCY_CODE_INVALID';
  end if;
  effective_source := coalesce(nullif(p_data->>'execution_source', ''),
    case p_data->>'agency_code' when 'ada' then 'internal' when 'snap' then 'agency' when 'live_ai' then 'agency' else null end);
  if (p_data->>'agency_code' is not null and effective_source is distinct from
    case p_data->>'agency_code' when 'ada' then 'internal' else 'agency' end) then
    raise exception using errcode = '22023', message = 'SHIFT_AGENCY_EXECUTION_SOURCE_CONFLICT';
  end if;
  if p_data ? 'supplemental_fields' and not private.is_valid_shift_supplemental_fields(p_data->'supplemental_fields') then
    raise exception using errcode = '22023', message = 'SHIFT_SUPPLEMENTAL_FIELDS_INVALID';
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
    live_link, product_notes, updated_by, execution_source, agency_code, supplemental_fields
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
    effective_source,
    p_data->>'agency_code',
    coalesce(p_data->'supplemental_fields', '{}'::jsonb)
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
$function$;

CREATE OR REPLACE FUNCTION public.update_shift(p_shift_id text, p_patch jsonb, p_confirm_impact boolean DEFAULT false)
 RETURNS shifts
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor_id text;
  actor_permission text;
  existing_shift public.shifts;
  updated_shift public.shifts;
  input_key text;
  requested_status text;
  effective_agency text;
  effective_source text;
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
      'registration_cutoff_at', 'allow_multi_role', 'execution_source', 'agency_code', 'supplemental_fields'
    ]::text[]) then
      raise exception using errcode = '22023', message = 'SHIFT_FIELD_NOT_ALLOWED';
    end if;
    if actor_permission = 'leader'
      and input_key in ('registration_cutoff_at', 'allow_multi_role')
    then
      raise exception using errcode = '42501', message = 'OPERATION_NOT_ALLOWED';
    end if;
  end loop;
  if (p_patch ? 'execution_source' and p_patch->>'execution_source' is not null
    and p_patch->>'execution_source' not in ('internal', 'agency')) then
    raise exception using errcode = '22023', message = 'SHIFT_EXECUTION_SOURCE_INVALID';
  end if;
  if (p_patch ? 'agency_code' and p_patch->>'agency_code' is not null
    and p_patch->>'agency_code' not in ('ada', 'snap', 'live_ai')) then
    raise exception using errcode = '22023', message = 'SHIFT_AGENCY_CODE_INVALID';
  end if;
  if p_patch ? 'supplemental_fields' and not private.is_valid_shift_supplemental_fields(p_patch->'supplemental_fields') then
    raise exception using errcode = '22023', message = 'SHIFT_SUPPLEMENTAL_FIELDS_INVALID';
  end if;

  select * into existing_shift
  from public.shifts
  where id = p_shift_id and deleted_at is null and archived_at is null
  for update;
  if existing_shift.id is null then
    raise exception using errcode = 'P0001', message = 'SHIFT_NOT_FOUND';
  end if;

  effective_agency := case
    when p_patch ? 'agency_code' then nullif(p_patch->>'agency_code', '')
    else existing_shift.agency_code
  end;
  effective_source := case
    when p_patch ? 'execution_source' then nullif(p_patch->>'execution_source', '')
    when p_patch ? 'agency_code' and effective_agency is not null then
      case effective_agency when 'ada' then 'internal' else 'agency' end
    else existing_shift.execution_source
  end;
  if (effective_agency is not null and effective_source is distinct from
    case effective_agency when 'ada' then 'internal' else 'agency' end) then
    raise exception using errcode = '22023', message = 'SHIFT_AGENCY_EXECUTION_SOURCE_CONFLICT';
  end if;

  requested_status := coalesce(nullif(p_patch->>'status', ''), existing_shift.status);
  if actor_permission in ('leader', 'admin')
    and requested_status <> existing_shift.status and not (
      (existing_shift.status = 'scheduled' and requested_status in ('scheduled', 'preparing', 'cancelled'))
      or (existing_shift.status = 'preparing' and requested_status in ('scheduled', 'preparing', 'live', 'paused', 'cancelled'))
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
    supplemental_fields = case when p_patch ? 'supplemental_fields' then p_patch->'supplemental_fields' else shift.supplemental_fields end,
    execution_source = case
      when p_patch ? 'execution_source' then p_patch->>'execution_source'
      when p_patch ? 'agency_code' and nullif(p_patch->>'agency_code', '') is not null then
        case nullif(p_patch->>'agency_code', '') when 'ada' then 'internal' else 'agency' end
      else shift.execution_source end,
    agency_code = case
      when p_patch ? 'agency_code' then nullif(p_patch->>'agency_code', '')
      else shift.agency_code end,
    updated_by = actor_id
  where shift.id = p_shift_id
  returning * into updated_shift;
  perform private.assert_shift_staffing_consistent(updated_shift);
  return updated_shift;
end;
$function$;

CREATE OR REPLACE FUNCTION public.update_shift(p_shift_id text, p_patch jsonb, p_confirm_impact boolean, p_expected_version integer)
 RETURNS shifts
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  actor_id text;
  actor_permission text;
  existing_shift public.shifts;
  updated_shift public.shifts;
  input_key text;
  requested_status text;
  effective_agency text;
  effective_source text;
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
      'registration_cutoff_at', 'allow_multi_role', 'execution_source', 'agency_code', 'supplemental_fields'
    ]::text[]) then
      raise exception using errcode = '22023', message = 'SHIFT_FIELD_NOT_ALLOWED';
    end if;
    if actor_permission = 'leader'
      and input_key in ('registration_cutoff_at', 'allow_multi_role')
    then
      raise exception using errcode = '42501', message = 'OPERATION_NOT_ALLOWED';
    end if;
  end loop;
  if (p_patch ? 'execution_source' and p_patch->>'execution_source' is not null
    and p_patch->>'execution_source' not in ('internal', 'agency')) then
    raise exception using errcode = '22023', message = 'SHIFT_EXECUTION_SOURCE_INVALID';
  end if;
  if (p_patch ? 'agency_code' and p_patch->>'agency_code' is not null
    and p_patch->>'agency_code' not in ('ada', 'snap', 'live_ai')) then
    raise exception using errcode = '22023', message = 'SHIFT_AGENCY_CODE_INVALID';
  end if;
  if p_patch ? 'supplemental_fields' and not private.is_valid_shift_supplemental_fields(p_patch->'supplemental_fields') then
    raise exception using errcode = '22023', message = 'SHIFT_SUPPLEMENTAL_FIELDS_INVALID';
  end if;

  select * into existing_shift
  from public.shifts
  where id = p_shift_id and deleted_at is null and archived_at is null
  for update;
  if existing_shift.id is null then
    raise exception using errcode = 'P0001', message = 'SHIFT_NOT_FOUND';
  end if;

  perform private.assert_expected_version('Shift', p_expected_version, existing_shift.version);

  effective_agency := case
    when p_patch ? 'agency_code' then nullif(p_patch->>'agency_code', '')
    else existing_shift.agency_code
  end;
  effective_source := case
    when p_patch ? 'execution_source' then nullif(p_patch->>'execution_source', '')
    when p_patch ? 'agency_code' and effective_agency is not null then
      case effective_agency when 'ada' then 'internal' else 'agency' end
    else existing_shift.execution_source
  end;
  if (effective_agency is not null and effective_source is distinct from
    case effective_agency when 'ada' then 'internal' else 'agency' end) then
    raise exception using errcode = '22023', message = 'SHIFT_AGENCY_EXECUTION_SOURCE_CONFLICT';
  end if;

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
    supplemental_fields = case when p_patch ? 'supplemental_fields' then p_patch->'supplemental_fields' else shift.supplemental_fields end,
    execution_source = case
      when p_patch ? 'execution_source' then p_patch->>'execution_source'
      when p_patch ? 'agency_code' and nullif(p_patch->>'agency_code', '') is not null then
        case nullif(p_patch->>'agency_code', '') when 'ada' then 'internal' else 'agency' end
      else shift.execution_source end,
    agency_code = case
      when p_patch ? 'agency_code' then nullif(p_patch->>'agency_code', '')
      else shift.agency_code end,
    updated_by = actor_id
  where shift.id = p_shift_id
  returning * into updated_shift;
  perform private.assert_shift_staffing_consistent(updated_shift);
  return updated_shift;
end;
$function$;

commit;
