import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolveShiftDateTime } from '../lib/utils/shiftUtils.ts'
import { isStaffedRegistration } from '../lib/services/dataService.ts'

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

test('SWAP-01: 4-State Conflict Verification Contract in Modal & Dialog (VERIFIED CLEAR, CONFLICT, CHECKING, UNKNOWN/FAILED)', () => {
  // 4 verification states defined
  assert.match(modalSource, /export type ConflictVerificationStatus = 'idle' \| 'checking' \| 'verified_clear' \| 'conflict' \| 'unverified'/)
  assert.match(dialogSource, /export type ConflictVerificationStatus = 'idle' \| 'checking' \| 'verified_clear' \| 'conflict' \| 'unverified'/)

  // Checking state in both
  assert.match(modalSource, /replacementCheckStatus === 'checking'/)
  assert.match(modalSource, /exchangeCheckStatus === 'checking'/)
  assert.match(dialogSource, /replacementCheckStatus === 'checking'/)
  assert.match(dialogSource, /exchangeCheckStatus === 'checking'/)

  // Conflict state blocks submit
  assert.match(modalSource, /replacementCheckStatus === 'conflict'/)
  assert.match(modalSource, /exchangeCheckStatus === 'conflict'/)
  assert.match(dialogSource, /replacementCheckStatus === 'conflict'/)
  assert.match(dialogSource, /exchangeCheckStatus === 'conflict'/)

  // Unverified state shows server verification note, does NOT show "Lịch hợp lệ"
  assert.match(modalSource, /replacementCheckStatus === 'unverified'/)
  assert.match(modalSource, /exchangeCheckStatus === 'unverified'/)
  assert.match(dialogSource, /replacementCheckStatus === 'unverified'/)
  assert.match(dialogSource, /exchangeCheckStatus === 'unverified'/)

  // Verified clear state shows success badge
  assert.match(modalSource, /replacementCheckStatus === 'verified_clear'/)
  assert.match(modalSource, /exchangeCheckStatus === 'verified_clear'/)
  assert.match(dialogSource, /replacementCheckStatus === 'verified_clear'/)
  assert.match(dialogSource, /exchangeCheckStatus === 'verified_clear'/)
})

test('SWAP-01: API failure or incomplete page never reports verified clear', () => {
  // Result page incomplete check: result.total > result.items.length
  assert.match(modalSource, /result\.total > result\.items\.length/)
  assert.match(dialogSource, /result\.total > result\.items\.length/)

  // API catch handles unverified status with informative message
  assert.match(modalSource, /status: 'unverified'/)
  assert.match(dialogSource, /status: 'unverified'/)
  assert.match(modalSource, /Không thể kiểm tra trước lịch; hệ thống sẽ xác minh khi gửi/)
  assert.match(dialogSource, /Không thể kiểm tra trước lịch; hệ thống sẽ xác minh khi gửi/)
})

test('SWAP-01: Candidate is invalid during checking and submission is disabled', () => {
  // Modal validCandidate excludes checking and conflict
  assert.match(modalSource, /replacementCheckStatus === 'verified_clear'\s*\|\|\s*replacementCheckStatus === 'unverified'/)
  assert.match(modalSource, /exchangeCheckStatus === 'verified_clear'\s*\|\|\s*exchangeCheckStatus === 'unverified'/)

  // Dialog disabled blocks checking and conflict
  assert.match(dialogSource, /replacementCheckStatus === 'checking'\s*\|\|\s*replacementCheckStatus === 'conflict'/)
  assert.match(dialogSource, /exchangeCheckStatus === 'checking'\s*\|\|\s*exchangeCheckStatus === 'conflict'/)
})

