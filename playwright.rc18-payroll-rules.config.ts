import { defineConfig } from '@playwright/test'

// Isolated mock-only UI smoke. NOT authenticated staging/production validation.
export default defineConfig({
  testDir: './e2e',
  testMatch: ['rc18-payroll-room-rules.spec.ts'],
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 25_000 },
  use: { baseURL: 'http://127.0.0.1:3122', headless: true, trace: 'retain-on-failure' },
  webServer: {
    command: 'node node_modules/next/dist/bin/next dev --webpack -p 3122',
    url: 'http://127.0.0.1:3122', reuseExistingServer: !process.env.CI, timeout: 180_000,
    env: { NEXT_PUBLIC_USE_MOCK_DATA:'true', NEXT_PUBLIC_ENABLE_MOCK_USER_SWITCHER:'true',
      NEXT_PUBLIC_SUPABASE_URL:'', NEXT_PUBLIC_SUPABASE_ANON_KEY:'', SUPABASE_URL:'',
      SUPABASE_SECRET_KEY:'', OPERATIONAL_STORAGE_ROUTING_MODE:'compat' },
  },
})
