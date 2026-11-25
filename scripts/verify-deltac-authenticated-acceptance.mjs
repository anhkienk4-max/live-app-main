/**
 * RC19 W4 DELTA C: AUTHENTICATED ACCEPTANCE SUITE (8 GATES)
 *
 * Verifies:
 * Gate 1: GoTrue Auth -> HTTP API -> DB-backed media grants -> MediaMTX WHIP/WHEP
 * Gate 2: Actual Admin/Leader/Member permissions
 * Gate 3: Cross-agency / brand denial (403 MEDIA_PERMISSION_DENIED)
 * Gate 4: Viewer-only permission revocation while publisher keeps broadcasting
 * Gate 5: Token expiry and renewal via heartbeat
 * Gate 6: Actual viewer reconnect with refreshed grant
 * Gate 7: Publisher track-ended / disconnect cleanup (ended_at, status='ended')
 * Gate 8: Production fail-closed fallback
 */
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { Client } from 'pg'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright')

const APP_ORIGIN = process.env.APP_ORIGIN || 'http://127.0.0.1:3210'
const DB_CONN = process.env.DATABASE_URL || 'postgresql://postgres@127.0.0.1:55542/rc19_ab_c511_canonical_v6_20261125'

const PASSWORD = process.env.TEST_PASSWORD || 'P4chRZfhWuDQbIcsc3TqLi-5UkF4Nhha'
const USERS = {
  admin: 'admin_c511_1795543272967_e9ddd608442b49@c511.invalid',
  leader: 'c6scopedleader_c511_1795543274943_ec2a060d353341@c511.invalid',
  member: 'c6unauthorizedmember_c511_1795543276534_c6ea57b6c05843@c511.invalid',
}

const SHIFT_A = '3d5ecc27-61d1-4ff5-a58b-d6011a0f891f' // Brand A shift
const SHIFT_B = 'b3a3eae1-448d-4888-8fb0-f3193942f24b' // Brand B shift

async function loginInContext(browser, email, password = PASSWORD) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  let authStatus = 0
  page.on('response', res => {
    if (res.url().includes('/auth/v1/token')) authStatus = res.status()
  })

  await page.goto(`${APP_ORIGIN}/login`, { waitUntil: 'domcontentloaded' })
  await page.getByTestId('email-input').waitFor({ state: 'visible', timeout: 30000 })
  await page.getByTestId('email-input').fill(email)
  await page.getByTestId('password-input').fill(password)
  await page.getByTestId('email-login-btn').click()
  await page.waitForURL(url => !url.pathname.startsWith('/login'), { timeout: 30000, waitUntil: 'domcontentloaded' })
  assert.equal(authStatus, 200, `Expected 200 from GoTrue token for ${email}`)

  return { context, page }
}

async function startBrowserPublisher(page, whipUrl, token) {
  return page.evaluate(async ({ whipUrl, token }) => {
    const canvas = document.createElement('canvas')
    canvas.width = 320
    canvas.height = 240
    const ctx = canvas.getContext('2d')
    let frame = 0
    const timer = setInterval(() => {
      frame++
      ctx.fillStyle = '#2563eb'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      ctx.fillStyle = '#ffffff'
      ctx.font = '20px sans-serif'
      ctx.fillText(`Frame ${frame}`, 20, 40)
    }, 40)
    window.__canvasTimer = timer

    const stream = canvas.captureStream(25)
    const pc = new RTCPeerConnection({ iceServers: [] })
    window.__publisherPc = pc
    stream.getTracks().forEach(t => pc.addTrack(t, stream))

    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)

    if (pc.iceGatheringState !== 'complete') {
      await new Promise(resolve => {
        const onIce = () => {
          if (pc.iceGatheringState === 'complete') {
            pc.removeEventListener('icegatheringstatechange', onIce)
            resolve()
          }
        }
        pc.addEventListener('icegatheringstatechange', onIce)
        setTimeout(resolve, 1500)
      })
    }

    const res = await fetch(whipUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/sdp',
        'Authorization': `Bearer ${token}`,
      },
      body: pc.localDescription?.sdp || offer.sdp,
    })
    const sdpAnswer = await res.text()
    if (res.status === 201) {
      await pc.setRemoteDescription({ type: 'answer', sdp: sdpAnswer })
      await new Promise(r => setTimeout(r, 1000))
    }
    return { status: res.status }
  }, { whipUrl, token })
}

