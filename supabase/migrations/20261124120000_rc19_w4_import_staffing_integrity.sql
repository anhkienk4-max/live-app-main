-- RC19 W4 Task B: Import Staffing Counts & Data Integrity
-- Isolated from Task A Attendance schema/handlers and backward-compatible with
-- 4-arg create_schedule_import_shift and 7-col get_shift_staffing_summary.

BEGIN;

DO $guard$
BEGIN
  IF to_regclass('public.shifts') IS NULL
    OR to_regclass('public.shift_staffing_segments') IS NULL
    OR to_regclass('public.shift_registrations') IS NULL
    OR to_regclass('public.schedule_import_batches') IS NULL
    OR to_regclass('public.schedule_import_batch_rows') IS NULL
    OR to_regprocedure('private.require_shift_actor(boolean)') IS NULL
    OR to_regprocedure('private.c511_replace_shift_segments(text,jsonb)') IS NULL
    OR to_regprocedure('private.refresh_shift_registration_lock(text,boolean)') IS NULL
    OR to_regprocedure('private.assert_shift_staffing_consistent(public.shifts)') IS NULL
    OR to_regprocedure('private.sync_schedule_import_batch_counts(text)') IS NULL
    OR to_regprocedure('private.can_read_shift(text)') IS NULL
    OR to_regprocedure('public.rbac01_effective_permission(text)') IS NULL
    OR to_regprocedure('private.rc19_has_any_leader_brand_scope(text,text[])') IS NULL
    OR to_regprocedure('public.get_shift_staffing_summary(text[])') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'W4_TASKB_BASELINE_PRECONDITION_FAILED';
  END IF;
END;
$guard$;

