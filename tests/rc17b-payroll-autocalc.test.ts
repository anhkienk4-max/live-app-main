import test from 'node:test'
import assert from 'node:assert/strict'
import {
  autoCalculatePeriodLines,
  calculateLivePreview,
  minuteDifference,
  parseApprovedOvertimeMinutes,
  evaluateApprovedOtEvidence,
  selectApprovedRate,
  calculateRecalculationDiffs,
  type ApprovedPayrollRate,
  type PayrollLineRecalcTarget,
} from '@/lib/workforce/payrollCalculation'

test('autoCalculatePeriodLines: scans approved worked segments and generates draft snapshots', () => {
  const period = { periodStart: '2026-10-01', periodEnd: '2026-10-31' }
  const rates: ApprovedPayrollRate[] = [
    {
      id: 'rate-host-default',
      staffId: null,
      role: 'host',
      effectiveFrom: '2026-10-01',
      effectiveThrough: null,
      vndPerHour: 100_000,
      overtimeMultiplierBasisPoints: 15_000, // 1.5x
      approvedBy: 'admin-1',
    },
    {
      id: 'rate-host-alice-vip',
      staffId: 'staff-alice',
      role: 'host',
      effectiveFrom: '2026-10-01',
      effectiveThrough: null,
      vndPerHour: 150_000,
      overtimeMultiplierBasisPoints: 20_000, // 2.0x
      approvedBy: 'admin-1',
    },
    {
      id: 'rate-support-default',
      staffId: null,
      role: 'support',
      effectiveFrom: '2026-10-01',
      effectiveThrough: null,
      vndPerHour: 60_000,
      overtimeMultiplierBasisPoints: 15_000,
      approvedBy: 'admin-1',
    },
  ]

  const segments = [
    // 1. Valid Host segment for Alice (should use staff-specific rate 150k/h)
    {
      segment: {
        id: 'seg-1',
        shiftId: 'shift-1',
        staffId: 'staff-alice',
        role: 'host' as const,
        eventKind: 'worked' as const,
        reviewStatus: 'approved' as const,
        startAt: '2026-10-10T10:00:00+07:00',
        endAt: '2026-10-10T12:00:00+07:00', // 120 mins
      },
      shiftDate: '2026-10-10',
    },
    // 2. Valid Host segment for Bob (should use role default rate 100k/h)
    {
      segment: {
        id: 'seg-2',
        shiftId: 'shift-1',
        staffId: 'staff-bob',
        role: 'host' as const,
        eventKind: 'worked' as const,
        reviewStatus: 'approved' as const,
        startAt: '2026-10-10T10:00:00+07:00',
        endAt: '2026-10-10T11:30:00+07:00', // 90 mins
      },
      shiftDate: '2026-10-10',
    },
    // 3. Unapproved segment (must be skipped fail-closed)
    {
      segment: {
        id: 'seg-3-draft',
        shiftId: 'shift-2',
        staffId: 'staff-alice',
        role: 'host' as const,
        eventKind: 'worked' as const,
        reviewStatus: 'draft' as const,
        startAt: '2026-10-11T10:00:00+07:00',
        endAt: '2026-10-11T12:00:00+07:00',
      },
      shiftDate: '2026-10-11',
    },
    // 4. No-show segment (must be skipped)
    {
      segment: {
        id: 'seg-4-noshow',
        shiftId: 'shift-2',
        staffId: 'staff-charlie',
        role: 'support' as const,
        eventKind: 'no_show' as const,
        reviewStatus: 'approved' as const,
        startAt: null,
        endAt: null,
      },
      shiftDate: '2026-10-11',
    },
    // 5. Shift outside period (must be skipped)
    {
      segment: {
        id: 'seg-5-outside',
        shiftId: 'shift-outside',
        staffId: 'staff-bob',
        role: 'host' as const,
        eventKind: 'worked' as const,
        reviewStatus: 'approved' as const,
        startAt: '2026-11-05T10:00:00+07:00',
        endAt: '2026-11-05T12:00:00+07:00',
      },
      shiftDate: '2026-11-05',
    },
    // 6. Missing rate card for Technical role (must be skipped gracefully)
    {
      segment: {
        id: 'seg-6-norate',
        shiftId: 'shift-3',
        staffId: 'staff-dave',
        role: 'technical' as const,
        eventKind: 'worked' as const,
        reviewStatus: 'approved' as const,
        startAt: '2026-10-12T10:00:00+07:00',
        endAt: '2026-10-12T12:00:00+07:00',
      },
      shiftDate: '2026-10-12',
    },
  ]

  const existingSegmentIds = new Set(['seg-already-in-period'])

  const result = autoCalculatePeriodLines({
    period,
    segments,
    rates,
    existingSegmentIds,
  })

  assert.equal(result.preparedLines.length, 2)
  assert.equal(result.skippedSegments.length, 4)

  // Alice line verification
  const aliceLine = result.preparedLines.find(l => l.staffId === 'staff-alice')
  assert.ok(aliceLine)
  assert.equal(aliceLine.rateCardId, 'rate-host-alice-vip')
  assert.equal(aliceLine.actualMinutes, 120)
  assert.equal(aliceLine.payableMinutes, 120)
  assert.equal(aliceLine.overtimeMinutes, 0)
  assert.equal(aliceLine.rateVndPerHour, 150_000)
  // 120m @ 150k/h = 300,000 VND
  assert.equal(aliceLine.grossVnd, 300_000)
  assert.equal(aliceLine.netVnd, 300_000)

  // Bob line verification
  const bobLine = result.preparedLines.find(l => l.staffId === 'staff-bob')
  assert.ok(bobLine)
  assert.equal(bobLine.rateCardId, 'rate-host-default')
  assert.equal(bobLine.actualMinutes, 90)
  assert.equal(bobLine.payableMinutes, 90)
  assert.equal(bobLine.rateVndPerHour, 100_000)
  // 90m @ 100k/h = 150,000 VND
  assert.equal(bobLine.grossVnd, 150_000)
  assert.equal(bobLine.netVnd, 150_000)

  // Skipped reasons verification
  assert.ok(result.skippedSegments.some(s => s.segmentId === 'seg-3-draft' && s.reason === 'ATTENDANCE_NOT_APPROVED_WORKED'))
  assert.ok(result.skippedSegments.some(s => s.segmentId === 'seg-4-noshow' && s.reason === 'ATTENDANCE_NOT_APPROVED_WORKED'))
  assert.ok(result.skippedSegments.some(s => s.segmentId === 'seg-5-outside' && s.reason === 'SHIFT_OUTSIDE_PERIOD'))
  assert.ok(result.skippedSegments.some(s => s.segmentId === 'seg-6-norate' && s.reason === 'WORKFORCE_RATE_NOT_APPROVED'))
})

