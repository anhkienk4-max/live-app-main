import test from 'node:test'
import assert from 'node:assert/strict'
import { createClient } from '@supabase/supabase-js'
import { createWorkforcePayrollHandler } from '@/lib/server/workforcePayrollHandler'

type Row=Record<string,unknown>
const admin=async()=>({id:'auth-admin',businessUserId:'admin-1',systemPermission:'admin' as const})
const request=(query:string)=>new Request('https://example.test/api/workforce/payroll?'+query)
const statuses=['draft','reviewed','confirmed','payroll_ready','locked']
const periods:Row[]=statuses.map((status,index)=>({id:'p'+index,
  period_start:'2026-09-01',period_end:'2026-09-30',revision:1,status,created_by:'admin-1'}))
const rates:Row[]=[
  {id:'default',staff_id:null,operational_role:'host',effective_from:'2026-09-01',
    effective_through:null,vnd_per_hour:100000,overtime_multiplier_basis_points:15000,
    approved_by:'admin-2',approved_at:'2026-08-31T00:00:00Z',approval_note:'Approved fixture rate'},
  {id:'specific',staff_id:'staff-1',operational_role:'host',effective_from:'2026-09-01',
    effective_through:'2026-09-30',vnd_per_hour:120000,overtime_multiplier_basis_points:20000,
    approved_by:'admin-2',approved_at:'2026-08-31T00:00:00Z',approval_note:'Approved fixture staff rate'},
  {id:'expired',staff_id:'staff-1',operational_role:'host',effective_from:'2026-08-01',
    effective_through:'2026-08-31',approved_by:'admin-2',approved_at:'2026-07-31T00:00:00Z'},
  {id:'future',staff_id:'staff-1',operational_role:'host',effective_from:'2026-10-01',
    effective_through:null,approved_by:'admin-2',approved_at:'2026-09-30T00:00:00Z'},
  {id:'support',staff_id:'staff-2',operational_role:'support',effective_from:'2026-09-01',
    effective_through:null,approved_by:'admin-2',approved_at:'2026-08-31T00:00:00Z'},
  {id:'unapproved',staff_id:null,operational_role:'host',effective_from:'2026-09-01',
    effective_through:null,approved_by:null,approved_at:null},
  {id:'missing-approval-time',staff_id:null,operational_role:'host',effective_from:'2026-09-01',
    effective_through:null,approved_by:'admin-2',approved_at:null},
  {id:'missing-approval-actor',staff_id:null,operational_role:'host',effective_from:'2026-09-01',
    effective_through:null,approved_by:null,approved_at:'2026-08-31T00:00:00Z'},
]

// Read-only fixture adapter: pagination limits/counts can fail independently.
function discoveryClient(tables:Record<string,Row[]>={
  workforce_payroll_periods:periods,workforce_rate_cards:rates,
}, options:{cap?:number;missingCount?:boolean;error?:string;outOfRange?:boolean}={}) {
  return ()=>({from(table:string){
    let rows=[...(tables[table]??[])],columns:string[]=[],head=false
    let from=0,to=Number.MAX_SAFE_INTEGER
    const orders:{field:string;ascending:boolean}[]=[]
    const q={
      select(fields:string,opts:{count:string;head:boolean}){
        assert.equal(opts.count,'exact');columns=fields.split(',');head=opts.head;return q
      },
      overrideTypes(){return q},
      eq(field:string,value:unknown){rows=rows.filter(row=>row[field]===value);return q},
      is(field:string,value:unknown){rows=rows.filter(row=>row[field]===value);return q},
      not(field:string,operator:string,value:unknown){
        assert.equal(operator,'is');rows=rows.filter(row=>row[field]!==value);return q
      },
      gte(field:string,value:string){rows=rows.filter(row=>String(row[field])>=value);return q},
      lte(field:string,value:string){rows=rows.filter(row=>String(row[field])<=value);return q},
      or(expression:string){
        const match=/^effective_through\.is\.null,effective_through\.gte\.(\d{4}-\d{2}-\d{2})$/u.exec(expression)
        assert.ok(match);rows=rows.filter(row=>row.effective_through===null
          ||String(row.effective_through)>=match[1]);return q
      },
      order(field:string,opts:{ascending:boolean}){orders.push({field,...opts});return q},
      range(start:number,end:number){from=start;to=end;return q},
      then(resolve:(value:{data:Row[]|null;count:number|null;error:{code:string}|null})=>unknown){
        rows.sort((a,b)=>{
          for(const {field,ascending} of orders){
            const left=a[field] as string|number,right=b[field] as string|number
            if(left!==right)return (left<right?-1:1)*(ascending?1:-1)
          }
          return 0
        })
        const error=options.error??(options.outOfRange&&!head&&from>0&&from>=rows.length?'PGRST103':null)
        const data=head||error?null:rows.slice(from,to+1).slice(0,options.cap??Infinity)
          .map(row=>Object.fromEntries(columns.map(field=>[field,row[field]])))
        return Promise.resolve({data,count:options.missingCount?null:rows.length,
          error:error?{code:error}:null}).then(resolve)
      },
    }
    return q
  }})
}
const handler=(client=discoveryClient())=>createWorkforcePayrollHandler({isEnabled:()=>true,
  resolveUser:admin,createClient:client as never,
})