-- 1. Upgrade private.c511_replace_shift_segments to preserve stable segment IDs,
-- guard approved capacities & time/deletion conflicts, and prevent orphan links.
CREATE OR REPLACE FUNCTION private.c511_replace_shift_segments(
  p_shift_id text,
  p_segments jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_id text := private.require_shift_actor(true);
  target public.shifts%ROWTYPE;
  item jsonb;
  i integer;
  j integer;
  seg_total integer := 0;
  v_idx integer[] := '{}';
  v_start_at timestamptz[] := '{}';
  v_end_at timestamptz[] := '{}';
  v_host smallint[] := '{}';
  v_support smallint[] := '{}';
  v_tech smallint[] := '{}';
  v_host_names jsonb[] := '{}';
  v_support_names jsonb[] := '{}';
  v_tech_names jsonb[] := '{}';
  v_matched_id text[] := '{}';
  v_keep_ids text[] := '{}';

  segment_no integer;
  start_time time;
  end_time time;
  start_date date;
  end_date date;
  start_value timestamptz;
  end_value timestamptz;
  host_count smallint;
  support_count smallint;
  technical_count smallint;
  existing_seg public.shift_staffing_segments%ROWTYPE;
  matched_seg_id text;
  app_host integer;
  app_support integer;
  app_tech integer;
  host_names_arr text[];
  support_names_arr text[];
  technical_names_arr text[];
BEGIN
  IF p_segments IS NULL OR jsonb_typeof(p_segments) <> 'array' OR jsonb_array_length(p_segments) > 100 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'STAFFING_SEGMENTS_INVALID';
  END IF;

  SELECT * INTO target
  FROM public.shifts
  WHERE id = p_shift_id AND deleted_at IS NULL AND archived_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'SHIFT_NOT_FOUND';
  END IF;

  IF NOT public.rbac01_effective_permission('shifts.edit') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'OPERATION_NOT_ALLOWED';
  END IF;
  IF private.current_system_permission() = 'leader'
    AND NOT private.rc19_has_any_leader_brand_scope(target.brand_id, ARRAY['shifts.manage']::text[]) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'OPERATION_NOT_ALLOWED';
  END IF;

  -- Prevent orphaning active unsegmented registrations when introducing segments.
  IF jsonb_array_length(p_segments) > 0
    AND NOT EXISTS (SELECT 1 FROM public.shift_staffing_segments WHERE shift_id = p_shift_id)
    AND EXISTS (
      SELECT 1 FROM public.shift_registrations r
      WHERE r.shift_id = p_shift_id
        AND r.staffing_segment_id IS NULL
        AND r.status IN ('pending', 'approved', 'manually_assigned')
    ) THEN
    RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'STAFFING_SEGMENT_STRUCTURE_CHANGE_CONFLICT';
  END IF;

  -- Parse & validate all incoming segments before mutating any persisted row.
  FOR item IN SELECT value FROM jsonb_array_elements(p_segments) LOOP
    IF jsonb_typeof(item) <> 'object'
      OR EXISTS (
        SELECT 1 FROM jsonb_object_keys(item) k
        WHERE k NOT IN (
          'segment_index', 'start_time', 'end_time',
          'required_host_count', 'required_support_count', 'required_technical_count',
          'planned_host_names', 'planned_support_names', 'planned_technical_names'
        )
      ) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'STAFFING_SEGMENT_FIELDS_INVALID';
    END IF;

    segment_no := (item->>'segment_index')::integer;
    start_time := (item->>'start_time')::time;
    end_time := (item->>'end_time')::time;
    host_count := (item->>'required_host_count')::smallint;
    support_count := (item->>'required_support_count')::smallint;
    technical_count := (item->>'required_technical_count')::smallint;

    IF segment_no IS NULL OR segment_no < 1 OR segment_no > 100
      OR segment_no = ANY(v_idx)
      OR host_count IS NULL OR support_count IS NULL OR technical_count IS NULL
      OR host_count NOT BETWEEN 0 AND 100
      OR support_count NOT BETWEEN 0 AND 100
      OR technical_count NOT BETWEEN 0 AND 100 THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'STAFFING_SEGMENT_VALUE_INVALID';
    END IF;

    IF jsonb_typeof(coalesce(item->'planned_host_names', '[]'::jsonb)) <> 'array'
      OR jsonb_typeof(coalesce(item->'planned_support_names', '[]'::jsonb)) <> 'array'
      OR jsonb_typeof(coalesce(item->'planned_technical_names', '[]'::jsonb)) <> 'array'
      OR jsonb_array_length(coalesce(item->'planned_host_names', '[]'::jsonb)) > 100
      OR jsonb_array_length(coalesce(item->'planned_support_names', '[]'::jsonb)) > 100
      OR jsonb_array_length(coalesce(item->'planned_technical_names', '[]'::jsonb)) > 100
      OR EXISTS (
        SELECT 1 FROM jsonb_array_elements(coalesce(item->'planned_host_names', '[]'::jsonb)) n
        WHERE jsonb_typeof(n) <> 'string' OR length(n#>>'{}') > 120
      )
      OR EXISTS (
        SELECT 1 FROM jsonb_array_elements(coalesce(item->'planned_support_names', '[]'::jsonb)) n
        WHERE jsonb_typeof(n) <> 'string' OR length(n#>>'{}') > 120
      )
      OR EXISTS (
        SELECT 1 FROM jsonb_array_elements(coalesce(item->'planned_technical_names', '[]'::jsonb)) n
        WHERE jsonb_typeof(n) <> 'string' OR length(n#>>'{}') > 120
      ) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'STAFFING_SEGMENT_NAMES_INVALID';
    END IF;

    start_date := target.date + CASE WHEN start_time < target.start_time THEN 1 ELSE 0 END;
    end_date := start_date + CASE WHEN end_time <= start_time THEN 1 ELSE 0 END;
    start_value := (start_date + start_time) AT TIME ZONE 'Asia/Ho_Chi_Minh';
    end_value := (end_date + end_time) AT TIME ZONE 'Asia/Ho_Chi_Minh';

    IF start_value < target.start_at OR end_value > target.end_at OR end_value <= start_value THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'STAFFING_SEGMENT_OUTSIDE_SHIFT';
    END IF;

    -- Reject overlapping incoming segments using half-open [start, end)
    IF seg_total > 0 THEN
      FOR i IN 1 .. seg_total LOOP
        IF tstzrange(v_start_at[i], v_end_at[i], '[)') && tstzrange(start_value, end_value, '[)') THEN
          RAISE EXCEPTION USING ERRCODE = '23P01', MESSAGE = 'STAFFING_SEGMENTS_OVERLAP';
        END IF;
      END LOOP;
    END IF;

    seg_total := seg_total + 1;
    v_idx := array_append(v_idx, segment_no);
    v_start_at := array_append(v_start_at, start_value);
    v_end_at := array_append(v_end_at, end_value);
    v_host := array_append(v_host, host_count);
    v_support := array_append(v_support, support_count);
    v_tech := array_append(v_tech, technical_count);
    v_host_names := array_append(v_host_names, coalesce(item->'planned_host_names', '[]'::jsonb));
    v_support_names := array_append(v_support_names, coalesce(item->'planned_support_names', '[]'::jsonb));
    v_tech_names := array_append(v_tech_names, coalesce(item->'planned_technical_names', '[]'::jsonb));
    v_matched_id := array_append(v_matched_id, NULL::text);
  END LOOP;

  -- Lock all existing segments on this shift deterministically
  -- Match pass 1: exact business window (start_at, end_at) preserves ID regardless of renumbering.
  IF seg_total > 0 THEN
    FOR i IN 1 .. seg_total LOOP
      SELECT s.id INTO matched_seg_id
      FROM public.shift_staffing_segments s
      WHERE s.shift_id = p_shift_id
        AND s.start_at = v_start_at[i]
        AND s.end_at = v_end_at[i]
      ORDER BY s.segment_index, s.id
      LIMIT 1
      FOR UPDATE;
      IF FOUND THEN
        v_matched_id[i] := matched_seg_id;
        v_keep_ids := array_append(v_keep_ids, matched_seg_id);
      END IF;
    END LOOP;
  END IF;

  -- Audit unmatched existing segments (time modified or deleted)
  FOR existing_seg IN
    SELECT * FROM public.shift_staffing_segments s
    WHERE s.shift_id = p_shift_id
      AND NOT (s.id = ANY(v_keep_ids))
    ORDER BY s.segment_index, s.id
    FOR UPDATE
  LOOP
    IF EXISTS (
      SELECT 1 FROM public.shift_registrations r
      WHERE r.staffing_segment_id = existing_seg.id
    ) THEN
      IF existing_seg.segment_index = ANY(v_idx) THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'STAFFING_SEGMENT_TIME_CHANGE_CONFLICT';
      ELSE
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'STAFFING_SEGMENT_DELETE_CONFLICT';
      END IF;
    END IF;
  END LOOP;

  -- Check approved capacity lower bounds on every kept existing segment BEFORE writing.
  IF seg_total > 0 THEN
    FOR i IN 1 .. seg_total LOOP
      IF v_matched_id[i] IS NULL THEN
        CONTINUE;
      END IF;
      SELECT
        count(*) FILTER (WHERE r.operational_role = 'host' AND r.status IN ('approved', 'manually_assigned'))::integer,
        count(*) FILTER (WHERE r.operational_role = 'support' AND r.status IN ('approved', 'manually_assigned'))::integer,
        count(*) FILTER (WHERE r.operational_role = 'technical' AND r.status IN ('approved', 'manually_assigned'))::integer
      INTO app_host, app_support, app_tech
      FROM public.shift_registrations r
      WHERE r.staffing_segment_id = v_matched_id[i];

      IF v_host[i] < app_host THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
          MESSAGE = pg_catalog.format('STAFFING_CAPACITY_BELOW_APPROVED_COUNT:host:approved=%s:requested=%s', app_host, v_host[i]);
      END IF;
      IF v_support[i] < app_support THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
          MESSAGE = pg_catalog.format('STAFFING_CAPACITY_BELOW_APPROVED_COUNT:support:approved=%s:requested=%s', app_support, v_support[i]);
      END IF;
      IF v_tech[i] < app_tech THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
          MESSAGE = pg_catalog.format('STAFFING_CAPACITY_BELOW_APPROVED_COUNT:technical:approved=%s:requested=%s', app_tech, v_tech[i]);
      END IF;
    END LOOP;
  END IF;

  -- Match pass 2: any still-unmatched incoming slot can reuse an empty existing row on same index
  -- when no registration references that row, otherwise empty unmatched rows are deleted cleanly.
  IF seg_total > 0 THEN
    FOR i IN 1 .. seg_total LOOP
      IF v_matched_id[i] IS NOT NULL THEN
        CONTINUE;
      END IF;
      SELECT s.id INTO matched_seg_id
      FROM public.shift_staffing_segments s
      WHERE s.shift_id = p_shift_id
        AND s.segment_index = v_idx[i]
        AND NOT (s.id = ANY(v_keep_ids))
        AND NOT EXISTS (SELECT 1 FROM public.shift_registrations r WHERE r.staffing_segment_id = s.id)
      LIMIT 1;
      IF FOUND THEN
        v_matched_id[i] := matched_seg_id;
        v_keep_ids := array_append(v_keep_ids, matched_seg_id);
      END IF;
    END LOOP;
  END IF;

  -- Delete empty unmatched rows first to free segment_index slots cleanly
  DELETE FROM public.shift_staffing_segments s
  WHERE s.shift_id = p_shift_id
    AND NOT (s.id = ANY(v_keep_ids));

  -- Update surviving matched rows in place (preserves stable segment IDs!)
  IF seg_total > 0 THEN
    FOR i IN 1 .. seg_total LOOP
      IF v_matched_id[i] IS NULL THEN
        CONTINUE;
      END IF;
      SELECT coalesce(array_agg(value), '{}') INTO host_names_arr
      FROM jsonb_array_elements_text(v_host_names[i]);
      SELECT coalesce(array_agg(value), '{}') INTO support_names_arr
      FROM jsonb_array_elements_text(v_support_names[i]);
      SELECT coalesce(array_agg(value), '{}') INTO technical_names_arr
      FROM jsonb_array_elements_text(v_tech_names[i]);

      UPDATE public.shift_staffing_segments s
      SET segment_index = v_idx[i],
          start_at = v_start_at[i],
          end_at = v_end_at[i],
          required_host_count = v_host[i],
          required_support_count = v_support[i],
          required_technical_count = v_tech[i],
          planned_host_names = host_names_arr,
          planned_support_names = support_names_arr,
          planned_technical_names = technical_names_arr,
          updated_at = statement_timestamp()
      WHERE s.id = v_matched_id[i]
        AND (
          s.segment_index IS DISTINCT FROM v_idx[i]
          OR s.start_at IS DISTINCT FROM v_start_at[i]
          OR s.end_at IS DISTINCT FROM v_end_at[i]
          OR s.required_host_count IS DISTINCT FROM v_host[i]
          OR s.required_support_count IS DISTINCT FROM v_support[i]
          OR s.required_technical_count IS DISTINCT FROM v_tech[i]
          OR s.planned_host_names IS DISTINCT FROM host_names_arr
          OR s.planned_support_names IS DISTINCT FROM support_names_arr
          OR s.planned_technical_names IS DISTINCT FROM technical_names_arr
        );
    END LOOP;

    -- Insert genuinely new segments
    FOR i IN 1 .. seg_total LOOP
      IF v_matched_id[i] IS NOT NULL THEN
        CONTINUE;
      END IF;
      SELECT coalesce(array_agg(value), '{}') INTO host_names_arr
      FROM jsonb_array_elements_text(v_host_names[i]);
      SELECT coalesce(array_agg(value), '{}') INTO support_names_arr
      FROM jsonb_array_elements_text(v_support_names[i]);
      SELECT coalesce(array_agg(value), '{}') INTO technical_names_arr
      FROM jsonb_array_elements_text(v_tech_names[i]);

      INSERT INTO public.shift_staffing_segments (
        shift_id, segment_index, start_at, end_at,
        required_host_count, required_support_count, required_technical_count,
        planned_host_names, planned_support_names, planned_technical_names, created_by
      ) VALUES (
        p_shift_id, v_idx[i], v_start_at[i], v_end_at[i],
        v_host[i], v_support[i], v_tech[i],
        host_names_arr, support_names_arr, technical_names_arr, actor_id
      );
    END LOOP;
  END IF;
END;
$$;

ALTER FUNCTION private.c511_replace_shift_segments(text, jsonb) OWNER TO postgres;
REVOKE ALL ON FUNCTION private.c511_replace_shift_segments(text, jsonb) FROM PUBLIC, anon, authenticated, service_role;

-- 2. Re-import reconciliation RPC returning 5 explicit states
-- (created, updated, unchanged, conflict, failed via exception rollback)
-- while keeping existing 4-arg create_schedule_import_shift intact.
CREATE OR REPLACE FUNCTION public.reconcile_schedule_import_shift(
  p_batch_id text,
  p_row_number integer,
  p_data jsonb,
  p_segments jsonb DEFAULT '[]'::jsonb,
  p_allow_safe_update boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_id text := private.require_shift_actor(true);
  batch_row public.schedule_import_batches%ROWTYPE;
  import_row public.schedule_import_batch_rows%ROWTYPE;
  existing_shift public.shifts%ROWTYPE;
  updated_shift public.shifts%ROWTYPE;
  created_shift public.shifts%ROWTYPE;
  settings_row public.system_settings%ROWTYPE;

  exact_slot_count integer := 0;
  ambiguous_slot_count integer := 0;
  existing_shift_id text;
  requested_outcome text;
  result jsonb;
  persisted_segments jsonb := '[]'::jsonb;

  v_has_payroll_lock boolean := false;
  v_existing_seg_count integer := 0;
  v_incoming_seg_count integer := 0;
  v_peak_host smallint;
  v_peak_support smallint;
  v_peak_tech smallint;
  v_app_host integer;
  v_app_support integer;
  v_app_tech integer;

  v_in_agency text;
  v_in_source text;
  v_eff_agency text;
  v_eff_source text;
  v_in_title text;
  v_in_notes text;
  v_in_host_names text[];
  v_in_support_names text[];
  v_in_tech_names text[];
  v_in_supp jsonb;
  v_in_segs_norm jsonb;
  v_ex_segs_norm jsonb;
  v_conflict_msg text;
  v_data_normalized jsonb;
BEGIN
  IF p_row_number IS NULL OR p_row_number < 1 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'IMPORT_ROW_NUMBER_INVALID';
  END IF;
  IF p_data IS NULL OR jsonb_typeof(p_data) <> 'object'
     OR p_segments IS NULL OR jsonb_typeof(p_segments) <> 'array' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'IMPORT_PAYLOAD_INVALID';
  END IF;
  IF NOT public.rbac01_effective_permission('shifts.edit') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'OPERATION_NOT_ALLOWED';
  END IF;

  SELECT * INTO batch_row
  FROM public.schedule_import_batches
  WHERE id = p_batch_id
  FOR UPDATE;
  IF batch_row.id IS NULL OR batch_row.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'IMPORT_BATCH_NOT_FOUND';
  END IF;
  IF batch_row.created_by IS DISTINCT FROM actor_id THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'IMPORT_BATCH_ACTOR_MISMATCH';
  END IF;
  IF batch_row.status NOT IN ('previewed', 'failed', 'confirmed') THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'IMPORT_BATCH_NOT_ACTIVE';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    jsonb_build_array(batch_row.source, batch_row.source_name, p_row_number)::text, 0
  ));

  SELECT * INTO import_row
  FROM public.schedule_import_batch_rows
  WHERE batch_id = p_batch_id AND row_number = p_row_number
  FOR UPDATE;
  IF import_row.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'IMPORT_ROW_NOT_FOUND';
  END IF;

  IF import_row.outcome IN ('imported', 'warning') THEN
    SELECT * INTO created_shift FROM public.shifts WHERE id = import_row.shift_id;
    IF created_shift.id IS NULL THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'IMPORT_ROW_SHIFT_MISMATCH';
    END IF;
    SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.segment_index, s.id), '[]'::jsonb)
    INTO persisted_segments
    FROM public.shift_staffing_segments s
    WHERE s.shift_id = created_shift.id;
    RETURN jsonb_build_object(
      'status', 'unchanged',
      'outcome', import_row.outcome,
      'shift', to_jsonb(created_shift),
      'segments', persisted_segments,
      'shift_id', created_shift.id,
      'idempotent', true
    );
  ELSIF import_row.outcome = 'duplicate_skipped' THEN
    RETURN jsonb_build_object(
      'status', 'unchanged',
      'outcome', 'duplicate_skipped',
      'idempotent', true
    );
  ELSIF import_row.outcome NOT IN ('pending', 'retryable') OR batch_row.status = 'confirmed' THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'IMPORT_ROW_OUTCOME_CONFLICT';
  END IF;

  IF coalesce(nullif(p_data->>'brand_id', ''), '') = ''
     OR coalesce(nullif(p_data->>'platform_id', ''), '') = '' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'IMPORT_BRAND_PLATFORM_REQUIRED';
  END IF;
  IF private.current_system_permission() = 'leader'
     AND NOT private.rc19_has_any_leader_brand_scope(p_data->>'brand_id', ARRAY['shifts.manage']::text[]) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'OPERATION_NOT_ALLOWED';
  END IF;
  IF NOT EXISTS (
       SELECT 1 FROM public.brands b
       WHERE b.id = p_data->>'brand_id'
         AND lower(btrim(replace(b.name, chr(160), ' '))) = lower(btrim(replace(import_row.source_row->>'brand_name', chr(160), ' ')))
     ) OR NOT EXISTS (
       SELECT 1 FROM public.platforms p
       WHERE p.id = p_data->>'platform_id'
         AND lower(btrim(p.name)) = lower(btrim(import_row.source_row->>'platform_name'))
     ) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'IMPORT_SOURCE_IDENTITY_MISMATCH';
  END IF;
  IF p_data->>'date' IS DISTINCT FROM import_row.source_row->>'date'
     OR left(p_data->>'start_time', 5) IS DISTINCT FROM import_row.source_row->>'start_time'
     OR left(p_data->>'end_time', 5) IS DISTINCT FROM import_row.source_row->>'end_time' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'IMPORT_SOURCE_IDENTITY_MISMATCH';
  END IF;

  SELECT * INTO settings_row FROM public.system_settings LIMIT 1;
  IF settings_row.id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'OPERATIONAL_SETTINGS_NOT_CONFIGURED';
  END IF;

  v_incoming_seg_count := jsonb_array_length(p_segments);
  IF v_incoming_seg_count > 0 THEN
    SELECT
      coalesce(max((seg->>'required_host_count')::smallint), 0)::smallint,
      coalesce(max((seg->>'required_support_count')::smallint), 0)::smallint,
      coalesce(max((seg->>'required_technical_count')::smallint), 0)::smallint
    INTO v_peak_host, v_peak_support, v_peak_tech
    FROM jsonb_array_elements(p_segments) AS seg;
  ELSE
    v_peak_host := private.normalize_shift_capacity(p_data->>'required_host_count', settings_row.default_host_count);
    v_peak_support := private.normalize_shift_capacity(p_data->>'required_support_count', settings_row.default_support_count);
    v_peak_tech := private.normalize_shift_capacity(p_data->>'required_technical_count', settings_row.default_technical_count);
  END IF;

  v_data_normalized := coalesce(p_data, '{}'::jsonb) || jsonb_build_object(
    'required_host_count', v_peak_host,
    'required_support_count', v_peak_support,
    'required_technical_count', v_peak_tech
  );

  requested_outcome := CASE
    WHEN jsonb_typeof(import_row.source_row->'warnings') = 'array'
      AND jsonb_array_length(import_row.source_row->'warnings') > 0 THEN 'warning'
    ELSE 'imported'
  END;

  -- Lock canonical slot identity to serialize concurrent imports for the same business slot.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    jsonb_build_array(
      p_data->>'brand_id',
      p_data->>'platform_id',
      p_data->>'date',
      left(p_data->>'start_time', 5),
      left(p_data->>'end_time', 5)
    )::text,
    91735
  ));

  SELECT
    count(*) FILTER (
      WHERE coalesce(lower(btrim(s.studio)), '') = coalesce(lower(btrim(p_data->>'studio')), '')
        AND coalesce(lower(btrim(s.campaign_id)), '') = coalesce(lower(btrim(p_data->>'campaign_id')), '')
    )::integer,
    count(*) FILTER (
      WHERE NOT (
        (nullif(btrim(s.studio), '') IS NOT NULL
          AND nullif(btrim(p_data->>'studio'), '') IS NOT NULL
          AND lower(btrim(s.studio)) <> lower(btrim(p_data->>'studio')))
        OR (nullif(btrim(s.campaign_id), '') IS NOT NULL
          AND nullif(btrim(p_data->>'campaign_id'), '') IS NOT NULL
          AND lower(btrim(s.campaign_id)) <> lower(btrim(p_data->>'campaign_id')))
      )
      AND NOT (
        coalesce(lower(btrim(s.studio)), '') = coalesce(lower(btrim(p_data->>'studio')), '')
        AND coalesce(lower(btrim(s.campaign_id)), '') = coalesce(lower(btrim(p_data->>'campaign_id')), '')
      )
    )::integer
  INTO exact_slot_count, ambiguous_slot_count
  FROM public.shifts s
  WHERE s.deleted_at IS NULL AND s.archived_at IS NULL
    AND s.brand_id = p_data->>'brand_id'
    AND s.platform_id = p_data->>'platform_id'
    AND s.date = (p_data->>'date')::date
    AND left(s.start_time::text, 5) = left(p_data->>'start_time', 5)
    AND left(s.end_time::text, 5) = left(p_data->>'end_time', 5);

  IF exact_slot_count > 1 OR ambiguous_slot_count > 0 THEN
    UPDATE public.schedule_import_batch_rows
    SET outcome = 'retryable', shift_id = NULL, failure_code = 'IMPORT_SLOT_IDENTITY_AMBIGUOUS_REVIEW_REQUIRED'
    WHERE id = import_row.id AND outcome IN ('pending', 'retryable');
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'IMPORT_ROW_OUTCOME_CONFLICT';
    END IF;
    PERFORM private.sync_schedule_import_batch_counts(p_batch_id);
    RETURN jsonb_build_object(
      'status', 'conflict',
      'outcome', 'retryable',
      'failure_code', 'IMPORT_SLOT_IDENTITY_AMBIGUOUS_REVIEW_REQUIRED',
      'shift_id', NULL
    );
  END IF;

  -- Case A: Brand-new shift creation (atomic create + segments + receipt)
  IF exact_slot_count = 0 THEN
    result := v_data_normalized || jsonb_build_object('import_batch_id', p_batch_id);
    IF v_incoming_seg_count > 0 THEN
      created_shift := public.create_shift_with_staffing_segments(result, p_segments);
    ELSE
      created_shift := public.create_shift(result);
    END IF;

    SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.segment_index, s.id), '[]'::jsonb)
    INTO persisted_segments
    FROM public.shift_staffing_segments s
    WHERE s.shift_id = created_shift.id;

    UPDATE public.schedule_import_batch_rows
    SET outcome = requested_outcome, shift_id = created_shift.id, failure_code = NULL
    WHERE id = import_row.id AND outcome IN ('pending', 'retryable');
    IF NOT FOUND THEN
      RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'IMPORT_ROW_OUTCOME_CONFLICT';
    END IF;
    PERFORM private.sync_schedule_import_batch_counts(p_batch_id);

    RETURN jsonb_build_object(
      'status', 'created',
      'outcome', requested_outcome,
      'shift', to_jsonb(created_shift),
      'segments', persisted_segments,
      'shift_id', created_shift.id,
      'idempotent', false
    );
  END IF;

  -- Case B: Exact canonical business key matched existing active shift
  SELECT s.id INTO existing_shift_id
  FROM public.shifts s
  WHERE s.deleted_at IS NULL AND s.archived_at IS NULL
    AND s.brand_id = p_data->>'brand_id'
    AND s.platform_id = p_data->>'platform_id'
    AND s.date = (p_data->>'date')::date
    AND left(s.start_time::text, 5) = left(p_data->>'start_time', 5)
    AND left(s.end_time::text, 5) = left(p_data->>'end_time', 5)
    AND coalesce(lower(btrim(s.studio)), '') = coalesce(lower(btrim(p_data->>'studio')), '')
    AND coalesce(lower(btrim(s.campaign_id)), '') = coalesce(lower(btrim(p_data->>'campaign_id')), '')
  ORDER BY s.id
  LIMIT 1;

  SELECT * INTO existing_shift
  FROM public.shifts
  WHERE id = existing_shift_id
  FOR UPDATE;

  IF NOT private.can_read_shift(existing_shift.id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'OPERATION_NOT_ALLOWED';
  END IF;

  v_in_agency := nullif(btrim(p_data->>'agency_code'), '');
  v_in_source := nullif(btrim(p_data->>'execution_source'), '');
  IF v_in_agency IS NOT NULL AND v_in_agency NOT IN ('ada', 'snap', 'live_ai') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SHIFT_AGENCY_CODE_INVALID';
  END IF;
  IF v_in_source IS NOT NULL AND v_in_source NOT IN ('internal', 'agency') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SHIFT_EXECUTION_SOURCE_INVALID';
  END IF;
  IF v_in_agency IS NOT NULL THEN
    IF v_in_source IS NOT NULL AND v_in_source IS DISTINCT FROM (CASE v_in_agency WHEN 'ada' THEN 'internal' ELSE 'agency' END) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SHIFT_AGENCY_EXECUTION_SOURCE_CONFLICT';
    END IF;
    IF existing_shift.agency_code IS NOT NULL AND existing_shift.agency_code IS DISTINCT FROM v_in_agency THEN
      UPDATE public.schedule_import_batch_rows
      SET outcome = 'retryable', shift_id = NULL, failure_code = 'IMPORT_CROSS_AGENCY_CONFLICT'
      WHERE id = import_row.id AND outcome IN ('pending', 'retryable');
      PERFORM private.sync_schedule_import_batch_counts(p_batch_id);
      RETURN jsonb_build_object(
        'status', 'conflict',
        'outcome', 'retryable',
        'failure_code', 'IMPORT_CROSS_AGENCY_CONFLICT',
        'shift_id', existing_shift.id
      );
    END IF;
  END IF;

  -- Check normalized segment diff and shift diff
  SELECT count(*)::integer,
    coalesce(jsonb_agg(jsonb_build_object(
      'segment_index', s.segment_index,
      'start_at', s.start_at,
      'end_at', s.end_at,
      'required_host_count', s.required_host_count,
      'required_support_count', s.required_support_count,
      'required_technical_count', s.required_technical_count,
      'planned_host_names', to_jsonb(s.planned_host_names),
      'planned_support_names', to_jsonb(s.planned_support_names),
      'planned_technical_names', to_jsonb(s.planned_technical_names)
    ) ORDER BY s.segment_index), '[]'::jsonb)
  INTO v_existing_seg_count, v_ex_segs_norm
  FROM public.shift_staffing_segments s
  WHERE s.shift_id = existing_shift.id;

  IF v_incoming_seg_count > 0 THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'segment_index', (seg->>'segment_index')::integer,
      'start_at', (
        (existing_shift.date + CASE WHEN (seg->>'start_time')::time < existing_shift.start_time THEN 1 ELSE 0 END + (seg->>'start_time')::time)
        AT TIME ZONE 'Asia/Ho_Chi_Minh'
      ),
      'end_at', (
        (
          (existing_shift.date + CASE WHEN (seg->>'start_time')::time < existing_shift.start_time THEN 1 ELSE 0 END)
          + CASE WHEN (seg->>'end_time')::time <= (seg->>'start_time')::time THEN 1 ELSE 0 END
          + (seg->>'end_time')::time
        ) AT TIME ZONE 'Asia/Ho_Chi_Minh'
      ),
      'required_host_count', (seg->>'required_host_count')::smallint,
      'required_support_count', (seg->>'required_support_count')::smallint,
      'required_technical_count', (seg->>'required_technical_count')::smallint,
      'planned_host_names', coalesce(seg->'planned_host_names', '[]'::jsonb),
      'planned_support_names', coalesce(seg->'planned_support_names', '[]'::jsonb),
      'planned_technical_names', coalesce(seg->'planned_technical_names', '[]'::jsonb)
    ) ORDER BY (seg->>'segment_index')::integer), '[]'::jsonb)
    INTO v_in_segs_norm
    FROM jsonb_array_elements(p_segments) AS seg;
  ELSE
    v_in_segs_norm := '[]'::jsonb;
  END IF;

  v_eff_agency := coalesce(v_in_agency, existing_shift.agency_code);
  v_eff_source := coalesce(
    v_in_source,
    CASE v_eff_agency WHEN 'ada' THEN 'internal' WHEN 'snap' THEN 'agency' WHEN 'live_ai' THEN 'agency' ELSE existing_shift.execution_source END
  );
  v_in_title := coalesce(nullif(p_data->>'title', ''), existing_shift.title);
  v_in_notes := coalesce(nullif(p_data->>'product_notes', ''), existing_shift.product_notes);
  IF p_data ? 'host_names' AND jsonb_array_length(coalesce(p_data->'host_names', '[]'::jsonb)) > 0 THEN
    SELECT coalesce(array_agg(value), '{}') INTO v_in_host_names FROM jsonb_array_elements_text(p_data->'host_names');
  ELSE
    v_in_host_names := existing_shift.host_names;
  END IF;
  IF p_data ? 'assistant_names' AND jsonb_array_length(coalesce(p_data->'assistant_names', '[]'::jsonb)) > 0 THEN
    SELECT coalesce(array_agg(value), '{}') INTO v_in_support_names FROM jsonb_array_elements_text(p_data->'assistant_names');
  ELSE
    v_in_support_names := existing_shift.assistant_names;
  END IF;
  IF p_data ? 'technical_names' AND jsonb_array_length(coalesce(p_data->'technical_names', '[]'::jsonb)) > 0 THEN
    SELECT coalesce(array_agg(value), '{}') INTO v_in_tech_names FROM jsonb_array_elements_text(p_data->'technical_names');
  ELSE
    v_in_tech_names := existing_shift.technical_names;
  END IF;
  v_in_supp := CASE
    WHEN p_data ? 'supplemental_fields' AND jsonb_typeof(p_data->'supplemental_fields') = 'object'
      THEN coalesce(existing_shift.supplemental_fields, '{}'::jsonb) || (p_data->'supplemental_fields')
    ELSE coalesce(existing_shift.supplemental_fields, '{}'::jsonb)
  END;

  -- Check if literally unchanged -> duplicate_skipped (idempotent no-op)
  IF existing_shift.required_host_count = v_peak_host
    AND existing_shift.required_support_count = v_peak_support
    AND existing_shift.required_technical_count = v_peak_tech
    AND v_ex_segs_norm IS NOT DISTINCT FROM v_in_segs_norm
    AND existing_shift.title IS NOT DISTINCT FROM v_in_title
    AND existing_shift.product_notes IS NOT DISTINCT FROM v_in_notes
    AND existing_shift.agency_code IS NOT DISTINCT FROM v_eff_agency
    AND existing_shift.execution_source IS NOT DISTINCT FROM v_eff_source
    AND existing_shift.host_names IS NOT DISTINCT FROM v_in_host_names
    AND existing_shift.assistant_names IS NOT DISTINCT FROM v_in_support_names
    AND existing_shift.technical_names IS NOT DISTINCT FROM v_in_tech_names
    AND coalesce(existing_shift.supplemental_fields, '{}'::jsonb) IS NOT DISTINCT FROM v_in_supp THEN
    SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.segment_index, s.id), '[]'::jsonb)
    INTO persisted_segments
    FROM public.shift_staffing_segments s
    WHERE s.shift_id = existing_shift.id;

    UPDATE public.schedule_import_batch_rows
    SET outcome = 'duplicate_skipped', shift_id = NULL, failure_code = NULL
    WHERE id = import_row.id AND outcome IN ('pending', 'retryable');
    PERFORM private.sync_schedule_import_batch_counts(p_batch_id);
    RETURN jsonb_build_object(
      'status', 'unchanged',
      'outcome', 'duplicate_skipped',
      'shift', to_jsonb(existing_shift),
      'segments', persisted_segments,
      'shift_id', existing_shift.id,
      'idempotent', false
    );
  END IF;

  IF NOT coalesce(p_allow_safe_update, true) THEN
    UPDATE public.schedule_import_batch_rows
    SET outcome = 'retryable', shift_id = NULL, failure_code = 'IMPORT_SAFE_UPDATE_DISABLED'
    WHERE id = import_row.id AND outcome IN ('pending', 'retryable');
    PERFORM private.sync_schedule_import_batch_counts(p_batch_id);
    RETURN jsonb_build_object(
      'status', 'conflict',
      'outcome', 'retryable',
      'failure_code', 'IMPORT_SAFE_UPDATE_DISABLED',
      'shift_id', existing_shift.id
    );
  END IF;

  -- Protect confirmed/locked payroll shifts first (payroll segments require completed/cancelled shifts)
  -- and then protect completed/cancelled shifts without confirmed payroll.
  IF to_regclass('public.workforce_payroll_lines') IS NOT NULL
     AND to_regclass('public.workforce_actual_segments') IS NOT NULL
     AND to_regclass('public.workforce_payroll_periods') IS NOT NULL THEN
    SELECT exists(
      SELECT 1
      FROM public.workforce_payroll_lines l
      JOIN public.workforce_actual_segments vas ON vas.id = l.segment_id
      JOIN public.workforce_payroll_periods p ON p.id = l.period_id
      WHERE vas.shift_id = existing_shift.id
        AND p.status IN ('confirmed', 'payroll_ready', 'locked')
    ) INTO v_has_payroll_lock;
  END IF;
  IF NOT v_has_payroll_lock
     AND to_regclass('public.workforce_payroll_segment_decisions') IS NOT NULL
     AND to_regclass('public.workforce_actual_segments') IS NOT NULL THEN
    SELECT exists(
      SELECT 1
      FROM public.workforce_payroll_segment_decisions d
      JOIN public.workforce_actual_segments vas ON vas.id = d.segment_id
      WHERE vas.shift_id = existing_shift.id
        AND d.state = 'admin_confirmed'
    ) INTO v_has_payroll_lock;
  END IF;
  IF v_has_payroll_lock THEN
    UPDATE public.schedule_import_batch_rows
    SET outcome = 'retryable', shift_id = NULL, failure_code = 'IMPORT_APPROVED_PAYROLL_LOCKED'
    WHERE id = import_row.id AND outcome IN ('pending', 'retryable');
    PERFORM private.sync_schedule_import_batch_counts(p_batch_id);
    RETURN jsonb_build_object(
      'status', 'conflict',
      'outcome', 'retryable',
      'failure_code', 'IMPORT_APPROVED_PAYROLL_LOCKED',
      'shift_id', existing_shift.id
    );
  END IF;

  IF existing_shift.status IN ('completed', 'cancelled') THEN
    UPDATE public.schedule_import_batch_rows
    SET outcome = 'retryable', shift_id = NULL, failure_code = 'IMPORT_SHIFT_STATUS_LOCKED'
    WHERE id = import_row.id AND outcome IN ('pending', 'retryable');
    PERFORM private.sync_schedule_import_batch_counts(p_batch_id);
    RETURN jsonb_build_object(
      'status', 'conflict',
      'outcome', 'retryable',
      'failure_code', 'IMPORT_SHIFT_STATUS_LOCKED',
      'shift_id', existing_shift.id
    );
  END IF;

  -- Perform guarded transactional update inside a subtransaction; conflicts roll back cleanly.
  BEGIN
    IF v_incoming_seg_count > 0 OR v_existing_seg_count > 0 THEN
      PERFORM private.c511_replace_shift_segments(existing_shift.id, p_segments);
    ELSE
      SELECT
        count(*) FILTER (WHERE r.operational_role = 'host' AND r.status IN ('approved', 'manually_assigned'))::integer,
        count(*) FILTER (WHERE r.operational_role = 'support' AND r.status IN ('approved', 'manually_assigned'))::integer,
        count(*) FILTER (WHERE r.operational_role = 'technical' AND r.status IN ('approved', 'manually_assigned'))::integer
      INTO v_app_host, v_app_support, v_app_tech
      FROM public.shift_registrations r
      WHERE r.shift_id = existing_shift.id AND r.staffing_segment_id IS NULL;

      IF v_peak_host < v_app_host THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
          MESSAGE = pg_catalog.format('STAFFING_CAPACITY_BELOW_APPROVED_COUNT:host:approved=%s:requested=%s', v_app_host, v_peak_host);
      END IF;
      IF v_peak_support < v_app_support THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
          MESSAGE = pg_catalog.format('STAFFING_CAPACITY_BELOW_APPROVED_COUNT:support:approved=%s:requested=%s', v_app_support, v_peak_support);
      END IF;
      IF v_peak_tech < v_app_tech THEN
        RAISE EXCEPTION USING ERRCODE = '23514',
          MESSAGE = pg_catalog.format('STAFFING_CAPACITY_BELOW_APPROVED_COUNT:technical:approved=%s:requested=%s', v_app_tech, v_peak_tech);
      END IF;
    END IF;

    IF p_data ? 'supplemental_fields' AND NOT private.is_valid_shift_supplemental_fields(v_in_supp) THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'SHIFT_SUPPLEMENTAL_FIELDS_INVALID';
    END IF;

    UPDATE public.shifts
    SET required_host_count = v_peak_host,
        required_support_count = v_peak_support,
        required_technical_count = v_peak_tech,
        host_names = v_in_host_names,
        assistant_names = v_in_support_names,
        technical_names = v_in_tech_names,
        title = v_in_title,
        product_notes = v_in_notes,
        agency_code = v_eff_agency,
        execution_source = v_eff_source,
        supplemental_fields = v_in_supp,
        updated_by = actor_id
    WHERE id = existing_shift.id
    RETURNING * INTO updated_shift;

    PERFORM private.refresh_shift_registration_lock(existing_shift.id, true);
    SELECT * INTO updated_shift FROM public.shifts WHERE id = existing_shift.id;
    PERFORM private.assert_shift_staffing_consistent(updated_shift);
  EXCEPTION
    WHEN SQLSTATE '23514' OR SQLSTATE '23P01' OR SQLSTATE 'P0001' THEN
      GET STACKED DIAGNOSTICS v_conflict_msg = MESSAGE_TEXT;
      UPDATE public.schedule_import_batch_rows
      SET outcome = 'retryable', shift_id = NULL, failure_code = left(v_conflict_msg, 200)
      WHERE id = import_row.id AND outcome IN ('pending', 'retryable');
      PERFORM private.sync_schedule_import_batch_counts(p_batch_id);
      RETURN jsonb_build_object(
        'status', 'conflict',
        'outcome', 'retryable',
        'failure_code', left(v_conflict_msg, 200),
        'shift_id', existing_shift.id
      );
  END;

  SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.segment_index, s.id), '[]'::jsonb)
  INTO persisted_segments
  FROM public.shift_staffing_segments s
  WHERE s.shift_id = updated_shift.id;

  UPDATE public.schedule_import_batch_rows
  SET outcome = requested_outcome, shift_id = updated_shift.id, failure_code = NULL
  WHERE id = import_row.id AND outcome IN ('pending', 'retryable');
  IF NOT FOUND THEN
    RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = 'IMPORT_ROW_OUTCOME_CONFLICT';
  END IF;
  PERFORM private.sync_schedule_import_batch_counts(p_batch_id);

  RETURN jsonb_build_object(
    'status', 'updated',
    'outcome', requested_outcome,
    'shift', to_jsonb(updated_shift),
    'segments', persisted_segments,
    'shift_id', updated_shift.id,
    'idempotent', false
  );
