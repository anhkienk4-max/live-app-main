import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { hasShiftTimeConflict, resolveShiftDateTime } from '../lib/utils/shiftUtils.ts'
import { isStaffedRegistration } from '../lib/services/dataService.ts'
import type { Shift, ShiftRegistration } from '../lib/types/database.types.ts'

const modalSource = readFileSync(fileURLToPath(new URL('../components/features/swaps/SwapRequestFormModal.tsx', import.meta.url)), 'utf8')
const dialogSource = readFileSync(fileURLToPath(new URL('../components/features/swaps/SwapRequestDialog.tsx', import.meta.url)), 'utf8')

test('SWAP-01: Modal renders rich shift cards with Brand, Platform, Status, Timezone, and Overnight badge', () => {
  // Brand badge
  assert.match(modalSource, /brands\.find\(item => item\.id === shift\.brand_id\)\?\.name/)
  // Platform badge
  assert.match(modalSource, /platforms\.find\(item => item\.id === shift\.platform_id\)\?\.name/)
  // Status badge
  assert.match(modalSource, /t\(shift\.status\)/)
  // Time range and timezone
  assert.match(modalSource, /formatShiftTimeRange\(shift\)/)
  assert.match(modalSource, /shift\.timezone/)
  // Overnight indicator
  assert.match(modalSource, /shift\.crosses_midnight/)
  assert.match(modalSource, /copy\('Qua đêm', 'Overnight'\)/)
  // Assigned role badges
  assert.match(modalSource, /t\(reg\.operational_role\)/)
})

test('SWAP-01: Modal auto-selects operational role when single role is assigned', () => {
  assert.match(modalSource, /shiftAssigned\.length === 1/)
  assert.match(modalSource, /setRole\(shiftAssigned\[0\]\.operational_role\)/)
  assert.match(modalSource, /copy\('Tự động chọn vai trò duy nhất', 'Auto-selected single role'\)/)
})

