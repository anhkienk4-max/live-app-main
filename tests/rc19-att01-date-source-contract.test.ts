import assert from 'node:assert/strict'
import test from 'node:test'
import {
  parseCanonicalDateWithOrder,
  parseExcelSerialDate,
  parseRawAttendanceRow,
  SOURCE_PROFILES,
} from '../lib/workforce/historicalAttendanceParser'

test('ATT-01 rejects impossible ISO and locale dates without rollover', () => {
  for (const date of ['2026-02-29', '2026-02-31', '2026-13-01', '02/31/2026', '31/04/2026', '00/10/2026']) {
    assert.equal(parseCanonicalDateWithOrder(date, 'month-first').date, null, date)
  }
  assert.equal(parseCanonicalDateWithOrder('2024-02-29', 'iso').date, '2024-02-29')
  assert.equal(parseCanonicalDateWithOrder('10/25/2026', 'month-first').date, '2026-10-25')
  assert.equal(parseCanonicalDateWithOrder('25/10/2026', 'day-first').date, '2026-10-25')
})

test('ATT-01 preserves Excel numeric serials as canonical dates', () => {
  assert.equal(parseCanonicalDateWithOrder(46300, 'month-first').date, parseExcelSerialDate(46300))
  assert.equal(parseCanonicalDateWithOrder('46300', 'month-first').date, null)
})

test('ATT-01 respects 12-hour day shift and overnight check-in/out evidence', () => {
  const day = parseRawAttendanceRow({
    rowNumber: 1, date: '10/10/2026', timeRange: '09:00 - 21:00',
    hostName: 'Ada Host', checkIn: '09:00', checkOut: '21:00',
  }, SOURCE_PROFILES.opella_t10)
  assert.equal(day.errors.length, 0)
  assert.equal(day.segments.length, 1)
  assert.equal(day.segments[0].durationMinutes, 720)
  assert.equal(day.segments[0].evidenceKind, 'actual_punch')
  assert.equal(day.segments[0].endAtIso, '2026-10-10T21:00:00+07:00')

  const night = parseRawAttendanceRow({
    rowNumber: 2, date: '10/10/2026', timeRange: '22:00 - 02:00',
    hostName: 'Ada Host', checkIn: '22:00', checkOut: '02:00',
  }, SOURCE_PROFILES.opella_t10)
  assert.equal(night.errors.length, 0)
  assert.equal(night.segments.length, 1)
  assert.equal(night.segments[0].durationMinutes, 240)
  assert.equal(night.segments[0].endAtIso, '2026-10-11T02:00:00+07:00')
})

test('ATT-01 never converts missing actual punches to approved attendance', () => {
  const result = parseRawAttendanceRow({
    rowNumber: 3, date: '10/10/2026', timeRange: '09:00 - 13:00',
    hostName: 'Ada Host', notes: 'Done',
  }, SOURCE_PROFILES.opella_t10)
  assert.equal(result.segments[0].evidenceKind, 'missing_evidence')
  assert.equal(result.segments[0].durationMinutes, 0)
  assert.equal(result.segments[0].startAtIso, '')
})

test('ATT-01 duplicate source rows stay exceptions and cannot create two DRAFTs', async () => {
  const { previewAttendanceImport, buildActualSegmentsFromMatches } = await import('../lib/workforce/historicalAttendanceService')
  const samePunch = {
    date: '10/10/2026', timeRange: '09:00 - 13:00',
    hostName: 'Ada Host', checkIn: '09:00', checkOut: '13:00',
  }
  const preview = previewAttendanceImport({
    batchId: 'test-batch',
    sourceProfileId: 'opella_t10',
    sourceType: 'google_sheets',
    sourceName: 'exact-row-replay',
    brandName: 'Opella',
    rawRows: [
      { rowNumber: 1, ...samePunch },
      { rowNumber: 2, ...samePunch },
    ],
    shifts: [{
      id: 'shift-1', date: '2026-10-10', startTime: '09:00:00', endTime: '13:00:00',
      status: 'completed', brandName: 'Opella', hostId: 'staff-1',
    }],
    staffList: [{
      id: 'staff-1', fullName: 'Ada Host', systemPermission: 'member', status: 'active',
    }],
  })
  assert.equal(preview.summary.totalRows, 2)
  assert.equal(preview.summary.matchedRows, 1)
  assert.equal(preview.summary.exceptionRows, 1)
  assert.equal(preview.summary.exceptionsSummary.OVERLAP_CONFLICT, 1)
  assert.equal(preview.results[0].status, 'matched')
  assert.equal(preview.results[1].status, 'exception')
  assert.equal(preview.results[1].exceptionCode, 'OVERLAP_CONFLICT')
  assert.match(preview.results[1].exceptionDetail || '', /^DUPLICATE_SOURCE_ROW:/)
  const drafts = buildActualSegmentsFromMatches({
    matchedResults: preview.results, creatorId: 'admin-1', batchId: preview.batchId,
  })
  assert.equal(drafts.length, 1)
  assert.equal(drafts[0].review_status, 'draft')
})

