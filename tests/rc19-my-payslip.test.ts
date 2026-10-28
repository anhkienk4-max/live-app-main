import test from 'node:test'
import assert from 'node:assert/strict'
import { createMyPayslipHandler } from '../lib/server/myPayslipHandler.ts'
import { readFileSync } from 'node:fs'

const person=(id:string)=>async()=>({id:'auth-'+id,businessUserId:id,systemPermission:'member' as const})
const locked={id:'period-1',period_start:'2026-10-01',period_end:'2026-10-31',status:'locked',locked_at:'2026-11-05T10:00:00Z',revision:1}
const line={id:'line-1',period_id:'period-1',segment_id:'seg-1',staff_id:'staff-one',operational_role:'host',
  actual_minutes:120,payable_minutes:120,overtime_minutes:0,rate_vnd_per_hour:100000,
  overtime_multiplier_basis_points:10000,gross_vnd:200000,adjustment_vnd:0,net_vnd:200000,
  adjustment_reason:null,voided_at:null}
const actual={id:'seg-1',staff_id:'staff-one',shift_id:'shift-1',operational_role:'host',event_kind:'worked',
  review_status:'approved',actual_start_at:'2026-10-20T10:00:00Z',actual_end_at:'2026-10-20T12:00:00Z'}
const shift={id:'shift-1',date:'2026-10-20',title:'Livestream shift',brand_id:'b1',platform_id:'p1'}
type DBName='workforce_payroll_periods'|'workforce_payroll_lines'|'workforce_actual_segments'|'shifts'
function fakeDb(options:{periods?:object[],lines?:object[],actuals?:object[],shifts?:object[],errors?:string[],ignoreStaffScope?:boolean}={}){
  const calls:Array<{table:string;method:string;field?:string;value?:unknown}>=[]
  const pools:Record<DBName,object[]>={
    workforce_payroll_periods: options.periods??[locked],
    workforce_payroll_lines: options.lines??[line],
    workforce_actual_segments: options.actuals??[actual],
    shifts: options.shifts??[shift],
  }
  const client=()=>({
    from(table:DBName){
      let rows=[...pools[table]]
      const filters:Array<{field:string;value:unknown}>=[]
      const builder={
        select(){return builder},
        eq(field:string,value:unknown){calls.push({table,method:'eq',field,value});filters.push({field,value});return builder},
        in(field:string,values:unknown[]){calls.push({table,method:'in',field,value:values});rows=rows.filter(r=>values.includes((r as Record<string,unknown>)[field]));return builder},
        is(field:string,value:unknown){calls.push({table,method:'is',field,value});filters.push({field,value});return builder},
        gte(field:string,value:string){rows=rows.filter(r=>String((r as Record<string,unknown>)[field])>=value);return builder},
        lte(field:string,value:string){rows=rows.filter(r=>String((r as Record<string,unknown>)[field])<=value);return builder},
        order(){return builder},
        limit(n:number){calls.push({table,method:'limit',value:n});rows=rows.slice(0,n);return builder},
        then(resolve:(x:unknown)=>unknown,reject?:(e:unknown)=>unknown){
          for(const f of filters){if(f.field==='staff_id'&&options.ignoreStaffScope)continue;rows=rows.filter(r=>(r as Record<string,unknown>)[f.field]===f.value)}
          const error=options.errors?.includes(table)?{message:'unavailable'}:null
          return Promise.resolve({data:rows,error}).then(resolve,reject)
        }
      }
      return builder
    }
  })
  return {client,calls}
}
const request=(query='')=>new Request('https://ops.example/api/workforce/my-payslip'+query)
test('unauthenticated and unresolved business ID never open the privileged client',async()=>{
  const db=fakeDb()
  const unauth=createMyPayslipHandler({createClient:db.client as never,resolveUser:async()=>null,isEnabled:()=>true})
  assert.equal((await unauth.GET(request())).status,401)
  const missing=createMyPayslipHandler({createClient:db.client as never,resolveUser:async()=>({id:'auth-only',systemPermission:'member'}),isEnabled:()=>true})
  assert.equal((await missing.GET(request())).status,403)
  assert.equal(db.calls.length,0)
})
test('feature flag is OFF by default and rejects without a DB query',async()=>{
  const db=fakeDb()
  const handler=createMyPayslipHandler({createClient:db.client as never,resolveUser:person('staff-one'),isEnabled:()=>false})
  assert.equal((await handler.GET(request())).status,503)
  assert.equal(db.calls.length,0)
})
test('member receives only own locked, non-voided, approved actual payroll lines',async()=>{
  const db=fakeDb()
  const handler=createMyPayslipHandler({createClient:db.client as never,resolveUser:person('staff-one'),isEnabled:()=>true})
  const response=await handler.GET(request('?year=2026'))
  assert.equal(response.status,200)
  const body=await response.json()
  assert.equal(body.scope,'own_locked_only')
  assert.equal(body.statements.length,1)
  assert.equal(body.statements[0].lines[0].net_vnd,200000)
  assert.equal(body.statements[0].total_net_vnd,200000)
  assert.ok(db.calls.some(c=>c.table==='workforce_payroll_lines'&&c.method==='eq'&&c.field==='staff_id'&&c.value==='staff-one'))
  assert.ok(db.calls.some(c=>c.table==='workforce_actual_segments'&&c.method==='eq'&&c.field==='staff_id'&&c.value==='staff-one'))
  assert.equal(JSON.stringify(body).includes('auth-staff-one'),false)
})
test('cross-user leakage and unapproved actual evidence fail closed even if DB filter is bypassed',async()=>{
  const cases=[{lines:[{...line,staff_id:'other-user'}]},
    {actuals:[{...actual,review_status:'draft'}]},
    {actuals:[{...actual,staff_id:'other-user'}]},
    {lines:[{...line,net_vnd:10}]}]
  for(const opt of cases){
    const db=fakeDb({...opt,ignoreStaffScope:true})
    const handler=createMyPayslipHandler({createClient:db.client as never,resolveUser:person('staff-one'),isEnabled:()=>true})
    assert.equal((await handler.GET(request())).status,409)
  }
})
test('unlocked periods are never shown; invalid query parameters are rejected',async()=>{
  const db=fakeDb({periods:[{...locked,status:'reviewed'}]})
  const handler=createMyPayslipHandler({createClient:db.client as never,resolveUser:person('staff-one'),isEnabled:()=>true})
  assert.equal((await handler.GET(request())).status,200)
  const body=await (await handler.GET(request())).json()
  assert.deepEqual(body.statements,[])
  assert.equal((await handler.GET(request('?staff_id=someone-else'))).status,400)
  assert.equal((await handler.GET(request('?year=bad'))).status,400)
})
test('DB failure never returns partial income, cap overflow is rejected',async()=>{
  const failed=fakeDb({errors:['workforce_payroll_lines']})
  const errorHandler=createMyPayslipHandler({createClient:failed.client as never,resolveUser:person('staff-one'),isEnabled:()=>true})
  assert.equal((await errorHandler.GET(request())).status,503)
  const over=fakeDb({periods:Array.from({length:13},(_,i)=>({...locked,id:'p-'+i}))})
  const handler=createMyPayslipHandler({createClient:over.client as never,resolveUser:person('staff-one'),isEnabled:()=>true})
  assert.equal((await handler.GET(request())).status,409)
})

