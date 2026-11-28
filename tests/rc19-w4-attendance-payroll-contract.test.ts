import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { calculateAttendanceTimePolicy, checkAttendanceTimingCompliance } from '../lib/utils/selfAttendanceContract.ts'

test('ATT-01 Contract: SelfAttendancePanel renders segment-scoped context, staff context, and status elements', () => {
  const panelSource = readFileSync(new URL('../components/features/attendance/SelfAttendancePanel.tsx', import.meta.url), 'utf8')
  
  // Mandatory data-testid selectors expected by hosted UAT
  assert.match(panelSource, /data-testid="self-attendance-panel"/)
  assert.match(panelSource, /data-testid="attendance-segment-context"/)
  assert.match(panelSource, /data-testid="attendance-staff-context"/)
  assert.match(panelSource, /data-testid="attendance-card-checkin"/)
  assert.match(panelSource, /data-testid="attendance-card-checkout"/)
  assert.match(panelSource, /data-testid="self-attendance-status"/)

  // Segment context renders segmentIndex + segmentTime or single shift fallback
  assert.match(panelSource, /shiftContext\.segmentIndex/)
  assert.match(panelSource, /shiftContext\.segmentTime/)
  assert.match(panelSource, /Ca đơn \(Toàn ca\)/)
})

test('ATT-01 Contract: ShiftDetailModal resolves segment boundaries, formats times safely, and handles overnight segments', () => {
  const modalSource = readFileSync(new URL('../components/features/shifts/ShiftDetailModal.tsx', import.meta.url), 'utf8')

  // Preserves contract invariant
  assert.match(modalSource, /NEXT_PUBLIC_FEATURE_SELF_ATTENDANCE === 'true' && myRegistration/)
  assert.match(modalSource, /item\.shift_id === attendanceShift\.id && item\.id === registration\.staffing_segment_id/)
  
  // Robust time formatting and segment boundary binding
  assert.match(modalSource, /formattedStart/)
  assert.match(modalSource, /formattedEnd/)
  assert.match(modalSource, /formattedEnd < formattedStart/)
  assert.match(modalSource, /assignmentId=\{segment \? registration\.id : undefined\}/)
})

test('ATT-01 Timing & Timezone: calculateAttendanceTimePolicy strictly applies Asia/Ho_Chi_Minh', () => {
  const standardPolicy = calculateAttendanceTimePolicy('18:00', '21:00', 'host', 'Asia/Ho_Chi_Minh')
  assert.equal(standardPolicy.timeZone, 'Asia/Ho_Chi_Minh')
  assert.equal(standardPolicy.checkInOpensTime, '16:00')
  assert.equal(standardPolicy.checkOutClosesTime, '23:00')
  assert.equal(standardPolicy.expectedArrivalTime, '17:45') // Host expected 15m prior

  const supportPolicy = calculateAttendanceTimePolicy('18:00', '21:00', 'support', 'Asia/Ho_Chi_Minh')
  assert.equal(supportPolicy.expectedArrivalTime, '17:30') // Support expected 30m prior

  // Overnight segment: 22:00 -> 02:00
  const overnightPolicy = calculateAttendanceTimePolicy('22:00', '02:00', 'host', 'Asia/Ho_Chi_Minh')
  assert.equal(overnightPolicy.checkInOpensTime, '20:00')
  assert.equal(overnightPolicy.checkOutClosesTime, '04:00')
})

test('ATT-01 Compliance: checkAttendanceTimingCompliance flags out-of-window arrivals without blocking submission', () => {
  // Compliant check-in: shift 18:00–21:00, arrival at 17:30 (10:30 UTC)
  const compliant = checkAttendanceTimingCompliance('2026-11-28T10:30:00Z', '18:00', '21:00', 'check_in', 'Asia/Ho_Chi_Minh')
  assert.equal(compliant.isWithinWindow, true)
  assert.equal(compliant.isOutsideWindowWarning, false)

  // Late check-in: arrival at 21:30 (14:30 UTC) outside check-in window
  const outside = checkAttendanceTimingCompliance('2026-11-28T14:30:00Z', '18:00', '21:00', 'check_in', 'Asia/Ho_Chi_Minh')
  assert.equal(outside.isWithinWindow, false)
  assert.equal(outside.isOutsideWindowWarning, true)
  assert.match(outside.labelVi, /Ngoài khung giờ chuẩn/)
})

test('PAY-01 Contract: MyPayslipPanel and /my-payslip route satisfy strict own_locked_only contract', () => {
  const panelSource = readFileSync(new URL('../components/features/payroll/MyPayslipPanel.tsx', import.meta.url), 'utf8')
  const routeSource = readFileSync(new URL('../app/(dashboard)/my-payslip/page.tsx', import.meta.url), 'utf8')

  // Testids
  assert.match(panelSource, /data-testid="my-payslip-page"/)
  assert.match(routeSource, /data-testid="my-payslip-page"/)
  assert.match(routeSource, /<MyPayslipPanel key=\{identityKey \?\? currentUser\.id\}/)

  // Strict backend endpoint and contract parameters
  assert.match(panelSource, /\/api\/workforce\/my-payslip\?year=/)
  assert.match(panelSource, /scope:'own_locked_only'/)
  assert.match(panelSource, /status:'locked'/)

  // Assertions required by PAY-01
  assert.match(panelSource, /Đã khóa, dữ liệu chính thức theo kỳ/)
  assert.match(panelSource, /Chưa có phiếu lương được phát hành cho năm này/)
  assert.match(panelSource, /line\.shift_title\|\|line\.shift_id/)
  assert.match(panelSource, /rate_vnd_per_hour/)
  assert.match(panelSource, /payable_minutes/)
  assert.match(panelSource, /net_vnd/)

  // Disallow auto-deductions
  assert.doesNotMatch(panelSource, /Tự động trừ lương|Auto deduction|Unauthorized deduction/i)
  assert.match(panelSource, /Không có cơ chế trừ phạt tự động tại đây/)
})
