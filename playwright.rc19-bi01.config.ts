import { defineConfig } from '@playwright/test'

/** Isolated mock-only responsive BI composer smoke; not authenticated or Production UAT. */
export default defineConfig({
  testDir: './e2e',
  testMatch: ['rc19-bi01-analytics.spec.ts'],
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 30_000 },
  use: { baseURL: 'http://127.0.0.1:3120', headless: true, trace: 'retain-on-failure' },
  webServer: {
    command: 'node node_modules/next/dist/bin/next dev --webpack -p 3120',
    url: 'http://127.0.0.1:3120',
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
