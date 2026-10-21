import test from 'node:test'
import assert from 'node:assert/strict'
import { createWorkforceActualHandler } from '@/lib/server/workforceActualHandler'
import { createWorkforcePayrollHandler } from '@/lib/server/workforcePayrollHandler'
import { createWorkforcePerformanceHandler } from '@/lib/server/workforcePerformanceHandler'
import { createWorkforceOverviewHandler } from '@/lib/server/workforceOverviewHandler'
import { WORKFORCE_LATE_GRACE_MINUTES } from '@/lib/workforce/workforcePolicy'

const get=(url:string)=>new Request(url)
const post=(url:string,body:object)=>new Request(url,{
  method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),
})
const mustNotUseDb=()=>{throw new Error('UNAUTHORIZED_DB_ACCESS')}
const anon=async()=>null
const leader=async()=>({id:'auth-leader',businessUserId:'leader-1',systemPermission:'leader' as const})
const member=async()=>({id:'auth-member',businessUserId:'staff-1',systemPermission:'member' as const})
const admin=async()=>({id:'auth-admin',businessUserId:'admin-1',systemPermission:'admin' as const})
const correctionRequest={
  action:'correct_line',period_id:'period-1',line_id:'line-1',expected_version:1,
  request_id:'00000000-0000-4000-8000-000000000001',reason:'Verified attendance correction',
  payable_minutes:60,overtime_minutes:30,adjustment_vnd:-1000,
  adjustment_reason:'Independent adjustment approved',
}

test('RC1.8A uses the approved 10-minute Workforce grace independently from Payroll',()=>{
  assert.equal(WORKFORCE_LATE_GRACE_MINUTES,10)
})
function correctionClient(rpc: (name:string,args:Record<string,unknown>)=>unknown) {
  return ()=>({
    from(){
      const q={select(){return q},eq(){return q},async maybeSingle(){
        return {data:{actual_minutes:90,rate_vnd_per_hour:100000,
          overtime_multiplier_basis_points:15000},error:null}
      }}
      return q
    },rpc,
  })
}

test('Actual Staffing rejects anonymous before accessing privileged client',async()=>{
  const handler=createWorkforceActualHandler({isEnabled:()=>true,client:mustNotUseDb,resolveUser:anon})
  const a=await handler.GET(get('https://example.test/api/workforce/actual?shift_id=shift-1'))
  const b=await handler.POST(post('https://example.test/api/workforce/actual',{action:'record'}))
  assert.equal(a.status,401)
  assert.equal(b.status,401)
})
test('Payroll protects all salary rates/periods from leader role without DB access',async()=>{
  const handler=createWorkforcePayrollHandler({isEnabled:()=>true,createClient:mustNotUseDb,resolveUser:leader})
  const a=await handler.GET(get('https://example.test/api/workforce/payroll?period_id=period-1'))
  const b=await handler.POST(post('https://example.test/api/workforce/payroll',{
    action:'create_period',period_start:'2026-09-01',period_end:'2026-09-30',
  }))
  assert.equal(a.status,403)
  assert.equal(b.status,403)
})
test('Locked payroll CSV after correction preserves negative VND numbers and excludes voided evidence',async()=>{
  const payrollRow={
    staff_id:'=HYPERLINK("https://unsafe.invalid","test")',
    operational_role:'host',segment_id:'seg-1',actual_minutes:90,
    payable_minutes:60,overtime_minutes:30,rate_vnd_per_hour:100000,
    overtime_multiplier_basis_points:15000,gross_vnd:125000,
    adjustment_vnd:-1000,net_vnd:124000,
    adjustment_reason:'Correction approved',calculation_version:'rc16-v1',
  }
  const fakeClient=()=>({
    rpc(name:string){
      assert.equal(name,'get_payroll_period_snapshot')
      const lines=[payrollRow,{...payrollRow,segment_id:'voided-evidence',voided_at:'2026-10-01T00:00:00Z'}]
      return Promise.resolve({data:{period:{status:'locked',period_start:'2026-09-01',period_end:'2026-09-30'},lines,audit:[],lineCount:2,auditCount:0},error:null})
    },
    from(name:string){
      const q={
        select(_fields:string){return q},
        eq(_field:string,_value:unknown){return q},
        order(_field:string,_options:unknown){return q},
        limit(_max:number){
          return Promise.resolve({data:name==='workforce_payroll_lines'?
            [payrollRow,{...payrollRow,segment_id:'voided-evidence',voided_at:'2026-10-01T00:00:00Z'}]:[],error:null})
        },
        maybeSingle(){
          return Promise.resolve({data:{status:'locked',period_start:'2026-09-01',
            period_end:'2026-09-30'},error:null})
        },
      }
      return q
    },
  })
  const handler=createWorkforcePayrollHandler({isEnabled:()=>true,
    createClient:fakeClient as never,
    resolveUser:async()=>({id:'auth-admin',businessUserId:'admin-1',systemPermission:'admin'}),
  })
  const response=await handler.GET(get(
    'https://example.test/api/workforce/payroll?period_id=period-1&export=csv',
  ))
  assert.equal(response.status,200)
  const csv=await response.text()
  assert.ok(csv.includes(',"125000","-1000","124000",'))
  assert.equal(csv.includes(`"'-1000"`),false)
  assert.ok(csv.includes(`"'=HYPERLINK`))
  assert.equal(csv.includes('voided-evidence'),false)
})

