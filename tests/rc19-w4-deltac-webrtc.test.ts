import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { generateKeyPairSync, sign as signEs256 } from 'node:crypto'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { createGatewayServer } from '@/scripts/live-media-gateway-sidecar.mjs'
import {
  generateSyntheticSdpOffer,
  isWebRtcSupported,
  publishWhipSession,
  subscribeWhepSession,
} from '@/lib/media/webrtcClient'

describe('RC19 W4 Delta C: WebRTC WHIP/WHEP Protocol Contracts', () => {
  it('isWebRtcSupported reports false in Node environment without global window', () => {
    assert.equal(isWebRtcSupported(), false)
  })

  it('publishWhipSession and subscribeWhepSession fail-closed when WebRTC is unsupported', async () => {
    await assert.rejects(
      async () =>
        publishWhipSession({
          stream: {} as MediaStream,
          whipUrl: 'http://127.0.0.1:8889/shift_test/whip',
          token: 'mock-token',
        }),
      /WEBRTC_UNSUPPORTED/,
    )

    await assert.rejects(
      async () =>
        subscribeWhepSession({
          whepUrl: 'http://127.0.0.1:8889/shift_test/whep',
          token: 'mock-token',
          onTrack: () => undefined,
        }),
      /WEBRTC_UNSUPPORTED/,
    )
  })

  it('generateSyntheticSdpOffer produces RFC-compliant SDP with bundle, video and audio m-lines', () => {
    const sdpWithAudio = generateSyntheticSdpOffer({ includeAudio: true })
    assert.ok(sdpWithAudio.includes('v=0'))
    assert.ok(sdpWithAudio.includes('m=video 9 UDP/TLS/RTP/SAVPF 96'))
    assert.ok(sdpWithAudio.includes('m=audio 9 UDP/TLS/RTP/SAVPF 111'))
    assert.ok(sdpWithAudio.includes('a=group:BUNDLE 0 1'))
    assert.ok(sdpWithAudio.includes('a=ice-ufrag:'))
    assert.ok(sdpWithAudio.includes('a=fingerprint:sha-256'))

    const sdpNoAudio = generateSyntheticSdpOffer({ includeAudio: false })
    assert.ok(sdpNoAudio.includes('m=video 9 UDP/TLS/RTP/SAVPF 96'))
    assert.ok(!sdpNoAudio.includes('m=audio 9'))
    assert.ok(sdpNoAudio.includes('a=group:BUNDLE 0'))
  })

  it('Gateway Sidecar verifies real SDP negotiation for WHIP ingest and WHEP egress with JWT guards', async () => {
    const kp = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
    const kid = 'deltac-webrtc-test'
    const jwk = { ...kp.publicKey.export({ format: 'jwk' }), kid, use: 'sig', alg: 'ES256' }

    const jwksServer = createServer((req, res) => {
      if (req.url === '/jwks') {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ keys: [jwk] }))
        return
      }
      res.writeHead(404).end()
    })

    jwksServer.listen(0, '127.0.0.1')
    await once(jwksServer, 'listening')
    const jwksPort = (jwksServer.address() as { port: number }).port

    const gateway = createGatewayServer({
      expectedIssuer: 'https://ops5729.top',
      expectedAudience: 'ada-media-monitor',
      jwksUrl: `http://127.0.0.1:${jwksPort}/jwks`,
    })

    gateway.listen(0, '127.0.0.1')
    await once(gateway, 'listening')
    const gatewayPort = (gateway.address() as { port: number }).port

    const signToken = (action: 'publish' | 'read', path: string, delta = 90) => {
      const now = Math.floor(Date.now() / 1000)
      const enc = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url')
      const header = enc({ alg: 'ES256', typ: 'JWT', kid })
      const payload = enc({
        iss: 'https://ops5729.top',
        aud: 'ada-media-monitor',
        sub: 'usr_actor_01',
        iat: now,
        nbf: now - 1,
        exp: now + delta,
        mediamtx_permissions: [{ action, path }],
      })
      const message = `${header}.${payload}`
      const signature = signEs256('sha256', Buffer.from(message), {
        key: kp.privateKey,
        dsaEncoding: 'ieee-p1363',
      }).toString('base64url')
      return `${message}.${signature}`
    }

    try {
      const roomPath = 'shift_webrtc_01'
      const sdpOffer = generateSyntheticSdpOffer({ includeAudio: true })

      // 1. Negative: Unauthorized WHIP POST (no token) -> 401
      const resNoAuth = await fetch(`http://127.0.0.1:${gatewayPort}/${roomPath}/whip`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/sdp' },
        body: sdpOffer,
      })
      assert.equal(resNoAuth.status, 401)

      // 2. Negative: Wrong permission (read token on WHIP publish) -> 403
      const readToken = signToken('read', roomPath)
      const resWrongAction = await fetch(`http://127.0.0.1:${gatewayPort}/${roomPath}/whip`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/sdp',
          Authorization: `Bearer ${readToken}`,
        },
        body: sdpOffer,
      })
      assert.equal(resWrongAction.status, 403)

      // 3. Positive: Authorized WHIP POST with SDP offer -> 201 Created with SDP Answer & Location header
      const pubToken = signToken('publish', roomPath)
      const resWhip = await fetch(`http://127.0.0.1:${gatewayPort}/${roomPath}/whip`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/sdp',
          Authorization: `Bearer ${pubToken}`,
        },
        body: sdpOffer,
      })
      assert.equal(resWhip.status, 201)
      assert.equal(resWhip.headers.get('content-type'), 'application/sdp')
      const location = resWhip.headers.get('location')
      assert.ok(location?.includes(`/${roomPath}/whip/`))
      const answerSdp = await resWhip.text()
      assert.ok(answerSdp.includes('v=0'))
      assert.ok(answerSdp.includes('m=video'))
      assert.ok(answerSdp.includes('m=audio'))
      assert.ok(answerSdp.includes('a=setup:active'))

      // 4. Duplicate publisher guard: Second WHIP on same room -> 409
      const pubToken2 = signToken('publish', roomPath)
      const resDup = await fetch(`http://127.0.0.1:${gatewayPort}/${roomPath}/whip`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/sdp',
          Authorization: `Bearer ${pubToken2}`,
        },
        body: sdpOffer,
      })
      assert.equal(resDup.status, 409)

      // 5. Positive: WHEP Egress for Viewer with read token -> 201 Created with SDP Answer & Location
      const resWhep = await fetch(`http://127.0.0.1:${gatewayPort}/${roomPath}/whep`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/sdp',
          Authorization: `Bearer ${readToken}`,
        },
        body: sdpOffer,
      })
      assert.equal(resWhep.status, 201)
      assert.equal(resWhep.headers.get('content-type'), 'application/sdp')
      assert.ok(resWhep.headers.get('location')?.includes(`/${roomPath}/whep/`))

      // 6. Second Independent Viewer connects simultaneously -> 201 Created
      const readTokenViewer2 = signToken('read', roomPath)
      const resWhep2 = await fetch(`http://127.0.0.1:${gatewayPort}/${roomPath}/whep`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/sdp',
          Authorization: `Bearer ${readTokenViewer2}`,
        },
        body: sdpOffer,
      })
      assert.equal(resWhep2.status, 201)

      // 7. Isolation: Viewer attempting to read unstarted room -> 404
      const otherRoomToken = signToken('read', 'shift_other_room')
      const resWhepOther = await fetch(`http://127.0.0.1:${gatewayPort}/shift_other_room/whep`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/sdp',
          Authorization: `Bearer ${otherRoomToken}`,
        },
        body: sdpOffer,
      })
      assert.equal(resWhepOther.status, 404)

      // 8. Teardown: DELETE on WHIP location -> 200, then WHEP returns 404
      const resDelete = await fetch(`http://127.0.0.1:${gatewayPort}/${roomPath}/whip`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${pubToken}`,
        },
      })
      assert.equal(resDelete.status, 200)

      const resAfterDelete = await fetch(`http://127.0.0.1:${gatewayPort}/${roomPath}/whep`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/sdp',
          Authorization: `Bearer ${readToken}`,
        },
        body: sdpOffer,
      })
      assert.equal(resAfterDelete.status, 404)
    } finally {
      gateway.close()
      jwksServer.close()
    }
  })
})
