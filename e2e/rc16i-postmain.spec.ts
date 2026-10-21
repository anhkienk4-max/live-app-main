import {test,expect,type Page} from '@playwright/test'
import {readFile} from 'node:fs/promises'

// Explicit local synthetic API fixtures. No cloud auth, fixture writes or enabled server flags.
const period={id:'synthetic-period',period_start:'2026-09-01',period_end:'2026-09-30',status:'draft',revision:1,created_by:'independent-admin',reviewed_by:null}
const line={id:'synthetic-line',period_id:period.id,segment_id:'synthetic-segment',rate_card_id:'synthetic-rate',staff_id:'Synthetic Host',operational_role:'host',actual_minutes:90,payable_minutes:90,overtime_minutes:30,rate_vnd_per_hour:100000,overtime_multiplier_basis_points:15000,gross_vnd:175000,adjustment_vnd:-1000,net_vnd:174000,version:1,voided_at:null,adjustment_reason:'Synthetic approved adjustment'}
const pagination={page:1,page_size:10,total_count:1,total_pages:1,has_next:false,has_previous:false}
async function fixture(page:Page,{role='1',enabled=true}:{role?:string;enabled?:boolean}={}){
  await page.addInitScript(id=>{localStorage.setItem('livestream-ops-current-user',id);localStorage.setItem('livestream-ops-language','vi')},role)
  await page.route('**/api/workforce/capabilities',route=>route.fulfill({json:{ok:true,capabilities:{actual_staffing:enabled&&role!=='3',team_performance:enabled&&role!=='3',own_performance:enabled,payroll:enabled&&role==='1'}}}))
  await page.route('**/api/workforce/payroll*',route=>{
    const q=new URL(route.request().url()).searchParams
    if(q.get('action')==='list_periods')return route.fulfill({json:{ok:true,periods:[period],pagination}})
    if(q.get('action')==='list_rates')return route.fulfill({json:{ok:true,rates:[],pagination:{...pagination,total_count:0,total_pages:0}}})
    return route.fulfill({json:{ok:true,period,lines:[line],audit:[]}})
  })
}
const fit=async(page:Page)=>expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)

test('OFF states load no financial data and hide authorized navigation',async({page},info)=>{
  await fixture(page,{enabled:false})
  let reads=0;page.on('request',r=>{if(r.url().includes('/api/workforce/payroll'))reads++})
  await page.goto('/payroll');await expect(page.getByText(/Tính năng đang tắt/)).toBeVisible()
  await expect(page.locator('a[href="/payroll"]')).toHaveCount(0);expect(reads).toBe(0)
  await page.screenshot({path:info.outputPath('payroll-disabled-desktop.png'),fullPage:true})
})

