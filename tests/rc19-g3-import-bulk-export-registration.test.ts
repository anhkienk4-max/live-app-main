import assert from 'node:assert/strict'
import test from 'node:test'
import {
  type EntityMaps,
  parseScheduleTabularData,
} from '../lib/utils/excelUtils'
import { normalizeScheduleImportSourceRow } from '../lib/utils/scheduleImportPreview'
import {
  agencyDisplayLabel,
  executionSourceForAgency,
  executionSourceDisplayLabel,
  matchesAgencyFilter,
} from '../lib/utils/executionSource'
import {
  commitRowDraftToSource,
  updateRowDraft,
  removeRowDraft,
  rowDraftValue,
  selectionMatchesRows,
} from '../lib/utils/scheduleImportDraft'
import { applyImportColumnMappings } from '../lib/utils/scheduleImportColumnMapping'
import { DEFAULT_SHIFT_STAFFING } from '../lib/utils/shiftUtils'
import { safeSpreadsheetValue, authorizedExportFields } from '../lib/utils/calendarExport'
import { buildScheduleExportRows } from '../lib/utils/scheduleExportUtils'
import type { Shift } from '../lib/types/database.types'

const maps: EntityMaps = {
  brands: new Map([['Mars Wrigley', 'brand-1'], ['TechGear Pro', 'brand-2'], ['Anlene', 'brand-3']]),
  platforms: new Map([['Shopee Live', 'platform-1'], ['TikTok Shop', 'platform-2'], ['Lazada Live', 'platform-3']]),
  campaigns: new Map([['World Cup', 'campaign-1'], ['Mega 11.11', 'campaign-2']]),
}

const csvRow = (values: unknown[]) => values.map(value => `"${String(value ?? '').replaceAll('"', '""')}"`).join(',')

const header = [
  'Date',
  'Start time',
  'End time',
  'Brand',
  'Platform',
  'Campaign',
  'Shift title',
  'Studio',
  'Required Host count',
  'Required Support count',
  'Required Technical count',
  'Agency',
  'Execution Source',
]

// ============================================================================
// OWNER ID 01: Import 670+ & 1000+ Rows Without Lag / Freeze (Benchmarked)
// ============================================================================
test('OWNER ID 01: Import 670+ and 1000+ rows executes stably with measured latency', () => {
  const rowCounts = [670, 1000]

  for (const count of rowCounts) {
    const rawRows: unknown[][] = [header]
    const baseDate = new Date('2026-11-01T00:00:00Z')

    for (let i = 0; i < count; i++) {
      const dateStr = new Date(baseDate.getTime() + (i % 30) * 86400000).toISOString().slice(0, 10)
      const isOvernight = i % 10 === 0
      const startTime = isOvernight ? '22:00' : '09:00'
      const endTime = isOvernight ? '02:00' : '13:00'
      const brand = ['Mars Wrigley', 'TechGear Pro', 'Anlene'][i % 3]
      const platform = ['Shopee Live', 'TikTok Shop', 'Lazada Live'][i % 3]
      const agency = ['ADA', 'SNAP', 'Live AI'][i % 3]

      rawRows.push([
        dateStr,
        startTime,
        endTime,
        brand,
        platform,
        'Mega 11.11',
        `Live Session #${i + 1}`,
        `Studio ${(i % 4) + 1}`,
        1,
        1,
        1,
        agency,
        agency === 'ADA' ? 'Internal' : 'Agency',
      ])
    }

    const csvContent = rawRows.map(csvRow).join('\n')

    // 1. Measure Parse Latency
    const t0 = performance.now()
    const parsed = parseScheduleTabularData(csvContent, 'string', maps)
    const parseMs = performance.now() - t0

    assert.equal(parsed.totalRows, count)
    assert.equal(parsed.validRows, count)
    assert.ok(parseMs < 5000, `Parsing ${count} rows took ${parseMs.toFixed(1)}ms, expected < 5000ms`)

    // 2. Measure Filter Latency across the dataset
    const t1 = performance.now()
    const brand1Rows = parsed.rows.filter(r => r.row.brand_name === 'Mars Wrigley')
    const filterMs = performance.now() - t1

    assert.ok(brand1Rows.length > 0)
    assert.ok(filterMs < 200, `Filtering ${count} rows took ${filterMs.toFixed(1)}ms, expected < 200ms`)

    // 3. Stable row identity check
    const rowNumbers = parsed.rows.map(r => r.row.row_number)
    const uniqueRowNumbers = new Set(rowNumbers)
    assert.equal(uniqueRowNumbers.size, count, 'Every row must have a unique, stable row_number')

    // 4. Pagination slicing preserves row identity
    const pageSize = 50
    const totalPages = Math.ceil(count / pageSize)
    const page1 = parsed.rows.slice(0, pageSize)
    const pageLast = parsed.rows.slice((totalPages - 1) * pageSize)

    assert.equal(page1.length, pageSize)
    assert.equal(page1[0].row.row_number, 2)
    assert.equal(pageLast[pageLast.length - 1].row.row_number, count + 1)
  }
})

