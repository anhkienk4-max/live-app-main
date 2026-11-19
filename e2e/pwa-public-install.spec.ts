import { expect, test } from '@playwright/test'

test('unauthenticated phones can fetch correct PWA manifest and all image assets', async ({ request }) => {
  const result = await request.get('/manifest.webmanifest', { maxRedirects: 0 })
  expect(result.status()).toBe(200)
  expect(result.headers()['content-type']).toContain('application/manifest+json')
  const manifest = await result.json()
  expect(manifest.name).toBe('ADA OPS LIVESTREAM')
  expect(manifest.display).toBe('standalone')
  expect(manifest.start_url).toBe('/')
  expect(manifest.icons).toEqual(expect.arrayContaining([
    expect.objectContaining({ src: '/icon1', sizes: '192x192' }),
    expect.objectContaining({ src: '/icon2', sizes: '512x512' }),
    expect.objectContaining({ src: '/icon3', sizes: '512x512', purpose: 'maskable' }),
  ]))
  expect(manifest.shortcuts.map((x: { url: string }) => x.url)).toEqual(['/calendar', '/profile', '/notifications'])

  for (const [path, size] of [['/icon1',192], ['/icon2',512], ['/icon3',512], ['/icon',512], ['/apple-icon',180]] as const) {
    const r = await request.get(path, { maxRedirects: 0 })
    expect(r.status(), path + ' status').toBe(200)
    expect(r.headers()['content-type'], path).toContain('image/png')
    const bytes = await r.body()
    expect(bytes.subarray(0,8).toString('hex'), path + ' PNG signature').toBe('89504e470d0a1a0a')
    expect(bytes.readUInt32BE(16), path + ' width').toBe(size)
    expect(bytes.readUInt32BE(20), path + ' height').toBe(size)
  }
  const splash = await request.get('/pwa-splash', { maxRedirects: 0 })
  expect(splash.status()).toBe(200)
  expect(splash.headers()['content-type']).toContain('image/png')
})

test('fix does not open protected app routes to unauthenticated visitors', async ({ request }) => {
  for (const path of ['/', '/calendar', '/profile', '/notifications', '/settings']) {
    const r = await request.get(path, { maxRedirects: 0 })
    expect([307,308]).toContain(r.status())
    expect(r.headers()['location']).toMatch(/\/login\?reason=(auth_unavailable|session_expired)/)
  }
})

test('mobile login has a working install help control without a false native prompt', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/login', { waitUntil: 'domcontentloaded' })
  const button = page.getByTestId('pwa-install-button')
  await expect(button).toBeVisible()
  await button.click()
  await expect(page.getByTestId('pwa-install-help')).toBeVisible()
  await expect(page.getByTestId('pwa-install-help')).toContainText('Thêm vào màn hình chính')
})
