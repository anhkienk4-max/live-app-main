import test from 'node:test'
import assert from 'node:assert/strict'
import { createWorkforceActualHandler } from '@/lib/server/workforceActualHandler'
import { createWorkforcePayrollHandler } from '@/lib/server/workforcePayrollHandler'
import { createWorkforcePerformanceHandler } from '@/lib/server/workforcePerformanceHandler'
import { createWorkforceOverviewHandler } from '@/lib/server/workforceOverviewHandler'

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
test('Locked payroll CSV preserves negative VND numbers without exposing formulas',async()=>{
  const payrollRow={
    staff_id:'=HYPERLINK("https://unsafe.invalid","test")',
    operational_role:'host',segment_id:'seg-1',actual_minutes:90,
    payable_minutes:90,overtime_minutes:0,rate_vnd_per_hour:100000,
    overtime_multiplier_basis_points:10000,gross_vnd:150000,
    adjustment_vnd:-1000,net_vnd:149000,
    adjustment_reason:'Correction approved',calculation_version:'rc16-v1',
  }
  const fakeClient=()=>({
    from(name:string){
      const q={
        select(_fields:string){return q},
        eq(_field:string,_value:unknown){return q},
        order(_field:string,_options:unknown){return q},
        limit(_max:number){
          return Promise.resolve({data:name==='workforce_payroll_lines'?[payrollRow]:[],error:null})
        },
        maybeSingle(){
          return Promise.resolve({data:{status:'locked',period_start:'2026-09-01',
            period_end:'2026-09-30'},error:null})
        },
      }
      return q
    },
  })
  const handler=createWorkforcePayrollHandler({
    createClient:fakeClient as never,
    resolveUser:async()=>({id:'auth-admin',businessUserId:'admin-1',systemPermission:'admin'}),
  })
  const response=await handler.GET(get(
    'https://example.test/api/workforce/payroll?period_id=period-1&export=csv',
  ))
  assert.equal(response.status,200)
  const csv=await response.text()
  assert.ok(csv.includes(',"-1000","149000",'))
  assert.equal(csv.includes(`"'-1000"`),false)
  assert.ok(csv.includes(`"'=HYPERLINK`))
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

test('team overview requires Leader/Admin; a member cannot enumerate colleagues',async()=>{
  const handler=createWorkforceOverviewHandler({
    createClient:mustNotUseDb,resolveUser:member,grace:()=>5,
  })
  const response=await handler.GET(get('https://example.test/api/workforce/overview?month=2026-09&role=host'))
  assert.equal(response.status,403)
})


test('Actual Staffing cannot record a future/scheduled shift as confirmed attendance', async () => {
  const url='https://example.test/api/workforce/actual'
  let insertCount=0
  const fakeClient=()=>({
    from(name:string) {
      const q={
        select(_columns:string){return q},
        eq(_key:string,_val:unknown){return q},
        is(_key:string,_val:unknown){return q},
        async maybeSingle(){
          if(name==='shifts')return {data:{id:'shift-upcoming',status:'scheduled',deleted_at:null},error:null}
          if(name==='business_users')return {data:{id:'staff-1',status:'active',deleted_at:null},error:null}
          return {data:null,error:null}
        },
        insert(_data:unknown){insertCount++;throw Error('UNEXPECTED_INSERT')},
      }
      return q
    },
  })
  const handler=createWorkforceActualHandler({
    client:fakeClient as never,
    resolveUser:async()=>({id:'auth-admin',businessUserId:'admin-1',systemPermission:'admin'}),
  })
  const response=await handler.POST(post(url,{
    action:'record',shift_id:'shift-upcoming',staff_id:'staff-1',
    operational_role:'host',event_kind:'worked',coverage_kind:'planned',
    actual_start_at:'2026-11-20T09:00:00+07:00',
    actual_end_at:'2026-11-20T11:00:00+07:00',
    evidence_note:'Evidence cannot exist before shift completion',
  }))
  assert.equal(response.status,409)
  assert.equal((await response.json()).error.code,'WORKFORCE_SHIFT_NOT_COMPLETED')
  assert.equal(insertCount,0)
})
