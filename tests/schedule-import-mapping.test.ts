import assert from 'node:assert/strict'
import test from 'node:test'
import * as XLSX from 'xlsx'
import {
  type EntityMaps,
  parseScheduleTabularData,
} from '../lib/utils/excelUtils.ts'

const maps: EntityMaps = {
  brands: new Map([['Mars Wrigley', 'brand-1'], ['Snickers', 'brand-2']]),
  platforms: new Map([['Shopee Live', 'platform-1'], ['TikTok Shop', 'platform-2']]),
  campaigns: new Map([['World Cup', 'campaign-1']]),
}

const englishHeader = [
  'Date',
  'Start time',
  'End time',
  'Brand',
  'Platform',
  'Campaign',
  'Shift name',
  'Studio',
  'Required Host count',
  'Required Support count',
  'Required Technical count',
]

const scheduleRow = [
  '2026-09-01',
  '09:00',
  '13:00',
  'Mars Wrigley',
  'Shopee Live',
  'World Cup',
  'Morning shift',
  'Studio A',
  1,
  1,
  1,
]

const csvRow = (values: unknown[]) => values.map(value => `"${String(value ?? '').replaceAll('"', '""')}"`).join(',')
const withColumn = (row: unknown[], index: number, value: unknown) => row.map((cell, i) => (i === index ? value : cell))

test('schedule import detects a normal row-one header', () => {
  const result = parseScheduleTabularData(
    `${csvRow(englishHeader)}\n${csvRow(scheduleRow)}`,
    'string',
    maps,
  )

  assert.equal(result.validRows, 1)
  assert.equal(result.invalidRows, 0)
  assert.equal(result.validShifts[0].title, 'Morning shift')
  assert.equal(result.validShifts[0].brand_id, 'brand-1')
  assert.deepEqual(result.validShifts[0].host_names, [])
  assert.deepEqual(result.validShifts[0].assistant_names, [])
  assert.deepEqual(result.validShifts[0].technical_names, [])
})

test('Google Sheets staffing display aliases normalize names without resolving users', () => {
  const headers = [...englishHeader, 'Host', 'Assistant', 'Tech']
  const row = [...scheduleRow, '  Hương  ', 'An, Linh; An', ' Minh ; Phúc ']
  const result = parseScheduleTabularData(
    [headers, row].map(csvRow).join('\n'),
    'string',
    maps,
  )

  assert.equal(result.validRows, 1)
  assert.deepEqual(result.rows[0].row.host_names, ['Hương'])
  assert.deepEqual(result.rows[0].row.assistant_names, ['An', 'Linh'])
  assert.deepEqual(result.rows[0].row.technical_names, ['Minh', 'Phúc'])
  assert.deepEqual(result.validShifts[0].host_names, ['Hương'])
  assert.deepEqual(result.validShifts[0].assistant_names, ['An', 'Linh'])
  assert.deepEqual(result.validShifts[0].technical_names, ['Minh', 'Phúc'])
})

test('Excel staffing display aliases preserve Vietnamese spelling and newlines', () => {
  const workbook = XLSX.utils.book_new()
  const headers = [...englishHeader, 'Tên Host', 'Trợ live', 'Kỹ thuật']
  const row = [...scheduleRow, 'Nguyễn Thị Hương', 'An\nLinh', 'Minh; Tuấn']
  const worksheet = XLSX.utils.aoa_to_sheet([headers, row])
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Schedule')
  const bytes = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
  const result = parseScheduleTabularData(bytes, 'array', maps)

  assert.equal(result.validRows, 1)
  assert.deepEqual(result.rows[0].row.host_names, ['Nguyễn Thị Hương'])
  assert.deepEqual(result.rows[0].row.assistant_names, ['An', 'Linh'])
  assert.deepEqual(result.rows[0].row.technical_names, ['Minh', 'Tuấn'])
})

