import { defineConfig } from '@playwright/test'
export default defineConfig({
 testDir: './e2e', testMatch: process.env.RC17D_AUTH ? 'rc17d-auth.spec.ts' : ['rc17d-responsive.spec.ts', 'rc17d-workflows.spec.ts'], timeout: 300000, workers: 1,
 outputDir: 'test-results/rc17d-'+(process.env.RC17D_PHASE || 'after')+'-'+(process.env.RC17D_SUITE || 'matrix'),
 reporter: [['list'], ['json', {outputFile: 'test-results/rc17d-'+(process.env.RC17D_PHASE || 'after')+'-'+(process.env.RC17D_SUITE || 'matrix')+'/playwright.json'}]],
 use: {baseURL: (process.env.RC17D_AUTH ? 'http://127.0.0.1:3118' : 'http://127.0.0.1:3117'), headless: true, actionTimeout: 15000, navigationTimeout: 30000, screenshot: 'only-on-failure'},
 webServer: { command: 'corepack pnpm exec next dev --port '+(process.env.RC17D_AUTH ? '3118' : '3117'), url: (process.env.RC17D_AUTH ? 'http://127.0.0.1:3118/login' : 'http://127.0.0.1:3117/login'), timeout: 180000, reuseExistingServer: !process.env.CI,
 env: {NEXT_PUBLIC_USE_MOCK_DATA:process.env.RC17D_AUTH ? 'false' : 'true', NEXT_PUBLIC_SUPABASE_URL:process.env.RC17D_AUTH ? 'https://auth-test.supabase.co' : '', NEXT_PUBLIC_SUPABASE_ANON_KEY:process.env.RC17D_AUTH ? 'public-test-key' : '', SUPABASE_URL:'', SUPABASE_SECRET_KEY:'', VERCEL_ENV:'', VERCEL:''}},
})
