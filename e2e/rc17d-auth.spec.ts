import { test, expect } from '@playwright/test'
const widths=[320,360,375,390,430,768,1024,1280,1440]
test('Supabase-mode public auth is responsive and Google stays disabled without a provider',async({page},info)=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message))
 for(const route of ['/login','/register','/forgot-password','/reset-password']){
  await page.goto(route,{waitUntil:'networkidle'})
  for(const width of widths){await page.setViewportSize({width,height:width===375?811:1000});await page.waitForTimeout(150);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);if([375,768,1440].includes(width))await page.screenshot({path:info.outputPath(route.slice(1)+'-'+width+'.png'),fullPage:true})}
 }
 await page.goto('/login');await expect(page.getByTestId('google-unavailable')).toBeVisible();await expect(page.getByTestId('google-login-btn')).toHaveCount(0)
 await page.getByTestId('email-input').fill('local-check@example.test');await page.getByTestId('password-input').fill('local-check-password');await page.getByTestId('email-login-btn').click();await expect(page.getByTestId('login-error')).toBeVisible()
 await page.goto('/login?reason=session_expired&next=%2Fcalendar');await expect(page.getByTestId('login-error')).toBeVisible()
 await page.goto('/login?reason=approval_required');await expect(page.getByTestId('login-error')).toContainText('chưa được cấp quyền')
 await page.goto('/login?reason=oauth_failed');await expect(page.getByTestId('login-error')).toBeVisible()
 expect(errors).toEqual([])
})
test('Production-mode request access preserves approval and handles transport failures',async({page})=>{
 await page.route('**/api/account-requests',r=>r.fulfill({status:200,json:{ok:true}}));await page.goto('/register')
 await page.locator('input[type=password]').count().then(count=>expect(count).toBe(0))
 const fields=page.locator('input');await fields.nth(0).fill('Người dùng kiểm thử');await page.locator('input[type=email]').fill('local-request@example.test');await page.getByTestId('create-account-btn').click();await expect(page.getByTestId('account-request-success')).toBeVisible()
 await page.unroute('**/api/account-requests');await page.route('**/api/account-requests',r=>r.abort());await page.goto('/register');await page.locator('input').nth(0).fill('Người dùng kiểm thử');await page.locator('input[type=email]').fill('local-request@example.test');await page.getByTestId('create-account-btn').click();await expect(page.getByRole('alert').filter({hasText:/./})).toBeVisible()
})