test('Excel import detects the real header after title and blank rows', () => {
  const workbook = XLSX.utils.book_new()
  const worksheet = XLSX.utils.aoa_to_sheet([
    ['MARS WRIGLEY LIVESTREAM SCHEDULE'],
    [],
    ['Prepared for operations'],
    englishHeader,
    scheduleRow,
  ])
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Schedule')
  const bytes = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
  const result = parseScheduleTabularData(bytes, 'array', maps)

  assert.equal(result.validRows, 1)
  assert.equal(result.rows[0].row.row_number, 5)
  assert.equal(result.validShifts[0].platform_id, 'platform-1')
  assert.equal(result.validShifts[0].studio, 'Studio A')
})

test('Vietnamese headers and Khung giờ map to the canonical schedule fields', () => {
  const csv = [
    ['Ngày', 'Khung giờ', 'Thương hiệu', 'Nền tảng', 'Chiến dịch', 'Tên ca', 'Studio', 'Số host bắt buộc', 'Số support bắt buộc', 'Số technical bắt buộc'],
    ['02/09/2026', '19:30 - 23:30', 'Mars Wrigley', 'TikTok Shop', 'World Cup', 'Ca tối', 'Studio B', 2, 1, 1],
  ].map(csvRow).join('\n')
  const result = parseScheduleTabularData(csv, 'string', maps)

  assert.equal(result.validRows, 1)
  assert.equal(result.validShifts[0].date, '2026-09-02')
  assert.equal(result.validShifts[0].start_time, '19:30')
  assert.equal(result.validShifts[0].end_time, '23:30')
  assert.equal(result.validShifts[0].title, 'Ca tối')
  assert.equal(result.validShifts[0].required_host_count, 2)
})

test('Google Sheets-shaped CSV detects a later BOM-prefixed header', () => {
  const csv = [
    '\uFEFFLỊCH LIVESTREAM THÁNG 9',
    '',
    csvRow(englishHeader),
    csvRow(scheduleRow),
  ].join('\n')
  const result = parseScheduleTabularData(csv, 'string', maps)

  assert.equal(result.validRows, 1)
  assert.equal(result.rows[0].row.row_number, 4)
  assert.equal(result.validShifts[0].campaign_id, 'campaign-1')
})

test('explicit zero staffing is preserved while blank staffing defaults to one', () => {
  const zeroRow = [...scheduleRow]
  zeroRow[6] = 'Zero staffing'
  zeroRow[8] = 0
  zeroRow[9] = '0'
  zeroRow[10] = 0
  const blankRow = [...scheduleRow]
  blankRow[6] = 'Blank staffing'
  blankRow[7] = 'Studio B'
  blankRow[8] = ''
  blankRow[9] = '   '
  blankRow[10] = null
  const csv = [englishHeader, zeroRow, blankRow].map(csvRow).join('\n')
  const result = parseScheduleTabularData(csv, 'string', maps)

  assert.equal(result.validRows, 2)
  assert.deepEqual(
    [
      result.validShifts[0].required_host_count,
      result.validShifts[0].required_support_count,
      result.validShifts[0].required_technical_count,
    ],
    [0, 0, 0],
  )
  assert.deepEqual(
    [
      result.validShifts[1].required_host_count,
      result.validShifts[1].required_support_count,
      result.validShifts[1].required_technical_count,
    ],
    [1, 1, 1],
  )
})

test('an insufficient header returns one clear header error instead of row errors', () => {
  const result = parseScheduleTabularData(
    'Platform,Random column\nShopee Live,Something\nTikTok Shop,Something else',
    'string',
    maps,
  )

  assert.equal(result.success, false)
  assert.equal(result.rows.length, 0)
  assert.equal(result.errors.length, 1)
  assert.equal(result.errors[0].field, 'header')
  assert.match(result.errors[0].message, /Date\/Ngày/)
})

