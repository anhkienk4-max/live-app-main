/**
 * RC19 W4 Delta C: Unified APP OPS WebRTC WHIP/WHEP Native MediaMTX E2E Runner.
 *
 * Boots:
 * 1. Native MediaMTX v1.21.4 on loopback port 8889 (WebRTC TCP/HTTP) + 8189 (UDP/ICE)
 * 2. Next.js App Server on port 3210 with ES256 media JWT signing
 * 3. Playwright browser suite on e2e/rc19-w4-app-mediamtx-webrtc.spec.ts
 */
import { spawn, spawnSync } from 'node:child_process'
import { generateKeyPairSync } from 'node:crypto'
import { writeFileSync, unlinkSync } from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const NEXT_PORT = '3210'
const MEDIAMTX_PORT = '8889'
const MEDIAMTX_UDP = '8189'
const APP_ORIGIN = `http://127.0.0.1:${NEXT_PORT}`
const MEDIAMTX_ORIGIN = `http://127.0.0.1:${MEDIAMTX_PORT}`
const MEDIAMTX_BIN = process.env.MEDIAMTX_PATH || path.join(process.env.TEMP, 'mediamtx.exe')
const MEDIAMTX_CONF = path.join(process.env.TEMP, 'mediamtx-app-integration.yml')
const TEMP_PW_CONFIG = path.join(ROOT, '.pw-deltac-app.config.mjs')

const ephemeralPair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
const ephemeralPrivatePem = ephemeralPair.privateKey.export({ format: 'pem', type: 'pkcs8' }).toString()

async function waitForHttp(url, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { cache: 'no-store' })
      if (res.ok) return
    } catch {
      // Server booting
    }
    await new Promise(resolve => setTimeout(resolve, 750))
  }
  throw new Error(`Timed out waiting for ${url}`)
}

function killProcessTree(child) {
  if (!child?.pid) return
  if (process.platform === 'win32') {
    spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' })
  } else {
    try {
      child.kill('SIGTERM')
    } catch {}
  }
}

// 1. Generate MediaMTX config
const mtxConfig = `
logLevel: info
logDestinations: [stdout]

authMethod: jwt
authJWTJWKS: ${APP_ORIGIN}/api/media/jwks
authJWTIssuer: ${APP_ORIGIN}
authJWTAudience: ada-media-monitor

rtsp: false
rtmp: false
hls: false
api: false
metrics: false

webrtc: true
webrtcAddress: 127.0.0.1:${MEDIAMTX_PORT}
webrtcAllowOrigins: ["*"]
webrtcLocalUDPAddress: :${MEDIAMTX_UDP}
webrtcAdditionalHosts: ["127.0.0.1"]
webrtcICEServers2: []

paths:
  all_others:
    source: publisher
    overridePublisher: false
    record: false
`
writeFileSync(MEDIAMTX_CONF, mtxConfig, 'utf8')

const nextEnv = {
  ...process.env,
  NODE_ENV: 'development',
  NEXT_PUBLIC_USE_MOCK_DATA: 'true',
  NEXT_PUBLIC_ENABLE_MOCK_USER_SWITCHER: 'true',
  MEDIA_DEV_EPHEMERAL_KEY_ENABLED: 'true',
  MEDIA_JWT_KID: 'ada-dev-app-p256',
  MEDIA_JWT_ES256_PRIVATE_KEY_PEM: ephemeralPrivatePem,
  MEDIA_APP_ORIGIN: APP_ORIGIN,
  NEXT_PUBLIC_APP_ORIGIN: APP_ORIGIN,
  MEDIA_ORIGIN: MEDIAMTX_ORIGIN,
  NEXT_PUBLIC_MEDIA_ORIGIN: MEDIAMTX_ORIGIN,
}
delete nextEnv.VERCEL
delete nextEnv.VERCEL_ENV
delete nextEnv.NEXT_PUBLIC_SUPABASE_URL
delete nextEnv.SUPABASE_URL
delete nextEnv.SUPABASE_SECRET_KEY

let mtxProc
let nextProc

try {
  writeFileSync(
    TEMP_PW_CONFIG,
    `export default {
  testDir: './e2e',
  timeout: 180000,
  expect: { timeout: 20000 },
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: '${APP_ORIGIN}',
    headless: true,
    trace: 'off',
    screenshot: 'only-on-failure',
    launchOptions: {
      args: [
        '--use-fake-ui-for-media-stream',
        '--use-fake-device-for-media-stream',
        '--allow-loopback-in-peer-connection',
        '--disable-features=WebRtcHideLocalIpsWithMdns',
        '--autoplay-policy=no-user-gesture-required',
      ],
    },
  },
};\n`,
    'utf8',
  )

  console.log(`[1/4] Starting Next.js app server at ${APP_ORIGIN}...`)
  nextProc = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '-p', NEXT_PORT, '-H', '127.0.0.1'], {
    cwd: ROOT,
    env: nextEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  nextProc.stdout.on('data', chunk => process.stdout.write(`[next] ${chunk}`))
  nextProc.stderr.on('data', chunk => process.stderr.write(`[next:err] ${chunk}`))

  await waitForHttp(`${APP_ORIGIN}/api/media/jwks`, 180_000)
  console.log(`[Next.js] JWKS endpoint active at ${APP_ORIGIN}/api/media/jwks`)

  console.log(`[2/4] Starting Native MediaMTX v1.21.4 on ${MEDIAMTX_ORIGIN}...`)
  mtxProc = spawn(MEDIAMTX_BIN, [MEDIAMTX_CONF], {
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  mtxProc.stdout.on('data', chunk => process.stdout.write(`[mediamtx] ${chunk}`))
  mtxProc.stderr.on('data', chunk => process.stderr.write(`[mediamtx:err] ${chunk}`))

  await new Promise(resolve => setTimeout(resolve, 1500))

  // Warm up /live route
  await fetch(`${APP_ORIGIN}/live`).catch(() => undefined)
  await fetch(`${APP_ORIGIN}/reports`).catch(() => undefined)

  console.log('[3/4] Executing Playwright actual WebRTC WHIP/WHEP MediaMTX App Suite...')
  const pw = spawnSync(
    process.execPath,
    ['node_modules/@playwright/test/cli.js', 'test', 'e2e/rc19-w4-app-mediamtx-webrtc.spec.ts', '--config=.pw-deltac-app.config.mjs'],
    {
      cwd: ROOT,
      env: {
        ...nextEnv,
      },
      stdio: 'inherit',
      maxBuffer: 25 * 1024 * 1024,
    },
  )

  if (pw.status !== 0) {
    process.exitCode = pw.status ?? 1
  } else {
    console.log('\n[4/4] PASS: Actual App OPS WebRTC WHIP/WHEP MediaMTX Integration Verified!')
  }
} finally {
  killProcessTree(nextProc)
  killProcessTree(mtxProc)
  try {
    unlinkSync(TEMP_PW_CONFIG)
  } catch {}
}
