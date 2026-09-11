import { endOfMonth, endOfWeek, format, startOfMonth, startOfWeek } from 'date-fns'
import type { Brand, Campaign, Platform, Shift, ShiftRegistration } from '@/lib/types/database.types'
import { businessLocalDate } from '@/lib/utils/shiftUtils'
import { matchesMultiSelect } from '@/lib/utils/multiSelectFilter'

export type CalendarTimeFilter = 'all' | 'today' | 'current_week' | 'current_month' | 'custom'
export const UNASSIGNED_STUDIO_FILTER = '__unassigned__'

export function effectiveListTimeFilter(
  time: CalendarTimeFilter,
  explicitTime?: CalendarTimeFilter | null,
): CalendarTimeFilter {
  return explicitTime ?? (time === 'all' ? 'current_month' : time)
}

export interface CalendarFilterState {
  brandIds: string[]
  platformIds: string[]
  campaignIds: string[]
  studios: string[]
  statuses: Shift['status'][]
  hostIds: string[]
  supportIds: string[]
  technicalIds: string[]
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

export function getVisibleShiftSelection(
  visibleShifts: readonly Pick<Shift, 'id'>[],
  selectedShiftIds: ReadonlySet<string>,
) {
  const visibleShiftIds = visibleShifts.map(shift => shift.id)
  const selectedVisibleShiftIds = visibleShiftIds.filter(id => selectedShiftIds.has(id))
  const allVisibleSelected = visibleShiftIds.length > 0 && selectedVisibleShiftIds.length === visibleShiftIds.length
  return {
    visibleShiftIds,
    selectedVisibleShiftIds,
    allVisibleSelected,
    partiallySelected: selectedVisibleShiftIds.length > 0 && !allVisibleSelected,
  }
}

export function toggleAllVisibleShiftSelection(
  visibleShifts: readonly Pick<Shift, 'id'>[],
  selectedShiftIds: ReadonlySet<string>,
): Set<string> {
  const { visibleShiftIds, allVisibleSelected } = getVisibleShiftSelection(visibleShifts, selectedShiftIds)
  return new Set(allVisibleSelected ? [] : visibleShiftIds)
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
    if (!matchesMultiSelect(shift.brand_id, filters.brandIds)) return false
    if (!matchesMultiSelect(shift.platform_id, filters.platformIds)) return false
    if (!matchesMultiSelect(shift.campaign_id, filters.campaignIds)) return false
    if (filters.studios.length > 0) {
      const normalizedStudio = normalizeStudio(shift.studio)
      const matchesStudio = filters.studios.some(studio => studio === UNASSIGNED_STUDIO_FILTER
        ? !normalizedStudio
        : normalizedStudio === studio)
      if (!matchesStudio) return false
    }
    if (!matchesMultiSelect(shift.status, filters.statuses)) return false
    if (filters.hostIds.length > 0 && !filters.hostIds.some(userId => roleMatches(shift, 'host', userId, registrations))) return false
    if (filters.supportIds.length > 0 && !filters.supportIds.some(userId => roleMatches(shift, 'support', userId, registrations))) return false
    if (filters.technicalIds.length > 0 && !filters.technicalIds.some(userId => roleMatches(shift, 'technical', userId, registrations))) return false
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
