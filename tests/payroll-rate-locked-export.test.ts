import test from 'node:test'
import assert from 'node:assert/strict'
import { createWorkforcePayrollHandler } from '@/lib/server/workforcePayrollHandler'

const admin=async()=>({id:'auth-admin',businessUserId:'admin-1',systemPermission:'admin' as const})
const member=async()=>({id:'auth-member',businessUserId:'staff-1',systemPermission:'member' as const})
const payrollUrl='https://example.test/api/workforce/payroll'
const ratePayload={
  action:'register_rate',staff_id:'staff-2',operational_role:'host',
  effective_from:'2026-11-01',effective_through:null,
  vnd_per_hour:100000,overtime_multiplier_basis_points:15000,
  approval_note:'Approved after rate review',
}
function rateClient(reply:()=>Promise<{data:unknown;error:unknown}>){
  let directWrites=0
  let rpcCalls=0
  return {
    client:()=>({
      rpc(name:string,args:Record<string,unknown>){
        rpcCalls++
        assert.equal(name,'workforce_rc17b_register_rate_card')
        assert.equal(args.p_approved_by,'admin-1')
        return reply()
      },
      from(){directWrites++;throw Error('DIRECT_RATE_INSERT_FORBIDDEN')},
    }),
    writes:()=>directWrites,
    rpcCalls:()=>rpcCalls,
  }
}
const rateRequest=()=>new Request(payrollUrl,{
  method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(ratePayload),
})
for(const reason of [
  {code:'PGRST202',message:'RPC not found'},
  {code:'42883',message:'undefined function'},
  {code:'',message:'function public.workforce_rc17b_register_rate_card does not exist'},
]){
  test('Rate registration never falls back to an unaudited direct INSERT: '+reason.code,async()=>{
    const fixture=rateClient(async()=>({data:null,error:reason}))
    const handler=createWorkforcePayrollHandler({
      createClient:fixture.client as never,resolveUser:admin,isEnabled:()=>true,
    })
    const response=await handler.POST(rateRequest())
    assert.equal(response.status,503)
    assert.equal((await response.json() as {error:{code:string}}).error.code,
      'WORKFORCE_RATE_RPC_UNAVAILABLE')
    assert.equal(fixture.rpcCalls(),1)
    assert.equal(fixture.writes(),0)
  })
}
test('Rate RPC success without a real persisted rate ID fails closed',async()=>{
  for(const data of [null,{}, {rate:{}}, {rate:{id:''}}]){
    const fixture=rateClient(async()=>({data,error:null}))
    const handler=createWorkforcePayrollHandler({
      createClient:fixture.client as never,resolveUser:admin,isEnabled:()=>true,
    })
    const response=await handler.POST(rateRequest())
    assert.equal(response.status,503)
    assert.equal((await response.json() as {error:{code:string}}).error.code,
      'WORKFORCE_RATE_RPC_RESPONSE_INVALID')
    assert.equal(fixture.writes(),0)
  }
})
test('Rate RPC success preserves atomic supersession result and 201 response',async()=>{
  const fixture=rateClient(async()=>({data:{
    rate:{id:'rate-new',effective_from:'2026-11-01'},
    superseded_rate_id:'rate-previous',
  },error:null}))
  const handler=createWorkforcePayrollHandler({
    createClient:fixture.client as never,resolveUser:admin,isEnabled:()=>true,
  })
  const response=await handler.POST(rateRequest())
  assert.equal(response.status,201)
  const body=await response.json() as {rate:{id:string};superseded_rate_id:string}
  assert.equal(body.rate.id,'rate-new')
  assert.equal(body.superseded_rate_id,'rate-previous')
  assert.equal(fixture.writes(),0)
})
test('Rate overlap/locked-period RPC errors do not trigger non-atomic fallback',async()=>{
  for(const message of [
    'WORKFORCE_APPROVED_RATE_OVERLAP','WORKFORCE_RATE_RETROACTIVE_LOCKED_PERIOD',
  ]){
    const fixture=rateClient(async()=>({data:null,error:{message}}))
    const handler=createWorkforcePayrollHandler({
      createClient:fixture.client as never,resolveUser:admin,isEnabled:()=>true,
    })
    const response=await handler.POST(rateRequest())
    assert.equal(response.status,409)
    assert.equal((await response.json() as {error:{code:string}}).error.code,message)
    assert.equal(fixture.writes(),0)
  }
})
test('Non-admin rate mutation never calls privileged RPC',async()=>{
  const fixture=rateClient(async()=>{throw Error('UNAUTHORIZED_RPC')})
  const handler=createWorkforcePayrollHandler({
    createClient:fixture.client as never,resolveUser:member,isEnabled:()=>true,
  })
  const response=await handler.POST(rateRequest())
  assert.equal(response.status,403)
  assert.equal(fixture.rpcCalls(),0)
})

