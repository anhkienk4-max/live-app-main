import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import type { SupabaseClient } from '@supabase/supabase-js'
import {
  createSupabaseSettingsRepository,
  setSupabaseSettingsRepositoryForTests,
} from '../lib/services/supabaseSettingsService.ts'
import { settingsService } from '../lib/services/dataService.ts'
import type { OperationalSettings } from '../lib/types/database.types.ts'

const migrationUrl = new URL(
  '../supabase/migrations/20260906100000_gl19c_operational_settings_consumers.sql',
  import.meta.url,
)

const storedSettings: OperationalSettings = {
  registration_cutoff_hours: 9,
  require_registration_approval: false,
  auto_lock_filled_shifts: false,
  allow_multi_role_per_shift: true,
  default_host_count: 2,
  default_support_count: 3,
  default_technical_count: 4,
  team_notifications_enabled: true,
  swap_approval_required: true,
  require_report_review: true,
  report_reminder_hours: 12,
  require_shift_capacity_validation: true,
  require_time_overlap_validation: true,
  allow_leader_schedule_edit: false,
  strict_host_role_binding: true,
  default_view_mode: 'timeline',
  calendar_density: 'comfortable',
  show_unassigned_shifts: true,
}

function fakeClient(row: OperationalSettings, calls: Array<{ name: string; args: unknown }>) {
  return {
    from: () => ({
      select: () => ({
        limit: () => ({
          maybeSingle: async () => ({ data: row, error: null }),
        }),
      }),
    }),
    rpc: (name: string, args: unknown) => ({
      single: async () => {
        calls.push({ name, args })
        return { data: row, error: null }
      },
    }),
  } as unknown as SupabaseClient
}

test('Supabase settings repository reads seven operational settings and updates only those keys', async () => {
  const calls: Array<{ name: string; args: unknown }> = []
  const repository = createSupabaseSettingsRepository(fakeClient(storedSettings, calls))

  const loaded = await repository.getOperationalSettings()
  assert.deepEqual(
    Object.fromEntries([
      'registration_cutoff_hours',
      'require_registration_approval',
      'auto_lock_filled_shifts',
      'allow_multi_role_per_shift',
      'default_host_count',
      'default_support_count',
      'default_technical_count',
    ].map(key => [key, loaded[key as keyof OperationalSettings]])),
    {
      registration_cutoff_hours: 9,
      require_registration_approval: false,
      auto_lock_filled_shifts: false,
      allow_multi_role_per_shift: true,
      default_host_count: 2,
      default_support_count: 3,
      default_technical_count: 4,
    },
  )

  await repository.updateOperationalSettings({
    ...storedSettings,
    registration_cutoff_hours: 12,
    default_host_count: 5,
  })
  assert.deepEqual(calls, [{
    name: 'update_operational_settings',
    args: {
      p_patch: {
        registration_cutoff_hours: 12,
        require_registration_approval: false,
        auto_lock_filled_shifts: false,
        allow_multi_role_per_shift: true,
        default_host_count: 5,
        default_support_count: 3,
        default_technical_count: 4,
      },
    },
  }])
})

test('Supabase operational-setting failure cannot become a local success', async () => {
  const previousNodeEnv = process.env.NODE_ENV
  const previousMockFlag = process.env.NEXT_PUBLIC_USE_MOCK_DATA
  try {
    process.env.NODE_ENV = 'production'
    process.env.NEXT_PUBLIC_USE_MOCK_DATA = 'false'
    const stable = { ...storedSettings }
    const repository = {
      getOperationalSettings: async () => stable,
      updateOperationalSettings: async () => { throw new Error('SETTINGS_WRITE_FAILED') },
    }
    setSupabaseSettingsRepositoryForTests(repository)
    await assert.rejects(
      settingsService.updateOperational({ default_host_count: 7 }),
      /SETTINGS_WRITE_FAILED/,
    )
    assert.deepEqual(await settingsService.getOperational(), stable)
    setSupabaseSettingsRepositoryForTests(undefined)
  } finally {
    if (previousNodeEnv === undefined) delete process.env.NODE_ENV
    else process.env.NODE_ENV = previousNodeEnv
    if (previousMockFlag === undefined) delete process.env.NEXT_PUBLIC_USE_MOCK_DATA
    else process.env.NEXT_PUBLIC_USE_MOCK_DATA = previousMockFlag
  }
})

test('SQL authority connects each operational setting to its production consumer', async () => {
  const sql = await readFile(migrationUrl, 'utf8')
  for (const key of [
    'registration_cutoff_hours',
    'require_registration_approval',
    'auto_lock_filled_shifts',
    'allow_multi_role_per_shift',
    'default_host_count',
    'default_support_count',
    'default_technical_count',
  ]) {
    assert.match(sql, new RegExp(key))
  }
  assert.match(sql, /update_operational_settings/)
  assert.match(sql, /private\.is_leader_or_admin\(\)/)
  assert.match(sql, /set_shift_derived_fields[\s\S]*registration_cutoff_hours/)
  assert.match(sql, /create_shift[\s\S]*settings_row\.default_host_count/)
  assert.match(sql, /register_for_shift[\s\S]*settings_row\.require_registration_approval/)
  assert.match(sql, /refresh_shift_registration_lock[\s\S]*auto_lock_filled_shifts/)
  assert.match(sql, /assert_no_shift_registration_conflict[\s\S]*allow_multi_role_per_shift/)
  assert.match(sql, /assert_shift_staffing_consistent[\s\S]*multi_role_allowed/)
})
