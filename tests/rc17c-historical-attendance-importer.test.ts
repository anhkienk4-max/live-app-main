import assert from 'node:assert/strict'
import test from 'node:test'
import {
  parseCanonicalDate,
  normalizeTimeString,
  parseTimeRange,
  splitStaffNames,
  detectPassCoverage,
  parseRawAttendanceRow,
} from '../lib/workforce/historicalAttendanceParser'
import {
  createSourceFingerprint,
  matchSegmentToShift,
  ShiftReference,
  StaffReference,
} from '../lib/workforce/historicalAttendanceMatcher'
import {
  previewAttendanceImport,
  buildActualSegmentsFromMatches,
} from '../lib/workforce/historicalAttendanceService'
import {
  selectApprovedRate,
  calculatePayrollLine,
} from '../lib/workforce/payrollCalculation'

// Mock Staff Directory
const mockStaff: StaffReference[] = [
  { id: 'user-alice', fullName: 'Nguyễn Thị Hương', systemPermission: 'member', status: 'active' },
  { id: 'user-bob', fullName: 'Trần Văn An', systemPermission: 'member', status: 'active' },
  { id: 'user-charlie', fullName: 'Lê Văn Bình', systemPermission: 'member', status: 'active' },
  { id: 'user-david', fullName: 'Phạm Minh Tuấn', systemPermission: 'leader', status: 'active' },
  { id: 'user-emma', fullName: 'Vũ Thảo Linh', systemPermission: 'member', status: 'active' },
]

// Mock Completed & Incomplete Shifts
const mockShifts: ShiftReference[] = [
  {
    id: 'shift-opella-01',
    brandName: 'OPELLA',
    startTime: '2026-10-10T09:00:00+07:00',
    endTime: '2026-10-10T13:00:00+07:00',
    status: 'completed',
    hostId: 'user-alice',
  },
  {
    id: 'shift-pepsico-night',
    brandName: 'PEPSICO',
    startTime: '2026-10-10T22:00:00+07:00',
    endTime: '2026-10-11T02:00:00+07:00',
    status: 'completed',
    hostId: 'user-bob',
  },
  {
    id: 'shift-scheduled-future',
    brandName: 'OPELLA',
    startTime: '2026-10-25T14:00:00+07:00',
    endTime: '2026-10-25T18:00:00+07:00',
    status: 'scheduled', // Incomplete!
  },
]

// -------------------------------------------------------------
// TEST SUITE 1: Parsing Date, Time & Vietnamese Semantics
// -------------------------------------------------------------
test('RC1.7C: Date and Time normalization supports Vietnam operational formats', () => {
  // DD/MM/YYYY
  assert.equal(parseCanonicalDate('10/10/2026'), '2026-10-10')
  assert.equal(parseCanonicalDate('25/09/2026'), '2026-09-25')
  // ISO
  assert.equal(parseCanonicalDate('2026-10-15'), '2026-10-15')

  // Time normalizing
  assert.equal(normalizeTimeString('9h'), '09:00')
  assert.equal(normalizeTimeString('09:30'), '09:30')
  assert.equal(normalizeTimeString('22h00'), '22:00')

  // Time range
  const range = parseTimeRange('09:00 - 13:00')
  assert.deepEqual(range, { startTime: '09:00', endTime: '13:00' })
})

test('RC1.7C: Multi-staff tokenization splits newline, comma and semicolon lists', () => {
  const list1 = splitStaffNames('Nguyễn Thị Hương\nTrần Văn An')
  assert.deepEqual(list1, ['Nguyễn Thị Hương', 'Trần Văn An'])

  const list2 = splitStaffNames('An, Linh; Tuấn / Phúc')
  assert.deepEqual(list2, ['An', 'Linh', 'Tuấn', 'Phúc'])

  const listEmpty = splitStaffNames('None; -')
  assert.deepEqual(listEmpty, [])
})

test('RC1.7C: PASS / Cover detection extracts original and replacement staff', () => {
  const pass1 = detectPassCoverage('An pass cho Bình do ốm')
  assert.equal(pass1.isPass, true)
  assert.equal(pass1.originalStaff, 'An')
  assert.equal(pass1.replacementStaff, 'Bình')

  const pass2 = detectPassCoverage('Ca làm bình thường')
  assert.equal(pass2.isPass, false)
})

