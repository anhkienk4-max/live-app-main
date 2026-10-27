-- ATT-01 #94 | REVIEW-ONLY data-integrity patch; DO NOT APPLY TO PRODUCTION.
-- Upstream source SHA 6a4d845aee881d2f7e6ef1986633f5dac02923ba.
-- Migration code deliberately lives outside supabase/migrations/.
-- 1) Advisory xact lock guards no-existing-row concurrent staging.
-- 2) Unique index is a hard backstop, fails closed if preexisting duplicates exist.
-- 3) Staff-scoped advisory xact lock serializes cross-batch overlap checks on Confirm DRAFT.
-- All other RPC body and DRAFT semantics are unchanged.
-- Before a separately approved deployment, audit duplicate fingerprint counts without
-- reading personal data, back up, review lock policy and run concurrent PostgreSQL tests.

create unique index if not exists uq_att01_source_fingerprint
  on public.workforce_attendance_import_batches(source_fingerprint);

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

  -- Serialize first-writer races before selecting: FOR UPDATE cannot lock a missing row.
  perform pg_advisory_xact_lock(hashtextextended('att01:source:' || p_source_fingerprint, 0));

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

    -- Other batches have different batch row locks; serialize by staff before overlap check.
    perform pg_advisory_xact_lock(hashtextextended('att01:staff:' || v_row.matched_staff_id, 0));

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