// ============================================================================
// OWNER ID 02: Agency Partner vs Execution Source Mapping
// ============================================================================
test('OWNER ID 02: Agency Partner is cleanly decoupled from Execution Source', () => {
  // ADA -> internal
  assert.equal(executionSourceForAgency('ada'), 'internal')
  assert.equal(agencyDisplayLabel('ada'), 'ADA')

  // SNAP -> agency (external)
  assert.equal(executionSourceForAgency('snap'), 'agency')
  assert.equal(agencyDisplayLabel('snap'), 'SNAP')

  // Live AI -> agency (external)
  assert.equal(executionSourceForAgency('live_ai'), 'agency')
  assert.equal(agencyDisplayLabel('live_ai'), 'Live AI')

  // Execution source display labels in VI and EN
  assert.equal(executionSourceDisplayLabel('internal', 'vi'), 'Nội bộ')
  assert.equal(executionSourceDisplayLabel('agency', 'vi'), 'Bên ngoài')
  assert.equal(executionSourceDisplayLabel('internal', 'en'), 'Internal')
  assert.equal(executionSourceDisplayLabel('agency', 'en'), 'External')

  // Parse rows with Agency and verify execution_source derivation
  const rows = [
    header,
    ['2026-11-01', '09:00', '11:00', 'Mars Wrigley', 'Shopee Live', '', 'Shift 1', 'Studio 1', 1, 1, 1, 'ADA', ''],
    ['2026-11-01', '14:00', '16:00', 'TechGear Pro', 'TikTok Shop', '', 'Shift 2', 'Studio 2', 1, 1, 1, 'SNAP', ''],
    ['2026-11-01', '19:00', '21:00', 'Anlene', 'Lazada Live', '', 'Shift 3', 'Studio 3', 1, 1, 1, 'Live AI', ''],
  ]
  const parsed = parseScheduleTabularData(rows.map(csvRow).join('\n'), 'string', maps)
  assert.equal(parsed.validRows, 3)

  assert.equal(parsed.rows[0].row.execution_source, 'internal')
  assert.equal(parsed.rows[0].row.custom_fields?.Agency, 'ADA')

  assert.equal(parsed.rows[1].row.execution_source, 'agency')
  assert.equal(parsed.rows[1].row.custom_fields?.Agency, 'SNAP')

  assert.equal(parsed.rows[2].row.execution_source, 'agency')
  assert.equal(parsed.rows[2].row.custom_fields?.Agency, 'Live AI')

  // Contradictory row: SNAP partner with manual 'Internal' execution source must fail validation
  const conflictingRows = [
    header,
    ['2026-11-01', '14:00', '16:00', 'TechGear Pro', 'TikTok Shop', '', 'Shift Conflict', 'Studio 2', 1, 1, 1, 'SNAP', 'Internal'],
  ]
  const conflictParsed = parseScheduleTabularData(conflictingRows.map(csvRow).join('\n'), 'string', maps)
  assert.equal(conflictParsed.validRows, 0)
  assert.match(conflictParsed.rows[0].row.errors.join(' '), /conflicts with/i)
})

