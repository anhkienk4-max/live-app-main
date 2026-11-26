import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { chromium } from '@playwright/test'

const PORT = 3108
const BASE_URL = `http://127.0.0.1:${PORT}`
const OUTPUT_DIR = path.resolve('artifacts/deltad-acceptance-screenshots')

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true })
}

const VIEWPORTS = [
  { width: 320, height: 600, label: '320px', isMobile: true },
  { width: 390, height: 844, label: '390px', isMobile: true },
  { width: 768, height: 1024, label: '768px', isMobile: false },
  { width: 1440, height: 900, label: '1440px', isMobile: false },
]

const SCENARIOS = [
  {
    id: '01-replacement-dialog',
    name: 'Replacement dialog opening & fields',
    selector: '[data-testid="scenario-01-replacement-dialog"]',
  },
  {
    id: '02-incident-classification',
    name: 'Incident classification dropdown selections',
    selector: '[data-testid="scenario-02-incident-classification"]',
  },
  {
    id: '03-evidence-disabled',
    name: 'Evidence input disabled + capability unavailable badge',
    selector: '[data-testid="evidence-capability-unavailable"]',
  },
  {
    id: '04-note-save-draft',
    name: 'Note Save Draft with Dirty -> Saving -> Saved badges',
    selector: '[data-testid="scenario-04-note-save-draft"]',
  },
  {
    id: '05-note-resume-draft',
    name: 'Resume/Edit Draft with draft version badge and cancel',
    selector: '[data-testid="scenario-05-note-resume-draft"]',
  },
  {
    id: '06-note-cas-conflict',
    name: 'CAS conflict error toast on mismatched note version',
    selector: '[data-testid="scenario-06-note-cas-conflict"]',
  },
  {
    id: '07-incident-review-badges',
    name: 'Incident review UI badges (Pending, Confirmed, Rejected, Corrected)',
    selector: '[data-testid="scenario-07-incident-review-badges"]',
  },
  {
    id: '08-employee-history',
    name: 'Employee History panel with role, date, verified late minutes, replacement staff, and scope guard',
    selector: '[data-testid="scenario-08-employee-history"]',
  },
  {
    id: '09-workforce-filters-drilldown',
    name: 'Workforce filters (8 filters) and staff drilldown table',
    selector: '[data-testid="workforce-incident-summary-panel"]',
  },
  {
    id: '10-report-notes-review',
    name: 'Report selection and External-Safe pending notice',
    selector: '[data-testid="scenario-10-report-notes-review"]',
  },
  {
    id: '11-backend-unavailable',
    name: 'Backend unavailable fail-closed states (SCHEMA_NOT_DEPLOYED)',
    selector: '[data-testid="scenario-11-backend-unavailable"]',
  },
  {
    id: '12-legacy-c4-compatibility',
    name: 'Legacy C4 compatibility validation',
    selector: '[data-testid="scenario-12-legacy-c4-compatibility"]',
  },
]

async function waitForServer(url, timeoutMs = 45000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url)
      if (res.status === 200 || res.status === 307 || res.status === 308) {
        return true
      }
    } catch {
      // Retry
    }
    await new Promise(r => setTimeout(r, 600))
  }
  throw new Error(`Server at ${url} did not become ready within ${timeoutMs}ms`)
}

