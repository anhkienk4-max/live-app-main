import assert from 'node:assert/strict'
import test from 'node:test'
import fs from 'node:fs'
import { PGlite } from '@electric-sql/pglite'

import type { Shift } from '../lib/types/database.types'
import {
  type EntityMaps,
  parseScheduleRows,
} from '../lib/utils/excelUtils'
import {
  buildScheduleImportPreviewSourceRow,
  normalizeScheduleImportResult,
} from '../lib/utils/scheduleImportPreview'
import { processScheduleImportRows } from '../lib/utils/scheduleImportRecovery'
import {
  buildScheduleExportRows,
  SCHEDULE_EXPORT_COLUMN_ORDER,
} from '../lib/utils/scheduleExportUtils'

const baseMaps: EntityMaps = {
  brands: new Map([
    ['Brand A', 'brand-a'],
    ['Brand B', 'brand-b'],
  ]),
  platforms: new Map([
    ['Shopee Live', 'plat-shopee'],
    ['TikTok Shop', 'plat-tiktok'],
  ]),
  campaigns: new Map([
    ['Summer Sale', 'camp-summer'],
  ]),
}

function mockPendingBatchRows(batchId: string, previews: any[]) {
  return previews.map(preview => ({
    id: `${batchId}:${preview.row.row_number}`,
    batch_id: batchId,
    source_row_number: preview.row.row_number,
    original_values: buildScheduleImportPreviewSourceRow(preview.row),
    normalized_values: preview.row,
    status: 'pending' as const,
    validation_issues: [...preview.row.errors],
    created_at: '2026-11-01T00:00:00Z',
  }))
}

test('SCENARIO 1: 52 truly distinct shifts -> exactly 52 created, 0 duplicates', async () => {
  const sourceRows: Record<string, unknown>[] = []
  // Generate 52 unique hour slots: 26 days x 2 slots/day
  for (let d = 1; d <= 26; d++) {
    const dayStr = String(d).padStart(2, '0')
    sourceRows.push({
      Date: `2026-11-${dayStr}`,
      'Start time': '09:00',
      'End time': '11:00',
      Brand: 'Brand A',
      Platform: 'Shopee',
      Campaign: 'Summer Sale',
      'Shift title': `Shift Day ${d} Morning`,
      Studio: 'Studio 1',
      Host: `Host ${d}A`,
    })
    sourceRows.push({
      Date: `2026-11-${dayStr}`,
      'Start time': '14:00',
      'End time': '16:00',
      Brand: 'Brand A',
      Platform: 'Shopee',
      Campaign: 'Summer Sale',
      'Shift title': `Shift Day ${d} Afternoon`,
      Studio: 'Studio 1',
      Host: `Host ${d}B`,
    })
  }
  assert.equal(sourceRows.length, 52)

  const parsed = normalizeScheduleImportResult(parseScheduleRows(sourceRows, baseMaps, []))
  assert.equal(parsed.totalRows, 52)
  assert.equal(parsed.validRows, 52)
  assert.equal(parsed.invalidRows, 0)
  assert.equal(parsed.rows.filter(r => r.isInFileDuplicate).length, 0)
  assert.equal(parsed.validShifts.length, 52)

  // Simulate processScheduleImportRows
  const createdShifts: any[] = []
  const recordedOutcomes: any[] = []

  const result = await processScheduleImportRows({
    batchId: 'batch-52-distinct',
    previews: parsed.rows,
    batchRows: mockPendingBatchRows('batch-52-distinct', parsed.rows),
    initialShifts: [],
    createShift: async (data) => {
      const shift = { ...data, id: `shift-${createdShifts.length + 1}`, version: 1 }
      createdShifts.push(shift)
      return shift as Shift
    },
    refreshShifts: async () => createdShifts,
    updateShift: async (id, patch) => null,
    recordOutcome: async (outcome) => {
      recordedOutcomes.push(outcome)
    },
  })

  assert.equal(result.imported, 52)
  assert.equal(result.recovered, 0)
  assert.equal(result.duplicateSkipped, 0)
  assert.equal(createdShifts.length, 52)
  assert.equal(recordedOutcomes.filter(o => o.outcome === 'imported').length, 52)
})

