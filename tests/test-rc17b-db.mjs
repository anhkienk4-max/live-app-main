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
const adminId = `adm_${runId}`
const adminBId = `adm_b_${runId}`
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
INSERT INTO public.brands(id, name, status)
VALUES ('${brandId}', 'Test Brand ${runId}', 'active')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.business_users(id, email, full_name, system_permission, status, account_status)
VALUES
  ('${adminId}', '${adminId}@test.local', 'Admin Primary', 'admin', 'active', 'active'),
  ('${adminBId}', '${adminBId}@test.local', 'Admin Secondary', 'admin', 'active', 'active'),
  ('${staffAlice}', '${staffAlice}@test.local', 'Alice Host', 'member', 'active', 'active'),
  ('${staffBob}', '${staffBob}@test.local', 'Bob Support', 'member', 'active', 'active'),
  ('${staffCharlie}', '${staffCharlie}@test.local', 'Charlie Tech', 'member', 'active', 'active')
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

console.log('======================================================')
console.log('ALL RC17B DATABASE INTEGRATION TESTS PASSED CLEANLY!')
console.log('======================================================')
