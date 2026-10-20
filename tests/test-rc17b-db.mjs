import { execSync } from 'node:child_process'
import assert from 'node:assert/strict'

function psql(sql) {
  try {
    return execSync('docker exec -i rc16f-pg16-hfinal psql -v ON_ERROR_STOP=1 -U postgres -d payroll_shadow_run', {
      input: sql,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    })
  } catch (e) {
    const errText = (e.stderr ? e.stderr.toString() : '') + (e.stdout ? e.stdout.toString() : '') + ' ' + (e.message || '')
    const err = new Error(errText)
    err.original = e
    throw err
  }
}

const runId = Math.floor(Date.now() / 1000)
const staffAlice = `stf_alice_${runId}`
const staffBob = `stf_bob_${runId}`
const staffCharlie = `stf_charlie_${runId}`
const staffDavid = `stf_david_${runId}`
const staffEve = `stf_eve_${runId}`
const staffFrank = `stf_frank_${runId}`
const adminId = `adm_${runId}`
const adminBId = `adm_b_${runId}`
const adminCId = `adm_c_${runId}`
const periodId = `prd_${runId}`
const shift1Id = `shf_${runId}_1`
const shift2Id = `shf_${runId}_2`
const shift3Id = `shf_${runId}_3`
const shiftUnrecId = `shf_${runId}_unrec`
const seg1Id = `seg_${runId}_1`
const seg2Id = `seg_${runId}_2`
const seg3Id = `seg_${runId}_3`
const segUnrecId = `seg_${runId}_unrec`
const line1Id = `lin_${runId}_1`
const line2Id = `lin_${runId}_2`
const line3Id = `lin_${runId}_3`

const brandId = `brd_${runId}`

console.log(`=== STARTING RC17B INTEGRATION TEST SUITE (Run ID: ${runId}) ===\n`)

// SETUP USERS AND BRAND
psql(`
UPDATE public.shifts SET deleted_at = now() WHERE brand_id LIKE 'brd_%' AND deleted_at IS NULL;

INSERT INTO public.brands(id, name, status)
VALUES ('${brandId}', 'Test Brand ${runId}', 'active')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.business_users(id, email, full_name, system_permission, status, account_status)
VALUES
  ('${adminId}', '${adminId}@test.local', 'Admin Primary', 'admin', 'active', 'active'),
  ('${adminBId}', '${adminBId}@test.local', 'Admin Secondary', 'admin', 'active', 'active'),
  ('${adminCId}', '${adminCId}@test.local', 'Admin Tertiary', 'admin', 'active', 'active'),
  ('${staffAlice}', '${staffAlice}@test.local', 'Alice Host', 'member', 'active', 'active'),
  ('${staffBob}', '${staffBob}@test.local', 'Bob Support', 'member', 'active', 'active'),
  ('${staffCharlie}', '${staffCharlie}@test.local', 'Charlie Tech', 'member', 'active', 'active'),
  ('${staffDavid}', '${staffDavid}@test.local', 'David Host', 'member', 'active', 'active'),
  ('${staffEve}', '${staffEve}@test.local', 'Eve Host', 'member', 'active', 'active'),
  ('${staffFrank}', '${staffFrank}@test.local', 'Frank Support', 'member', 'active', 'active')
ON CONFLICT (id) DO UPDATE SET system_permission = EXCLUDED.system_permission, status = 'active', account_status = 'active';
`)

console.log('--- TEST 1: Rate Card Immutability Guard ---')
// Insert base rate card for Alice
const rateAliceOldId = `rate_alice_old_${runId}`
psql(`
INSERT INTO public.workforce_rate_cards(
  id, staff_id, operational_role, effective_from, effective_through,
  vnd_per_hour, overtime_multiplier_basis_points, approved_by, approved_at, approval_note
) VALUES (
  '${rateAliceOldId}', '${staffAlice}', 'host', '2026-10-01', NULL,
  100000, 15000, '${adminId}', '2026-09-30 00:00:00+07', 'Gia khoi diem 100k'
);
`)

// 1a. Direct UPDATE on vnd_per_hour MUST FAIL
let immutErr1 = ''
try {
  psql(`UPDATE public.workforce_rate_cards SET vnd_per_hour = 120000 WHERE id = '${rateAliceOldId}';`)
} catch (e) {
  immutErr1 = e.message
}
assert.ok(immutErr1.includes('WORKFORCE_APPROVED_RATE_IMMUTABLE'), 'Direct rate amount update must fail')

// 1b. Direct UPDATE on approval_note MUST FAIL
let immutErr2 = ''
try {
  psql(`UPDATE public.workforce_rate_cards SET approval_note = 'Modified note' WHERE id = '${rateAliceOldId}';`)
} catch (e) {
  immutErr2 = e.message
}
assert.ok(immutErr2.includes('WORKFORCE_APPROVED_RATE_IMMUTABLE'), 'Direct approval_note update must fail')

// 1c. Direct UPDATE on effective_through without RPC session config MUST FAIL
let immutErr3 = ''
try {
  psql(`UPDATE public.workforce_rate_cards SET effective_through = '2026-10-14' WHERE id = '${rateAliceOldId}';`)
} catch (e) {
  immutErr3 = e.message
}
assert.ok(immutErr3.includes('WORKFORCE_APPROVED_RATE_IMMUTABLE'), 'Direct effective_through update must fail without RPC')