END;
$$;

ALTER FUNCTION public.reconcile_schedule_import_shift(text, integer, jsonb, jsonb, boolean) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.reconcile_schedule_import_shift(text, integer, jsonb, jsonb, boolean) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.reconcile_schedule_import_shift(text, integer, jsonb, jsonb, boolean) TO authenticated;

COMMENT ON FUNCTION public.reconcile_schedule_import_shift(text, integer, jsonb, jsonb, boolean) IS
  'Atomically creates or safely reconciles imported parent shift and segments with explicit created/updated/unchanged/conflict outcomes, preserving segment IDs and active staffing references.';

-- 3. Upgrade public.get_shift_staffing_summary to be segment-accurate for
-- segmented shifts (summing per-segment vacancies & positions, preserving 0)
-- while keeping identical 7-column output signature.
CREATE OR REPLACE FUNCTION public.get_shift_staffing_summary(p_shift_ids text[])
RETURNS TABLE(
  shift_id text,
  role text,
  required integer,
  approved integer,
  pending integer,
  remaining integer,
  approved_staff jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF private.current_business_user_id() IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'AUTHENTICATION_REQUIRED';
  END IF;

  RETURN QUERY
  WITH target_shifts AS (
    SELECT s.*
    FROM public.shifts AS s
    WHERE s.id = ANY(p_shift_ids)
      AND private.can_read_shift(s.id)
  ),
  roles AS (
    SELECT v.role
    FROM (VALUES ('host'::text), ('support'::text), ('technical'::text)) AS v(role)
  ),
  per_segment AS (
    SELECT
      seg.shift_id,
      r_role.role,
      seg.id AS segment_id,
      CASE r_role.role
        WHEN 'host' THEN seg.required_host_count::integer
        WHEN 'support' THEN seg.required_support_count::integer
        ELSE seg.required_technical_count::integer
      END AS seg_required,
      count(r.id) FILTER (WHERE r.status IN ('approved', 'manually_assigned'))::integer AS seg_approved
    FROM public.shift_staffing_segments AS seg
    JOIN target_shifts AS ts ON ts.id = seg.shift_id
    CROSS JOIN roles AS r_role
    LEFT JOIN public.shift_registrations AS r
      ON r.shift_id = seg.shift_id
      AND r.staffing_segment_id = seg.id
      AND r.operational_role = r_role.role
    GROUP BY seg.shift_id, r_role.role, seg.id, seg.required_host_count, seg.required_support_count, seg.required_technical_count
  ),
  seg_rollup AS (
    SELECT
      ps.shift_id,
      ps.role,
      coalesce(sum(ps.seg_required), 0)::integer AS total_seg_required,
      coalesce(sum(greatest(0, ps.seg_required - ps.seg_approved)), 0)::integer AS total_seg_remaining
    FROM per_segment ps
    GROUP BY ps.shift_id, ps.role
  )
  SELECT
    s.id,
    rl.role,
    CASE
      WHEN EXISTS (SELECT 1 FROM public.shift_staffing_segments seg WHERE seg.shift_id = s.id)
        THEN coalesce(sr.total_seg_required, 0)
      ELSE CASE rl.role
        WHEN 'host' THEN coalesce(s.required_host_count, 0)
        WHEN 'support' THEN coalesce(s.required_support_count, 0)
        ELSE coalesce(s.required_technical_count, 0)
      END
    END::integer AS required,
    count(r.id) FILTER (WHERE r.status IN ('approved', 'manually_assigned'))::integer AS approved,
    count(r.id) FILTER (WHERE r.status = 'pending')::integer AS pending,
    CASE
      WHEN EXISTS (SELECT 1 FROM public.shift_staffing_segments seg WHERE seg.shift_id = s.id)
        THEN greatest(
          0,
          coalesce(sr.total_seg_remaining, 0)
          - count(r.id) FILTER (WHERE r.status IN ('approved', 'manually_assigned') AND r.staffing_segment_id IS NULL)::integer
        )
      ELSE greatest(
        0,
        CASE rl.role
          WHEN 'host' THEN coalesce(s.required_host_count, 0)
          WHEN 'support' THEN coalesce(s.required_support_count, 0)
          ELSE coalesce(s.required_technical_count, 0)
        END
        - count(r.id) FILTER (WHERE r.status IN ('approved', 'manually_assigned'))::integer
      )
    END::integer AS remaining,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'name', coalesce(u.full_name, r.imported_name),
          'avatar_url', u.avatar_url,
          'imported_only', r.user_id IS NULL
        )
        ORDER BY r.created_at, r.id
      ) FILTER (
        WHERE r.status IN ('approved', 'manually_assigned')
          AND coalesce(u.full_name, r.imported_name) IS NOT NULL
      ),
      '[]'::jsonb
    ) AS approved_staff
  FROM target_shifts AS s
  CROSS JOIN roles AS rl
  LEFT JOIN seg_rollup AS sr
    ON sr.shift_id = s.id AND sr.role = rl.role
  LEFT JOIN public.shift_registrations AS r
    ON r.shift_id = s.id AND r.operational_role = rl.role
  LEFT JOIN public.business_users AS u
    ON u.id = r.user_id
  GROUP BY
    s.id, rl.role,
    s.required_host_count, s.required_support_count, s.required_technical_count,
    sr.total_seg_required, sr.total_seg_remaining
  ORDER BY s.id, rl.role;
