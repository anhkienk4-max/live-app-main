/**
 * S4D Schedule Export — Focused tests
 *
 * Covers:
 *   - all 26 columns present in deterministic order
 *   - actual assigned Host/Support/Technical exported from ShiftRegistrations
 *   - scheduled labels exported separately under Scheduled * Names
 *   - actual assignment + scheduled label can coexist without overwriting
 *   - no actual assignment -> Assigned columns blank
 *   - filtered and selected export paths use corrected staffing data
 *   - Vietnamese names preserved exactly in both assigned and scheduled
 *   - 2026-08-25 date regression (string, not Excel serial)
 *   - 14:00-16:00 time regression (string, not fraction)
 *   - cross-midnight End Date calculation
 *   - import_batch_id present vs absent
 *   - buildScheduleExportFilename — scope naming
 */
import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import * as XLSX from 'xlsx'
import {
  buildScheduleExportRows,
  buildScheduleExportFilename,
  SCHEDULE_EXPORT_COLUMN_ORDER,
  downloadScheduleExportXlsx,
  usersToNameMap,
} from '../lib/utils/scheduleExportUtils.ts'
import type { Shift, ShiftRegistration, User } from '../lib/types/database.types.ts'

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
    host_names: [],
    assistant_names: [],
    technical_names: [],
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

function makeRegistration(overrides: Partial<ShiftRegistration> = {}): ShiftRegistration {
  return {
    id: 'reg-001',
    shift_id: 'shift-001',
    user_id: 'user-1',
    operational_role: 'host',
    status: 'approved',
    source: 'self_registration',
    requested_at: '2026-08-01T00:00:00Z',
    created_at: '2026-08-01T00:00:00Z',
    updated_at: '2026-08-01T00:00:00Z',
    ...overrides,
  }
}

const brands = new Map([['brand-1', 'Mars Wrigley']])
const platforms = new Map([['platform-1', 'TikTok Shop']])
const campaigns = new Map([['campaign-1', 'World Cup 2026']])
const users: User[] = [
  {
    id: 'user-host-1',
    email: 'huong@example.com',
    full_name: 'Nguyễn Thị Hương',
    role: 'staff',
    status: 'active',
    join_date: '2026-01-01',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'user-support-1',
    email: 'an@example.com',
    full_name: 'Lê Văn An',
    role: 'staff',
    status: 'active',
    join_date: '2026-01-01',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'user-tech-1',
    email: 'minh@example.com',
    full_name: 'Trần Văn Minh',
    role: 'staff',
    status: 'active',
    join_date: '2026-01-01',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
]
const usersMap = usersToNameMap(users)

test('downloadScheduleExportXlsx round-trips core date/time data', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'f6-xlsx-'))
  const filename = join(directory, 'schedule.xlsx')
  try {
    const rows = buildScheduleExportRows([makeShift()], brands, platforms, campaigns, usersMap, [])
    downloadScheduleExportXlsx(rows, filename)
    const workbook = XLSX.read(await readFile(filename), { type: 'buffer', cellDates: false })
    const [roundTripped] = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets.Schedule, { defval: '' })
    assert.equal(roundTripped?.Date, '2026-08-25')
    assert.equal(roundTripped?.['Start Time'], '14:00')
    assert.equal(roundTripped?.['End Time'], '16:00')
    assert.equal(roundTripped?.Brand, 'Mars Wrigley')
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test('buildScheduleExportRows — all 26 columns present in deterministic order', () => {
  const shift = makeShift()
  const rows = buildScheduleExportRows([shift], brands, platforms, campaigns, usersMap, [])

  assert.equal(rows.length, 1)
  const row = rows[0]
  const keys = Object.keys(row)

  // All expected columns present
  for (const col of SCHEDULE_EXPORT_COLUMN_ORDER) {
    assert.ok(col in row, `Missing column: ${col}`)
  }

  // Deterministic order matches SCHEDULE_EXPORT_COLUMN_ORDER exactly
  assert.deepEqual(keys, [...SCHEDULE_EXPORT_COLUMN_ORDER])
})