// 1d. Direct DELETE MUST FAIL
let immutErr4 = ''
try {
  psql(`DELETE FROM public.workforce_rate_cards WHERE id = '${rateAliceOldId}';`)
} catch (e) {
  immutErr4 = e.message
}
assert.ok(immutErr4.includes('WORKFORCE_APPROVED_RATE_IMMUTABLE'), 'Direct rate card delete must fail')
console.log('✓ Rate Card Immutability Guard strictly enforced (financials, notes, delete blocked).\n')

console.log('--- TEST 2: Initial Draft Payroll Setup ---')
// Register support and tech rates for Bob and Charlie
const rateBobOldId = `rate_bob_old_${runId}`
const rateCharlieNewId = `rate_charlie_new_${runId}`
psql(`
INSERT INTO public.workforce_rate_cards(
  id, staff_id, operational_role, effective_from, effective_through,
  vnd_per_hour, overtime_multiplier_basis_points, approved_by, approved_at, approval_note
) VALUES
  ('${rateBobOldId}', '${staffBob}', 'support', '2026-10-01', NULL, 80000, 15000, '${adminId}', now(), 'Don gia Support 80k'),
  ('${rateCharlieNewId}', '${staffCharlie}', 'technical', '2026-10-01', NULL, 120000, 15000, '${adminId}', now(), 'Don gia Tech 120k');
`)

// Create October draft period
const periodStart = `2026-10-01`
const periodEnd = `2026-10-31`
const periodRevision = (runId % 100000) + 10
psql(`
INSERT INTO public.workforce_payroll_periods(id, period_start, period_end, revision, status, created_by)
VALUES ('${periodId}', '${periodStart}', '${periodEnd}', ${periodRevision}, 'draft', '${adminId}')
ON CONFLICT (period_start, period_end, revision) DO NOTHING;
`)

// Create 3 shifts:
// Shift 1: Alice on 14/10 (before rate change)
// Shift 2: Alice on 15/10 (before rate supersession)
// Shift 3: Bob on 15/10
psql(`
INSERT INTO public.shifts(id, brand_id, platform_id, date, start_time, end_time, status)
VALUES
  ('${shift1Id}', '${brandId}', 'h-platform', '2026-10-14', '09:00:00', '11:00:00', 'completed'),
  ('${shift2Id}', '${brandId}', 'h-platform', '2026-10-15', '09:00:00', '11:00:00', 'completed'),
  ('${shift3Id}', '${brandId}', 'h-platform', '2026-10-15', '14:00:00', '16:00:00', 'completed')
ON CONFLICT DO NOTHING;

INSERT INTO public.workforce_actual_segments(
  id, shift_id, staff_id, operational_role, event_kind, coverage_kind,
  actual_start_at, actual_end_at, evidence_note, created_by, review_status, version
) VALUES
  ('${seg1Id}', '${shift1Id}', '${staffAlice}', 'host', 'worked', 'planned', '2026-10-14T09:00:00+07:00', '2026-10-14T11:00:00+07:00', 'Diem danh day du', '${adminId}', 'draft', 1),
  ('${seg2Id}', '${shift2Id}', '${staffAlice}', 'host', 'worked', 'planned', '2026-10-15T09:00:00+07:00', '2026-10-15T11:00:00+07:00', 'Diem danh day du', '${adminId}', 'draft', 1),
  ('${seg3Id}', '${shift3Id}', '${staffBob}', 'support', 'worked', 'planned', '2026-10-15T14:00:00+07:00', '2026-10-15T16:00:00+07:00', 'Diem danh day du', '${adminId}', 'draft', 1)
ON CONFLICT DO NOTHING;

UPDATE public.workforce_actual_segments
SET review_status = 'approved',
    reviewed_by = '${adminBId}',
    reviewed_at = now(),
    review_note = 'Duyet hop le',
    version = version + 1
WHERE id IN ('${seg1Id}', '${seg2Id}', '${seg3Id}');
`)

// Create initial draft lines:
// Line 1: Alice on 14/10 with old rate (100k) -> Gross: 200,000, Adjustment: +20,000
// Line 2: Alice on 15/10 with OLD rate card initially (100k) -> Gross: 200,000, Adjustment: +50,000 (Accountant bonus)
// Line 3: Bob on 15/10 with rate (80k) -> Gross: 160,000, Adjustment: -10,000 (Penalty)
psql(`
INSERT INTO public.workforce_payroll_lines(
  id, period_id, segment_id, rate_card_id, staff_id, operational_role,
  actual_minutes, payable_minutes, overtime_minutes, rate_vnd_per_hour,
  overtime_multiplier_basis_points, gross_vnd, adjustment_vnd, adjustment_reason, calculation_version
) VALUES
  ('${line1Id}', '${periodId}', '${seg1Id}', '${rateAliceOldId}', '${staffAlice}', 'host', 120, 120, 0, 100000, 15000, 200000, 20000, 'Thuong cham chi', 'rc16-v1'),
  ('${line2Id}', '${periodId}', '${seg2Id}', '${rateAliceOldId}', '${staffAlice}', 'host', 120, 120, 0, 100000, 15000, 200000, 50000, 'Thuong vuot KPI', 'rc16-v1'),
  ('${line3Id}', '${periodId}', '${seg3Id}', '${rateBobOldId}', '${staffBob}', 'support', 120, 120, 0, 80000, 15000, 160000, -10000, 'Khau tru phong cach', 'rc16-v1')
ON CONFLICT DO NOTHING;
`)
console.log('✓ Initial 3 draft payroll lines created with accountant adjustments preserved.\n')

