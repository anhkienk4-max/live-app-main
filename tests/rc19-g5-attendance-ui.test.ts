import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  calculateAttendanceTimePolicy,
  parseMinutesFromTimeString,
  formatMinutesToTimeString,
} from '../lib/utils/selfAttendanceContract'
import { formatAttendanceErrorMessage } from '../components/features/attendance/SelfAttendancePanel'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

test('G5-01: Time Policy — Host arrival deadline (T-15m), Check-in window open (T-120m), Check-out close (T+120m) in Asia/Ho_Chi_Minh', () => {
  const policy = calculateAttendanceTimePolicy('10:00', '18:00', 'host', 'Asia/Ho_Chi_Minh')

  assert.equal(policy.timeZone, 'Asia/Ho_Chi_Minh')
  assert.equal(policy.checkInOpensTime, '08:00') // 10:00 - 120m
  assert.equal(policy.checkOutClosesTime, '20:00') // 18:00 + 120m
  assert.equal(policy.expectedArrivalTime, '09:45') // 10:00 - 15m
  assert.match(policy.expectedArrivalLabel, /09:45 \(T-15 phút\)/)
  assert.match(policy.checkInWindowLabel, /Mở từ 08:00 \(T-120 phút\)/)
  assert.match(policy.checkOutWindowLabel, /Đóng lúc 20:00 \(T\+120 phút\)/)
  assert.match(policy.compensationNotice, /không mặc định cộng lương/)
  assert.match(policy.compensationNotice, /không tự động trừ lương/)
})

test('G5-02: Time Policy — Support arrival deadline (T-30m), Check-in window open (T-120m), Check-out close (T+120m)', () => {
  const policy = calculateAttendanceTimePolicy('14:00', '22:00', 'support', 'Asia/Ho_Chi_Minh')

  assert.equal(policy.timeZone, 'Asia/Ho_Chi_Minh')
  assert.equal(policy.checkInOpensTime, '12:00') // 14:00 - 120m
  assert.equal(policy.checkOutClosesTime, '00:00') // 22:00 + 120m (wrapped to 00:00)
  assert.equal(policy.expectedArrivalTime, '13:30') // 14:00 - 30m
  assert.match(policy.expectedArrivalLabel, /13:30 \(T-30 phút\)/)
})

test('G5-03: Time Policy — Technical flexible schedule without fixed arrival deadline', () => {
  const policy = calculateAttendanceTimePolicy('09:00', '17:00', 'technical', 'Asia/Ho_Chi_Minh')

  assert.equal(policy.timeZone, 'Asia/Ho_Chi_Minh')
  assert.equal(policy.checkInOpensTime, '07:00') // 09:00 - 120m
  assert.equal(policy.checkOutClosesTime, '19:00') // 17:00 + 120m
  assert.equal(policy.expectedArrivalTime, null)
  assert.match(policy.expectedArrivalLabel, /Theo sắp xếp ca trực \(Không áp dụng mốc cố định\)/)
})

test('G5-04: Time Policy — Cross-midnight / overnight shifts and boundary wrapping', () => {
  // Case A: 23:00 to 02:00 overnight shift
  const policyA = calculateAttendanceTimePolicy('23:00', '02:00', 'host', 'Asia/Ho_Chi_Minh')
  assert.equal(policyA.checkInOpensTime, '21:00') // 23:00 - 120m
  assert.equal(policyA.checkOutClosesTime, '04:00') // 02:00 + 120m
  assert.equal(policyA.expectedArrivalTime, '22:45') // 23:00 - 15m

  // Case B: Early morning shift 00:30 to 08:30 (opens previous evening 22:30)
  const policyB = calculateAttendanceTimePolicy('00:30', '08:30', 'support', 'Asia/Ho_Chi_Minh')
  assert.equal(policyB.checkInOpensTime, '22:30') // 00:30 - 120m wraps backwards across midnight
  assert.equal(policyB.expectedArrivalTime, '00:00') // 00:30 - 30m
  assert.equal(policyB.checkOutClosesTime, '10:30') // 08:30 + 120m

  // Case C: parse and format helpers
  assert.equal(parseMinutesFromTimeString('00:00'), 0)
  assert.equal(parseMinutesFromTimeString('23:59'), 1439)
  assert.equal(formatMinutesToTimeString(-30), '23:30')
  assert.equal(formatMinutesToTimeString(1445), '00:05')
})

