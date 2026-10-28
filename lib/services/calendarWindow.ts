import { shiftService } from './dataService'
import type { ListFilters, ShiftListPage } from './operationsPageService'

export async function readCalendarWindow(filters: ListFilters, signal?: AbortSignal, onFirstPage?: (first: ShiftListPage) => void): Promise<ShiftListPage> {
  if (!filters.from || !filters.to) throw new Error('CALENDAR_RANGE_REQUIRED')
  signal?.throwIfAborted()
  const first = await shiftService.getCalendarPage({ page: 1, pageSize: 50, filters }, signal)
  const items: ShiftListPage['items'] = []
  const registrations = new Map<string, ShiftListPage['registrations'][number]>()
  const ids = new Set<string>()
  const acceptPage = (result: ShiftListPage, page: number) => {
    if (result.page !== page || result.total !== first.total || result.ownerKey !== first.ownerKey) throw new Error('CALENDAR_COLLECTION_CHANGED')
    for (const item of result.items) {
      if (ids.has(item.id)) throw new Error('CALENDAR_COLLECTION_CHANGED')
      ids.add(item.id)
      items.push(item)
    }
    result.registrations.forEach(registration => registrations.set(registration.id, registration))
    if (page * 50 < first.total && result.items.length !== 50) throw new Error('CALENDAR_READ_INCOMPLETE')
  }
  acceptPage(first, 1)
  if (first.items.length < first.total && !signal?.aborted) onFirstPage?.(first)
  // Bound parallel reads while preserving page order and completeness checks.
  for (let page = 2; page * 50 - 50 < first.total; page += 3) {
    signal?.throwIfAborted()
    const pages = Array.from({ length: Math.min(3, Math.ceil(first.total / 50) - page + 1) }, (_, index) => page + index)
    const results = await Promise.all(pages.map(next => shiftService.getCalendarPage({ page: next, pageSize: 50, filters }, signal)))
    signal?.throwIfAborted()
    results.forEach((result, index) => acceptPage(result, pages[index]))
  }
  if (items.length !== first.total) throw new Error('CALENDAR_READ_INCOMPLETE')
  return { ...first, items, registrations: [...registrations.values()] }
}
