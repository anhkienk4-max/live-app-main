import type { Shift, ShiftRegistration } from '../types/database.types'

export type MyShiftFilters = {
  date: string
  brand: string
  platform: string
  campaign: string
  role: string
}

export type MyShiftEntry = {
  shift: Shift
  registration: ShiftRegistration
}

const activeStatuses = new Set(['pending', 'approved', 'manually_assigned'])

/**
 * Return the canonical, one-row-per-registration projection for "My Shifts".
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
  return registrations
    .filter(registration => registration.user_id === userId && activeStatuses.has(registration.status))
    .map(registration => ({ shift: shiftsById.get(registration.shift_id), registration }))
    .filter((entry): entry is MyShiftEntry => Boolean(entry.shift))
    .filter(({ shift, registration }) => {
      if (filters.date && shift.date !== filters.date) return false
      if (filters.brand !== 'all' && shift.brand_id !== filters.brand) return false
      if (filters.platform !== 'all' && shift.platform_id !== filters.platform) return false
      if (filters.campaign !== 'all' && shift.campaign_id !== filters.campaign) return false
      if (filters.role !== 'all' && registration.operational_role !== filters.role) return false
      return true
    })
    .sort((left, right) => {
      const byTime = `${left.shift.date}${left.shift.start_time}`.localeCompare(`${right.shift.date}${right.shift.start_time}`)
      return byTime || left.registration.operational_role.localeCompare(right.registration.operational_role) || left.registration.id.localeCompare(right.registration.id)
    })
}
