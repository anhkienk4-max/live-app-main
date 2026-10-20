import type { Shift } from '@/lib/types/database.types'
import type { ShiftDateWindow } from '@/lib/utils/shiftDateWindow'

export type ShiftListUrlState = {
  dateWindow: ShiftDateWindow
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
  return {
    dateWindow: range === 'upcoming' || range === 'all' ? range : 'recent',
    status: status && shiftStatuses.includes(status) ? status : 'all',
    search: params.get('shifts_search') ?? '',
    descending: params.get('shifts_sort') !== 'asc',
  }
}

export function shiftListUrlValues(state: ShiftListUrlState) {
  return {
    shifts_range: state.dateWindow === 'recent' ? null : state.dateWindow,
    shifts_status: state.status === 'all' ? null : state.status,
    shifts_search: state.search || null,
    shifts_sort: state.descending ? null : 'asc',
    shifts_page: null,
  }
}
