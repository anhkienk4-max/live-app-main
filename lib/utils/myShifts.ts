import type { Shift, ShiftRegistration } from '../types/database.types'
import { matchesMultiSelect } from './multiSelectFilter'

export type MyShiftFilters = {
  date: string
  brand: string | readonly string[]
  platform: string | readonly string[]
  campaign: string | readonly string[]
  role: string | readonly string[]
  registrationStatus?: string | readonly string[]
}

export type MyShiftEntry = {
  shift: Shift
  registrations: ShiftRegistration[]
}

const activeStatuses = new Set(['pending', 'approved', 'manually_assigned'])

/**
 * Return the canonical, one-row-per-shift projection for "My Shifts".
 * Imported staffing labels and shift capacity slots are deliberately ignored.
 */
export function selectMyShiftEntries({
  shifts,
  registrations,
  userId,
  filters,
}: {
  shifts: Shift[]
  registrations: ShiftRegistration[]
  userId: string
  filters: MyShiftFilters
}): MyShiftEntry[] {
  const shiftsById = new Map(shifts.map(shift => [shift.id, shift]))
  const entries = registrations
    .filter(registration => registration.user_id === userId && activeStatuses.has(registration.status))
    .map(registration => ({ shift: shiftsById.get(registration.shift_id), registration }))
    .filter((entry): entry is { shift: Shift; registration: ShiftRegistration } => Boolean(entry.shift))
    .filter(({ shift, registration }) => {
      if (filters.date && shift.date !== filters.date) return false
      const matches = (candidate: string, selected: string | readonly string[]) => Array.isArray(selected)
        ? matchesMultiSelect(candidate, selected)
        : selected === 'all' || selected === candidate
      if (!matches(shift.brand_id, filters.brand)) return false
      if (!matches(shift.platform_id, filters.platform)) return false
      if (!matches(shift.campaign_id || '', filters.campaign)) return false
      if (!matches(registration.operational_role, filters.role)) return false
      if (filters.registrationStatus && !matches(registration.status, filters.registrationStatus)) return false
      return true
    })

  const byShift = new Map<string, MyShiftEntry>()
  for (const { shift, registration } of entries) {
    const entry = byShift.get(shift.id)
    if (entry) entry.registrations.push(registration)
    else byShift.set(shift.id, { shift, registrations: [registration] })
  }

  return [...byShift.values()].sort((left, right) =>
    `${left.shift.date}${left.shift.start_time}`.localeCompare(`${right.shift.date}${right.shift.start_time}`)
  )
}