test('Admin discovers periods/rates, corrects with stable UUID retry and drills into full audit',async({page},info)=>{
  await fixture(page)
  const intents:Array<Record<string,unknown>>=[]
  const detail={...period};let current={...line};let audit:Array<Record<string,unknown>>=[]
  await page.route('**/api/workforce/payroll?period_id=*',route=>route.fulfill({json:{ok:true,period:detail,lines:[current],audit}}))
  await page.route('**/api/workforce/payroll',async route=>{
    if(route.request().method()!=='POST')return route.fallback()
    const payload=route.request().postDataJSON();intents.push(payload)
    if(intents.length===1)return route.fulfill({status:503,json:{ok:false,error:{code:'WORKFORCE_PAYROLL_CORRECTION_FAILED'}}})
    current={...current,payable_minutes:60,version:2,gross_vnd:125000,net_vnd:124000}
    audit=[{id:1,period_id:period.id,line_id:line.id,action:'correct_line',actor_id:'1',reason:payload.reason,created_at:'2026-09-30T00:00:00Z',request_id:payload.request_id,previous_values:line,updated_values:current}]
    return route.fulfill({json:{ok:true,line:current,audit:audit[0],replayed:true}})
  })
  await page.goto('/payroll')
  await expect(page.getByText('Synthetic Host',{exact:true})).toBeVisible()
  await page.screenshot({path:info.outputPath('payroll-draft-desktop.png'),fullPage:true})
  await page.getByRole('button',{name:/Điều chỉnh/}).first().click()
  const dialog=page.getByRole('dialog')
  await dialog.getByLabel(/Số phút tính lương/).fill('60')
  await dialog.getByLabel(/Lý do sửa đổi/).fill('Synthetic independently approved correction')
  await dialog.getByRole('button',{name:/Lưu|Xác nhận/}).last().click()
  await expect(dialog.getByText('Dịch vụ hiện chưa sẵn sàng. Vui lòng thử lại sau.')).toBeVisible()
  await dialog.getByLabel(/Số phút tính lương/).fill('61')
  await dialog.getByRole('button',{name:/Lưu|Xác nhận/}).last().click()
  await expect(dialog.getByText(/Retry phải giữ nguyên dữ liệu/)).toBeVisible()
  expect(intents).toHaveLength(1)
  await dialog.getByLabel(/Số phút tính lương/).fill('60')
  await dialog.getByRole('button',{name:/Lưu|Xác nhận/}).last().click()
  await expect(dialog).toBeHidden();expect(intents[0]).toEqual(intents[1])
  expect(intents[0].gross_vnd).toBeUndefined();expect(intents[0].net_vnd).toBeUndefined()
  await page.getByText('Xem toàn bộ audit / trước và sau').click()
  await expect(page.locator('pre')).toContainText('request_id')
  await page.setViewportSize({width:390,height:844});await fit(page)
  await page.screenshot({path:info.outputPath('payroll-audit-mobile.png'),fullPage:true})
  await page.getByRole('tab',{name:'Khung lương & Đơn giá'}).click()
  await expect(page.getByText('Không tìm thấy khung lương nào phù hợp.')).toBeVisible()
  await page.getByRole('button',{name:/Đăng ký|Thêm khung/}).first().click()
  await expect(page.getByRole('dialog').getByLabel(/Mức lương|Đơn giá|VND/).first()).toHaveValue('')
})

test('Leader and Member cannot open Payroll or issue salary API reads',async({page})=>{
  for(const role of ['2','3']){
    await fixture(page,{role});let reads=0
    const listener=(r:import('@playwright/test').Request)=>{if(r.url().includes('/api/workforce/payroll'))reads++}
    page.on('request',listener);await page.goto('/payroll')
    await expect(page.getByText(/Bạn không có quyền truy cập bảng lương/i)).toBeVisible()
    await expect(page.locator('a[href="/payroll"]')).toHaveCount(0);expect(reads).toBe(0)
    page.off('request',listener)
  }
})

test('Team/individual use real contract fields; UNKNOWN stays unknown on desktop/mobile',async({page},info)=>{
  await fixture(page)
  const summary={staffId:'Synthetic Host',role:'host',assignedShifts:2,verifiedShifts:1,unknownAttendanceShifts:1,approvedNoShows:0,approvedWorkedShifts:1,approvedActualMinutes:90,lateShifts:0,onTimeShifts:1,attendanceCoveragePct:50,punctualityPct:100,knownReliabilityPct:100,isComplete:false,warning:'INCOMPLETE_ATTENDANCE_EVIDENCE'}
  await page.route('**/api/workforce/overview*',route=>route.fulfill({json:{ok:true,month:'2026-09',role:'host',team:{...summary,staffCount:1,workedShifts:1,actualMinutes:90,incompleteStaffCount:1},staff:[summary],leaderboard:[],leaderboard_policy_configured:false,gmv_per_hour:null,orders_per_hour:null}}))
  await page.route('**/api/workforce/performance*',route=>route.fulfill({json:{ok:true,performance:summary,gmv_per_hour:null,orders_per_hour:null}}))
  await page.goto('/workforce');await expect(page.getByText('Synthetic Host',{exact:true}).first()).toBeVisible()
  await page.screenshot({path:info.outputPath('workforce-team-desktop.png'),fullPage:true})
  await page.getByRole('tab',{name:/Hiệu suất cá nhân/}).click();await expect(page.getByText(/90|1 giờ/).first()).toBeVisible()
  await page.setViewportSize({width:390,height:844});await fit(page)
  await page.screenshot({path:info.outputPath('workforce-individual-mobile.png'),fullPage:true})
  await page.getByRole('tab',{name:/Bảng xếp hạng/}).click();await expect(page.getByText(/Chưa kích hoạt/)).toBeVisible()
})

