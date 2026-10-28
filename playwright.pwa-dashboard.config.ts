import { defineConfig, devices } from '@playwright/test'

/** Local mock only, no Supabase credentials or production mutations. */
export default defineConfig({
  testDir: './e2e',
  testMatch: /pwa-(?:dashboard|staff|consistency)-mobile\.spec\.ts/,
  timeout: 60000,
  retries: 0,
  workers: 1,
  use: { ...devices['Desktop Chrome'], baseURL: 'http://127.0.0.1:3104', headless: true, trace: 'retain-on-failure' },
  webServer: {
    command: 'pnpm dev -p 3104 -H 127.0.0.1',
    url: 'http://127.0.0.1:3104/login',
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
