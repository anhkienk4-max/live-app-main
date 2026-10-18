import assert from 'node:assert/strict'
import test from 'node:test'
import { createOperationsCollectionHandler } from '@/lib/server/operationsCollectionHandler'
import type { AuthenticatedServerUser } from '@/lib/server/authGuards'

test('Reports candidate API carries exact filters and owner through every authenticated role', async () => {
  for (const systemPermission of ['admin', 'leader', 'member'] as const) {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = []
    const filters = { reportCandidates: true, roles: ['support'], registrationStatuses: ['pending'], search: 'older' }
    const GET = createOperationsCollectionHandler({
      resolveUser: async () => ({ id: 'auth-id', businessUserId: 'business-id', systemPermission }),
      createClient: async () => ({ rpc: async (name: string, args: Record<string, unknown>) => {
        calls.push({ name, args })
        return { error: null, data: name === 'get_shift_list_page' ? { rows: [], registrations: [], total: 0, page: 1, pageSize: 20 } : [] }
      } }) as never,
    }).GET
    const response = await GET(new Request('http://local.test/api?entity=my_shifts&page=5&pageSize=20&filters=' + encodeURIComponent(JSON.stringify(filters))))
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('cache-control'), 'private, no-store')
    assert.equal((await response.json()).ownerKey, 'business-id:' + systemPermission)
    assert.deepEqual(calls[0], { name: 'get_shift_list_page', args: { p_scope: 'mine', p_page: 5, p_page_size: 20, p_filters: filters, p_pending_page: 1, p_include_live: false } })
    const previous = calls.length
    for (const entity of ['open_shifts', 'shifts', 'reports', 'registration_reviews']) {
      assert.equal((await GET(new Request('http://local.test/api?entity=' + entity + '&filters={"reportCandidates":true}'))).status, 400)
    }
    assert.equal(calls.length, previous)
  }
})

test('mock Reports candidates preserve role/status filters on an assigned Member shift', async () => {
  const originalMode = process.env.NODE_ENV
  const originalMock = process.env.NEXT_PUBLIC_USE_MOCK_DATA
  process.env.NODE_ENV = 'development'
  process.env.NEXT_PUBLIC_USE_MOCK_DATA = 'true'
  const { shiftService, currentUserService } = await import('@/lib/services/dataService')
  const originalId = currentUserService.getId
  currentUserService.getId = () => '3'
  try {
    const filters = { search: 'Tech gadgets recap' }
    const host = await shiftService.getRegistrationPage('mine', { page: 1, pageSize: 20, filters: { ...filters, reportCandidates: true, roles: ['host'], registrationStatuses: ['approved'] } })
    assert.equal(host.items.some(shift => shift.id === 's5'), true)
    const wrongRole = await shiftService.getRegistrationPage('mine', { page: 1, pageSize: 20, filters: { ...filters, reportCandidates: true, roles: ['support'] } })
    assert.equal(wrongRole.total, 0)
    const wrongStatus = await shiftService.getRegistrationPage('mine', { page: 1, pageSize: 20, filters: { ...filters, reportCandidates: true, registrationStatuses: ['pending'] } })
    assert.equal(wrongStatus.total, 0)
  } finally {
    currentUserService.getId = originalId
    if (originalMode === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = originalMode
    if (originalMock === undefined) delete process.env.NEXT_PUBLIC_USE_MOCK_DATA; else process.env.NEXT_PUBLIC_USE_MOCK_DATA = originalMock
  }
})

test('Reports candidate API rejects anonymous and malformed candidate flag before DB access', async () => {
  let dbCalls = 0
  for (const user of [null, { id: 'auth', systemPermission: 'member' } as AuthenticatedServerUser]) {
    const GET = createOperationsCollectionHandler({ resolveUser: async () => user, createClient: async () => { dbCalls++; throw new Error('Unexpected DB call') } }).GET
    const response = await GET(new Request('http://local.test/api?entity=my_shifts&filters={"reportCandidates":"true"}'))
    assert.equal(response.status, user ? 400 : 401)
  }
  assert.equal(dbCalls, 0)
})
