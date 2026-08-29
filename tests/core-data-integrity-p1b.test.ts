import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { assertExpectedVersion } from '../lib/services/dataService.ts'
import { STALE_WRITE_MATRIX } from '../lib/utils/dataIntegrity.ts'

const migration = readFileSync(
  fileURLToPath(new URL('../supabase/migrations/20260829130000_core_v1_data_integrity_p1b.sql', import.meta.url)),
  'utf8',
)

test('P1-B migration adds server-controlled revisions to operational entities', () => {
  for (const table of ['shifts', 'shift_registrations', 'swap_requests']) {
    assert.match(migration, new RegExp(`alter table public\\.${table}[\\s\\S]*add column if not exists version integer not null default 1`, 'i'))
    assert.match(migration, new RegExp(`create trigger ${table}_bump_concurrency_version`, 'i'))
  }
  assert.match(migration, /message = 'STALE_WRITE'/i)
  assert.match(migration, /message = 'EXPECTED_VERSION_REQUIRED'/i)
  assert.match(migration, /p_expected_version integer/i)
})

test('P1-B expected revision mismatch is deterministic and non-mutating', () => {
  assert.doesNotThrow(() => assertExpectedVersion('Shift', 4, 4))
  for (const missing of [undefined, null, 0, -1]) {
    assert.throws(
      () => assertExpectedVersion('Shift', 4, missing),
      error => error instanceof Error && error.message.startsWith('EXPECTED_VERSION_REQUIRED'),
    )
  }
  assert.throws(
    () => assertExpectedVersion('Shift', 5, 4),
    error => error instanceof Error && error.message.startsWith('STALE_WRITE'),
  )
})

test('P1-B protects only the locked operational write domains', () => {
  for (const entity of ['Shift', 'ShiftRegistration', 'SwapRequest']) {
    const entry = STALE_WRITE_MATRIX.find(item => item.entity === entity)
    assert.ok(entry)
    assert.ok(entry.currentProtection.includes('version'))
    assert.equal(entry.missingProtection.includes('version'), false)
  }
  assert.equal(STALE_WRITE_MATRIX.find(item => item.entity === 'Report')?.missingProtection.includes('version'), true)
})

test('P1-B server contract exposes revision guards on every protected RPC family', () => {
  const guardedFunctions = [
    'update_shift',
    'update_shift_staffing_labels',
    'set_shift_registration_lock',
    'soft_delete_shift',
    'restore_shift',
    'approve_shift_registration',
    'reject_shift_registration',
    'cancel_own_shift_registration',
    'manual_assign_shift_staff',
    'manual_assign_imported_shift_staff',
    'remove_shift_staffing',
    'respond_shift_swap_request',
    'reject_shift_swap_request',
    'cancel_own_shift_swap_request',
    'approve_shift_swap_request',
  ]
  for (const name of guardedFunctions) {
    assert.match(migration, new RegExp(`create or replace function public\\.${name}\\([\\s\\S]*p_expected_version integer`, 'i'), name)
    assert.match(migration, new RegExp(`grant execute on function public\\.${name}\\([\\s\\S]*integer\\) to authenticated`, 'i'), name)
  }
  assert.match(migration, /bulk_review_shift_registrations\(\s*p_registration_ids text\[\],[\s\S]*p_expected_versions jsonb/i)
})
