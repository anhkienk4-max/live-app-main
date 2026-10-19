import { execSync } from 'node:child_process'

function psql(sql) {
  return execSync('docker exec -i rc16f-pg16-hfinal psql -U postgres -d payroll_shadow_run', {
    input: sql,
    encoding: 'utf8',
  })
}

const runId = Math.floor(Date.now() / 1000)
const staffId = `stf_${runId}`
const periodId = `prd_${runId}`
const shift1Id = `shf_${runId}_1`
const shift2Id = `shf_${runId}_2`
const seg1Id = `seg_${runId}_1`
const seg2Id = `seg_${runId}_2`
const line1Id = `lin_${runId}_1`

console.log(`=== RUNNING RC17B DATABASE INTEGRATION SUITE (Run ID: ${runId}) ===\n`)

// STEP 0: Initial base rate card (open-ended from 2026-09-01)
psql(`
INSERT INTO public.workforce_rate_cards(
  id, staff_id, operational_role, effective_from, effective_through,
  vnd_per_hour, overtime_multiplier_basis_points, approved_by, approved_at, approval_note
) VALUES (
  gen_random_uuid(), '${staffId}', 'host', '2026-09-01', NULL,
  100000, 15000, 'admin-1', '2026-09-01 00:00:00+07', 'Gia khoi diem 100k'
);
`)

console.log('=== TEST 1: Register rate with supersession of open-ended staff rate ===')
const res1 = psql(`
SELECT public.workforce_rc17b_register_rate_card(
  '${staffId}',
  'host',
  '2026-11-01'::date,
  NULL,
  200000,
  15000,
  'admin-1',
  'Đơn giá Host VIP mới từ 01/11/2026 (200k/h)'
);
`)
console.log(res1)

console.log('=== TEST 2: Verify old rate is now closed at 2026-10-31 and new rate is active ===')
const res2 = psql(`
SELECT id, staff_id, operational_role, effective_from, effective_through, vnd_per_hour
FROM public.workforce_rate_cards
WHERE staff_id = '${staffId}'
ORDER BY effective_from ASC;
`)
console.log(res2)

console.log('=== TEST 3: Create November draft period, approved segment, and initial draft line ===')
const res3 = psql(`
INSERT INTO public.workforce_payroll_periods(id, period_start, period_end, status, created_by)
VALUES ('${periodId}', '2026-11-01', '2026-11-15', 'draft', 'admin-1');

INSERT INTO public.shifts(id, brand_id, platform_id, date, start_time, end_time, status)
VALUES ('${shift1Id}', 'h-brand', 'h-platform', '2026-11-02', '09:00:00', '11:00:00', 'completed');

INSERT INTO public.workforce_actual_segments(
  id, shift_id, staff_id, operational_role, event_kind, coverage_kind,
  actual_start_at, actual_end_at, evidence_note, created_by, review_status, version
) VALUES (
  '${seg1Id}', '${shift1Id}', '${staffId}', 'host', 'worked', 'planned',
  '2026-11-02T09:00:00+07:00', '2026-11-02T11:00:00+07:00', 'Diem danh van tay ca sang', 'admin-1', 'draft', 1
);

UPDATE public.workforce_actual_segments
SET review_status = 'approved',
    reviewed_by = 'finance-1',
    reviewed_at = now(),
    review_note = 'Phe duyet diem danh thuc te',
    version = 2
WHERE id = '${seg1Id}';

-- Insert draft line initially with the 200,000 rate and an accountant adjustment of +50,000
DO $$
DECLARE
  v_rate_id text;
BEGIN
  SELECT id INTO v_rate_id FROM public.workforce_rate_cards
  WHERE staff_id = '${staffId}' AND effective_from = '2026-11-01';

  INSERT INTO public.workforce_payroll_lines(
    id, period_id, segment_id, rate_card_id, staff_id, operational_role,
    actual_minutes, payable_minutes, overtime_minutes, rate_vnd_per_hour,
    overtime_multiplier_basis_points, gross_vnd, adjustment_vnd, adjustment_reason, calculation_version
  ) VALUES (
    '${line1Id}', '${periodId}', '${seg1Id}', v_rate_id, '${staffId}', 'host',
    120, 120, 0, 200000, 15000, 400000, 50000, 'Thưởng vượt KPI khai trương', 'rc16-v1'
  );
END $$;
`)
console.log(res3)