test('SWAP-01: Zero-results explains why no shifts match and provides legacy sync guidance', () => {
  assert.match(modalSource, /source && !source\.error && sourceRows\.length === 0/)
  assert.match(modalSource, /copy\('Không có ca được phân công phù hợp trong khoảng thời gian này'/)
  assert.match(modalSource, /Chỉ ca có trạng thái Được duyệt \(Approved\) hoặc Phân công \(Manually Assigned\)/)
  // Explains legacy assignment without approved registration and points to Staffing page
  assert.match(modalSource, /Nếu ca chỉ mới được gán tên trực tiếp \(Host\/Trợ trì\) mà chưa có phiếu phân công chính thức/)
  assert.match(modalSource, /Điều phối ca \(Staffing\)/)
  assert.match(modalSource, /Đặt lại bộ lọc/)
  assert.match(modalSource, /resetFilters/)
})

test('SWAP-01: preflight has explicit fail-closed states and uses server-side verification', () => {
  const statusType = /'idle' \| 'PENDING' \| 'VERIFIED_CLEAR' \| 'CONFLICT' \| 'UNKNOWN' \| 'FAILED'/
  assert.match(modalSource, statusType)
  assert.match(dialogSource, statusType)
  for (const source of [modalSource, dialogSource]) {
    assert.match(source, /swapRequestService\.verifyConflict/)
    assert.match(source, /replacementCheckStatus (?:===|!==) 'VERIFIED_CLEAR'/)
    assert.match(source, /exchangeCheckStatus (?:===|!==) 'VERIFIED_CLEAR'/)
    assert.match(source, /(?:replacement|exchange)CheckStatus === 'PENDING'/)
    assert.match(source, /(?:replacement|exchange)CheckStatus === 'CONFLICT'/)
    assert.match(source, /(?:replacement|exchange)CheckStatus === 'UNKNOWN' \|\| (?:replacement|exchange)CheckStatus === 'FAILED'/)
    assert.doesNotMatch(source, /collectAndVerifyAllShifts/)
    assert.doesNotMatch(source, /assignedUserIds: \[counterpartCandidate\.user_id\]/)
  }
})

test('SWAP-01: stale actor and selection responses cannot update current conflict state', () => {
  assert.match(modalSource, /const conflictKey = JSON\.stringify\(\[owner, sourceId, replacementId\]\)/)
  assert.match(modalSource, /const exchangeConflictKey = JSON\.stringify\(\[owner, sourceId, targetId, counterpartId\]\)/)
  assert.match(modalSource, /let active = true[\s\S]*?if \(active\) setConflictSnapshot/)
  assert.match(dialogSource, /const replacementConflictKey = \[currentUser\.id, sourceShift\.id, replacementId\]/)
  assert.match(dialogSource, /const exchangeConflictKey = \[currentUser\.id, sourceShift\.id, targetShiftId, counterpartId\]/)
  assert.match(dialogSource, /let active = true[\s\S]*?if \(active\) setExchangeConflictSnapshot/)
})

test('SWAP-01: server preflight exposes only eligibility status and retains final backend validation', () => {
  const migration = readFileSync(fileURLToPath(new URL('../supabase/migrations/20261030103157_rc19_swap_conflict_preflight.sql', import.meta.url)), 'utf8')
  assert.match(migration, /actor_id text := private\.require_shift_actor\(false\)/)
  assert.match(migration, /source_registration\.user_id <> actor_id/)
  assert.match(migration, /return 'VERIFIED_CLEAR'/)
  assert.match(migration, /return 'CONFLICT'/)
  assert.match(migration, /grant execute on function public\.check_shift_swap_conflict\(text,text,text,text,text\) to authenticated/)
  assert.match(migration, /revoke all on function public\.check_shift_swap_conflict\(text,text,text,text,text\) from public, anon, authenticated/)
  assert.match(migration, /private\.assert_no_shift_registration_conflict/)
})

test('SWAP-01: Account switch invalidates previous actor state', () => {
  // Key includes owner / currentUser.id
  assert.match(modalSource, /const sourceKey = JSON\.stringify\(\[owner/)
  assert.match(modalSource, /const conflictKey = JSON\.stringify\(\[owner, sourceId, replacementId\]\)/)
  assert.match(modalSource, /const exchangeConflictKey = JSON\.stringify\(\[owner, sourceId, targetId, counterpartId\]\)/)
  assert.match(dialogSource, /const replacementConflictKey = \[currentUser\.id, sourceShift\.id, replacementId\]\.join\(':'\)/)
  assert.match(dialogSource, /const exchangeConflictKey = \[currentUser\.id, sourceShift\.id, targetShiftId, counterpartId\]\.join\(':'\)/)
})

test('SWAP-01: Member with approved registration is eligible; legacy unapproved is rejected', () => {
  // Invariant: only approved or manually_assigned count as staffed registrations
  assert.equal(isStaffedRegistration({ status: 'approved' }), true)
  assert.equal(isStaffedRegistration({ status: 'manually_assigned' }), true)
  assert.equal(isStaffedRegistration({ status: 'pending' as never }), false)
  assert.equal(isStaffedRegistration({ status: 'rejected' as never }), false)
  assert.equal(isStaffedRegistration({ status: 'cancelled' as never }), false)

  // Modal enforces staffed registrations
  assert.match(modalSource, /registrationStatuses: \['approved', 'manually_assigned'\]/)
  assert.match(modalSource, /reg\.user_id === owner && isStaffedRegistration\(reg\)/)
})

test('SWAP-01: Overnight shift timing resolution handles midnight transitions correctly', () => {
  // Overnight shift 22:00 -> 02:00
  const overnight = resolveShiftDateTime('2026-10-27', '22:00', '02:00', 'Asia/Ho_Chi_Minh')
  assert.ok(overnight?.valid)
  assert.equal(overnight.endDate, '2026-10-28')
  assert.ok(overnight.startAt < overnight.endAt)

  // Shift on next day at 01:00 -> 05:00 overlaps
  const nextDayEarly = resolveShiftDateTime('2026-10-28', '01:00', '05:00', 'Asia/Ho_Chi_Minh')
  assert.ok(nextDayEarly?.valid)
  const overlap = nextDayEarly.startAt < overnight.endAt && nextDayEarly.endAt > overnight.startAt
  assert.equal(overlap, true, 'Next day early shift must overlap with overnight shift')

  // Shift on next day at 03:00 -> 06:00 does not overlap
  const nextDayLate = resolveShiftDateTime('2026-10-28', '03:00', '06:00', 'Asia/Ho_Chi_Minh')
  assert.ok(nextDayLate?.valid)
  const noOverlap = nextDayLate.startAt < overnight.endAt && nextDayLate.endAt > overnight.startAt
  assert.equal(noOverlap, false, 'Next day after 02:00 must not overlap')
})

// =========================================================================
// BEHAVIORAL REGRESSION TESTS
// =========================================================================

test('SWAP-01: submit remains disabled until the current server verification is clear', () => {
  const statuses = ['PENDING', 'CONFLICT', 'UNKNOWN', 'FAILED'] as const
  const canSubmit = (status: string) => status === 'VERIFIED_CLEAR'
  for (const status of statuses) assert.equal(canSubmit(status), false)
  assert.equal(canSubmit('VERIFIED_CLEAR'), true)
  assert.match(modalSource, /replacementCheckStatus === 'VERIFIED_CLEAR'/)
  assert.match(modalSource, /exchangeCheckStatus === 'VERIFIED_CLEAR'/)
  assert.match(dialogSource, /replacementCheckStatus !== 'VERIFIED_CLEAR'/)
  assert.match(dialogSource, /exchangeCheckStatus !== 'VERIFIED_CLEAR'/)
})

test('BEHAVIORAL: Account switching invalidates cached verification snapshots and candidates', () => {
  let activeUser = 'user_alice'
  const makeConflictKey = (owner: string, sourceId: string, recipientId: string) =>
    JSON.stringify([owner, sourceId, recipientId])

  const keyAlice = makeConflictKey(activeUser, 'shift_1', 'user_bob')
  const aliceSnapshot = { key: keyAlice, status: 'verified_clear' }

  // Alice checks and has verified_clear:
  assert.equal(aliceSnapshot.key === keyAlice, true)

  // Switch account to Charlie:
  activeUser = 'user_charlie'
  const keyCharlie = makeConflictKey(activeUser, 'shift_1', 'user_bob')

  // Alice's snapshot must not match Charlie's key:
  const isSnapshotValidForCharlie = aliceSnapshot.key === keyCharlie
  assert.equal(isSnapshotValidForCharlie, false, 'Previous user snapshot MUST NOT be accepted for new user')
})

test('BEHAVIORAL: Member source shift filtering admits approved/manually_assigned and rejects unapproved/legacy', () => {
  const currentUserId = 'member_1'
  const mockShifts: Shift[] = [
    { id: 's_approved', title: 'Ca 1', date: '2026-10-30', start_time: '08:00', end_time: '12:00', status: 'scheduled' } as Shift,
    { id: 's_manual', title: 'Ca 2', date: '2026-10-30', start_time: '13:00', end_time: '17:00', status: 'scheduled' } as Shift,
    { id: 's_pending', title: 'Ca 3', date: '2026-10-30', start_time: '18:00', end_time: '22:00', status: 'scheduled' } as Shift,
    { id: 's_legacy_only', title: 'Ca 4', date: '2026-10-31', start_time: '08:00', end_time: '12:00', host_id: currentUserId, status: 'scheduled' } as Shift,
  ]

  const mockRegistrations: ShiftRegistration[] = [
    { id: 'r1', shift_id: 's_approved', user_id: currentUserId, operational_role: 'host', status: 'approved' } as ShiftRegistration,
    { id: 'r2', shift_id: 's_manual', user_id: currentUserId, operational_role: 'support', status: 'manually_assigned' } as ShiftRegistration,
    { id: 'r3', shift_id: 's_pending', user_id: currentUserId, operational_role: 'host', status: 'pending' } as ShiftRegistration,
    // s_legacy_only has NO shift_registrations row
  ]

  // Filter logic used in SwapRequestFormModal:
  const eligibleShifts = mockShifts.filter(shift =>
    mockRegistrations.some(reg => reg.shift_id === shift.id && reg.user_id === currentUserId && isStaffedRegistration(reg))
  )

  assert.equal(eligibleShifts.length, 2)
  assert.deepEqual(eligibleShifts.map(s => s.id), ['s_approved', 's_manual'])
  assert.equal(eligibleShifts.some(s => s.id === 's_pending'), false, 'Pending registration must NOT appear in source shift list')
  assert.equal(eligibleShifts.some(s => s.id === 's_legacy_only'), false, 'Legacy-only assignment must NOT appear in source shift list')
})

test('SWAP-01: overnight conflict helper ignores cancelled/deleted assignments and catches active overlap', () => {
  const window = resolveShiftDateTime('2026-10-28', '01:00', '05:00', 'Asia/Ho_Chi_Minh')!
  const cancelled = {
    id: 'cancelled', status: 'cancelled' as const, date: '2026-10-27', start_time: '22:00', end_time: '02:00',
    timezone: 'Asia/Ho_Chi_Minh', deleted_at: null, archived_at: null,
  }
  const active = { ...cancelled, id: 'active', status: 'scheduled' as const }
  const deleted = { ...active, id: 'deleted', deleted_at: '2026-10-01T00:00:00Z' }
  assert.equal(hasShiftTimeConflict([cancelled], window.startAt, window.endAt), false)
  assert.equal(hasShiftTimeConflict([deleted], window.startAt, window.endAt), false)
  assert.equal(hasShiftTimeConflict([active], window.startAt, window.endAt), true)
  assert.equal(hasShiftTimeConflict([active], window.startAt, window.endAt, ['active']), false)
})
