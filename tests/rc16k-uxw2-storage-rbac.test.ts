import assert from 'node:assert/strict'
import test from 'node:test'

import { createOperationalFileRouteHandler } from '@/lib/server/operationalFileRouteHandler'
import { createOperationalStorageSetupHandler } from '@/lib/server/operationalStorageSetupHandler'
import { filterNav, getNavigationForRole } from '@/lib/ui/role-ux'

test('Operational Storage navigation is available to Admin and Leader but never Member', () => {
  for (const role of ['admin', 'leader', 'member'] as const) {
    const user = { role: role === 'member' ? 'staff' as const : role, system_permission: role }
    const nav = filterNav(getNavigationForRole(role), user)
    assert.equal(nav.some(item => item.href === '/storage'), role !== 'member')
    assert.equal(nav.some(item => item.href === '/storage/setup'), false)
  }
})

test('Storage GET/POST/DELETE and setup GET/POST deny Member before any DB write or read', async () => {
  let databaseAccesses = 0
  const forbiddenDatabase = (() => {
    databaseAccesses += 1
    throw new Error('Storage Member must not touch the database')
  }) as never
  const identity = async () => ({
    id: 'member-auth-id', businessUserId: 'member-business-id', systemPermission: 'member' as const,
  })
  const files = createOperationalFileRouteHandler({
    resolveUser: identity, createClient: forbiddenDatabase,
  })
  const setup = createOperationalStorageSetupHandler({
    resolveUser: identity, createClient: forbiddenDatabase,
  })
  const base = 'https://app.example.test/api/'
  const post = (url: string) => new Request(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'prepare_folder' }),
  })
  const deletion = new Request(base + 'operational-files', {
    method: 'DELETE', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file_id: 'file-1' }),
  })
  const responses = await Promise.all([
    files.GET(new Request(base + 'operational-files?catalog=1')),
    files.GET(new Request(base + 'operational-files?file_id=file-1')),
    files.GET(new Request(base + 'operational-files?brand_id=x&platform_id=y&period_date=2026-10-14')),
    files.POST(post(base + 'operational-files')),
    files.DELETE(deletion),
    setup.GET(new Request(base + 'operational-storage-setup')),
    setup.POST(post(base + 'operational-storage-setup')),
  ])
  for (const response of responses) {
    assert.equal(response.status, 403)
    const body = await response.json() as { error?: { code?: string } }
    assert.equal(body.error?.code, 'PERMISSION_DENIED')
  }
  assert.equal(databaseAccesses, 0)
})

test('Unauthenticated Storage routes return 401 rather than exposing a file list', async () => {
  const files = createOperationalFileRouteHandler({ resolveUser: async () => null })
  const setup = createOperationalStorageSetupHandler({ resolveUser: async () => null })
  const base = 'https://app.example.test/api/'
  const responses = await Promise.all([
    files.GET(new Request(base + 'operational-files?catalog=1')),
    setup.GET(new Request(base + 'operational-storage-setup')),
  ])
  for (const response of responses) assert.equal(response.status, 401)
})
