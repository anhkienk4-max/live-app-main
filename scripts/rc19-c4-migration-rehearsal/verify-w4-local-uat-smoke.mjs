#!/usr/bin/env node
/**
 * RC19 W4 Local Runtime Playwright Browser Smoke Verifier
 *
 * Verifies Admin, Leader (Brand A scoped), and Member (Host) logins on
 * http://127.0.0.1:3102/login and confirms /calendar, /swaps, and /payroll?tab=personal
 * load cleanly against the local Supabase proxy (http://127.0.0.1:15546) and WSL PG 17.11.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'

const require = createRequire(import.meta.url)
const { chromium } = require('playwright')

const webBase = process.env.W4_WEB_BASE_URL || 'http://127.0.0.1:3102'
const runtimeConfigPath =
  process.env.W4_RUNTIME_CONFIG_PATH ||
  '\\\\wsl.localhost\\Ubuntu-24.04\\home\\anhkienk4\\.local\\share\\rc19-c511-native\\runtime.json'

const evidenceFile = path.resolve(
  process.cwd(),
  'scripts/rc19-c4-migration-rehearsal/evidence/w4-final-integration-20261118/local-uat-smoke.json',
)

const rolesToVerify = [
  {
    key: 'admin',
    email: 'w4.admin@c511.invalid',
    routes: ['/calendar', '/swaps', '/payroll?tab=personal'],
    expectBrandAShift: true,
    expectBrandBShift: true,
  },
  {
    key: 'leader',
    email: 'w4.leader@c511.invalid',
    routes: ['/calendar', '/swaps', '/payroll?tab=personal'],
    expectBrandAShift: true,
    expectBrandBShift: false,
  },
  {
    key: 'member_host',
    email: 'w4.member.host@c511.invalid',
    routes: ['/calendar', '/swaps', '/payroll?tab=personal'],
    expectBrandAShift: true,
    expectBrandBShift: false,
  },
]

async function verifyRole(browser, roleSpec, password) {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()
  const serverErrors = []
  const authOrRestCalls = []

  page.on('response', (res) => {
    const status = res.status()
    const url = res.url()
    if (status >= 500) {
      serverErrors.push({ status, url })
    }
    if (url.startsWith('http://127.0.0.1:15546/') || url.includes('/api/')) {
      try {
        const u = new URL(url)
        authOrRestCalls.push({ status, origin: u.origin, pathname: u.pathname })
      } catch {
        authOrRestCalls.push({ status, url })
      }
    }
  })

  await page.goto(`${webBase}/login`, { waitUntil: 'networkidle' })
  await page.getByTestId('email-input').fill(roleSpec.email)
  await page.getByTestId('password-input').fill(password)
  await page.getByTestId('email-login-btn').click()

  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 20000 })
  await page.waitForTimeout(1000)

  const routeChecks = []
  for (const route of roleSpec.routes) {
    await page.goto(`${webBase}${route}`, { waitUntil: 'networkidle' })
    await page.waitForTimeout(1200)
    const finalUrl = page.url()
    if (new URL(finalUrl).pathname.startsWith('/login')) {
      throw new Error(`UNEXPECTED_LOGIN_REDIRECT role=${roleSpec.key} route=${route} final=${finalUrl}`)
    }
    const bodyText = await page.locator('body').innerText()
    const check = {
      route,
      final_path: new URL(finalUrl).pathname + new URL(finalUrl).search,
      text_length: bodyText.trim().length,
      has_brand_a_shift_text: bodyText.includes('W4 UAT Brand A'),
      has_brand_b_shift_text: bodyText.includes('W4 UAT Brand B'),
    }
    if (route === '/calendar') {
      if (roleSpec.expectBrandBShift === false && check.has_brand_b_shift_text) {
        throw new Error(`BRAND_B_SCOPE_LEAK role=${roleSpec.key} on /calendar`)
      }
    }
    routeChecks.push(check)
  }

  const payslipRes = await page.request.get(`${webBase}/api/workforce/my-payslip?year=2026`)
  const payslipStatus = payslipRes.status()
  if (payslipStatus < 200 || payslipStatus >= 300) {
    throw new Error(`MY_PAYSLIP_API_FAILED role=${roleSpec.key} status=${payslipStatus}`)
  }

  const hasLocalProxyTraffic = authOrRestCalls.some((c) => c.origin === 'http://127.0.0.1:15546' && c.status >= 200 && c.status < 300)
  if (!hasLocalProxyTraffic) {
    throw new Error(`NO_LOCAL_SUPABASE_PROXY_TRAFFIC_OBSERVED role=${roleSpec.key}`)
  }
  if (serverErrors.length > 0) {
    throw new Error(`SERVER_5XX_OBSERVED role=${roleSpec.key}: ${JSON.stringify(serverErrors)}`)
  }

  await context.close()
  return {
    role: roleSpec.key,
    email: roleSpec.email,
    login_ok: true,
    routes: routeChecks,
    my_payslip_api_status: payslipStatus,
    proxy_2xx_calls: authOrRestCalls.filter((c) => c.origin === 'http://127.0.0.1:15546' && c.status >= 200 && c.status < 300).length,
    server_5xx_count: serverErrors.length,
  }
}

async function main() {
  const cfg = JSON.parse(readFileSync(runtimeConfigPath, 'utf8'))
  if (!cfg.test_password) {
    throw new Error('RUNTIME_CONFIG_MISSING_TEST_PASSWORD')
  }

  const browser = await chromium.launch({ headless: true })
  try {
    const roleResults = []
    for (const roleSpec of rolesToVerify) {
      roleResults.push(await verifyRole(browser, roleSpec, cfg.test_password))
    }

    const report = {
      status: 'PASS',
      verified_at_utc: new Date().toISOString(),
      web_base: webBase,
      database: cfg.database,
      database_marker: cfg.runtime_marker,
      roles: roleResults,
    }
    mkdirSync(path.dirname(evidenceFile), { recursive: true })
    writeFileSync(evidenceFile, JSON.stringify(report, null, 2))
    console.log(JSON.stringify(report, null, 2))
  } finally {
    await browser.close()
  }
}

main().catch((err) => {
  console.error('LOCAL_UAT_SMOKE_FAILED:', err instanceof Error ? err.message : String(err))
  process.exit(1)
})
