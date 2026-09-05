import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import type { OperationalSettings } from '@/lib/types/database.types'

export interface SupabaseSettingsRepository {
  getOperationalSettings(): Promise<Partial<OperationalSettings>>
  updateOperationalSettings(data: Partial<OperationalSettings>): Promise<Partial<OperationalSettings>>
}

const operationalSettingKeys = [
  'registration_cutoff_hours',
  'require_registration_approval',
  'auto_lock_filled_shifts',
  'allow_multi_role_per_shift',
  'default_host_count',
  'default_support_count',
  'default_technical_count',
] as const

type SettingsRow = Partial<OperationalSettings> & { id?: string }

function settingsFromRow(data: unknown): Partial<OperationalSettings> {
  const row = data as SettingsRow
  return {
    registration_cutoff_hours: row.registration_cutoff_hours,
    require_registration_approval: row.require_registration_approval,
    auto_lock_filled_shifts: row.auto_lock_filled_shifts,
    allow_multi_role_per_shift: row.allow_multi_role_per_shift,
    default_host_count: row.default_host_count,
    default_support_count: row.default_support_count,
    default_technical_count: row.default_technical_count,
    require_shift_capacity_validation: row.require_shift_capacity_validation,
    require_time_overlap_validation: row.require_time_overlap_validation,
    allow_leader_schedule_edit: row.allow_leader_schedule_edit,
    strict_host_role_binding: row.strict_host_role_binding,
    default_view_mode: row.default_view_mode,
    calendar_density: row.calendar_density,
    show_unassigned_shifts: row.show_unassigned_shifts,
  }
}

function operationalSettingsPatch(data: Partial<OperationalSettings>): Record<string, unknown> {
  return Object.fromEntries(
    operationalSettingKeys
      .filter(key => data[key] !== undefined)
      .map(key => [key, data[key]]),
  )
}

export function createSupabaseSettingsRepository(client: SupabaseClient): SupabaseSettingsRepository {
  return {
    async getOperationalSettings() {
      const { data, error } = await client
        .from('system_settings')
        .select('*')
        .limit(1)
        .maybeSingle()
      if (error) throw error
      if (!data) throw new Error('OPERATIONAL_SETTINGS_NOT_CONFIGURED')
      return settingsFromRow(data)
    },

    async updateOperationalSettings(updateData: Partial<OperationalSettings>) {
      const patch = operationalSettingsPatch(updateData)
      if (Object.keys(patch).length === 0) return {}
      const { data, error } = await client
        .rpc('update_operational_settings', { p_patch: patch })
        .single()
      if (error) throw error
      if (!data) throw new Error('OPERATIONAL_SETTINGS_WRITE_NOT_APPLIED')
      return settingsFromRow(data)
    },
  }
}

let testRepository: SupabaseSettingsRepository | undefined

export function getSupabaseSettingsRepository(): SupabaseSettingsRepository {
  if (testRepository) return testRepository
  return createSupabaseSettingsRepository(createClient())
}

export function setSupabaseSettingsRepositoryForTests(
  repository: SupabaseSettingsRepository | undefined,
): void {
  testRepository = repository
}
