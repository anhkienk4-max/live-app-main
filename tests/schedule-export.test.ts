/**
 * S4D Schedule Export — Focused tests
 *
 * Covers:
 *   - basic column order (all 23 columns present, deterministic)
 *   - filtered export (only passed-in shifts)
 *   - selected-shift export (subset)
 *   - Vietnamese names preserved exactly
 *   - 2026-08-25 date regression (string, not Excel serial)
 *   - 14:00-16:00 time regression (string, not fraction)
 *   - buildScheduleExportFilename — scope naming
 */
import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildScheduleExportRows,
  buildScheduleExportFilename,
  SCHEDULE_EXPORT_COLUMN_ORDER,
} from '../lib/utils/scheduleExportUtils.ts'
import type { Shift } from '../lib/types/database.types.ts'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeShift(overrides: Partial<Shift> = {}): Shift {
  return {
    id: 'shift-001',
    date: '2026-08-25',
    start_time: '14:00',
    end_time: '16:00',
    brand_id: 'brand-1',
    platform_id: 'platform-1',
    campaign_id: 'campaign-1',
    title: 'Morning live',
    studio: 'Studio A',
    host_names: ['Nguyen Thi Huong'],
    assistant_names: ['An'],
    technical_names: ['Minh'],
    required_host_count: 1,
    required_support_count: 1,
    required_technical_count: 1,
    status: 'scheduled',
    registration_locked: false,
    import_batch_id: undefined,
    allow_multi_role: false,
    live_link: undefined,
    product_notes: undefined,
    created_at: '2026-08-01T00:00:00Z',
    updated_at: '2026-08-01T00:00:00Z',
    ...overrides,
  }
}

const brands = new Map([['brand-1', 'Mars Wrigley']])
const platforms = new Map([['platform-1', 'TikTok Shop']])
const campaigns = new Map([['campaign-1', 'World Cup 2026']])

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('buildScheduleExportRows — all 23 columns present in deterministic order', () => {
  const shift = makeShift()
  const rows = buildScheduleExportRows([shift], brands, platforms, campaigns)

  assert.equal(rows.length, 1)
  const row = rows[0]
  const keys = Object.keys(row)

  // All expected columns present
  for (const col of SCHEDULE_EXPORT_COLUMN_ORDER) {
    assert.ok(col in row, `Missing column: ${col}`)
  }

  // Deterministic order matches SCHEDULE_EXPORT_COLUMN_ORDER
  assert.deepEqual(keys, [...SCHEDULE_EXPORT_COLUMN_ORDER])
})

test('buildScheduleExportRows — filtered export only includes provided shifts', () => {
  const shift1 = makeShift({ id: 'shift-001', title: 'First' })
  const shift2 = makeShift({ id: 'shift-002', title: 'Second', date: '2026-08-26' })
  const shift3 = makeShift({ id: 'shift-003', title: 'Third', date: '2026-08-27' })

  // Export only shift1 and shift3 (simulating an active filter)
  const rows = buildScheduleExportRows([shift1, shift3], brands, platforms, campaigns)

  assert.equal(rows.length, 2)
  assert.equal(rows[0]['Shift ID'], 'shift-001')
  assert.equal(rows[1]['Shift ID'], 'shift-003')
  // shift2 must not appear
  assert.ok(!rows.some(r => r['Shift ID'] === 'shift-002'))
  void shift2 // suppress unused warning
})

test('buildScheduleExportRows — selected-shift export is a subset', () => {
  const shifts = ['shift-A', 'shift-B', 'shift-C', 'shift-D'].map(
    (id, i) => makeShift({ id, title: `Shift ${id}`, date: `2026-08-${String(25 + i).padStart(2, '0')}` }),
  )
  const selectedIds = new Set(['shift-B', 'shift-D'])
  const selected = shifts.filter(s => selectedIds.has(s.id))
  const rows = buildScheduleExportRows(selected, brands, platforms, campaigns)

  assert.equal(rows.length, 2)
  assert.deepEqual(
    rows.map(r => r['Shift ID']).sort(),
    ['shift-B', 'shift-D'],
  )
})

test('buildScheduleExportRows — Vietnamese names preserved without mutation', () => {
  const shift = makeShift({
    host_names: ['Nguy\u1ec5n Th\u1ecb H\u01b0\u01a1ng'],
    assistant_names: ['An', 'Linh'],
    technical_names: ['Tr\u1ea7n V\u0103n Minh', 'Ph\u00fac'],
  })
  const rows = buildScheduleExportRows([shift], brands, platforms, campaigns)

  assert.equal(rows[0]['Host Names'], 'Nguy\u1ec5n Th\u1ecb H\u01b0\u01a1ng')
  assert.equal(rows[0]['Assistant Names'], 'An, Linh')
  assert.equal(rows[0]['Technical Names'], 'Tr\u1ea7n V\u0103n Minh, Ph\u00fac')
})

test('buildScheduleExportRows — 2026-08-25 date is a string not a number (Excel serial regression)', () => {
  const shift = makeShift({ date: '2026-08-25' })
  const rows = buildScheduleExportRows([shift], brands, platforms, campaigns)

  const dateValue = rows[0]['Date']
  assert.equal(typeof dateValue, 'string', 'Date must be a string, not a number')
  assert.equal(dateValue, '2026-08-25', 'Date string must be preserved exactly')
})

