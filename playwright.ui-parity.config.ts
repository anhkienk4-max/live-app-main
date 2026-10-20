import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  testMatch: 'one-shot-ui-parity.spec.ts',
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 25_000 },
  reporter: [['list'], ['html', { outputFolder: 'ui-parity-browser-report', open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:3111',
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } } },
    { name: 'mobile', use: { ...devices['Pixel 5'], viewport: { width: 390, height: 844 } } },
  ],
  webServer: {
    command: 'node node_modules/next/dist/bin/next dev --webpack --hostname 127.0.0.1 -p 3111',
    url: 'http://127.0.0.1:3111',
    reuseExistingServer: false,
    timeout: 180_000,
    env: {
      NEXT_PUBLIC_USE_MOCK_DATA: 'true',
      NEXT_PUBLIC_ENABLE_MOCK_USER_SWITCHER: 'true',
      NEXT_PUBLIC_SUPABASE_URL: '',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: '',
      SUPABASE_URL: '',
      SUPABASE_SECRET_KEY: '',
      FEATURE_ACTUAL_STAFFING: 'false',
      FEATURE_PAYROLL: 'false',
      OPERATIONAL_STORAGE_ROUTING_MODE: 'database',
    },
  },
})