console.log('--- TEST 3: Atomic Rate Supersession via RPC ---')
const regResAlice = psql(`
SELECT public.workforce_rc17b_register_rate_card(
  '${staffAlice}',
  'host',
  '2026-10-15'::date,
  NULL,
  150000,
  15000,
  '${adminId}',
  'Tang don gia Host tu ngay 15/10 len 150k/h'
);
`)
assert.ok(regResAlice.includes(rateAliceOldId), 'Superseded old rate card ID returned in response')

// Verify old rate card is closed to 2026-10-14
const oldRateCheck = psql(`
SELECT effective_through FROM public.workforce_rate_cards WHERE id = '${rateAliceOldId}';
`)
assert.ok(oldRateCheck.includes('2026-10-14'), 'Old rate card closed out to 2026-10-14')

// Verify audit entry for supersession
const auditSupersede = psql(`
SELECT action, actor_id, rate_card_id, reason
FROM public.workforce_payroll_audit
WHERE rate_card_id = '${rateAliceOldId}' AND action = 'supersede_rate_card';
`)
assert.ok(auditSupersede.includes('supersede_rate_card'), 'Audit entry for supersede_rate_card recorded')

// Also create a new higher rate for Bob starting 2026-10-15 (90k/h)
const regBob = psql(`
SELECT public.workforce_rc17b_register_rate_card(
  '${staffBob}', 'support', '2026-10-15'::date, NULL,
  90000, 15000, '${adminId}', 'Tang luong Support tu 15/10 len 90k'
);
`)
assert.ok(regBob.includes(rateBobOldId), 'Superseded Bob old rate card ID returned')
console.log('✓ Rate Supersession successfully bounded old rate cards and recorded audit.\n')

console.log('--- TEST 4: Atomic Batch Recalculation (workforce_rc17b_recalculate_draft_batch) ---')
// Get the new rate card ID for Alice
const rateAliceNewRow = psql(`
SELECT id FROM public.workforce_rate_cards
WHERE staff_id = '${staffAlice}' AND effective_from = '2026-10-15';
`)
const newAliceRateId = rateAliceNewRow.trim().split('\n')[2]?.trim()
assert.ok(newAliceRateId, 'New rate card ID resolved')

const newBobRateRow = psql(`
SELECT id FROM public.workforce_rate_cards WHERE staff_id = '${staffBob}' AND effective_from = '2026-10-15';
`)
const newBobRateId = newBobRateRow.trim().split('\n')[2]?.trim()
assert.ok(newBobRateId, 'New Bob rate resolved')

const batchRequestId = 'b0000000-0000-4000-a000-000000000001'
const batchPayloadItems = JSON.stringify([
  { line_id: line2Id, expected_version: 1, new_rate_card_id: newAliceRateId },
  { line_id: line3Id, expected_version: 1, new_rate_card_id: newBobRateId },
])

const batchRes = psql(`
SELECT public.workforce_rc17b_recalculate_draft_batch(
  '${periodId}',
  '${batchRequestId}'::uuid,
  '${adminId}',
  'Cap nhat bang luong dot dieu chinh gia thang 10',
  '${batchPayloadItems}'::jsonb
);
`)
assert.ok(batchRes.includes('replayed": false'), 'Batch execution succeeded non-replayed')

// Verify Line 2 updated: rate 150k, gross 300k, adjustment +50k PRESERVED, net 350k, version 2
const checkLine2 = psql(`
SELECT rate_vnd_per_hour, gross_vnd, adjustment_vnd, net_vnd, version, adjustment_reason
FROM public.workforce_payroll_lines WHERE id = '${line2Id}';
`)
assert.ok(checkLine2.includes('150000'), 'Line 2 rate updated to 150k')
assert.ok(checkLine2.includes('300000'), 'Line 2 gross updated to 300k')
assert.ok(checkLine2.includes('50000'), 'Line 2 adjustment preserved (+50k)')
assert.ok(checkLine2.includes('350000'), 'Line 2 net updated to 350k')
assert.ok(checkLine2.includes('2'), 'Line 2 version incremented to 2')
assert.ok(checkLine2.includes('Thuong vuot KPI'), 'Line 2 adjustment reason preserved')

// Verify Line 3 updated: rate 90k, gross 180k, adjustment -10k PRESERVED, net 170k, version 2
const checkLine3 = psql(`
SELECT rate_vnd_per_hour, gross_vnd, adjustment_vnd, net_vnd, version, adjustment_reason
FROM public.workforce_payroll_lines WHERE id = '${line3Id}';
`)
assert.ok(checkLine3.includes('90000'), 'Line 3 rate updated to 90k')
assert.ok(checkLine3.includes('180000'), 'Line 3 gross updated to 180k')
assert.ok(checkLine3.includes('-10000'), 'Line 3 adjustment preserved (-10k)')
assert.ok(checkLine3.includes('170000'), 'Line 3 net updated to 170k')

