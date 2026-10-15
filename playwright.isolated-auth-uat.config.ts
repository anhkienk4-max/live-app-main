import { defineConfig } from '@playwright/test'
import { resolve } from 'node:path'

const supabaseUrl = process.env.UAT_SUPABASE_URL
const anonKey = process.env.UAT_SUPABASE_ANON_KEY
const serviceKey = process.env.UAT_SUPABASE_SERVICE_KEY
const credentialsFile = process.env.UAT_CREDENTIALS_FILE
const evidenceDir = process.env.UAT_EVIDENCE_DIR

if (!supabaseUrl || !anonKey || !serviceKey || !credentialsFile || !evidenceDir) {
  throw new Error('ISOLATED_UAT_ENVIRONMENT_REQUIRED')
}

const target = new URL(supabaseUrl)
if (target.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(target.hostname)) {
  throw new Error('ISOLATED_UAT_LOOPBACK_TARGET_REQUIRED')
}

export default defineConfig({
  testDir: './e2e',
  testMatch: 'isolated-authenticated-uat.spec.ts',
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 20_000 },
  outputDir: resolve(evidenceDir, 'playwright-output'),
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:3109',
    headless: true,
    trace: 'off',
    video: 'off',
    screenshot: 'off',
  },
  webServer: {
    command: 'node node_modules/next/dist/bin/next dev --webpack --hostname 127.0.0.1 -p 3109',
    url: 'http://127.0.0.1:3109/login',
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      NEXT_PUBLIC_USE_MOCK_DATA: 'false',
      NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey,
      SUPABASE_URL: supabaseUrl,
      SUPABASE_SECRET_KEY: serviceKey,
      NEXT_PUBLIC_ENABLE_MOCK_USER_SWITCHER: 'false',
      FEATURE_ACTUAL_STAFFING: 'false',
      FEATURE_PAYROLL: 'false',
      OPERATIONAL_STORAGE_ROUTING_MODE: 'database',
    },
  },
})
