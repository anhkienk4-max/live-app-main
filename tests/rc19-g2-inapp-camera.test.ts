import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

test('G2.1 & G2.2: AttendanceCameraCapture implements getUserMedia, Canvas API snapshot, track cleanup and error fallback', () => {
  const cameraSrc = readFileSync(
    new URL('../components/features/attendance/AttendanceCameraCapture.tsx', import.meta.url),
    'utf8'
  )

  // 1. In-app camera viewfinder uses navigator.mediaDevices.getUserMedia
  assert.match(cameraSrc, /navigator\.mediaDevices\.getUserMedia/)
  assert.match(cameraSrc, /facingMode:\s*\{\s*ideal:\s*facing\s*\}/)

  // 2. Video element configured with playsInline, autoPlay, muted for mobile browser compatibility
  assert.match(cameraSrc, /<video[\s\S]*?autoPlay[\s\S]*?playsInline[\s\S]*?muted/)

  // 3. Canvas snapshot rasterization with JPEG compression and dimension downscaling
  assert.match(cameraSrc, /canvas\.getContext\('2d'\)/)
  assert.match(cameraSrc, /ctx\.drawImage\(video,\s*0,\s*0,\s*width,\s*height\)/)
  assert.match(cameraSrc, /canvas\.toBlob\(/)
  assert.match(cameraSrc, /0\.85/)
  assert.match(cameraSrc, /new File\(\[blob\],\s*fileName,\s*\{\s*type:\s*'image\/jpeg'\s*\}\)/)

  // 4. Lifecycle track cleanup stops all MediaStreamTracks on close, unmount or snapshot review
  assert.match(cameraSrc, /streamRef\.current\.getTracks\(\)\.forEach\(\(track\)\s*=>\s*\{[\s\S]*?track\.stop\(\)/)

  // 5. Revoking object URLs when retaking or unmounting
  assert.match(cameraSrc, /URL\.revokeObjectURL\(blobUrlRef\.current\)/)

  // 6. Explicit user action controls: capture, retake, confirm, switch facing, cancel
  assert.match(cameraSrc, /data-testid="camera-capture-trigger"/)
  assert.match(cameraSrc, /data-testid="camera-retake-trigger"/)
  assert.match(cameraSrc, /data-testid="camera-confirm-trigger"/)
  assert.match(cameraSrc, /data-testid="camera-switch-facing"/)
  assert.match(cameraSrc, /data-testid="camera-cancel-trigger"/)

  // 7. Handles permission denied, device not found, and provides OS camera fallback
  assert.match(cameraSrc, /NotAllowedError|PermissionDeniedError/)
  assert.match(cameraSrc, /NotFoundError|DevicesNotFoundError/)
  assert.match(cameraSrc, /data-testid="camera-error-message"/)
  assert.match(cameraSrc, /data-testid="camera-fallback-button"/)
})

test('G2.3 & G2.4: SelfAttendancePanel integrates in-app camera, preserves independent check-in / check-out, and never auto-uploads before confirm', () => {
  const panelSrc = readFileSync(
    new URL('../components/features/attendance/SelfAttendancePanel.tsx', import.meta.url),
    'utf8'
  )

  // 1. Imports and renders AttendanceCameraCapture
  assert.match(panelSrc, /import\s*\{\s*AttendanceCameraCapture\s*\}\s*from\s*'\.\/AttendanceCameraCapture'/)
  assert.match(panelSrc, /<AttendanceCameraCapture/)

  // 2. Separate check-in and check-out event methods with distinct photo records
  assert.match(panelSrc, /writeSelfAttendancePhotoCheckIn/)
  assert.match(panelSrc, /writeSelfAttendancePhotoCheckOut/)
  assert.match(panelSrc, /checkedIn\?\.photo_available/)
  assert.match(panelSrc, /checkedOut\?\.photo_available/)
  assert.match(panelSrc, /data-testid="attendance-checkin-evidence"/)
  assert.match(panelSrc, /data-testid="attendance-checkout-evidence"/)

  // 3. Photo upload only triggers on explicit user submit action, not on camera open
  assert.match(panelSrc, /disabled=\{busy\s*\|\|\s*!photo\}/)
  assert.match(panelSrc, /Upload starts on confirmation/)

  // 4. File input fallbacks are retained in DOM for native fallback and automation
  assert.match(panelSrc, /Take check-in photo with camera/)
  assert.match(panelSrc, /Take check-out photo with camera/)
  assert.match(panelSrc, /Choose existing check-in photo/)
  assert.match(panelSrc, /Choose existing check-out photo/)

  // 5. Preserves role and shift context binding
  assert.match(panelSrc, /data-testid="attendance-live-shift-context"/)
  assert.match(panelSrc, /Asia\/Ho_Chi_Minh/)

  const serviceSrc = readFileSync(
    new URL('../lib/services/supabaseSelfAttendanceService.ts', import.meta.url),
    'utf8'
  )
  assert.match(serviceSrc, /fetch\('\/api\/workforce\/self-attendance-photo'/)
  assert.match(serviceSrc, /if\(!response\.ok\|\|payload\?\.ok!==true\)/)
  assert.match(serviceSrc, /event\.photo_available!==true/)
})

test('G2.5: Review and Correction UX supports in-app camera resubmission and clear status badges', () => {
  const correctionPanelSrc = readFileSync(
    new URL('../components/features/attendance/AttendanceCorrectionPanel.tsx', import.meta.url),
    'utf8'
  )
  const reviewPanelSrc = readFileSync(
    new URL('../components/features/attendance/AttendancePhotoReviewPanel.tsx', import.meta.url),
    'utf8'
  )

  // 1. Correction panel mounts AttendanceCameraCapture for supplementary photos
  assert.match(correctionPanelSrc, /AttendanceCameraCapture/)
  assert.match(correctionPanelSrc, /data-testid="attendance-correction-panel"/)
  assert.match(correctionPanelSrc, /data\.set\('capture_source',\s*sources\[row\.id\]\s*\|\|\s*'camera'\)/)

  // 2. Review panel renders distinct status badges (Approved, Rejected, Correction Requested, Pending)
  assert.match(reviewPanelSrc, /data-testid="attendance-photo-review"/)
  assert.match(reviewPanelSrc, /data-testid="attendance-photo-review-event"/)
  assert.match(reviewPanelSrc, /Correction Requested/)
  assert.match(reviewPanelSrc, /Pending Review|Chờ đối soát/)

  // 3. Independent evidence decisions without auto-approving payroll wages
  assert.match(reviewPanelSrc, /This does not approve Actual Staffing or Payroll/)
})
