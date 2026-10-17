import { shiftService } from './dataService'
import type { ListFilters, ShiftListPage } from './operationsPageService'

const CALENDAR_PAGE_SIZE = 50
// Bound per-user database pressure while avoiding fully serial month/week reads.
const CALENDAR_PAGE_CONCURRENCY = 2

export async function readCalendarWindow(filters: ListFilters, signal?: AbortSignal): Promise<ShiftListPage> {
  if (!filters.from || !filters.to) throw new Error('CALENDAR_RANGE_REQUIRED')
  signal?.throwIfAborted()

  const first = await shiftService.getCalendarPage({ page: 1, pageSize: CALENDAR_PAGE_SIZE, filters }, signal)
  signal?.throwIfAborted()
  if (!Number.isSafeInteger(first.total) || first.total < 0) throw new Error('CALENDAR_READ_INCOMPLETE')

  const pageCount = Math.max(1, Math.ceil(first.total / CALENDAR_PAGE_SIZE))
  const validatePage = (result: ShiftListPage, page: number) => {
    if (result.page !== page || result.total !== first.total || result.ownerKey !== first.ownerKey) {
      throw new Error('CALENDAR_COLLECTION_CHANGED')
    }
    const expected = Math.min(CALENDAR_PAGE_SIZE, Math.max(0, first.total - (page - 1) * CALENDAR_PAGE_SIZE))
    if (result.items.length !== expected) throw new Error('CALENDAR_READ_INCOMPLETE')
  }
  validatePage(first, 1)

  const pages: ShiftListPage[] = [first]
  for (let nextPage = 2; nextPage <= pageCount; nextPage += CALENDAR_PAGE_CONCURRENCY) {
    signal?.throwIfAborted()
    const batch = Array.from(
      { length: Math.min(CALENDAR_PAGE_CONCURRENCY, pageCount - nextPage + 1) },
      (_, index) => nextPage + index,
    )
    const results = await Promise.all(batch.map(async page => {
      signal?.throwIfAborted()
      const result = await shiftService.getCalendarPage({ page, pageSize: CALENDAR_PAGE_SIZE, filters }, signal)
      signal?.throwIfAborted()
      validatePage(result, page)
      return result
    }))
    // Preserve SQL pagination order regardless of network completion order.
    pages.push(...results)
  }

  const items: ShiftListPage['items'] = []
  const registrations = new Map<string, ShiftListPage['registrations'][number]>()
  const ids = new Set<string>()
  for (const page of pages) {
    signal?.throwIfAborted()
    for (const item of page.items) {
      if (ids.has(item.id)) throw new Error('CALENDAR_COLLECTION_CHANGED')
      ids.add(item.id)
      items.push(item)
    }
    page.registrations.forEach(registration => registrations.set(registration.id, registration))
  }
  if (items.length !== first.total) throw new Error('CALENDAR_READ_INCOMPLETE')
  return { ...first, items, registrations: [...registrations.values()] }
}
