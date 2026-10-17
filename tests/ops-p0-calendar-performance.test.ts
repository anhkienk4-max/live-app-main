import assert from 'node:assert/strict'
import test from 'node:test'
import { readCalendarWindow } from '../lib/services/calendarWindow.ts'
import { shiftService } from '../lib/services/dataService.ts'
import { createOperationsCollectionHandler } from '../lib/server/operationsCollectionHandler.ts'
import type { ShiftListPage } from '../lib/services/operationsPageService.ts'

const filters = { from: '2026-10-01', to: '2026-10-31' }

function pageResult(page: number, total: number): ShiftListPage {
  const count = Math.max(0, Math.min(50, total - (page - 1) * 50))
  return {
    items: Array.from({ length: count }, (_, index) => ({
      id: 'shift-' + String((page - 1) * 50 + index).padStart(4, '0'),
    })),
    registrations: [{ id: 'registration-' + page }],
    total,
    page,
    pageSize: 50,
    ownerKey: 'admin',
    pendingTotal: 0,
    pendingPage: 1,
    pendingIds: [],
    studios: [],
  } as unknown as ShiftListPage
}

test('Calendar fetches at most two pages concurrently and assembles responses in stable order', async () => {
  const original = shiftService.getCalendarPage
  const calls: number[] = []
  let active = 0
  let maxActive = 0
  shiftService.getCalendarPage = async query => {
    calls.push(query.page)
    assert.equal(query.pageSize, 50)
    active++
    maxActive = Math.max(active, maxActive)
    try {
      await new Promise(resolve => setTimeout(resolve, query.page === 2 ? 16 : query.page === 3 ? 3 : 1))
      return pageResult(query.page, 200)
    } finally {
      active--
    }
  }
  try {
    const result = await readCalendarWindow(filters)
    assert.deepEqual(calls, [1, 2, 3, 4])
    assert.equal(maxActive, 2)
    assert.equal(result.items.length, 200)
    assert.equal(result.registrations.length, 4)
    assert.deepEqual(result.items.map(item => item.id), Array.from({ length: 200 }, (_, index) => 'shift-' + String(index).padStart(4, '0')))
  } finally {
    shiftService.getCalendarPage = original
  }
})

test('Calendar does not return partial data after a truncated page', async () => {
  const original = shiftService.getCalendarPage
  shiftService.getCalendarPage = async query => {
    const result = pageResult(query.page, 100)
    if (query.page === 2) result.items.pop()
    return result
  }
  try {
    await assert.rejects(readCalendarWindow(filters), /CALENDAR_READ_INCOMPLETE/)
  } finally {
    shiftService.getCalendarPage = original
  }
})

test('Calendar fails closed if an overlapping page duplicates a shift', async () => {
  const original = shiftService.getCalendarPage
  shiftService.getCalendarPage = async query => {
    const result = pageResult(query.page, 100)
    if (query.page === 2) result.items[0].id = 'shift-0000'
    return result
  }
  try {
    await assert.rejects(readCalendarWindow(filters), /CALENDAR_COLLECTION_CHANGED/)
  } finally {
    shiftService.getCalendarPage = original
  }
})

test('Calendar cancels without rendering a partial result when the request is aborted', async () => {
  const original = shiftService.getCalendarPage
  const controller = new AbortController()
  shiftService.getCalendarPage = async query => {
    if (query.page === 2) controller.abort()
    return pageResult(query.page, 100)
  }
  try {
    await assert.rejects(readCalendarWindow(filters, controller.signal), /abort/i)
  } finally {
    shiftService.getCalendarPage = original
  }
})

test('Shift listing exposes safe, numeric Server-Timing phases without changing RPC inputs', async () => {
  const calls: Array<{ name: string; args: unknown }> = []
  const GET = createOperationsCollectionHandler({
    resolveUser: async () => ({ id: 'auth', businessUserId: 'actor', systemPermission: 'admin' }),
    createClient: async () => ({
      rpc: async (name: string, args: unknown) => {
        calls.push({ name, args })
        return {
          data: {
            rows: [], registrations: [], total: 0, page: 1, pageSize: 20,
            pendingTotal: 0, pendingPage: 1, pendingIds: [], studios: [],
          },
          error: null,
        }
      },
    }) as never,
  }).GET
  const response = await GET(new Request('https://test.local/api/operations/collection?entity=shifts&page=1&pageSize=20'))
  assert.equal(response.status, 200)
  assert.deepEqual(calls.map(call => call.name), ['get_shift_list_page'])
  const timings = response.headers.get('server-timing') ?? ''
  for (const phase of ['auth', 'shift_rpc', 'staffing', 'total']) {
    assert.match(timings, new RegExp('(?:^|, )' + phase + ';dur=\\d+\\.\\d'))
  }
  assert.doesNotMatch(timings, /actor|auth_user|shift-|brand|filters/)
  assert.equal(response.headers.get('cache-control'), 'private, no-store')
})
