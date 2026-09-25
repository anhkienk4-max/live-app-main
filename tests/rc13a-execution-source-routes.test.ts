import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import type { SupabaseClient } from '@supabase/supabase-js'

import { createSupabaseShiftRepository } from '@/lib/services/supabaseShiftService'
import type { Shift } from '@/lib/types/database.types'
import { parseScheduleRows } from '@/lib/utils/excelUtils'
import { buildScheduleImportEnrichmentPatch, buildScheduleImportPreviewSourceRow } from '@/lib/utils/scheduleImportPreview'
import { processScheduleImportRows } from '@/lib/utils/scheduleImportRecovery'

const sql = readFileSync(resolve(process.cwd(), 'supabase/migrations/20260924000000_rc13a_execution_source_storage_routes.sql'), 'utf8')
const maps = {
  brands: new Map([['Brand', 'brand-1']]),
  platforms: new Map([['Platform', 'platform-1']]),
  campaigns: new Map<string, string>(),
}
const sourceRow = {
  Date: '2026-09-24',
  'Start time': '09:00',
  'End time': '13:00',
  Brand: 'Brand',
  Platform: 'Platform',
  'Shift title': 'Morning',
}

test('Internal and Agency are the only controlled import execution sources', () => {
  for (const [value, expected] of [[' Internal ', 'internal'], ['AGENCY', 'agency']] as const) {
    const result = parseScheduleRows([{ ...sourceRow, 'Execution Source': value }], maps)
    assert.equal(result.validRows, 1)
    assert.equal(result.rows[0].row.execution_source, expected)
    assert.equal(result.validShifts[0].execution_source, expected)
  }
  const invalid = parseScheduleRows([{ ...sourceRow, 'Execution Source': 'studio' }], maps)
  assert.equal(invalid.invalidRows, 1)
  assert.match(invalid.rows[0].row.errors.join(' '), /Execution Source must be Internal or Agency/)
})

test('old import rows remain unclassified and preview round-trip preserves explicit values', () => {
  const old = parseScheduleRows([sourceRow], maps)
  assert.equal(old.validRows, 1)
  assert.equal(old.validShifts[0].execution_source, null)
  assert.match(old.rows[0].row.warnings.join(' '), /remain unclassified/)
  for (const value of ['Internal', 'Agency']) {
    const first = parseScheduleRows([{ ...sourceRow, 'Execution Source': value }], maps)
    const reparsed = parseScheduleRows([buildScheduleImportPreviewSourceRow(first.rows[0].row)], maps)
    assert.equal(reparsed.validShifts[0].execution_source, value.toLowerCase())
  }
})

test('confirm/recovery passes execution source to canonical shift creation', async () => {
  const parsed = parseScheduleRows([{ ...sourceRow, 'Execution Source': 'Agency' }], maps)
  const preview = parsed.rows[0]
  let received: Shift['execution_source']
  const result = await processScheduleImportRows({
    batchId: 'batch-1',
    previews: [preview],
    batchRows: [{
      id: 'row-1', batch_id: 'batch-1', source_row_number: preview.row.row_number,
      original_values: preview.row, normalized_values: preview.row,
      status: 'pending', validation_issues: [], created_at: '2026-09-24T00:00:00Z',
    }],
    initialShifts: [],
    createShift: async draft => {
      received = draft.execution_source
      return { ...draft, id: 'shift-1', created_at: '2026-09-24T00:00:00Z', updated_at: '2026-09-24T00:00:00Z' }
    },
    refreshShifts: async () => [],
    recordOutcome: async () => {},
  })
  assert.equal(result.imported, 1)
  assert.equal(received, 'agency')
})

test('explicit source can enrich an existing shift, but absent source cannot classify it', () => {
  const existing = { execution_source: null }
  const imported = { execution_source: 'internal' as const }
  assert.deepEqual(buildScheduleImportEnrichmentPatch(existing, imported, { execution_source: true }), { execution_source: 'internal' })
  assert.deepEqual(buildScheduleImportEnrichmentPatch(existing, imported, {}), {})
})

test('shift repository create/update propagate explicit values and preserve historical NULL', async () => {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = []
  const base = {
    id: 'shift-1', date: '2026-09-24', start_time: '09:00', end_time: '13:00',
    brand_id: 'brand-1', platform_id: 'platform-1', status: 'scheduled',
    created_at: '2026-09-24T00:00:00Z', updated_at: '2026-09-24T00:00:00Z',
  } as Shift
  const client = {
    rpc(name: string, args: Record<string, unknown>) {
      calls.push({ name, args })
      const data = name === 'create_shift' ? { ...base, ...(args.p_data as object) } : { ...base, ...(args.p_patch as object) }
      return { single: async () => ({ data, error: null }) }
    },
  } as unknown as SupabaseClient
  const repo = createSupabaseShiftRepository(client)
  assert.equal((await repo.create({ ...base, execution_source: 'internal' })).execution_source, 'internal')
  assert.equal((calls[0].args.p_data as Record<string, unknown>).execution_source, 'internal')
  assert.equal((await repo.update(base.id, { execution_source: 'agency' }, false, 1))?.execution_source, 'agency')
  assert.equal((calls[1].args.p_patch as Record<string, unknown>).execution_source, 'agency')
  const historical = await repo.update(base.id, { title: 'Edited' }, false, 1)
  assert.equal(historical?.execution_source, null)
  assert.equal(Object.hasOwn(calls[2].args.p_patch as object, 'execution_source'), false)
})

test('migration constrains execution source and preserves existing NULL rows', () => {
  assert.match(sql, /add column execution_source text null/i)
  assert.match(sql, /check \(execution_source in \('internal', 'agency'\)\)/i)
  assert.match(sql, /'SHIFT_EXECUTION_SOURCE_INVALID'/)
  assert.match(sql, /p_data->>'execution_source'/)
  assert.match(sql, /p_patch->>'execution_source'/)
  assert.doesNotMatch(sql, /update public\.shifts\s+set execution_source\s*=/i)
  assert.match(sql, /add column storage_profile text null[\s\S]*alter column storage_profile set default 'CANONICAL_V1'/i)
})

test('route schema accepts six profiles, rejects active duplicate exact keys and user writes', () => {
  for (const profile of [
    'LEGACY_CATEGORY_PERIOD', 'LEGACY_PLATFORM_CATEGORY_PERIOD', 'LEGACY_PERIOD_CATEGORY',
    'LEGACY_SUBBRAND_PERIOD_CATEGORY', 'LEGACY_SUBBRAND_CATEGORY_PERIOD', 'CANONICAL_V1',
  ]) assert.ok(sql.includes(profile))
  assert.match(sql, /references public\.brands\(id\)/)
  assert.match(sql, /references public\.platforms\(id\)/)
  assert.match(sql, /create unique index operational_storage_routes_active_key_uidx[\s\S]*nulls not distinct where active/i)
  assert.match(sql, /enable row level security/i)
  assert.match(sql, /revoke all on table public\.operational_storage_routes from public, anon, authenticated/i)
  assert.doesNotMatch(sql, /insert into public\.operational_storage_routes/i)
})
