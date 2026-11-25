import assert from 'node:assert/strict'
import { createPublicKey, generateKeyPairSync, verify } from 'node:crypto'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  canManageShiftLiveLink,
  canViewShiftLiveSession,
  type LiveLinkActor,
} from '../lib/utils/liveStreamLink.ts'
import {
  deterministicShiftMediaPath,
  getPublicMediaJwks,
  signMediaPublishGrant,
  signMediaViewerGrant,
} from '../lib/server/mediaViewerKey.ts'
import {
  createMediaPublisherSessionHandler,
  resetMockMediaSessionsForTests,
} from '../lib/server/mediaPublisherSessionHandler.ts'
import { createGatewayServer } from '../scripts/live-media-gateway-sidecar.mjs'
import type { Shift, ShiftRegistration } from '../lib/types/database.types.ts'

const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
const testSettings = {
  privateKey,
  kid: 'deltac-unit-key',
  appOrigin: 'https://ops5729.top',
  issuer: 'https://ops5729.top',
  mediaOrigin: 'https://media.ops5729.top',
  audience: 'ada-media-monitor' as const,
}

const makeUser = (overrides: Partial<LiveLinkActor>): LiveLinkActor => ({
  id: 'u-default',
  email: 'u@livestream.com',
  full_name: 'Test User',
  role: 'staff',
  system_permission: 'member',
  operational_roles: [],
  status: 'active',
  account_status: 'active',
  join_date: '2026-01-01',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ...overrides,
})

const makeShift = (overrides: Partial<Shift> = {}): Shift => ({
  id: 's1',
  date: '2026-11-24',
  start_time: '09:00',
  end_time: '13:00',
  brand_id: 'b1',
  platform_id: 'p1',
  title: 'TechGear morning live',
  studio: 'Studio A',
  host_id: '3',
  support_id: '5',
  technical_id: '6',
  status: 'live',
  created_at: '2026-11-24T00:00:00Z',
  updated_at: '2026-11-24T00:00:00Z',
  ...overrides,
})

test('C1 permission: assigned Support/Host/Tech, in-scope Leader, and Admin may manage live_link; unassigned Member and out-of-scope Leader cannot', () => {
  const shift = makeShift({ support_id: '5', host_id: '3', technical_id: '6', brand_id: 'b1' })
  const admin = makeUser({ id: '1', role: 'admin', system_permission: 'admin' })
  const leaderB1 = makeUser({ id: '2', role: 'leader', system_permission: 'leader', managed_brand_ids: ['b1'] })
  const leaderB2 = makeUser({ id: '22', role: 'leader', system_permission: 'leader', managed_brand_ids: ['b2'] })
  const assignedSupport = makeUser({ id: '5', role: 'staff', system_permission: 'member', operational_roles: ['support'] })
  const regSupport = makeUser({ id: '55', role: 'staff', system_permission: 'member', operational_roles: ['support'] })
  const unassignedMember = makeUser({ id: '99', role: 'staff', system_permission: 'member', operational_roles: ['support'] })

  assert.equal(canManageShiftLiveLink(admin, shift), true)
  assert.equal(canManageShiftLiveLink(leaderB1, shift), true)
  assert.equal(canManageShiftLiveLink(leaderB2, shift), false)
  assert.equal(canManageShiftLiveLink(assignedSupport, shift), true)
  assert.equal(canManageShiftLiveLink(unassignedMember, shift), false)

  const registrations: Array<Pick<ShiftRegistration, 'shift_id' | 'user_id' | 'status' | 'operational_role'>> = [
    { shift_id: 's1', user_id: '55', status: 'approved', operational_role: 'support' },
    { shift_id: 's1', user_id: '99', status: 'rejected', operational_role: 'support' },
  ]
  assert.equal(canManageShiftLiveLink(regSupport, shift, registrations), true)
  assert.equal(canManageShiftLiveLink(unassignedMember, shift, registrations), false)

  const completed = makeShift({ status: 'completed', support_id: '5' })
  const cancelled = makeShift({ status: 'cancelled', support_id: '5' })
  assert.equal(canManageShiftLiveLink(assignedSupport, completed), false)
  assert.equal(canManageShiftLiveLink(admin, completed), false)
  assert.equal(canManageShiftLiveLink(assignedSupport, cancelled), false)

  // Foreign leader cannot view either; unassigned member cannot view
  assert.equal(canViewShiftLiveSession(leaderB2, shift), false)
  assert.equal(canViewShiftLiveSession(unassignedMember, shift), false)
  assert.equal(canViewShiftLiveSession(leaderB1, shift), true)
})

