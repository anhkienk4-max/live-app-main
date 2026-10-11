import test from 'node:test'
import assert from 'node:assert/strict'
import { createWorkforceActualHandler } from '@/lib/server/workforceActualHandler'
import { createWorkforcePayrollHandler } from '@/lib/server/workforcePayrollHandler'
import { createWorkforcePerformanceHandler } from '@/lib/server/workforcePerformanceHandler'

const get=(url:string)=>new Request(url)
const post=(url:string,body:object)=>new Request(url,{
  method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),
})
const mustNotUseDb=()=>{throw new Error('UNAUTHORIZED_DB_ACCESS')}
const anon=async()=>null
const leader=async()=>({id:'auth-leader',businessUserId:'leader-1',systemPermission:'leader' as const})
const member=async()=>({id:'auth-member',businessUserId:'staff-1',systemPermission:'member' as const})

test('Actual Staffing rejects anonymous before accessing privileged client',async()=>{
  const handler=createWorkforceActualHandler({client:mustNotUseDb,resolveUser:anon})
  const a=await handler.GET(get('https://example.test/api/workforce/actual?shift_id=shift-1'))
  const b=await handler.POST(post('https://example.test/api/workforce/actual',{action:'record'}))
  assert.equal(a.status,401)
  assert.equal(b.status,401)
})
test('Payroll protects all salary rates/periods from leader role without DB access',async()=>{
  const handler=createWorkforcePayrollHandler({createClient:mustNotUseDb,resolveUser:leader})
  const a=await handler.GET(get('https://example.test/api/workforce/payroll?period_id=period-1'))
  const b=await handler.POST(post('https://example.test/api/workforce/payroll',{
    action:'create_period',period_start:'2026-09-01',period_end:'2026-09-30',
  }))
  assert.equal(a.status,403)
  assert.equal(b.status,403)
})
test('Workforce Performance allows own scope only; cannot override lateness policy',async()=>{
  const handler=createWorkforcePerformanceHandler({
    createClient:mustNotUseDb,resolveUser:member,lateGraceMinutes:()=>5,
  })
  const other=await handler.GET(get(
    'https://example.test/api/workforce/performance?staff_id=staff-2&role=host&month=2026-09',
  ))
  assert.equal(other.status,403)
  const bad=await handler.GET(get(
    'https://example.test/api/workforce/performance?staff_id=staff-1&role=host&month=2026-09&lateGraceMinutes=0',
  ))
  assert.equal(bad.status,400)
})
test('Workforce Performance has no unapproved default lateness/grace period',async()=>{
  const handler=createWorkforcePerformanceHandler({
    createClient:mustNotUseDb,resolveUser:member,lateGraceMinutes:()=>null,
  })
  const result=await handler.GET(get(
    'https://example.test/api/workforce/performance?staff_id=staff-1&role=host&month=2026-09',
  ))
  assert.equal(result.status,409)
  assert.equal((await result.json() as {error:{code:string}}).error.code,
    'WORKFORCE_GRACE_POLICY_NOT_CONFIGURED')
})
