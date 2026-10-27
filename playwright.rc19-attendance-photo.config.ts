import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  testMatch: ['rc19-attendance-photo-methods.spec.ts'],
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 20_000 },
  use: { baseURL: 'http://127.0.0.1:3134', headless: true, trace: 'retain-on-failure' },
  webServer: {
    command: 'node node_modules/next/dist/bin/next dev --webpack -p 3134',
    url: 'http://127.0.0.1:3134',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      NEXT_PUBLIC_USE_MOCK_DATA: 'true',
      NEXT_PUBLIC_ENABLE_MOCK_USER_SWITCHER: 'true',
      NEXT_PUBLIC_FEATURE_SELF_ATTENDANCE: 'true',
      NEXT_PUBLIC_FEATURE_SELF_ATTENDANCE_PHOTO: 'true',
      NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'public-test-key',
      SUPABASE_URL: 'http://127.0.0.1:54321',
      SUPABASE_SECRET_KEY: 'mock-only',
      OPERATIONAL_STORAGE_ROUTING_MODE: 'compat',
    },
  },
})