test('calculateLivePreview: generates live simulated numbers and formula text', () => {
  const preview = calculateLivePreview({
    rateVndPerHour: 120_000,
    overtimeMultiplierBasisPoints: 15_000, // 1.5x
    regularMinutes: 120, // 2h -> 240,000
    overtimeMinutes: 30,  // 30m @ 120k * 1.5 = 90,000
    adjustmentVnd: 10_000,
  })

  assert.equal(preview.regularVnd, 240_000)
  assert.equal(preview.overtimeVnd, 90_000)
  assert.equal(preview.grossVnd, 330_000)
  assert.equal(preview.adjustmentVnd, 10_000)
  assert.equal(preview.netVnd, 340_000)
  assert.ok(preview.formulaDescription.includes('120p × 120.000 đ/h ÷ 60'))
  assert.ok(preview.formulaDescription.includes('30p OT × 120.000 đ/h × 1.50x ÷ 60'))
})

test('minuteDifference: accurately calculates cross-midnight shifts with ISO timezone offsets', () => {
  const start = '2026-10-10T23:00:00+07:00'
  const end = '2026-10-11T02:30:00+07:00'
  const diff = minuteDifference(start, end)
  assert.equal(diff, 210) // 3.5 hours = 210 minutes
})

test('parseApprovedOvertimeMinutes: requires explicit supervisor approved OT evidence, never defaulting excess hours to OT', () => {
  // Case 1: No evidence or notes -> 0 OT even if actual is long
  assert.equal(parseApprovedOvertimeMinutes(null, null, 180), 0)
  assert.equal(parseApprovedOvertimeMinutes('Đã duyệt ca làm việc', 'Hoàn thành tốt', 180), 0)

  // Case 2: Explicit supervisor OT approval in review_note
  assert.equal(parseApprovedOvertimeMinutes('Duyệt OT: 30p hỗ trợ dọn dẹp', null, 180), 30)
  assert.equal(parseApprovedOvertimeMinutes('Xác nhận tăng ca 1.5h', null, 180), 90)
  assert.equal(parseApprovedOvertimeMinutes('OT: 1h', null, 180), 60)
  assert.equal(parseApprovedOvertimeMinutes('Duyệt ca + overtime 20m', null, 180), 20)

  // Case 3: Staff self-reported OT claim in evidence_note without supervisor approval yields 0 OT
  assert.equal(parseApprovedOvertimeMinutes(null, 'tăng ca: 45 phút', 180), 0)
  assert.equal(parseApprovedOvertimeMinutes('Đã duyệt ca chuẩn', 'tăng ca: 45 phút', 180), 0)
  assert.equal(parseApprovedOvertimeMinutes(null, 'overtime 20m', 180), 0)

  const unapprovedStaffContract = evaluateApprovedOtEvidence({
    reviewNote: 'Đã duyệt ca chuẩn',
    evidenceNote: 'tăng ca: 45 phút',
    actualMinutes: 180,
  })
  assert.equal(unapprovedStaffContract.approvedOvertimeMinutes, 0)
  assert.equal(unapprovedStaffContract.hasUnapprovedOtClaim, true)
  assert.equal(unapprovedStaffContract.unapprovedClaimReason, 'STAFF_CLAIMED_OT_WITHOUT_SUPERVISOR_APPROVAL')

  // Case 4: Explicit supervisor rejection yields 0 OT and flags exception
  assert.equal(parseApprovedOvertimeMinutes('Từ chối OT', 'OT: 30p', 180), 0)
  const rejectedContract = evaluateApprovedOtEvidence({
    reviewNote: 'Không duyệt tăng ca do không có lệnh điều động',
    evidenceNote: 'OT: 30p',
    actualMinutes: 180,
  })
  assert.equal(rejectedContract.approvedOvertimeMinutes, 0)
  assert.equal(rejectedContract.hasUnapprovedOtClaim, true)
  assert.equal(rejectedContract.unapprovedClaimReason, 'SUPERVISOR_REJECTED_OT')

  // Case 5: Caps at actual minutes
  assert.equal(parseApprovedOvertimeMinutes('OT: 300p', null, 120), 120)
})