test('Member payroll screen is segregated from Admin management and disabled by default',()=>{
  const page=readFileSync(new URL('../app/(dashboard)/payroll/page.tsx',import.meta.url),'utf8')
  const ui=readFileSync(new URL('../components/features/payroll/MyPayslipPanel.tsx',import.meta.url),'utf8')
  assert.match(page,/resolveSystemPermission\(currentUser\) !== 'admin'/)
  assert.match(page,/NEXT_PUBLIC_FEATURE_MY_PAYSLIP === 'true'/)
  assert.match(page,/MyPayslipPanel key=/)
  assert.match(ui,/credentials:'same-origin',cache:'no-store'/)
  assert.match(ui,/scope/)
  assert.doesNotMatch(ui,/staff_id=/)
  assert.match(ui,/Chưa có kỳ lương đã khóa/)
})

test('RC16 capability observer persists through admin/member identity switch and denies Member while feature disabled',()=>{
  const page=readFileSync(new URL('../app/(dashboard)/payroll/page.tsx',import.meta.url),'utf8')
  assert.match(page,/useWorkforceCapabilities\(\)/)
  assert.doesNotMatch(page,/useCurrentUser\(\)/)
  assert.match(page,/return <PageShell archetype="command" className="p-4 md:p-6"><p role="alert">\{translate\('Bạn không có quyền truy cập bảng lương \(403\)\.'\)\}/)
  assert.match(page,/return <MyPayslipPanel key=\{identityKey/)
})