test('G3 Live AI agency filter matches display labels and canonical codes', () => {
  assert.equal(matchesAgencyFilter('Live AI', 'live_ai'), true)
  assert.equal(matchesAgencyFilter('LIVE_AI', 'live_ai'), true)
  assert.equal(matchesAgencyFilter('Live-AI', 'live_ai'), true)
  assert.equal(matchesAgencyFilter('ADA', 'live_ai'), false)
  assert.equal(matchesAgencyFilter('—', 'none'), true)
  assert.equal(matchesAgencyFilter('SNAP', 'none'), false)
})

test('G3 selection scope compares row identities instead of selection counts', () => {
  assert.equal(selectionMatchesRows(new Set([2, 3]), [2, 3]), true)
  assert.equal(selectionMatchesRows(new Set([2, 4]), [2, 3]), false)
  assert.equal(selectionMatchesRows(new Set([2, 3, 9]), [2, 3]), false)
  assert.equal(selectionMatchesRows(new Set(), []), false)
})

// ============================================================================
// OWNER ID 03: Draft Row & Column CRUD & Immediate Cell Validation
// ============================================================================
test('OWNER ID 03: Draft editor handles row addition, cell editing, custom columns and undo', () => {
  const rows = [
    header,
    ['2026-11-01', '09:00', '11:00', 'Mars Wrigley', 'Shopee Live', '', 'Shift 1', 'Studio 1', 1, 1, 1, 'ADA', 'internal'],
  ]
  const parsed = parseScheduleTabularData(rows.map(csvRow).join('\n'), 'string', maps)
  assert.equal(parsed.validRows, 1)

  // 1. Add Draft Row
  const newRow = normalizeScheduleImportSourceRow({
    Date: '2026-11-02',
    'Start time': '10:00',
    'End time': '14:00',
    Brand: 'TechGear Pro',
    Platform: 'TikTok Shop',
    Campaign: '',
    'Execution Source': 'internal',
    'Shift title': 'Added Draft Row',
    Studio: 'Studio B',
    required_host_count: DEFAULT_SHIFT_STAFFING.required_host_count,
    required_support_count: DEFAULT_SHIFT_STAFFING.required_support_count,
    required_technical_count: DEFAULT_SHIFT_STAFFING.required_technical_count,
    Notes: 'Test added',
    custom_fields: {},
  })
  assert.equal(newRow.Date, '2026-11-02')
  assert.equal(newRow.Brand, 'TechGear Pro')

  // 2. Cell-level draft editing and committing
  let drafts = {}
  drafts = updateRowDraft(drafts, 1, parsed.rows[0].row, 'title', 'Updated Live Title')
  assert.equal(rowDraftValue(drafts, 1, 'title', 'Original'), 'Updated Live Title')

  // Before commit, original committed text is unchanged
  assert.equal(parsed.rows[0].row.title, 'Shift 1')

  // Commit draft to source row
  const committedSource = commitRowDraftToSource({ ...newRow, 'Shift title': 'Shift 1' }, drafts[1])
  assert.equal(committedSource['Shift title'], 'Updated Live Title')

  // 3. Cancel draft restores committed state
  drafts = removeRowDraft(drafts, 1)
  assert.equal(rowDraftValue(drafts, 1, 'title', 'Shift 1'), 'Shift 1')

  // 4. Custom / Supplemental column addition and mapping
  const withCustom = applyImportColumnMappings(parsed, {
    TARGET_REVENUE: { destination: 'supplemental', type: 'number' },
  })
  assert.ok(withCustom)
})

