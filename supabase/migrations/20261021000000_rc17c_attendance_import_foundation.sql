-- RC1.7C: Historical Attendance Import Staging & Provenance Ledger
-- TARGET ENVIRONMENT: LOCAL / STAGING TEST FIXTURES ONLY.
-- DO NOT RUN ON PRODUCTION WITHOUT EXPLICIT AUTHORIZATION.

-- 1. Create table for Attendance Import Batches
create table if not exists public.workforce_attendance_import_batches (
  id text primary key default gen_random_uuid()::text,
  source_type text not null check (source_type in ('google_sheets', 'excel_upload', 'csv_upload', 'shift_manager_control')),
  source_name text not null,
  source_fingerprint text not null, -- SHA-256 hash of raw input content for idempotency
  brand_id text references public.brands(id) on delete restrict,
  timezone text not null default 'Asia/Ho_Chi_Minh',
  status text not null default 'draft' check (status in ('draft', 'staged', 'confirmed', 'failed', 'cancelled')),
  total_rows integer not null default 0 check (total_rows >= 0),
  matched_rows integer not null default 0 check (matched_rows >= 0),
  exception_rows integer not null default 0 check (exception_rows >= 0),
  drafted_segments integer not null default 0 check (drafted_segments >= 0),
  metadata jsonb not null default '{}'::jsonb,
  created_by text not null references public.business_users(id),
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  version integer not null default 1 check (version >= 1)
);

create index if not exists idx_attendance_import_batches_fingerprint
  on public.workforce_attendance_import_batches (source_fingerprint);

-- 2. Create table for Attendance Import Rows (Row-level Provenance)
create table if not exists public.workforce_attendance_import_rows (
  id text primary key default gen_random_uuid()::text,
  batch_id text not null references public.workforce_attendance_import_batches(id) on delete cascade,
  source_row_number integer not null check (source_row_number > 0),
  raw_payload jsonb not null,
  parsed_date date,
  parsed_start_time text,
  parsed_end_time text,
  parsed_start_at timestamptz,
  parsed_end_at timestamptz,
  raw_staff_name text,
  raw_role text,
  raw_notes text,
  matched_shift_id text references public.shifts(id) on delete set null,
  matched_staff_id text references public.business_users(id) on delete set null,
  operational_role text check (operational_role in ('host', 'support', 'technical')),
  coverage_kind text not null default 'planned' check (coverage_kind in ('planned', 'cover', 'replacement', 'extra')),
  evidence_kind text not null check (evidence_kind in ('actual_punch', 'supervisor_verified', 'missing_evidence')),
  status text not null default 'pending' check (status in ('pending', 'matched', 'exception', 'drafted', 'rejected')),
  exception_code text check (exception_code in (
    'SHIFT_NOT_FOUND',
    'STAFF_NOT_FOUND',
    'ROLE_AMBIGUOUS',
    'MISSING_EVIDENCE',
    'SHIFT_NOT_COMPLETED',
    'TIME_RANGE_INVALID',
    'OVERLAP_CONFLICT',
    'UNRESOLVED_PASS',
    'AMBIGUOUS_DATE_ORDER',
    'WEEKDAY_MISMATCH',
    'INVALID_CONTROL_STRUCTURE'
  )),
  exception_detail text,
  resulting_segment_id text references public.workforce_actual_segments(id) on delete set null,
  created_at timestamptz not null default statement_timestamp(),
  updated_at timestamptz not null default statement_timestamp(),
  constraint attendance_import_row_unique unique (batch_id, source_row_number)
);

create index if not exists idx_attendance_import_rows_batch_status
  on public.workforce_attendance_import_rows (batch_id, status);

create index if not exists idx_attendance_import_rows_shift
  on public.workforce_attendance_import_rows (matched_shift_id);

create index if not exists idx_attendance_import_rows_staff
  on public.workforce_attendance_import_rows (matched_staff_id);

-- 3. Row Level Security & RBAC
alter table public.workforce_attendance_import_batches enable row level security;
alter table public.workforce_attendance_import_rows enable row level security;

-- Service Role full access
drop policy if exists workforce_attendance_batches_service_role on public.workforce_attendance_import_batches;
create policy workforce_attendance_batches_service_role
  on public.workforce_attendance_import_batches
  for all to service_role using (true) with check (true);

