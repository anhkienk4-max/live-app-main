import { defineConfig } from '@playwright/test'

/**
 * Isolated local browser smoke for Analytics with mock-only data.
 * This is NOT authenticated Staging or Production UAT.
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: ['rc18-analytics-browser.spec.ts'],
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 30_000 },
  use: {
    baseURL: 'http://127.0.0.1:3118',
    headless: true,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node node_modules/next/dist/bin/next dev --webpack -p 3118',
    url: 'http://127.0.0.1:3118',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      NEXT_PUBLIC_USE_MOCK_DATA: 'true',
      NEXT_PUBLIC_ENABLE_MOCK_USER_SWITCHER: 'true',
      NEXT_PUBLIC_SUPABASE_URL: '',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: '',
      SUPABASE_URL: '',
      SUPABASE_SECRET_KEY: '',
      OPERATIONAL_STORAGE_ROUTING_MODE: 'compat',
    },
  },
})
