import type { Shift } from '@/lib/types/database.types'
import { shiftDateWindowFilters, type ShiftDateWindow } from '@/lib/utils/shiftDateWindow'

export type ShiftListUrlState = {
  dateWindow: ShiftDateWindow
  month: string
  from: string
  to: string
  status: Shift['status'] | 'all'
  search: string
  descending: boolean
}

const shiftStatuses: readonly (Shift['status'] | 'all')[] = [
  'all', 'scheduled', 'preparing', 'live', 'paused', 'completed', 'cancelled',
]

export function readShiftListUrlState(params: Pick<URLSearchParams, 'get'>): ShiftListUrlState {
  const range = params.get('shifts_range')
  const status = params.get('shifts_status') as Shift['status'] | 'all' | null
  const month = params.get('shifts_month') ?? ''
  const from = params.get('shifts_from') ?? ''
  const to = params.get('shifts_to') ?? ''
  let dateWindow: ShiftDateWindow = range === 'upcoming' || range === 'all' || range === 'month' || range === 'custom' ? range : 'recent'
  if (dateWindow === 'month' || dateWindow === 'custom') {
    try { shiftDateWindowFilters(dateWindow, new Date(), month, from, to) }
    catch { dateWindow = 'recent' }
  }
  return {
    dateWindow,
    month: dateWindow === 'month' ? month : '',
    from: dateWindow === 'custom' ? from : '',
    to: dateWindow === 'custom' ? to : '',
    status: status && shiftStatuses.includes(status) ? status : 'all',
    search: params.get('shifts_search') ?? '',
    descending: params.get('shifts_sort') !== 'asc',
  }
}

export function shiftListUrlValues(state: ShiftListUrlState) {
  return {
    shifts_range: state.dateWindow === 'recent' ? null : state.dateWindow,
    shifts_month: state.dateWindow === 'month' ? state.month : null,
    shifts_from: state.dateWindow === 'custom' ? state.from : null,
    shifts_to: state.dateWindow === 'custom' ? state.to : null,
    shifts_status: state.status === 'all' ? null : state.status,
    shifts_search: state.search || null,
    shifts_sort: state.descending ? null : 'asc',
    shifts_page: null,
  }
}
