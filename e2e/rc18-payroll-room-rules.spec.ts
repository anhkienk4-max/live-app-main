import { expect, test } from '@playwright/test'

const enabled = {
  actual_staffing:true, team_performance:true, own_performance:true, payroll:true,
}

for(const width of [390,1440]){
  test('Admin can preview ADA room case without mutating payroll at '+width+'px',async({page})=>{
    await page.setViewportSize({width,height:900})
    await page.addInitScript(()=>{
      localStorage.setItem('livestream-ops-current-user','1')
      localStorage.setItem('livestream-ops-language','vi')
    })
    await page.route('**/api/workforce/capabilities',route=>route.fulfill({
      json:{ok:true,capabilities:enabled},
    }))
    await page.route('**/api/workforce/payroll**',route=>{
      if(route.request().method() !== 'GET') throw new Error('POLICY_PREVIEW_MUST_NOT_MUTATE_PAYROLL')
      return route.fulfill({status:200,json:{ok:true,periods:[],pagination:{
        page:1,page_size:50,total_count:0,total_pages:0,has_next:false,has_previous:false,
      }}})
    })
    let payrollWrites=0
    page.on('request',request=>{
      if(new URL(request.url()).pathname==='/api/workforce/payroll'&&request.method()!=='GET')payrollWrites++
    })
    const errors:string[]=[]
    page.on('pageerror',error=>errors.push(error.message))
    await page.goto('/payroll')
    await page.getByRole('tab',{name:'Nội quy & Case vi phạm'}).click()
    await expect(page.getByTestId('payroll-room-rules')).toBeVisible()
    await expect(page.getByTestId('ada-full-rulebook')).toBeVisible()
    await expect(page.getByTestId('payroll-attendance-link')).toBeVisible()
    for (const section of ['I','II','III','IV','V','VI']) {
      await expect(page.getByTestId('room-rule-section-'+section)).toHaveCount(1)
    }
    await page.getByLabel('Tìm nội quy').fill('nước mía')
    await expect(page.getByTestId('room-rule-section-I')).toContainText('nước mía')
    await page.getByLabel('Tìm nội quy').fill('')
    // No payroll writes or inferred violations when attendance has not been explicitly loaded.
    await expect(page.getByTestId('payroll-attendance-link')).toContainText('Dữ liệu đọc trực tiếp')
    await page.getByLabel('Ngày ca').fill('2026-10-22')
    await page.getByLabel('Tiền ca').fill('200000')
    await page.getByLabel('Giờ live').fill('2026-10-22T10:00')
    await page.getByLabel('Giờ check-in group').fill('2026-10-22T09:50')
    await page.getByTestId('evaluate-ada-rule').click()
    await expect(page.getByTestId('ada-rule-result')).toContainText('20.000')
    await expect(page.getByTestId('ada-rule-result')).toContainText('chưa trừ lương')
    await page.getByLabel('Ngày ca').fill('2026-10-21')
    await page.getByTestId('evaluate-ada-rule').click()
    await expect(page.getByTestId('ada-rule-result')).toContainText('Ngoài thời hạn hiệu lực')
    expect(payrollWrites).toBe(0)
    expect(errors).toEqual([])
    await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)
  })
}

test('approved Workforce actual segment links to Payroll WITHOUT inventing group check-in or payroll writes',async({page})=>{
  await page.addInitScript(()=>{
    localStorage.setItem('livestream-ops-current-user','1')
    localStorage.setItem('livestream-ops-language','vi')
  })
  await page.route('**/api/workforce/capabilities',route=>route.fulfill({
    json:{ok:true,capabilities:enabled},
  }))
  let writes=0
  page.on('request',request=>{
    if(request.url().includes('/api/workforce/') && request.method()!=='GET') writes++
  })
  await page.route('**/api/operations/collection?**',route=>{
    const url=new URL(route.request().url())
    if(url.searchParams.get('entity')!=='shifts')return route.continue()
    return route.fulfill({json:{
      ownerKey:'1:admin',items:[{
        id:'shift-rc18',date:'2026-10-22',start_time:'10:00:00',end_time:'12:00:00',
        start_at:'2026-10-22T10:00:00+07:00',end_at:'2026-10-22T12:00:00+07:00',
        brand_id:'brand',platform_id:'platform',status:'completed',title:'Demo shift',
        created_at:'2026-10-22T00:00:00Z',updated_at:'2026-10-22T00:00:00Z',
      }],total:1,page:1,pageSize:20,
    }})
  })
  await page.route('**/api/workforce/actual?**',route=>route.fulfill({
    json:{ok:true,shift_context:{
      id:'shift-rc18',date:'2026-10-22',start_time:'10:00:00',end_time:'12:00:00',
      start_at:'2026-10-22T10:00:00+07:00',end_at:'2026-10-22T12:00:00+07:00',status:'completed',
    },planned_staff:[],lateness_policy:{grace_minutes:10,policy_status:'configured'},
    segments:[{
      id:'segment-rc18',shift_id:'shift-rc18',staff_id:'host-1',operational_role:'host',
      event_kind:'worked',review_status:'approved',coverage_kind:'planned',
      actual_start_at:'2026-10-22T09:50:00+07:00',actual_end_at:'2026-10-22T12:00:00+07:00',
      evidence_note:'independently approved actual shift evidence',created_by:'admin',version:1,
      created_at:'2026-10-22T14:00:00+07:00',
    }],
  }}))
  await page.goto('/payroll')
  await page.getByRole('tab',{name:'Nội quy & Case vi phạm'}).click()
  await page.getByLabel('Ngày ca chấm công').fill('2026-10-22')
  await page.getByRole('button',{name:'Lấy ca theo ngày'}).click()
  await page.getByLabel('Chọn ca chấm công').selectOption('shift-rc18')
  await expect(page.getByTestId('attendance-segment')).toContainText('Đã duyệt')
  await expect(page.getByTestId('attendance-segment')).toContainText('Chưa có dữ liệu tích hợp')
  await page.getByRole('button',{name:'Chuyển ca sang bộ tính đề xuất'}).click()
  await expect(page.getByTestId('room-rule-linked-context')).toBeVisible()
  await expect(page.getByLabel('Ngày ca',{exact:true})).toHaveValue('2026-10-22')
  await expect(page.getByLabel('Giờ live')).toHaveValue('2026-10-22T10:00')
  await expect(page.getByLabel('Giờ check-in group')).toHaveValue('')
  expect(writes).toBe(0)
})