END;
$$;

ALTER FUNCTION public.get_shift_staffing_summary(text[]) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_shift_staffing_summary(text[]) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_shift_staffing_summary(text[]) TO authenticated;

-- 4. Authoritative database-side staffing semantics RPC distinguishing Peak Concurrent,
-- Total Segment Positions, Unique Assigned People, Approved, Pending, Remaining, and Staff-Hours.
CREATE OR REPLACE FUNCTION public.get_shift_staffing_metrics(p_shift_ids text[])
RETURNS TABLE(
  shift_id text,
  role text,
  peak_concurrent_required integer,
  total_positions_required integer,
  unique_assigned_people integer,
  approved_assignments integer,
  pending_assignments integer,
  remaining_vacancies integer,
  required_staff_hours numeric,
  segment_breakdown jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF private.current_business_user_id() IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'AUTHENTICATION_REQUIRED';
  END IF;

  RETURN QUERY
  WITH target_shifts AS (
    SELECT s.*
    FROM public.shifts AS s
    WHERE s.id = ANY(p_shift_ids)
      AND private.can_read_shift(s.id)
  ),
  roles AS (
    SELECT v.role
    FROM (VALUES ('host'::text), ('support'::text), ('technical'::text)) AS v(role)
  ),
  seg_counts AS (
    SELECT
      seg.shift_id,
      r_role.role,
      seg.id AS segment_id,
      seg.segment_index,
      seg.start_at,
      seg.end_at,
      (extract(epoch FROM (seg.end_at - seg.start_at)) / 3600.0)::numeric AS duration_hours,
      CASE r_role.role
        WHEN 'host' THEN seg.required_host_count::integer
        WHEN 'support' THEN seg.required_support_count::integer
        ELSE seg.required_technical_count::integer
      END AS req_count,
      count(r.id) FILTER (WHERE r.status IN ('approved', 'manually_assigned'))::integer AS app_count,
      count(r.id) FILTER (WHERE r.status = 'pending')::integer AS pend_count
    FROM public.shift_staffing_segments AS seg
    JOIN target_shifts AS ts ON ts.id = seg.shift_id
    CROSS JOIN roles AS r_role
    LEFT JOIN public.shift_registrations AS r
      ON r.shift_id = seg.shift_id
      AND r.staffing_segment_id = seg.id
      AND r.operational_role = r_role.role
    GROUP BY
      seg.shift_id, r_role.role, seg.id, seg.segment_index,
      seg.start_at, seg.end_at,
      seg.required_host_count, seg.required_support_count, seg.required_technical_count
  ),
  sweep_events AS (
    SELECT sc.shift_id, sc.role, sc.start_at AS ev_time, 1 AS ev_kind, sc.req_count AS delta
    FROM seg_counts sc WHERE sc.req_count > 0 AND sc.end_at > sc.start_at
    UNION ALL
    SELECT sc.shift_id, sc.role, sc.end_at AS ev_time, 0 AS ev_kind, -sc.req_count AS delta
    FROM seg_counts sc WHERE sc.req_count > 0 AND sc.end_at > sc.start_at
  ),
  sweep_running AS (
    SELECT
      se.shift_id,
      se.role,
      sum(se.delta) OVER (
        PARTITION BY se.shift_id, se.role
        ORDER BY se.ev_time, se.ev_kind
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
      ) AS concurrent_count
    FROM sweep_events se
  ),
  peak_by_role AS (
    SELECT sr.shift_id, sr.role, coalesce(max(sr.concurrent_count), 0)::integer AS peak_count
    FROM sweep_running sr
    GROUP BY sr.shift_id, sr.role
  ),
  seg_agg AS (
    SELECT
      sc.shift_id,
      sc.role,
      count(*)::integer AS segment_count,
      coalesce(sum(sc.req_count), 0)::integer AS total_positions,
      coalesce(sum(greatest(0, sc.req_count - sc.app_count)), 0)::integer AS remaining_sum,
      round(coalesce(sum(sc.req_count * sc.duration_hours), 0)::numeric, 2) AS total_hours,
      jsonb_agg(jsonb_build_object(
        'segment_id', sc.segment_id,
        'segment_index', sc.segment_index,
        'start_at', sc.start_at,
        'end_at', sc.end_at,
        'duration_hours', round(sc.duration_hours, 2),
        'required', sc.req_count,
        'approved', sc.app_count,
        'pending', sc.pend_count,
        'remaining', greatest(0, sc.req_count - sc.app_count)
      ) ORDER BY sc.segment_index, sc.segment_id) AS breakdown
    FROM seg_counts sc
    GROUP BY sc.shift_id, sc.role
  ),
  reg_agg AS (
    SELECT
      ts.id AS shift_id,
      rl.role,
      count(r.id) FILTER (WHERE r.status IN ('approved', 'manually_assigned'))::integer AS approved_assignments,
      count(DISTINCT coalesce(nullif(r.user_id, ''), r.id))
        FILTER (WHERE r.status IN ('approved', 'manually_assigned'))::integer AS unique_assigned_people,
      count(r.id) FILTER (WHERE r.status = 'pending')::integer AS pending_assignments,
      count(r.id) FILTER (WHERE r.status IN ('approved', 'manually_assigned') AND r.staffing_segment_id IS NULL)::integer AS legacy_null_approved
    FROM target_shifts ts
    CROSS JOIN roles rl
    LEFT JOIN public.shift_registrations r
      ON r.shift_id = ts.id AND r.operational_role = rl.role
    GROUP BY ts.id, rl.role
  )
  SELECT
    ts.id AS shift_id,
    rl.role,
    CASE
      WHEN coalesce(sa.segment_count, 0) > 0 THEN coalesce(pk.peak_count, 0)
      ELSE CASE rl.role
        WHEN 'host' THEN coalesce(ts.required_host_count, 0)
        WHEN 'support' THEN coalesce(ts.required_support_count, 0)
        ELSE coalesce(ts.required_technical_count, 0)
      END
    END::integer AS peak_concurrent_required,
    CASE
      WHEN coalesce(sa.segment_count, 0) > 0 THEN sa.total_positions
      ELSE CASE rl.role
        WHEN 'host' THEN coalesce(ts.required_host_count, 0)
        WHEN 'support' THEN coalesce(ts.required_support_count, 0)
        ELSE coalesce(ts.required_technical_count, 0)
      END
    END::integer AS total_positions_required,
    coalesce(ra.unique_assigned_people, 0)::integer AS unique_assigned_people,
    coalesce(ra.approved_assignments, 0)::integer AS approved_assignments,
    coalesce(ra.pending_assignments, 0)::integer AS pending_assignments,
    CASE
      WHEN coalesce(sa.segment_count, 0) > 0
        THEN greatest(0, sa.remaining_sum - coalesce(ra.legacy_null_approved, 0))
      ELSE greatest(
        0,
        CASE rl.role
          WHEN 'host' THEN coalesce(ts.required_host_count, 0)
          WHEN 'support' THEN coalesce(ts.required_support_count, 0)
          ELSE coalesce(ts.required_technical_count, 0)
        END - coalesce(ra.approved_assignments, 0)
      )
    END::integer AS remaining_vacancies,
    CASE
      WHEN coalesce(sa.segment_count, 0) > 0 THEN sa.total_hours
      ELSE round(
        (CASE rl.role
          WHEN 'host' THEN coalesce(ts.required_host_count, 0)
          WHEN 'support' THEN coalesce(ts.required_support_count, 0)
          ELSE coalesce(ts.required_technical_count, 0)
        END * greatest(0, extract(epoch FROM (ts.end_at - ts.start_at)) / 3600.0))::numeric,
        2
      )
    END AS required_staff_hours,
    coalesce(sa.breakdown, '[]'::jsonb) AS segment_breakdown
  FROM target_shifts ts
  CROSS JOIN roles rl
  LEFT JOIN seg_agg sa ON sa.shift_id = ts.id AND sa.role = rl.role
  LEFT JOIN peak_by_role pk ON pk.shift_id = ts.id AND pk.role = rl.role
  LEFT JOIN reg_agg ra ON ra.shift_id = ts.id AND ra.role = rl.role
  ORDER BY ts.id, rl.role;
END;
$$;

ALTER FUNCTION public.get_shift_staffing_metrics(text[]) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_shift_staffing_metrics(text[]) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.get_shift_staffing_metrics(text[]) TO authenticated;

COMMENT ON FUNCTION public.get_shift_staffing_metrics(text[]) IS
  'Computes authoritative per-role and per-segment staffing metrics (peak concurrent, total positions, unique assigned people, approved, pending, remaining, required staff-hours) under shift visibility RLS.';

DO $priv_check$
BEGIN
  IF has_function_privilege('anon', 'public.reconcile_schedule_import_shift(text,integer,jsonb,jsonb,boolean)', 'EXECUTE')
    OR has_function_privilege('service_role', 'public.reconcile_schedule_import_shift(text,integer,jsonb,jsonb,boolean)', 'EXECUTE')
    OR NOT has_function_privilege('authenticated', 'public.reconcile_schedule_import_shift(text,integer,jsonb,jsonb,boolean)', 'EXECUTE')
    OR has_function_privilege('anon', 'public.get_shift_staffing_metrics(text[])', 'EXECUTE')
    OR NOT has_function_privilege('authenticated', 'public.get_shift_staffing_metrics(text[])', 'EXECUTE') THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'W4_TASKB_PRIVILEGE_CHECK_FAILED';
  END IF;
END;
$priv_check$;

NOTIFY pgrst, 'reload schema';

COMMIT;