test('discovery authorizes before query validation or any privileged client access',async()=>{
  for(const permission of [null,'leader','member'] as const){
    let accesses=0
    const h=createWorkforcePayrollHandler({isEnabled:()=>true,
      resolveUser:async()=>permission?{id:'auth',businessUserId:'staff-1',systemPermission:permission}:null,
      createClient:()=>{accesses++;throw new Error('Salary database must not be accessed')},
    })
    for(const action of ['list_periods','list_rates']){
      const response=await h.GET(request('action='+action+'&page=bad'))
      assert.equal(response.status,permission===null?401:403)
      assert.equal(response.headers.get('Cache-Control'),'no-store')
    }
    assert.equal(accesses,0)
  }
})

test('period discovery uses all approval states and deterministic tie-breaks across pages',async()=>{
  const fixture=[...periods,{id:'new',period_start:'2026-10-01',period_end:'2026-10-31',revision:1},
    {id:'rev2',period_start:'2026-09-01',period_end:'2026-09-30',revision:2},
    {id:'a-short',period_start:'2026-09-01',period_end:'2026-09-29',revision:1}]
  const h=handler(discoveryClient({workforce_payroll_periods:fixture}))
  const ids:string[]=[]
  for(let page=1;page<=4;page++){
    const response=await h.GET(request('action=list_periods&page_size=2&page='+page))
    assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'no-store')
    const data=await response.json();ids.push(...data.periods.map((row:Row)=>row.id))
    assert.deepEqual(data.pagination,{page,page_size:2,total_count:8,total_pages:4,
      has_next:page<4,has_previous:page>1})
  }
  assert.deepEqual(ids,['new','rev2','p0','p1','p2','p3','p4','a-short'])
})

test('period date filters use inclusive overlap and optional status',async()=>{
  const fixture=[...periods,{id:'boundary',period_start:'2026-08-01',period_end:'2026-09-01',revision:1,status:'draft'},
    {id:'outside',period_start:'2026-07-01',period_end:'2026-08-31',revision:1,status:'draft'}]
  const h=handler(discoveryClient({workforce_payroll_periods:fixture}))
  const result=await (await h.GET(request('action=list_periods&date_from=2026-09-01&date_to=2026-09-01'))).json()
  assert.equal(result.pagination.total_count,6)
  assert.equal(result.periods.at(-1).id,'boundary')
  for(const status of statuses){
    const data=await (await h.GET(request('action=list_periods&date_from=2026-09-30&status='+status))).json()
    assert.deepEqual(data.periods.map((row:Row)=>row.status),[status])
  }
})

test('rate discovery returns approved salary/identity and distinguishes exact staff from defaults',async()=>{
  const h=handler()
  const all=await (await h.GET(request('action=list_rates'))).json()
  assert.equal(all.pagination.total_count,5)
  assert.deepEqual(all.rates.map((row:Row)=>row.id),['future','default','specific','support','expired'])
  const staff=await (await h.GET(request('action=list_rates&staff_id=staff-1&role=host&effective_date=2026-09-30'))).json()
  assert.deepEqual(staff.rates,[{...rates[1],scope:'staff_specific'}])
  const defaults=await (await h.GET(request('action=list_rates&scope=role_default&role=host&effective_date=2026-10-01'))).json()
  assert.deepEqual(defaults.rates,[{...rates[0],scope:'role_default'}])
  const specific=await (await h.GET(request('action=list_rates&scope=staff_specific&effective_date=2026-09-01'))).json()
  assert.deepEqual(specific.rates.map((row:Row)=>row.id),['specific','support'])
  const expired=await (await h.GET(request('action=list_rates&staff_id=staff-1&effective_date=2026-08-31'))).json()
  assert.deepEqual(expired.rates.map((row:Row)=>row.id),['expired'])
  const support=await (await h.GET(request('action=list_rates&role=support'))).json()
  assert.deepEqual(support.rates.map((row:Row)=>row.id),['support'])
})

