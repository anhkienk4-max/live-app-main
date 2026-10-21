import { test, expect } from '@playwright/test'
const widths=[320,360,375,390,430,768,1024,1280,1440]

async function fillLogin(page: import('@playwright/test').Page) {
 await page.getByTestId('email-input').fill('local-check@example.test')
 await page.getByTestId('password-input').fill('fixture-password')
 await page.getByTestId('email-login-btn').click()
}

async function mockAuthError(page: import('@playwright/test').Page, code: string) {
 await page.route('**/auth/v1/token*', route => route.fulfill({status:400,contentType:'application/json',json:{code,error_code:code,msg:'private provider response detail'}}))
}
async function useEnglish(page: import('@playwright/test').Page) {
 const toggle=page.getByRole('button',{name:'English',exact:true})
 if(await toggle.isVisible())await toggle.click()
}

test('Supabase-mode public auth is responsive and Google stays disabled without a provider',async({page},info)=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message))
 await page.goto('/login',{waitUntil:'domcontentloaded'});await useEnglish(page)
 for(const route of ['/login','/register','/forgot-password','/reset-password']){
  await page.goto(route,{waitUntil:'domcontentloaded'})
  for(const width of widths){await page.setViewportSize({width,height:width===375?811:1000});await page.waitForTimeout(150);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);if([375,768,1440].includes(width))await page.screenshot({path:info.outputPath(route.slice(1)+'-'+width+'.png'),fullPage:true})}
 }
 await page.goto('/login');await expect(page.getByTestId('google-unavailable')).toBeVisible();await expect(page.getByTestId('google-login-btn')).toHaveCount(0)
 await mockAuthError(page,'invalid_credentials');await fillLogin(page);await expect(page.getByTestId('login-error')).toContainText('Email or password is incorrect.');await expect(page.getByTestId('email-login-btn')).toBeEnabled()
 await page.goto('/login?reason=session_expired&next=%2Fcalendar');await expect(page.getByTestId('login-error')).toBeVisible()
 await page.goto('/login?reason=approval_required');await expect(page.getByTestId('login-error')).toContainText('This account does not have approved access.')
 await page.goto('/login?reason=oauth_failed');await expect(page.getByTestId('login-error')).toBeVisible()
 expect(errors).toEqual([])
})

test('Password login distinguishes unavailable provider in Vietnamese and always re-enables retry',async({page})=>{
 await mockAuthError(page,'email_provider_disabled');await page.goto('/login')
 await fillLogin(page)
 await expect(page.getByTestId('login-error')).toContainText('\u0110\u0103ng nh\u1eadp b\u1eb1ng email hi\u1ec7n kh\u00f4ng kh\u1ea3 d\u1ee5ng.')
 await expect(page.getByTestId('email-login-btn')).toBeEnabled()
 await expect(page.getByTestId('login-error')).not.toContainText('private provider response detail')
})

test('Password login reports network failures without leaking request details and allows retry',async({page})=>{
 await page.route('**/auth/v1/token*',route=>route.abort('failed'));await page.goto('/login');await useEnglish(page);await fillLogin(page)
 await expect(page.getByTestId('login-error')).toContainText('The sign-in service could not be reached.')
 await expect(page.getByTestId('email-login-btn')).toBeEnabled()
 await expect(page.getByTestId('login-error')).not.toContainText('fixture-password')
})

test('Unknown Auth errors stay generic and never expose provider details',async({page})=>{
 await mockAuthError(page,'unrecognized_code');await page.goto('/login');await useEnglish(page);await fillLogin(page)
 await expect(page.getByTestId('login-error')).toContainText('We could not sign you in.')
 await expect(page.getByTestId('email-login-btn')).toBeEnabled()
 await expect(page.getByTestId('login-error')).not.toContainText('private provider response detail')
})
test('Production-mode request access preserves approval and handles transport failures',async({page})=>{
 await page.route('**/api/account-requests',r=>r.fulfill({status:200,json:{ok:true}}));await page.goto('/register')
 await page.locator('input[type=password]').count().then(count=>expect(count).toBe(0))
 const fields=page.locator('input');await fields.nth(0).fill('Người dùng kiểm thử');await page.locator('input[type=email]').fill('local-request@example.test');await page.getByTestId('create-account-btn').click();await expect(page.getByTestId('account-request-success')).toBeVisible()
 await page.unroute('**/api/account-requests');await page.route('**/api/account-requests',r=>r.abort());await page.goto('/register');await page.locator('input').nth(0).fill('Người dùng kiểm thử');await page.locator('input[type=email]').fill('local-request@example.test');await page.getByTestId('create-account-btn').click();await expect(page.getByRole('alert').filter({hasText:/./})).toBeVisible()
})
