import { defineConfig, devices } from '@playwright/test'

/** No login, cookies, bypass headers or DB write calls. Smoke PWA metadata in unauthenticated mode. */
export default defineConfig({
  testDir: './e2e',
  testMatch: /pwa-public-install\.spec\.ts/,
  retries: 0,
  workers: 1,
  timeout: 45000,
  use: { ...devices['Desktop Chrome'], baseURL: 'http://127.0.0.1:3115', headless: true },
  webServer: {
    command: 'pnpm exec next start -p 3115 -H 127.0.0.1',
    url: 'http://127.0.0.1:3115/login',
    timeout: 120000,
    reuseExistingServer: false,
    env: {
      NEXT_PUBLIC_USE_MOCK_DATA: 'false',
      NEXT_PUBLIC_SUPABASE_URL: '',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: '',
      SUPABASE_URL: '',
      SUPABASE_SECRET_KEY: '',
    },
  },
})