test('G5-05: SelfAttendancePanel — Independent event cards (Card A & Card B), state isolation, and idempotency contract', () => {
  const panelPath = path.join(repoRoot, 'components/features/attendance/SelfAttendancePanel.tsx')
  const content = fs.readFileSync(panelPath, 'utf8')

  // Invariant 1: Idempotency UUID assignment per event kind
  assert.match(
    content,
    /requestIds\.current\[kind\]\s*\?\?=\s*crypto\.randomUUID\(\)/,
    'Must maintain requestIds.current[kind] ??= crypto.randomUUID() idempotency guard'
  )

  // Invariant 2: Asia/Ho_Chi_Minh timezone
  assert.match(
    content,
    /Asia\/Ho_Chi_Minh/,
    'Must explicitly configure and display Asia/Ho_Chi_Minh'
  )

  // Invariant 3: Card A & Card B data-testid presence
  assert.match(content, /data-testid="attendance-card-checkin"/, 'Must have distinct checkin card')
  assert.match(content, /data-testid="attendance-card-checkout"/, 'Must have distinct checkout card')

  // Invariant 4: Independent state variables (never shared)
  assert.match(content, /photoCheckIn/, 'Must have photoCheckIn state')
  assert.match(content, /photoCheckOut/, 'Must have photoCheckOut state')
  assert.match(content, /previewCheckIn/, 'Must have previewCheckIn state')
  assert.match(content, /previewCheckOut/, 'Must have previewCheckOut state')
  assert.match(content, /busyCheckIn/, 'Must have busyCheckIn state')
  assert.match(content, /busyCheckOut/, 'Must have busyCheckOut state')
  assert.match(content, /errorCheckIn/, 'Must have errorCheckIn state')
  assert.match(content, /errorCheckOut/, 'Must have errorCheckOut state')
})

test('G5-06: Check-out Locked State — Card B is visible and explains locked requirement when not checked in', () => {
  const panelPath = path.join(repoRoot, 'components/features/attendance/SelfAttendancePanel.tsx')
  const content = fs.readFileSync(panelPath, 'utf8')

  // Invariant 1: Locked alert banner
  assert.match(
    content,
    /data-testid="attendance-checkout-locked-alert"/,
    'Must render explicit locked alert for check-out when check-in is not recorded'
  )

  // Invariant 2: Lock message explanation
  assert.match(
    content,
    /Cần hoàn tất Check-in thành công trước khi có thể chụp ảnh và ghi nhận Check-out/,
    'Must explain clearly why check-out is locked'
  )

  // Invariant 3: Card B is rendered alongside Card A in 2-column grid, never hidden
  assert.match(
    content,
    /grid grid-cols-1 md:grid-cols-2 gap-4/,
    'Must display both cards side-by-side on desktop'
  )
})

test('G5-07: Staff, Segment & Time Policy Context — Displays live hours, segment code, and wage disclaimer', () => {
  const panelPath = path.join(repoRoot, 'components/features/attendance/SelfAttendancePanel.tsx')
  const content = fs.readFileSync(panelPath, 'utf8')

  assert.match(content, /data-testid="attendance-live-shift-context"/, 'Must render shift context section')
  assert.match(content, /data-testid="attendance-staff-context"/, 'Must render approved staff context')
  assert.match(content, /data-testid="attendance-segment-context"/, 'Must render segment context')
  assert.match(content, /data-testid="attendance-time-policy-section"/, 'Must render time policy section')
  assert.match(content, /data-testid="attendance-time-policy-disclaimer"/, 'Must render wage policy disclaimer')
})