test('MM/DD/YYYY order is inferred from unambiguous Google Sheets dates', () => {
  const rows = [
    ['8/29/2026', 'US date 29'],
    ['8/30/2026', 'US date 30'],
    ['8/31/2026', 'US date 31'],
  ].map(([date, title]) => {
    const row = [...scheduleRow]
    row[0] = date
    row[6] = title
    return row
  })
  const result = parseScheduleTabularData([englishHeader, ...rows].map(csvRow).join('\n'), 'string', maps)

  assert.equal(result.validRows, 3)
  assert.deepEqual(result.validShifts.map(shift => shift.date), [
    '2026-08-29',
    '2026-08-30',
    '2026-08-31',
  ])
})

test('an unambiguous date applies one inferred order to ambiguous dates', () => {
  const dayFirstRows = [
    ['31/08/2026', 'Day-first evidence'],
    ['09/08/2026', 'Ambiguous day-first'],
  ].map(([date, title]) => {
    const row = [...scheduleRow]
    row[0] = date
    row[6] = title
    return row
  })
  const monthFirstRows = [
    ['8/29/2026', 'Month-first evidence'],
    ['9/8/2026', 'Ambiguous month-first'],
  ].map(([date, title]) => {
    const row = [...scheduleRow]
    row[0] = date
    row[6] = title
    return row
  })

  const dayFirst = parseScheduleTabularData([englishHeader, ...dayFirstRows].map(csvRow).join('\n'), 'string', maps)
  const monthFirst = parseScheduleTabularData([englishHeader, ...monthFirstRows].map(csvRow).join('\n'), 'string', maps)

  assert.deepEqual(dayFirst.validShifts.map(shift => shift.date), ['2026-08-31', '2026-08-09'])
  assert.deepEqual(monthFirst.validShifts.map(shift => shift.date), ['2026-08-29', '2026-09-08'])
})

test('contradictory slash-date evidence returns one clear import error', () => {
  const rows = [
    ['31/08/2026', 'Day-first row'],
    ['8/29/2026', 'Month-first row'],
  ].map(([date, title]) => {
    const row = [...scheduleRow]
    row[0] = date
    row[6] = title
    return row
  })
  const result = parseScheduleTabularData([englishHeader, ...rows].map(csvRow).join('\n'), 'string', maps)

  assert.equal(result.success, false)
  assert.equal(result.rows.length, 0)
  assert.equal(result.errors.length, 1)
  assert.equal(result.errors[0].field, 'date_format')
  assert.match(result.errors[0].message, /Conflicting slash date formats/)
})

test('an impossible date is rejected using the inferred order', () => {
  const invalidRow = [...scheduleRow]
  invalidRow[0] = '2/30/2026'
  const result = parseScheduleTabularData([englishHeader, invalidRow].map(csvRow).join('\n'), 'string', maps)

  assert.equal(result.validRows, 0)
  assert.equal(result.invalidRows, 1)
  assert.match(result.rows[0].row.errors.join(' '), /invalid using the inferred MM\/DD\/YYYY order/)
})

test('typed Excel date cells continue to import as calendar dates', () => {
  const workbook = XLSX.utils.book_new()
  const excelRow = [...scheduleRow]
  excelRow[0] = new Date(2026, 7, 31)
  const worksheet = XLSX.utils.aoa_to_sheet([englishHeader, excelRow])
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Schedule')
  const bytes = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
  const result = parseScheduleTabularData(bytes, 'array', maps)

  assert.equal(result.validRows, 1)
  assert.equal(result.validShifts[0].date, '2026-08-31')
})