test('Payroll correction and void reject anonymous/Leader/Member before database access',async()=>{
  for(const resolveUser of [anon,leader,member]){
    const h=createWorkforcePayrollHandler({isEnabled:()=>true,createClient:mustNotUseDb,resolveUser})
    for(const action of ['correct_line','void_line']){
      const r=await h.POST(post('https://example.test/api/workforce/payroll',{
        ...correctionRequest,action,
      }))
      assert.equal(r.status,resolveUser===anon?401:403)
    }
  }
})

test('Payroll correction strictly rejects client salary, missing reason and invalid versions',async()=>{
  const h=createWorkforcePayrollHandler({isEnabled:()=>true,createClient:mustNotUseDb,resolveUser:admin})
  for(const changes of [
    {gross_vnd:1},{net_vnd:1},{reason:''},{expected_version:0},{expected_version:1.5},
    {request_id:'bad'},{payable_minutes:-1},{overtime_minutes:1441},
  ]){
    const r=await h.POST(post('https://example.test/api/workforce/payroll',{
      ...correctionRequest,...changes,
    }))
    assert.equal(r.status,400)
    assert.equal((await r.json()).error.code,'WORKFORCE_REQUEST_INVALID')
  }
})

test('Payroll correction computes VND using the stored rate and supplies authenticated actor to one RPC',async()=>{
  let calls=0
  const h=createWorkforcePayrollHandler({isEnabled:()=>true,resolveUser:admin,createClient:correctionClient((name,args)=>{
    calls++
    assert.equal(name,'workforce_rc16b_correct_payroll_line')
    assert.equal(args.p_actor_id,'admin-1')
    assert.equal(args.p_expected_gross_vnd,125000)
    assert.equal(args.p_expected_version,1)
    assert.equal(args.p_request_id,correctionRequest.request_id)
    return {data:{line:{version:2,gross_vnd:125000,net_vnd:124000},audit:{id:7},replayed:false},error:null}
  }) as never})
  const r=await h.POST(post('https://example.test/api/workforce/payroll',correctionRequest))
  assert.equal(r.status,200)
  assert.equal(r.headers.get('Cache-Control'),'no-store')
  assert.equal((await r.json()).line.net_vnd,124000)
  assert.equal(calls,1)
})

test('Payroll rejects invalid payable/OT/adjustment independently before invoking RPC',async()=>{
  const h=createWorkforcePayrollHandler({isEnabled:()=>true,resolveUser:admin,
    createClient:correctionClient(()=>{throw Error('INVALID_CORRECTION_RPC')}) as never})
  for(const changes of [
    {payable_minutes:91},{overtime_minutes:61},{adjustment_reason:null},
    {adjustment_vnd:0},{adjustment_vnd:-200000},
  ]){
    const r=await h.POST(post('https://example.test/api/workforce/payroll',{
      ...correctionRequest,...changes,
    }))
    assert.equal(r.status,409)
  }
})

test('Payroll maps stale/Reviewed/Locked/voided/idempotency conflicts to 409 and DB authorization to 403',async()=>{
  for(const message of [
    'WORKFORCE_PAYROLL_STALE_LINE','WORKFORCE_PAYROLL_PERIOD_NOT_DRAFT',
    'WORKFORCE_PAYROLL_LINE_VOIDED','WORKFORCE_PAYROLL_IDEMPOTENCY_CONFLICT',
    'WORKFORCE_PAYROLL_ACTOR_FORBIDDEN','WORKFORCE_PAYROLL_CORRECTION_INVALID',
    'UNEXPECTED_DATABASE_DETAIL',
  ]){
    const h=createWorkforcePayrollHandler({isEnabled:()=>true,resolveUser:admin,
      createClient:correctionClient(()=>({data:null,error:{message}})) as never})
    const r=await h.POST(post('https://example.test/api/workforce/payroll',correctionRequest))
    assert.equal(r.status,message==='WORKFORCE_PAYROLL_ACTOR_FORBIDDEN'?403:
      message==='WORKFORCE_PAYROLL_CORRECTION_INVALID'?400:
        message==='UNEXPECTED_DATABASE_DETAIL'?503:409)
    assert.equal((await r.json()).error.code,message==='UNEXPECTED_DATABASE_DETAIL'
      ?'WORKFORCE_PAYROLL_CORRECTION_FAILED':message)
  }
})

test('Payroll void forwards no amounts and idempotent response retains original audited result',async()=>{
  const request={action:'void_line',period_id:'period-1',line_id:'line-1',
    expected_version:2,request_id:correctionRequest.request_id,reason:'Void duplicated claim evidence'}
  const h=createWorkforcePayrollHandler({isEnabled:()=>true,resolveUser:admin,
    createClient:correctionClient((_name,args)=>{
      assert.equal(args.p_payable_minutes,null)
      assert.equal(args.p_expected_gross_vnd,null)
      return {data:{line:{version:3,voided_at:'2026-10-11T00:00:00Z'},
        audit:{line_version:3,action:'void_line'},replayed:true},error:null}
    }) as never})
  const r=await h.POST(post('https://example.test/api/workforce/payroll',request))
  assert.equal(r.status,200)
  const body=await r.json()
  assert.equal(body.replayed,true)
  assert.equal(body.line.version,3)
  assert.equal(body.audit.action,'void_line')
})

test('Workforce Performance allows own scope only; cannot override lateness policy',async()=>{
  const handler=createWorkforcePerformanceHandler({isEnabled:()=>true,
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
  const handler=createWorkforcePerformanceHandler({isEnabled:()=>true,
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
  const handler=createWorkforceOverviewHandler({isEnabled:()=>true,
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
  const handler=createWorkforceActualHandler({isEnabled:()=>true,
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
