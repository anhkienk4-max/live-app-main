import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test'

const MEDIAMTX_ORIGIN = process.env.NEXT_PUBLIC_MEDIA_ORIGIN || 'http://127.0.0.1:8889'

async function createOpsUserContext(
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
              const timer = window.setInterval(draw, 40)
              const videoStream = canvas.captureStream(25)
              const videoTrack = videoStream.getVideoTracks()[0]

              // Also generate audio oscillator track for audio transport verification
              const audioCtx = new AudioContext()
              const osc = audioCtx.createOscillator()
              const dst = audioCtx.createMediaStreamDestination()
              osc.type = 'sine'
              osc.frequency.setValueAtTime(440, audioCtx.currentTime)
              osc.connect(dst)
              osc.start()
              const audioTrack = dst.stream.getAudioTracks()[0]

              const combinedStream = new MediaStream([videoTrack, audioTrack])
              w.__adaActiveTrack = videoTrack
              w.__adaStopTimer = () => {
                window.clearInterval(timer)
                osc.stop()
                audioCtx.close().catch(() => undefined)
              }
              const nativeStop = videoTrack.stop.bind(videoTrack)
              videoTrack.stop = () => {
                window.clearInterval(timer)
                osc.stop()
                audioCtx.close().catch(() => undefined)
                nativeStop()
              }
              return combinedStream
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

test.describe('RC19 W4 Delta C: Actual App OPS WebRTC WHIP/WHEP MediaMTX Integration', () => {
  test('L01-L15: Full Application Tab Publisher -> Native MediaMTX -> Viewer 1 & 2 Decoded RTP Frames, Route Persistence, Room Isolation, Revocation', async ({ browser }) => {
    // 1. Setup multi-account contexts
    const supA = await createOpsUserContext(browser, {
      userId: '5', // Emily Davis (Support assigned to s1 & s2)
      streamColor: 'red',
      streamLabel: 'ROOM_S1',
    })
    const leaderB = await createOpsUserContext(browser, { userId: '2' }) // Team Leader
    const adminC = await createOpsUserContext(browser, { userId: '1' }) // Admin
    const hostD_s2 = await createOpsUserContext(browser, {
      userId: '4', // Michael Chen (Host assigned ONLY to s2)
      streamColor: 'blue',
      streamLabel: 'ROOM_S2',
    })
    const hostE_s1 = await createOpsUserContext(browser, {
      userId: '3', // Sarah Johnson (Host assigned to s1)
    })

    try {
      // Step 1: Support A saves valid live link with optimistic version & readback
      await supA.page.goto('/live')
      await supA.page.getByTestId('open-live-session-s1').click()
      await expect(supA.page.getByTestId('live-stream-panel')).toBeVisible()

      await supA.page.getByTestId('edit-live-link').click()
      await supA.page.getByTestId('monitor-live-link-input').fill('https://www.tiktok.com/@ops_official/live')
      await supA.page.getByTestId('save-monitor-live-link').click()
      await expect(supA.page.getByTestId('live-platform-link')).toContainText('www.tiktok.com/@ops_official/live')

      // Step 2: Support A starts Tab Sharing via LiveTabPublisherContext
      // This calls /api/media/publisher-session (start) -> gets WHIP grant -> publishes via WebRTC WHIP to Native MediaMTX
      await supA.page.getByTestId('start-live-tab-capture').click()
      await expect(supA.page.getByTestId('persistent-live-sharing-banner')).toBeVisible()
      await expect(supA.page.getByTestId('persistent-live-publish-badge')).toBeVisible()
      await expect(supA.page.getByTestId('local-live-tab-player')).toBeVisible()

      // Local player receives video
      await expect.poll(async () => (await sampleVideoFrame(supA.page, 'local-live-tab-player'))?.width ?? 0).toBeGreaterThan(0)

      // Step 3: Viewer 1 (Leader B) and Viewer 2 (Admin C) open s1
      // Both LiveSharedStreamViewer components call /api/media/publisher-session (viewer-grant) -> gets WHEP grant -> connects via WHEP to Native MediaMTX
      await leaderB.page.goto('/live')
      await leaderB.page.getByTestId('open-live-session-s1').click()

      await adminC.page.goto('/live')
      await adminC.page.getByTestId('open-live-session-s1').click()

      await expect(leaderB.page.getByTestId('live-shared-stream-video')).toBeVisible()
      await expect(adminC.page.getByTestId('live-shared-stream-video')).toBeVisible()

      // Step 4: Verify real decoded frames on both viewers
      await expect.poll(async () => (await sampleVideoFrame(leaderB.page, 'live-shared-stream-video'))?.width ?? 0).toBeGreaterThan(0)
      await expect.poll(async () => (await sampleVideoFrame(adminC.page, 'live-shared-stream-video'))?.width ?? 0).toBeGreaterThan(0)

      const bSnap0 = await sampleVideoFrame(leaderB.page, 'live-shared-stream-video')
      const cSnap0 = await sampleVideoFrame(adminC.page, 'live-shared-stream-video')
      expect(bSnap0).not.toBeNull()
      expect(cSnap0).not.toBeNull()
      // Predominantly RED frames from Room S1
      expect(bSnap0!.avgR).toBeGreaterThan(bSnap0!.avgB + 40)
      expect(cSnap0!.avgR).toBeGreaterThan(cSnap0!.avgB + 40)

      // Step 5: Verify moving pixel changes over time (delta checksum & delta time)
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

      // Step 5b: Measure real RTP telemetry on Viewer 1 (Leader B) over 2 seconds
      const sample1 = await leaderB.page.evaluate(async () => {
        const pc = (window as unknown as { __adaViewerPc?: RTCPeerConnection }).__adaViewerPc
        if (!pc) return null
        const stats = await pc.getStats()
        let video = null
        let audio = null
        stats.forEach(r => {
          if (r.type === 'inbound-rtp' && r.kind === 'video') {
            video = {
              packetsReceived: r.packetsReceived,
              bytesReceived: r.bytesReceived,
              framesDecoded: r.framesDecoded,
              timestamp: r.timestamp,
            }
          }
          if (r.type === 'inbound-rtp' && r.kind === 'audio') {
            audio = { packetsReceived: r.packetsReceived, bytesReceived: r.bytesReceived }
          }
        })
        return { video, audio }
      })

      await new Promise(r => setTimeout(r, 2000))

      const sample2 = await leaderB.page.evaluate(async () => {
        const pc = (window as unknown as { __adaViewerPc?: RTCPeerConnection }).__adaViewerPc
        if (!pc) return null
        const stats = await pc.getStats()
        let video = null
        let audio = null
        stats.forEach(r => {
          if (r.type === 'inbound-rtp' && r.kind === 'video') {
            video = {
              packetsReceived: r.packetsReceived,
              bytesReceived: r.bytesReceived,
              framesDecoded: r.framesDecoded,
              timestamp: r.timestamp,
            }
          }
          if (r.type === 'inbound-rtp' && r.kind === 'audio') {
            audio = { packetsReceived: r.packetsReceived, bytesReceived: r.bytesReceived }
          }
        })
        return { video, audio }
      })

      expect(sample1).not.toBeNull()
      expect(sample2).not.toBeNull()
      expect(sample1!.video?.framesDecoded).toBeGreaterThan(0)
      expect(sample2!.video?.framesDecoded).toBeGreaterThan(sample1!.video?.framesDecoded ?? 0)
      expect(sample2!.video?.packetsReceived).toBeGreaterThan(sample1!.video?.packetsReceived ?? 0)

      const dt = ((sample2!.video?.timestamp ?? 0) - (sample1!.video?.timestamp ?? 0)) / 1000
      const df = (sample2!.video?.framesDecoded ?? 0) - (sample1!.video?.framesDecoded ?? 0)
      const db = (sample2!.video?.bytesReceived ?? 0) - (sample1!.video?.bytesReceived ?? 0)
      const measuredFps = (df / dt).toFixed(1)
      const measuredBitrateKbps = Math.round((db * 8) / (1000 * dt))

      console.log('=== APP OPS WEBRTC MEASURED TELEMETRY ===', {
        dtSec: dt.toFixed(2),
        framesDecodedDelta: df,
        measuredFps: `${measuredFps} FPS`,
        bytesReceivedDelta: db,
        measuredBitrateKbps: `${measuredBitrateKbps} kbps`,
        audioPacketsReceived: sample2!.audio?.packetsReceived ?? 0,
      })

      // Step 6: Internal SPA Route Persistence
      // Publisher navigates to /reports via client-side Next.js Link
      await supA.page.locator('a[href="/reports"]').first().click()
      await expect(supA.page).toHaveURL(/\/reports/)
      await expect(supA.page.getByTestId('persistent-live-sharing-banner')).toBeVisible()

      // While publisher is on /reports, Leader B CONTINUES to receive new decoded video frames!
      const bWhileOnReports0 = await sampleVideoFrame(leaderB.page, 'live-shared-stream-video')
      await expect
        .poll(async () => {
          const snap = await sampleVideoFrame(leaderB.page, 'live-shared-stream-video')
          return snap && bWhileOnReports0 && snap.checksum !== bWhileOnReports0.checksum
        })
        .toBe(true)

      // Return via banner button -> returns to /live?shift=s1 with zero re-prompts
      await supA.page.getByTestId('return-to-shared-shift').click()
      await expect(supA.page).toHaveURL(/\/live\?shift=s1/)
      await expect(supA.page.getByTestId('local-live-tab-player')).toBeVisible()

      // Step 7: Duplicate publisher rejection (Host E on s1 is rejected with 409 DUPLICATE_ACTIVE_PUBLISHER)
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

      // Step 8: Multi-Room Isolation (Host D publishes Room S2 in BLUE)
      await hostD_s2.page.goto('/live')
      await hostD_s2.page.getByTestId('open-live-session-s2').click()
      await hostD_s2.page.getByTestId('start-live-tab-capture').click()
      await expect(hostD_s2.page.getByTestId('local-live-tab-player')).toBeVisible()

      // Admin C opens s2: receives BLUE frames from Room S2, while Leader B on s1 still receives RED frames from Room S1!
      await adminC.page.getByTestId('open-live-session-s2').click()
      await expect(adminC.page.getByTestId('live-shared-stream-video')).toBeVisible()
      await expect.poll(async () => (await sampleVideoFrame(adminC.page, 'live-shared-stream-video'))?.width ?? 0).toBeGreaterThan(0)

      const s2Snap = await sampleVideoFrame(adminC.page, 'live-shared-stream-video')
      const s1Snap = await sampleVideoFrame(leaderB.page, 'live-shared-stream-video')
      expect(s2Snap).not.toBeNull()
      expect(s1Snap).not.toBeNull()
      expect(s2Snap!.avgB).toBeGreaterThan(s2Snap!.avgR + 40) // S2 is Blue
      expect(s1Snap!.avgR).toBeGreaterThan(s1Snap!.avgB + 40) // S1 is Red

      // Step 9: Teardown / Revocation (Support A stops sharing on s1)
      await supA.page.getByTestId('stop-live-tab-capture').click()
      await expect(supA.page.getByTestId('persistent-live-sharing-banner')).toHaveCount(0)

      // Leader B immediately sees stream transition to ended
      await expect(leaderB.page.getByTestId('live-shared-stream-ended')).toBeVisible()
    } finally {
      await supA.context.close()
      await leaderB.context.close()
      await adminC.context.close()
      await hostD_s2.context.close()
      await hostE_s1.context.close()
    }
  })
})
