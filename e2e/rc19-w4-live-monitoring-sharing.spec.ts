import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test'
import { createPublicKey, generateKeyPairSync, sign } from 'node:crypto'

const GATEWAY_URL = process.env.MEDIA_GATEWAY_TEST_ORIGIN || 'http://127.0.0.1:8898'

async function createUserContext(
  browser: Browser,
  options: {
    userId: string
    language?: 'vi' | 'en'
    viewport?: { width: number; height: number }
    streamColor?: 'red' | 'blue'
    streamLabel?: string
  },
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({
    viewport: options.viewport ?? { width: 1280, height: 900 },
  })
  await context.addInitScript(
    ({ userId, language, streamColor, streamLabel }) => {
      localStorage.setItem('livestream-ops-current-user', userId)
      localStorage.setItem('livestream-ops-language', language)

      if (streamColor) {
        const w = window as unknown as {
          __adaGetDisplayMediaCalls: number
          __adaActiveTrack: MediaStreamTrack | null
          __adaStopTimer: (() => void) | null
        }
        w.__adaGetDisplayMediaCalls = 0
        w.__adaActiveTrack = null
        w.__adaStopTimer = null

        Object.defineProperty(navigator, 'mediaDevices', {
          configurable: true,
          value: {
            getDisplayMedia: async () => {
              w.__adaGetDisplayMediaCalls += 1
              const canvas = document.createElement('canvas')
              canvas.width = 480
              canvas.height = 270
              const ctx = canvas.getContext('2d')!
              let frame = 0
              const draw = () => {
                frame += 1
                ctx.fillStyle = streamColor === 'red' ? '#dc2626' : '#2563eb'
                ctx.fillRect(0, 0, canvas.width, canvas.height)
                const stripeX = (frame * 28) % (canvas.width - 96)
                ctx.fillStyle = '#facc15'
                ctx.fillRect(stripeX, 36, 96, 130)
                ctx.fillStyle = '#ffffff'
                ctx.font = 'bold 28px monospace'
                ctx.fillText(`${streamLabel || streamColor} #${frame}`, 24, 230)
              }
              draw()
              const timer = window.setInterval(draw, 50)
              const stream = canvas.captureStream(15)
              const videoTrack = stream.getVideoTracks()[0]
              w.__adaActiveTrack = videoTrack
              w.__adaStopTimer = () => window.clearInterval(timer)
              const nativeStop = videoTrack.stop.bind(videoTrack)
              videoTrack.stop = () => {
                window.clearInterval(timer)
                nativeStop()
              }
              return stream
            },
          },
        })
      }
    },
    {
      userId: options.userId,
      language: options.language ?? 'vi',
      streamColor: options.streamColor ?? null,
      streamLabel: options.streamLabel ?? 'LIVE',
    },
  )
  const page = await context.newPage()
  return { context, page }
}

async function sampleVideoFrame(page: Page, testId: string) {
  return page.evaluate(selector => {
    const video = document.querySelector(`[data-testid="${selector}"]`) as HTMLVideoElement | null
    if (!video || video.videoWidth <= 0 || video.videoHeight <= 0) return null
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
    let sumR = 0
    let sumG = 0
    let sumB = 0
    let checksum = 0
    let count = 0
    for (let i = 0; i < data.length; i += 64) {
      const r = data[i]
      const g = data[i + 1]
      const b = data[i + 2]
      sumR += r
      sumG += g
      sumB += b
      checksum = (checksum * 33 + r + g * 5 + b * 11) >>> 0
      count += 1
    }
    return {
      readyState: video.readyState,
      width: video.videoWidth,
      height: video.videoHeight,
      currentTime: video.currentTime,
      avgR: Math.round(sumR / count),
      avgG: Math.round(sumG / count),
      avgB: Math.round(sumB / count),
      checksum,
    }
  }, testId)
}

async function assertNoJwtInBrowserStorage(page: Page) {
  const leakFound = await page.evaluate(() => {
    const jwtRegex = /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\./
    const stores = [window.localStorage, window.sessionStorage]
    for (const store of stores) {
      for (let i = 0; i < store.length; i++) {
        const k = store.key(i)
        if (!k) continue
        const v = store.getItem(k) || ''
        if (jwtRegex.test(v)) return `storage:${k}`
      }
    }
    if (jwtRegex.test(document.cookie)) return 'cookie'
    return null
  })
  expect(leakFound).toBeNull()
}

