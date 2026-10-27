import { expect, test } from '@playwright/test'

async function openLeaderAudit(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    localStorage.setItem('livestream-ops-current-user', '2')
    localStorage.setItem('livestream-ops-language', 'vi')
  })
  await page.goto('/audit', { waitUntil: 'domcontentloaded' })
  await expect(page.locator('main').first()).toBeVisible({ timeout: 30000 })
}

test('RBAC01B 390px: already-loaded audit rows/details vanish on 403 and stay hidden on browser return', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  let allowed = true
  let requests = 0
  await page.route('**/api/audit/team-capability', async route => {
    requests++
    await route.fulfill({ status: allowed ? 200 : 403, contentType: 'application/json',
      headers: { 'cache-control': 'no-store' }, body: JSON.stringify(allowed ? { allowed: true, ok: true } : { ok: false }) })
  })
  await openLeaderAudit(page)
  await expect(page.getByText('Mock audit record', { exact: false }).first()).toBeVisible({ timeout: 30000 })
  const row = page.locator('tbody tr').first()
  if (await row.count()) await row.click()
  allowed = false
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await expect(page.getByText('Mock audit record', { exact: false })).toHaveCount(0)
  await expect(page.getByRole('alert').or(page.getByText(/không có quyền|Access denied|từ chối/i)).first()).toBeVisible()
  await page.evaluate(() => {
    document.dispatchEvent(new Event('visibilitychange'))
    window.dispatchEvent(new PageTransitionEvent('pageshow'))
  })
  await expect(page.getByText('Mock audit record', { exact: false })).toHaveCount(0)
  expect(requests).toBeGreaterThanOrEqual(2)
})
test('RBAC01B 768px: 500 network error fails closed, retry restores only after new 200', async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 900 })
  let code = 200
  await page.route('**/api/audit/team-capability', async route => {
    await route.fulfill({ status: code, contentType: 'application/json',
      body: code === 200 ? JSON.stringify({ok:true,allowed:true}) : JSON.stringify({ok:false}) })
  })
  await openLeaderAudit(page)
  await expect(page.getByText('Mock audit record', { exact: false }).first()).toBeVisible({ timeout: 30000 })
  code = 500
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await expect(page.getByText('Mock audit record', { exact: false })).toHaveCount(0)
  await expect(page.getByRole('alert')).toBeVisible()
  code = 200
  await page.getByRole('button', {name:/Try again|Thử lại/i}).first().click()
  await expect(page.getByText('Mock audit record', { exact: false }).first()).toBeVisible({timeout:30000})
})
test('RBAC01B 1440px: stale capability ALLOW cannot override later denied request', async ({ page }) => {
  await page.setViewportSize({width:1440,height:900})
  let phase: 'initial'|'slow'|'denied' = 'initial'
  let slowRequest = 0
  await page.route('**/api/audit/team-capability', async route => {
    const state = phase
    if (state === 'slow') {
      slowRequest++
      await new Promise(resolve => setTimeout(resolve, 600))
      await route.fulfill({status:200, contentType:'application/json', body:JSON.stringify({ok:true,allowed:true})})
    } else await route.fulfill({status:state==='denied'?403:200,contentType:'application/json',
      body:JSON.stringify(state==='denied'?{ok:false}:{ok:true,allowed:true})})
  })
  await openLeaderAudit(page)
  await expect(page.getByText('Mock audit record', { exact:false }).first()).toBeVisible({timeout:30000})
  phase='slow'
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await expect.poll(()=>slowRequest).toBe(1)
  phase='denied'
  await page.evaluate(() => window.dispatchEvent(new Event('focus')))
  await expect(page.getByText('Mock audit record', {exact:false})).toHaveCount(0)
  await expect(page.getByRole('alert').or(page.getByText(/không có quyền|Access denied|từ chối/i)).first()).toBeVisible()
  await page.waitForTimeout(800)
  await expect(page.getByText('Mock audit record', {exact:false})).toHaveCount(0)
})

test('RBAC01B user/role switch: previous Leader audit rows/details do not survive Member identity', async ({ page }) => {
  await page.setViewportSize({width: 390, height: 844})
  await page.route('**/api/audit/team-capability', async route => {
    await route.fulfill({status:200, contentType:'application/json',body:JSON.stringify({ok:true,allowed:true})})
  })
  await openLeaderAudit(page)
  await expect(page.getByText('Mock audit record', {exact:false}).first()).toBeVisible({timeout:30000})
  await page.locator('tbody tr').first().click()
  await page.evaluate(() => {
    localStorage.setItem('livestream-ops-current-user','3')
    window.dispatchEvent(new Event('livestream-ops-current-user-change'))
  })
  await expect(page.getByText('Mock audit record', {exact:false})).toHaveCount(0)
  await expect(page.getByText(/không có quyền|Access denied|từ chối/i).first()).toBeVisible({timeout:30000})
  await page.evaluate(() => {
    localStorage.setItem('livestream-ops-current-user','2')
    window.dispatchEvent(new Event('livestream-ops-current-user-change'))
  })
  await expect(page.getByText('Mock audit record', {exact:false}).first()).toBeVisible({timeout:30000})
})
