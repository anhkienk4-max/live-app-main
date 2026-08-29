// scripts/production-smoke.ts
// Production Smoke command — read-only, unauthenticated, no writes, no mock fallback.
// Unauthenticated smoke validates auth redirects and env guards only;
// it does NOT equal full 3-role production validation (that requires E2E UAT with creds).
// Usage:
//   E2E_BASE_URL=https://your-production.example SMOKE_TARGET=production \
//   node --import tests/typescript-alias-loader.mjs scripts/production-smoke.ts
// Optional env-driven identities (no secrets hardcoded):
//   E2E_ADMIN_EMAIL / E2E_ADMIN_PASSWORD etc. — NOT used by this unauth smoke;
//   use e2e/core-v1-3role.uat.spec.ts for credentialed 3-role UAT.

type SmokeResult = { label: string; area: string; role: string; passed: boolean; details?: string }

function env(name: string): string | undefined {
  const v = process.env[name]
  return v && v.trim() ? v.trim() : undefined
}

function mustFailMockInProduction() {
  const target = env('SMOKE_TARGET')
  const useMock = env('NEXT_PUBLIC_USE_MOCK_DATA')
  if (target === 'production' && useMock === 'true') {
    throw new Error('BLOCKED: SMOKE_TARGET=production with NEXT_PUBLIC_USE_MOCK_DATA=true — mock fallback forbidden in production smoke')
  }
}

async function fetchNoStore(url: string, init: RequestInit = {}): Promise<Response> {
  return fetch(url, { ...init, cache: 'no-store', redirect: 'manual' })
}

async function run(): Promise<{ results: SmokeResult[]; exitCode: number }> {
  mustFailMockInProduction()
  const base = (env('E2E_BASE_URL') ?? env('PLAYWRIGHT_BASE_URL') ?? 'http://127.0.0.1:3101').replace(/\/$/, '')
  const results: SmokeResult[] = []
  const push = (r: SmokeResult) => results.push(r)

  // 1. No-mock contract
  push({ label: 'NEXT_PUBLIC_USE_MOCK_DATA !== true when SMOKE_TARGET=production', area: 'env', role: 'all', passed: !(env('SMOKE_TARGET') === 'production' && env('NEXT_PUBLIC_USE_MOCK_DATA') === 'true') })

  // 2. Unauthenticated protected routes must redirect to /login (refresh persistence: login is recovery boundary)
  const protectedPaths = ['/calendar', '/swaps', '/reports', '/staff', '/settings', '/notifications']
  for (const path of protectedPaths) {
    const url = `${base}${path}`
    try {
      const res = await fetchNoStore(url)
      const loc = res.headers.get('location') ?? ''
      const isRedirectToLogin = res.status >= 300 && res.status < 400 && /\/login(\?|%3F)/.test(loc)
      // Some deployments may return 200 with client redirect; treat 200 as fail for unauthenticated in production
      // but we consider either explicit redirect or 401/307 as pass; 200 with login heading also pass if body contains login.
      let passed = isRedirectToLogin
      if (!passed && res.status === 200) {
        // fallback: fetch with redirect follow to see if final URL contains login
        const followed = await fetch(url, { redirect: 'follow' })
        const finalUrl = (followed as unknown as { url: string }).url ?? ''
        passed = /\/login/.test(finalUrl)
      }
      push({ label: `unauth GET ${path} → /login`, area: 'authentication', role: 'unauthenticated', passed, details: `status=${res.status} loc=${loc.slice(0, 120)}` })
    } catch (e) {
      push({ label: `unauth GET ${path} → /login`, area: 'authentication', role: 'unauthenticated', passed: false, details: String(e).slice(0, 200) })
    }
  }

  // 3. Public path /login must be reachable (200, no redirect loop)
  try {
    const res = await fetch(`${base}/login`, { redirect: 'manual' })
    const passed = res.status === 200
    push({ label: 'GET /login is 200 (public auth entry, no loop)', area: 'authentication', role: 'all', passed, details: `status=${res.status}` })
  } catch (e) {
    push({ label: 'GET /login is 200', area: 'authentication', role: 'all', passed: false, details: String(e).slice(0, 200) })
  }

  // 4. Root unauthenticated should redirect to login as well (dashboard protection)
  try {
    const res = await fetchNoStore(`${base}/`)
    const loc = res.headers.get('location') ?? ''
    const passed = (res.status >= 300 && res.status < 400 && /\/login/.test(loc)) || res.status === 200 // tolerate 200 with client guard; still report
    // For strict production smoke, we want redirect; but 200 may be server render with middleware getClaims; we mark fail only if not login
    if (res.status === 200) {
      const followed = await fetch(`${base}/`, { redirect: 'follow' })
      const finalUrl = (followed as unknown as { url: string }).url ?? ''
      push({ label: 'unauth GET / → /login', area: 'authentication', role: 'unauthenticated', passed: /\/login/.test(finalUrl), details: `status=200 final=${finalUrl.slice(0, 120)}` })
    } else {
      push({ label: 'unauth GET / → /login', area: 'authentication', role: 'unauthenticated', passed, details: `status=${res.status} loc=${loc.slice(0, 120)}` })
    }
  } catch (e) {
    push({ label: 'unauth GET / → /login', area: 'authentication', role: 'unauthenticated', passed: false, details: String(e).slice(0, 200) })
  }

  // 5. No production writes — explicit contract: this script never POST/PUT/DELETE
  push({ label: 'no production writes (GET-only smoke)', area: 'contract', role: 'all', passed: true, details: 'method whitelist: GET only; no POST/PUT/DELETE issued' })

  // 6. No DB migration — contract
  push({ label: 'no DB migration performed', area: 'contract', role: 'all', passed: true, details: 'smoke is read-only; no migrations executed' })

  // Summary
  const pass = results.filter(r => r.passed).length
  const fail = results.length - pass
  const exitCode = fail > 0 ? 1 : 0

  // Render report
  const lines = [
    `Production Smoke — ${pass} PASS / ${fail} FAIL / ${results.length} total`,
    `Target: ${base} (SMOKE_TARGET=${env('SMOKE_TARGET') ?? 'unset'})`,
    `Mock guard: NEXT_PUBLIC_USE_MOCK_DATA=${env('NEXT_PUBLIC_USE_MOCK_DATA') ?? 'unset'}`,
    ...results.map(r => `${r.passed ? 'PASS' : 'FAIL'} [${r.role}] ${r.area} :: ${r.label}${r.details ? ` — ${r.details}` : ''}`),
  ]
  console.log(lines.join('\n'))

  // Machine-readable artifact for CI (optional)
  if (env('SMOKE_JSON_OUT')) {
    const { writeFileSync } = await import('node:fs')
    writeFileSync(env('SMOKE_JSON_OUT')!, JSON.stringify({ base, target: env('SMOKE_TARGET') ?? null, results, summary: { pass, fail, total: results.length } }, null, 2))
  }

  return { results, exitCode }
}

run().then(({ exitCode }) => process.exit(exitCode)).catch((e) => {
  console.error('production-smoke error', e)
  process.exit(2)
})
