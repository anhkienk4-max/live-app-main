-- S4A import batch foundation: source file -> batch -> source row -> shift traceability.
-- Additive only. All writes go through SECURITY DEFINER RPCs; RLS select is leader/admin.
-- No hard delete of batches: cancelled previews keep their rows for audit.
-- Overlap is not duplicate: the app-level sameShift semantics are unchanged. DB-level
-- idempotency comes from shifts_active_slot_uidx; a 23505 during confirm is recorded as
-- duplicate_skipped instead of aborting the batch.

create table public.schedule_import_batches (
  id text primary key default gen_random_uuid()::text,
  source text not null,
  source_name text not null,
  status text not null default 'previewed',
  total_rows integer not null default 0,
  valid_rows integer not null default 0,
  invalid_rows integer not null default 0,
  warning_rows integer not null default 0,
  imported_rows integer not null default 0,
  duplicate_rows integer not null default 0,
  failed_rows integer not null default 0,
  retryable_rows integer not null default 0,
  created_by text not null references public.business_users(id) on delete restrict,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  confirmed_at timestamptz null,
  deleted_at timestamptz null,
  deleted_by text null references public.business_users(id) on delete set null,
  deletion_reason text null,
  constraint schedule_import_batches_id_not_blank check (btrim(id) <> ''),
  constraint schedule_import_batches_source_check check (source in ('excel', 'google_sheets')),
  constraint schedule_import_batches_status_check
    check (status in ('previewed', 'confirmed', 'failed', 'cancelled')),
  constraint schedule_import_batches_source_name_not_blank check (btrim(source_name) <> ''),
  constraint schedule_import_batches_counts_nonnegative_check check (
    total_rows >= 0 and valid_rows >= 0 and invalid_rows >= 0 and warning_rows >= 0
    and imported_rows >= 0 and duplicate_rows >= 0 and failed_rows >= 0 and retryable_rows >= 0
  )
);

create table public.schedule_import_batch_rows (
  id text primary key default gen_random_uuid()::text,
  batch_id text not null references public.schedule_import_batches(id) on delete restrict,
  row_number integer not null,
  outcome text not null default 'pending',
  shift_id text null references public.shifts(id) on delete set null,
  source_row jsonb not null,
  failure_code text null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint schedule_import_batch_rows_id_not_blank check (btrim(id) <> ''),
  constraint schedule_import_batch_rows_row_number_check check (row_number >= 1),
  constraint schedule_import_batch_rows_outcome_check check (
    outcome in ('pending', 'imported', 'validation_failed', 'duplicate_skipped', 'warning', 'retryable')
  ),
  constraint schedule_import_batch_rows_shift_link_check check (
    (outcome in ('imported', 'warning') and shift_id is not null)
    or (outcome not in ('imported', 'warning') and shift_id is null)
  ),
  constraint schedule_import_batch_rows_failure_code_check check (
    (outcome = 'retryable' and failure_code is not null)
    or (outcome <> 'retryable' and failure_code is null)
  ),
  constraint schedule_import_batch_rows_failure_code_length_check check (
    failure_code is null or length(failure_code) <= 200
  )
);

create unique index schedule_import_batch_rows_batch_row_uidx
  on public.schedule_import_batch_rows (batch_id, row_number);
create index schedule_import_batch_rows_shift_id_idx
  on public.schedule_import_batch_rows (shift_id) where shift_id is not null;
create index schedule_import_batches_created_at_idx
  on public.schedule_import_batches (created_at desc);

-- Traceability: shifts.import_batch_id now references batches for new writes.
-- NOT VALID keeps historical mock-era values untouched (no full-table revalidation).
alter table public.shifts
  add constraint shifts_import_batch_id_fkey
  foreign key (import_batch_id) references public.schedule_import_batches(id) on delete set null
  not valid;
create index shifts_import_batch_id_idx
  on public.shifts (import_batch_id) where import_batch_id is not null;

create trigger schedule_import_batches_set_updated_at
before update on public.schedule_import_batches
for each row execute function private.set_updated_at();

