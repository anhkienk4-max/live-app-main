import test from 'node:test'
import assert from 'node:assert/strict'
import { createWorkforcePayrollHandler } from '@/lib/server/workforcePayrollHandler'

type Row={id:string;[key:string]:unknown}
const admin=async()=>({id:'admin-auth',businessUserId:'admin-1',systemPermission:'admin' as const})
const url='https://example.test/api/workforce/payroll'
function request(action:string='auto_calculate_draft'){
  return new Request(url,{method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({action,period_id:'period-1'})})
}
function mockDb(fault:'none'|'shift_count_drift'|'segment_missing_count'|'rate_duplicate'|'payroll_missing_count'='none'){
  const shifts:Row[]=Array.from({length:1205},(_,i)=>({
    id:'shift-'+String(i).padStart(5,'0'),date:'2026-09-01',deleted_at:null,
  }))
  const registrations:Row[]=[]
  const lines:Row[]=[]
  const segments:Row[]=[{
    id:'seg-1',shift_id:'shift-01204',staff_id:'staff-1',operational_role:'host',
    event_kind:'worked',review_status:'approved',
    actual_start_at:'2026-09-01T09:00:00+07:00',
    actual_end_at:'2026-09-01T10:00:00+07:00',
    review_note:'Supervisor verified actual hours',evidence_note:null,
  }]
  const rates:Row[]=[{
    id:'rate-1',staff_id:null,operational_role:'host',
    effective_from:'2026-01-01',effective_through:null,vnd_per_hour:100000,
    overtime_multiplier_basis_points:15000,approved_by:'admin-2',
  }]
  const sources:Record<string,Row[]>={
    shifts,shift_registrations:registrations,workforce_actual_segments:segments,
    workforce_rate_cards:rates,workforce_payroll_lines:lines,
  }
  let writes=0
  let reads=0
  let inserted:Row[]=[]
  const db={
    from(table:string){
      const filters:Array<(row:Row)=>boolean>=[]
      const q={
        select(){return q},
        eq(col:string,value:unknown){filters.push(row=>row[col]===value);return q},
        gte(col:string,value:string){filters.push(row=>String(row[col])>=value);return q},
        lte(col:string,value:string){filters.push(row=>String(row[col])<=value);return q},
        is(col:string,value:unknown){filters.push(row=>row[col]===value);return q},
        not(){return q},
        in(col:string,values:unknown[]){filters.push(row=>values.includes(row[col]));return q},
        order(){return q},
        async maybeSingle(){
          if(table==='workforce_payroll_periods')return {
            data:{id:'period-1',status:'draft',period_start:'2026-09-01',period_end:'2026-09-30'},
            error:null,
          }
          throw Error('UNEXPECTED_SINGLE_'+table)
        },
        async range(from:number,to:number){
          reads++
          const source=(sources[table]??[]).filter(row=>filters.every(f=>f(row)))
            .sort((a,b)=>a.id.localeCompare(b.id))
          const page=source.slice(from,to+1)
          let count:number|null=source.length
          if(fault==='shift_count_drift'&&table==='shifts'&&from>0)count=source.length-1
          if(fault==='segment_missing_count'&&table==='workforce_actual_segments')count=null
          if(fault==='payroll_missing_count'&&table==='workforce_payroll_lines')count=null
          if(fault==='rate_duplicate'&&table==='workforce_rate_cards'&&from===0)
            page.push({...page[0]})
          return {data:page,count,error:null}
        },
      }
      return q
    },
    async rpc(name:string,args:Record<string,unknown>){
      writes++
      assert.equal(name,'workforce_rc17b_auto_calculate_draft_batch')
      inserted=(args.p_insert_lines as Row[])
      return {data:{inserted_lines:inserted,recalculated_lines:[]},error:null}
    },
  }
  return {db,reads:()=>reads,writes:()=>writes,inserted:()=>inserted}
}

test('Payroll auto-calc reads all 1,205 shifts, detects last shift evidence and inserts only approved actual',async()=>{
  const fixture=mockDb()
  const handler=createWorkforcePayrollHandler({createClient:(()=>fixture.db) as never,
    resolveUser:admin,isEnabled:()=>true})
  const response=await handler.POST(request())
  assert.equal(response.status,200,JSON.stringify(await response.clone().json()))
  const result=await response.json() as {
    ok:boolean;prepared_count:number;reconciliation:{total_approved_segments:number}
  }
  assert.equal(result.ok,true)
  assert.equal(result.prepared_count,1)
  assert.equal(result.reconciliation.total_approved_segments,1)
  assert.equal(fixture.inserted()[0]?.segment_id,'seg-1')
  assert.equal(fixture.writes(),1)
  assert.ok(fixture.reads()>4)
})

for(const [fault,code] of [
  ['shift_count_drift','WORKFORCE_SHIFT_READ_FAILED'],
  ['segment_missing_count','WORKFORCE_ACTUAL_READ_FAILED'],
  ['rate_duplicate','WORKFORCE_RATES_INCOMPLETE'],
  ['payroll_missing_count','WORKFORCE_PAYROLL_READ_FAILED'],
] as const){
  test('Payroll blocks draft mutation when source is incomplete: '+fault,async()=>{
    const fixture=mockDb(fault)
    const handler=createWorkforcePayrollHandler({createClient:(()=>fixture.db) as never,
      resolveUser:admin,isEnabled:()=>true})
    const response=await handler.POST(request())
    assert.equal(response.status,503)
    const body=await response.json() as {ok:boolean;error:{code:string}}
    assert.equal(body.ok,false)
    assert.equal(body.error.code,code)
    assert.equal(fixture.writes(),0)
  })
}
