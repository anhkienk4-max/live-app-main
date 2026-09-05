import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { currentUserService, shiftService } from '../lib/services/dataService.ts'
import type { Shift } from '../lib/types/database.types.ts'

const versionGuardMigration = readFileSync(
  new URL('../supabase/migrations/20260829130000_core_v1_data_integrity_p1b.sql', import.meta.url),
  'utf8',
)

const admin = {
  id: '1',
  email: 'admin@example.test',
  full_name: 'Admin',
  role: 'admin' as const,
  system_permission: 'admin' as const,
  operational_roles: [],
  status: 'active' as const,
  account_status: 'active' as const,
  join_date: '2026-01-01',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
}

let seed = 0
function shiftData(title: string): Omit<Shift, 'id' | 'created_at' | 'updated_at'> {
  seed += 1
  return {
    title: `${title} ${seed}`,
    date: `2035-02-${String(seed).padStart(2, '0')}`,
    start_time: '09:00',
    end_time: '11:00',
    brand_id: 'b1',
    platform_id: 'p1',
    status: 'scheduled',
    registration_locked: false,
    allow_multi_role: false,
  }
}

async function withMockEnvironment(run: () => Promise<void>) {
  const previousNodeEnv = process.env.NODE_ENV
  const previousMockFlag = process.env.NEXT_PUBLIC_USE_MOCK_DATA
  try {
    process.env.NODE_ENV = 'development'
    process.env.NEXT_PUBLIC_USE_MOCK_DATA = 'true'
    currentUserService.bindAuthenticatedUser(admin)
    await run()
  } finally {
    currentUserService.clearAuthenticatedUser()
    process.env.NODE_ENV = previousNodeEnv
    process.env.NEXT_PUBLIC_USE_MOCK_DATA = previousMockFlag
  }
}

test('GL-19D server-side update_shift enforces the expected version', () => {
  assert.match(versionGuardMigration, /perform private\.assert_expected_version\('Shift', p_expected_version, current_version\)/)
  assert.match(versionGuardMigration, /EXPECTED_VERSION_REQUIRED/)
  assert.match(versionGuardMigration, /STALE_WRITE/)
})

test('GL-19D single bulk status update uses the row version', async () => {
  await withMockEnvironment(async () => {
    const shift = await shiftService.create(shiftData('Single'))
    const result = await shiftService.bulkUpdateStatus([shift], 'cancelled')
    assert.equal(result.succeeded, 1)
    assert.equal(result.failed, 0)
    assert.deepEqual(result.outcomes.map(outcome => outcome.success), [true])
    const refreshed = await shiftService.getById(shift.id)
    assert.equal(refreshed?.status, 'cancelled')
    assert.equal(refreshed?.version, (shift.version ?? 1) + 1)
  })
})

test('GL-19D multiple rows each advance from their own version', async () => {
  await withMockEnvironment(async () => {
    const first = await shiftService.create(shiftData('Multi A'))
    const second = await shiftService.create(shiftData('Multi B'))
    const advanced = await shiftService.update(first.id, { status: 'preparing', version: first.version })
    const rows = [
      (await shiftService.getById(first.id)) as Shift,
      (await shiftService.getById(second.id)) as Shift,
    ]
    assert.notEqual(rows[0].version, rows[1].version)
    const result = await shiftService.bulkUpdateStatus(rows, 'cancelled')
    assert.equal(result.succeeded, 2)
    assert.equal(result.failed, 0)
    assert.equal((await shiftService.getById(first.id))?.version, (advanced?.version ?? 1) + 1)
    assert.equal((await shiftService.getById(second.id))?.version, (second.version ?? 1) + 1)
  })
})

test('GL-19D missing version is rejected, never null-filled', async () => {
  await withMockEnvironment(async () => {
    const shift = await shiftService.create(shiftData('NoVersion'))
    const result = await shiftService.bulkUpdateStatus([{ ...shift, version: undefined }], 'cancelled')
    assert.equal(result.succeeded, 0)
    assert.equal(result.failed, 1)
    assert.match(result.outcomes[0].error_message ?? '', /EXPECTED_VERSION_REQUIRED/)
    assert.equal((await shiftService.getById(shift.id))?.status, 'scheduled')
  })
})

test('GL-19D stale version conflict is recorded against the exact row', async () => {
  await withMockEnvironment(async () => {
    const shift = await shiftService.create(shiftData('Stale'))
    await shiftService.update(shift.id, { status: 'preparing', version: shift.version })
    const result = await shiftService.bulkUpdateStatus([shift], 'cancelled')
    assert.equal(result.succeeded, 0)
    assert.equal(result.failed, 1)
    assert.equal(result.outcomes[0].shift_id, shift.id)
    assert.match(result.outcomes[0].error_message ?? '', /STALE_WRITE/)
    const preserved = await shiftService.getById(shift.id)
    assert.equal(preserved?.status, 'preparing')
  })
})

test('GL-19D partial failure reports exact success, failure, and conflicted records', async () => {
  await withMockEnvironment(async () => {
    const good = await shiftService.create(shiftData('Good'))
    const stale = await shiftService.create(shiftData('StaleRow'))
    await shiftService.update(stale.id, { status: 'preparing', version: stale.version })
    const versionless = await shiftService.create(shiftData('Versionless'))
    const result = await shiftService.bulkUpdateStatus(
      [good, stale, { ...versionless, version: undefined }],
      'cancelled',
    )
    assert.equal(result.succeeded, 1)
    assert.equal(result.failed, 2)
    assert.equal(result.outcomes.length, 3)
    assert.deepEqual(result.outcomes.map(outcome => outcome.success), [true, false, false])
    assert.equal(result.outcomes[0].shift_id, good.id)
    assert.equal(result.outcomes[1].shift_id, stale.id)
    assert.match(result.outcomes[1].error_message ?? '', /STALE_WRITE/)
    assert.match(result.outcomes[2].error_message ?? '', /EXPECTED_VERSION_REQUIRED/)
    assert.equal((await shiftService.getById(good.id))?.status, 'cancelled')
    assert.equal((await shiftService.getById(stale.id))?.status, 'preparing')
  })
})

test('GL-19D bulk result never claims success for failed rows', async () => {
  await withMockEnvironment(async () => {
    const shift = await shiftService.create(shiftData('Honest'))
    const result = await shiftService.bulkUpdateStatus([{ ...shift, version: undefined }], 'cancelled')
    assert.equal(result.succeeded + result.failed, 1)
    assert.ok(result.outcomes.every(outcome => (outcome.success ? outcome.error_message === undefined : typeof outcome.error_message === 'string' && outcome.error_message.length > 0)))
  })
})

test('GL-19D authoritative read after mutation reflects persisted state', async () => {
  await withMockEnvironment(async () => {
    const first = await shiftService.create(shiftData('Refresh A'))
    const second = await shiftService.create(shiftData('Refresh B'))
    const result = await shiftService.bulkUpdateStatus([first, second], 'cancelled')
    assert.equal(result.failed, 0)
    const refreshed = await Promise.all([shiftService.getById(first.id), shiftService.getById(second.id)])
    assert.deepEqual(refreshed.map(row => row?.status), ['cancelled', 'cancelled'])
    assert.deepEqual(refreshed.map(row => row?.version), [(first.version ?? 1) + 1, (second.version ?? 1) + 1])
  })
})
