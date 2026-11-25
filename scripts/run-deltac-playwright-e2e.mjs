/**
 * Orchestrates the standalone External Media Gateway Sidecar (127.0.0.1:8898),
 * Next.js dev server (127.0.0.1:3210, mock mode + local ephemeral ES256 media keys),
 * and Playwright multi-account L01-L15 browser E2E suite.
 */
import { spawn, spawnSync } from 'node:child_process'
import { generateKeyPairSync } from 'node:crypto'
import { writeFileSync, unlinkSync } from 'node:fs'
import path from 'node:path'

const ROOT = process.cwd()
const NEXT_PORT = '3210'
const GATEWAY_PORT = '8898'
const APP_ORIGIN = `http://127.0.0.1:${NEXT_PORT}`
const GATEWAY_ORIGIN = `http://127.0.0.1:${GATEWAY_PORT}`
const TEMP_PW_CONFIG = path.join(ROOT, '.pw-deltac.config.mjs')

const ephemeralPair = generateKeyPairSync('ec', { namedCurve: 'prime256v1' })
const ephemeralPrivatePem = ephemeralPair.privateKey.export({ format: 'pem', type: 'pkcs8' }).toString()

async function waitForHttp(url, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { cache: 'no-store' })
      if (res.ok) return
    } catch {
      // Server still booting.
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
    } catch {
      // Ignore already exited.
    }
  }
}

const gatewayEnv = {
  ...process.env,
  MEDIA_GATEWAY_HOST: '127.0.0.1',
  MEDIA_GATEWAY_PORT: GATEWAY_PORT,
  APP_ORIGIN,
  MEDIA_JWT_ISSUER: APP_ORIGIN,
  MEDIA_JWT_AUDIENCE: 'ada-media-monitor',
  APP_JWKS_URL: `${APP_ORIGIN}/api/media/jwks`,
}

const nextEnv = {
  ...process.env,
  NODE_ENV: 'development',
  NEXT_PUBLIC_USE_MOCK_DATA: 'true',
  NEXT_PUBLIC_ENABLE_MOCK_USER_SWITCHER: 'true',
  MEDIA_DEV_EPHEMERAL_KEY_ENABLED: 'true',
  MEDIA_JWT_KID: 'ada-dev-e2e-p256',
  MEDIA_JWT_ES256_PRIVATE_KEY_PEM: ephemeralPrivatePem,
  MEDIA_APP_ORIGIN: APP_ORIGIN,
  NEXT_PUBLIC_APP_ORIGIN: APP_ORIGIN,
  MEDIA_ORIGIN: GATEWAY_ORIGIN,
  NEXT_PUBLIC_MEDIA_ORIGIN: GATEWAY_ORIGIN,
}
delete nextEnv.VERCEL
delete nextEnv.VERCEL_ENV
delete nextEnv.NEXT_PUBLIC_SUPABASE_URL
delete nextEnv.SUPABASE_URL
delete nextEnv.SUPABASE_SECRET_KEY

let gatewayProc
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
  },
};\n`,
    'utf8',
  )

  console.log(`[1/4] Starting External Media Gateway Sidecar at ${GATEWAY_ORIGIN}...`)
  gatewayProc = spawn(process.execPath, ['scripts/live-media-gateway-sidecar.mjs'], {
    cwd: ROOT,
    env: gatewayEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  gatewayProc.stdout.on('data', chunk => process.stdout.write(`[gateway] ${chunk}`))
  gatewayProc.stderr.on('data', chunk => process.stderr.write(`[gateway:err] ${chunk}`))

  await waitForHttp(`${GATEWAY_ORIGIN}/healthz`, 30_000)

  console.log(`[2/4] Starting Next.js dev server at ${APP_ORIGIN}...`)
  nextProc = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'dev', '-p', NEXT_PORT, '-H', '127.0.0.1'], {
    cwd: ROOT,
    env: nextEnv,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  nextProc.stdout.on('data', chunk => process.stdout.write(`[next] ${chunk}`))
  nextProc.stderr.on('data', chunk => process.stderr.write(`[next:err] ${chunk}`))

  await waitForHttp(`${APP_ORIGIN}/api/media/jwks`, 180_000)
  // Warm up /live and /reports routes once so first browser context isn't delayed by on-demand compilation
  await fetch(`${APP_ORIGIN}/live`).catch(() => undefined)
  await fetch(`${APP_ORIGIN}/reports`).catch(() => undefined)

  console.log('[3/4] Executing Playwright multi-account real-frame suite (L01-L15)...')
  const pw = spawnSync(
    process.execPath,
    ['node_modules/@playwright/test/cli.js', 'test', 'e2e/rc19-w4-live-monitoring-sharing.spec.ts', '--config=.pw-deltac.config.mjs'],
    {
      cwd: ROOT,
      env: {
        ...nextEnv,
        MEDIA_GATEWAY_TEST_ORIGIN: GATEWAY_ORIGIN,
      },
      stdio: 'inherit',
      maxBuffer: 25 * 1024 * 1024,
    },
  )
  if (pw.status !== 0) {
    process.exitCode = pw.status ?? 1
  } else {
    console.log('[4/4] PASS: Playwright Delta C L01-L15 & Responsive 4-viewport E2E verified.')
  }
} finally {
  killProcessTree(nextProc)
  killProcessTree(gatewayProc)
  try {
    unlinkSync(TEMP_PW_CONFIG)
  } catch {
    // Ignore cleanup errors.
  }
}