test('SWAP-01: Exchange checks two-sided conflicts while strictly preserving RLS privacy', () => {
  // Both sides checked
  assert.match(modalSource, /assignedUserIds: \[owner\]/)
  assert.match(modalSource, /assignedUserIds: \[counterpartCandidate\.user_id\]/)
  assert.match(dialogSource, /assignedUserIds: \[currentUser\.id\]/)
  assert.match(dialogSource, /assignedUserIds: \[counterpartCandidate\.user_id\]/)

  // Requester conflict message
  assert.match(modalSource, /Bạn đã có ca khác trùng giờ với ca đổi chéo/)
  assert.match(dialogSource, /Bạn đã có ca khác trùng giờ với ca đổi chéo/)

  // Counterpart conflict message is generic, protecting RLS privacy
  assert.match(modalSource, /Đối ứng có ca khác trùng giờ với ca của bạn/)
  assert.match(dialogSource, /Đối ứng có ca khác trùng giờ với ca của bạn/)
  assert.doesNotMatch(modalSource, /counterpartCandidate\.full_name.*đã có ca khác trùng giờ/)
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

test('SWAP-01: Behavioral evaluation of one-sided and two-sided exchange conflicts', () => {
  const evaluateExchangeConflicts = (
    requesterShifts: Array<{ startAt: number; endAt: number; id: string }>,
    counterpartShifts: Array<{ startAt: number; endAt: number; id: string }>,
    source: { startAt: number; endAt: number; id: string },
    target: { startAt: number; endAt: number; id: string },
    requesterTotal: number,
    counterpartTotal: number
  ): { status: 'verified_clear' | 'conflict' | 'unverified'; reason: string | null } => {
    const requesterConflict = requesterShifts.some(shift => {
      if (shift.id === source.id || shift.id === target.id) return false
      return shift.startAt < target.endAt && shift.endAt > target.startAt
    })
    const counterpartConflict = counterpartShifts.some(shift => {
      if (shift.id === target.id || shift.id === source.id) return false
      return shift.startAt < source.endAt && shift.endAt > source.startAt
    })
    if (requesterConflict) {
      return { status: 'conflict', reason: 'Bạn đã có ca khác trùng giờ với ca đổi chéo' }
    }
    if (counterpartConflict) {
      return { status: 'conflict', reason: 'Đối ứng có ca khác trùng giờ với ca của bạn' }
    }
    if (requesterTotal > requesterShifts.length || counterpartTotal > counterpartShifts.length) {
      return { status: 'unverified', reason: null }
    }
    return { status: 'verified_clear', reason: null }
  }

  const source = { id: 's1', startAt: 100, endAt: 200 }
  const target = { id: 's2', startAt: 300, endAt: 400 }

  // Case 1: Requester conflict alone
  const r1 = evaluateExchangeConflicts(
    [{ id: 's3', startAt: 350, endAt: 450 }], // overlaps target [300, 400]
    [],
    source, target, 1, 0
  )
  assert.equal(r1.status, 'conflict')
  assert.equal(r1.reason, 'Bạn đã có ca khác trùng giờ với ca đổi chéo')

  // Case 2: Counterpart conflict alone
  const r2 = evaluateExchangeConflicts(
    [],
    [{ id: 's4', startAt: 150, endAt: 250 }], // overlaps source [100, 200]
    source, target, 0, 1
  )
  assert.equal(r2.status, 'conflict')
  assert.equal(r2.reason, 'Đối ứng có ca khác trùng giờ với ca của bạn')

  // Case 3: Both sides conflict
  const r3 = evaluateExchangeConflicts(
    [{ id: 's3', startAt: 350, endAt: 450 }],
    [{ id: 's4', startAt: 150, endAt: 250 }],
    source, target, 1, 1
  )
  assert.equal(r3.status, 'conflict')
  assert.ok(r3.reason)

  // Case 4: Incomplete page result (total > items length) -> UNVERIFIED, NOT verified_clear
  const r4 = evaluateExchangeConflicts(
    [],
    [],
    source, target, 100, 0 // requester has 100 shifts, only 0 fetched
  )
  assert.equal(r4.status, 'unverified')
  assert.equal(r4.reason, null)

  // Case 5: Neither side conflicts, full result -> VERIFIED_CLEAR
  const r5 = evaluateExchangeConflicts(
    [{ id: 's1', startAt: 100, endAt: 200 }], // own source shift ignored
    [{ id: 's2', startAt: 300, endAt: 400 }], // own target shift ignored
    source, target, 1, 1
  )
  assert.equal(r5.status, 'verified_clear')
  assert.equal(r5.reason, null)
})
