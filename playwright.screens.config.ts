import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  testMatch: ['capture-payroll-screens.spec.ts'],
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 20_000 },
  use: {
    baseURL: 'http://127.0.0.1:3107',
    headless: true,
    hasTouch: true,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node node_modules/next/dist/bin/next dev --webpack --hostname 127.0.0.1 -p 3107',
    url: 'http://127.0.0.1:3107',
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      NEXT_PUBLIC_USE_MOCK_DATA: 'true',
      NEXT_PUBLIC_ENABLE_MOCK_USER_SWITCHER: 'true',
      NEXT_PUBLIC_SUPABASE_URL: '',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: '',
      SUPABASE_URL: '',
      SUPABASE_SECRET_KEY: '',
      FEATURE_ACTUAL_STAFFING: 'true',
      FEATURE_PAYROLL: 'true',
      OPERATIONAL_STORAGE_ROUTING_MODE: 'compat',
    },
  },
})