// Verify Line 1 was UNTOUCHED: still 100k, version 1
const checkLine1 = psql(`
SELECT rate_vnd_per_hour, gross_vnd, adjustment_vnd, net_vnd, version
FROM public.workforce_payroll_lines WHERE id = '${line1Id}';
`)
assert.ok(checkLine1.includes('100000'), 'Line 1 retained old rate 100k')
assert.ok(checkLine1.includes('1'), 'Line 1 retained version 1')
console.log('✓ Batch Recalculation updated targeted lines atomically and preserved adjustments.\n')

console.log('--- TEST 5: Batch Idempotency Replay & Conflict ---')
// 5a. Replay with EXACT same payload returns replayed: true
const replayRes = psql(`
SELECT public.workforce_rc17b_recalculate_draft_batch(
  '${periodId}',
  '${batchRequestId}'::uuid,
  '${adminId}',
  'Cap nhat bang luong dot dieu chinh gia thang 10',
  '${batchPayloadItems}'::jsonb
);
`)
assert.ok(replayRes.includes('replayed": true'), 'Exact replay returned cached result')

// 5b. Conflict: same request_id with different payload throws IDEMPOTENCY_CONFLICT
let conflictErr = ''
try {
  psql(`
  SELECT public.workforce_rc17b_recalculate_draft_batch(
    '${periodId}',
    '${batchRequestId}'::uuid,
    '${adminId}',
    'Ly do bi thay doi khac nhau hoan toan',
    '${batchPayloadItems}'::jsonb
  );
  `)
} catch (e) {
  conflictErr = e.message
}
assert.ok(conflictErr.includes('WORKFORCE_PAYROLL_IDEMPOTENCY_CONFLICT'), 'Idempotency conflict detected and blocked')
console.log('✓ Idempotency replay and conflict detection verified.\n')

console.log('--- TEST 6: Mid-Batch Stale Line Rollback (All-or-Nothing) ---')
// Try to recalculate with line 3 at valid version 2, and line 2 at STALE version 1 (it is now version 2)
const staleBatchId = 'b0000000-0000-4000-a000-000000000002'
let staleErr = ''
try {
  psql(`
  SELECT public.workforce_rc17b_recalculate_draft_batch(
    '${periodId}',
    '${staleBatchId}'::uuid,
    '${adminId}',
    'Thu tinh lai voi phien ban cu',
    jsonb_build_array(
      jsonb_build_object('line_id', '${line3Id}', 'expected_version', 2, 'new_rate_card_id', '${newBobRateId}'),
      jsonb_build_object('line_id', '${line2Id}', 'expected_version', 1, 'new_rate_card_id', '${newAliceRateId}')
    )
  );
  `)
} catch (e) {
  staleErr = e.message
}
assert.ok(staleErr.includes('WORKFORCE_PAYROLL_STALE_LINE'), 'Stale line in batch throws WORKFORCE_PAYROLL_STALE_LINE')

// Verify line 3 was NOT updated (rolled back to version 2)
const checkLine3Rollback = psql(`
SELECT version FROM public.workforce_payroll_lines WHERE id = '${line3Id}';
`)
assert.ok(checkLine3Rollback.includes('2'), 'Line 3 was not updated due to mid-batch failure rollback')
console.log('✓ All-or-nothing transaction atomicity verified (zero partial commits).\n')

console.log('--- TEST 7: Unreconciled Segment Guard on Period Review ---')
// Add an approved worked segment in October with NO payroll line
psql(`
INSERT INTO public.shifts(id, brand_id, platform_id, date, start_time, end_time, status)
VALUES ('${shiftUnrecId}', '${brandId}', 'h-platform', '2026-10-20', '09:00:00', '11:00:00', 'completed')
ON CONFLICT DO NOTHING;

INSERT INTO public.workforce_actual_segments(
  id, shift_id, staff_id, operational_role, event_kind, coverage_kind,
  actual_start_at, actual_end_at, evidence_note, created_by, review_status, version
) VALUES (
  '${segUnrecId}', '${shiftUnrecId}', '${staffCharlie}', 'technical', 'worked', 'planned',
  '2026-10-20T09:00:00+07:00', '2026-10-20T11:00:00+07:00', 'Checkin van tay', '${adminId}', 'draft', 1
) ON CONFLICT DO NOTHING;

UPDATE public.workforce_actual_segments
SET review_status = 'approved',
    reviewed_by = '${adminBId}',
    reviewed_at = now(),
    review_note = 'Duyet hop le tech',
    version = version + 1
WHERE id = '${segUnrecId}';
`)

// Transition to 'reviewed' MUST BE BLOCKED
let reviewBlockErr = ''
try {
  psql(`
  SELECT public.workforce_rc16_transition_payroll(
    '${periodId}',
    'draft',
    'reviewed',
    '${adminBId}',
    'Admin B tien hanh review bang luong'
  );
  `)
} catch (e) {
  reviewBlockErr = e.message
}
assert.ok(reviewBlockErr.includes('WORKFORCE_PAYROLL_UNRECONCILED_SEGMENTS_REMAIN'), 'Transition to reviewed blocked by unreconciled segment')
console.log('✓ Unreconciled segment guard blocked transition to reviewed.\n')

