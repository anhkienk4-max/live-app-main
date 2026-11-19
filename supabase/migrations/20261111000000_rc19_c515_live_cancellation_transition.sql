begin;

-- Refuse to replace a drifted function body; this forward migration is based on the C4 source contract.
do $preflight$
declare v_definition text;
begin
  select pg_get_functiondef('public.update_shift(text,jsonb,boolean,integer)'::regprocedure)
    into v_definition;
  if v_definition is null
    or position('private.require_shift_actor(true)' in v_definition) = 0
    or position('private.assert_expected_version' in v_definition) = 0
    or position('SHIFT_STATUS_TRANSITION_NOT_ALLOWED' in v_definition) = 0
    or position('existing_shift.status = ''live''' in v_definition) = 0 then
    raise exception 'C515_SHIFT_RPC_DEFINITION_DRIFT';
  end if;
end
$preflight$;

do $preflight$
declare v_definition text;
begin
  select pg_get_functiondef('public.workforce_rc16_immutable_approved_segment()'::regprocedure)
    into v_definition;
  if v_definition is null
    or position('WORKFORCE_APPROVED_STAFF_OVERLAP' in v_definition) = 0
    or position('WORKFORCE_APPROVED_NO_SHOW_CONFLICT' in v_definition) = 0
    or position('WORKFORCE_SHIFT_NOT_COMPLETED' in v_definition) = 0 then
    raise exception 'C515_WORKFORCE_TRIGGER_DEFINITION_DRIFT';
  end if;
end
$preflight$;

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
      or (existing_shift.status = 'live' and requested_status in ('live', 'paused', 'completed', 'cancelled'))
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

create or replace function public.workforce_rc16_immutable_approved_segment()
returns trigger language plpgsql set search_path='' as $$
begin
  if tg_op='INSERT' then
    if new.review_status <> 'draft' or new.reviewed_by is not null
      or new.reviewed_at is not null or new.review_note is not null then
      raise exception 'WORKFORCE_SEGMENT_MUST_START_DRAFT';
    end if;
    return new;
  end if;
  if tg_op='DELETE' and old.review_status in ('approved','rejected') then
    raise exception 'WORKFORCE_REVIEWED_SEGMENT_IMMUTABLE';
  end if;
  if tg_op='UPDATE' and old.review_status in ('approved','rejected') then
    raise exception 'WORKFORCE_REVIEWED_SEGMENT_IMMUTABLE';
  end if;
  if tg_op='UPDATE' and new.version <> old.version + 1 then
    raise exception 'WORKFORCE_ACTUAL_STALE_VERSION';
  end if;
  if new.review_status='approved' then
    if not exists (
      select 1 from public.shifts s
      where s.id=new.shift_id and s.deleted_at is null
        and (
          s.status='completed'
          or (s.status='cancelled' and new.event_kind='worked' and exists (
            select 1 from public.audit_logs a
            where a.entity_type='shifts' and a.entity_id=new.shift_id
              and a.actor_role in ('admin','leader') and a.actor_business_user_id is not null
              and a.before_data->>'status' is distinct from 'cancelled'
              and a.after_data->>'status'='cancelled'
              and a.after_data->>'id'=new.shift_id
              and new.actual_end_at<=a.created_at
          ))
        )
    ) then
      raise exception 'WORKFORCE_SHIFT_NOT_COMPLETED';
    end if;
    perform pg_advisory_xact_lock(hashtextextended('staff-attendance:'||new.staff_id,0));
    if new.event_kind='worked' and exists (
      select 1 from public.workforce_actual_segments existing
      where existing.staff_id=new.staff_id and existing.id<>new.id
        and existing.review_status='approved' and existing.event_kind='worked'
        and tstzrange(existing.actual_start_at,existing.actual_end_at,'[)')
          && tstzrange(new.actual_start_at,new.actual_end_at,'[)')
    ) then
      raise exception 'WORKFORCE_APPROVED_STAFF_OVERLAP';
    end if;
    if exists (
      select 1 from public.workforce_actual_segments existing
      where existing.shift_id=new.shift_id and existing.staff_id=new.staff_id
        and existing.operational_role=new.operational_role
        and existing.id<>new.id and existing.review_status='approved'
        and existing.event_kind<>new.event_kind
    ) then
      raise exception 'WORKFORCE_APPROVED_NO_SHOW_CONFLICT';
    end if;
  end if;
  return case when tg_op='DELETE' then old else new end;
end $$;

alter function public.update_shift(text, jsonb, boolean, integer) owner to postgres;
revoke all on function public.update_shift(text, jsonb, boolean, integer) from public, anon, authenticated;
grant execute on function public.update_shift(text, jsonb, boolean, integer) to authenticated;
alter function public.workforce_rc16_immutable_approved_segment() owner to postgres;
revoke all on function public.workforce_rc16_immutable_approved_segment() from public, anon, authenticated;

commit;