test('C3 ES256 tokens separate publish vs read permissions and bind strictly to deterministic shift media paths', () => {
  const now = Date.parse('2026-11-24T15:00:00Z')
  const pathA = deterministicShiftMediaPath('s1')
  const pathB = deterministicShiftMediaPath('s2')
  assert.notEqual(pathA, pathB)
  assert.match(pathA, /^[a-z][a-z0-9_]{0,63}$/)

  const pubGrant = signMediaPublishGrant({ settings: testSettings, path: pathA, sub: '5', now })
  const readGrant = signMediaViewerGrant({ settings: testSettings, path: pathA, now })

  const [ph, pp, ps] = pubGrant.token.split('.')
  const [rh, rp, rs] = readGrant.token.split('.')
  const pubClaims = JSON.parse(Buffer.from(pp, 'base64url').toString('utf8'))
  const readClaims = JSON.parse(Buffer.from(rp, 'base64url').toString('utf8'))
  assert.deepEqual(pubClaims.mediamtx_permissions, [{ action: 'publish', path: pathA }])
  assert.deepEqual(readClaims.mediamtx_permissions, [{ action: 'read', path: pathA }])

  const jwk = getPublicMediaJwks(testSettings).keys[0]
  assert.equal(verify('sha256', Buffer.from(`${ph}.${pp}`), { key: createPublicKey({ key: jwk, format: 'jwk' }), dsaEncoding: 'ieee-p1363' }, Buffer.from(ps, 'base64url')), true)
  assert.equal(verify('sha256', Buffer.from(`${rh}.${rp}`), { key: createPublicKey({ key: jwk, format: 'jwk' }), dsaEncoding: 'ieee-p1363' }, Buffer.from(rs, 'base64url')), true)
})

test('C3 handler enforces single active publisher per shift, handover, viewer ACL, room isolation, and lifecycle revocation', async () => {
  resetMockMediaSessionsForTests()
  const now = Date.parse('2026-11-24T15:00:00Z')

  const makeReq = (body: object, actorId?: string, origin = 'https://ops5729.top') =>
    new Request('https://ops5729.top/api/media/publisher-session', {
      method: 'POST',
      headers: {
        origin,
        'content-type': 'application/json',
        ...(actorId ? { 'x-ada-live-actor-id': actorId } : {}),
      },
      body: JSON.stringify(body),
    })

  const handler = createMediaPublisherSessionHandler({
    settings: () => testSettings,
    now: () => now,
    mode: () => 'mock',
    allowLocalMock: () => true,
  })

  // Unauthenticated request denied (401)
  assert.equal((await handler.POST(makeReq({ action: 'start', shiftId: 's1' }))).status, 401)

  // Support (id: '5') starts publishing on s1
  const startS1 = await handler.POST(makeReq({ action: 'start', shiftId: 's1' }, '5'))
  assert.equal(startS1.status, 200)
  const s1Body = await startS1.json()
  assert.equal(s1Body.ok, true)
  assert.equal(s1Body.shiftId, 's1')

  // Duplicate second publisher (Host id: '3') on s1 is blocked with 409 DUPLICATE_ACTIVE_PUBLISHER
  const dupS1 = await handler.POST(makeReq({ action: 'start', shiftId: 's1' }, '3'))
  assert.equal(dupS1.status, 409)
  assert.equal((await dupS1.json()).error.code, 'DUPLICATE_ACTIVE_PUBLISHER')

  // Host (id: '4', unassigned on s1) is denied both publish and viewer access on s1
  const host4Publish = await handler.POST(makeReq({ action: 'start', shiftId: 's1' }, '4'))
  assert.equal(host4Publish.status, 403)
  const host4ViewS1 = await handler.POST(makeReq({ action: 'viewer-grant', shiftId: 's1' }, '4'))
  assert.equal(host4ViewS1.status, 403)

  // Admin (id: '1') & Leader (id: '2') receive authorized viewer grants for s1
  const adminViewS1 = await handler.POST(makeReq({ action: 'viewer-grant', shiftId: 's1' }, '1'))
  assert.equal(adminViewS1.status, 200)
  const adminGrant = await adminViewS1.json()
  assert.equal(adminGrant.mediaPath, s1Body.mediaPath)

  // Concurrent second room s2 by Support (id: '5') works independently with a different mediaPath
  const startS2 = await handler.POST(makeReq({ action: 'start', shiftId: 's2' }, '5'))
  assert.equal(startS2.status, 200)
  const s2Body = await startS2.json()
  assert.notEqual(s2Body.mediaPath, s1Body.mediaPath)

  // Unrelated host4 IS assigned to s2 and receives s2 viewer grant
  const host4ViewS2 = await handler.POST(makeReq({ action: 'viewer-grant', shiftId: 's2' }, '4'))
  assert.equal(host4ViewS2.status, 200)

  // Stopping s1 ends s1 without affecting s2
  const stopS1 = await handler.POST(makeReq({ action: 'stop', shiftId: 's1', sessionId: s1Body.sessionId }, '5'))
  assert.equal(stopS1.status, 200)
  const adminViewS1AfterStop = await handler.POST(makeReq({ action: 'viewer-grant', shiftId: 's1' }, '1'))
  assert.equal(adminViewS1AfterStop.status, 404)
  const adminViewS2AfterS1Stop = await handler.POST(makeReq({ action: 'viewer-grant', shiftId: 's2' }, '1'))
  assert.equal(adminViewS2AfterS1Stop.status, 200)

  // Completing s2 revokes s2 immediately
  await handler.POST(makeReq({ action: 'sync-mock-shift', shiftId: 's2', status: 'completed' }, '1'))
  const host4AfterComplete = await handler.POST(makeReq({ action: 'viewer-grant', shiftId: 's2' }, '4'))
  assert.equal(host4AfterComplete.status, 403)
  resetMockMediaSessionsForTests()
})