test('buildScheduleExportRows — actual assigned Host/Support/Technical exported from ShiftRegistrations', () => {
  const shift = makeShift({ id: 'shift-assigned' })
  const registrations: ShiftRegistration[] = [
    makeRegistration({ shift_id: 'shift-assigned', user_id: 'user-host-1', operational_role: 'host', status: 'approved' }),
    makeRegistration({ id: 'r2', shift_id: 'shift-assigned', user_id: 'user-support-1', operational_role: 'support', status: 'manually_assigned' }),
    makeRegistration({ id: 'r3', shift_id: 'shift-assigned', user_id: 'user-tech-1', operational_role: 'technical', status: 'approved' }),
  ]

  const rows = buildScheduleExportRows([shift], brands, platforms, campaigns, usersMap, registrations)

  assert.equal(rows.length, 1)
  assert.equal(rows[0]['Assigned Host Names'], 'Nguyễn Thị Hương')
  assert.equal(rows[0]['Assigned Support Names'], 'Lê Văn An')
  assert.equal(rows[0]['Assigned Technical Names'], 'Trần Văn Minh')
  assert.equal(rows[0]['Scheduled Host Names'], '')
  assert.equal(rows[0]['Scheduled Support Names'], '')
  assert.equal(rows[0]['Scheduled Technical Names'], '')
})

test('buildScheduleExportRows — scheduled labels exported separately under Scheduled * Names', () => {
  const shift = makeShift({
    host_names: ['MC Mai'],
    assistant_names: ['Trợ lý Phúc'],
    technical_names: ['Kỹ thuật Hùng'],
  })

  const rows = buildScheduleExportRows([shift], brands, platforms, campaigns, usersMap, [])

  assert.equal(rows[0]['Scheduled Host Names'], 'MC Mai')
  assert.equal(rows[0]['Scheduled Support Names'], 'Trợ lý Phúc')
  assert.equal(rows[0]['Scheduled Technical Names'], 'Kỹ thuật Hùng')
  assert.equal(rows[0]['Assigned Host Names'], '')
  assert.equal(rows[0]['Assigned Support Names'], '')
  assert.equal(rows[0]['Assigned Technical Names'], '')
})

test('buildScheduleExportRows — actual assignment + scheduled label coexist without overwriting', () => {
  const shift = makeShift({
    id: 'shift-coexist',
    host_names: ['Scheduled MC Thu'],
    assistant_names: ['Scheduled Assistant'],
    technical_names: ['Scheduled Tech'],
  })
  const registrations: ShiftRegistration[] = [
    makeRegistration({ shift_id: 'shift-coexist', user_id: 'user-host-1', operational_role: 'host', status: 'approved' }),
  ]

  const rows = buildScheduleExportRows([shift], brands, platforms, campaigns, usersMap, registrations)

  assert.equal(rows[0]['Assigned Host Names'], 'Nguyễn Thị Hương')
  assert.equal(rows[0]['Scheduled Host Names'], 'Scheduled MC Thu')
  assert.equal(rows[0]['Scheduled Support Names'], 'Scheduled Assistant')
  assert.equal(rows[0]['Scheduled Technical Names'], 'Scheduled Tech')
  assert.equal(rows[0]['Assigned Support Names'], '')
  assert.equal(rows[0]['Assigned Technical Names'], '')
})

test('buildScheduleExportRows — non-staffed registrations (pending/rejected/cancelled) are omitted from Assigned', () => {
  const shift = makeShift({ id: 'shift-unstaffed' })
  const registrations: ShiftRegistration[] = [
    makeRegistration({ shift_id: 'shift-unstaffed', user_id: 'user-host-1', operational_role: 'host', status: 'pending' }),
    makeRegistration({ id: 'r2', shift_id: 'shift-unstaffed', user_id: 'user-support-1', operational_role: 'support', status: 'rejected' }),
    makeRegistration({ id: 'r3', shift_id: 'shift-unstaffed', user_id: 'user-tech-1', operational_role: 'technical', status: 'cancelled' }),
  ]

  const rows = buildScheduleExportRows([shift], brands, platforms, campaigns, usersMap, registrations)

  assert.equal(rows[0]['Assigned Host Names'], '')
  assert.equal(rows[0]['Assigned Support Names'], '')
  assert.equal(rows[0]['Assigned Technical Names'], '')
})