create trigger schedule_import_batch_rows_set_updated_at
before update on public.schedule_import_batch_rows
for each row execute function private.set_updated_at();

alter table public.schedule_import_batches enable row level security;
alter table public.schedule_import_batch_rows enable row level security;

revoke all on table public.schedule_import_batches from anon, authenticated;
revoke all on table public.schedule_import_batch_rows from anon, authenticated;

grant select on table public.schedule_import_batches to authenticated;
grant select on table public.schedule_import_batch_rows to authenticated;

create policy schedule_import_batches_leader_select
on public.schedule_import_batches
for select
to authenticated
using (
  (select private.current_business_user_is_active())
  and (select private.is_leader_or_admin())
);

create policy schedule_import_batch_rows_leader_select
on public.schedule_import_batch_rows
for select
to authenticated
using (
  (select private.current_business_user_is_active())
  and (select private.is_leader_or_admin())
);

create or replace function private.schedule_import_summary_value(p_summary jsonb, p_key text)
returns integer
language sql
immutable
security invoker
set search_path = ''
as $$
  select greatest(coalesce((p_summary->>p_key)::int, 0), 0);
$$;

revoke all on function private.schedule_import_summary_value(jsonb, text) from public, anon, authenticated;

create or replace function private.insert_schedule_import_batch_rows(p_batch_id text, p_rows jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_index integer;
  v_count integer;
  v_row jsonb;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception using errcode = '22023', message = 'IMPORT_ROWS_INVALID';
  end if;
  v_count := jsonb_array_length(p_rows);
  if v_count > 10000 then
    raise exception using errcode = '22023', message = 'IMPORT_ROWS_LIMIT';
  end if;
  for v_index in 0..v_count - 1 loop
    v_row := p_rows->v_index;
    -- Two separate guards: PL/pgSQL boolean evaluation order is not guaranteed,
    -- so the ::int cast must never run on a non-numeric value.
    if v_row->>'row_number' is null or v_row->>'row_number' !~ '^[0-9]+$' then
      raise exception using errcode = '22023', message = 'IMPORT_ROW_NUMBER_INVALID';
    end if;
    if (v_row->>'row_number')::int < 1 then
      raise exception using errcode = '22023', message = 'IMPORT_ROW_NUMBER_INVALID';
    end if;
    insert into public.schedule_import_batch_rows (batch_id, row_number, source_row)
    values (p_batch_id, (v_row->>'row_number')::int, v_row);
  end loop;
end;
$$;

revoke all on function private.insert_schedule_import_batch_rows(text, jsonb) from public, anon, authenticated;

create or replace function private.sync_schedule_import_batch_counts(p_batch_id text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.schedule_import_batches as batch
  set
    imported_rows = (
      select count(*) from public.schedule_import_batch_rows as import_row
      where import_row.batch_id = batch.id and import_row.outcome in ('imported', 'warning')
    ),
    duplicate_rows = (
      select count(*) from public.schedule_import_batch_rows as import_row
      where import_row.batch_id = batch.id and import_row.outcome = 'duplicate_skipped'
    ),
    failed_rows = (
      select count(*) from public.schedule_import_batch_rows as import_row
      where import_row.batch_id = batch.id and import_row.outcome = 'validation_failed'
    ),
    retryable_rows = (
      select count(*) from public.schedule_import_batch_rows as import_row
      where import_row.batch_id = batch.id and import_row.outcome = 'retryable'
    )
  where batch.id = p_batch_id;
end;
$$;

revoke all on function private.sync_schedule_import_batch_counts(text) from public, anon, authenticated;

create or replace function public.create_schedule_import_batch(
  p_source text,
  p_source_name text,
  p_summary jsonb,
  p_rows jsonb default '[]'::jsonb
)
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
  if p_source not in ('excel', 'google_sheets') then
    raise exception using errcode = '22023', message = 'IMPORT_SOURCE_INVALID';
  end if;
  if p_source_name is null or btrim(p_source_name) = '' then
    raise exception using errcode = '22023', message = 'IMPORT_SOURCE_NAME_REQUIRED';
  end if;
  if p_summary is null or jsonb_typeof(p_summary) <> 'object' then
    raise exception using errcode = '22023', message = 'IMPORT_SUMMARY_INVALID';
  end if;

  insert into public.schedule_import_batches (
    source, source_name, status,
    total_rows, valid_rows, invalid_rows, warning_rows, duplicate_rows,
    created_by
  ) values (
    p_source,
    btrim(p_source_name),
    'previewed',
    private.schedule_import_summary_value(p_summary, 'total_rows'),
    private.schedule_import_summary_value(p_summary, 'valid_rows'),
    private.schedule_import_summary_value(p_summary, 'invalid_rows'),
    private.schedule_import_summary_value(p_summary, 'warning_rows'),
    private.schedule_import_summary_value(p_summary, 'duplicate_rows'),
    v_actor_id
  ) returning * into v_batch;

  perform private.insert_schedule_import_batch_rows(v_batch.id, p_rows);
  select * into v_batch from public.schedule_import_batches where id = v_batch.id;
  return v_batch;
end;
$$;

create or replace function public.update_schedule_import_batch_preview(
  p_batch_id text,
  p_summary jsonb,
  p_rows jsonb default '[]'::jsonb
)
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
  if p_summary is null or jsonb_typeof(p_summary) <> 'object' then
    raise exception using errcode = '22023', message = 'IMPORT_SUMMARY_INVALID';
  end if;

  select * into v_batch from public.schedule_import_batches
  where id = p_batch_id for update;
  if v_batch.id is null then
    raise exception using errcode = 'P0001', message = 'IMPORT_BATCH_NOT_FOUND';
  end if;
  if v_batch.status <> 'previewed' then
    raise exception using errcode = 'P0001', message = 'IMPORT_BATCH_NOT_PREVIEWED';
  end if;
  -- Once any row has a recorded outcome (partial confirm, retry pass), the row
  -- set is audit data: replacing it would destroy shift traceability.
  if exists (
    select 1 from public.schedule_import_batch_rows
    where batch_id = p_batch_id and outcome <> 'pending'
  ) then
    raise exception using errcode = 'P0001', message = 'IMPORT_BATCH_ROWS_ALREADY_RECORDED';
  end if;

  update public.schedule_import_batches
  set
    total_rows = private.schedule_import_summary_value(p_summary, 'total_rows'),
    valid_rows = private.schedule_import_summary_value(p_summary, 'valid_rows'),
    invalid_rows = private.schedule_import_summary_value(p_summary, 'invalid_rows'),
    warning_rows = private.schedule_import_summary_value(p_summary, 'warning_rows'),
    duplicate_rows = private.schedule_import_summary_value(p_summary, 'duplicate_rows')
  where id = p_batch_id;

  -- Preview rows are the editable draft layer only; the guard above ensures
  -- only never-finalized (pending) rows are ever replaced.
  delete from public.schedule_import_batch_rows where batch_id = p_batch_id;
  perform private.insert_schedule_import_batch_rows(p_batch_id, p_rows);

  select * into v_batch from public.schedule_import_batches where id = p_batch_id;
  return v_batch;
end;
$$;

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
  -- 'failed' stays recordable so a retry pass can finish marking rows.
  if v_batch.status not in ('previewed', 'failed') then
    raise exception using errcode = 'P0001', message = 'IMPORT_BATCH_NOT_ACTIVE';
  end if;

  for v_index in 0..v_count - 1 loop
    v_item := p_outcomes->v_index;
    v_outcome := v_item->>'outcome';
    if v_item->>'row_number' is null
      or v_item->>'row_number' !~ '^[0-9]+$'
    then
      raise exception using errcode = '22023', message = 'IMPORT_ROW_NUMBER_INVALID';
    end if;
    if v_outcome not in ('imported', 'validation_failed', 'duplicate_skipped', 'warning', 'retryable') then
      raise exception using errcode = '22023', message = 'IMPORT_OUTCOME_INVALID';
    end if;
    if v_outcome in ('imported', 'warning') and nullif(v_item->>'shift_id', '') is null then
      raise exception using errcode = '22023', message = 'IMPORT_OUTCOME_SHIFT_REQUIRED';
    end if;
    if v_outcome = 'retryable' and nullif(v_item->>'failure_code', '') is null then
      raise exception using errcode = '22023', message = 'IMPORT_OUTCOME_FAILURE_CODE_REQUIRED';
    end if;
    -- A row may only link to a shift that this very batch produced; this keeps
    -- audit traceability honest and prevents linking to arbitrary shifts.
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
      shift_id = nullif(v_item->>'shift_id', ''),
      failure_code = nullif(v_item->>'failure_code', '')
    where batch_id = p_batch_id
      and row_number = (v_item->>'row_number')::int;
    if not found then
      raise exception using errcode = 'P0001', message = 'IMPORT_ROW_NOT_FOUND';
    end if;
  end loop;
end;
$$;

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
  -- 'failed' is confirmable so a retry pass that fixes every retryable row can close the batch.
  if v_batch.status not in ('previewed', 'failed') then
    raise exception using errcode = 'P0001', message = 'IMPORT_BATCH_NOT_ACTIVE';
  end if;

  update public.schedule_import_batches
  set status = 'confirmed',
      confirmed_at = coalesce(confirmed_at, statement_timestamp())
  where id = p_batch_id;
  -- Finalize rows that were never linked: parse-level errors stay
  -- validation_failed, anything else still pending was a duplicate skip.
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

create or replace function public.fail_schedule_import_batch(p_batch_id text)
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
  if v_batch.status not in ('previewed', 'failed') then
    raise exception using errcode = 'P0001', message = 'IMPORT_BATCH_NOT_ACTIVE';
  end if;

  update public.schedule_import_batches
  set status = 'failed'
  where id = p_batch_id;
  perform private.sync_schedule_import_batch_counts(p_batch_id);
  select * into v_batch from public.schedule_import_batches where id = p_batch_id;
  return v_batch;
end;
$$;

create or replace function public.cancel_schedule_import_batch(
  p_batch_id text,
  p_reason text default null
)
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
  -- Confirmed batches must remain in history.
  if v_batch.status not in ('previewed', 'failed') then
    raise exception using errcode = 'P0001', message = 'IMPORT_BATCH_NOT_REMOVABLE';
  end if;

  update public.schedule_import_batches
  set status = 'cancelled',
      deleted_at = statement_timestamp(),
      deleted_by = v_actor_id,
      deletion_reason = nullif(p_reason, '')
  where id = p_batch_id;
  perform private.sync_schedule_import_batch_counts(p_batch_id);
  select * into v_batch from public.schedule_import_batches where id = p_batch_id;
  return v_batch;
end;
$$;

revoke all on function public.create_schedule_import_batch(text, text, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.update_schedule_import_batch_preview(text, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.record_schedule_import_batch_outcomes(text, jsonb) from public, anon, authenticated;
revoke all on function public.confirm_schedule_import_batch(text) from public, anon, authenticated;
revoke all on function public.fail_schedule_import_batch(text) from public, anon, authenticated;
revoke all on function public.cancel_schedule_import_batch(text, text) from public, anon, authenticated;

grant execute on function public.create_schedule_import_batch(text, text, jsonb, jsonb) to authenticated;
grant execute on function public.update_schedule_import_batch_preview(text, jsonb, jsonb) to authenticated;
grant execute on function public.record_schedule_import_batch_outcomes(text, jsonb) to authenticated;
grant execute on function public.confirm_schedule_import_batch(text) to authenticated;
grant execute on function public.fail_schedule_import_batch(text) to authenticated;
grant execute on function public.cancel_schedule_import_batch(text, text) to authenticated;

comment on table public.schedule_import_batches is
  'S4A import batch registry: source file -> batch -> rows -> shifts traceability.';
comment on table public.schedule_import_batch_rows is
  'Per-source-row import outcomes. Pending during preview; finalized at confirm.';
comment on column public.schedule_import_batch_rows.source_row is
  'Canonical preview row snapshot kept for retry and duplicate reconciliation.';
comment on column public.schedule_import_batch_rows.shift_id is
  'Resulting shift for imported/warning rows; future rollback and restore anchor.';
