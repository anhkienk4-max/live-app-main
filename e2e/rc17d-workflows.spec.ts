import { test, expect, type Page } from '@playwright/test'
import { writeFile } from 'node:fs/promises'
import * as XLSX from 'xlsx'
import type { PayrollPeriod, PayrollLine, RateCard, WorkforcePerformanceSummary } from '@/lib/services/workforceService'
const widths=[320,360,375,390,430,768,1024,1280,1440]
async function identity(page:Page,role='1'){
 await page.addInitScript(id=>{localStorage.setItem('livestream-ops-current-user',id);localStorage.setItem('livestream-ops-language','vi')},role)
 await page.route('**/api/workforce/capabilities',r=>r.fulfill({json:{ok:true,capabilities:{actual_staffing:true,team_performance:true,own_performance:true,payroll:true}}}))
}
async function containment(page:Page){
 const metrics=await page.evaluate(()=>{const main=document.querySelector('main');return{document:document.documentElement.scrollWidth,width:innerWidth,main:main?.clientWidth,content:main?.scrollWidth}})
 expect(metrics.document).toBeLessThanOrEqual(metrics.width)
 if(metrics.main)expect(metrics.content).toBeLessThanOrEqual(metrics.main+1)
}
async function dialogFitAndFocus(page:Page){
 const dialog=page.getByRole('dialog').last();await expect(dialog).toBeVisible()
 await expect.poll(async()=>{const box=await dialog.boundingBox();const size=page.viewportSize()!;return !!box&&box.x>=-1&&box.y>=-1&&box.x+box.width<=size.width+1&&box.y+box.height<=size.height+1}).toBe(true)
 for(let i=0;i<15;i++){await page.keyboard.press('Tab');await expect.poll(()=>page.evaluate(()=>!!document.activeElement?.closest('[role=dialog]'))).toBe(true)}
 await page.keyboard.press('Escape');await expect(dialog).toBeHidden()
}
for(const role of ['1','2','3'])test('Grouped navigation Back Escape focus and role boundary '+role,async({page},info)=>{
 await identity(page,role);await page.setViewportSize({width:375,height:811});await page.goto('/calendar?tab=calendar&calendar_view=month&calendar_date=2026-10-14')
 await page.getByTestId('nav-menu-more').click();await expect(page.getByTestId('grouped-navigation-drawer')).toBeVisible()
 const drawer=page.getByTestId('grouped-navigation-drawer')
 if(role==='3'){await expect(drawer.locator('a[href="/payroll"]')).toHaveCount(0);await expect(drawer.locator('a[href="/audit"]')).toHaveCount(0)}
 await page.screenshot({path:info.outputPath('more-mobile.png')});await page.goBack();await expect(drawer).toBeHidden();await expect(page).toHaveURL(/calendar_date=2026-10-14/)
 await page.getByTestId('nav-menu-more').click();await dialogFitAndFocus(page)
 await expect(page.getByTestId('nav-menu-more')).toBeFocused()
 await page.getByTestId('nav-menu-more').click();await drawer.locator('a[href="/reports"]').click();await expect(page).toHaveURL(/\/reports$/);await expect(drawer).toBeHidden()
 await page.goBack();await expect(page).not.toHaveURL(/nav_menu/)
 await page.setViewportSize({width:768,height:1024});await page.getByRole('button',{name:'Thanh điều hướng chính',exact:true}).click();await dialogFitAndFocus(page)
 await page.setViewportSize({width:1440,height:1000});await page.goto('/reports')
 const active=page.getByTestId('production-sidebar').locator('a[aria-current="page"]');await expect(active).toBeVisible()
 const overview=page.getByTestId('production-sidebar').getByRole('button',{name:'Tổng quan',exact:true});await overview.click();await expect(overview).toHaveAttribute('aria-expanded','false');await page.reload();await expect(overview).toHaveAttribute('aria-expanded','false');await expect(active).toBeVisible()
})
test('Mobile Month dense overnight Vietnamese cards filters and export',async({page},info)=>{
 await identity(page);await page.setViewportSize({width:375,height:811})
 await page.route('**/api/operational-files',r=>r.fulfill({json:{ok:true,reused:true}}))
 const rows=Array.from({length:8},(_,i)=>({Date:'2026-10-14','Start Time':i===7?'23:00':('09:0'+i),'End Time':i===7?'02:00':'10:00',Brand:'TechGear Pro',Platform:'TikTok Shop','Execution Source':'Internal','Shift title':'RC17D Ca livestream tiếng Việt có tiêu đề dài cho thương hiệu và chương trình đặc biệt '+i,Studio:'Studio kiểm thử '+i,'Required Host count':1,'Required Support count':1,'Required Technical count':1}))
 const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,XLSX.utils.json_to_sheet(rows),'Schedule')
 await page.goto('/calendar?tab=import');await page.locator('input[type=file]').first().setInputFiles({name:'rc17d-local.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:XLSX.write(book,{type:'buffer',bookType:'xlsx'})})
 await page.getByRole('button',{name:/Xác nhận import|Confirm import/}).click();await expect(page.getByRole('status').filter({hasText:/8 dòng đã import/})).toBeVisible()
 await page.locator('div.pointer-events-auto').filter({hasText:'8 dòng'}).getByRole('button').click()
 await page.getByTestId('calendar-stable-tabs').getByRole('tab',{name:'Lịch ca',exact:true}).click();await page.getByRole('button',{name:'Tháng',exact:true}).click()
 await page.evaluate(()=>{const url=new URL(location.href);url.searchParams.set('calendar_date','2026-10-14');history.pushState(null,'',url)})
 const agenda=page.getByTestId('calendar-mobile-agenda');await expect(agenda).toBeVisible();await expect(agenda.locator('[data-testid^="day-shift-"]')).toHaveCount(8)
 await expect(agenda.getByText('TikTok Shop',{exact:true})).toHaveCount(8);await expect(agenda.locator('[data-testid^="shift-staffing-"]')).toHaveCount(8);await expect(agenda.locator('[data-testid^="shift-staffing-"]').first()).toContainText('Host:');await expect(agenda.getByText(/Trợ|Hỗ trợ/).first()).toBeVisible()
 await containment(page);await agenda.locator('[data-testid^="day-shift-"]').first().scrollIntoViewIfNeeded();await page.screenshot({path:info.outputPath('dense-mobile.png'),animations:'disabled'})
 await page.getByTestId('calendar-agenda-date').fill('2026-10-15');await expect(agenda.locator('[data-testid^="day-shift-"]')).toHaveCount(1);await expect(agenda.getByText(/Tiếp từ ngày/)).toBeVisible()
 await expect(page).toHaveURL(/calendar_date=2026-10-15/);await page.goBack();await expect(page.getByTestId('calendar-agenda-date')).toHaveValue('2026-10-14')
 await page.getByTestId('calendar-filter-toggle').click();await expect(page.getByTestId('calendar-filter-drawer')).toBeVisible();await page.screenshot({path:info.outputPath('filters-mobile.png'),animations:'disabled'})
 await page.getByTestId('calendar-brand-filter').getByRole('button').click();await page.getByRole('menuitemcheckbox',{name:'TechGear Pro',exact:true}).click();await page.keyboard.press('Escape')
 await page.getByTestId('calendar-filter-drawer').getByRole('button',{name:'Đặt lại bộ lọc',exact:true}).last().click();await dialogFitAndFocus(page)
 await page.getByTestId('export-schedule-dropdown-btn').click();await dialogFitAndFocus(page)
 const card=agenda.locator('[data-testid^="day-shift-"]').first().getByRole('button').first();await card.click();await expect(page.getByRole('dialog')).toBeVisible();await dialogFitAndFocus(page)
 await page.setViewportSize({width:1440,height:1000});await expect(agenda).toBeHidden();await expect(page.locator('[data-testid^="calendar-day-"]').first()).toBeVisible()
})
const period:PayrollPeriod={id:'11111111-1111-4111-8111-111111111111',period_start:'2026-10-01',period_end:'2026-10-31',status:'draft',revision:1,created_by:'Admin kiểm thử',reviewed_by:null,confirmed_by:null,locked_by:null,locked_at:null,created_at:'2026-10-01T00:00:00Z',updated_at:'2026-10-01T00:00:00Z'}
const line:PayrollLine={id:'22222222-2222-4222-8222-222222222222',period_id:period.id,segment_id:'33333333-3333-4333-8333-333333333333',rate_card_id:'44444444-4444-4444-8444-444444444444',staff_id:'3',operational_role:'host',actual_minutes:180,payable_minutes:120,overtime_minutes:60,rate_vnd_per_hour:120000,overtime_multiplier_basis_points:15000,gross_vnd:420000,adjustment_vnd:0,net_vnd:420000,adjustment_reason:null,calculation_version:'rc17b.v1',version:1,voided_at:null,created_at:period.created_at,updated_at:period.updated_at}
const rate:RateCard={id:line.rate_card_id,staff_id:null,scope:'role_default',operational_role:'host',effective_from:period.period_start,effective_through:null,vnd_per_hour:120000,overtime_multiplier_basis_points:15000,approved_by:'1',approved_at:period.created_at,approval_note:'Đơn giá kiểm thử cục bộ',created_at:period.created_at}
const performance:WorkforcePerformanceSummary={staffId:'3',role:'host',assignedShifts:5,verifiedShifts:3,unknownAttendanceShifts:2,approvedNoShows:0,approvedWorkedShifts:3,approvedActualMinutes:540,lateShifts:1,onTimeShifts:2,attendanceCoveragePct:60,punctualityPct:66.7,knownReliabilityPct:100,isComplete:false,warning:'INCOMPLETE_ATTENDANCE_EVIDENCE',name:'Nhân viên kiểm thử tiếng Việt với họ tên dài',department:'Vận hành Livestream'}
for(const role of ['1','2','3'])test('Enabled Workforce and Payroll viewports and modal containment '+role,async({page},info)=>{
 await identity(page,role)
 await page.route('**/api/workforce/overview?**',r=>r.fulfill({json:{ok:true,month:'2026-10',role:'host',team:{staffCount:1,assignedShifts:5,verifiedShifts:3,unknownAttendanceShifts:2,workedShifts:3,approvedNoShows:0,actualMinutes:540,onTimeShifts:2,lateShifts:1,attendanceCoveragePct:60,punctualityPct:66.7,knownReliabilityPct:100,isComplete:false,incompleteStaffCount:1},staff:[performance],leaderboard:[],leaderboard_policy_configured:false,unmatched_approved_segments:0,gmv_per_hour:null,orders_per_hour:null,warning:'INCOMPLETE_ATTENDANCE_EVIDENCE'}}))
 await page.route('**/api/workforce/performance?**',r=>r.fulfill({json:{ok:true,performance}}))
 await page.route('**/api/workforce/payroll?**',r=>{
  const q=new URL(r.request().url()).searchParams
  return r.fulfill({json:q.has('period_id')?{ok:true,period,lines:[line],audit:[]}:{ok:true,periods:[period],rates:[rate],pagination:{page:1,page_size:20,total_count:1,total_pages:1,has_next:false,has_previous:false}}})
 })
 const evidence=[]
 for(const route of ['/workforce','/payroll']){
  await page.goto(route,{waitUntil:'networkidle'});await expect(page.getByRole('heading',{level:1}).or(page.getByRole('alert')).first()).toBeVisible()
  for(const width of widths){await page.setViewportSize({width,height:width===375?811:1000});await page.waitForTimeout(200);await containment(page);evidence.push({route,role,width,scope:'LOCAL_ENABLED_FIXTURE',status:'PASS'});if([375,768,1440].includes(width))await page.screenshot({path:info.outputPath(route.slice(1)+'-'+width+'.png')})}
  if(route==='/payroll'&&role==='1'){
   await page.setViewportSize({width:375,height:811});await expect(page.getByText('420.000',{exact:false}).first()).toBeVisible()
   await containment(page);await page.screenshot({path:info.outputPath('payroll-detail-mobile.png')})
   await page.getByRole('tab',{name:/Khung lương/}).click();await page.getByRole('button',{name:/Đăng ký khung lương/}).click();await dialogFitAndFocus(page)
  }else if(route==='/payroll')await expect(page.getByTestId('production-main-content').getByRole('alert')).toContainText('403')
 }
 await writeFile(info.outputPath('enabled-matrix.json'),JSON.stringify(evidence,null,2))
})

test('Member next-shift CTA opens the canonical details at phone width',async({page})=>{
 await identity(page,'3');await page.setViewportSize({width:375,height:811});await page.goto('/')
 await page.getByTestId('member-next-shift-details').click();await expect(page.getByTestId('shift-detail-modal')).toBeVisible();await dialogFitAndFocus(page)
})
