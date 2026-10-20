import { shiftService } from './dataService'
import type { ListFilters, ShiftListPage } from './operationsPageService'

export async function readCalendarWindow(filters: ListFilters, signal?: AbortSignal, onFirstPage?: (first: ShiftListPage) => void): Promise<ShiftListPage> {
  if (!filters.from || !filters.to) throw new Error('CALENDAR_RANGE_REQUIRED')
  let first: ShiftListPage | undefined
  const items: ShiftListPage['items'] = []
  const registrations = new Map<string, ShiftListPage['registrations'][number]>()
  const ids = new Set<string>()
  for (let page = 1; ; page++) {
    signal?.throwIfAborted()
    const result = await shiftService.getCalendarPage({ page, pageSize: 50, filters }, signal)
    first ??= result
    if (page === 1 && result.items.length < result.total && !signal?.aborted) onFirstPage?.(result)
    if (result.page !== page || result.total !== first.total || result.ownerKey !== first.ownerKey) throw new Error('CALENDAR_COLLECTION_CHANGED')
    for (const item of result.items) {
      if (ids.has(item.id)) throw new Error('CALENDAR_COLLECTION_CHANGED')
      ids.add(item.id)
      items.push(item)
    }
    result.registrations.forEach(registration => registrations.set(registration.id, registration))
    if (items.length >= first.total) break
    if (result.items.length !== 50) throw new Error('CALENDAR_READ_INCOMPLETE')
  }
  if (items.length !== first.total) throw new Error('CALENDAR_READ_INCOMPLETE')
  return { ...first, items, registrations: [...registrations.values()] }
}
