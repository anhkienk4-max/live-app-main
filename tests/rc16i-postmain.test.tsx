import test from 'node:test'
import assert from 'node:assert/strict'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { LanguageProvider } from '@/lib/i18n'
import { workforceService, WorkforceServiceError } from '@/lib/services/workforceService'
import { filterWorkforceNavigation } from '@/lib/ui/workforceNavigation'
import { PayrollAuditTimeline } from '@/components/features/payroll/PayrollAuditTimeline'
import { WorkforceTeamOverview } from '@/components/features/workforce/WorkforceTeamOverview'
import { WorkforceLeaderboard } from '@/components/features/workforce/WorkforceLeaderboard'
import { aggregateWorkforceTeam } from '@/lib/workforce/workforceOverview'
import { summarizeWorkforcePerformance } from '@/lib/workforce/workforcePerformance'

const render = (content: React.ReactNode) => renderToStaticMarkup(<LanguageProvider>{content}</LanguageProvider>)

test('Capabilities hide each module independently and fail closed for malformed booleans',async()=>{
  const items=[{href:'/calendar'},{href:'/payroll'},{href:'/workforce'}]
  for(const payroll of [false,true])for(const workforce of [false,true]){
    const visible=filterWorkforceNavigation(items,{payroll,actual_staffing:workforce,team_performance:workforce,own_performance:workforce})
    assert.equal(visible.some(row=>row.href==='/payroll'),payroll)
    assert.equal(visible.some(row=>row.href==='/workforce'),workforce)
    assert.ok(visible.some(row=>row.href==='/calendar'))
  }
  const previous=globalThis.fetch
  try{
    globalThis.fetch=async()=>Response.json({ok:true,capabilities:{payroll:'true'}})
    await assert.rejects(workforceService.getCapabilities(),/WORKFORCE_CAPABILITIES_INVALID/)
  }finally{globalThis.fetch=previous}
})

test('Client sends no-store, exact bounded discovery queries and server-authoritative monetary inputs',async()=>{
  const previous=globalThis.fetch
  const calls:Array<{url:string;init?:RequestInit}>=[]
  try{
    globalThis.fetch=async(url,init)=>{calls.push({url:String(url),init});return Response.json({ok:true,performance:{staffId:'employee'}})}
    await workforceService.listPeriods({page:2,pageSize:10,dateFrom:'2026-09-01',status:'locked'})
    await workforceService.listRates({scope:'role_default',role:'host',effectiveDate:'2026-09-30'})
    await workforceService.listRates({roles:['host','support'],scopes:['role_default','staff_specific']})
    const intent={periodId:'p',lineId:'l',expectedVersion:2,requestId:'10000000-0000-4000-8000-000000000001',reason:'Independent correction',payableMinutes:60,overtimeMinutes:30,adjustmentVnd:-1000,adjustmentReason:'Approved reduction'}
    await workforceService.correctLine(intent);await workforceService.correctLine(intent)
    assert.equal(calls[0].url,'/api/workforce/payroll?action=list_periods&page=2&page_size=10&date_from=2026-09-01&status=locked')
    assert.match(calls[1].url,/scope=role_default/)
    const multiQuery=new URL(calls[2].url,'https://local.invalid').searchParams
    assert.deepEqual(multiQuery.getAll('roles'),['host','support'])
    assert.deepEqual(multiQuery.getAll('scopes'),['role_default','staff_specific'])
    assert.equal(calls[3].init?.body,calls[4].init?.body)
    const body=JSON.parse(String(calls[3].init?.body))
    assert.equal(body.adjustment_vnd,-1000);assert.equal(body.expected_version,2)
    assert.equal(body.gross_vnd,undefined);assert.equal(body.net_vnd,undefined)
    for(const call of calls){assert.equal(call.init?.cache,'no-store');assert.equal(call.init?.credentials,'same-origin')}
    const performance=await workforceService.getWorkforcePerformance({staffId:'employee',role:'host',month:'2026-09'})
    assert.equal(performance.performance.staffId,'employee')
  }finally{globalThis.fetch=previous}
})

test('Client preserves typed 401/403/409/503 failures; never promotes partial responses to data',async()=>{
  const previous=globalThis.fetch
  try{
    for(const status of [401,403,409,503]){
      globalThis.fetch=async()=>Response.json({ok:false,error:{code:'SYNTHETIC_ERROR'}},{status})
      await assert.rejects(workforceService.getPeriod('p'),err=>err instanceof WorkforceServiceError&&err.status===status)
    }
  }finally{globalThis.fetch=previous}
})

test('Real components show UNKNOWN evidence and do not fabricate punctuality or rankings',()=>{
  const summary=summarizeWorkforcePerformance('employee','host',[{shiftId:'s',staffId:'employee',role:'host',scheduledStartAt:'2026-09-01T00:00:00Z',shiftDate:'2026-09-01'}],[],{lateGraceMinutes:0})
  const html=render(<WorkforceTeamOverview overview={aggregateWorkforceTeam([summary])} staffList={[summary]} month="2026-09" role="host" onSelectStaff={()=>{}} />)
  assert.equal(summary.approvedNoShows,0);assert.equal(summary.unknownAttendanceShifts,1)
  assert.equal(summary.punctualityPct,null)
  assert.match(html,/employee/)
  const leaderboard=render(<WorkforceLeaderboard leaderboard={[]} isConfigured={false} month="2026-09" role="host" />)
  assert.match(leaderboard,/Chưa kích hoạt/)
})

test('Audit component renders full immutable snapshots and UUID details',()=>{
  const html=render(<PayrollAuditTimeline audit={[{id:1,period_id:'p',line_id:'l',line_version:2,action:'void_line',actor_id:'admin',reason:'Approved terminal void',from_status:'draft',to_status:'draft',created_at:'2026-09-01T00:00:00Z',request_id:'synthetic-uuid',request_payload:{action:'void_line'},previous_values:{net_vnd:125000},updated_values:{voided_at:'2026-09-01T00:00:00Z'}}]} />)
  assert.match(html,/synthetic-uuid/);assert.match(html,/net_vnd/);assert.match(html,/voided_at/)
  assert.match(html,/<details/)
})

test('Authorization and feature-disabled failures invalidate every mounted Workforce consumer', async () => {
  const previousFetch = globalThis.fetch
  const previousWindow = globalThis.window
  const target = new EventTarget()
  let invalidations = 0
  target.addEventListener('workforce-access-invalidated', () => invalidations++)
  Object.defineProperty(globalThis, 'window', { configurable: true, value: target })
  try {
    for (const [status, code] of [[401, 'AUTHENTICATION_REQUIRED'], [403, 'PERMISSION_DENIED'], [503, 'WORKFORCE_PAYROLL_FEATURE_DISABLED'], [503, 'WORKFORCE_UNAVAILABLE']] as const) {
      globalThis.fetch = async () => Response.json({ ok: false, error: { code } }, { status })
      await assert.rejects(workforceService.getPeriod('synthetic-period'), WorkforceServiceError)
    }
    assert.equal(invalidations, 3)
  } finally {
    globalThis.fetch = previousFetch
    if (previousWindow === undefined) Reflect.deleteProperty(globalThis, 'window')
    else Object.defineProperty(globalThis, 'window', { configurable: true, value: previousWindow })
  }
})