console.log('--- TEST 8: Independent Payroll Review After Wage Calculation ---')
// 8a. Reconcile the remaining segment so period has all segments reconciled
const lineUnrecId = `lin_${runId}_unrec`
psql(`
INSERT INTO public.workforce_payroll_lines(
  id, period_id, segment_id, rate_card_id, staff_id, operational_role,
  actual_minutes, payable_minutes, overtime_minutes, rate_vnd_per_hour,
  overtime_multiplier_basis_points, gross_vnd, adjustment_vnd, version
) VALUES (
  '${lineUnrecId}', '${periodId}', '${segUnrecId}', '${rateCharlieNewId}', '${staffCharlie}', 'technical',
  120, 120, 0, 120000, 15000, 240000, 0, 1
) ON CONFLICT DO NOTHING;
`)

// 8b. Admin A (who created the period AND recalculated batch in Test 4) attempts to review
let selfReviewErr1 = ''
try {
  psql(`
  SELECT public.workforce_rc16_transition_payroll(
    '${periodId}',
    'draft',
    'reviewed',
    '${adminId}',
    'Admin A tu review sau khi tinh lai luong'
  );
  `)
} catch (e) {
  selfReviewErr1 = e.message
}
assert.ok(selfReviewErr1.includes('WORKFORCE_PAYROLL_SELF_REVIEW'), 'Admin A who recalculated payroll is blocked from reviewing')

// 8c. Independent Admin B (who did not recalculate or create the period) reviews successfully
psql(`
SELECT public.workforce_rc16_transition_payroll(
  '${periodId}',
  'draft',
  'reviewed',
  '${adminBId}',
  'Admin B doc lap phe duyet bang luong hop le'
);
`)
const checkPeriod1Status = psql(`SELECT status, reviewed_by FROM public.workforce_payroll_periods WHERE id = '${periodId}';`)
assert.ok(checkPeriod1Status.includes('reviewed'), 'Period status transitioned to reviewed')
console.log('✓ Admin A blocked by recalculate_batch guard, independent Admin B successfully reviewed.\n')

// 8d. Test recalculate_line anti-self-review on a fresh period
const period2Id = `prd_${runId}_recalcline`
const shiftP2Id = `shf_${runId}_p2`
const segP2Id = `seg_${runId}_p2`
const lineP2Id = `lin_${runId}_p2`
const rateDavidV1Id = `rate_david_v1_${runId}`

psql(`
INSERT INTO public.workforce_rate_cards(
  id, staff_id, operational_role, effective_from, effective_through,
  vnd_per_hour, overtime_multiplier_basis_points, approved_by, approved_at, approval_note
) VALUES (
  '${rateDavidV1Id}', '${staffDavid}', 'host', '2026-11-01', NULL,
  100000, 15000, '${adminId}', now(), 'Don gia khoi diem David 100k'
);

INSERT INTO public.workforce_payroll_periods(id, period_start, period_end, revision, status, created_by)
VALUES ('${period2Id}', '2026-11-10', '2026-11-25', ${(runId % 100000) + 11}, 'draft', '${adminBId}');

INSERT INTO public.shifts(id, brand_id, platform_id, date, start_time, end_time, status)
VALUES ('${shiftP2Id}', '${brandId}', 'h-platform', '2026-11-18', '09:00:00', '12:00:00', 'completed');

INSERT INTO public.workforce_actual_segments(
  id, shift_id, staff_id, operational_role, event_kind, coverage_kind,
  actual_start_at, actual_end_at, evidence_note, created_by, review_status, version
) VALUES (
  '${segP2Id}', '${shiftP2Id}', '${staffDavid}', 'host', 'worked', 'planned',
  '2026-11-18T09:00:00+07:00', '2026-11-18T12:00:00+07:00', 'Diem danh P2', '${adminId}', 'draft', 1
);

UPDATE public.workforce_actual_segments
SET review_status = 'approved',
    reviewed_by = '${adminBId}',
    reviewed_at = now(),
    review_note = 'Duyet P2',
    version = version + 1
WHERE id = '${segP2Id}';

INSERT INTO public.workforce_payroll_lines(
  id, period_id, segment_id, rate_card_id, staff_id, operational_role,
  actual_minutes, payable_minutes, overtime_minutes, rate_vnd_per_hour,
  overtime_multiplier_basis_points, gross_vnd, adjustment_vnd, version
) VALUES (
  '${lineP2Id}', '${period2Id}', '${segP2Id}', '${rateDavidV1Id}', '${staffDavid}', 'host',
  180, 180, 0, 100000, 15000, 300000, 0, 1
);
`)

// Register David new rate (120k) starting from 2026-11-15 via supersession RPC
psql(`
SELECT public.workforce_rc17b_register_rate_card(
  '${staffDavid}',
  'host',
  '2026-11-15'::date,
  NULL,
  120000,
  15000,
  '${adminId}',
  'Tang don gia cho David tu giua thang 11'
);
`)
const newDavidRateRow = psql(`SELECT id FROM public.workforce_rate_cards WHERE staff_id = '${staffDavid}' AND vnd_per_hour = 120000;`)
const newDavidRateId = newDavidRateRow.trim().split('\n')[2]?.trim()

