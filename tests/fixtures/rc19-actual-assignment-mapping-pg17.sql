-- Requires the isolated A1 fixture and the complete W4 + mapping migrations.
DO $$ BEGIN
  IF current_database() <> 'rc19_w4_b4_fault_retry_pg176_20261122'
    OR shobj_description((SELECT oid FROM pg_database WHERE datname=current_database()),'pg_database')
      <> 'CODEX_DISPOSABLE_RC19_W4_B4_FAULT_RETRY_20261122_ONLY' THEN
    RAISE EXCEPTION 'DISPOSABLE_A1_DATABASE_REQUIRED';
  END IF;
END $$;
BEGIN;
DO $$
DECLARE missing text[];
BEGIN
  SELECT private.rc19_c515_required_payroll_evidence('a1-mapped-actual-a') INTO missing;
  IF 'assignment_evidence_mapping_required'=ANY(missing) THEN RAISE EXCEPTION 'VALID_ASSIGNMENT_A_REJECTED'; END IF;
  IF 'check_in_photo_review'=ANY(missing) OR 'check_out_photo_review'=ANY(missing) THEN RAISE EXCEPTION 'APPROVED_ASSIGNMENT_A_EVIDENCE_MISSING'; END IF;
  SELECT private.rc19_c515_required_payroll_evidence('a1-mapped-actual-b') INTO missing;
  IF 'assignment_evidence_mapping_required'=ANY(missing) THEN RAISE EXCEPTION 'VALID_ASSIGNMENT_B_REJECTED'; END IF;
  IF NOT ('check_in_photo_review'=ANY(missing)) OR NOT ('check_out_photo_review'=ANY(missing)) THEN RAISE EXCEPTION 'ASSIGNMENT_B_USED_A_EVIDENCE'; END IF;
  BEGIN
    UPDATE public.workforce_actual_segments SET assignment_id='a1clock-assignment-b',version=version+1 WHERE id='a1-mapped-actual-a';
    RAISE EXCEPTION 'ASSIGNMENT_REWRITE_ACCEPTED';
  EXCEPTION WHEN check_violation THEN IF SQLERRM <> 'WORKFORCE_ASSIGNMENT_IMMUTABLE' THEN RAISE; END IF; END;
  BEGIN
    INSERT INTO public.workforce_actual_segments(id,shift_id,staff_id,operational_role,assignment_id,event_kind,actual_start_at,actual_end_at,evidence_note,created_by)
    VALUES ('a1-test-invalid-staff','a1clock-fixture-shift','a1-fixture-staff','host','a1clock-assignment-a','worked','2026-11-24 08:00+07','2026-11-24 12:00+07','synthetic invalid staff','a1-fixture-staff');
    RAISE EXCEPTION 'CROSS_STAFF_ASSIGNMENT_ACCEPTED';
  EXCEPTION WHEN check_violation THEN IF SQLERRM <> 'WORKFORCE_ASSIGNMENT_INVALID' THEN RAISE; END IF; END;
  BEGIN
    INSERT INTO public.workforce_actual_segments(id,shift_id,staff_id,operational_role,assignment_id,event_kind,actual_start_at,actual_end_at,evidence_note,created_by)
    VALUES ('a1-test-invalid-interval','a1clock-fixture-shift','a1clock-fixture-staff','host','a1clock-assignment-b','worked','2026-11-24 08:00+07','2026-11-24 12:00+07','synthetic invalid time','a1clock-fixture-staff');
    RAISE EXCEPTION 'WRONG_ASSIGNMENT_INTERVAL_ACCEPTED';
  EXCEPTION WHEN check_violation THEN IF SQLERRM <> 'WORKFORCE_ASSIGNMENT_INTERVAL_INVALID' THEN RAISE; END IF; END;
  BEGIN
    INSERT INTO public.workforce_actual_segments(id,shift_id,staff_id,operational_role,event_kind,actual_start_at,actual_end_at,evidence_note,created_by)
    VALUES ('a1-test-missing-assignment','a1clock-fixture-shift','a1clock-fixture-staff','host','worked','2026-11-24 08:00+07','2026-11-24 12:00+07','synthetic missing assignment','a1clock-fixture-staff');
    RAISE EXCEPTION 'MISSING_ASSIGNMENT_ACCEPTED';
  EXCEPTION WHEN check_violation THEN IF SQLERRM <> 'WORKFORCE_ASSIGNMENT_REQUIRED' THEN RAISE; END IF; END;
END $$;
ROLLBACK;
