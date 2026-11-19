import { defineConfig, devices } from '@playwright/test'

/**
 * Manual, credentialed, read-only UAT. Requires E2E_BASE_URL + three test identities.
 * Deliberately isolated from mock CI, without screenshot/trace/video persistence.
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: /pwa-functional-staging\.uat\.spec\.ts/,
  timeout: 90000,
  expect: { timeout: 20000 },
  retries: 0,
  workers: 1,
  reporter: [
    ['list'],
    ['json', { outputFile: 'test-results/pwa-functional-staging.json' }],
  ],
  use: {
    ...devices['Desktop Chrome'],
    baseURL: process.env.E2E_BASE_URL ?? 'http://127.0.0.1:0',
    headless: true,
    screenshot: 'off',
    trace: 'off',
    video: 'off',
  },
})