test('G5-08: AttendancePhotoReviewPanel — Self-review prevention and evidence policy notice', () => {
  const reviewPanelPath = path.join(repoRoot, 'components/features/attendance/AttendancePhotoReviewPanel.tsx')
  const content = fs.readFileSync(reviewPanelPath, 'utf8')

  // Invariant 1: Policy notice banner
  assert.match(
    content,
    /data-testid="photo-review-policy-notice"/,
    'Must display policy notice banner distinguishing photo review from wage approval'
  )

  // Invariant 2: Self-review check
  assert.match(
    content,
    /currentUser\?\.id\s*&&\s*currentUser\.id === item\.staff_id/,
    'Must check currentUser.id against item.staff_id to prevent self-review'
  )

  // Invariant 3: Self-review prevention alert
  assert.match(
    content,
    /data-testid="self-review-prevented-alert"/,
    'Must show self-review prevented alert'
  )
  assert.match(
    content,
    /Bạn không thể tự đối soát hoặc duyệt ảnh chấm công của chính mình/,
    'Must state explicit self-review prohibition'
  )
})

test('G5-09: AdminProxyAttendanceModal — Safety lock banner and immutable timestamp protection', () => {
  const modalPath = path.join(repoRoot, 'components/features/attendance/AdminProxyAttendanceModal.tsx')
  const content = fs.readFileSync(modalPath, 'utf8')

  // Invariant 1: Modal container testid
  assert.match(content, /data-testid="admin-proxy-attendance-modal"/, 'Must have modal data-testid')

  // Invariant 2: Safety lock banner pending C5 backend RPC
  assert.match(
    content,
    /data-testid="admin-proxy-attendance-locked-alert"/,
    'Must display locked alert banner'
  )
  assert.match(
    content,
    /Chờ C5 Backend RPC: proxy_attendance_record/,
    'Must cite C5 backend RPC requirement'
  )

  // Invariant 3: Submit button disabled
  assert.match(
    content,
    /disabled=\{true\s*\/\*\s*Always disabled pending C5 RPC\s*\*\/}/,
    'Submit button must be permanently disabled pending C5 RPC'
  )

  // Invariant 4: Minimum 8 characters reason requirement
  assert.match(content, /reason\.trim\(\)\.length >= 8/, 'Must require minimum 8 character reason')

  // Invariant 5: Original server timestamp notice
  assert.match(
    content,
    /Timestamp server thực tế khi nhân sự thao tác/,
    'Must state original server timestamp remains immutable in ledger'
  )
})

