import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { parseScheduleRows, type EntityMaps } from '../lib/utils/excelUtils'
import { normalizeScheduleImportResult } from '../lib/utils/scheduleImportPreview'

const maps: EntityMaps = {
  brands: new Map([['KAO', 'brand-kao']]),
  platforms: new Map([['Shopee Live', 'plat-shopee']]),
  campaigns: new Map(),
}

test('C5.11 parses and persists overnight staffing segment definitions through the create RPC contract', () => {
  const result = normalizeScheduleImportResult(parseScheduleRows([{
    Date: '2026-11-15',
    Time: '20:00 - 23:00\n23:00 - 02:00',
    Brand: 'KAO',
    Platform: 'Shopee Live',
    'Shift title': 'KAO overnight live',
    Host: 'Host A, Host B\nHost C',
    'Trợ': 'Support A\nSupport B',
    'Kỹ thuật': 'Tech A\nTech B',
    'Host count': 1,
    'Support count': 1,
    'Technical count': 1,
  }], maps))

  assert.equal(result.errors.length, 0)
  const shift = result.validShifts[0]
  assert.equal(shift.crosses_midnight, true)
  assert.deepEqual(shift.staffing_segments, [
    {
      segment_index: 1,
      start_time: '20:00',
      end_time: '23:00',
      required_host_count: 2,
      required_support_count: 1,
      required_technical_count: 1,
      planned_host_names: ['Host A', 'Host B'],
      planned_support_names: ['Support A'],
      planned_technical_names: ['Tech A'],
    },
    {
      segment_index: 2,
      start_time: '23:00',
      end_time: '02:00',
      required_host_count: 1,
      required_support_count: 1,
      required_technical_count: 1,
      planned_host_names: ['Host C'],
      planned_support_names: ['Support B'],
      planned_technical_names: ['Tech B'],
    },
  ])
})

test('C5.11 rejects overlapping, out-of-parent, and incomplete multiline segment rows', () => {
  const result = normalizeScheduleImportResult(parseScheduleRows([{
    Date: '2026-11-15', Time: '20:00 - 23:30\n23:00 - 02:00',
    Brand: 'KAO', Platform: 'Shopee Live', 'Shift title': 'Invalid overlap',
  }, {
    Date: '2026-11-15', Time: '20:00 - 21:00\n19:00 - 02:00',
    Brand: 'KAO', Platform: 'Shopee Live', 'Shift title': 'Invalid gap parent overflow',
  }, {
    Date: '2026-11-15', Time: '20:00 - 23:00\nnot a time range',
    Brand: 'KAO', Platform: 'Shopee Live', 'Shift title': 'Invalid line',
  }], maps))

  assert.equal(result.validShifts.length, 0)
  assert.equal(result.errors.length, 3)
})

test('C5.11 migration keeps legacy registrations nullable and exposes only authenticated segment RPCs', () => {
  const migration = readFileSync('supabase/migrations/20261109100000_rc19_c511_persisted_staffing_segments.sql', 'utf8')
  assert.match(migration, /add column staffing_segment_id text null/i)
  assert.match(migration, /create unique index shift_registrations_active_role_uidx[\s\S]*coalesce\(staffing_segment_id, ''\)/i)
  assert.match(migration, /create or replace function public\.register_for_staffing_segment\(p_segment_id text, p_role text\)/i)
  assert.match(migration, /grant execute on function public\.register_for_staffing_segment\(text,text\) to authenticated/i)
  assert.match(migration, /C511_ACTIVE_REGISTRATION_INDEX_INCOMPATIBLE/)
  assert.match(migration, /SHIFT_SEGMENTS_OUTSIDE_PARENT/)
  assert.match(migration, /rbac01_effective_permission\('shifts\.edit'\)/i)
  assert.match(migration, /bool_and\([\s\S]*staffing_segment_id=s\.id/i)
  assert.match(migration, /revoke all on public\.shift_staffing_segments from public, anon, authenticated/i)
  assert.match(migration, /private\.rc19_has_any_leader_brand_scope\(target\.brand_id, array\['shifts\.manage'\]/i)
  assert.match(migration, /LEADER_BRAND_SCOPE_REQUIRED/)
  assert.match(migration, /current_system_permission\(\) = 'leader'[\s\S]*?rc19_has_any_leader_brand_scope/i)
  assert.match(migration, /STAFFING_SEGMENT_FULL/)
})