test('SCENARIO 2: 52 rows representing 2 slots (50 in-file duplicates) -> exactly 2 imported, 50 duplicate_skipped', async () => {
  const sourceRows: Record<string, unknown>[] = []
  // Slot 1: repeated 26 times with different synthetic host names
  for (let i = 1; i <= 26; i++) {
    sourceRows.push({
      Date: '2026-11-01',
      'Start time': '09:00',
      'End time': '11:00',
      Brand: 'Brand A',
      Platform: 'Shopee',
      'Shift title': 'Morning Slot 1',
      Studio: 'Studio 1',
      Host: `Host Slot1 #${i}`,
    })
  }
  // Slot 2: repeated 26 times with different synthetic host names
  for (let i = 1; i <= 26; i++) {
    sourceRows.push({
      Date: '2026-11-01',
      'Start time': '14:00',
      'End time': '16:00',
      Brand: 'Brand B',
      Platform: 'TikTok',
      'Shift title': 'Afternoon Slot 2',
      Studio: 'Studio 2',
      Host: `Host Slot2 #${i}`,
    })
  }
  assert.equal(sourceRows.length, 52)

  const parsed = normalizeScheduleImportResult(parseScheduleRows(sourceRows, baseMaps, []))
  assert.equal(parsed.totalRows, 52)
  // Only the first occurrence of each slot is valid shift candidate
  const inFileDuplicates = parsed.rows.filter(r => r.isInFileDuplicate)
  assert.equal(inFileDuplicates.length, 50)
  assert.equal(parsed.validShifts.length, 2)

  // Verify outcomes when processing import
  const createdShifts: any[] = []
  const recordedOutcomes: any[] = []

  const result = await processScheduleImportRows({
    batchId: 'batch-52-with-duplicates',
    previews: parsed.rows,
    batchRows: mockPendingBatchRows('batch-52-with-duplicates', parsed.rows),
    initialShifts: [],
    createShift: async (data) => {
      const shift = { ...data, id: `shift-${createdShifts.length + 1}`, version: 1 }
      createdShifts.push(shift)
      return shift as Shift
    },
    refreshShifts: async () => createdShifts,
    updateShift: async (id, patch) => null,
    recordOutcome: async (outcome) => {
      recordedOutcomes.push(outcome)
    },
  })

  // CRITICAL REQUIREMENT: Never report imported = 52 when 50 rows are duplicates!
  assert.equal(result.imported, 2, 'Must import exactly 2 distinct slots')
  assert.equal(result.duplicateSkipped, 50, 'Must skip exactly 50 duplicate rows')
  assert.equal(createdShifts.length, 2, 'Must create exactly 2 shifts in database')

  const importedOutcomes = recordedOutcomes.filter(o => o.outcome === 'imported')
  const duplicateOutcomes = recordedOutcomes.filter(o => o.outcome === 'duplicate_skipped')
  assert.equal(importedOutcomes.length, 2)
  assert.equal(duplicateOutcomes.length, 50)

  // Verify that duplicate rows have no shiftId and were never assigned to existing shifts
  for (const dup of duplicateOutcomes) {
    assert.equal(dup.shiftId ?? null, null)
  }
})

test('SCENARIO 3: Re-import existing shifts without changes -> 0 created, duplicate_skipped', async () => {
  const existingShift: Shift = {
    id: 'existing-shift-100',
    date: '2026-11-05',
    start_time: '10:00',
    end_time: '12:00',
    brand_id: 'brand-a',
    platform_id: 'plat-shopee',
    campaign_id: 'camp-summer',
    title: 'Existing Morning Shift',
    studio: 'Studio A',
    required_host_count: 1,
    required_support_count: 1,
    required_technical_count: 1,
    status: 'scheduled',
    status_mode: 'auto',
    execution_source: 'internal',
    agency_code: null,
    host_names: ['Host Existing'],
    assistant_names: [],
    technical_names: [],
    registration_locked: false,
    allow_multi_role: false,
    created_at: '2026-11-01T00:00:00Z',
    updated_at: '2026-11-01T00:00:00Z',
    version: 1,
  }

  const sourceRows = [
    {
      Date: '2026-11-05',
      'Start time': '10:00',
      'End time': '12:00',
      Brand: 'Brand A',
      Platform: 'Shopee',
      Campaign: 'Summer Sale',
      'Shift title': 'Existing Morning Shift',
      Studio: 'Studio A',
      Host: 'Host Existing',
    },
  ]

  const parsed = normalizeScheduleImportResult(parseScheduleRows(sourceRows, baseMaps, [existingShift]))
  assert.equal(parsed.validShifts.length, 0, 'No new shifts to create')
  assert.equal(parsed.rows[0].duplicateReference?.id, 'existing-shift-100')

  const createdShifts: any[] = []
  const recordedOutcomes: any[] = []

  const result = await processScheduleImportRows({
    batchId: 'batch-reimport',
    previews: parsed.rows,
    batchRows: mockPendingBatchRows('batch-reimport', parsed.rows),
    initialShifts: [existingShift],
    createShift: async () => {
      throw new Error('Should not call createShift')
    },
    refreshShifts: async () => [existingShift],
    updateShift: async () => null,
    recordOutcome: async (outcome) => {
      recordedOutcomes.push(outcome)
    },
  })

  assert.equal(result.imported, 0)
  assert.equal(result.duplicateSkipped, 1)
  assert.equal(createdShifts.length, 0)
  assert.equal(recordedOutcomes[0].outcome, 'duplicate_skipped')
  assert.equal(recordedOutcomes[0].shiftId, 'existing-shift-100')
})