test('master lookup resolves dirty Brand/Platform values while a genuinely missing value still errors', () => {
  const brandVariants = [
    ['Exact name', 'Mars Wrigley'],
    ['Leading and trailing spaces', '  Mars Wrigley  '],
    ['Repeated spaces', 'Mars   Wrigley'],
    ['Mixed case', 'MaRs WrIgLeY'],
    ['Zero-width character', 'Mars\u200BWrigley'],
    ['BOM inside value', 'Mars Wrig\uFEFFley'],
  ]
  const rows = brandVariants.map(([title, brand], index) => {
    const row = [...scheduleRow]
    row[6] = title
    row[3] = brand
    row[1] = `09:0${index}`
    row[2] = `10:0${index}`
    return row
  })
  const missingRow = [...scheduleRow]
  missingRow[6] = 'Genuinely missing brand'
  missingRow[3] = 'No Such Brand Anywhere'
  missingRow[1] = '20:00'
  missingRow[2] = '21:00'

  const result = parseScheduleTabularData(
    [englishHeader, ...rows, missingRow].map(csvRow).join('\n'),
    'string',
    maps,
  )

  assert.equal(result.validRows, brandVariants.length)
  assert.equal(result.invalidRows, 1)
  const resolvedShifts = result.validShifts.filter(shift => shift.brand_id === 'brand-1')
  assert.equal(resolvedShifts.length, brandVariants.length)
  assert.deepEqual(
    resolvedShifts.map(shift => shift.platform_id),
    brandVariants.map(() => 'platform-1'),
  )
  const missingPreview = result.rows.find(preview => preview.row.brand_name === 'No Such Brand Anywhere')
  assert.ok(missingPreview)
  assert.match(missingPreview.row.errors.join(' '), /Brand "No Such Brand Anywhere" was not found/)
})

test('an imported brand in a successfully loaded but empty master map is still a not-found error', () => {
  const emptyMaps: EntityMaps = {
    brands: new Map(),
    platforms: new Map(),
    campaigns: new Map(),
  }
  const result = parseScheduleTabularData(
    `${csvRow(englishHeader)}\n${csvRow(scheduleRow)}`,
    'string',
    emptyMaps,
  )

  assert.equal(result.validRows, 0)
  assert.match(result.rows[0].row.errors.join(' '), /Brand "Mars Wrigley" was not found/)
})

test('duplicate semantics: same time different brand is valid', () => {
  const rows = [
    withColumn(scheduleRow, 3, 'Mars Wrigley'),
    withColumn(scheduleRow, 3, 'Snickers'),
  ]
  const result = parseScheduleTabularData([englishHeader, ...rows].map(csvRow).join('\n'), 'string', maps)
  assert.equal(result.validRows, 2)
  assert.equal(result.warnings.length, 0)
})

test('duplicate semantics: same time/brand different studio is valid', () => {
  const rows = [
    withColumn(scheduleRow, 7, 'Studio A'),
    withColumn(scheduleRow, 7, 'Studio B'),
  ]
  const result = parseScheduleTabularData([englishHeader, ...rows].map(csvRow).join('\n'), 'string', maps)
  assert.equal(result.validRows, 2)
  assert.equal(result.warnings.length, 0)
})

test('duplicate semantics: true exact duplicate is warned', () => {
  const result = parseScheduleTabularData(
    [englishHeader, scheduleRow, scheduleRow].map(csvRow).join('\n'),
    'string',
    maps,
  )
  assert.equal(result.validRows, 2)
  assert.equal(result.validShifts.length, 1)
  assert.ok(result.warnings.some(warning => /already exists/.test(warning.message)))
})

test('duplicate semantics: existing matching DB shift is warned', () => {
  const existing = parseScheduleTabularData([englishHeader, scheduleRow].map(csvRow).join('\n'), 'string', maps)
  const result = parseScheduleTabularData(
    [englishHeader, scheduleRow].map(csvRow).join('\n'),
    'string',
    maps,
    existing.validShifts,
  )
  assert.equal(result.validRows, 1)
  assert.equal(result.validShifts.length, 0)
  assert.ok(result.warnings.some(warning => /already exists/.test(warning.message)))
})