test('empty datasets and out-of-range pages expose exact metadata including PostgREST 416 recovery',async()=>{
  for(const [action,key] of [['list_periods','periods'],['list_rates','rates']]){
    const empty=await (await handler(discoveryClient({})).GET(request('action='+action))).json()
    assert.deepEqual(empty,{ok:true,[key]:[],pagination:{page:1,page_size:50,total_count:0,
      total_pages:0,has_next:false,has_previous:false}})
    const response=await handler(discoveryClient(undefined,{outOfRange:true})).GET(
      request('action='+action+'&page=1000000&page_size=100'))
    assert.equal(response.status,200)
    const data=await response.json()
    assert.deepEqual(data[key],[])
    assert.equal(data.pagination.total_count,5)
    assert.equal(data.pagination.has_next,false)
    assert.equal(data.pagination.has_previous,true)
  }
})

test('discovery strictly rejects unknown/duplicate/conflicting parameters and malformed inputs',async()=>{
  let accesses=0
  const h=createWorkforcePayrollHandler({isEnabled:()=>true,resolveUser:admin,createClient:()=>{
    accesses++;throw new Error('Invalid query reached database')
  }})
  const invalid=[
    'action=unknown','action=','action=list_periods&action=list_rates',
    'action=list_periods&period_id=p0','action=list_rates&export=csv',
    'action=list_periods&status=ready','action=list_periods&role=host',
    'action=list_periods&date_from=2026-02-30','action=list_periods&date_to=2025-02-29',
    'action=list_periods&date_from=0000-01-01','action=list_periods&date_from=2026-9-01',
    'action=list_periods&date_from=2026-10-01&date_to=2026-09-30',
    'action=list_rates&effective_date=2026-09-01%2Cstaff_id.is.null',
    'action=list_rates&role=admin','action=list_rates&scope=default',
    'action=list_rates&scope=role_default&staff_id=staff-1','action=list_rates&staff_id=',
    'action=list_rates&staff_id='+('a'.repeat(121)),
    'action=list_rates&staff_id=staff-1&staff_id=staff-2',
  ]
  for(const action of ['list_periods','list_rates']){
    for(const page of ['0','-1','1.5','01','1e2','1000001','Infinity',''])invalid.push('action='+action+'&page='+page)
    for(const size of ['0','101','-1','50x',''])invalid.push('action='+action+'&page_size='+size)
    invalid.push('action='+action+'&page=1&page=2')
  }
  for(const query of invalid){
    const response=await h.GET(request(query))
    assert.equal(response.status,400,query)
    assert.deepEqual(await response.json(),{ok:false,error:{code:'WORKFORCE_PAYROLL_DISCOVERY_QUERY_INVALID'}})
    assert.equal(response.headers.get('Cache-Control'),'no-store')
  }
  assert.equal(accesses,0)
  const leap=await handler(discoveryClient({})).GET(request('action=list_rates&effective_date=2024-02-29'))
  assert.equal(leap.status,200)
})

test('large period and rate datasets are completely traversable beyond former result caps',async()=>{
  const fixture=Array.from({length:3205},(_,index)=>({
    ...periods[0],...rates[0],id:String(index).padStart(5,'0'),
  }))
  const h=handler(discoveryClient({workforce_payroll_periods:fixture,workforce_rate_cards:fixture}))
  for(const [action,key] of [['list_periods','periods'],['list_rates','rates']]){
    const ids:string[]=[]
    for(let page=1;page<=33;page++){
      const response=await h.GET(request('action='+action+'&page_size=100&page='+page))
      assert.equal(response.status,200)
      const data=await response.json();ids.push(...data[key].map((row:Row)=>row.id))
      assert.equal(data.pagination.total_count,3205)
      assert.equal(data.pagination.total_pages,33)
      assert.equal(data.pagination.has_next,page<33)
    }
    assert.deepEqual(ids,fixture.map(row=>row.id))
    assert.equal(new Set(ids).size,3205)
  }
})

test('discovery rejects missing counts, truncation and database failures without exposing partial rows',async()=>{
  for(const action of ['list_periods','list_rates']){
    for(const options of [{cap:2},{missingCount:true},{error:'DATABASE_UNAVAILABLE'},{error:'PGRST103'}]){
      const response=await handler(discoveryClient(undefined,options)).GET(request('action='+action))
      assert.equal(response.status,503)
      const data=await response.json()
      assert.deepEqual(Object.keys(data),['ok','error'])
      assert.equal(data.error.code,options.error?'WORKFORCE_PAYROLL_DISCOVERY_READ_FAILED'
        :'WORKFORCE_PAYROLL_DISCOVERY_READ_INCOMPLETE')
    }
  }
})