test('buildScheduleExportRows — legacy fallback host_id/support_id/technical_id used when present', () => {
  const shift = makeShift({
    host_id: 'user-host-1',
    support_id: 'user-support-1',
    technical_id: 'user-tech-1',
  })

  const rows = buildScheduleExportRows([shift], brands, platforms, campaigns, usersMap, [])

  assert.equal(rows[0]['Assigned Host Names'], 'Nguyễn Thị Hương')
  assert.equal(rows[0]['Assigned Support Names'], 'Lê Văn An')
  assert.equal(rows[0]['Assigned Technical Names'], 'Trần Văn Minh')
})

test('buildScheduleExportRows — filtered export only includes provided shifts with correct staffing', () => {
  const shift1 = makeShift({ id: 'shift-001', title: 'First' })
  const shift2 = makeShift({ id: 'shift-002', title: 'Second', date: '2026-08-26' })
  const shift3 = makeShift({ id: 'shift-003', title: 'Third', date: '2026-08-27' })

  const registrations: ShiftRegistration[] = [
    makeRegistration({ shift_id: 'shift-001', user_id: 'user-host-1', operational_role: 'host', status: 'approved' }),
    makeRegistration({ id: 'r2', shift_id: 'shift-003', user_id: 'user-support-1', operational_role: 'support', status: 'approved' }),
  ]

  const rows = buildScheduleExportRows([shift1, shift3], brands, platforms, campaigns, usersMap, registrations)

  assert.equal(rows.length, 2)
  assert.equal(rows[0]['Shift ID'], 'shift-001')
  assert.equal(rows[0]['Assigned Host Names'], 'Nguyễn Thị Hương')
  assert.equal(rows[1]['Shift ID'], 'shift-003')
  assert.equal(rows[1]['Assigned Support Names'], 'Lê Văn An')
  assert.ok(!rows.some(r => r['Shift ID'] === 'shift-002'))
  void shift2
})

test('buildScheduleExportRows — selected-shift export is a subset with correct staffing', () => {
  const shifts = ['shift-A', 'shift-B', 'shift-C', 'shift-D'].map(
    (id, i) => makeShift({ id, title: `Shift ${id}`, date: `2026-08-${String(25 + i).padStart(2, '0')}` }),
  )
  const registrations: ShiftRegistration[] = [
    makeRegistration({ shift_id: 'shift-B', user_id: 'user-host-1', operational_role: 'host', status: 'approved' }),
    makeRegistration({ id: 'r2', shift_id: 'shift-D', user_id: 'user-tech-1', operational_role: 'technical', status: 'approved' }),
  ]

  const selectedIds = new Set(['shift-B', 'shift-D'])
  const selected = shifts.filter(s => selectedIds.has(s.id))
  const rows = buildScheduleExportRows(selected, brands, platforms, campaigns, usersMap, registrations)

  assert.equal(rows.length, 2)
  assert.deepEqual(
    rows.map(r => r['Shift ID']).sort(),
    ['shift-B', 'shift-D'],
  )
  const rowB = rows.find(r => r['Shift ID'] === 'shift-B')!
  const rowD = rows.find(r => r['Shift ID'] === 'shift-D')!
  assert.equal(rowB['Assigned Host Names'], 'Nguyễn Thị Hương')
  assert.equal(rowD['Assigned Technical Names'], 'Trần Văn Minh')
})