test('duplicate semantics: whitespace variation in studio is treated as duplicate', () => {
  const rows = [
    withColumn(scheduleRow, 7, 'Studio A'),
    withColumn(scheduleRow, 7, '  studio   a  '),
  ]
  const result = parseScheduleTabularData([englishHeader, ...rows].map(csvRow).join('\n'), 'string', maps)
  assert.equal(result.validRows, 2)
  assert.equal(result.validShifts.length, 1)
  assert.ok(result.warnings.some(warning => /already exists/.test(warning.message)))
})

test('duplicate semantics: same time/brand/studio different campaign is valid', () => {
  const rows = [
    withColumn(scheduleRow, 5, 'World Cup'),
    withColumn(scheduleRow, 5, 'Summer Sale'),
  ]
  const withExtraCampaign = { ...maps, campaigns: new Map([['World Cup', 'campaign-1'], ['Summer Sale', 'campaign-2']]) }
  const result = parseScheduleTabularData([englishHeader, ...rows].map(csvRow).join('\n'), 'string', withExtraCampaign)
  assert.equal(result.validRows, 2)
  assert.equal(result.warnings.length, 0)
})

// Excel 1900-system serials: how Excel stores real date/time cells (number + number format).
const EXCEL_DATE_2026_08_25 = 46259 // => 2026-08-25 (verified via XLSX.SSF.parse_date_code)
const EXCEL_TIME_14_00 = 14 / 24
const EXCEL_TIME_16_00 = 16 / 24

test('S4-UAT-01: Excel numeric time cells import as HH:MM instead of a JS Date string', () => {
  const row = [...scheduleRow]
  row[0] = '2026-08-25'
  const workbook = XLSX.utils.book_new()
  const worksheet = XLSX.utils.aoa_to_sheet([englishHeader, row])
  worksheet['B2'] = { t: 'n', v: EXCEL_TIME_14_00, z: 'h:mm' }
  worksheet['C2'] = { t: 'n', v: EXCEL_TIME_16_00, z: 'h:mm' }
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Schedule')
  const bytes = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
  const result = parseScheduleTabularData(bytes, 'array', maps)

  assert.equal(result.validRows, 1, `expected 1 valid row, errors: ${JSON.stringify(result.errors)}`)
  assert.equal(result.validShifts[0].start_time, '14:00')
  assert.equal(result.validShifts[0].end_time, '16:00')
})

test('S4-UAT-02: Excel numeric date cell imports as the correct calendar date (no off-by-one)', () => {
  const workbook = XLSX.utils.book_new()
  const worksheet = XLSX.utils.aoa_to_sheet([englishHeader, scheduleRow])
  worksheet['A2'] = { t: 'n', v: EXCEL_DATE_2026_08_25, z: 'yyyy-mm-dd' }
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Schedule')
  const bytes = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
  const result = parseScheduleTabularData(bytes, 'array', maps)

  assert.equal(result.validRows, 1, `expected 1 valid row, errors: ${JSON.stringify(result.errors)}`)
  assert.equal(result.validShifts[0].date, '2026-08-25')
})

test('S4 regression: realistic Excel date+time row round-trips to exact wall-clock strings', () => {
  const workbook = XLSX.utils.book_new()
  const worksheet = XLSX.utils.aoa_to_sheet([englishHeader, scheduleRow])
  worksheet['A2'] = { t: 'n', v: EXCEL_DATE_2026_08_25, z: 'yyyy-mm-dd' }
  worksheet['B2'] = { t: 'n', v: EXCEL_TIME_14_00, z: 'h:mm' }
  worksheet['C2'] = { t: 'n', v: EXCEL_TIME_16_00, z: 'h:mm' }
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Schedule')
  const bytes = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
  const result = parseScheduleTabularData(bytes, 'array', maps)

  assert.equal(result.errors.length, 0, `expected 0 errors, got: ${JSON.stringify(result.errors)}`)
  assert.equal(result.validShifts.length, 1)
  assert.equal(result.validShifts[0].date, '2026-08-25')
  assert.equal(result.validShifts[0].start_time, '14:00')
  assert.equal(result.validShifts[0].end_time, '16:00')
})
