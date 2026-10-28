import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  testMatch: ['rc19-auth-zoom-accessibility.spec.ts'],
  workers: 1,
  timeout: 90000,
  expect: { timeout: 20000 },
  use: {
    baseURL: 'http://127.0.0.1:3111',
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'node --import ./tests/typescript-alias-loader.mjs scripts/check-runtime-environment.ts development && corepack pnpm exec next dev --webpack -p 3111',
    url: 'http://127.0.0.1:3111',
    reuseExistingServer: !process.env.CI,
    timeout: 180000,
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