test('G5-10: ShiftDetailModal & Cross-Lane Safety Regressions — G3 segments, G4 atomic replace locks', () => {
  const modalPath = path.join(repoRoot, 'components/features/shifts/ShiftDetailModal.tsx')
  const content = fs.readFileSync(modalPath, 'utf8')

  // 1. ShiftDetailModal attendance feature flag check
  assert.match(
    content,
    /NEXT_PUBLIC_FEATURE_SELF_ATTENDANCE === 'true' && myRegistration/,
    'Must preserve self-attendance feature flag and registration requirement'
  )
  assert.match(
    content,
    /role=\{myRegistration\.operational_role\}/,
    'Must pass operational role from registration'
  )

  // 2. Admin proxy attendance entry button in ShiftDetailModal
  assert.match(
    content,
    /data-testid="open-admin-proxy-attendance-btn"/,
    'Must provide Admin proxy attendance button'
  )
  assert.match(
    content,
    /<AdminProxyAttendanceModal/,
    'Must mount AdminProxyAttendanceModal'
  )

  // 3. G4 replacement is enabled only through the authenticated atomic service.
  const replacementDialogPath = path.join(repoRoot, 'components/features/calendar/AtomicStaffingReplacementDialog.tsx')
  const replacementDialog = fs.readFileSync(replacementDialogPath, 'utf8')
  assert.match(
    content,
    /<AtomicStaffingReplacementDialog/,
    'ShiftDetailModal must mount the shared atomic replacement dialog'
  )
  assert.match(
    replacementDialog,
    /persistedRuntime && capability === 'ready'/,
    'Replacement must remain fail-closed until authenticated persisted capability is verified'
  )

  const staffingPanelPath = path.join(repoRoot, 'components/features/calendar/StaffingActionPanel.tsx')
  const staffingContent = fs.readFileSync(staffingPanelPath, 'utf8')
  assert.match(
    staffingContent,
    /<AtomicStaffingReplacementDialog/,
    'StaffingActionPanel must mount the shared atomic replacement dialog'
  )
  assert.match(
    replacementDialog,
    /shiftRegistrationService\.replaceAssignment/,
    'Replacement must use the single atomic service, not remove and assign calls'
  )
  assert.match(replacementDialog, /getForShift\(shift\.id\)/, 'Success must wait for persisted roster readback')
  assert.match(replacementDialog, /emergency \|\| isAdmin/, 'Emergency mode must be Admin-only')

  // 4. G3 Shift Editor Invariant: Multi-segment staffing preserved
  const editorDialogPath = path.join(repoRoot, 'components/features/shifts/ShiftFormDialog.tsx')
  const editorContent = fs.readFileSync(editorDialogPath, 'utf8')
  assert.match(
    editorContent,
    /data-testid="shift-segments-editor-section"/,
    'Must preserve G3 staffing segments editor'
  )
})

test('G5-11: SelfAttendancePanel — Error classification, clear recovery action, photo-disabled notice, and loading/retry states', () => {
  // 1. Error classification unit tests
  assert.match(
    formatAttendanceErrorMessage(new Error('PGRST301 JWT expired'), 'vi'),
    /Phiên làm việc đã hết hạn/
  )
  assert.match(
    formatAttendanceErrorMessage(new Error('401 unauthorized'), 'en'),
    /session has expired/
  )
  assert.match(
    formatAttendanceErrorMessage(new Error('42501 permission denied'), 'vi'),
    /Từ chối quyền truy cập/
  )
  assert.match(
    formatAttendanceErrorMessage(new Error('SHIFT_VIEW_ONLY'), 'vi'),
    /chỉ xem/
  )
  assert.match(
    formatAttendanceErrorMessage(new Error('ATTENDANCE_PHOTO_RECOVERY_UNAVAILABLE'), 'vi'),
    /Không tìm thấy ảnh đã lưu/
  )
  assert.match(
    formatAttendanceErrorMessage(new Error('57014 query timeout'), 'vi'),
    /Lỗi kết nối máy chủ/
  )

  // 2. Source contract tests for UI improvements
  const panelPath = path.join(repoRoot, 'components/features/attendance/SelfAttendancePanel.tsx')
  const content = fs.readFileSync(panelPath, 'utf8')

  // Photo disabled visible banner
  assert.match(content, /data-testid="attendance-photo-disabled-notice"/, 'Must render visible photo disabled banner')

  // Clear recovery action text (replacing ambiguous "Khôi phục")
  assert.match(content, /Khôi phục ảnh đã tải/, 'Must have unambiguous recovery label')
  assert.match(content, /Recover photo/, 'Must have English unambiguous recovery label')

  // Accessible loading and error retry elements
  assert.match(content, /data-testid="self-attendance-loading"/, 'Must render accessible loading state')
  assert.match(content, /data-testid="self-attendance-load-error"/, 'Must render accessible error alert')
  assert.match(content, /data-testid="self-attendance-retry-btn"/, 'Must render retry button for load failures')

  // Camera capture event kind separation
  const cameraCapturePath = path.join(repoRoot, 'components/features/attendance/AttendanceCameraCapture.tsx')
  const cameraContent = fs.readFileSync(cameraCapturePath, 'utf8')
  assert.match(cameraContent, /data-event-kind=\{eventKind\}/, 'Camera capture must tag DialogContent with eventKind')
})
