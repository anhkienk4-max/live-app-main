-- Core V1 P1-C: make schedule-import replay idempotent without weakening the
-- existing row-outcome CAS or the P1-A active-slot uniqueness contract.

create or replace function public.record_schedule_import_batch_outcomes(
  p_batch_id text,
  p_outcomes jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id text;
  v_batch public.schedule_import_batches;
  v_index integer;
  v_count integer;
  v_item jsonb;
  v_outcome text;
  v_expected_outcome text;
  v_current_outcome text;
  v_current_shift_id text;
  v_current_failure_code text;
  v_requested_shift_id text;
  v_requested_failure_code text;
begin
  v_actor_id := private.require_shift_actor(true);
  if p_outcomes is null or jsonb_typeof(p_outcomes) <> 'array' then
    raise exception using errcode = '22023', message = 'IMPORT_OUTCOMES_INVALID';
  end if;
  v_count := jsonb_array_length(p_outcomes);
  if v_count > 10000 then
    raise exception using errcode = '22023', message = 'IMPORT_OUTCOMES_LIMIT';
  end if;

  select * into v_batch from public.schedule_import_batches
  where id = p_batch_id for update;
  if v_batch.id is null then
    raise exception using errcode = 'P0001', message = 'IMPORT_BATCH_NOT_FOUND';
  end if;
  if v_batch.status not in ('previewed', 'failed', 'confirmed') then
    raise exception using errcode = 'P0001', message = 'IMPORT_BATCH_NOT_ACTIVE';
  end if;

  for v_index in 0..v_count - 1 loop
    v_item := p_outcomes->v_index;
    v_outcome := v_item->>'outcome';
    v_expected_outcome := v_item->>'expected_outcome';
    v_requested_shift_id := nullif(v_item->>'shift_id', '');
    v_requested_failure_code := nullif(v_item->>'failure_code', '');

    if v_item->>'row_number' is null
      or v_item->>'row_number' !~ '^[0-9]+$'
    then
      raise exception using errcode = '22023', message = 'IMPORT_ROW_NUMBER_INVALID';
    end if;
    if v_outcome not in ('imported', 'validation_failed', 'duplicate_skipped', 'warning', 'retryable') then
      raise exception using errcode = '22023', message = 'IMPORT_OUTCOME_INVALID';
    end if;
    if v_expected_outcome not in ('pending', 'validation_failed', 'retryable') then
      raise exception using errcode = '22023', message = 'IMPORT_EXPECTED_OUTCOME_INVALID';
    end if;
    if v_outcome in ('imported', 'warning') and v_requested_shift_id is null then
      raise exception using errcode = '22023', message = 'IMPORT_OUTCOME_SHIFT_REQUIRED';
    end if;
    if v_outcome = 'retryable' and v_requested_failure_code is null then
      raise exception using errcode = '22023', message = 'IMPORT_OUTCOME_FAILURE_CODE_REQUIRED';
    end if;

    select outcome, shift_id, failure_code
      into v_current_outcome, v_current_shift_id, v_current_failure_code
    from public.schedule_import_batch_rows
    where batch_id = p_batch_id
      and row_number = (v_item->>'row_number')::int
    for update;
    if not found then
      raise exception using errcode = 'P0001', message = 'IMPORT_ROW_NOT_FOUND';
    end if;

    -- A replay of the same finalized result is a successful no-op. This is
    -- what lets two confirmations race safely after one already recorded the
    -- row. Duplicate-skipped rows intentionally have no persisted shift link;
    -- the incoming candidate link is therefore ignored for this comparison.
    if v_current_outcome in ('imported', 'warning', 'duplicate_skipped') then
      if v_current_outcome = v_outcome
        and (
          v_current_outcome = 'duplicate_skipped'
          or v_current_shift_id = v_requested_shift_id
        )
        and v_current_failure_code is null
      then
        continue;
      end if;
      raise exception using errcode = 'P0001', message = 'IMPORT_ROW_ALREADY_FINALIZED';
    end if;

    -- A confirmed batch is immutable except for the idempotent finalized-row
    -- replay above. Any unresolved row is a real lifecycle conflict.
    if v_batch.status = 'confirmed' then
      raise exception using errcode = 'P0001', message = 'IMPORT_BATCH_NOT_ACTIVE';
    end if;
    if v_current_outcome <> v_expected_outcome then
      raise exception using errcode = 'P0001', message = 'IMPORT_ROW_OUTCOME_CONFLICT';
    end if;
    if v_outcome in ('imported', 'warning') and not exists (
      select 1 from public.shifts as linked_shift
      where linked_shift.id = v_requested_shift_id
        and linked_shift.import_batch_id = p_batch_id
    ) then
      raise exception using errcode = '22023', message = 'IMPORT_OUTCOME_SHIFT_MISMATCH';
    end if;

    update public.schedule_import_batch_rows
    set
      outcome = v_outcome,
      shift_id = case
        when v_outcome in ('imported', 'warning') then v_requested_shift_id
        else null
      end,
      failure_code = case
        when v_outcome = 'retryable' then v_requested_failure_code
        else null
      end
    where batch_id = p_batch_id
      and row_number = (v_item->>'row_number')::int
      and outcome = v_expected_outcome;
    if not found then
      raise exception using errcode = 'P0001', message = 'IMPORT_ROW_OUTCOME_CONFLICT';
    end if;
  end loop;
end;
$$;

revoke all on function public.record_schedule_import_batch_outcomes(text, jsonb)
  from public, anon, authenticated;
grant execute on function public.record_schedule_import_batch_outcomes(text, jsonb)
  to authenticated;

comment on function public.record_schedule_import_batch_outcomes(text, jsonb) is
  'CAS-protected schedule import outcomes with idempotent finalized-row replay.';

create or replace function public.confirm_schedule_import_batch(p_batch_id text)
returns public.schedule_import_batches
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor_id text;
  v_batch public.schedule_import_batches;
begin
  v_actor_id := private.require_shift_actor(true);
  select * into v_batch from public.schedule_import_batches
  where id = p_batch_id for update;
  if v_batch.id is null then
    raise exception using errcode = 'P0001', message = 'IMPORT_BATCH_NOT_FOUND';
  end if;

  -- Confirmation is safe to replay. The first call performs the existing
  -- pending-row finalization; later calls only return the persisted batch and
  -- never create or relink operational shifts.
  if v_batch.status = 'confirmed' then
    if exists (
      select 1
      from public.schedule_import_batch_rows
      where batch_id = p_batch_id
        and outcome in ('pending', 'retryable')
    ) then
      raise exception using errcode = 'P0001', message = 'IMPORT_BATCH_UNRESOLVED_ROWS';
    end if;
    perform private.sync_schedule_import_batch_counts(p_batch_id);
    select * into v_batch from public.schedule_import_batches where id = p_batch_id;
    return v_batch;
  end if;
  if v_batch.status not in ('previewed', 'failed') then
    raise exception using errcode = 'P0001', message = 'IMPORT_BATCH_NOT_ACTIVE';
  end if;

  if exists (
    select 1
    from public.schedule_import_batch_rows
    where batch_id = p_batch_id
      and outcome in ('retryable', 'pending')
      and (
        outcome = 'retryable'
        or coalesce(
          case when jsonb_typeof(source_row->'errors') = 'array'
            then jsonb_array_length(source_row->'errors') else 0 end,
          0
        ) = 0
      )
  ) then
    raise exception using errcode = 'P0001', message = 'IMPORT_BATCH_UNRESOLVED_ROWS';
  end if;

  update public.schedule_import_batches
  set status = 'confirmed',
      confirmed_at = coalesce(confirmed_at, statement_timestamp())
  where id = p_batch_id;
  update public.schedule_import_batch_rows
  set outcome = case
    when coalesce(
      case when jsonb_typeof(source_row->'errors') = 'array'
        then jsonb_array_length(source_row->'errors') else 0 end,
      0
    ) > 0 then 'validation_failed'
    else 'duplicate_skipped'
  end
  where batch_id = p_batch_id and outcome = 'pending';
  perform private.sync_schedule_import_batch_counts(p_batch_id);
  select * into v_batch from public.schedule_import_batches where id = p_batch_id;
  return v_batch;
end;
$$;

revoke all on function public.confirm_schedule_import_batch(text)
  from public, anon, authenticated;
grant execute on function public.confirm_schedule_import_batch(text)
  to authenticated;

comment on function public.confirm_schedule_import_batch(text) is
  'Idempotent schedule import confirmation; replay returns the existing batch.';