const row=(index:number)=>({
  staff_id:'staff-'+String(index%37),operational_role:'host',
  segment_id:'segment-'+String(index).padStart(6,'0'),
  actual_minutes:60,payable_minutes:60,overtime_minutes:0,
  rate_vnd_per_hour:120000,overtime_multiplier_basis_points:15000,
  gross_vnd:120000,adjustment_vnd:index===27?-1000:0,
  net_vnd:index===27?119000:120000,
  adjustment_reason:index===27?'Verified correction':null,
  calculation_version:'rc16-v1',voided_at:null as string|null,
})
function exportHandler(
  lines:ReturnType<typeof row>[],options:{status?:string;expectedCount?:number}={},
){
  let calls=0
  const handler=createWorkforcePayrollHandler({
    isEnabled:()=>true,resolveUser:admin,
    createClient:(()=>({rpc(name:string){
      calls++
      assert.equal(name,'get_payroll_period_snapshot')
      return Promise.resolve({data:{
        period:{status:options.status??'locked',period_start:'2026-09-01',period_end:'2026-09-30'},
        lines,audit:[],lineCount:options.expectedCount??lines.length,auditCount:0,
      },error:null})
    }})) as never,
  })
  return {handler,calls:()=>calls}
}
const csvRequest=new Request(payrollUrl+'?period_id=period-1&export=csv')

test('Locked CSV includes 3,205 unique active rows without one-page cutoff',async()=>{
  const lines=Array.from({length:3205},(_,i)=>row(i))
  lines.push({...row(3205),voided_at:'2026-10-01T00:00:00Z'})
  const fixture=exportHandler(lines)
  const response=await fixture.handler.GET(csvRequest)
  assert.equal(response.status,200)
  assert.match(response.headers.get('Content-Type')??'',/^text\/csv/u)
  const csv=await response.text()
  const output=csv.trim().split('\r\n')
  assert.equal(output.length,3206)
  assert.ok(csv.startsWith('\ufeff'))
  assert.ok(csv.includes('segment-003204'))
  assert.ok(!csv.includes('segment-003205'))
  assert.ok(csv.includes('"120000","-1000","119000"'))
  assert.equal(fixture.calls(),1)
})

test('Locked CSV fails closed for duplicate or missing active segment identity',async()=>{
  for(const lines of [
    [row(1),{...row(1),staff_id:'another-staff'}],
    [{...row(1),segment_id:''}],
  ]){
    const fixture=exportHandler(lines)
    const response=await fixture.handler.GET(csvRequest)
    assert.equal(response.status,503)
    assert.equal((await response.json() as {error:{code:string}}).error.code,
      'WORKFORCE_PAYROLL_EXPORT_INCOMPLETE')
  }
})

test('Locked CSV rejects incomplete snapshots and unlocked periods',async()=>{
  const invalid=exportHandler([row(1)],{expectedCount:2})
  const result=await invalid.handler.GET(csvRequest)
  assert.equal(result.status,503)
  assert.equal((await result.json() as {error:{code:string}}).error.code,
    'WORKFORCE_PAYROLL_READ_INCOMPLETE')
  const unlocked=exportHandler([row(1)],{status:'draft'})
  const response=await unlocked.handler.GET(csvRequest)
  assert.equal(response.status,409)
  assert.equal((await response.json() as {error:{code:string}}).error.code,
    'WORKFORCE_PAYROLL_EXPORT_REQUIRES_LOCK')
})