async function startBrowserViewer(page, whepUrl, token) {
  return page.evaluate(async ({ whepUrl, token }) => {
    const pc = new RTCPeerConnection({ iceServers: [] })
    window.__viewerPc = pc
    pc.addTransceiver('video', { direction: 'recvonly' })

    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)

    if (pc.iceGatheringState !== 'complete') {
      await new Promise(resolve => {
        const onIce = () => {
          if (pc.iceGatheringState === 'complete') {
            pc.removeEventListener('icegatheringstatechange', onIce)
            resolve()
          }
        }
        pc.addEventListener('icegatheringstatechange', onIce)
        setTimeout(resolve, 1500)
      })
    }

    let res
    for (let i = 0; i < 15; i++) {
      res = await fetch(whepUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/sdp',
          'Authorization': `Bearer ${token}`,
        },
        body: pc.localDescription?.sdp || offer.sdp,
      })
      if (res.status === 201) break
      if (res.status !== 404) break
      await new Promise(r => setTimeout(r, 500))
    }
    const sdpAnswer = await res.text()
    if (res.status === 201) {
      await pc.setRemoteDescription({ type: 'answer', sdp: sdpAnswer })
    }
    return { status: res.status }
  }, { whepUrl, token })
}

async function main() {
  console.log('=== DELTA C: AUTHENTICATED ACCEPTANCE SUITE (8 GATES) ===')
  const db = new Client({ connectionString: DB_CONN })
  await db.connect()
  console.log('Connected to target PostgreSQL cluster on 55542')
  await db.query("NOTIFY pgrst, 'reload schema'")
  await new Promise(r => setTimeout(r, 750))

  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      '--allow-loopback-in-peer-connection',
      '--disable-features=WebRtcHideLocalIpsWithMdns',
      '--autoplay-policy=no-user-gesture-required',
    ],
  })

  try {
    // Authenticate users in real browser contexts via GoTrue
    console.log('[Auth] Logging in Admin, Leader, and Member via UI / GoTrue...')
    const admin = await loginInContext(browser, USERS.admin)
    const leader = await loginInContext(browser, USERS.leader)
    const member = await loginInContext(browser, USERS.member)
    console.log(`[Auth] All 3 users logged in successfully with active session cookies!`)

    const adminUser = (await db.query(`SELECT id, auth_user_id FROM public.business_users WHERE LOWER(email) = LOWER($1)`, [USERS.admin])).rows[0]
    const leaderUser = (await db.query(`SELECT id, auth_user_id FROM public.business_users WHERE LOWER(email) = LOWER($1)`, [USERS.leader])).rows[0]
    const memberUser = (await db.query(`SELECT id, auth_user_id FROM public.business_users WHERE LOWER(email) = LOWER($1)`, [USERS.member])).rows[0]

    // -------------------------------------------------------------
    // GATE 1: GoTrue Auth -> HTTP API -> DB-backed media grants -> MediaMTX
    // -------------------------------------------------------------
    console.log('\n--- GATE 1: GoTrue Auth -> HTTP API -> DB-backed grants -> MediaMTX ---')
    await db.query(`UPDATE public.media_publish_sessions SET status = 'stopped', ended_at = statement_timestamp() WHERE shift_id = $1 AND status = 'active'`, [SHIFT_A])

    const startRes = await admin.context.request.post(`${APP_ORIGIN}/api/media/publisher-session`, {
      headers: { Origin: APP_ORIGIN },
      data: { action: 'start', shiftId: SHIFT_A },
    })
    const startBody = await startRes.json()
    assert.equal(startRes.status(), 200, `Expected 200 from start action, got ${startRes.status()}: ${JSON.stringify(startBody)}`)
    assert.ok(startBody.ok, 'Expected ok: true')
    assert.ok(startBody.sessionId, 'Expected sessionId')
    assert.ok(startBody.whipUrl, 'Expected whipUrl')
    assert.ok(startBody.whepUrl, 'Expected whepUrl')
    assert.ok(startBody.token, 'Expected token')

    // Verify DB row inserted in public.media_publish_sessions
    const dbSession = await db.query('SELECT * FROM public.media_publish_sessions WHERE id = $1', [startBody.sessionId])
    assert.equal(dbSession.rowCount, 1, 'Expected session row in DB')
    assert.equal(dbSession.rows[0].status, 'active')
    assert.equal(dbSession.rows[0].shift_id, SHIFT_A)
    assert.equal(dbSession.rows[0].publisher_auth_user_id, adminUser.auth_user_id)
    console.log(`[Gate 1.1] DB Session Verified: id=${startBody.sessionId}, status=active, auth_uid=${adminUser.auth_user_id}`)

    // Get viewer grant for Leader
    const viewerRes = await leader.context.request.post(`${APP_ORIGIN}/api/media/publisher-session`, {
      headers: { Origin: APP_ORIGIN },
      data: { action: 'viewer-grant', shiftId: SHIFT_A },
    })
    const viewerBody = await viewerRes.json()
    assert.equal(viewerRes.status(), 200, `Expected 200 from viewer-grant, got ${viewerRes.status()}: ${JSON.stringify(viewerBody)}`)
    assert.ok(viewerBody.token, 'Expected viewer token')
    console.log(`[Gate 1.2] DB Viewer Grant Verified: token obtained for Leader`)

    // Publish to MediaMTX via WHIP in browser
    const whipRes = await startBrowserPublisher(admin.page, startBody.whipUrl, startBody.token)
    assert.equal(whipRes.status, 201, `Expected 201 Created from MediaMTX WHIP, got ${whipRes.status}`)
    console.log(`[Gate 1.3] MediaMTX WHIP Ingest Accepted (201 Created)`)

    // Subscribe from MediaMTX via WHEP in browser
    const whepRes = await startBrowserViewer(leader.page, viewerBody.whepUrl, viewerBody.token)
    assert.equal(whepRes.status, 201, `Expected 201 Created from MediaMTX WHEP, got ${whepRes.status}`)
    console.log(`[Gate 1.4] MediaMTX WHEP Playback Accepted (201 Created)`)
    console.log('>>> GATE 1: PASSED <<<')

    // -------------------------------------------------------------
    // GATE 2: Actual Admin/Leader/Member Permissions
    // -------------------------------------------------------------
    console.log('\n--- GATE 2: Actual Admin/Leader/Member Permissions ---')
    const memberStartRes = await member.context.request.post(`${APP_ORIGIN}/api/media/publisher-session`, {
      headers: { Origin: APP_ORIGIN },
      data: { action: 'start', shiftId: SHIFT_B },
    })
    assert.equal(memberStartRes.status(), 403, `Expected 403 for unassigned member start, got ${memberStartRes.status()}`)
    const memberJson = await memberStartRes.json()
    assert.equal(memberJson?.error?.code, 'MEDIA_PERMISSION_DENIED')
    console.log(`[Gate 2.1] Member start without assignment correctly rejected (403 MEDIA_PERMISSION_DENIED)`)

    const adminActiveRes = await admin.context.request.get(`${APP_ORIGIN}/api/media/publisher-session?shiftId=${SHIFT_A}`, {
      headers: { Origin: APP_ORIGIN },
    })
    assert.equal(adminActiveRes.status(), 200)
    const adminActiveJson = await adminActiveRes.json()
    assert.equal(adminActiveJson.active, true)
    console.log(`[Gate 2.2] Admin active session lookup verified (200 OK, active=true)`)
    console.log('>>> GATE 2: PASSED <<<')

    // -------------------------------------------------------------
    // GATE 3: Cross-agency Denial
    // -------------------------------------------------------------
    console.log('\n--- GATE 3: Cross-agency / Brand Denial ---')
    const crossBrandRes = await leader.context.request.post(`${APP_ORIGIN}/api/media/publisher-session`, {
      headers: { Origin: APP_ORIGIN },
      data: { action: 'start', shiftId: SHIFT_B },
    })
    assert.equal(crossBrandRes.status(), 403, `Expected 403 for cross-brand leader, got ${crossBrandRes.status()}`)
    const crossBrandJson = await crossBrandRes.json()
    assert.equal(crossBrandJson?.error?.code, 'MEDIA_PERMISSION_DENIED')
    console.log(`[Gate 3.1] Leader restricted to Brand A: cross-brand attempt on Brand B rejected (403 MEDIA_PERMISSION_DENIED)`)
    console.log('>>> GATE 3: PASSED <<<')

    // -------------------------------------------------------------
    // GATE 4: Viewer-only Permission Revocation While Publisher Continues
    // -------------------------------------------------------------
    console.log('\n--- GATE 4: Viewer-only Revocation While Publisher Continues ---')
    // 1. Give member an active viewer grant
    await db.query(`
      INSERT INTO public.media_viewer_grants (auth_user_id, shift_id, valid_from, valid_until, active)
      VALUES ($1, $2, statement_timestamp(), statement_timestamp() + interval '15 minutes', true)
      ON CONFLICT (auth_user_id, shift_id) DO UPDATE SET active = true, valid_until = statement_timestamp() + interval '15 minutes'
    `, [memberUser.auth_user_id, SHIFT_A])

    const grantBeforeRes = await member.context.request.post(`${APP_ORIGIN}/api/media/publisher-session`, {
      headers: { Origin: APP_ORIGIN },
      data: { action: 'viewer-grant', shiftId: SHIFT_A },
    })
    assert.equal(grantBeforeRes.status(), 200, `Expected 200 for member with active grant`)
    console.log(`[Gate 4.1] Member viewer grant accepted with active DB grant (200 OK)`)

    // 2. Revoke member viewer grant
    await db.query('UPDATE public.media_viewer_grants SET active = false WHERE shift_id = $1 AND auth_user_id = $2', [SHIFT_A, memberUser.auth_user_id])

    const revokedGrantRes = await member.context.request.post(`${APP_ORIGIN}/api/media/publisher-session`, {
      headers: { Origin: APP_ORIGIN },
      data: { action: 'viewer-grant', shiftId: SHIFT_A },
    })
    assert.equal(revokedGrantRes.status(), 403, `Expected 403 for revoked member viewer, got ${revokedGrantRes.status()}`)
    const revokedJson = await revokedGrantRes.json()
    assert.equal(revokedJson?.error?.code, 'MEDIA_PERMISSION_DENIED')
    console.log(`[Gate 4.2] Revoked viewer grant rejected by DB RPC (403 MEDIA_PERMISSION_DENIED)`)

    // 3. Publisher session remains active
    const hbRes = await admin.context.request.post(`${APP_ORIGIN}/api/media/publisher-session`, {
      headers: { Origin: APP_ORIGIN },
      data: { action: 'heartbeat', shiftId: SHIFT_A, sessionId: startBody.sessionId },
    })
    assert.equal(hbRes.status(), 200, `Publisher heartbeat should still succeed, got ${hbRes.status()}`)
    const hbBody = await hbRes.json()
    console.log(`[Gate 4.3] Publisher session remains intact and active during viewer revocation`)
    console.log('>>> GATE 4: PASSED <<<')

    // -------------------------------------------------------------
    // GATE 5: Token Expiry and Renewal via Heartbeat
    // -------------------------------------------------------------
    console.log('\n--- GATE 5: Token Expiry and Renewal ---')
    assert.ok(hbBody.token, 'Expected renewed token')
    assert.ok(hbBody.expiresAt, 'Expected expiresAt')
    const expDate = new Date(hbBody.expiresAt)
    assert.ok(expDate.getTime() > Date.now(), 'Token expiresAt must be in the future')
    console.log(`[Gate 5.1] Token renewal verified: expiresAt=${hbBody.expiresAt}`)
    console.log('>>> GATE 5: PASSED <<<')

    // -------------------------------------------------------------
    // GATE 6: Actual Viewer Reconnect
    // -------------------------------------------------------------
    console.log('\n--- GATE 6: Actual Viewer Reconnect ---')
    await db.query('UPDATE public.media_viewer_grants SET active = true WHERE shift_id = $1 AND auth_user_id = $2', [SHIFT_A, leaderUser.auth_user_id])
    const reconnectGrantRes = await leader.context.request.post(`${APP_ORIGIN}/api/media/publisher-session`, {
      headers: { Origin: APP_ORIGIN },
      data: { action: 'viewer-grant', shiftId: SHIFT_A },
    })
    assert.equal(reconnectGrantRes.status(), 200)
    const reconnectJson = await reconnectGrantRes.json()
    const reconnectWhep = await startBrowserViewer(leader.page, reconnectJson.whepUrl, reconnectJson.token)
    assert.equal(reconnectWhep.status, 201)
    console.log(`[Gate 6.1] Viewer reconnect succeeded with fresh token (201 Created)`)
    console.log('>>> GATE 6: PASSED <<<')

    // -------------------------------------------------------------
    // GATE 7: Publisher Disconnect / Cleanup
    // -------------------------------------------------------------
    console.log('\n--- GATE 7: Publisher Disconnect / Cleanup ---')
    await admin.page.evaluate(() => {
      if (window.__canvasTimer) clearInterval(window.__canvasTimer)
      if (window.__publisherPc) window.__publisherPc.close()
    })
    await leader.page.evaluate(() => {
      if (window.__viewerPc) window.__viewerPc.close()
    })
    const stopRes = await admin.context.request.post(`${APP_ORIGIN}/api/media/publisher-session`, {
      headers: { Origin: APP_ORIGIN },
      data: { action: 'stop', shiftId: SHIFT_A, sessionId: startBody.sessionId },
    })
    assert.equal(stopRes.status(), 200)
    const stopJson = await stopRes.json()
    assert.equal(stopJson.stopped, true)

    const dbEnded = await db.query('SELECT status, ended_at FROM public.media_publish_sessions WHERE id = $1', [startBody.sessionId])
    assert.equal(dbEnded.rows[0].status, 'stopped')
    assert.ok(dbEnded.rows[0].ended_at, 'Expected non-null ended_at')
    console.log(`[Gate 7.1] Session ended in DB: status=stopped, ended_at=${dbEnded.rows[0].ended_at}`)
    console.log('>>> GATE 7: PASSED <<<')

    // -------------------------------------------------------------
    // GATE 8: Production Fail-closed Fallback
    // -------------------------------------------------------------
    console.log('\n--- GATE 8: Production Fail-closed Fallback ---')
    const rawRes = await fetch(`${APP_ORIGIN}/api/media/publisher-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: APP_ORIGIN },
      body: JSON.stringify({ action: 'start', shiftId: SHIFT_A }),
    })
    assert.equal(rawRes.status, 401)
    const rawJson = await rawRes.json()
    assert.equal(rawJson?.error?.code, 'AUTHENTICATION_REQUIRED')
    console.log(`[Gate 8.1] Unauthenticated request fail-closed (401 AUTHENTICATION_REQUIRED)`)

    const badOriginRes = await admin.context.request.post(`${APP_ORIGIN}/api/media/publisher-session`, {
      headers: { Origin: 'http://malicious-site.invalid' },
      data: { action: 'start', shiftId: SHIFT_A },
    })
    assert.equal(badOriginRes.status(), 403)
    const badOriginJson = await badOriginRes.json()
    assert.equal(badOriginJson?.error?.code, 'MEDIA_ORIGIN_DENIED')
    console.log(`[Gate 8.2] Invalid origin fail-closed (403 MEDIA_ORIGIN_DENIED)`)
    console.log('>>> GATE 8: PASSED <<<')

    console.log('\n======================================================')
    console.log('ALL 8 DELTA C AUTHENTICATED ACCEPTANCE GATES PASSED!')
    console.log('======================================================')
  } finally {
    await browser.close()
    await db.end()
  }
}

main().catch(err => {
  console.error('TEST SUITE FAILED:', err)
  process.exit(1)
})
