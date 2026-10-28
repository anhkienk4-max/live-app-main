import { defineConfig, devices } from '@playwright/test'

/** Credentialed Staging Preview UAT only; no mock server or screenshot upload. */
export default defineConfig({
  testDir: './e2e',
  testMatch: /pwa-dashboard-roles\.uat\.spec\.ts/,
  timeout: 90000,
  retries: 0,
  workers: 1,
  use: {
    ...devices['Desktop Chrome'],
    baseURL: process.env.E2E_BASE_URL ?? 'http://127.0.0.1:0',
    headless: true,
    trace: 'off',
    screenshot: 'off',
    video: 'off',
  },
})
