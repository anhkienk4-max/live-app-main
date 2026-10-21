import { defineConfig } from '@playwright/test'

const baseURL = process.env.PREVIEW_UAT_BASE_URL
if (!baseURL) throw new Error('PREVIEW_UAT_BASE_URL must point to an authorized Vercel Preview deployment.')

const previewURL = new URL(baseURL)
if (
  previewURL.protocol !== 'https:'
  || !/^livestream-ops-demo-[a-z0-9]{9}-livestream2\.vercel\.app$/.test(previewURL.hostname)
) {
  throw new Error('Preview UAT requires a deployment-specific livestream-ops-demo Vercel URL; localhost and Production aliases are not allowed.')
}

export default defineConfig({
  testDir: './e2e',
  testMatch: 'preview-authenticated-uat.spec.ts',
  outputDir: 'test-results/preview-auth-uat',
  timeout: 8 * 60_000,
  expect: { timeout: 15_000 },
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: previewURL.origin,
    browserName: 'chromium',
    headless: false,
    viewport: { width: 1440, height: 1024 },
    screenshot: 'off',
    trace: 'off',
    video: 'off',
  },
})
