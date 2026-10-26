import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolveShiftDateTime } from '../lib/utils/shiftUtils.ts'

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

test('SWAP-01: Zero-results explains why no shifts match and provides filter reset', () => {
  assert.match(modalSource, /source && !source\.error && sourceRows\.length === 0/)
  assert.match(modalSource, /copy\('Không có ca được phân công phù hợp trong khoảng thời gian này'/)
  assert.match(modalSource, /Chỉ ca có trạng thái Được duyệt \(Approved\) hoặc Phân công \(Manually Assigned\)/)
  assert.match(modalSource, /Đặt lại bộ lọc/)
  assert.match(modalSource, /resetFilters/)
})

test('SWAP-01: PASS candidate selector filters by role capability and verifies schedule conflicts', () => {
  assert.match(modalSource, /staffOnlyEligible/)
  assert.match(modalSource, /item\.operational_roles\?\.includes\(sourceRegistration\.operational_role\)/)
  assert.match(modalSource, /assignedUserIds: \[replacementId\]/)
  assert.match(modalSource, /conflict\?\.reason/)
  assert.match(modalSource, /copy\('Lịch trống - đủ điều kiện nhận ca', 'Schedule available - recipient is eligible'\)/)
})

test('SWAP-01: Exchange checks two-sided schedule conflicts for requester and counterpart', () => {
  assert.match(modalSource, /exchangeConflictSnapshot/)
  assert.match(modalSource, /assignedUserIds: \[owner\]/)
  assert.match(modalSource, /assignedUserIds: \[counterpartCandidate\.user_id\]/)
  assert.match(modalSource, /requesterConflict/)
  assert.match(modalSource, /counterpartConflict/)
  assert.match(modalSource, /copy\('Lịch hai bên hợp lệ - sẵn sàng gửi yêu cầu đổi chéo'/)
})

test('SWAP-01: Shift detail dialog also renders rich shift badges and checks replacement conflict', () => {
  assert.match(dialogSource, /sourceShift\.crosses_midnight/)
  assert.match(dialogSource, /Qua đêm/)
  assert.match(dialogSource, /t\(sourceRegistration\.operational_role\)/)
  assert.match(dialogSource, /assignedUserIds: \[replacementId\]/)
  assert.match(dialogSource, /conflictReason/)
  assert.match(dialogSource, /Lịch trống - sẵn sàng nhận ca/)
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
