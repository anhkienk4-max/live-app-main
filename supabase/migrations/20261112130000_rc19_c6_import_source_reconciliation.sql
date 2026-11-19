-- Import Confirm is atomic with its row receipt. Changed rows are never used
-- to mutate an existing Shift until an approved reconciliation contract exists.

create or replace function private.c6_import_changed_fields(p_previous jsonb, p_current jsonb)
returns text[]
language plpgsql
immutable
security invoker
set search_path = ''
as $$
declare
  changed text[] := '{}'::text[];
  field_name text;
begin
  for field_name in
    select key
    from jsonb_object_keys(coalesce(p_previous, '{}'::jsonb) || coalesce(p_current, '{}'::jsonb)) as fields(key)
    where key not in ('row_number', 'warnings', 'errors')
      and p_previous->key is distinct from p_current->key
    order by key
  loop
    changed := array_append(changed, field_name);
  end loop;

  if p_previous->'custom_fields' is distinct from p_current->'custom_fields' then
    if exists (
      select 1
      from jsonb_each(coalesce(p_previous->'custom_fields', '{}'::jsonb)) as old_field(key, value)
      full join jsonb_each(coalesce(p_current->'custom_fields', '{}'::jsonb)) as new_field(key, value)
        using (key)
      where lower(key) like '%external%shift%'
         or lower(key) like '%shift%id%'
         or lower(key) like '%khung nhân sự%'
         or lower(key) like '%staffing slot%'
         or lower(key) like '%staffing segment%'
    ) then
      if exists (
        select 1
        from jsonb_each(coalesce(p_previous->'custom_fields', '{}'::jsonb)) as old_field(key, value)
        full join jsonb_each(coalesce(p_current->'custom_fields', '{}'::jsonb)) as new_field(key, value)
          using (key)
        where (lower(key) like '%external%shift%'
            or lower(key) like '%shift%id%')
          and old_field.value is distinct from new_field.value
      ) then changed := array_append(changed, 'external_shift_code'); end if;
      if exists (
        select 1
        from jsonb_each(coalesce(p_previous->'custom_fields', '{}'::jsonb)) as old_field(key, value)
        full join jsonb_each(coalesce(p_current->'custom_fields', '{}'::jsonb)) as new_field(key, value)
          using (key)
        where (lower(key) like '%khung nhân sự%'
            or lower(key) like '%staffing slot%'
            or lower(key) like '%staffing segment%')
          and old_field.value is distinct from new_field.value
      ) then changed := array_append(changed, 'staffing_segments'); end if;
      if not ('external_shift_code' = any(changed) or 'staffing_segments' = any(changed)) then
        changed := array_append(changed, 'source_custom_fields');
      end if;
    else
      changed := array_append(changed, 'source_custom_fields');
    end if;
  end if;

  return changed;
end;
$$;

alter function private.c6_import_changed_fields(jsonb, jsonb) owner to postgres;
revoke all on function private.c6_import_changed_fields(jsonb, jsonb) from public, anon, authenticated, service_role;

