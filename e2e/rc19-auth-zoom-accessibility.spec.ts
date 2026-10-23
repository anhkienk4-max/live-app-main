import { test, expect } from '@playwright/test'

// Render CSS viewport widths that are representative of common devices and
// 125%/150% desktop browser zoom (1440/1.25=1152; 1440/1.5=960).
const widths=[320,390,614,768,960,1024,1152,1366,1440]
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
      return {
        documentWidth:document.documentElement.scrollWidth,
        viewportWidth:window.innerWidth,
        formLeft:box.left,formRight:box.right,
        contentHeight:main.scrollHeight,
      }
    })
    expect(metrics.documentWidth).toBeLessThanOrEqual(metrics.viewportWidth+1)
    expect(metrics.formLeft).toBeGreaterThanOrEqual(-1)
    expect(metrics.formRight).toBeLessThanOrEqual(metrics.viewportWidth+1)
    expect(metrics.contentHeight).toBeGreaterThan(0)
  })
}
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