test.describe('RC19 W4 Delta C (#189) — Live Monitoring Persistent Sharing & Multi-Account Viewing', () => {
  test('L01-L14: C1 Support live_link persistence, C2 persistent tab sharing, C3 real changing frames across multi-account contexts & room isolation', async ({ browser }) => {
    const supA = await createUserContext(browser, {
      userId: '5', // Emily Davis (member, support assigned to s1 & s2)
      streamColor: 'red',
      streamLabel: 'ROOM1',
    })
    const leaderB = await createUserContext(browser, { userId: '2' }) // Team Leader
    const adminC = await createUserContext(browser, { userId: '1' }) // Admin
    const hostD_s2 = await createUserContext(browser, {
      userId: '4', // Michael Chen (member, host assigned ONLY to s2, unassigned on s1)
      streamColor: 'blue',
      streamLabel: 'ROOM2',
    })
    const hostE_s1 = await createUserContext(browser, {
      userId: '3', // Sarah Johnson (member, host assigned to s1)
    })

    try {
      // --- C1 / L01, L02, L04: Support saves live_link with readback, survives switch + reload, invalid rejected ---
      await supA.page.goto('/live')
      await supA.page.getByTestId('open-live-session-s1').click()
      await expect(supA.page.getByTestId('live-stream-panel')).toBeVisible()

      // Support can edit link directly via scoped assignment permission
      await supA.page.getByTestId('edit-live-link').click()
      await expect(supA.page.getByTestId('inline-live-link-form')).toBeVisible()

      // L04: invalid non-HTTPS/unapproved link rejected and never saved
      await supA.page.getByTestId('monitor-live-link-input').fill('https://evil.example/fake-live')
      await supA.page.getByTestId('save-monitor-live-link').click()
      await expect(supA.page.getByTestId('live-link-save-error')).toBeVisible()

      // L01: save valid TikTok link as Support
      const targetUrl = 'https://www.tiktok.com/@brand_deltac/live'
      await supA.page.getByTestId('monitor-live-link-input').fill(targetUrl)
      await supA.page.getByTestId('save-monitor-live-link').click()
      await expect(supA.page.getByTestId('live-platform-link')).toContainText('www.tiktok.com/@brand_deltac/live')

      // L02: Switch s1 -> s2 -> s1 + full page reload: link persists
      await supA.page.getByTestId('open-live-session-s2').click()
      await expect(supA.page.getByTestId('live-platform-link')).toContainText('shopee.com/live')
      await supA.page.getByTestId('open-live-session-s1').click()
      await expect(supA.page.getByTestId('live-platform-link')).toContainText('www.tiktok.com/@brand_deltac/live')

      await supA.page.reload()
      await supA.page.getByTestId('open-live-session-s1').click()
      await expect(supA.page.getByTestId('live-platform-link')).toContainText('www.tiktok.com/@brand_deltac/live')

      // L03: Independent Leader context opens s1 and sees updated link
      await leaderB.page.goto('/live')
      await leaderB.page.getByTestId('open-live-session-s1').click()
      await expect(leaderB.page.getByTestId('live-platform-link')).toContainText('www.tiktok.com/@brand_deltac/live')

      // L05: Unassigned member (user 4) cannot access s1 in Live list or mutate s1 link/publish state
      await hostD_s2.page.goto('/live')
      await expect(hostD_s2.page.getByTestId('open-live-session-s2')).toBeVisible()
      await expect(hostD_s2.page.getByTestId('open-live-session-s1')).toHaveCount(0)
      const unassignedManageStatuses = await hostD_s2.page.evaluate(async () => {
        const syncRes = await fetch('/api/media/publisher-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-ada-live-actor-id': '4' },
          body: JSON.stringify({ action: 'sync-mock-shift', shiftId: 's1', liveLink: 'https://www.tiktok.com/@hijack/live' }),
        })
        const startRes = await fetch('/api/media/publisher-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-ada-live-actor-id': '4' },
          body: JSON.stringify({ action: 'start', shiftId: 's1' }),
        })
        return { syncStatus: syncRes.status, startStatus: startRes.status }
      })
      expect(unassignedManageStatuses.syncStatus).toBe(403)
      expect(unassignedManageStatuses.startStatus).toBe(403)

      // --- C2 & C3 / L06, L07, L09, L10: Persistent tab share + real changing frames on Leader & Admin ---
      await supA.page.getByTestId('start-live-tab-capture').click()
      await expect(supA.page.getByTestId('persistent-live-sharing-banner')).toBeVisible()
      await expect(supA.page.getByTestId('persistent-live-publish-badge')).toBeVisible()
      await expect(supA.page.getByTestId('local-live-tab-player')).toBeVisible()

      // Wait until publisher has pushed real red frames
      await expect.poll(async () => (await sampleVideoFrame(supA.page, 'local-live-tab-player'))?.width ?? 0).toBeGreaterThan(0)

      // L09: Leader (B) & Admin (C) open s1 in separate contexts -> both see live shared video with changing pixels
      await adminC.page.goto('/live')
      await adminC.page.getByTestId('open-live-session-s1').click()

      await expect(leaderB.page.getByTestId('live-shared-stream-video')).toBeVisible()
      await expect(adminC.page.getByTestId('live-shared-stream-video')).toBeVisible()

      await expect.poll(async () => (await sampleVideoFrame(leaderB.page, 'live-shared-stream-video'))?.width ?? 0).toBeGreaterThan(0)
      await expect.poll(async () => (await sampleVideoFrame(adminC.page, 'live-shared-stream-video'))?.width ?? 0).toBeGreaterThan(0)

      const bSnap0 = await sampleVideoFrame(leaderB.page, 'live-shared-stream-video')
      const cSnap0 = await sampleVideoFrame(adminC.page, 'live-shared-stream-video')
      expect(bSnap0).not.toBeNull()
      expect(cSnap0).not.toBeNull()
      expect(bSnap0!.avgR).toBeGreaterThan(bSnap0!.avgB + 40)
      expect(cSnap0!.avgR).toBeGreaterThan(cSnap0!.avgB + 40)

      await expect
        .poll(async () => {
          const snap1 = await sampleVideoFrame(leaderB.page, 'live-shared-stream-video')
          return snap1 && snap1.checksum !== bSnap0!.checksum && snap1.currentTime > bSnap0!.currentTime
        })
        .toBe(true)

      await expect
        .poll(async () => {
          const snap1 = await sampleVideoFrame(adminC.page, 'live-shared-stream-video')
          return snap1 && snap1.checksum !== cSnap0!.checksum && snap1.currentTime > cSnap0!.currentTime
        })
        .toBe(true)

      // No JWT leaked in storage or cookies
      await assertNoJwtInBrowserStorage(supA.page)
      await assertNoJwtInBrowserStorage(leaderB.page)
      await assertNoJwtInBrowserStorage(adminC.page)

      // L06: Publisher switches s1 -> s2 -> s1 without stopping sharing
      await supA.page.getByTestId('open-live-session-s2').click()
      await expect(supA.page.getByTestId('persistent-live-sharing-banner')).toBeVisible()
      await expect(supA.page.getByTestId('other-shift-sharing-notice')).toBeVisible()
      await supA.page.getByTestId('open-live-session-s1').click()
      await expect(supA.page.getByTestId('local-live-tab-player')).toBeVisible()

      // L07 & L10: Publisher navigates to /reports; banner persists AND Leader B keeps receiving new changing frames!
      await supA.page.locator('a[href="/reports"]').first().click()
      await expect(supA.page).toHaveURL(/\/reports/)
      await expect(supA.page.getByTestId('persistent-live-sharing-banner')).toBeVisible()
      const bWhileOnReports0 = await sampleVideoFrame(leaderB.page, 'live-shared-stream-video')
      await expect
        .poll(async () => {
          const snap = await sampleVideoFrame(leaderB.page, 'live-shared-stream-video')
          return snap && bWhileOnReports0 && snap.checksum !== bWhileOnReports0.checksum
        })
        .toBe(true)

      // Return via banner button -> returns to /live with s1 active and zero extra getDisplayMedia prompts
      await supA.page.getByTestId('return-to-shared-shift').click()
      await expect(supA.page).toHaveURL(/\/live\?shift=s1/)
      await expect(supA.page.getByTestId('local-live-tab-player')).toBeVisible()
      const mediaCalls = await supA.page.evaluate(() => (window as unknown as { __adaGetDisplayMediaCalls: number }).__adaGetDisplayMediaCalls)
      expect(mediaCalls).toBe(1)

      // --- L13: Duplicate publisher on s1 (Host user 3 assigned to s1) is blocked with 409 ---
      await hostE_s1.page.goto('/live')
      await hostE_s1.page.getByTestId('open-live-session-s1').click()
      const dupStatus = await hostE_s1.page.evaluate(async () => {
        const res = await fetch('/api/media/publisher-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-ada-live-actor-id': '3' },
          body: JSON.stringify({ action: 'start', shiftId: 's1' }),
        })
        return { status: res.status, body: await res.json() }
      })
      expect(dupStatus.status).toBe(409)
      expect(dupStatus.body.error.code).toBe('DUPLICATE_ACTIVE_PUBLISHER')

      // --- L12: Unassigned user (4) & unauthenticated/wrong-path requests fail closed ---
      const unassignedRes = await hostD_s2.page.evaluate(async () => {
        const res = await fetch('/api/media/publisher-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-ada-live-actor-id': '4' },
          body: JSON.stringify({ action: 'viewer-grant', shiftId: 's1' }),
        })
        return res.status
      })
      expect(unassignedRes).toBe(403)
      await expect(hostD_s2.page.getByTestId('open-live-session-s1')).toHaveCount(0)
      await expect(hostD_s2.page.getByTestId('live-shared-stream-video')).toHaveCount(0)

      const unauthRes = await leaderB.page.evaluate(async () => {
        const res = await fetch('/api/media/publisher-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'viewer-grant', shiftId: 's1' }),
        })
        return res.status
      })
      expect(unauthRes).toBe(401)

      // Also verify gateway rejects fake ES256 token directly
      const fakePair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
      const fakeHeader = Buffer.from(JSON.stringify({ alg: 'ES256', typ: 'JWT', kid: 'rogue' })).toString('base64url')
      const nowSec = Math.floor(Date.now() / 1000)
      const fakePayload = Buffer.from(JSON.stringify({
        iss: 'http://127.0.0.1:3210',
        aud: 'ada-media-monitor',
        iat: nowSec,
        exp: nowSec + 60,
        mediamtx_permissions: [{ action: 'read', path: 'shift_s1_rogue' }],
      })).toString('base64url')
      const fakeSig = sign('sha256', Buffer.from(`${fakeHeader}.${fakePayload}`), {
        key: fakePair.privateKey,
        dsaEncoding: 'ieee-p1363',
      }).toString('base64url')
      const gatewayDeny = await fetch(`${GATEWAY_URL}/shift_s1_rogue/frame`, {
        headers: { Authorization: `Bearer ${fakeHeader}.${fakePayload}.${fakeSig}` },
      })
      expect(gatewayDeny.status).toBe(401)
      void createPublicKey

      // --- L11: Concurrent Room 2 (s2 BLUE) by Host D while Room 1 (s1 RED) continues cleanly ---
      await hostD_s2.page.getByTestId('open-live-session-s2').click()
      await hostD_s2.page.getByTestId('start-live-tab-capture').click()
      await expect(hostD_s2.page.getByTestId('local-live-tab-player')).toBeVisible()

      // Admin C switches from s1 to s2 and receives predominantly BLUE changing frames
      await adminC.page.getByTestId('open-live-session-s2').click()
      await expect(adminC.page.getByTestId('live-shared-stream-video')).toBeVisible()
      await expect
        .poll(async () => {
          const snap = await sampleVideoFrame(adminC.page, 'live-shared-stream-video')
          return snap ? snap.avgB - snap.avgR : 0
        })
        .toBeGreaterThan(40)

      // Meanwhile Leader B on s1 STILL sees predominantly RED changing frames (zero cross-talk)
      const redCheck = await sampleVideoFrame(leaderB.page, 'live-shared-stream-video')
      expect(redCheck).not.toBeNull()
      expect(redCheck!.avgR).toBeGreaterThan(redCheck!.avgB + 40)

      // --- L08: Browser track.onended on s2 immediately stops session & notifies Admin viewer ---
      await hostD_s2.page.evaluate(() => {
        const w = window as unknown as { __adaActiveTrack: MediaStreamTrack | null }
        if (w.__adaActiveTrack) {
          w.__adaActiveTrack.stop()
          w.__adaActiveTrack.dispatchEvent(new Event('ended'))
        }
      })
      await expect(adminC.page.getByTestId('live-shared-stream-ended')).toBeVisible()
      await expect(adminC.page.getByTestId('live-shared-stream-video')).toBeHidden()

      // Explicit stop via global banner works too on s1
      await supA.page.getByTestId('global-stop-tab-capture').click()
      await expect(supA.page.getByTestId('persistent-live-sharing-banner')).toHaveCount(0)
      await expect(leaderB.page.getByTestId('live-shared-stream-ended')).toBeVisible()

      // --- L14: Completing shift revokes active publish + viewer authorization ---
      await supA.page.getByTestId('open-live-session-s1').click()
      await supA.page.getByTestId('start-live-tab-capture').click()
      await expect(leaderB.page.getByTestId('live-shared-stream-video')).toBeVisible()

      const completeStatus = await adminC.page.evaluate(async () => {
        const res = await fetch('/api/media/publisher-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-ada-live-actor-id': '1' },
          body: JSON.stringify({ action: 'sync-mock-shift', shiftId: 's1', status: 'completed' }),
        })
        return res.status
      })
      expect(completeStatus).toBe(200)
      await expect(leaderB.page.getByTestId('live-shared-stream-denied')).toBeVisible()
      await expect(leaderB.page.getByTestId('live-shared-stream-video')).toBeHidden()
      await supA.page.getByTestId('global-stop-tab-capture').click().catch(() => undefined)
      await expect(supA.page.getByTestId('persistent-live-sharing-banner')).toHaveCount(0)
    } finally {
      await supA.page.getByTestId('global-stop-tab-capture').click({ timeout: 1500 }).catch(() => undefined)
      await hostD_s2.page.getByTestId('global-stop-tab-capture').click({ timeout: 1500 }).catch(() => undefined)
      await fetch('http://127.0.0.1:3210/api/media/publisher-session', {
        method: 'POST',
        headers: {
          Origin: 'http://127.0.0.1:3210',
          'Content-Type': 'application/json',
          'x-ada-live-actor-id': '1',
        },
        body: JSON.stringify({ action: 'stop', shiftId: 's1' }),
      }).catch(() => undefined)
      await fetch('http://127.0.0.1:3210/api/media/publisher-session', {
        method: 'POST',
        headers: {
          Origin: 'http://127.0.0.1:3210',
          'Content-Type': 'application/json',
          'x-ada-live-actor-id': '1',
        },
        body: JSON.stringify({ action: 'sync-mock-shift', shiftId: 's1', status: 'scheduled', liveLink: '' }),
      }).catch(() => undefined)
      await Promise.all([
        supA.context.close().catch(() => undefined),
        leaderB.context.close().catch(() => undefined),
        adminC.context.close().catch(() => undefined),
        hostD_s2.context.close().catch(() => undefined),
        hostE_s1.context.close().catch(() => undefined),
      ])
    }
  })

  test('L15: Responsive 320px/390px/768px/1440px Live Monitoring with persistent banner has zero horizontal overflow', async ({ browser }) => {
    for (const vp of [
      { width: 320, height: 700 },
      { width: 390, height: 844 },
      { width: 768, height: 1024 },
      { width: 1440, height: 900 },
    ]) {
      const { context, page } = await createUserContext(browser, {
        userId: '5',
        viewport: vp,
        streamColor: 'red',
        streamLabel: `VP${vp.width}`,
      })
      try {
        await page.goto('/live')
        await page.getByTestId('open-live-session-s1').click()
        await page.getByTestId('start-live-tab-capture').click()
        await expect(page.getByTestId('persistent-live-sharing-banner')).toBeVisible()
        await expect(page.getByTestId('local-live-tab-player')).toBeVisible()

        const overflow = await page.evaluate(() => ({
          scrollWidth: document.documentElement.scrollWidth,
          innerWidth: window.innerWidth,
        }))
        expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.innerWidth)

        await page.screenshot({
          path: `docs/handoffs/evidence/rc19-w4-deltac-live-sharing-${vp.width}px.png`,
          caret: 'initial',
        })
        await page.getByTestId('global-stop-tab-capture').click()
        await expect(page.getByTestId('persistent-live-sharing-banner')).toHaveCount(0)
      } finally {
        await context.close().catch(() => undefined)
      }
    }
  })
})
