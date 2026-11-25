import { spawn, spawnSync } from 'node:child_process'
import { generateKeyPairSync } from 'node:crypto'
import { writeFileSync, rmSync } from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const NEXT_PORT = '3210'
const MEDIAMTX_PORT = '8889'
const MEDIAMTX_UDP = '8189'
const SYNTHETIC_DRIVE_PORT = '18890'
const CORS_PROXY_PORT = '15926'

const APP_ORIGIN = `http://127.0.0.1:${NEXT_PORT}`
const MEDIAMTX_ORIGIN = `http://127.0.0.1:${MEDIAMTX_PORT}`
const CORS_PROXY_ORIGIN = `http://127.0.0.1:${CORS_PROXY_PORT}`
const MEDIAMTX_BIN = process.env.MEDIAMTX_PATH || path.join(process.env.TEMP, 'mediamtx.exe')
const MEDIAMTX_CONF = path.join(process.env.TEMP, 'mediamtx-app-integration.yml')

const ephemeralPair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
const ephemeralPrivatePem = ephemeralPair.privateKey.export({ format: 'pem', type: 'pkcs8' }).toString()

const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxvY2FsaG9zdCIsInJvbGUiOiJhbm9uIiwiaWF0IjoxNzk1NTk0MDA4LCJleHAiOjIxMTA5NTQwMDh9.dFo89pbfbXzH8XmjfiXJqkDWa8-numhBjNRP94nNwu8'
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxvY2FsaG9zdCIsInJvbGUiOiJzZXJ2aWNlX3JvbGUiLCJpYXQiOjE3OTU1OTQwMDgsImV4cCI6MjExMDk1NDAwOH0.G17iNb8R9anN7esMPkYsOE8lPKc-mTAfD746uIraYsY'

async function waitForHttp(url, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { cache: 'no-store' })
      if (res.ok) return
    } catch {
      // Booting
    }
    await new Promise(resolve => setTimeout(resolve, 1500))
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

