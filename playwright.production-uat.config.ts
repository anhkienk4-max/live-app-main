import { defineConfig } from '@playwright/test'
import { RC19_PRODUCTION_ORIGIN, RC19_PRODUCTION_SUPABASE_REF } from './lib/uat/rc19ProductionUatHostPolicy'

if (process.env.RC19_UAT_MODE !== 'production') {
  throw new Error('RC19_UAT_MODE must be explicitly set to production.')
}

const baseURL = process.env.PRODUCTION_UAT_BASE_URL
if (!baseURL || new URL(baseURL).origin !== RC19_PRODUCTION_ORIGIN || baseURL.replace(/\/$/, '') !== RC19_PRODUCTION_ORIGIN) {
  throw new Error('Production UAT requires the exact https://ops5729.top origin.')
}

if (process.env.PRODUCTION_UAT_SUPABASE_PROJECT_REF !== RC19_PRODUCTION_SUPABASE_REF) {
  throw new Error('Production UAT Supabase project reference does not match the verified Production project.')
}

if (!/^[a-f0-9]{40}$/.test(process.env.PRODUCTION_UAT_EXPECTED_SHA ?? '')) {
  throw new Error('Production UAT requires the exact deployed 40-character Git SHA.')
}

export default defineConfig({
  testDir: './e2e',
  testMatch: 'production-authenticated-uat.spec.ts',
  outputDir: 'test-results/production-auth-uat',
  timeout: 8 * 60_000,
  expect: { timeout: 15_000 },
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: RC19_PRODUCTION_ORIGIN,
    browserName: 'chromium',
    headless: false,
    viewport: { width: 1440, height: 1024 },
    screenshot: 'off',
    trace: 'off',
    video: 'off',
  },
})
