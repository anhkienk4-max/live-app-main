import { defineConfig, devices } from '@playwright/test'

/** Isolated PWA Login visual QA, does not touch Production or authenticate users. */
export default defineConfig({
  testDir: './e2e',
  testMatch: /pwa-login-visual\.spec\.ts/,
  timeout: 45000,
  fullyParallel: false,
  workers: 1,
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://127.0.0.1:3101',
    headless: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'pnpm exec next start -p 3101 -H 127.0.0.1',
    url: 'http://127.0.0.1:3101/login',
    timeout: 120000,
    reuseExistingServer: false,
  },
})