test('SCENARIO 4: Agency mapping & persistence contract (#133)', async () => {
  // 1. Explicit row with agency 'Live AI'
  const rows = [
    {
      Date: '2026-11-06',
      'Start time': '10:00',
      'End time': '12:00',
      Brand: 'Brand A',
      Platform: 'Shopee',
      Agency: 'Live AI',
    },
    {
      Date: '2026-11-06',
      'Start time': '14:00',
      'End time': '16:00',
      Brand: 'Brand A',
      Platform: 'Shopee',
      Agency: 'SNAP',
    },
    {
      Date: '2026-11-06',
      'Start time': '18:00',
      'End time': '20:00',
      Brand: 'Brand A',
      Platform: 'Shopee',
      Agency: 'ADA',
    },
    {
      Date: '2026-11-06',
      'Start time': '21:00',
      'End time': '23:00',
      Brand: 'Brand A',
      Platform: 'Shopee',
      // No agency specified, but batchAgency = 'live_ai'
    },
  ]

  const parsed = normalizeScheduleImportResult(parseScheduleRows(rows, baseMaps, [], { batchAgency: 'live_ai' }))
  assert.equal(parsed.validShifts.length, 4)

  // Row 0: Live AI -> agency_code = 'live_ai', execution_source = 'agency'
  assert.equal(parsed.validShifts[0].agency_code, 'live_ai')
  assert.equal(parsed.validShifts[0].execution_source, 'agency')

  // Row 1: SNAP -> agency_code = 'snap', execution_source = 'agency'
  assert.equal(parsed.validShifts[1].agency_code, 'snap')
  assert.equal(parsed.validShifts[1].execution_source, 'agency')

  // Row 2: ADA -> agency_code = 'ada', execution_source = 'agency'
  assert.equal(parsed.validShifts[2].agency_code, 'ada')
  assert.equal(parsed.validShifts[2].execution_source, 'agency')

  // Row 3: defaulted from batchAgency
  assert.equal(parsed.validShifts[3].agency_code, 'live_ai')
  assert.equal(parsed.validShifts[3].execution_source, 'agency')

  // Test invalid agency
  const invalidRow = [
    {
      Date: '2026-11-07',
      'Start time': '10:00',
      'End time': '12:00',
      Brand: 'Brand A',
      Platform: 'Shopee',
      Agency: 'Invalid Agency Corp',
    },
  ]
  const invalidParsed = parseScheduleRows(invalidRow, baseMaps, [])
  assert.ok(invalidParsed.rows[0].row.errors.some(e => e.includes('Invalid Agency Corp') && e.includes('ADA, SNAP, Live AI')))
})

test('SCENARIO 5: Export round-trip includes Execution Source and Agency', () => {
  const shifts: Shift[] = [
    {
      id: 'shift-exp-1',
      date: '2026-11-08',
      start_time: '09:00',
      end_time: '11:00',
      brand_id: 'brand-a',
      platform_id: 'plat-shopee',
      status: 'scheduled',
      execution_source: 'agency',
      agency_code: 'live_ai',
      required_host_count: 1,
      required_support_count: 1,
      required_technical_count: 1,
      host_names: [],
      assistant_names: [],
      technical_names: [],
      registration_locked: false,
      allow_multi_role: false,
      created_at: '2026-11-01T00:00:00Z',
      updated_at: '2026-11-01T00:00:00Z',
    },
    {
      id: 'shift-exp-2',
      date: '2026-11-08',
      start_time: '14:00',
      end_time: '16:00',
      brand_id: 'brand-b',
      platform_id: 'plat-tiktok',
      status: 'scheduled',
      execution_source: 'internal',
      agency_code: null,
      required_host_count: 1,
      required_support_count: 1,
      required_technical_count: 1,
      host_names: [],
      assistant_names: [],
      technical_names: [],
      registration_locked: false,
      allow_multi_role: false,
      created_at: '2026-11-01T00:00:00Z',
      updated_at: '2026-11-01T00:00:00Z',
    },
  ]

  const exportRows = buildScheduleExportRows(
    shifts,
    baseMaps.brands,
    baseMaps.platforms,
    baseMaps.campaigns,
    new Map(),
    [],
  )

  assert.equal(exportRows.length, 2)
  // Verify deterministic column order
  assert.deepEqual(Object.keys(exportRows[0]), [...SCHEDULE_EXPORT_COLUMN_ORDER])
  assert.equal(exportRows[0]['Execution Source'], 'Agency')
  assert.equal(exportRows[0]['Agency'], 'Live AI')

  assert.equal(exportRows[1]['Execution Source'], 'Internal')
  assert.equal(exportRows[1]['Agency'], '')
})

