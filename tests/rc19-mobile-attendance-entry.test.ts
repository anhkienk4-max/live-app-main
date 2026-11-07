import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const fromSource = (path: string) => readFileSync(new URL('../' + path, import.meta.url), 'utf8')

test('Mobile-First Attendance Entry Point in My Shifts (Ca của tôi)', () => {
  const boardSrc = fromSource('components/features/calendar/ShiftRegistrationBoard.tsx')

  // 1. Imports Camera icon
  assert.match(boardSrc, /import\s*\{[^}]*Camera[^}]*\}\s*from\s*'lucide-react'/)

  // 2. State & navigation for initial tab
  assert.match(boardSrc, /const\s*\[detailInitialTab,\s*setDetailInitialTab\]\s*=\s*React\.useState<string\s*\|\s*undefined>\(undefined\)/)
  assert.match(boardSrc, /const\s*handleOpenDetail\s*=\s*\(shift:\s*Shift,\s*initialTab\?:\s*string\)\s*=>\s*\{/)
  assert.match(boardSrc, /setDetailInitialTab\(initialTab\)/)
  assert.match(boardSrc, /setDetailShift\(shift\)/)

  // 3. Passes initialTab to ShiftDetailModal and cleans up on modal close
  assert.match(boardSrc, /<ShiftDetailModal[\s\S]*?initialTab=\{detailInitialTab\}/)
  assert.match(boardSrc, /setDetailInitialTab\(undefined\)/)

  // 4. MyShiftViewProps onManage accepts initialTab
  assert.match(boardSrc, /onManage:\s*\(shift:\s*Shift,\s*initialTab\?:\s*string\)\s*=>\s*void/)

  // 5. MyShiftCards renders direct attendance button for staffed roles
  assert.match(boardSrc, /const\s+isStaffed\s*=\s*registrations\.some\(r\s*=>/)
  assert.match(boardSrc, /\['approved',\s*'manually_assigned'\]\.includes\(r\.status\)/)
  assert.match(boardSrc, /\['host',\s*'support',\s*'technical'\]\.includes\(r\.operational_role\)/)
  assert.match(boardSrc, /data-testid=\{\`open-my-shift-attendance-\$\{shift\.id\}\`\}/)
  assert.match(boardSrc, /data-testid=\{\`open-my-shift-attendance-compact-\$\{shift\.id\}\`\}/)
  assert.match(boardSrc, /data-testid=\{\`open-my-shift-attendance-table-\$\{shift\.id\}\`\}/)
  assert.match(boardSrc, /onClick=\{\(\)\s*=>\s*onManage\(shift,\s*'attendance'\)\}/)
})

test('ShiftDetailModal Tab 4 and Strict Assignment Permission Enforcements', () => {
  const modalSrc = fromSource('components/features/shifts/ShiftDetailModal.tsx')

  // 1. Tab 4 trigger has data-testid="tab-attendance" and displays Check-in / Check-out for assigned personnel
  assert.match(modalSrc, /data-testid="tab-attendance"/)
  assert.match(modalSrc, /myAttendanceRegistration\s*\?\s*'Check-in \/ Check-out'/)

  // 2. Strict permission gating: SelfAttendancePanel is ONLY mounted for current user's approved/assigned registration
  assert.match(modalSrc, /process\.env\.NEXT_PUBLIC_FEATURE_SELF_ATTENDANCE === 'true' && myRegistration && attendanceShiftEligible/)
  assert.match(modalSrc, /actorId=\{currentUser!\.id\}/)
  assert.match(modalSrc, /role=\{myRegistration\.operational_role\}/)

  // 3. Unassigned users (Admins or Members) CANNOT render SelfAttendancePanel for others
  assert.doesNotMatch(modalSrc, /<SelfAttendancePanel[\s\S]*?actorId=\{[^c][^u]/, 'Cannot pass arbitrary actorId')

  // 4. Non-silent disabled explanation when NEXT_PUBLIC_FEATURE_SELF_ATTENDANCE is false
  assert.match(modalSrc, /myRegistration\s*&&\s*process\.env\.NEXT_PUBLIC_FEATURE_SELF_ATTENDANCE !== 'true'/)
  assert.match(modalSrc, /data-testid="self-attendance-unavailable"/)
  assert.match(modalSrc, /chưa khả dụng/)
  assert.match(modalSrc, /NEXT_PUBLIC_FEATURE_SELF_ATTENDANCE/)

  // 5. Unassigned fallbacks for non-staffed members
  assert.match(modalSrc, /Bạn không được phân công trên ca trực này/)
})

test('SelfAttendancePanel Photo Gate Explanation and In-App Camera Flow', () => {
  const panelSrc = fromSource('components/features/attendance/SelfAttendancePanel.tsx')

  // 1. Non-silent explanation card when NEXT_PUBLIC_FEATURE_SELF_ATTENDANCE_PHOTO is off
  assert.match(panelSrc, /data-testid="self-attendance-photo-disabled"/)
  assert.match(panelSrc, /Photo check-in awaits verified Google Drive access\. Check-in cannot be recorded yet\./)
  assert.match(panelSrc, /NEXT_PUBLIC_FEATURE_SELF_ATTENDANCE_PHOTO/)

  // 2. Existing in-app camera components and flow preserved
  assert.match(panelSrc, /<AttendanceCameraCapture/)
  assert.match(panelSrc, /data-testid="attendance-open-camera-btn"/)
  assert.match(panelSrc, /data-testid="self-attendance-status"/)
  assert.match(panelSrc, /data-testid="attendance-checkin-evidence"/)
  assert.match(panelSrc, /data-testid="attendance-checkout-evidence"/)
})
