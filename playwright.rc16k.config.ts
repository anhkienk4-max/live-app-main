import { defineConfig } from '@playwright/test'
export default defineConfig({
  testDir: './e2e', testMatch: ['rc16k-ui.spec.ts','rc16k-route-audit.spec.ts','rc16k-reports.spec.ts'], workers: 1, timeout: 120000,
  expect: { timeout: 20000 },
  use: { baseURL: 'http://127.0.0.1:3108', headless: true, trace: 'retain-on-failure' },
  reporter: [['list'], ['html', { outputFolder: 'rc16k-browser-report', open: 'never' }]],
  webServer: {
    command: 'node node_modules/next/dist/bin/next dev --webpack --hostname 127.0.0.1 -p 3108',
    url: 'http://127.0.0.1:3108', reuseExistingServer: false, timeout: 180000,
    env: { NEXT_PUBLIC_USE_MOCK_DATA: 'true', NEXT_PUBLIC_ENABLE_MOCK_USER_SWITCHER: 'true',
      NEXT_PUBLIC_SUPABASE_URL: '', NEXT_PUBLIC_SUPABASE_ANON_KEY: '', SUPABASE_URL: '', SUPABASE_SECRET_KEY: '',
      FEATURE_ACTUAL_STAFFING: 'false', FEATURE_PAYROLL: 'false', OPERATIONAL_STORAGE_ROUTING_MODE: 'database' },
  },
})
