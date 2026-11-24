import test from 'node:test'
import assert from 'node:assert/strict'
import * as XLSX from 'xlsx'
import {
  parseScheduleRows,
  parseScheduleTabularData,
  type EntityMaps,
} from '../lib/utils/excelUtils.ts'
import {
  buildScheduleImportPreviewSourceRow,
  normalizeScheduleImportResult,
} from '../lib/utils/scheduleImportPreview.ts'
import { commitRowDraftToSource } from '../lib/utils/scheduleImportDraft.ts'
import { computeShiftStaffingMetrics } from '../lib/utils/staffingSemantics.ts'
import { verifyImportedShiftReadback } from '../lib/utils/scheduleImportReadback.ts'
import { mapImportResultToBatchRows } from '../lib/utils/scheduleImportBatch.ts'
import { reconcileScheduleImportRows } from '../lib/utils/scheduleImportRecovery.ts'

const kao14hDefinitions = [
  'K01 08:00-12:00 H2 T1 KT0',
  'K02 12:00-17:00 H1 T1 KT0',
  'K03 17:00-22:00 H2 T1 KT0',
].join('\n')

function buildKaoRow(overrides: Record<string, unknown> = {}) {
  return {
    Date: '2026-11-26',
    Weekday: 'Thursday',
    Time: '08:00 - 22:00',
    Brand: 'KAO',
    Platform: 'Shopee Live',
    Studio: 'Studio KAO-1',
    'Shift title': 'KAO Mega Day',
    'External Shift ID': 'KAO-20261126-0800-2200',
    Agency: 'ADA',
    'Execution Source': 'internal',
    'Số khung': 3,
    'Khung nhân sự': kao14hDefinitions,
    Host: 'K01: Host Mai, Host Lan\nK02: Host Hoa\nK03: Host Mai, Host Linh',
    Support: 'K01: Sup Nam\nK02: Sup Bình\nK03: Sup Nam',
    Technical: '',
    ...overrides,
  }
}

function toWorkbookBytes(rows: Record<string, unknown>[]) {
  const headers = [...new Set(rows.flatMap(r => Object.keys(r)))]
  const aoa = [headers, ...rows.map(r => headers.map(h => r[h] ?? ''))]
  const worksheet = XLSX.utils.aoa_to_sheet(aoa)
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Schedule')
  return XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
}

test('Issue 184 KAO 14h segmented workbook preserves KT0, peaks, total positions, staff-hours, and inline edits', () => {
  const maps: EntityMaps = {
    brands: new Map([['KAO', 'brand-kao']]),
    platforms: new Map([['Shopee Live', 'platform-shopee']]),
    campaigns: new Map(),
  }

  const parsed = parseScheduleTabularData(toWorkbookBytes([buildKaoRow()]), 'array', maps, [])
  assert.equal(parsed.errors.length, 0)
  assert.equal(parsed.rows.length, 1)

  const normalized = normalizeScheduleImportResult(parsed)
  const preview = normalized.rows[0]
  assert.equal(preview.row.errors.length, 0)
  assert.equal(preview.row.date, '2026-11-26')
  assert.equal(preview.row.start_time, '08:00')
  assert.equal(preview.row.end_time, '22:00')

  // Peak concurrent headcounts (must NOT sum to 5 or default KT0 -> 1!)
  assert.equal(preview.row.required_host_count, 2)
  assert.equal(preview.row.required_support_count, 1)
  assert.equal(preview.row.required_technical_count, 0)
  assert.equal(preview.shift?.required_host_count, 2)
  assert.equal(preview.shift?.required_support_count, 1)
  assert.equal(preview.shift?.required_technical_count, 0)
  assert.equal(preview.row.staffing_segments?.length, 3)

  const metrics = computeShiftStaffingMetrics({
    ...preview.shift!,
    staffing_segments: preview.row.staffing_segments,
  })
  assert.equal(metrics.roles.host.peak_concurrent_required, 2)
  assert.equal(metrics.roles.host.total_positions_required, 5)
  assert.equal(metrics.roles.host.required_staff_hours, 23)
  assert.equal(metrics.roles.support.peak_concurrent_required, 1)
  assert.equal(metrics.roles.support.total_positions_required, 3)
  assert.equal(metrics.roles.support.required_staff_hours, 14)
  assert.equal(metrics.roles.technical.peak_concurrent_required, 0)
  assert.equal(metrics.roles.technical.total_positions_required, 0)
  assert.equal(metrics.roles.technical.required_staff_hours, 0)

  // Inline edit roundtrip must retain segments + KT0 = 0
  const sourceRow = buildScheduleImportPreviewSourceRow(preview.row)
  const sourceCustomFields = (sourceRow.custom_fields ?? {}) as Record<string, unknown>
  assert.ok(String(sourceCustomFields['Khung nhân sự'] ?? '').includes('KT0'))
  assert.equal(String(sourceCustomFields['Số khung']), '3')

  const editedSource = commitRowDraftToSource(sourceRow, { title: 'KAO Mega Day Updated' })
  const reparsed = normalizeScheduleImportResult(parseScheduleRows([editedSource], maps, []))
  assert.equal(reparsed.rows[0].row.errors.length, 0)
  assert.equal(reparsed.rows[0].row.title, 'KAO Mega Day Updated')
  assert.equal(reparsed.rows[0].row.required_technical_count, 0)
  assert.equal(reparsed.rows[0].row.staffing_segments?.length, 3)
})