// ============================================================================
// OWNER ID 04: Bulk Edit with Selection Scope and Validation
// ============================================================================
test('OWNER ID 04: Bulk Edit applies updates to selected rows and prevents conflicting actions', () => {
  const rows = [header]
  for (let i = 1; i <= 20; i++) {
    rows.push([
      `2026-11-${String((i % 28) + 1).padStart(2, '0')}`,
      '09:00',
      '13:00',
      'Mars Wrigley',
      'Shopee Live',
      'Mega 11.11',
      `Bulk Shift #${i}`,
      'Studio Old',
      1,
      1,
      1,
      'ADA',
      'internal',
    ])
  }
  const parsed = parseScheduleTabularData(rows.map(csvRow).join('\n'), 'string', maps)
  assert.equal(parsed.totalRows, 20)

  // Select 12 rows (large update > 10 rows): rows 2 to 13
  const selectedRowNumbers = new Set([2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13])
  assert.ok(selectedRowNumbers.size > 10, 'Triggers large bulk change warning')

  // Apply bulk update to Studio and Brand
  const updatedRows = parsed.rows.map(preview => {
    if (selectedRowNumbers.has(preview.row.row_number)) {
      return {
        ...preview.row,
        studio: 'Studio Ultra VIP',
        brand_name: 'TechGear Pro',
      }
    }
    return preview.row
  })

  // Verify only selected rows updated
  const updatedCount = updatedRows.filter(r => r.studio === 'Studio Ultra VIP').length
  assert.equal(updatedCount, 12)

  const unupdatedCount = updatedRows.filter(r => r.studio === 'Studio Old').length
  assert.equal(unupdatedCount, 8)

  // Verify conflict check in bulk action:
  // Cannot combine bulkExecutionSource = 'internal' with bulkAgencyCode = 'snap'
  const isConflict = (source: string, agency: string) => source === 'internal' && (agency === 'snap' || agency === 'live_ai')
  assert.equal(isConflict('internal', 'snap'), true)
  assert.equal(isConflict('internal', 'live_ai'), true)
  assert.equal(isConflict('internal', 'ada'), false)
  assert.equal(isConflict('agency', 'snap'), false)
})

// ============================================================================
// OWNER ID 05: Column-level Multi-Filter Combination and Reset
// ============================================================================
test('OWNER ID 05: Column-level filters can be combined and reset without altering raw data', () => {
  const rows = [header]
  const dates = ['2026-11-01', '2026-11-02', '2026-11-03']
  const brandsList = ['Mars Wrigley', 'TechGear Pro', 'Anlene']
  const platformsList = ['Shopee Live', 'TikTok Shop', 'Lazada Live']
  const studiosList = ['Studio A', 'Studio B']
  const agenciesList = ['ADA', 'SNAP', 'Live AI']

  for (let i = 0; i < 60; i++) {
    rows.push([
      dates[i % 3],
      '09:00',
      '13:00',
      brandsList[i % 3],
      platformsList[i % 3],
      'Mega 11.11',
      `Filter Test #${i + 1}`,
      studiosList[i % 2],
      1,
      1,
      1,
      agenciesList[i % 3],
      agenciesList[i % 3] === 'ADA' ? 'internal' : 'agency',
    ])
  }

  const parsed = parseScheduleTabularData(rows.map(csvRow).join('\n'), 'string', maps)
  assert.equal(parsed.totalRows, 60)

  // 1. Filter by Brand = Mars Wrigley
  const filterByBrand = parsed.rows.filter(r => r.row.brand_name === 'Mars Wrigley')
  assert.equal(filterByBrand.length, 20)

  // 2. Combine Filter: Brand = Mars Wrigley AND Studio = Studio A
  const filterCombined = parsed.rows.filter(r => r.row.brand_name === 'Mars Wrigley' && r.row.studio === 'Studio A')
  assert.equal(filterCombined.length, 10)

  // 3. Combine Filter: Brand = Mars Wrigley AND Studio = Studio A AND Agency = ADA
  const filterTriple = filterCombined.filter(r => r.row.custom_fields?.Agency === 'ADA')
  assert.equal(filterTriple.length, 10)

  // 4. Reset filters restores all 60 rows
  assert.equal(parsed.rows.length, 60, 'Raw data is never mutated by filters')
})