create or replace function public.create_schedule_import_shift(
  p_batch_id text,
  p_row_number integer,
  p_data jsonb,
  p_segments jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id text := private.require_shift_actor(true);
  batch_row public.schedule_import_batches%rowtype;
  import_row public.schedule_import_batch_rows%rowtype;
  previous_row public.schedule_import_batch_rows%rowtype;
  previous_shift public.shifts%rowtype;
  existing_shift_id text;
  slot_count integer;
  exact_slot_count integer;
  ambiguous_slot_count integer;
  created_shift public.shifts%rowtype;
  previous_shift_ids text[];
  changed_fields text[];
  failure text;
  requested_outcome text;
  result jsonb;
begin
  if p_row_number is null or p_row_number < 1 then
    raise exception using errcode = '22023', message = 'IMPORT_ROW_NUMBER_INVALID';
  end if;
  if p_data is null or jsonb_typeof(p_data) <> 'object'
     or p_segments is null or jsonb_typeof(p_segments) <> 'array' then
    raise exception using errcode = '22023', message = 'IMPORT_PAYLOAD_INVALID';
  end if;

  select * into batch_row
  from public.schedule_import_batches
  where id = p_batch_id
  for update;
  if batch_row.id is null or batch_row.deleted_at is not null then
    raise exception using errcode = 'P0001', message = 'IMPORT_BATCH_NOT_FOUND';
  end if;
  if batch_row.created_by is distinct from actor_id then
    raise exception using errcode = '42501', message = 'IMPORT_BATCH_ACTOR_MISMATCH';
  end if;
  if batch_row.status not in ('previewed', 'failed', 'confirmed') then
    raise exception using errcode = 'P0001', message = 'IMPORT_BATCH_NOT_ACTIVE';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(
    jsonb_build_array(batch_row.source, batch_row.source_name, p_row_number)::text, 0
  ));

  select * into import_row
  from public.schedule_import_batch_rows
  where batch_id = p_batch_id and row_number = p_row_number
  for update;
  if import_row.id is null then
    raise exception using errcode = 'P0001', message = 'IMPORT_ROW_NOT_FOUND';
  end if;

  if import_row.outcome in ('imported', 'warning') then
    select * into created_shift from public.shifts where id = import_row.shift_id;
    if created_shift.id is null or created_shift.import_batch_id is distinct from p_batch_id then
      raise exception using errcode = 'P0001', message = 'IMPORT_ROW_SHIFT_MISMATCH';
    end if;
    return jsonb_build_object('outcome', import_row.outcome, 'shift', to_jsonb(created_shift), 'idempotent', true);
  elsif import_row.outcome = 'duplicate_skipped' then
    return jsonb_build_object('outcome', 'duplicate_skipped', 'idempotent', true);
  elsif import_row.outcome not in ('pending', 'retryable') or batch_row.status = 'confirmed' then
    raise exception using errcode = 'P0001', message = 'IMPORT_ROW_OUTCOME_CONFLICT';
  end if;

  if coalesce(nullif(p_data->>'brand_id', ''), '') = ''
     or coalesce(nullif(p_data->>'platform_id', ''), '') = '' then
    raise exception using errcode = '22023', message = 'IMPORT_BRAND_PLATFORM_REQUIRED';
  end if;
  if private.current_system_permission() = 'leader'
     and not private.rc19_has_any_leader_brand_scope(p_data->>'brand_id', array['shifts.manage']::text[]) then
    raise exception using errcode = '42501', message = 'OPERATION_NOT_ALLOWED';
  end if;
  if not exists (
       select 1 from public.brands b
       where b.id = p_data->>'brand_id'
         and lower(btrim(b.name)) = lower(btrim(import_row.source_row->>'brand_name'))
     ) or not exists (
       select 1 from public.platforms p
       where p.id = p_data->>'platform_id'
         and lower(btrim(p.name)) = lower(btrim(import_row.source_row->>'platform_name'))
     ) then
    raise exception using errcode = '22023', message = 'IMPORT_SOURCE_IDENTITY_MISMATCH';
  end if;
  if p_data->>'date' is distinct from import_row.source_row->>'date'
     or left(p_data->>'start_time', 5) is distinct from import_row.source_row->>'start_time'
     or left(p_data->>'end_time', 5) is distinct from import_row.source_row->>'end_time' then
    raise exception using errcode = '22023', message = 'IMPORT_SOURCE_IDENTITY_MISMATCH';
  end if;

  select array_agg(distinct prior.shift_id order by prior.shift_id)
    into previous_shift_ids
  from public.schedule_import_batches prior_batch
  join public.schedule_import_batch_rows prior
    on prior.batch_id = prior_batch.id
  join public.shifts prior_shift
    on prior_shift.id = prior.shift_id
  where prior_batch.source = batch_row.source
    and prior_batch.source_name = batch_row.source_name
    and prior_batch.id <> batch_row.id
    and prior.row_number = p_row_number
    and prior.outcome in ('imported', 'warning')
    and prior.shift_id is not null;

  if coalesce(cardinality(previous_shift_ids), 0) > 1 then
    failure := 'IMPORT_SOURCE_HISTORY_AMBIGUOUS_REVIEW_REQUIRED';
  elsif coalesce(cardinality(previous_shift_ids), 0) = 1 then
    select prior.* into previous_row
    from public.schedule_import_batch_rows prior
    join public.schedule_import_batches prior_batch on prior_batch.id = prior.batch_id
    where prior_batch.source = batch_row.source
      and prior_batch.source_name = batch_row.source_name
      and prior_batch.id <> batch_row.id
      and prior.row_number = p_row_number
      and prior.outcome in ('imported', 'warning')
      and prior.shift_id = previous_shift_ids[1]
    order by prior_batch.confirmed_at desc nulls last, prior_batch.created_at desc, prior.updated_at desc
    limit 1;

    select * into previous_shift from public.shifts where id = previous_shift_ids[1];
    if previous_shift.id is null or not private.can_read_shift(previous_shift.id) then
      failure := 'IMPORT_SOURCE_HISTORY_SCOPE_REVIEW_REQUIRED';
    else
      changed_fields := private.c6_import_changed_fields(previous_row.source_row, import_row.source_row);
      if cardinality(changed_fields) = 0 then
        update public.schedule_import_batch_rows
        set outcome = 'duplicate_skipped', shift_id = null, failure_code = null
        where id = import_row.id and outcome in ('pending', 'retryable');
        perform private.sync_schedule_import_batch_counts(p_batch_id);
        return jsonb_build_object('outcome', 'duplicate_skipped', 'shift_id', previous_shift.id, 'idempotent', false);
      end if;
      failure := 'IMPORT_SOURCE_CHANGED_REVIEW_REQUIRED:' || array_to_string(changed_fields, ',');
    end if;
  end if;

  if failure is null then
    select count(*)::integer,
      count(*) filter (
        where coalesce(lower(btrim(s.studio)), '') = coalesce(lower(btrim(p_data->>'studio')), '')
          and coalesce(lower(btrim(s.campaign_id)), '') = coalesce(lower(btrim(p_data->>'campaign_id')), '')
      )::integer,
      count(*) filter (
        where not (
          (nullif(btrim(s.studio), '') is not null
            and nullif(btrim(p_data->>'studio'), '') is not null
            and lower(btrim(s.studio)) <> lower(btrim(p_data->>'studio')))
          or (nullif(btrim(s.campaign_id), '') is not null
            and nullif(btrim(p_data->>'campaign_id'), '') is not null
            and lower(btrim(s.campaign_id)) <> lower(btrim(p_data->>'campaign_id')))
        )
        and not (
          coalesce(lower(btrim(s.studio)), '') = coalesce(lower(btrim(p_data->>'studio')), '')
          and coalesce(lower(btrim(s.campaign_id)), '') = coalesce(lower(btrim(p_data->>'campaign_id')), '')
        )
      )::integer
    into slot_count, exact_slot_count, ambiguous_slot_count
    from public.shifts s
    where s.deleted_at is null and s.archived_at is null
      and s.brand_id = p_data->>'brand_id'
      and s.platform_id = p_data->>'platform_id'
      and s.date = (p_data->>'date')::date
      and left(s.start_time::text, 5) = left(p_data->>'start_time', 5)
      and left(s.end_time::text, 5) = left(p_data->>'end_time', 5);
    if exact_slot_count > 1 then
      failure := 'IMPORT_SLOT_IDENTITY_AMBIGUOUS_REVIEW_REQUIRED';
    elsif exact_slot_count = 1 and ambiguous_slot_count = 0 then
      select s.id into existing_shift_id from public.shifts s
      where s.deleted_at is null and s.archived_at is null
        and s.brand_id = p_data->>'brand_id'
        and s.platform_id = p_data->>'platform_id'
        and s.date = (p_data->>'date')::date
        and left(s.start_time::text, 5) = left(p_data->>'start_time', 5)
        and left(s.end_time::text, 5) = left(p_data->>'end_time', 5)
        and coalesce(lower(btrim(s.studio)), '') = coalesce(lower(btrim(p_data->>'studio')), '')
        and coalesce(lower(btrim(s.campaign_id)), '') = coalesce(lower(btrim(p_data->>'campaign_id')), '')
      order by s.id limit 1;
      update public.schedule_import_batch_rows
      set outcome = 'duplicate_skipped', shift_id = null, failure_code = null
      where id = import_row.id and outcome in ('pending', 'retryable');
      perform private.sync_schedule_import_batch_counts(p_batch_id);
      return jsonb_build_object('outcome', 'duplicate_skipped', 'shift_id', existing_shift_id, 'idempotent', false);
    elsif ambiguous_slot_count > 0 then
      failure := 'IMPORT_SLOT_IDENTITY_AMBIGUOUS_REVIEW_REQUIRED';
    end if;
  end if;

  if failure is not null then
    update public.schedule_import_batch_rows
    set outcome = 'retryable', shift_id = null, failure_code = left(failure, 200)
    where id = import_row.id and outcome in ('pending', 'retryable');
    if not found then
      raise exception using errcode = 'P0001', message = 'IMPORT_ROW_OUTCOME_CONFLICT';
    end if;
    perform private.sync_schedule_import_batch_counts(p_batch_id);
    return jsonb_build_object('outcome', 'retryable', 'failure_code', left(failure, 200), 'changed_fields', to_jsonb(changed_fields));
  end if;

  requested_outcome := case
    when jsonb_typeof(import_row.source_row->'warnings') = 'array'
      and jsonb_array_length(import_row.source_row->'warnings') > 0 then 'warning'
    else 'imported'
  end;
  result := coalesce(p_data, '{}'::jsonb) || jsonb_build_object('import_batch_id', p_batch_id);
  if jsonb_array_length(p_segments) > 0 then
    created_shift := public.create_shift_with_staffing_segments(result, p_segments);
  else
    created_shift := public.create_shift(result);
  end if;

  update public.schedule_import_batch_rows
  set outcome = requested_outcome, shift_id = created_shift.id, failure_code = null
  where id = import_row.id and outcome in ('pending', 'retryable');
  if not found then
    raise exception using errcode = 'P0001', message = 'IMPORT_ROW_OUTCOME_CONFLICT';
  end if;
  perform private.sync_schedule_import_batch_counts(p_batch_id);
  return jsonb_build_object('outcome', requested_outcome, 'shift', to_jsonb(created_shift), 'idempotent', false);
end;
$$;

alter function public.create_schedule_import_shift(text, integer, jsonb, jsonb) owner to postgres;
revoke all on function public.create_schedule_import_shift(text, integer, jsonb, jsonb) from public, anon, service_role;
grant execute on function public.create_schedule_import_shift(text, integer, jsonb, jsonb) to authenticated;

comment on function public.create_schedule_import_shift(text, integer, jsonb, jsonb) is
  'Atomically creates an imported shift with segments and its row receipt; identical source replays are skipped and changed source rows are held for authorized manual review without mutating operational history.';