test('installed Supabase client emits bounded exact-count discovery filters and ordering',async()=>{
  const calls:URL[]=[]
  const db=createClient('https://isolated.example.test','synthetic-test-key',{
    auth:{persistSession:false,autoRefreshToken:false},
    global:{fetch:async(input,init)=>{
      assert.equal(new Headers(init?.headers).get('Prefer'),'count=exact')
      const url=new URL(String(input));calls.push(url)
      const row=url.pathname.endsWith('workforce_rate_cards')?rates[0]:periods[0]
      return new Response(JSON.stringify([row]),{status:200,headers:{
        'Content-Type':'application/json','Content-Range':'0-0/1',
      }})
    }},
  })
  const h=createWorkforcePayrollHandler({isEnabled:()=>true,resolveUser:admin,createClient:()=>db})
  assert.equal((await h.GET(request('action=list_periods&status=locked&date_from=2026-09-01'))).status,200)
  assert.equal((await h.GET(request('action=list_rates&scope=role_default&effective_date=2026-09-30'))).status,200)
  assert.equal(calls[0].searchParams.get('order'),'period_start.desc,period_end.desc,revision.desc,id.asc')
  assert.equal(calls[0].searchParams.get('period_end'),'gte.2026-09-01')
  assert.equal(calls[0].searchParams.get('status'),'eq.locked')
  assert.equal(calls[1].searchParams.get('order'),'effective_from.desc,id.asc')
  assert.equal(calls[1].searchParams.get('staff_id'),'is.null')
  assert.equal(calls[1].searchParams.get('or'),'(effective_through.is.null,effective_through.gte.2026-09-30)')
  for(const url of calls){assert.equal(url.searchParams.get('limit'),'50');assert.equal(url.searchParams.get('offset'),'0')}
})

test('installed Supabase client rechecks exact filtered count after an out-of-range 416',async()=>{
  const methods:string[]=[]
  const db=createClient('https://isolated.example.test','synthetic-test-key',{
    auth:{persistSession:false,autoRefreshToken:false},
    global:{fetch:async(input,init)=>{
      const url=new URL(String(input));methods.push(init?.method??'GET')
      assert.equal(url.searchParams.get('operational_role'),'eq.host')
      assert.equal(url.searchParams.get('staff_id'),'is.null')
      if(init?.method==='HEAD')return new Response(null,{status:200,headers:{'Content-Range':'*/5'}})
      return new Response(JSON.stringify({code:'PGRST103',message:'Requested range not satisfiable'}),{
        status:416,headers:{'Content-Type':'application/json','Content-Range':'*/5'},
      })
    }},
  })
  const h=createWorkforcePayrollHandler({isEnabled:()=>true,resolveUser:admin,createClient:()=>db})
  const response=await h.GET(request('action=list_rates&scope=role_default&role=host&page=2&page_size=100'))
  assert.equal(response.status,200)
  assert.deepEqual((await response.json()).pagination,{page:2,page_size:100,total_count:5,
    total_pages:1,has_next:false,has_previous:true})
  assert.deepEqual(methods,['GET','HEAD'])
})

test('legacy period GET preserves current correction/void evidence and audit envelope',async()=>{
  const period={...periods[0],id:'legacy-period'}
  const lines=[{id:'corrected',version:2,net_vnd:124000,voided_at:null},
    {id:'voided',version:3,net_vnd:100000,voided_at:'2026-10-01T00:00:00Z'}]
  const audit=[{id:7,action:'correct_line',line_version:2,previous_values:{version:1},updated_values:lines[0]}]
  const db=()=>({from(table:string){const q={select(){return q},eq(){return q},order(){return q},
    maybeSingle:async()=>({data:period,error:null}),
    limit:async()=>({data:table==='workforce_payroll_lines'?lines:audit,error:null})};return q}})
  const h=createWorkforcePayrollHandler({isEnabled:()=>true,resolveUser:admin,createClient:db as never})
  const response=await h.GET(request('period_id=legacy-period'))
  assert.equal(response.status,200)
  assert.deepEqual(await response.json(),{ok:true,period,lines,audit})
  assert.equal(response.headers.get('Cache-Control'),'no-store')
})
