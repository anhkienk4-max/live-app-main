import { expect, test, type Page } from '@playwright/test'

async function manager(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('livestream-ops-current-user','3')
    localStorage.setItem('livestream-ops-language','en')
  })
  await page.route('**/api/workforce/capabilities', route => route.fulfill({json:{ok:true,capabilities:{
    actual_staffing:false,self_attendance_review:true,team_performance:false,own_performance:false,payroll:false,
  }}}))
  const item = {id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',shift_id:'s1',staff_id:'3',role:'host',event:'check_in',
    recorded_at:'2026-10-29T02:00:00.000Z',photo_available:true,version:0,evidence_revision:1,evidence_revisions:[{revision:1,created_at:'2026-10-29T02:00:00.000Z'}],status:'pending_verification',review_history:[]}
  await page.route('**/api/workforce/attendance-photo-review**',route=>route.request().method()==='GET'
    ? route.fulfill({json:{ok:true,events:[item]}})
    : route.fulfill({json:{ok:true,review:{version:1}}}))
}

test('mock reviewer sees a separate review tab and records a reason without opening Actual Staffing', async ({page})=>{
  await page.setViewportSize({width:1440,height:900})
  await manager(page)
  await page.goto('/calendar')
  await page.getByTestId('calendar-event-s1').click()
  const capabilitiesResponse = page.waitForResponse(response => response.url().includes('/api/workforce/capabilities'))
  await page.getByRole('button',{name:'View Full Shift'}).click()
  expect((await (await capabilitiesResponse).json()).capabilities.self_attendance_review).toBe(true)
  await expect(page.getByRole('tab',{name:'Photo review'})).toBeVisible()
  await page.getByRole('tab',{name:'Photo review'}).click()
  await expect(page.getByTestId('attendance-photo-review-event')).toBeVisible()
  await page.getByLabel('Decision').selectOption('correction_requested')
  await page.getByLabel('Review reason').fill('Please submit a clearer timestamp photo.')
  await page.getByRole('button',{name:'Record decision'}).click()
  await expect(page.getByTestId('attendance-photo-review-event')).toBeVisible()
})

test('assigned member can resubmit a correction as a new request without recording attendance', async ({page})=>{
  await page.addInitScript(()=>{
    localStorage.setItem('livestream-ops-current-user','3')
    localStorage.setItem('livestream-ops-language','en')
  })
  await page.route('**/api/workforce/capabilities',route=>route.fulfill({json:{ok:true,capabilities:{
    actual_staffing:false,self_attendance_review:false,team_performance:false,own_performance:true,payroll:false,
  }}}))
  await page.route('**/rest/v1/rpc/get_my_self_attendance',route=>route.fulfill({json:[]}))
  let attendanceWrites=0
  await page.route('**/rest/v1/rpc/self_attendance_record',route=>{attendanceWrites++;return route.abort()})
  const correction={id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa0005',shift_id:'s1',role:'host',event:'check_in',
    recorded_at:'2026-10-29T02:00:00.000Z',version:1,evidence_revision:1,correction_requested_by:'Please submit a clearer timestamp photo.'}
  let uploads=0
  await page.route('**/api/workforce/attendance-photo-review**',route=>route.fulfill({json:{ok:true,corrections:uploads?[]:[correction]}}))
  let submittedBody=''
  await page.route('**/api/workforce/self-attendance-photo',async route=>{
    uploads++
    submittedBody=route.request().postData()??''
    return route.fulfill({json:{ok:true,correction:{event_id:correction.id,revision:2}}})
  })
  await page.goto('/calendar')
  await page.getByTestId('calendar-event-s1').click()
  await page.getByRole('button',{name:/View Full Shift/i}).click()
  await page.getByRole('tab',{name:'Check-in / Check-out'}).click()
  await expect(page.getByTestId('attendance-correction-panel')).toBeVisible()
  await page.getByLabel('Replacement photo (JPG, PNG or WebP, max 4 MB)')
    .setInputFiles({name:'replacement.jpg',mimeType:'image/jpeg',buffer:Buffer.from([0xff,0xd8,0xff,0xd9])})
  await page.getByRole('button',{name:'Submit correction'}).click()
  await expect(page.getByTestId('attendance-correction-panel')).toHaveCount(0)
  expect(uploads).toBe(1)
  expect(submittedBody).toContain(`name="correction_event_id"`)
  expect(submittedBody).toContain(correction.id)
  expect(submittedBody).toContain(`name="request_id"`)
  expect(attendanceWrites).toBe(0)
})