test('calculateRecalculationDiffs: recalculates rates and strictly preserves accountant adjustments', () => {
  const lines: PayrollLineRecalcTarget[] = [
    {
      id: 'line-1',
      segmentId: 'seg-1',
      staffId: 'staff-alice',
      role: 'host',
      shiftDate: '2026-10-10',
      actualMinutes: 120,
      payableMinutes: 120,
      overtimeMinutes: 0,
      rateCardId: 'rate-host-old',
      rateVndPerHour: 100_000,
      overtimeMultiplierBasisPoints: 15_000,
      grossVnd: 200_000,
      adjustmentVnd: 50_000, // Manual bonus added by accountant
      adjustmentReason: 'Thưởng KPI phiên Live',
      netVnd: 250_000,
      version: 1,
    },
    {
      id: 'line-2',
      segmentId: 'seg-2',
      staffId: 'staff-bob',
      role: 'support',
      shiftDate: '2026-10-10',
      actualMinutes: 60,
      payableMinutes: 60,
      overtimeMinutes: 0,
      rateCardId: 'rate-support-unchanged',
      rateVndPerHour: 80_000,
      overtimeMultiplierBasisPoints: 15_000,
      grossVnd: 80_000,
      adjustmentVnd: -10_000,
      adjustmentReason: 'Phạt đi trễ',
      netVnd: 70_000,
      version: 1,
    },
  ]

  const newRates: ApprovedPayrollRate[] = [
    // Alice rate increased from 100k to 120k
    {
      id: 'rate-host-new',
      staffId: null,
      role: 'host',
      effectiveFrom: '2026-10-01',
      effectiveThrough: null,
      vndPerHour: 120_000,
      overtimeMultiplierBasisPoints: 15_000,
      approvedBy: 'admin-2',
    },
    // Bob rate remains 80k
    {
      id: 'rate-support-unchanged',
      staffId: null,
      role: 'support',
      effectiveFrom: '2026-10-01',
      effectiveThrough: null,
      vndPerHour: 80_000,
      overtimeMultiplierBasisPoints: 15_000,
      approvedBy: 'admin-2',
    },
  ]

  const { diffs, summary } = calculateRecalculationDiffs({ lines, rates: newRates })

  assert.equal(summary.totalLines, 2)
  assert.equal(summary.changedLinesCount, 1) // Only Alice changed
  assert.equal(summary.totalGrossDeltaVnd, 40_000) // 120m @ 120k (240k) - 200k = +40k
  assert.equal(summary.totalNetDeltaVnd, 40_000)
  assert.equal(summary.preservedAdjustmentsCount, 2) // Both lines preserved adjustments

  const aliceDiff = diffs.find(d => d.lineId === 'line-1')
  assert.ok(aliceDiff)
  assert.equal(aliceDiff.rateChanged, true)
  assert.equal(aliceDiff.oldRateVndPerHour, 100_000)
  assert.equal(aliceDiff.newRateVndPerHour, 120_000)
  assert.equal(aliceDiff.oldGrossVnd, 200_000)
  assert.equal(aliceDiff.newGrossVnd, 240_000)
  assert.equal(aliceDiff.grossDeltaVnd, 40_000)
  assert.equal(aliceDiff.adjustmentVnd, 50_000) // Preserved
  assert.equal(aliceDiff.adjustmentReason, 'Thưởng KPI phiên Live') // Preserved
  assert.equal(aliceDiff.oldNetVnd, 250_000)
  assert.equal(aliceDiff.newNetVnd, 290_000)
  assert.equal(aliceDiff.netDeltaVnd, 40_000)

  const bobDiff = diffs.find(d => d.lineId === 'line-2')
  assert.ok(bobDiff)
  assert.equal(bobDiff.rateChanged, false)
  assert.equal(bobDiff.netDeltaVnd, 0)
  assert.equal(bobDiff.adjustmentVnd, -10_000)
})