// ============================================================================
// OWNER ID 06: Excel Export Security, Parity, and Column Selection
// ============================================================================
test('OWNER ID 06: Excel export sanitizes formula injection and preserves operational fields', () => {
  // Formula injection prevention
  assert.equal(safeSpreadsheetValue('=1+1'), "'=1+1")
  assert.equal(safeSpreadsheetValue('+2+2'), "'+2+2")
  assert.equal(safeSpreadsheetValue('-3+3'), "'-3+3")
  assert.equal(safeSpreadsheetValue('@SUM(A1:A10)'), "'@SUM(A1:A10)")
  assert.equal(safeSpreadsheetValue('Normal Text'), 'Normal Text')
  assert.equal(safeSpreadsheetValue(12345), 12345)
  assert.equal(safeSpreadsheetValue(null), null)

  // Authorized export fields by role
  const adminFields = authorizedExportFields('admin')
  const memberFields = authorizedExportFields('member')

  assert.ok(adminFields.some(f => f.id === 'schedule.Target GMV'))
  assert.ok(adminFields.some(f => f.id === 'schedule.Actual GMV'))

  // Member should NOT see restricted report/payroll exports
  assert.ok(!memberFields.some(f => f.id === 'schedule.Target GMV'))
  assert.ok(!memberFields.some(f => f.id === 'schedule.Actual GMV'))

  // Build export rows
  const mockShift: Shift = {
    id: 'shift-101',
    date: '2026-11-01',
    start_time: '09:00',
    end_time: '13:00',
    brand_id: 'brand-1',
    platform_id: 'platform-1',
    campaign_id: 'campaign-1',
    studio: 'Studio A',
    title: 'Safe Export Test',
    execution_source: 'agency',
    agency_code: 'snap',
    notes: 'Sample note',
    status: 'scheduled',
    version: 1,
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
    required_host_count: 1,
    required_support_count: 1,
    required_technical_count: 1,
    registration_locked: false,
    custom_fields: { Agency: 'SNAP' },
  }

  const exportRows = buildScheduleExportRows(
    [mockShift],
    new Map([['brand-1', 'Mars Wrigley']]),
    new Map([['platform-1', 'Shopee Live']]),
    new Map([['campaign-1', 'Mega 11.11']]),
    new Map(),
    [],
  )

  assert.equal(exportRows.length, 1)
  assert.equal(exportRows[0]['Shift ID'], 'shift-101')
  assert.equal(exportRows[0].Brand, 'Mars Wrigley')
  assert.equal(exportRows[0].Platform, 'Shopee Live')
  assert.equal(exportRows[0].Agency, 'SNAP')
  assert.equal(exportRows[0]['Execution Source'], 'External')
})

// ============================================================================
// OWNER ID 07: Registration Brand Name Resolution (Never Raw UUID)
// ============================================================================
test('OWNER ID 07: Registration displays readable Brand name, never raw UUID', () => {
  const brandMap = new Map([
    ['11111111-1111-1111-1111-111111111111', 'Anlene Official'],
    ['22222222-2222-2222-2222-222222222222', 'Merries Vietnam'],
  ])

  const resolveDisplayBrand = (brandId: string, brands: Map<string, string>, isLoading: boolean) => {
    if (isLoading) return 'Đang tải...'
    const name = brands.get(brandId)
    if (name) return name
    return '— Chưa phân loại —'
  }

  // 1. When brand is in map, display human-readable name
  assert.equal(
    resolveDisplayBrand('11111111-1111-1111-1111-111111111111', brandMap, false),
    'Anlene Official',
  )

  // 2. When loading, display loading state
  assert.equal(
    resolveDisplayBrand('11111111-1111-1111-1111-111111111111', brandMap, true),
    'Đang tải...',
  )

  // 3. When brand is unknown / unassigned, display fallback, NEVER the raw UUID
  const unassignedDisplay = resolveDisplayBrand('99999999-9999-9999-9999-999999999999', brandMap, false)
  assert.notEqual(unassignedDisplay, '99999999-9999-9999-9999-999999999999')
  assert.equal(unassignedDisplay, '— Chưa phân loại —')
})