test('End-to-end mock store reconciliation: create -> idempotent -> safe update -> readback -> conflict guards', async () => {
  const prevNodeEnv = process.env.NODE_ENV
  const prevMockAuth = process.env.NEXT_PUBLIC_USE_MOCK_DATA
  ;(process.env as Record<string, string | undefined>).NODE_ENV = 'development'
  process.env.NEXT_PUBLIC_USE_MOCK_DATA = 'true'
  try {
    const {
      brandService,
      campaignService,
      currentUserService,
      getShiftRoleCapacities,
      platformService,
      scheduleImportService,
      shiftRegistrationService,
      shiftService,
    } = await import('../lib/services/dataService.ts')

    const [brands, platforms, campaigns] = await Promise.all([
      brandService.getAll(),
      platformService.getAll(),
      campaignService.getAll(),
    ])
    const targetBrand = brands[0]
    const targetPlatform = platforms[0]
    const maps: EntityMaps = {
      brands: new Map(brands.map(b => [b.name, b.id])),
      platforms: new Map(platforms.map(p => [p.name, p.id])),
      campaigns: new Map(campaigns.map(c => [c.name, c.id])),
    }

    const row1 = buildKaoRow({
      Date: '2026-12-20',
      Weekday: 'Sunday',
      Brand: targetBrand.name,
      Platform: targetPlatform.name,
      Studio: 'TaskB-Test-Studio',
      'External Shift ID': 'TASKB-20261220-0800-2200',
    })
    const parsed1 = normalizeScheduleImportResult(parseScheduleTabularData(toWorkbookBytes([row1]), 'array', maps, []))
    assert.equal(parsed1.rows[0].row.errors.length, 0)

    const batch1 = await scheduleImportService.createPreview('excel', 'kao-create.xlsx', {
      totalRows: 1, validRows: 1, invalidRows: 0, warningRows: 0, duplicateRows: 0,
    }, currentUserService.getId())

    const r1 = await shiftService.reconcileFromImport(batch1.id, 1, {
      ...parsed1.rows[0].shift!,
      import_batch_id: batch1.id,
      registration_locked: false,
    })
    assert.equal(r1.kind, 'created')
    assert.equal(r1.verification?.ok, true)
    const createdShift = r1.shift
    assert.equal(createdShift.required_host_count, 2)
    assert.equal(createdShift.required_support_count, 1)
    assert.equal(createdShift.required_technical_count, 0)
    assert.equal(createdShift.persisted_staffing_segments?.length, 3)

    const segIds = createdShift.persisted_staffing_segments!.map(s => s.id)
    const capacities = getShiftRoleCapacities(createdShift, [])
    assert.deepEqual(capacities.map(c => ({ role: c.role, required: c.required })), [
      { role: 'host', required: 5 },
      { role: 'support', required: 3 },
      { role: 'technical', required: 0 },
    ])

    // 2. Identical re-import -> duplicate_skipped (idempotent)
    const r2 = await shiftService.reconcileFromImport(batch1.id, 1, {
      ...parsed1.rows[0].shift!,
      import_batch_id: batch1.id,
      registration_locked: false,
    })
    assert.equal(r2.kind, 'duplicate_skipped')
    assert.equal(r2.shiftId, createdShift.id)

    // 3. Safe re-import increasing K02 Host capacity 1 -> 2 + preserve segment IDs
    const updatedDefs = [
      'K01 08:00-12:00 H2 T1 KT0',
      'K02 12:00-17:00 H2 T1 KT0',
      'K03 17:00-22:00 H2 T1 KT0',
    ].join('\n')
    const parsed3 = normalizeScheduleImportResult(parseScheduleTabularData(
      toWorkbookBytes([buildKaoRow({ ...row1, 'Khung nhân sự': updatedDefs })]),
      'array',
      maps,
      await shiftService.getAll(),
    ))
    const candidate3 = parsed3.rows[0].shift ?? parsed3.rows[0].duplicateCandidate!
    const r3 = await shiftService.reconcileFromImport(batch1.id, 1, {
      ...candidate3,
      import_batch_id: batch1.id,
      registration_locked: false,
    })
    assert.equal(r3.kind, 'updated')
    assert.equal(r3.verification?.ok, true)
    assert.equal(r3.shift.version, 2)
    assert.deepEqual(r3.shift.persisted_staffing_segments?.map(s => s.id), segIds)
    assert.equal(
      verifyImportedShiftReadback({ expected: candidate3, persisted: r3.shift }).ok,
      true,
    )

    // 4. Cross-agency re-import conflict (ada -> snap)
    const conflictAgencyParsed = normalizeScheduleImportResult(parseScheduleTabularData(
      toWorkbookBytes([buildKaoRow({ ...row1, Agency: 'SNAP', 'Execution Source': 'agency' })]),
      'array',
      maps,
      await shiftService.getAll(),
    ))
    const conflictCandidate = conflictAgencyParsed.rows[0].shift ?? conflictAgencyParsed.rows[0].duplicateCandidate!
    const r4 = await shiftService.reconcileFromImport(batch1.id, 1, {
      ...conflictCandidate,
      import_batch_id: batch1.id,
      registration_locked: false,
    })
    assert.equal(r4.kind, 'review_required')
    assert.equal(r4.failureCode, 'IMPORT_CROSS_AGENCY_CONFLICT')

    // 5. Cleanup via mock reconcile recovery batch check & segments helper
    const segmentsFromSvc = await shiftRegistrationService.getSegmentsForShift(createdShift.id)
    assert.equal(segmentsFromSvc.length, 3)

    const batch2 = await scheduleImportService.createPreview('excel', 'kao-batch-reconcile.xlsx', {
      totalRows: 1, validRows: 1, invalidRows: 0, warningRows: 0, duplicateRows: 0,
    }, currentUserService.getId())
    const rows2 = mapImportResultToBatchRows(batch2.id, parsed3).map(r => ({ ...r, status: 'pending' as const }))
    const recSummary = await reconcileScheduleImportRows({
      batchId: batch2.id,
      previews: parsed3.rows,
      batchRows: rows2,
      initialShifts: await shiftService.getAll(),
      createShift: shiftService.create,
      reconcileShiftFromImport: (rowNum, s) => shiftService.reconcileFromImport(batch2.id, rowNum, s),
      refreshShifts: shiftService.getAll,
      recordOutcome: async () => {},
    })
    assert.equal(recSummary.unchanged, 1)
  } finally {
    if (prevNodeEnv === undefined) delete (process.env as Record<string, string | undefined>).NODE_ENV
    else (process.env as Record<string, string | undefined>).NODE_ENV = prevNodeEnv
    if (prevMockAuth === undefined) delete process.env.NEXT_PUBLIC_USE_MOCK_DATA
    else process.env.NEXT_PUBLIC_USE_MOCK_DATA = prevMockAuth
  }
})