drop policy if exists workforce_attendance_rows_service_role on public.workforce_attendance_import_rows;
create policy workforce_attendance_rows_service_role
  on public.workforce_attendance_import_rows
  for all to service_role using (true) with check (true);

-- Authenticated Admin and Leader access
drop policy if exists workforce_attendance_batches_admin_leader on public.workforce_attendance_import_batches;
create policy workforce_attendance_batches_admin_leader
  on public.workforce_attendance_import_batches
  for all to authenticated
  using (
    exists (
      select 1 from public.business_users bu
      where bu.auth_user_id = auth.uid()
        and bu.system_permission in ('admin', 'leader')
        and bu.status = 'active'
    )
  )
  with check (
    exists (
      select 1 from public.business_users bu
      where bu.auth_user_id = auth.uid()
        and bu.system_permission in ('admin', 'leader')
        and bu.status = 'active'
    )
  );

drop policy if exists workforce_attendance_rows_admin_leader on public.workforce_attendance_import_rows;
create policy workforce_attendance_rows_admin_leader
  on public.workforce_attendance_import_rows
  for all to authenticated
  using (
    exists (
      select 1 from public.business_users bu
      where bu.auth_user_id = auth.uid()
        and bu.system_permission in ('admin', 'leader')
        and bu.status = 'active'
    )
  )
  with check (
    exists (
      select 1 from public.business_users bu
      where bu.auth_user_id = auth.uid()
        and bu.system_permission in ('admin', 'leader')
        and bu.status = 'active'
    )
  );