async function main() {
  console.log('==================================================================')
  console.log('RC19 W4 DELTA D FRONTEND PLAYWRIGHT BROWSER ACCEPTANCE SUITE')
  console.log('Viewports: 320px, 390px, 768px, 1440px')
  console.log('12 Scenarios · Capturing to artifacts/deltad-acceptance-screenshots')
  console.log('==================================================================\n')

  let devServer = null
  let isExternalServer = false

  try {
    const probe = await fetch(`${BASE_URL}/visual-qa?scenario=deltad`).catch(() => null)
    if (probe && probe.status === 200) {
      console.log(`Reusing existing dev server on port ${PORT}...`)
      isExternalServer = true
    } else {
      console.log(`Starting isolated Next.js dev server on port ${PORT}...`)
      devServer = spawn(
        'node',
        ['node_modules/next/dist/bin/next', 'dev', '-p', String(PORT), '-H', '127.0.0.1'],
        {
          env: {
            ...process.env,
            PORT: String(PORT),
            HOSTNAME: '127.0.0.1',
            NEXT_PUBLIC_USE_MOCK_DATA: 'true',
            NEXT_PUBLIC_VISUAL_FIXTURES: 'true',
          },
          stdio: 'ignore',
        },
      )

      await waitForServer(`${BASE_URL}/visual-qa?scenario=deltad`)
      console.log(`Next.js server is ready at ${BASE_URL}\n`)
    }

    console.log('Launching Chromium...')
    const browser = await chromium.launch({ headless: true })

    const testResults = []

    for (const vp of VIEWPORTS) {
      console.log(`\n--------------------------------------------------------------`)
      console.log(`Testing Viewport: ${vp.label} (${vp.width}x${vp.height})`)
      console.log(`--------------------------------------------------------------`)

      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        isMobile: vp.isMobile,
        deviceScaleFactor: vp.isMobile ? 2 : 1,
      })

      const page = await context.newPage()

      for (const scenario of SCENARIOS) {
        const scenarioUrl = `${BASE_URL}/visual-qa?scenario=deltad&case=${scenario.id}`
        const startTime = Date.now()

        try {
          await page.goto(scenarioUrl, { waitUntil: 'domcontentloaded', timeout: 15000 })
          await page.waitForSelector(scenario.selector, { timeout: 10000 })

          // Specific interactive manipulations for specific scenarios
          if (scenario.id === '02-incident-classification') {
            const selectEl = page.locator('[data-testid="incident-classification-select"]')
            if (await selectEl.isVisible()) {
              await selectEl.selectOption('skip')
            }
          }

          if (scenario.id === '08-employee-history') {
            const toggleBtn = page.locator('button:has-text("Chuyển sang Member khác")')
            if (await toggleBtn.isVisible()) {
              // Click to show scope denied on employee history
              await toggleBtn.click()
              await page.waitForSelector('[data-testid="staff-incident-scope-denied"]', { timeout: 3000 })
            }
          }

          if (scenario.id === '10-report-notes-review') {
            const extBtn = page.locator('button:has-text("Đối ngoại (External)")')
            if (await extBtn.isVisible()) {
              await extBtn.click()
              await page.waitForTimeout(300)
            }
          }

          // Small settle time for rendering
          await page.waitForTimeout(200)

          const screenshotFilename = `deltad_${scenario.id.replace(/-/g, '_')}_${vp.label}.png`
          const screenshotPath = path.join(OUTPUT_DIR, screenshotFilename)
          await page.screenshot({ path: screenshotPath, fullPage: false })

          const durationMs = Date.now() - startTime
          console.log(`  ✓ [PASS] ${scenario.id.padEnd(30)} @ ${vp.label.padEnd(6)} (${durationMs}ms) -> ${screenshotFilename}`)

          testResults.push({
            scenarioId: scenario.id,
            scenarioName: scenario.name,
            viewport: vp.label,
            dimensions: `${vp.width}x${vp.height}`,
            status: 'PASS',
            durationMs,
            screenshot: screenshotFilename,
          })
        } catch (err) {
          const durationMs = Date.now() - startTime
          console.error(`  ✗ [FAIL] ${scenario.id} @ ${vp.label}: ${err.message}`)
          testResults.push({
            scenarioId: scenario.id,
            scenarioName: scenario.name,
            viewport: vp.label,
            dimensions: `${vp.width}x${vp.height}`,
            status: 'FAIL',
            durationMs,
            error: err.message,
          })
        }
      }

      await context.close()
    }

    await browser.close()
    console.log('\nChromium browser closed.')

    // Write JSON manifest
    const manifestPath = path.join(OUTPUT_DIR, 'deltad-browser-acceptance-report.json')
    fs.writeFileSync(
      manifestPath,
      JSON.stringify(
        {
          timestamp: new Date().toISOString(),
          totalTests: testResults.length,
          passed: testResults.filter(r => r.status === 'PASS').length,
          failed: testResults.filter(r => r.status === 'FAIL').length,
          viewports: VIEWPORTS.map(v => v.label),
          scenarios: SCENARIOS.map(s => ({ id: s.id, name: s.name })),
          results: testResults,
        },
        null,
        2,
      ),
    )
    console.log(`Acceptance report saved to: ${manifestPath}`)

    const passCount = testResults.filter(r => r.status === 'PASS').length
    const failCount = testResults.filter(r => r.status === 'FAIL').length

    console.log('\n==================================================================')
    console.log(`SUMMARY: ${passCount}/${testResults.length} Playwright checks PASSED (${failCount} failed)`)
    console.log('==================================================================\n')

    if (failCount > 0) {
      process.exitCode = 1
    }
  } finally {
    if (devServer && !isExternalServer) {
      console.log('Shutting down isolated Next.js dev server...')
      devServer.kill('SIGINT')
    }
  }
}

main().catch(err => {
  console.error('FATAL in Playwright runner:', err)
  process.exit(1)
})