test('Identity change and expired API session remove sensitive data immediately',async({page})=>{
  await fixture(page)
  await page.goto('/payroll')
  await expect(page.getByText('Synthetic Host',{exact:true})).toBeVisible()
  await page.evaluate(()=>{localStorage.setItem('livestream-ops-current-user','2');window.dispatchEvent(new Event('livestream-ops-current-user-change'))})
  await expect(page.getByText(/Bạn không có quyền truy cập bảng lương/i)).toBeVisible()
  await expect(page.getByText('Synthetic Host',{exact:true})).toHaveCount(0)
  await page.evaluate(()=>{localStorage.setItem('livestream-ops-current-user','1');window.dispatchEvent(new Event('livestream-ops-current-user-change'))})
  await expect(page.getByText('Synthetic Host',{exact:true})).toBeVisible()
  await page.route('**/api/workforce/payroll?period_id=*',route=>route.fulfill({status:401,json:{ok:false,error:{code:'AUTHENTICATION_REQUIRED'}}}))
  await page.getByRole('button',{name:'Cập nhật dữ liệu'}).click()
  await expect(page.getByText('Synthetic Host',{exact:true})).toHaveCount(0)
  await expect(page.getByRole('main').getByText(/Phiên đăng nhập đã hết hạn/)).toBeVisible()
})