-- 4. Atomic Staging RPC Function
create or replace function public.stage_attendance_import_batch(
  p_batch_id text,
  p_source_type text,
  p_source_name text,
  p_source_fingerprint text,
  p_timezone text,
  p_brand_id text,
  p_metadata jsonb,
  p_actor_id text,
  p_total_rows integer,
  p_matched_rows integer,
  p_exception_rows integer,
  p_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_existing public.workforce_attendance_import_batches;
  v_actor public.business_users;
  v_target_batch_id text;
  v_row jsonb;
begin
  -- 1. Check actor permissions
  select * into v_actor from public.business_users
  where id = p_actor_id and status = 'active';

  if v_actor.id is null or v_actor.system_permission not in ('admin', 'leader') then
    raise exception using errcode = '42501', message = 'FORBIDDEN_ATTENDANCE_ACTION';
  end if;

  -- 2. Concurrency lock on fingerprint
  select * into v_existing
  from public.workforce_attendance_import_batches
  where source_fingerprint = p_source_fingerprint
  for update;

  if v_existing.id is not null and v_existing.status = 'confirmed' then
    return jsonb_build_object(
      'ok', false,
      'code', 'BATCH_ALREADY_CONFIRMED',
      'batch_id', v_existing.id,
      'message', 'Nguồn dữ liệu này đã được xác nhận trước đó (Batch #' || v_existing.id || '). Không thể nhập trùng lặp.'
    );
  end if;

  if v_existing.id is not null and v_existing.status = 'staged' then
    v_target_batch_id := v_existing.id;
    -- Atomic re-staging: replace staged rows in single transaction
    delete from public.workforce_attendance_import_rows where batch_id = v_target_batch_id;

    update public.workforce_attendance_import_batches
    set total_rows = p_total_rows,
        matched_rows = p_matched_rows,
        exception_rows = p_exception_rows,
        metadata = coalesce(p_metadata, '{}'::jsonb),
        version = v_existing.version + 1,
        updated_at = statement_timestamp()
    where id = v_target_batch_id;
  else
    v_target_batch_id := coalesce(p_batch_id, gen_random_uuid()::text);
    insert into public.workforce_attendance_import_batches (
      id,
      source_type,
      source_name,
      source_fingerprint,
      timezone,
      brand_id,
      status,
      total_rows,
      matched_rows,
      exception_rows,
      drafted_segments,
      metadata,
      created_by,
      version
    ) values (
      v_target_batch_id,
      p_source_type,
      p_source_name,
      p_source_fingerprint,
      coalesce(p_timezone, 'Asia/Ho_Chi_Minh'),
      p_brand_id,
      'staged',
      p_total_rows,
      p_matched_rows,
      p_exception_rows,
      0,
      coalesce(p_metadata, '{}'::jsonb),
      p_actor_id,
      1
    );
  end if;

  -- Insert rows in batch
  for v_row in select * from jsonb_array_elements(p_rows)
  loop
    insert into public.workforce_attendance_import_rows (
      batch_id,
      source_row_number,
      raw_payload,
      parsed_date,
      parsed_start_time,
      parsed_end_time,
      parsed_start_at,
      parsed_end_at,
      raw_staff_name,
      raw_role,
      raw_notes,
      matched_shift_id,
      matched_staff_id,
      operational_role,
      coverage_kind,
      evidence_kind,
      status,
      exception_code,
      exception_detail
    ) values (
      v_target_batch_id,
      (v_row->>'source_row_number')::integer,
      coalesce(v_row->'raw_payload', '{}'::jsonb),
      (v_row->>'parsed_date')::date,
      v_row->>'parsed_start_time',
      v_row->>'parsed_end_time',
      (v_row->>'parsed_start_at')::timestamptz,
      (v_row->>'parsed_end_at')::timestamptz,
      v_row->>'raw_staff_name',
      v_row->>'raw_role',
      v_row->>'raw_notes',
      v_row->>'matched_shift_id',
      v_row->>'matched_staff_id',
      v_row->>'operational_role',
      coalesce(v_row->>'coverage_kind', 'planned'),
      coalesce(v_row->>'evidence_kind', 'missing_evidence'),
      coalesce(v_row->>'status', 'pending'),
      v_row->>'exception_code',
      v_row->>'exception_detail'
    );
  end loop;

  return jsonb_build_object(
    'ok', true,
    'batch_id', v_target_batch_id,
    'status', 'staged',
    'total_rows', p_total_rows,
    'matched_rows', p_matched_rows,
    'exception_rows', p_exception_rows
  );
end;
$$;

-- 5. Atomic Batch Confirmation RPC Function
create or replace function public.confirm_attendance_import_batch(
  p_batch_id text,
  p_actor_id text,
  p_expected_version integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_batch public.workforce_attendance_import_batches;
  v_actor public.business_users;
  v_row record;
  v_shift public.shifts;
  v_staff public.business_users;
  v_segment_id text;
  v_created_count integer := 0;
  v_reconciled_count integer := 0;
  v_skipped_count integer := 0;
  v_has_overlap boolean;
begin
  -- 1. Verify actor permissions
  select * into v_actor from public.business_users
  where id = p_actor_id and status = 'active';

  if v_actor.id is null or v_actor.system_permission not in ('admin', 'leader') then
    raise exception using errcode = '42501', message = 'FORBIDDEN_ATTENDANCE_ACTION';
  end if;

  -- 2. Concurrency Lock: Lock batch row FOR UPDATE
  select * into v_batch from public.workforce_attendance_import_batches
  where id = p_batch_id
  for update;

  if v_batch.id is null then
    raise exception using errcode = 'P0002', message = 'IMPORT_BATCH_NOT_FOUND';
  end if;

  -- 3. Idempotent / Replay Protection
  if v_batch.status = 'confirmed' then
    return jsonb_build_object(
      'ok', false,
      'code', 'BATCH_ALREADY_CONFIRMED',
      'batch_id', p_batch_id,
      'message', 'Batch has already been confirmed'
    );
  end if;

  if v_batch.status <> 'staged' then
    raise exception using errcode = 'P0001', message = 'IMPORT_BATCH_NOT_STAGED';
  end if;

  -- 4. Optimistic Version CAS check
  if p_expected_version is not null and v_batch.version <> p_expected_version then
    raise exception using errcode = 'P0001', message = 'BATCH_VERSION_MISMATCH';
  end if;

  -- 5. Atomic Row-by-Row Re-verification and Insert
  for v_row in
    select * from public.workforce_attendance_import_rows
    where batch_id = p_batch_id and status = 'matched'
    order by source_row_number
    for update
  loop
    v_reconciled_count := v_reconciled_count + 1;

    -- 5a. Verify Shift is still completed
    select * into v_shift from public.shifts
    where id = v_row.matched_shift_id and status = 'completed';

    if v_shift.id is null then
      update public.workforce_attendance_import_rows
      set status = 'exception',
          exception_code = 'SHIFT_NOT_COMPLETED',
          exception_detail = 'Shift is not completed or does not exist',
          updated_at = statement_timestamp()
      where id = v_row.id;
      v_skipped_count := v_skipped_count + 1;
      continue;
    end if;

    -- 5b. Verify Staff is still active
    select * into v_staff from public.business_users
    where id = v_row.matched_staff_id and status = 'active';

    if v_staff.id is null then
      update public.workforce_attendance_import_rows
      set status = 'exception',
          exception_code = 'STAFF_NOT_FOUND',
          exception_detail = 'Staff is not active or does not exist',
          updated_at = statement_timestamp()
      where id = v_row.id;
      v_skipped_count := v_skipped_count + 1;
      continue;
    end if;

    -- 5c. Overlap Check with existing actual segments
    select exists (
      select 1 from public.workforce_actual_segments was
      where was.staff_id = v_row.matched_staff_id
        and was.review_status in ('draft', 'approved')
        and was.actual_start_at is not null
        and was.actual_end_at is not null
        and (v_row.resulting_segment_id is null or was.id <> v_row.resulting_segment_id)
        and greatest(v_row.parsed_start_at, was.actual_start_at) < least(v_row.parsed_end_at, was.actual_end_at)
    ) into v_has_overlap;

    if v_has_overlap then
      update public.workforce_attendance_import_rows
      set status = 'exception',
          exception_code = 'OVERLAP_CONFLICT',
          exception_detail = 'Actual work interval overlaps with an existing segment',
          updated_at = statement_timestamp()
      where id = v_row.id;
      v_skipped_count := v_skipped_count + 1;
      continue;
    end if;

    -- 5d. Insert into workforce_actual_segments as DRAFT (Independent 4-eyes review)
    insert into public.workforce_actual_segments (
      shift_id,
      staff_id,
      operational_role,
      event_kind,
      coverage_kind,
      actual_start_at,
      actual_end_at,
      review_status,
      evidence_note,
      created_by,
      reviewed_by,
      reviewed_at,
      review_note
    ) values (
      v_row.matched_shift_id,
      v_row.matched_staff_id,
      v_row.operational_role,
      'worked',
      coalesce(v_row.coverage_kind, 'planned'),
      v_row.parsed_start_at,
      v_row.parsed_end_at,
      'draft',
      substring('Imported from staged batch #' || p_batch_id || ' row ' || v_row.source_row_number || ': ' || coalesce(v_row.raw_notes, 'Xác nhận chấm công hợp lệ') from 1 for 2000),
      p_actor_id,
      null,
      null,
      null
    ) returning id into v_segment_id;

    -- 5e. Update row provenance
    update public.workforce_attendance_import_rows
    set status = 'drafted',
        resulting_segment_id = v_segment_id,
        updated_at = statement_timestamp()
    where id = v_row.id;

    v_created_count := v_created_count + 1;
  end loop;

  -- 6. Update Batch status to confirmed with atomic version increment
  update public.workforce_attendance_import_batches
  set status = 'confirmed',
      drafted_segments = v_created_count,
      version = v_batch.version + 1,
      updated_at = statement_timestamp()
  where id = p_batch_id;

  return jsonb_build_object(
    'ok', true,
    'batch_id', p_batch_id,
    'created_count', v_created_count,
    'reconciled_count', v_reconciled_count,
    'skipped_count', v_skipped_count,
    'version', v_batch.version + 1,
    'message', 'Đã tạo ' || v_created_count || ' bản ghi Actual Staffing (DRAFT) từ batch #' || p_batch_id || ' chờ kiểm duyệt độc lập'
  );
end;
$$;

-- These SECURITY DEFINER RPCs accept p_actor_id and must never be callable
-- with a user-controlled authenticated token. The only production caller is
-- the server-side attendance-import API, after requireRole(admin/leader),
-- using createSupabaseAdminClient (service_role). Direct PostgREST calls
-- from anon/authenticated users must be denied independently of table RLS.
revoke all on function public.stage_attendance_import_batch(text,text,text,text,text,text,jsonb,text,integer,integer,integer,jsonb) from public, anon, authenticated;
revoke all on function public.confirm_attendance_import_batch(text,text,integer) from public, anon, authenticated;
grant execute on function public.stage_attendance_import_batch(text,text,text,text,text,text,jsonb,text,integer,integer,integer,jsonb) to service_role;
grant execute on function public.confirm_attendance_import_batch(text,text,integer) to service_role;