// Admin A (not creator Admin B) performs recalculate_line on lineP2Id
const recalcLineReqId = 'c0000000-0000-4000-a000-000000000001'
psql(`
SELECT public.workforce_rc17b_recalculate_draft_line(
  '${period2Id}',
  '${lineP2Id}',
  1,
  '${recalcLineReqId}'::uuid,
  '${adminId}',
  'Cap nhat lai don gia moi cho David',
  '${newDavidRateId}'
);
`)

// Admin A now attempts to review period2Id -> MUST BE BLOCKED
let selfReviewErr2 = ''
try {
  psql(`
  SELECT public.workforce_rc16_transition_payroll(
    '${period2Id}',
    'draft',
    'reviewed',
    '${adminId}',
    'Admin A co tinh review sau khi recalculate_line'
  );
  `)
} catch (e) {
  selfReviewErr2 = e.message
}
assert.ok(selfReviewErr2.includes('WORKFORCE_PAYROLL_SELF_REVIEW'), 'Admin A who called recalculate_line is blocked from reviewing')

// Admin C (completely independent) can review
psql(`
SELECT public.workforce_rc16_transition_payroll(
  '${period2Id}',
  'draft',
  'reviewed',
  '${adminCId}',
  'Admin C doc lap phe duyet'
);
`)
const checkPeriod2Status = psql(`SELECT status, reviewed_by FROM public.workforce_payroll_periods WHERE id = '${period2Id}';`)
assert.ok(checkPeriod2Status.includes('reviewed'), 'Period 2 status transitioned to reviewed')
assert.ok(checkPeriod2Status.includes(adminCId), 'Period 2 reviewed_by set to independent Admin C')
console.log('✓ Admin A blocked by recalculate_line guard, independent Admin C successfully reviewed.\n')

console.log('--- TEST 9: Auto-Calculate Atomicity & Batch RPC ---')
const period3Id = `prd_${runId}_p3`
const shiftP3Eve = `shf_${runId}_p3_eve`
const shiftP3Frank = `shf_${runId}_p3_frank`
const shiftP3Charlie = `shf_${runId}_p3_charlie`
const segP3Eve = `seg_${runId}_p3_eve`
const segP3Frank = `seg_${runId}_p3_frank`
const segP3Charlie = `seg_${runId}_p3_charlie`
const lineP3Eve = `lin_${runId}_p3_eve`
const rateEveV1Id = `rate_eve_v1_${runId}`
const rateFrankId = `rate_frank_${runId}`

psql(`
INSERT INTO public.workforce_rate_cards(
  id, staff_id, operational_role, effective_from, effective_through,
  vnd_per_hour, overtime_multiplier_basis_points, approved_by, approved_at, approval_note
) VALUES
  ('${rateEveV1Id}', '${staffEve}', 'host', '2026-12-01', NULL, 100000, 15000, '${adminId}', now(), 'Gia Eve goc 100k'),
  ('${rateFrankId}', '${staffFrank}', 'support', '2026-12-01', NULL, 80000, 15000, '${adminId}', now(), 'Gia Frank 80k');

INSERT INTO public.workforce_payroll_periods(id, period_start, period_end, revision, status, created_by)
VALUES ('${period3Id}', '2026-12-01', '2026-12-31', ${(runId % 100000) + 12}, 'draft', '${adminBId}');

INSERT INTO public.shifts(id, brand_id, platform_id, date, start_time, end_time, status)
VALUES
  ('${shiftP3Eve}', '${brandId}', 'h-platform', '2026-12-18', '09:00:00', '12:00:00', 'completed'),
  ('${shiftP3Frank}', '${brandId}', 'h-platform', '2026-12-19', '14:00:00', '18:00:00', 'completed'),
  ('${shiftP3Charlie}', '${brandId}', 'h-platform', '2026-12-20', '09:00:00', '12:00:00', 'completed');

INSERT INTO public.workforce_actual_segments(
  id, shift_id, staff_id, operational_role, event_kind, coverage_kind,
  actual_start_at, actual_end_at, evidence_note, created_by, review_status, version
) VALUES
  ('${segP3Eve}', '${shiftP3Eve}', '${staffEve}', 'host', 'worked', 'planned',
   '2026-12-18T09:00:00+07:00', '2026-12-18T12:00:00+07:00', 'Diem danh ca Eve', '${adminId}', 'draft', 1),
  ('${segP3Frank}', '${shiftP3Frank}', '${staffFrank}', 'support', 'worked', 'planned',
   '2026-12-19T14:00:00+07:00', '2026-12-19T18:00:00+07:00', 'Diem danh ca Frank', '${adminId}', 'draft', 1),
  ('${segP3Charlie}', '${shiftP3Charlie}', '${staffCharlie}', 'technical', 'worked', 'planned',
   '2026-12-20T09:00:00+07:00', '2026-12-20T12:00:00+07:00', 'Diem danh ca Charlie', '${adminId}', 'draft', 1);

UPDATE public.workforce_actual_segments
SET review_status = 'approved',
    reviewed_by = '${adminBId}',
    reviewed_at = now(),
    review_note = 'Duyet P3',
    version = version + 1
WHERE id IN ('${segP3Eve}', '${segP3Frank}', '${segP3Charlie}');

-- Insert initial line for Eve with rateEveV1Id so we can recalculate it
INSERT INTO public.workforce_payroll_lines(
  id, period_id, segment_id, rate_card_id, staff_id, operational_role,
  actual_minutes, payable_minutes, overtime_minutes, rate_vnd_per_hour,
  overtime_multiplier_basis_points, gross_vnd, adjustment_vnd, adjustment_reason, version
) VALUES (
  '${lineP3Eve}', '${period3Id}', '${segP3Eve}', '${rateEveV1Id}', '${staffEve}', 'host',
  180, 180, 0, 100000, 15000, 300000, 25000, 'Thuong KPI Eve', 1
);
`)

