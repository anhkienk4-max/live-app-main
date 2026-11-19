import { test, expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'

// Render CSS viewport widths that are representative of common devices and
// 125%/150% desktop browser zoom (1440/1.25=1152; 1440/1.5=960).
const widths=[320,390,614,768,960,1024,1152,1366,1440,1800,2020,2880,4364]
for (const width of widths) {
  test('login content stays accessible without horizontal page overflow at '+width+' CSS px',async({page})=>{
    await page.setViewportSize({width,height:700})
    await page.goto('/login',{waitUntil:'domcontentloaded'})
    await expect(page.getByTestId('email-input')).toBeVisible()
    await expect(page.getByTestId('password-input')).toBeVisible()
    await expect(page.getByRole('heading',{level:1})).toBeVisible()
    const metrics=await page.evaluate(()=>{
      const main=document.querySelector('main')!
      const form=document.querySelector('form')!
      const box=form.getBoundingClientRect()
      const card=document.querySelector('[data-testid="auth-layout-card"]')!.getBoundingClientRect()
      return {
        documentWidth:document.documentElement.scrollWidth,
        viewportWidth:window.innerWidth,
        formLeft:box.left,formRight:box.right,
        cardWidth:card.width,
        contentHeight:main.scrollHeight,
      }
    })
    expect(metrics.documentWidth).toBeLessThanOrEqual(metrics.viewportWidth+1)
    expect(metrics.formLeft).toBeGreaterThanOrEqual(-1)
    expect(metrics.formRight).toBeLessThanOrEqual(metrics.viewportWidth+1)
    expect(metrics.contentHeight).toBeGreaterThan(0)
    if (width >= 1800) expect(metrics.cardWidth).toBeGreaterThanOrEqual(metrics.viewportWidth*0.8)
  })
}

test('login, registration, recovery and password reset render on phone, tablet and desktop',async({page})=>{
  const routes=[
    ['/login','email-input'],
    ['/register','register-email'],
    ['/forgot-password','reset-email-input'],
    ['/reset-password','new-password-input'],
  ] as const
  for (const width of [390,768,1440]) {
    await page.setViewportSize({width,height:900})
    for (const [route,field] of routes) {
      await page.goto(route,{waitUntil:'domcontentloaded'})
      await expect(page.getByRole('heading',{level:1})).toBeVisible()
      await expect(page.getByTestId(field)).toBeVisible()
      const metrics=await page.evaluate(()=>({
        documentWidth:document.documentElement.scrollWidth,
        viewportWidth:window.innerWidth,
        cardWidth:document.querySelector('[data-testid="auth-layout-card"]')!.getBoundingClientRect().width,
      }))
      expect(metrics.documentWidth).toBeLessThanOrEqual(metrics.viewportWidth+1)
      expect(metrics.cardWidth).toBeGreaterThan(0)
    }
  }
})

test('captures after screenshots for phone, desktop and 50-percent-zoom-equivalent viewport',async({page})=>{
  const folder=resolve('docs/handoffs/rc19-u01-screenshots')
  mkdirSync(folder,{recursive:true})
  for (const [label,width,height] of [['phone',390,844],['desktop',1440,1024],['zoom-50-equivalent',2020,700]] as const) {
    await page.setViewportSize({width,height})
    await page.goto('/login',{waitUntil:'domcontentloaded'})
    await expect(page.getByTestId('email-input')).toBeVisible()
    await expect(page.getByTestId('password-input')).toBeVisible()
    await page.screenshot({path:resolve(folder,`after-${label}.png`),fullPage:true,caret:'initial'})
  }
})
test('skip link is first keyboard destination and focuses content landmark',async({page})=>{
  await page.goto('/login')
  await expect(page.getByTestId('email-input')).toBeVisible()
  await page.keyboard.press('Tab')
  const skip=page.locator('a[href="#auth-content"]')
  await expect(skip).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(page.locator('#auth-content')).toBeFocused()
  await expect(page.getByRole('heading',{level:1})).toBeVisible()
})