test('External Gateway Sidecar verifies ES256 JWKS, blocks cross-room/read->publish escalation, and delivers real frame updates', async () => {
  const jwks = getPublicMediaJwks(testSettings)
  process.env.MEDIA_JWT_PUBLIC_JWKS_JSON = JSON.stringify(jwks)
  const server = createGatewayServer({ expectedIssuer: testSettings.issuer })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', () => resolve()))
  const address = server.address()
  assert.ok(address && typeof address === 'object')
  const baseUrl = `http://127.0.0.1:${address.port}`

  try {
    const now = Date.now()
    const pathA = deterministicShiftMediaPath('room-a')
    const pathB = deterministicShiftMediaPath('room-b')
    const pubA = signMediaPublishGrant({ settings: testSettings, path: pathA, sub: '5', now })
    const readA = signMediaViewerGrant({ settings: testSettings, path: pathA, now })

    const samplePng1 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
    const samplePng2 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

    // Viewer read token cannot publish
    const readCantPublish = await fetch(`${baseUrl}/${pathA}/whip`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${readA.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: 'sess-1', seq: 1, width: 100, height: 100, dataUrl: samplePng1 }),
    })
    assert.equal(readCantPublish.status, 403)

    // Token for room-a cannot access room-b
    const crossRoomDenied = await fetch(`${baseUrl}/${pathB}/whip`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${pubA.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: 'sess-1', seq: 1, width: 100, height: 100, dataUrl: samplePng1 }),
    })
    assert.equal(crossRoomDenied.status, 403)

    // Authorized publisher pushes sequential frames; authorized viewer observes changing frame bytes
    const push1 = await fetch(`${baseUrl}/${pathA}/whip`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${pubA.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: 'sess-1', seq: 1, width: 100, height: 100, dataUrl: samplePng1 }),
    })
    assert.equal(push1.status, 200)

    const view1 = await fetch(`${baseUrl}/${pathA}/frame`, {
      headers: { Authorization: `Bearer ${readA.token}` },
    })
    assert.equal(view1.status, 200)
    assert.equal((await view1.json()).dataUrl, samplePng1)

    // Duplicate concurrent publisher sessionId on pathA rejected with 409
    const dupPush = await fetch(`${baseUrl}/${pathA}/whip`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${pubA.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: 'sess-2', seq: 1, width: 100, height: 100, dataUrl: samplePng2 }),
    })
    assert.equal(dupPush.status, 409)

    // Frame 2 updates frame bytes cleanly
    const push2 = await fetch(`${baseUrl}/${pathA}/whip`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${pubA.token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId: 'sess-1', seq: 2, width: 100, height: 100, dataUrl: samplePng2 }),
    })
    assert.equal(push2.status, 200)
    const view2 = await fetch(`${baseUrl}/${pathA}/frame`, {
      headers: { Authorization: `Bearer ${readA.token}` },
    })
    assert.equal((await view2.json()).dataUrl, samplePng2)

    // Ending stream clears frames immediately
    const del = await fetch(`${baseUrl}/${pathA}/whip`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${pubA.token}` },
    })
    assert.equal(del.status, 200)
    const viewAfterEnd = await fetch(`${baseUrl}/${pathA}/frame`, {
      headers: { Authorization: `Bearer ${readA.token}` },
    })
    assert.equal(viewAfterEnd.status, 404)
  } finally {
    delete process.env.MEDIA_JWT_PUBLIC_JWKS_JSON
    await new Promise<void>(resolve => server.close(() => resolve()))
  }
})

test('C2 app-shell layout mounts persistent LiveTabPublisherProvider above LiveStreamPanel lifecycle', () => {
  const layout = readFileSync('app/(dashboard)/layout.tsx', 'utf8')
  const capture = readFileSync('components/features/live/LiveTabCapture.tsx', 'utf8')
  const context = readFileSync('components/features/live/LiveTabPublisherContext.tsx', 'utf8')
  assert.match(layout, /LiveTabPublisherProvider/)
  assert.match(context, /data-testid="persistent-live-sharing-banner"/)
  assert.match(context, /data-testid="return-to-shared-shift"/)
  assert.match(context, /data-testid="global-stop-tab-capture"/)
  assert.match(capture, /useOptionalLiveTabPublisher/)
  assert.match(capture, /!persistentManagedRef\.current/)
})
