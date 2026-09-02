import { endOfMonth, endOfWeek, format, startOfMonth, startOfWeek } from 'date-fns'
import type { Brand, Campaign, Platform, Shift, ShiftRegistration } from '@/lib/types/database.types'
import { businessLocalDate } from '@/lib/utils/shiftUtils'

export type CalendarTimeFilter = 'all' | 'today' | 'current_week' | 'current_month' | 'custom'
export const UNASSIGNED_STUDIO_FILTER = '__unassigned__'

export interface CalendarFilterState {
  brand: string
  platform: string
  campaign: string
  studio: string
  status: string
  host: string
  support: string
  technical: string
  time: CalendarTimeFilter
  customFrom: string
  customTo: string
}

export interface CalendarTimeScope {
  from?: string
  to?: string
  valid: boolean
  error?: string
}

export interface CalendarFilterContext {
  currentDate: Date
  today?: string
  brands?: Brand[]
  platforms?: Platform[]
  campaigns?: Campaign[]
  registrations?: ShiftRegistration[]
}

export interface StudioFilterOption {
  value: string
  label: string
}

export function normalizeStudio(value: unknown): string {
  return String(value ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ').toLowerCase()
}

export function displayStudio(value: unknown): string {
  return String(value ?? '').normalize('NFKC').trim().replace(/\s+/g, ' ')
}

export function buildStudioFilterOptions(shifts: Shift[]): StudioFilterOption[] {
  const options = new Map<string, string>()
  shifts.forEach(shift => {
    const normalized = normalizeStudio(shift.studio)
    if (!normalized) return
    if (!options.has(normalized)) options.set(normalized, displayStudio(shift.studio))
  })
  return [
    ...[...options.entries()]
      .sort((left, right) => left[1].localeCompare(right[1]))
      .map(([value, label]) => ({ value, label })),
    { value: UNASSIGNED_STUDIO_FILTER, label: 'Unassigned' },
  ]
}

export function calendarTimeScope(
  filter: CalendarTimeFilter,
  currentDate: Date,
  customFrom = '',
  customTo = '',
  today = businessLocalDate(),
): CalendarTimeScope {
  if (filter === 'all') return { valid: true }
  if (filter === 'today') return { from: today, to: today, valid: true }
  if (filter === 'current_week') {
    return {
      from: format(startOfWeek(currentDate), 'yyyy-MM-dd'),
      to: format(endOfWeek(currentDate), 'yyyy-MM-dd'),
      valid: true,
    }
  }
  if (filter === 'current_month') {
    return {
      from: format(startOfMonth(currentDate), 'yyyy-MM-dd'),
      to: format(endOfMonth(currentDate), 'yyyy-MM-dd'),
      valid: true,
    }
  }
  if (!customFrom || !customTo) {
    return { valid: false, error: 'Custom time range requires both a start and end date.' }
  }
  if (customFrom > customTo) {
    return { valid: false, error: 'Custom time range start date must be on or before the end date.' }
  }
  return { from: customFrom, to: customTo, valid: true }
}

function roleMatches(
  shift: Shift,
  role: 'host' | 'support' | 'technical',
  userId: string,
  registrations: ShiftRegistration[],
): boolean {
  const assignment = role === 'host' ? shift.host_id : role === 'support' ? shift.support_id : shift.technical_id
  return assignment === userId || registrations.some(registration =>
    registration.shift_id === shift.id &&
    registration.user_id === userId &&
    registration.operational_role === role &&
    (registration.status === 'approved' || registration.status === 'manually_assigned'),
  )
}

export function filterCalendarShifts(
  shifts: Shift[],
  filters: CalendarFilterState,
  searchTerm: string,
  context: CalendarFilterContext,
): Shift[] {
  const scope = calendarTimeScope(filters.time, context.currentDate, filters.customFrom, filters.customTo, context.today)
  if (!scope.valid) return []
  const registrations = context.registrations ?? []
  const brands = context.brands ?? []
  const platforms = context.platforms ?? []
  const search = searchTerm.toLowerCase()

  return shifts.filter(shift => {
    if (scope.from && shift.date < scope.from) return false
    if (scope.to && shift.date > scope.to) return false
    if (filters.brand !== 'all' && shift.brand_id !== filters.brand) return false
    if (filters.platform !== 'all' && shift.platform_id !== filters.platform) return false
    if (filters.campaign !== 'all' && shift.campaign_id !== filters.campaign) return false
    if (filters.studio !== 'all') {
      if (filters.studio === UNASSIGNED_STUDIO_FILTER) {
        if (normalizeStudio(shift.studio)) return false
      } else if (normalizeStudio(shift.studio) !== filters.studio) return false
    }
    if (filters.status !== 'all' && shift.status !== filters.status) return false
    if (filters.host !== 'all' && !roleMatches(shift, 'host', filters.host, registrations)) return false
    if (filters.support !== 'all' && !roleMatches(shift, 'support', filters.support, registrations)) return false
    if (filters.technical !== 'all' && !roleMatches(shift, 'technical', filters.technical, registrations)) return false
    if (search) {
      const brand = brands.find(item => item.id === shift.brand_id)?.name ?? ''
      const platform = platforms.find(item => item.id === shift.platform_id)?.name ?? ''
      const haystack = [brand, platform, shift.product_notes]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
      if (!haystack.includes(search)) return false
    }
    return true
  })
}
