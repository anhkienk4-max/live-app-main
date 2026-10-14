import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './e2e', testMatch: process.env.RC16L_PERF_ONLY === 'true' ? ['rc16l-performance.spec.ts'] : ['rc16l-calendar.spec.ts'], workers: 1, timeout: 90000,
  expect: { timeout: 20000 }, use: { baseURL: 'http://127.0.0.1:3109', headless: true, trace: 'retain-on-failure' },
  reporter: [['list'], ['html', { outputFolder: 'rc16l-browser-report', open: 'never' }]],
  webServer: { command: 'node node_modules/next/dist/bin/next dev --webpack --hostname 127.0.0.1 -p 3109',
    url: 'http://127.0.0.1:3109', reuseExistingServer: false, timeout: 180000,
    env: { NEXT_PUBLIC_USE_MOCK_DATA: 'true', NEXT_PUBLIC_ENABLE_MOCK_USER_SWITCHER: 'true',
      NEXT_PUBLIC_SUPABASE_URL: '', NEXT_PUBLIC_SUPABASE_ANON_KEY: '', SUPABASE_URL: '', SUPABASE_SECRET_KEY: '',
      FEATURE_ACTUAL_STAFFING: 'false', FEATURE_PAYROLL: 'false', OPERATIONAL_STORAGE_ROUTING_MODE: 'database' } },
})