test('ATT-01 flags non-identical and nested interval overlap within the same shift/staff/role', async () => {
  const { previewAttendanceImport, buildActualSegmentsFromMatches } = await import('../lib/workforce/historicalAttendanceService')
  const base = {
    batchId: 'overlap-batch', sourceProfileId: 'opella_t10' as const,
    sourceType: 'excel_upload' as const, sourceName: 'overlap-scenario', brandName: 'Opella',
    shifts: [{ id: 'shift-1', date: '2026-10-10', startTime: '09:00:00', endTime: '13:00:00', status: 'completed' as const, brandName: 'Opella', hostId: 'staff-1' }],
    staffList: [{ id: 'staff-1', fullName: 'Ada Host', systemPermission: 'member', status: 'active' as const }],
  }
  const row = (rowNumber: number, checkIn: string, checkOut: string) => ({
    rowNumber, shiftCode: 'shift-1', date: '10/10/2026',
    timeRange: checkIn + ' - ' + checkOut, hostName: 'Ada Host', checkIn, checkOut,
  })
  for (const [secondStart, secondEnd] of [['09:05', '13:00'], ['10:00', '12:00'], ['09:00', '12:50']]) {
    const preview = previewAttendanceImport({ ...base, rawRows: [row(1, '09:00', '13:00'), row(2, secondStart, secondEnd)] })
    assert.deepEqual(preview.results.map(result => result.status), ['matched', 'exception'])
    assert.equal(preview.results[1].exceptionCode, 'OVERLAP_CONFLICT')
    assert.match(preview.results[1].exceptionDetail || '', /^INTRA_BATCH_OVERLAP:.*#1/)
    assert.equal(preview.summary.matchedRows, 1)
    assert.equal(preview.summary.exceptionsSummary.OVERLAP_CONFLICT, 1)
    assert.equal(buildActualSegmentsFromMatches({ matchedResults: preview.results, batchId: preview.batchId, creatorId: 'reviewer' }).length, 1)
  }
})

test('ATT-01 accepts touching nonoverlapping intervals of one shift/staff/role', async () => {
  const { previewAttendanceImport, buildActualSegmentsFromMatches } = await import('../lib/workforce/historicalAttendanceService')
  const preview = previewAttendanceImport({
    batchId: 'adjacent-batch', sourceType: 'csv_upload', sourceName: 'adjacent-scenario', sourceProfileId: 'opella_t10', brandName: 'Opella',
    rawRows: [
      { rowNumber: 1, date: '10/10/2026', shiftCode: 'shift-1', timeRange: '09:00 - 11:00', hostName: 'Ada Host', checkIn: '09:00', checkOut: '11:00' },
      { rowNumber: 2, date: '10/10/2026', shiftCode: 'shift-1', timeRange: '11:00 - 13:00', hostName: 'Ada Host', checkIn: '11:00', checkOut: '13:00' },
    ],
    shifts: [{ id: 'shift-1', date: '2026-10-10', startTime: '09:00:00', endTime: '13:00:00', status: 'completed', brandName: 'Opella', hostId: 'staff-1' }],
    staffList: [{ id: 'staff-1', fullName: 'Ada Host', systemPermission: 'member', status: 'active' }],
  })
  assert.deepEqual(preview.results.map(result => result.status), ['matched', 'matched'])
  assert.equal(preview.summary.exceptionsSummary.OVERLAP_CONFLICT, 0)
  assert.equal(buildActualSegmentsFromMatches({ matchedResults: preview.results, batchId: preview.batchId, creatorId: 'reviewer' }).length, 2)
})

test('ATT-01 isolates overlapping intervals by staff and operational role', async () => {
  const { previewAttendanceImport } = await import('../lib/workforce/historicalAttendanceService')
  const preview = previewAttendanceImport({
    batchId: 'separate-staff-batch', sourceType: 'excel_upload', sourceName: 'independent-staff', sourceProfileId: 'opella_t10', brandName: 'Opella',
    rawRows: [
      { rowNumber: 1, date: '10/10/2026', shiftCode: 'shift-1', timeRange: '09:00 - 13:00', hostName: 'Ada Host', checkIn: '09:00', checkOut: '13:00' },
      { rowNumber: 2, date: '10/10/2026', shiftCode: 'shift-1', timeRange: '09:05 - 13:00', hostName: 'Other Host', checkIn: '09:05', checkOut: '13:00' },
      { rowNumber: 3, date: '10/10/2026', shiftCode: 'shift-1', timeRange: '09:00 - 13:00', assistantName: 'Ada Host', checkIn: '09:00', checkOut: '13:00' },
    ],
    shifts: [{ id: 'shift-1', date: '2026-10-10', startTime: '09:00:00', endTime: '13:00:00', status: 'completed', brandName: 'Opella', hostId: 'staff-1', supportId: 'staff-1' }],
    staffList: [
      { id: 'staff-1', fullName: 'Ada Host', systemPermission: 'member', status: 'active' },
      { id: 'staff-2', fullName: 'Other Host', systemPermission: 'member', status: 'active' },
    ],
  })
  assert.deepEqual(preview.results.map(result => result.status), ['matched', 'matched', 'matched'])
  assert.equal(preview.summary.exceptionsSummary.OVERLAP_CONFLICT, 0)
})
