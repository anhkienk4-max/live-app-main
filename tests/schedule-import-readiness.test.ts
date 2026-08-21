import assert from 'node:assert/strict'
import test from 'node:test'
import {
  importGate,
  parseWhenMastersReady,
} from '../lib/utils/scheduleImportReadiness.ts'
import {
  type EntityMaps,
  parseScheduleTabularData,
} from '../lib/utils/excelUtils.ts'

const maps: EntityMaps = {
  brands: new Map([['Mars Wrigley', 'brand-1'], ['Snickers', 'brand-2']]),
  platforms: new Map([['Shopee Live', 'platform-1'], ['TikTok Shop', 'platform-2']]),
  campaigns: new Map([['World Cup', 'campaign-1']]),
}

const emptyMaps: EntityMaps = {
  brands: new Map(),
  platforms: new Map(),
  campaigns: new Map(),
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

test('loading masters: gate blocks before parse, so no premature not-found result is produced', () => {
  const gate = importGate('loading')
  assert.equal(gate.allowed, false)
  assert.match(gate.message ?? '', /loading/i)

  let parsed = false
  const outcome = parseWhenMastersReady('loading', () => {
    parsed = true
    return parseScheduleTabularData(`${csvRow(englishHeader)}\n${csvRow(scheduleRow)}`, 'string', maps)
  })
  assert.equal(outcome, null)
  assert.equal(parsed, false)
})

test('successful non-empty masters: normal validation applies', () => {
  const gate = importGate('ready')
  assert.equal(gate.allowed, true)
  assert.equal(gate.message, null)

  const result = parseWhenMastersReady('ready', () =>
    parseScheduleTabularData(`${csvRow(englishHeader)}\n${csvRow(scheduleRow)}`, 'string', maps))
  assert.ok(result)
  assert.equal(result.validRows, 1)
  assert.equal(result.validShifts[0].brand_id, 'brand-1')
})

test('successful but empty masters: an imported unknown Brand is still an error', () => {
  const result = parseWhenMastersReady('ready', () =>
    parseScheduleTabularData(
      `${csvRow(englishHeader)}\n${csvRow(withColumn(scheduleRow, 3, 'No Such Brand'))}`,
      'string',
      emptyMaps,
    ))
  assert.ok(result)
  assert.equal(result.validRows, 0)
  assert.match(result.rows[0].row.errors.join(' '), /Brand "No Such Brand" was not found/)
})

test('failed master load: import is blocked and an explicit loading error is exposed', () => {
  const gate = importGate('error')
  assert.equal(gate.allowed, false)
  assert.match(gate.message ?? '', /failed to load/i)

  let parsed = false
  const outcome = parseWhenMastersReady('error', () => {
    parsed = true
    return parseScheduleTabularData(`${csvRow(englishHeader)}\n${csvRow(scheduleRow)}`, 'string', maps)
  })
  assert.equal(outcome, null)
  assert.equal(parsed, false)
})

test('an existing normalized legitimate Brand still resolves once masters are ready', () => {
  const result = parseWhenMastersReady('ready', () =>
    parseScheduleTabularData(
      `${csvRow(englishHeader)}\n${csvRow(withColumn(scheduleRow, 3, 'Mars\u200BWrigley'))}`,
      'string',
      maps,
    ))
  assert.ok(result)
  assert.equal(result.validRows, 1)
  assert.equal(result.validShifts[0].brand_id, 'brand-1')
})