async function main() {
  console.log('=== ORCHESTRATING FULL A+B+C INTEGRATED ACCEPTANCE ===')

  // 1. Ensure MediaMTX config
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

  // 2. Prepare environment for Next.js
  const nextEnv = {
    ...process.env,
    NODE_ENV: 'development',
    NEXT_PUBLIC_USE_MOCK_DATA: 'false',
    NEXT_PUBLIC_ENABLE_MOCK_USER_SWITCHER: 'false',
    NEXT_PUBLIC_SUPABASE_URL: CORS_PROXY_ORIGIN,
    SUPABASE_URL: CORS_PROXY_ORIGIN,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: ANON_KEY,
    SUPABASE_SECRET_KEY: SERVICE_KEY,
    DATABASE_URL: 'postgresql://postgres@127.0.0.1:55542/rc19_ab_c511_canonical_v6_20261125',
    MEDIA_DEV_EPHEMERAL_KEY_ENABLED: 'true',
    MEDIA_JWT_KID: 'ada-dev-app-p256',
    MEDIA_JWT_ES256_PRIVATE_KEY_PEM: ephemeralPrivatePem,
    MEDIA_APP_ORIGIN: APP_ORIGIN,
    NEXT_PUBLIC_APP_ORIGIN: APP_ORIGIN,
    MEDIA_ORIGIN: MEDIAMTX_ORIGIN,
    NEXT_PUBLIC_MEDIA_ORIGIN: MEDIAMTX_ORIGIN,
    LIVE_SESSION_APP_ORIGIN: APP_ORIGIN,
    LIVE_SESSION_MEDIA_ORIGIN: MEDIAMTX_ORIGIN,
    GOOGLE_DRIVE_ROOT_URL: `http://127.0.0.1:${SYNTHETIC_DRIVE_PORT}/`,
    GOOGLE_DRIVE_CLIENT_ID: 'synthetic-client',
    GOOGLE_DRIVE_CLIENT_SECRET: 'synthetic-secret',
    GOOGLE_DRIVE_REFRESH_TOKEN: 'synthetic-refresh',
    GOOGLE_DRIVE_ACCESS_TOKEN: 'synthetic-access-token',
    GOOGLE_DRIVE_ROOT_FOLDER_ID: '1_-9f1xjIYvlIOEyXSeKtDPdB9PJKkaMm',
    OPERATIONAL_STORAGE_ROUTING_MODE: 'domain_first',
    FEATURE_MY_PAYSLIP: 'true',
    FEATURE_PAYROLL: 'true',
    FEATURE_ACTUAL_STAFFING: 'true',
    FEATURE_SELF_ATTENDANCE_REVIEW: 'true',
    FEATURE_IMPORT_BATCH: 'true',
  }
  delete nextEnv.VERCEL
  delete nextEnv.VERCEL_ENV

  let nextProc
  let mtxProc
  let proxyProc

  try {
    // Start Dedicated CORS Proxy
    console.log(`[0/4] Starting Dedicated Supabase CORS Proxy on ${CORS_PROXY_ORIGIN}...`)
    proxyProc = spawn(process.execPath, ['scripts/rc19-c4-migration-rehearsal/local-supabase-cors-proxy.mjs'], {
      cwd: ROOT,
      env: {
        ...process.env,
        LOCAL_PROXY_PORT: CORS_PROXY_PORT,
        LOCAL_AUTH_PORT: '15914',
        LOCAL_REST_PORT: '15915',
        LOCAL_APP_ORIGIN: APP_ORIGIN,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    proxyProc.stdout.on('data', chunk => process.stdout.write(`[proxy] ${chunk}`))
    proxyProc.stderr.on('data', chunk => process.stderr.write(`[proxy:err] ${chunk}`))
    await waitForHttp(`${CORS_PROXY_ORIGIN}/auth/v1/health`, 5000)
    console.log(`[CORS Proxy] Active on ${CORS_PROXY_ORIGIN} allowing origin ${APP_ORIGIN}`)
    // Check Synthetic Drive health
    console.log(`[1/4] Checking Synthetic Drive on http://127.0.0.1:${SYNTHETIC_DRIVE_PORT}...`)
    await waitForHttp(`http://127.0.0.1:${SYNTHETIC_DRIVE_PORT}/health`, 5000)
    console.log('[Synthetic Drive] Active and healthy.')

    // Start Next.js App Server
    console.log(`[2/4] Starting Next.js app server on ${APP_ORIGIN}...`)
    try { rmSync(path.join(ROOT, '.next'), { recursive: true, force: true }) } catch {}
    nextProc = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '-p', NEXT_PORT, '-H', '127.0.0.1'], {
      cwd: ROOT,
      env: nextEnv,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    nextProc.stdout.on('data', chunk => process.stdout.write(`[next] ${chunk}`))
    nextProc.stderr.on('data', chunk => process.stderr.write(`[next:err] ${chunk}`))

    await new Promise(resolve => {
      const onData = chunk => {
        if (chunk.toString().includes('Ready in') || chunk.toString().includes('Ready')) {
          nextProc.stdout.off('data', onData)
          resolve()
        }
      }
      nextProc.stdout.on('data', onData)
      setTimeout(resolve, 8000)
    })
    await new Promise(r => setTimeout(r, 2000))

    await waitForHttp(`${APP_ORIGIN}/api/media/jwks`, 180_000)
    console.log(`[Next.js] Server ready on ${APP_ORIGIN}`)

    // Start Native MediaMTX
    console.log(`[3/4] Starting Native MediaMTX on ${MEDIAMTX_ORIGIN}...`)
    mtxProc = spawn(MEDIAMTX_BIN, [MEDIAMTX_CONF], {
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    mtxProc.stdout.on('data', chunk => process.stdout.write(`[mediamtx] ${chunk}`))
    mtxProc.stderr.on('data', chunk => process.stderr.write(`[mediamtx:err] ${chunk}`))

    await new Promise(resolve => setTimeout(resolve, 1500))

    // 4. Run Task 1: Delta C Authenticated Acceptance
    console.log('\n======================================================')
    console.log('RUNNING TASK 1: DELTA C AUTHENTICATED ACCEPTANCE')
    console.log('======================================================')
    const t1 = spawnSync(process.execPath, ['scripts/verify-deltac-authenticated-acceptance.mjs'], {
      cwd: ROOT,
      env: { ...process.env, APP_ORIGIN, MEDIAMTX_ORIGIN },
      stdio: 'inherit',
    })
    if (t1.status !== 0) throw new Error('Task 1 Authenticated Acceptance FAILED')

    // 5. Run Task 3: A+B Browser UAT
    console.log('\n======================================================')
    console.log('RUNNING TASK 3: AUTHENTICATED A+B BROWSER UAT')
    console.log('======================================================')
    const t3 = spawnSync(process.execPath, ['scripts/verify-ab-browser-uat.mjs'], {
      cwd: ROOT,
      env: { ...process.env, APP_ORIGIN },
      stdio: 'inherit',
    })
    if (t3.status !== 0) throw new Error('Task 3 Browser UAT FAILED')

    console.log('\n======================================================')
    console.log('ALL INTEGRATED ACCEPTANCE TASKS COMPLETED SUCCESSFULLY!')
    console.log('======================================================')
  } finally {
    console.log('[Teardown] Stopping servers...')
    killProcessTree(nextProc)
    killProcessTree(mtxProc)
    killProcessTree(proxyProc)
  }
}

main().catch(err => {
  console.error('[FATAL]', err)
  process.exit(1)
})
