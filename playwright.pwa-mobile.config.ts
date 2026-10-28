import { defineConfig, devices } from '@playwright/test'

// Local-only in-memory UI validation. The runtime guard rejects mock mode on
// deployed environments, and this suite never supplies Supabase credentials.
export default defineConfig({
  testDir: './e2e',
  testMatch: /pwa-mobile-ops\.spec\.ts/,
  timeout: 60000,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://127.0.0.1:3102',
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'pnpm dev -p 3102 -H 127.0.0.1',
    url: 'http://127.0.0.1:3102/login',
    timeout: 180000,
    reuseExistingServer: false,
    env: {
      NEXT_PUBLIC_USE_MOCK_DATA: 'true',
      NEXT_PUBLIC_VISUAL_FIXTURES: 'false',
      NEXT_PUBLIC_SUPABASE_URL: '',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: '',
      SUPABASE_URL: '',
      SUPABASE_SECRET_KEY: '',
      VERCEL: '',
      VERCEL_ENV: '',
      VERCEL_TARGET_ENV: '',
    },
  },
})
