/**
 * Authenticated Analytics hard-reload regression, to be run on the owner's
 * existing local Edge CDP profile. No credentials, cookies or JWTs are saved.
 *
 * Windows: $env:ADA_CDP_URL="http://127.0.0.1:9222"
 *          node scripts/uat_analytics_hard_reload_gate.mjs
 *
 * Requires a pre-authenticated, explicitly authorized Admin session.
 * Does not mutate business data and never signs in programmatically.
 * Outputs only sanitized error codes, path-only HTTP metadata and opaque
 * per-run response-owner aliases to a local OS temporary directory.
 */
import { chromium } from '@playwright/test'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { strict as assert } from 'node:assert'

const base = new URL(process.env.ADA_OPS_BASE_URL || 'https://ops5729.top')
const cdp = process.env.ADA_CDP_URL || 'http://127.0.0.1:9222'
const repeat = Number(process.env.ADA_UAT_ITERATIONS || '20')
assert(base.protocol === 'https:' || base.hostname === 'localhost', 'Use an HTTPS test target')
assert(Number.isInteger(repeat) && repeat >= 1 && repeat <= 100, 'Invalid iteration count')
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(cdp)) {
  throw new Error('CDP must be bound to localhost (127.0.0.1)')
}

const browser = await chromium.connectOverCDP(cdp)
const context = browser.contexts()[0]
if (!context) throw new Error('No existing Edge CDP context; start the isolated UAT profile first')
const existing = context.pages().find(p => {
  try { return new URL(p.url()).origin === base.origin } catch { return false }
})
const page = existing || await context.newPage()
const events = []
const owners = new Map()
let phase = 'initial'
let phaseIndex = 0

function safeCode(value) {
  const text = String(value)
  if (text.includes('LIST_IDENTITY_CHANGED')) return 'LIST_IDENTITY_CHANGED'
  if (text.includes('CACHE_IDENTITY_CHANGED')) return 'CACHE_IDENTITY_CHANGED'
  if (text.includes('CACHE_INVALIDATED')) return 'CACHE_INVALIDATED'
  if (text.includes('AUTHENTICATION_REQUIRED')) return 'AUTHENTICATION_REQUIRED'
  if (text.includes('PERMISSION_DENIED')) return 'PERMISSION_DENIED'
  if (/react(?:\.dev)?\/errors\/321|React error #321/i.test(text)) return 'REACT_321'
  if (/Invalid hook call/i.test(text)) return 'REACT_INVALID_HOOK_CALL'
  return null
}

page.on('console', message => {
  if (message.type() !== 'error') return
  const code = safeCode(message.text())
  if (code) events.push({ phase, phaseIndex, source: 'console', code })
})
page.on('pageerror', error => {
  const code = safeCode(error.message)
  if (code) events.push({ phase, phaseIndex, source: 'pageerror', code })
})
page.on('response', response => {
  const url = new URL(response.url())
  if (url.origin !== base.origin || !url.pathname.startsWith('/api/operations/')) return
  const record = { phase, phaseIndex, source: 'http', path: url.pathname, status: response.status() }
  events.push(record)
  if (!url.pathname.endsWith('/collection')) return
  // A response owner may be compared across requests, but is never saved raw.
  void response.json().then(body => {
    if (typeof body?.ownerKey !== 'string') return
    if (!owners.has(body.ownerKey)) owners.set(body.ownerKey, 'owner-' + (owners.size + 1))
    record.ownerAlias = owners.get(body.ownerKey)
    if (typeof body?.error?.code === 'string') record.code = safeCode(body.error.code)
  }).catch(() => {})
})

const checks = []
async function inspect(label) {
  await page.waitForTimeout(850)
  try {
    await page.waitForFunction(() => {
      const body = document.body?.innerText || ''
      return body.includes('LIST_IDENTITY_CHANGED')
        || body.includes('AUTHENTICATION_REQUIRED')
        || (!document.querySelector('[data-testid="analytics-loading-shell"]')
          && document.readyState === 'complete')
    }, null, { timeout: 15000 })
  } catch { /* Record loading timeout as a failure below. */ }
  await page.waitForTimeout(450)
  const view = await page.evaluate(() => ({
    identityChanged: document.body?.innerText?.includes('LIST_IDENTITY_CHANGED') || false,
    authRequired: document.body?.innerText?.includes('AUTHENTICATION_REQUIRED') || false,
    loading: !!document.querySelector('[data-testid="analytics-loading-shell"]'),
    route: location.pathname,
  }))
  const relevant = events.filter(e => e.phase === phase && e.phaseIndex === phaseIndex)
  const errors = [...new Set(relevant.filter(e => e.code).map(e => e.code))]
  const failed = view.identityChanged || view.authRequired || view.loading ||
    view.route !== '/analytics' || errors.includes('REACT_321') ||
    errors.includes('REACT_INVALID_HOOK_CALL') ||
    relevant.some(e => e.source === 'http' && e.status >= 500)
  checks.push({ label, ...view, errors, failed,
    collectionStatus: relevant.filter(e => e.path?.endsWith('/collection'))
      .map(e => ({ status: e.status, ownerAlias: e.ownerAlias || 'not-reported', code: e.code || null })),
  })
}

try {
  phase = 'initial'; phaseIndex = 0
  await page.goto(new URL('/analytics', base).href, { waitUntil: 'domcontentloaded' })
  if (/\/(login|sign-in|auth)\b/.test(new URL(page.url()).pathname)) {
    throw new Error('BLOCKED_UNAUTHENTICATED: log in directly in the isolated Edge profile')
  }
  await inspect('initial direct open')

  for (let i = 1; i <= repeat; i++) {
    phase = 'reload'; phaseIndex = i
    await page.reload({ waitUntil: 'domcontentloaded' })
    await inspect('F5 hard reload ' + i)
  }
  for (let i = 1; i <= repeat; i++) {
    phase = 'route'; phaseIndex = i
    await page.goto(new URL('/shifts', base).href, { waitUntil: 'domcontentloaded' })
    await page.goto(new URL('/analytics', base).href, { waitUntil: 'domcontentloaded' })
    await inspect('route cycle ' + i)
  }
  const failureCount = checks.filter(c => c.failed).length
  const ownerAliases = [...new Set(events.filter(e => e.ownerAlias).map(e => e.ownerAlias))]
  const report = {
    target: base.origin,
    runAt: new Date().toISOString(),
    requestedIterations: repeat,
    checks: checks.length,
    failed: failureCount,
    distinctResponseOwners: ownerAliases.length,
    // No usernames, emails, auth tokens, cookies, request query parameters,
    // report rows, user IDs, or response bodies are written.
    observations: checks,
  }
  const folder = await mkdtemp(join(tmpdir(), 'ada-analytics-cdp-'))
  const resultPath = join(folder, 'sanitized-results.json')
  await writeFile(resultPath, JSON.stringify(report, null, 2), { mode: 0o600 })
  console.log(JSON.stringify({ verdict: failureCount ? 'FAIL' : 'PASS',
    checks: checks.length, failed: failureCount, distinctResponseOwners: ownerAliases.length,
    localEvidence: resultPath }, null, 2))
  if (failureCount) process.exitCode = 1
} finally {
  // Close only the CDP connection. Do not sign out or close the user's Edge profile.
  await browser.close()
}