// -------------------------------------------------------------
// TEST SUITE 2: Opella Format Tab T10 FINAL (Single Row Exploded)
// -------------------------------------------------------------
test('RC1.7C: Opella row explodes into Host, Support, Technical segments with supervisor evidence', () => {
  const row = {
    rowNumber: 1,
    date: '10/10/2026',
    timeRange: '09:00 - 13:00',
    brand: 'Opella',
    hostName: 'Nguyễn Thị Hương',
    assistantName: 'Trần Văn An',
    technicalName: 'Phạm Minh Tuấn',
    confirmedBy: 'supervisor-hoa',
    confirmedAt: '2026-10-10T14:00:00+07:00',
    notes: 'Đã hoàn thành ca livestream sáng, không có sự cố',
  }

  const { segments, errors } = parseRawAttendanceRow(row)
  assert.equal(errors.length, 0)
  assert.equal(segments.length, 3, 'Must explode into 3 distinct operational roles')

  // Host
  assert.equal(segments[0].operationalRole, 'host')
  assert.equal(segments[0].normalizedStaffName, 'Nguyễn Thị Hương')
  assert.equal(segments[0].durationMinutes, 240)
  assert.equal(segments[0].evidenceKind, 'supervisor_verified')

  // Support
  assert.equal(segments[1].operationalRole, 'support')
  assert.equal(segments[1].normalizedStaffName, 'Trần Văn An')

  // Tech
  assert.equal(segments[2].operationalRole, 'technical')
  assert.equal(segments[2].normalizedStaffName, 'Phạm Minh Tuấn')
})

// -------------------------------------------------------------
// TEST SUITE 3: PepsiCo Format Cross-Midnight & Multi-Host
// -------------------------------------------------------------
test('RC1.7C: PepsiCo row handles overnight shift across midnight and multi-host split', () => {
  const row = {
    rowNumber: 2,
    date: '2026-10-10',
    startTime: '22:00',
    endTime: '02:00',
    brand: 'PepsiCo',
    hostName: 'Trần Văn An\nVũ Thảo Linh',
    notes: 'Ca live đêm mega sale, supervisor duyệt hoàn thành ca',
  }

  const { segments, errors } = parseRawAttendanceRow(row)
  assert.equal(errors.length, 0)
  assert.equal(segments.length, 2, '2 hosts in overnight shift')

  // Segment 1 (Bob / An)
  assert.equal(segments[0].startAtIso, '2026-10-10T22:00:00+07:00')
  assert.equal(segments[0].endAtIso, '2026-10-11T02:00:00+07:00')
  assert.equal(segments[0].durationMinutes, 240) // 4 hours

  // Segment 2 (Emma / Linh)
  assert.equal(segments[1].startAtIso, '2026-10-10T22:00:00+07:00')
  assert.equal(segments[1].endAtIso, '2026-10-11T02:00:00+07:00')
})

// -------------------------------------------------------------
// TEST SUITE 4: Strict Non-Assumption: MISSING_EVIDENCE Exception
// -------------------------------------------------------------
test('RC1.7C: Row without punch times or supervisor note is routed to MISSING_EVIDENCE exception', () => {
  const row = {
    rowNumber: 3,
    date: '10/10/2026',
    timeRange: '09:00 - 13:00',
    brand: 'Opella',
    hostName: 'Nguyễn Thị Hương',
    notes: 'Lịch phân ca tuần', // No supervisor sign-off or check-in!
  }

  const { segments } = parseRawAttendanceRow(row)
  assert.equal(segments[0].evidenceKind, 'missing_evidence')

  const match = matchSegmentToShift({
    segment: segments[0],
    brandName: 'Opella',
    shifts: mockShifts,
    staffList: mockStaff,
  })

  assert.equal(match.status, 'exception')
  assert.equal(match.exceptionCode, 'MISSING_EVIDENCE')
})

// -------------------------------------------------------------
// TEST SUITE 5: Completed Shifts Contract Enforcement
// -------------------------------------------------------------
test('RC1.7C: Attendance matching rejects uncompleted shifts (scheduled/preparing)', () => {
  const row = {
    rowNumber: 4,
    date: '25/10/2026',
    timeRange: '14:00 - 18:00',
    brand: 'Opella',
    hostName: 'Nguyễn Thị Hương',
    notes: 'Đã hoàn thành ca',
  }

  const { segments } = parseRawAttendanceRow(row)
  const match = matchSegmentToShift({
    segment: segments[0],
    brandName: 'Opella',
    shifts: mockShifts,
    staffList: mockStaff,
  })

  assert.equal(match.status, 'exception')
  assert.equal(match.exceptionCode, 'SHIFT_NOT_COMPLETED')
  assert.match(match.exceptionDetail!, /chưa hoàn thành/)
})

