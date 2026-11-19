import { expect, test } from '@playwright/test'

const line = { line_id:'line-1', shift_id:'shift-1', shift_date:'2026-10-20', shift_title:'Test shift', operational_role:'host', actual_start_at:'2026-10-20T10:00:00Z', actual_end_at:'2026-10-20T12:00:00Z', actual_minutes:120, payable_minutes:110, overtime_minutes:0, rate_vnd_per_hour:100000, gross_vnd:200000, adjustment_vnd:0, adjustment_reason:null, net_vnd:200000, attendance_review:'approved' }
const statement = (id:string, month:string) => ({ period_id:id, period_start:`2026-${month}-01`, period_end:`2026-${month}-28`, status:'locked', locked_at:'2026-11-01T00:00:00Z', lines:[line], total_net_vnd:200000 })

for (const width of [390, 1440]) {
  test(`member can select their payslip and handle empty and invalid years at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height:844 })
    await page.addInitScript(() => localStorage.setItem('livestream-ops-current-user','3'))
    await page.route('**/api/workforce/capabilities', route => route.fulfill({json:{ok:true,capabilities:{actual_staffing:false,team_performance:false,own_performance:true,payroll:false}}}))
    await page.route('**/api/workforce/my-payslip?*', route => {
      const year=new URL(route.request().url()).searchParams.get('year')
      return route.fulfill({json:{ok:true,scope:'own_locked_only',limited_to:12,statements:year==='2026'?[statement('p1','10'),statement('p2','09')]:[]}})
    })
    await page.goto('/payroll')
    await page.getByLabel('Năm phiếu lương').fill('2026')
    await expect(page.getByRole('heading',{name:'Kỳ 2026-10-01 đến 2026-10-28'})).toBeVisible()
    await expect(page.getByText('120 phút thực tế / 110 phút tính lương')).toBeVisible()
    await page.getByLabel('Kỳ lương').selectOption('p2')
    await expect(page.getByRole('heading',{name:'Kỳ 2026-09-01 đến 2026-09-28'})).toBeVisible()
    await expect(page.getByText('Khung lương & Đơn giá')).toHaveCount(0)
    await page.getByLabel('Năm phiếu lương').fill('2025')
    await expect(page.getByText('Chưa có phiếu lương được phát hành', {exact:false})).toBeVisible()
    await page.getByLabel('Năm phiếu lương').fill('202')
    await expect(page.getByText('Vui lòng nhập năm từ 2020 đến 2099.')).toBeVisible()
    await expect(page.getByText('Đang đọc dữ liệu bảng lương đã khóa...')).toHaveCount(0)
  })
}

test('switching actors hides the prior payslip while an old request is pending', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('livestream-ops-current-user','3'))
  await page.route('**/api/workforce/capabilities', route => route.fulfill({json:{ok:true,capabilities:{actual_staffing:false,team_performance:false,own_performance:true,payroll:false}}}))
  let delayNext=false
  let pending=false
  let switched=false
  let lateFinished=false
  let release:()=>void = () => {}
  const delayed=new Promise<void>(resolve=>{release=resolve})
  await page.route('**/api/workforce/my-payslip?*', async route => {
    if(delayNext && !switched) { pending=true; await delayed; await route.fulfill({json:{ok:true,scope:'own_locked_only',limited_to:12,statements:[statement('p1','10')]}}).catch(()=>{}); lateFinished=true; return }
    await route.fulfill({json:{ok:true,scope:'own_locked_only',limited_to:12,statements:switched?[]:[statement('p1','10')]}})
  })
  await page.goto('/payroll')
  await expect(page.getByText('Test shift')).toBeVisible()
  delayNext=true
  await page.getByRole('button',{name:'Tải lại'}).click()
  await expect.poll(()=>pending).toBe(true)
  switched=true
  await page.evaluate(() => { localStorage.setItem('livestream-ops-current-user','4'); window.dispatchEvent(new Event('livestream-ops-current-user-change')) })
  await expect(page.getByText('Chưa có phiếu lương được phát hành', {exact:false})).toBeVisible()
  release()
  await expect.poll(()=>lateFinished).toBe(true)
  await expect(page.getByText('Test shift')).toHaveCount(0)
})

test('failed payslip read can be retried', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('livestream-ops-current-user','3'))
  await page.route('**/api/workforce/capabilities', route => route.fulfill({json:{ok:true,capabilities:{actual_staffing:false,team_performance:false,own_performance:true,payroll:false}}}))
  let failing=true
  await page.route('**/api/workforce/my-payslip?*', route => failing
    ? route.fulfill({status:503,json:{ok:false,error:{code:'PAYSLIP_UNAVAILABLE'}}})
    : route.fulfill({json:{ok:true,scope:'own_locked_only',limited_to:12,statements:[]}}))
  await page.goto('/payroll')
  await expect(page.getByText('Không thể đọc phiếu lương:',{exact:false})).toBeVisible()
  failing=false
  await page.getByRole('button',{name:'Tải lại'}).click()
  await expect(page.getByText('Chưa có phiếu lương được phát hành',{exact:false})).toBeVisible()
})