test('SCENARIO 6: PostgreSQL Migration executes correctly and validates agency_code RPC rules', async () => {
  const db = new PGlite()
  await db.exec(`
    create schema if not exists private;
    create table if not exists public.system_settings (
      id text primary key,
      default_host_count smallint default 1,
      default_support_count smallint default 1,
      default_technical_count smallint default 1,
      allow_multi_role_per_shift boolean default false
    );
    create table if not exists public.shifts (
      id text primary key default gen_random_uuid()::text,
      date date,
      start_time time,
      end_time time,
      timezone text,
      brand_id text,
      platform_id text,
      campaign_id text,
      title text,
      studio text,
      host_names text[],
      assistant_names text[],
      technical_names text[],
      required_host_count smallint,
      required_support_count smallint,
      required_technical_count smallint,
      registration_cutoff_at timestamptz,
      allow_multi_role boolean,
      import_batch_id text,
      status text,
      live_link text,
      product_notes text,
      updated_by text,
      execution_source text,
      status_mode text default 'auto',
      version integer default 1,
      deleted_at timestamptz,
      archived_at timestamptz
    );
    create or replace function private.require_shift_actor(req boolean) returns text as 'select ''test-actor'';' language sql;
    create or replace function private.current_system_permission() returns text as 'select ''admin'';' language sql;
    create or replace function private.normalize_shift_capacity(val text, def smallint) returns smallint as 'select coalesce(val::smallint, def);' language sql;
    create or replace function private.apply_legacy_single_staffing_assignment(s text, r text, u text, a text) returns void as 'select null;' language sql;
    create or replace function private.assert_shift_staffing_consistent(s public.shifts) returns void as 'select null;' language sql;
    create or replace function private.assert_expected_version(e text, exp integer, act integer) returns void as 'select null;' language sql;
  `)

  // Apply the migration
  const migrationSql = fs.readFileSync('supabase/migrations/20261102190000_rc19_batch01_1_agency_code.sql', 'utf8')
  await db.exec(migrationSql)

  // Insert settings
  await db.exec(`insert into public.system_settings (id) values ('default');`)

  // Test 1: create_shift with agency_code = 'live_ai'
  const createResult = await db.query(`
    select * from public.create_shift('{
      "date": "2026-11-10",
      "start_time": "10:00",
      "end_time": "12:00",
      "execution_source": "agency",
      "agency_code": "live_ai"
    }'::jsonb)
  `)
  assert.equal(createResult.rows.length, 1)
  const createdShift = createResult.rows[0] as any
  assert.equal(createdShift.agency_code, 'live_ai')
  assert.equal(createdShift.execution_source, 'agency')

  // Test 2: update_shift changing agency_code to 'snap'
  const updateResult = await db.query(`
    select * from public.update_shift('${createdShift.id}', '{
      "agency_code": "snap"
    }'::jsonb, false)
  `)
  assert.equal((updateResult.rows[0] as any).agency_code, 'snap')

  // Test 3: update_shift with invalid agency_code must reject with SHIFT_AGENCY_CODE_INVALID
  await assert.rejects(
    async () => {
      await db.query(`
        select * from public.update_shift('${createdShift.id}', '{
          "agency_code": "unauthorized_agency"
        }'::jsonb, false)
      `)
    },
    (err: any) => err.message.includes('SHIFT_AGENCY_CODE_INVALID'),
  )

  // Test 4: update_shift with invalid execution_source must reject with SHIFT_EXECUTION_SOURCE_INVALID
  await assert.rejects(
    async () => {
      await db.query(`
        select * from public.update_shift('${createdShift.id}', '{
          "execution_source": "third_party"
        }'::jsonb, false)
      `)
    },
    (err: any) => err.message.includes('SHIFT_EXECUTION_SOURCE_INVALID'),
  )
})