test('Terminal void warns against reissue and sends current version plus stable UUID',async({page},info)=>{
  await fixture(page)
  const requests:Array<Record<string,unknown>>=[]
  await page.route('**/api/workforce/payroll',route=>{
    const payload=route.request().postDataJSON();requests.push(payload)
    if(requests.length===1)return route.fulfill({status:503,json:{ok:false,error:{code:'WORKFORCE_PAYROLL_CORRECTION_FAILED'}}})
    return route.fulfill({json:{ok:true,line:{...line,version:2,voided_at:'2026-09-30T00:00:00Z'},audit:{},replayed:true}})
  })
  await page.goto('/payroll')
  await page.getByRole('button',{name:/Vô hiệu|Void/}).first().click()
  const dialog=page.getByRole('dialog');await expect(dialog.getByText(/không thể được chi trả lại/)).toBeVisible()
  await dialog.getByLabel('Lý do vô hiệu hóa').focus();await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await page.getByRole('button',{name:/Vô hiệu|Void/}).first().click()
  await dialog.getByLabel('Lý do vô hiệu hóa').fill('Synthetic owner-approved terminal void')
  await page.screenshot({path:info.outputPath('payroll-terminal-void.png'),fullPage:true})
  await dialog.getByRole('button',{name:/Xác nhận|Vô hiệu/}).last().click()
  await expect(dialog.getByText('Dịch vụ hiện chưa sẵn sàng. Vui lòng thử lại sau.')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await page.getByRole('button',{name:/Vô hiệu|Void/}).first().click()
  await dialog.getByLabel('Lý do vô hiệu hóa').fill('Synthetic owner-approved terminal void')
  await dialog.getByRole('button',{name:/Xác nhận|Vô hiệu/}).last().click()
  await expect(dialog).toBeHidden();expect(requests[0]).toEqual(requests[1])
  expect(requests[0].expected_version).toBe(1);expect(requests[0].action).toBe('void_line')
})

test('Shift Details integrates actual evidence and independent review without deriving attendance',async({page},info)=>{
  await fixture(page)
  const row={id:'synthetic-actual',shift_id:'s5',staff_id:'Synthetic Host',operational_role:'host',event_kind:'worked',coverage_kind:'replacement',actual_start_at:'2026-09-30T16:30:00Z',actual_end_at:'2026-09-30T18:00:00Z',review_status:'draft',evidence_note:'Synthetic independently supplied overnight evidence',created_by:'2',version:1}
  let segments=[row];const requests:Array<Record<string,unknown>>=[]
  await page.route('**/api/workforce/actual*',route=>{
    if(route.request().method()==='POST'){
      const body=route.request().postDataJSON();requests.push(body)
      segments=[{...row,review_status:body.decision}]
      return route.fulfill({json:{ok:true,segment:segments[0]}})
    }
    return route.fulfill({json:{ok:true,segments}})
  })
  await page.goto('/shifts');await page.getByRole('button',{name:'Tech gadgets recap',exact:true}).click()
  await expect(page.getByTestId('shift-detail-modal')).toBeVisible()
  await page.getByRole('tab',{name:'Chấm công thực tế'}).click()
  await expect(page.getByText('Synthetic Host',{exact:true})).toBeVisible()
  await page.screenshot({path:info.outputPath('shift-actual-timeline.png'),fullPage:true})
  await page.getByRole('button',{name:'Xét duyệt',exact:true}).click()
  const dialog=page.getByRole('dialog').last()
  await dialog.getByLabel('Ghi chú của người xét duyệt').fill('Synthetic independent attendance review')
  await dialog.getByRole('button',{name:'Xác nhận duyệt',exact:true}).click()
  await expect(page.getByRole('button',{name:'Xác nhận duyệt',exact:true})).toHaveCount(0);expect(requests[0].expected_version).toBe(1)
  expect(requests[0].action).toBe('review')
})

test('Locked CSV downloads server bytes and expired export clears salary UI',async({page},info)=>{
  await fixture(page)
  const locked={...period,status:'locked',locked_at:'2026-09-30T00:00:00Z'}
  await page.route('**/api/workforce/payroll?period_id=*',route=>{
    if(new URL(route.request().url()).searchParams.get('export')==='csv')return route.fulfill({contentType:'text/csv',body:'staff_id,adjustment_vnd,net_vnd\nSynthetic Host,-1000,174000\n'})
    return route.fulfill({json:{ok:true,period:locked,lines:[line],audit:[]}})
  })
  await page.goto('/payroll')
  const downloadPromise=page.waitForEvent('download');await page.getByRole('button',{name:'Tải CSV khóa sổ'}).click()
  const download=await downloadPromise;expect(download.suggestedFilename()).toBe('payroll.csv')
  await download.saveAs(info.outputPath('synthetic-locked-payroll.csv'))
  expect(await readFile(info.outputPath('synthetic-locked-payroll.csv'),'utf8')).toBe('staff_id,adjustment_vnd,net_vnd\nSynthetic Host,-1000,174000\n')
  await page.route('**/api/workforce/payroll?period_id=*&export=csv',route=>route.fulfill({status:401,json:{ok:false,error:{code:'AUTHENTICATION_REQUIRED'}}}))
  await page.getByRole('button',{name:'Tải CSV khóa sổ'}).click()
  await expect(page.getByText('Synthetic Host',{exact:true})).toHaveCount(0)
  await expect(page.getByRole('main').getByText(/Phiên đăng nhập đã hết hạn/)).toBeVisible()
})

test('409 correction closes stale dialog and reloads current line instead of overwriting it', async ({page}) => {
  await fixture(page)
  let current = {...line}
  const requests: Array<Record<string, unknown>> = []
  await page.route('**/api/workforce/payroll?period_id=*', route => route.fulfill({json:{ok:true,period,lines:[current],audit:[]}}))
  await page.route('**/api/workforce/payroll', route => {
    requests.push(route.request().postDataJSON())
    current = {...line, version: 2, payable_minutes: 75}
    return route.fulfill({status:409,json:{ok:false,error:{code:'WORKFORCE_PAYROLL_LINE_CONFLICT'}}})
  })
  await page.goto('/payroll')
  await expect(page.getByText('Synthetic Host',{exact:true})).toBeVisible()
  await page.getByRole('button',{name:'Điều chỉnh dòng lương',exact:true}).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Lý do sửa đổi').fill('Synthetic approved conflict correction')
  await dialog.getByRole('button',{name:'Lưu điều chỉnh',exact:true}).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByText('Synthetic Host',{exact:true})).toBeVisible()
  await page.getByRole('button',{name:'Điều chỉnh dòng lương',exact:true}).click()
  await expect(dialog.getByRole('heading')).toContainText('v2')
  expect(requests).toHaveLength(1)
  expect(requests[0].expected_version).toBe(1)
})

test('Malformed capabilities cannot open salary workspace or navigation', async ({page}) => {
  await fixture(page)
  let reads = 0
  page.on('request', request => { if(request.url().includes('/api/workforce/payroll')) reads++ })
  await page.route('**/api/workforce/capabilities', route => route.fulfill({json:{ok:true,capabilities:{payroll:'true',own_performance:true}}}))
  await page.goto('/payroll')
  await expect(page.getByRole('alert').filter({hasText:/Tính năng|Dịch vụ/})).toBeVisible()
  await expect(page.locator('a[href="/payroll"]')).toHaveCount(0)
  expect(reads).toBe(0)
})