test('Business Date Correction: rates effective from 15/10 only apply to shifts on or after 15/10', () => {
  const rates: ApprovedPayrollRate[] = [
    {
      id: 'rate-host-old',
      staffId: null,
      role: 'host',
      effectiveFrom: '2026-10-01',
      effectiveThrough: '2026-10-14',
      vndPerHour: 100_000,
      overtimeMultiplierBasisPoints: 15_000,
      approvedBy: 'admin-1',
    },
    {
      id: 'rate-host-new',
      staffId: null,
      role: 'host',
      effectiveFrom: '2026-10-15',
      effectiveThrough: null,
      vndPerHour: 150_000,
      overtimeMultiplierBasisPoints: 15_000,
      approvedBy: 'admin-1',
    },
    {
      id: 'rate-host-alice-vip',
      staffId: 'staff-alice',
      role: 'host',
      effectiveFrom: '2026-10-15',
      effectiveThrough: null,
      vndPerHour: 200_000,
      overtimeMultiplierBasisPoints: 20_000,
      approvedBy: 'admin-1',
    },
  ]

  // Shift on 14/10 (before rate cutover) -> uses old rate 100k
  const bob14 = selectApprovedRate({ staffId: 'staff-bob', role: 'host' }, '2026-10-14', rates)
  assert.equal(bob14.id, 'rate-host-old')
  assert.equal(bob14.vndPerHour, 100_000)

  // Shift on 15/10 (cutover day) -> uses new rate 150k
  const bob15 = selectApprovedRate({ staffId: 'staff-bob', role: 'host' }, '2026-10-15', rates)
  assert.equal(bob15.id, 'rate-host-new')
  assert.equal(bob15.vndPerHour, 150_000)

  // Alice shift on 15/10 -> staff-specific takes precedence over role-default
  const alice15 = selectApprovedRate({ staffId: 'staff-alice', role: 'host' }, '2026-10-15', rates)
  assert.equal(alice15.id, 'rate-host-alice-vip')
  assert.equal(alice15.vndPerHour, 200_000)

  // Alice shift on 14/10 -> her specific rate is not yet effective, falls back to role default old
  const alice14 = selectApprovedRate({ staffId: 'staff-alice', role: 'host' }, '2026-10-14', rates)
  assert.equal(alice14.id, 'rate-host-old')
  assert.equal(alice14.vndPerHour, 100_000)
})

test('autoCalculatePeriodLines: flags unapproved OT claims as exceptions while calculating OT=0', () => {
  const period = { periodStart: '2026-10-01', periodEnd: '2026-10-31' }
  const rates: ApprovedPayrollRate[] = [
    {
      id: 'rate-host-default',
      staffId: null,
      role: 'host',
      effectiveFrom: '2026-10-01',
      effectiveThrough: null,
      vndPerHour: 100_000,
      overtimeMultiplierBasisPoints: 15_000,
      approvedBy: 'admin-1',
    },
  ]

  const segments = [
    {
      segment: {
        id: 'seg-unapproved-ot',
        shiftId: 'shift-1',
        staffId: 'staff-carol',
        role: 'host' as const,
        eventKind: 'worked' as const,
        reviewStatus: 'approved' as const,
        startAt: '2026-10-10T10:00:00+07:00',
        endAt: '2026-10-10T13:00:00+07:00', // 180 mins
        reviewNote: 'Đã duyệt ca chuẩn', // Supervisor did NOT approve OT
        evidenceNote: 'Em có làm thêm tăng ca: 60 phút', // Staff claim
      },
      shiftDate: '2026-10-10',
    },
  ]

  const result = autoCalculatePeriodLines({
    period,
    segments,
    rates,
  })

  assert.equal(result.preparedLines.length, 1)
  const line = result.preparedLines[0]
  assert.equal(line.actualMinutes, 180)
  assert.equal(line.payableMinutes, 180)
  assert.equal(line.overtimeMinutes, 0) // Strictly 0 OT paid
  assert.equal(line.grossVnd, 300_000) // 180 mins * 100k / 60 = 300k, no OT multiplier

  assert.equal(result.unapprovedOtExceptions.length, 1)
  assert.equal(result.unapprovedOtExceptions[0].staffId, 'staff-carol')
  assert.equal(result.unapprovedOtExceptions[0].reason, 'STAFF_CLAIMED_OT_WITHOUT_SUPERVISOR_APPROVAL')
})