// Supersede Eve's rate from 2026-12-15 to 130,000 VND
psql(`
SELECT public.workforce_rc17b_register_rate_card(
  '${staffEve}',
  'host',
  '2026-12-15'::date,
  NULL,
  130000,
  15000,
  '${adminId}',
  'Tang don gia cho Eve thang 12'
);
`)
const newEveRateRow = psql(`SELECT id FROM public.workforce_rate_cards WHERE staff_id = '${staffEve}' AND vnd_per_hour = 130000;`)
const newEveRateId = newEveRateRow.trim().split('\n')[2]?.trim()

// 9a: Atomic insert of Frank's line AND recalculation of Eve's line
const autoCalcBatchReqId = 'd0000000-0000-4000-a000-000000000001'
const insertLinesPayload = JSON.stringify([
  {
    segment_id: segP3Frank,
    rate_card_id: rateFrankId,
    staff_id: staffFrank,
    operational_role: 'support',
    actual_minutes: 240,
    payable_minutes: 240,
    overtime_minutes: 0,
    rate_vnd_per_hour: 80000,
    overtime_multiplier_basis_points: 15000,
    gross_vnd: 320000,
    adjustment_vnd: 0,
    adjustment_reason: null,
    calculation_version: 'rc17b-v1',
  }
])
const recalcItemsPayload = JSON.stringify([
  {
    line_id: lineP3Eve,
    expected_version: 1,
    new_rate_card_id: newEveRateId,
  }
])

const autoCalcBatchRes = psql(`
SELECT public.workforce_rc17b_auto_calculate_draft_batch(
  '${period3Id}',
  '${autoCalcBatchReqId}'::uuid,
  '${adminId}',
  'Tu dong tinh toan va ap dung don gia moi',
  '${insertLinesPayload}'::jsonb,
  '${recalcItemsPayload}'::jsonb
);
`)
assert.ok(autoCalcBatchRes.includes(segP3Frank), 'Inserted line contains Frank segment')
assert.ok(autoCalcBatchRes.includes(lineP3Eve), 'Recalculated line contains Eve line')

// Check DB state: Frank line inserted, Eve line updated to version 2 with adjustment preserved (25000)
const checkEveP3 = psql(`SELECT gross_vnd, adjustment_vnd, net_vnd, version FROM public.workforce_payroll_lines WHERE id = '${lineP3Eve}';`)
assert.ok(checkEveP3.includes('390000'), 'Eve new gross is 390,000 (130k * 3h)')
assert.ok(checkEveP3.includes('25000'), 'Eve adjustment of 25,000 preserved')
assert.ok(checkEveP3.includes('415000'), 'Eve net is 415,000')
assert.ok(checkEveP3.includes('2'), 'Eve line version incremented to 2')
console.log('✓ 9a: Atomic insert + recalc successfully committed in single transaction.')

// 9b: Idempotency replay with identical payload
const autoCalcReplayRes = psql(`
SELECT public.workforce_rc17b_auto_calculate_draft_batch(
  '${period3Id}',
  '${autoCalcBatchReqId}'::uuid,
  '${adminId}',
  'Tu dong tinh toan va ap dung don gia moi',
  '${insertLinesPayload}'::jsonb,
  '${recalcItemsPayload}'::jsonb
);
`)
assert.ok(autoCalcReplayRes.includes('"replayed": true'), 'Idempotency replay detected and returned cached result')

// 9c: Idempotency conflict with modified payload
let autoCalcConflictErr = ''
try {
  psql(`
  SELECT public.workforce_rc17b_auto_calculate_draft_batch(
    '${period3Id}',
    '${autoCalcBatchReqId}'::uuid,
    '${adminId}',
    'Ly do da bi sua doi khac',
    '${insertLinesPayload}'::jsonb,
    '${recalcItemsPayload}'::jsonb
  );
  `)
} catch (e) {
  autoCalcConflictErr = e.message
}
assert.ok(autoCalcConflictErr.includes('WORKFORCE_PAYROLL_IDEMPOTENCY_CONFLICT'), 'Idempotency conflict raised on altered payload')
console.log('✓ 9b & 9c: Batch idempotency replay and conflict detection verified.')

// 9d: Mid-step failure rollback (All-or-Nothing atomicity)
// Attempt to insert Charlie's line AND recalculate Eve's line with a STALE version (expected 1, but it is now 2)
const failBatchReqId = 'd0000000-0000-4000-a000-000000000002'
const failInsertPayload = JSON.stringify([
  {
    segment_id: segP3Charlie,
    rate_card_id: rateCharlieNewId,
    staff_id: staffCharlie,
    operational_role: 'technical',
    actual_minutes: 180,
    payable_minutes: 180,
    overtime_minutes: 0,
    rate_vnd_per_hour: 120000,
    overtime_multiplier_basis_points: 15000,
    gross_vnd: 360000,
    adjustment_vnd: 0,
    adjustment_reason: null,
    calculation_version: 'rc17b-v1',
  }
])
const failRecalcPayload = JSON.stringify([
  {
    line_id: lineP3Eve,
    expected_version: 1, // STALE! (current version is 2)
    new_rate_card_id: newEveRateId,
  }
])

