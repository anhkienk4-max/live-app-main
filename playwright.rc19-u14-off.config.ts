import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  testMatch: ['rc19-u14-self-attendance.spec.ts'],
  grep: /flag OFF/,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 20_000 },
  use: {
    baseURL: 'http://127.0.0.1:3131',
    headless: true,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node node_modules/next/dist/bin/next dev --webpack -p 3131',
    url: 'http://127.0.0.1:3131',
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      NEXT_PUBLIC_USE_MOCK_DATA: 'true',
      NEXT_PUBLIC_ENABLE_MOCK_USER_SWITCHER: 'true',
      NEXT_PUBLIC_FEATURE_SELF_ATTENDANCE: 'false',
      NEXT_PUBLIC_FEATURE_SELF_ATTENDANCE_PHOTO: 'false',
      NEXT_PUBLIC_SUPABASE_URL: '',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: '',
      SUPABASE_URL: '',
      SUPABASE_SECRET_KEY: '',
      OPERATIONAL_STORAGE_ROUTING_MODE: 'compat',
    },
  },
})