// -------------------------------------------------------------
// TEST SUITE 6: Idempotent Batch Fingerprinting
// -------------------------------------------------------------
test('RC1.7C: Identical import content produces deterministic SHA-256 fingerprint', () => {
  const contentA = JSON.stringify([{ row: 1, text: 'Opella T10' }])
  const contentB = JSON.stringify([{ row: 1, text: 'Opella T10' }])
  const contentC = JSON.stringify([{ row: 1, text: 'Opella T11' }])

  const hashA = createSourceFingerprint(contentA)
  const hashB = createSourceFingerprint(contentB)
  const hashC = createSourceFingerprint(contentC)

  assert.equal(hashA, hashB, 'Identical content must produce identical hash')
  assert.notEqual(hashA, hashC, 'Distinct content must produce distinct hash')
})

// -------------------------------------------------------------
// TEST SUITE 7: End-to-End Batch Preview & Draft Promotion
// -------------------------------------------------------------
test('RC1.7C: End-to-End Import Preview -> Draft Actual Segments -> Payroll Line Calculation', () => {
  const preview = previewAttendanceImport({
    sourceType: 'google_sheets',
    sourceName: 'Opella_T10_FINAL.xlsx',
    brandName: 'Opella',
    rawRows: [
      {
        rowNumber: 1,
        date: '10/10/2026',
        timeRange: '09:00 - 13:00',
        brand: 'Opella',
        hostName: 'Nguyễn Thị Hương',
        checkIn: '09:00',
        checkOut: '13:00',
        notes: 'Đã hoàn thành ca live sáng',
      },
      {
        rowNumber: 2,
        date: '10/10/2026',
        timeRange: '09:00 - 13:00',
        brand: 'Opella',
        hostName: 'Người Lạ Không Có Trong Hệ Thống',
        checkIn: '09:00',
        checkOut: '13:00',
        notes: 'Đã hoàn thành ca live',
      },
    ],
    shifts: mockShifts,
    staffList: mockStaff,
  })

  assert.equal(preview.summary.totalRows, 2)
  assert.equal(preview.summary.matchedRows, 1, 'Exactly 1 valid row matched')
  assert.equal(preview.summary.exceptionRows, 1, 'Unknown staff routed to exception')
  assert.equal(preview.summary.exceptionsSummary.STAFF_NOT_FOUND, 1)

  // Promote matched row to Draft Actual Segment
  const draftedSegments = buildActualSegmentsFromMatches({
    matchedResults: preview.results,
    creatorId: 'admin-lead-1',
    batchId: preview.batchId,
  })

  assert.equal(draftedSegments.length, 1)
  const draft = draftedSegments[0]
  assert.equal(draft.shift_id, 'shift-opella-01')
  assert.equal(draft.staff_id, 'user-alice')
  assert.equal(draft.operational_role, 'host')
  assert.equal(draft.review_status, 'draft', 'MUST remain draft until independent review')
  assert.match(draft.evidence_note, /Imported from historical attendance batch/)

  // Simulate Independent Review approval
  const approvedSegment = {
    id: 'seg-approved-e2e',
    shiftId: draft.shift_id,
    staffId: draft.staff_id,
    role: draft.operational_role,
    eventKind: draft.event_kind,
    reviewStatus: 'approved' as const,
    startAt: draft.actual_start_at,
    endAt: draft.actual_end_at,
  }

  // Connect to Payroll Rate Card calculation
  const rateCard = {
    id: 'rate-opella-host',
    staffId: null,
    role: 'host' as const,
    effectiveFrom: '2026-10-01',
    effectiveThrough: null,
    vndPerHour: 120_000,
    overtimeMultiplierBasisPoints: 15_000,
    approvedBy: 'finance-admin',
  }

  const selectedRate = selectApprovedRate({ staffId: approvedSegment.staff_id, role: 'host' }, '2026-10-10', [rateCard])
  assert.equal(selectedRate.vndPerHour, 120_000)

  // 4 hours (240 mins) at 120,000 VND/h = 480,000 VND
  const payrollLine = calculatePayrollLine({
    segment: approvedSegment,
    shiftDate: '2026-10-10',
    rate: selectedRate,
    payableMinutes: 240,
    overtimeMinutes: 0,
  })

  assert.equal(payrollLine.grossVnd, 480_000)
  assert.equal(payrollLine.netVnd, 480_000)
})