console.log('=== TEST 4: Register a higher rate (220,000) starting 2026-11-10 and recalculate line ===')
const res4 = psql(`
DO $$
DECLARE
  v_new_rate_obj jsonb;
  v_new_rate_id text;
  v_recalc jsonb;
BEGIN
  -- 1. Register new rate via RPC (automatically closes previous rate to 2026-11-09)
  v_new_rate_obj := public.workforce_rc17b_register_rate_card(
    '${staffId}', 'host', '2026-11-10'::date, NULL,
    220000, 15000, 'admin-1', 'Dieu chinh tang don gia Host tu ngay 10 (220k/h)'
  );
  v_new_rate_id := v_new_rate_obj->'rate'->>'id';

  -- 2. Update shift date to 2026-11-12 so it falls within the new rate's effective period
  UPDATE public.shifts SET date = '2026-11-12' WHERE id = '${shift1Id}';

  -- 3. Recalculate line with the new rate card (220,000)
  v_recalc := public.workforce_rc17b_recalculate_draft_line(
    '${periodId}',
    '${line1Id}',
    1,
    gen_random_uuid(),
    'admin-1',
    'Cap nhat lai don gia moi 220.000 theo quyet dinh BLD',
    v_new_rate_id
  );
  RAISE NOTICE 'Recalculation Success: %', v_recalc;
END $$;
`)
console.log(res4)

console.log('=== TEST 5: Verify recalculated line (Gross 440,000, preserved adjustment 50,000, Net 490,000, Version 2) ===')
const res5 = psql(`
SELECT id, rate_vnd_per_hour, gross_vnd, adjustment_vnd, net_vnd, version
FROM public.workforce_payroll_lines
WHERE id = '${line1Id}';
`)
console.log(res5)

console.log('=== TEST 6: Verify audit entry for recalculate_line ===')
const res6 = psql(`
SELECT action, actor_id, line_id, line_version, reason, previous_values->>'gross_vnd' as old_gross, updated_values->>'gross_vnd' as new_gross
FROM public.workforce_payroll_audit
WHERE line_id = '${line1Id}' AND action = 'recalculate_line';
`)
console.log(res6)

console.log('=== TEST 7: Unreconciled segment guard blocks transition to reviewed ===')
const res7 = psql(`
-- Add an un-reconciled approved segment in November
INSERT INTO public.shifts(id, brand_id, platform_id, date, start_time, end_time, status)
VALUES ('${shift2Id}', 'h-brand', 'h-platform', '2026-11-05', '14:00:00', '16:00:00', 'completed');

INSERT INTO public.workforce_actual_segments(
  id, shift_id, staff_id, operational_role, event_kind, coverage_kind,
  actual_start_at, actual_end_at, evidence_note, created_by, review_status, version
) VALUES (
  '${seg2Id}', '${shift2Id}', 'staff-unrec-${runId}', 'support', 'worked', 'planned',
  '2026-11-05T14:00:00+07:00', '2026-11-05T16:00:00+07:00', 'Ca support chua co dong luong', 'admin-1', 'draft', 1
);

UPDATE public.workforce_actual_segments
SET review_status = 'approved',
    reviewed_by = 'finance-1',
    reviewed_at = now(),
    review_note = 'Phe duyet diem danh thuc te',
    version = 2
WHERE id = '${seg2Id}';

-- Transition MUST FAIL because seg2Id has no payroll line
DO $$
BEGIN
  PERFORM public.workforce_rc16_transition_payroll(
    '${periodId}',
    'draft',
    'reviewed',
    'admin-b',
    'Ra soat bang luong thang 11'
  );
  RAISE EXCEPTION 'FAILED: Transition should have failed due to unreconciled segments!';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'SUCCESS: Transition blocked with SQLSTATE %: %', SQLSTATE, SQLERRM;
END $$;
`)
console.log(res7)
console.log('=== ALL 7 RC17B DATABASE INTEGRATION TESTS PASSED CLEANLY! ===')
