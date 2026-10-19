import test from 'node:test'
import assert from 'node:assert/strict'
import {
  autoCalculatePeriodLines,
  calculateLivePreview,
  minuteDifference,
  type ApprovedPayrollRate,
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