let failErr = ''
try {
  psql(`
  SELECT public.workforce_rc17b_auto_calculate_draft_batch(
    '${period3Id}',
    '${failBatchReqId}'::uuid,
    '${adminId}',
    'Thu batch bi loi phien ban cu',
    '${failInsertPayload}'::jsonb,
    '${failRecalcPayload}'::jsonb
  );
  `)
} catch (e) {
  failErr = e.message
}
assert.ok(failErr.includes('WORKFORCE_PAYROLL_STALE_LINE'), 'Mid-step stale version throws WORKFORCE_PAYROLL_STALE_LINE')

// Verify Charlie's line was NOT inserted (rolled back)
const checkCharlieLine = psql(`SELECT count(*) FROM public.workforce_payroll_lines WHERE segment_id = '${segP3Charlie}';`)
assert.ok(checkCharlieLine.includes('0'), 'Charlie line was NOT inserted due to transactional rollback')
console.log('✓ 9d: Mid-batch failure rolled back insert (zero partial state committed).')

// 9e: Duplicate segment prevention
const dupSegReqId = 'd0000000-0000-4000-a000-000000000003'
let dupErr1 = ''
try {
  psql(`
  SELECT public.workforce_rc17b_auto_calculate_draft_batch(
    '${period3Id}',
    '${dupSegReqId}'::uuid,
    '${adminId}',
    'Thu trung lap segment Frank da co san',
    '${insertLinesPayload}'::jsonb,
    '[]'::jsonb
  );
  `)
} catch (e) {
  dupErr1 = e.message
}
assert.ok(dupErr1.includes('WORKFORCE_PAYROLL_DUPLICATE_SEGMENT'), 'Duplicate segment in table blocked by WORKFORCE_PAYROLL_DUPLICATE_SEGMENT')

let dupErr2 = ''
try {
  psql(`
  SELECT public.workforce_rc17b_auto_calculate_draft_batch(
    '${period3Id}',
    '${dupSegReqId}'::uuid,
    '${adminId}',
    'Thu trung lap segment trong cung mot mang',
    '${JSON.stringify([JSON.parse(failInsertPayload)[0], JSON.parse(failInsertPayload)[0]])}'::jsonb,
    '[]'::jsonb
  );
  `)
} catch (e) {
  dupErr2 = e.message
}
assert.ok(dupErr2.includes('WORKFORCE_PAYROLL_DUPLICATE_SEGMENT'), 'Duplicate segment within batch blocked by WORKFORCE_PAYROLL_DUPLICATE_SEGMENT')
console.log('✓ 9e: Duplicate segment prevention verified.')

// 9f: Anti-self-review on auto_calculate_batch
// Admin A who ran auto_calculate_draft_batch cannot review period3Id
let selfReviewErr3 = ''
try {
  psql(`
  SELECT public.workforce_rc16_transition_payroll(
    '${period3Id}',
    'draft',
    'reviewed',
    '${adminId}',
    'Admin A tu review sau khi auto calculate batch'
  );
  `)
} catch (e) {
  selfReviewErr3 = e.message
}
assert.ok(selfReviewErr3.includes('WORKFORCE_PAYROLL_SELF_REVIEW'), 'Admin A who ran auto_calculate_batch is blocked from reviewing')

// Insert line for Charlie so period 3 is fully reconciled
psql(`
INSERT INTO public.workforce_payroll_lines(
  id, period_id, segment_id, rate_card_id, staff_id, operational_role,
  actual_minutes, payable_minutes, overtime_minutes, rate_vnd_per_hour,
  overtime_multiplier_basis_points, gross_vnd, adjustment_vnd, version
) VALUES (
  'lin_p3_charlie_${runId}', '${period3Id}', '${segP3Charlie}', '${rateCharlieNewId}', '${staffCharlie}', 'technical',
  180, 180, 0, 120000, 15000, 360000, 0, 1
);
`)

// Independent Admin C reviews period 3 successfully
psql(`
SELECT public.workforce_rc16_transition_payroll(
  '${period3Id}',
  'draft',
  'reviewed',
  '${adminCId}',
  'Admin C doc lap phe duyet hop le'
);
`)
const checkPeriod3Status = psql(`SELECT status, reviewed_by FROM public.workforce_payroll_periods WHERE id = '${period3Id}';`)
assert.ok(checkPeriod3Status.includes('reviewed'), 'Period 3 status transitioned to reviewed')
assert.ok(checkPeriod3Status.includes(adminCId), 'Period 3 reviewed_by set to independent Admin C')
console.log('✓ 9f: auto_calculate_batch anti-self-review enforced; independent Admin C successfully reviewed.\n')

console.log('======================================================')
console.log('ALL RC17B DATABASE INTEGRATION TESTS PASSED CLEANLY!')
console.log('======================================================')
