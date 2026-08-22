-- S4E schedule import recovery/reconciliation hardening.

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
  if v_batch.status not in ('previewed', 'failed') then
    raise exception using errcode = 'P0001', message = 'IMPORT_BATCH_NOT_ACTIVE';
  end if;

  for v_index in 0..v_count - 1 loop
    v_item := p_outcomes->v_index;
    v_outcome := v_item->>'outcome';
    v_expected_outcome := v_item->>'expected_outcome';

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
    if v_outcome in ('imported', 'warning') and nullif(v_item->>'shift_id', '') is null then
      raise exception using errcode = '22023', message = 'IMPORT_OUTCOME_SHIFT_REQUIRED';
    end if;
    if v_outcome = 'retryable' and nullif(v_item->>'failure_code', '') is null then
      raise exception using errcode = '22023', message = 'IMPORT_OUTCOME_FAILURE_CODE_REQUIRED';
    end if;
    select outcome into v_current_outcome
    from public.schedule_import_batch_rows
    where batch_id = p_batch_id
      and row_number = (v_item->>'row_number')::int
    for update;
    if not found then
      raise exception using errcode = 'P0001', message = 'IMPORT_ROW_NOT_FOUND';
    end if;
    if v_current_outcome in ('imported', 'warning', 'duplicate_skipped') then
      raise exception using errcode = 'P0001', message = 'IMPORT_ROW_ALREADY_FINALIZED';
    end if;
    if v_current_outcome <> v_expected_outcome then
      raise exception using errcode = 'P0001', message = 'IMPORT_ROW_OUTCOME_CONFLICT';
    end if;
    if v_outcome in ('imported', 'warning') and not exists (
      select 1 from public.shifts as linked_shift
      where linked_shift.id = nullif(v_item->>'shift_id', '')
        and linked_shift.import_batch_id = p_batch_id
    ) then
      raise exception using errcode = '22023', message = 'IMPORT_OUTCOME_SHIFT_MISMATCH';
    end if;

    update public.schedule_import_batch_rows
    set
      outcome = v_outcome,
      shift_id = case
        when v_outcome in ('imported', 'warning') then nullif(v_item->>'shift_id', '')
        else null
      end,
      failure_code = case
        when v_outcome = 'retryable' then nullif(v_item->>'failure_code', '')
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
  'CAS-protected schedule import row outcomes. Finalized rows are immutable.';