test('buildScheduleExportRows — 14:00 and 16:00 times are strings not fractions (Excel serial regression)', () => {
  const shift = makeShift({ start_time: '14:00', end_time: '16:00' })
  const rows = buildScheduleExportRows([shift], brands, platforms, campaigns)

  const startValue = rows[0]['Start Time']
  const endValue = rows[0]['End Time']
  assert.equal(typeof startValue, 'string', 'Start Time must be a string')
  assert.equal(typeof endValue, 'string', 'End Time must be a string')
  assert.equal(startValue, '14:00')
  assert.equal(endValue, '16:00')
})

test('buildScheduleExportRows — cross-midnight shift has correct End Date', () => {
  const shift = makeShift({ date: '2026-08-25', start_time: '22:00', end_time: '02:00' })
  const rows = buildScheduleExportRows([shift], brands, platforms, campaigns)

  assert.equal(rows[0]['Crosses Midnight'], true)
  assert.equal(rows[0]['End Date'], '2026-08-26')
  assert.equal(rows[0]['Date'], '2026-08-25')
})

test('buildScheduleExportRows — import_batch_id is included when present', () => {
  const shift = makeShift({ import_batch_id: 'batch-abc-123' })
  const rows = buildScheduleExportRows([shift], brands, platforms, campaigns)
  assert.equal(rows[0]['Import Batch ID'], 'batch-abc-123')
})

test('buildScheduleExportRows — import_batch_id is empty string when absent', () => {
  const shift = makeShift({ import_batch_id: undefined })
  const rows = buildScheduleExportRows([shift], brands, platforms, campaigns)
  assert.equal(rows[0]['Import Batch ID'], '')
})

test('buildScheduleExportFilename — selected scope includes shift count and date', () => {
  const shifts = [makeShift(), makeShift({ id: 'shift-002' })]
  const refDate = new Date('2026-08-25')

  const xlsxName = buildScheduleExportFilename('selected', shifts, 'xlsx', refDate)
  const csvName = buildScheduleExportFilename('selected', shifts, 'csv', refDate)

  assert.ok(xlsxName.includes('2026-08-25'), `Expected date in filename: ${xlsxName}`)
  assert.ok(xlsxName.includes('2-shifts'), `Expected count in filename: ${xlsxName}`)
  assert.ok(xlsxName.endsWith('.xlsx'))
  assert.ok(csvName.endsWith('.csv'))
})

test('buildScheduleExportFilename — filtered scope single month', () => {
  const shifts = [
    makeShift({ date: '2026-08-01' }),
    makeShift({ id: 's2', date: '2026-08-25' }),
  ]
  const name = buildScheduleExportFilename('filtered', shifts, 'xlsx', new Date('2026-08-23'))
  assert.ok(name.includes('2026-08'), `Expected month in filename: ${name}`)
  assert.ok(name.includes('filtered'))
  assert.ok(name.endsWith('.xlsx'))
})

test('buildScheduleExportFilename — filtered scope multi-month uses first-to-last', () => {
  const shifts = [
    makeShift({ date: '2026-07-15' }),
    makeShift({ id: 's2', date: '2026-09-10' }),
  ]
  const name = buildScheduleExportFilename('filtered', shifts, 'csv', new Date('2026-08-23'))
  assert.ok(name.includes('2026-07-15'), `Expected first date: ${name}`)
  assert.ok(name.includes('2026-09-10'), `Expected last date: ${name}`)
  assert.ok(name.endsWith('.csv'))
})

test('buildScheduleExportFilename — empty filtered shifts uses current month', () => {
  const name = buildScheduleExportFilename('filtered', [], 'xlsx', new Date('2026-08-23'))
  assert.ok(name.includes('2026-08'), `Expected current month: ${name}`)
  assert.ok(name.includes('filtered'))
})

test('buildScheduleExportRows — empty list returns empty array', () => {
  const rows = buildScheduleExportRows([], brands, platforms, campaigns)
  assert.deepEqual(rows, [])
})

test('buildScheduleExportRows — brand/platform fallback to ID when not in map', () => {
  const shift = makeShift({ brand_id: 'unknown-brand', platform_id: 'unknown-platform' })
  const emptyBrands = new Map<string, string>()
  const emptyPlatforms = new Map<string, string>()
  const rows = buildScheduleExportRows([shift], emptyBrands, emptyPlatforms, campaigns)

  assert.equal(rows[0]['Brand'], 'unknown-brand')
  assert.equal(rows[0]['Platform'], 'unknown-platform')
})

test('buildScheduleExportRows — all required operational fields present', () => {
  const shift = makeShift({
    required_host_count: 2,
    required_support_count: 3,
    required_technical_count: 1,
    status: 'live',
    registration_locked: true,
    live_link: 'https://tiktok.com/live/123',
    product_notes: 'Ghi chu san pham',
  })
  const rows = buildScheduleExportRows([shift], brands, platforms, campaigns)
  const row = rows[0]

  assert.equal(row['Required Host Count'], 2)
  assert.equal(row['Required Support Count'], 3)
  assert.equal(row['Required Technical Count'], 1)
  assert.equal(row['Status'], 'live')
  assert.equal(row['Registration Locked'], true)
  assert.equal(row['Live Link'], 'https://tiktok.com/live/123')
  assert.equal(row['Notes'], 'Ghi chu san pham')
})