test('An Admin who corrected payroll cannot review their own correction evidence', async ({page}) => {
  await fixture(page)
  await page.route('**/api/workforce/payroll?period_id=*', route => route.fulfill({json:{ok:true,period,lines:[line],audit:[{id:1,period_id:period.id,line_id:line.id,line_version:1,action:'correct_line',actor_id:'1',reason:'Synthetic own correction evidence',created_at:'2026-09-30T00:00:00Z',previous_values:line,updated_values:line}]}}))
  await page.goto('/payroll')
  await expect(page.getByText('Synthetic Host',{exact:true})).toBeVisible()
  await expect(page.getByRole('button',{name:/rà soát/i})).toBeDisabled()
})


test('A delayed overview response cannot restore data from the previous month', async ({page}) => {
  await fixture(page)
  let delayed: import('@playwright/test').Route | undefined
  const summary = {staffId:'Latest evidence',role:'host',assignedShifts:0,verifiedShifts:0,unknownAttendanceShifts:0,approvedNoShows:0,approvedWorkedShifts:0,approvedActualMinutes:0,lateShifts:0,onTimeShifts:0,attendanceCoveragePct:null,punctualityPct:null,knownReliabilityPct:null,isComplete:false}
  const response = (staffId: string) => ({ok:true,team:{...summary,staffCount:1,workedShifts:0,actualMinutes:0,incompleteStaffCount:1},staff:[{...summary,staffId}],leaderboard:[],leaderboard_policy_configured:false})
  await page.route('**/api/workforce/overview*', async route => {
    if(new URL(route.request().url()).searchParams.get('period') !== '2026-08') { delayed = route; return }
    await route.fulfill({json:response('Latest evidence')})
  })
  await page.goto('/workforce')
  await expect.poll(() => Boolean(delayed)).toBe(true)
  await page.locator('input[type=month]').fill('2026-08')
  await expect(page.getByText('Latest evidence',{exact:true}).first()).toBeVisible()
  const received = page.waitForResponse(r => r.url().includes('/overview') && !r.url().includes('2026-08'))
  await delayed!.fulfill({json:response('Obsolete evidence')})
  await received
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => resolve())))
  await expect(page.getByText('Latest evidence',{exact:true}).first()).toBeVisible()
  await expect(page.getByText('Obsolete evidence',{exact:true})).toHaveCount(0)
})

test('409 void reloads the authoritative version and never automatically resubmits', async ({page}) => {
  await fixture(page)
  let current = {...line}
  const requests: Array<Record<string, unknown>> = []
  await page.route('**/api/workforce/payroll?period_id=*', route => route.fulfill({json:{ok:true,period,lines:[current],audit:[]}}))
  await page.route('**/api/workforce/payroll', route => {
    requests.push(route.request().postDataJSON())
    current = {...line,version:2}
    return route.fulfill({status:409,json:{ok:false,error:{code:'WORKFORCE_PAYROLL_STALE_LINE'}}})
  })
  await page.goto('/payroll')
  await page.getByRole('button',{name:'Vô hiệu hóa dòng lương',exact:true}).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Lý do vô hiệu hóa').fill('Synthetic independently approved void')
  await dialog.getByRole('button',{name:'Xác nhận vô hiệu hóa',exact:true}).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByText('Synthetic Host',{exact:true})).toBeVisible()
  expect(requests).toHaveLength(1)
  expect(requests[0].expected_version).toBe(1)
})


test('Period transitions remain unavailable until current audit evidence has loaded', async ({page}) => {
  await fixture(page)
  let pending: import('@playwright/test').Route | undefined
  await page.route('**/api/workforce/payroll?period_id=*', route => { pending = route })
  await page.goto('/payroll')
  await expect.poll(() => Boolean(pending)).toBe(true)
  await expect(page.getByRole('button',{name:/rà soát/i})).toHaveCount(0)
  await pending!.fulfill({json:{ok:true,period,lines:[line],audit:[{id:1,action:'correct_line',actor_id:'1',reason:'Synthetic own correction evidence',created_at:'2026-09-30T00:00:00Z'}]}})
  await expect(page.getByRole('button',{name:/rà soát/i})).toBeDisabled()
})