test('buildScheduleExportRows — Vietnamese names preserved without mutation', () => {
  const shift = makeShift({
    host_names: ['Nguy\u1ec5n Th\u1ecb H\u01b0\u01a1ng'],
    assistant_names: ['An', 'Linh'],
    technical_names: ['Tr\u1ea7n V\u0103n Minh', 'Ph\u00fac'],
  })
  const rows = buildScheduleExportRows([shift], brands, platforms, campaigns, usersMap, [])

  assert.equal(rows[0]['Scheduled Host Names'], 'Nguy\u1ec5n Th\u1ecb H\u01b0\u01a1ng')
  assert.equal(rows[0]['Scheduled Support Names'], 'An, Linh')
  assert.equal(rows[0]['Scheduled Technical Names'], 'Tr\u1ea7n V\u0103n Minh, Ph\u00fac')
})

test('buildScheduleExportRows — 2026-08-25 date is a string not a number (Excel serial regression)', () => {
  const shift = makeShift({ date: '2026-08-25' })
  const rows = buildScheduleExportRows([shift], brands, platforms, campaigns, usersMap, [])

  const dateValue = rows[0]['Date']
  assert.equal(typeof dateValue, 'string', 'Date must be a string, not a number')
  assert.equal(dateValue, '2026-08-25', 'Date string must be preserved exactly')
})

test('buildScheduleExportRows — 14:00 and 16:00 times are strings not fractions (Excel serial regression)', () => {
  const shift = makeShift({ start_time: '14:00', end_time: '16:00' })
  const rows = buildScheduleExportRows([shift], brands, platforms, campaigns, usersMap, [])

  const startValue = rows[0]['Start Time']
  const endValue = rows[0]['End Time']
  assert.equal(typeof startValue, 'string', 'Start Time must be a string')
  assert.equal(typeof endValue, 'string', 'End Time must be a string')
  assert.equal(startValue, '14:00')
  assert.equal(endValue, '16:00')
})

test('buildScheduleExportRows — cross-midnight shift has correct End Date', () => {
  const shift = makeShift({ date: '2026-08-25', start_time: '22:00', end_time: '02:00' })
  const rows = buildScheduleExportRows([shift], brands, platforms, campaigns, usersMap, [])

  assert.equal(rows[0]['Crosses Midnight'], true)
  assert.equal(rows[0]['End Date'], '2026-08-26')
  assert.equal(rows[0]['Date'], '2026-08-25')
})

test('buildScheduleExportRows — import_batch_id is included when present', () => {
  const shift = makeShift({ import_batch_id: 'batch-abc-123' })
  const rows = buildScheduleExportRows([shift], brands, platforms, campaigns, usersMap, [])
  assert.equal(rows[0]['Import Batch ID'], 'batch-abc-123')
})

test('buildScheduleExportRows — import_batch_id is empty string when absent', () => {
  const shift = makeShift({ import_batch_id: undefined })
  const rows = buildScheduleExportRows([shift], brands, platforms, campaigns, usersMap, [])
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
  const rows = buildScheduleExportRows([], brands, platforms, campaigns, usersMap, [])
  assert.deepEqual(rows, [])
})

test('buildScheduleExportRows — brand/platform fallback to ID when not in map', () => {
  const shift = makeShift({ brand_id: 'unknown-brand', platform_id: 'unknown-platform' })
  const emptyBrands = new Map<string, string>()
  const emptyPlatforms = new Map<string, string>()
  const rows = buildScheduleExportRows([shift], emptyBrands, emptyPlatforms, campaigns, usersMap, [])

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
  const rows = buildScheduleExportRows([shift], brands, platforms, campaigns, usersMap, [])
  const row = rows[0]

  assert.equal(row['Required Host Count'], 2)
  assert.equal(row['Required Support Count'], 3)
  assert.equal(row['Required Technical Count'], 1)
  assert.equal(row['Status'], 'live')
  assert.equal(row['Registration Locked'], true)
  assert.equal(row['Live Link'], 'https://tiktok.com/live/123')
  assert.equal(row['Notes'], 'Ghi chu san pham')
})
