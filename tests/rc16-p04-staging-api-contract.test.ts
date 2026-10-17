import test from 'node:test'
import assert from 'node:assert/strict'
import { createWorkforceActualHandler } from '@/lib/server/workforceActualHandler'
import { createWorkforceCapabilitiesHandler } from '@/lib/server/workforceCapabilitiesHandler'
import { createWorkforcePayrollHandler } from '@/lib/server/workforcePayrollHandler'

const endpoint = 'https://p04.invalid/api/workforce'
const post = (path:string, body:object) => new Request(endpoint+path,{
  method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify(body),
})
const get = (path:string) => new Request(endpoint+path)
const admin = async() => ({id:'auth-admin',businessUserId:'admin-1',systemPermission:'admin' as const})
const leader = async() => ({id:'auth-leader',businessUserId:'leader-1',systemPermission:'leader' as const})
const member = async() => ({id:'auth-member',businessUserId:'member-1',systemPermission:'member' as const})
const anonymous = async() => null
const blockedDb = () => {throw new Error('API_REACHED_PRIVILEGED_CLIENT_BEFORE_AUTHORIZATION')}

type FakeOptions = {
  shiftStatus?:string; staffStatus?:string; evidenceVersion?:number;
  creator?:string; reviewStatus?:string; conflict?:boolean
}
function fakeActualDb(options:FakeOptions={}){
  const inserts:Record<string,unknown>[]=[]
  const updates:Record<string,unknown>[]=[]
  let clientCalls=0
  const db=()=>({
    from(table:string){
      clientCalls++
      let op:'select'|'insert'|'update'='select'
      let payload:Record<string,unknown>={}
      const filters:Record<string,unknown>={}
      const query={
        select(_fields:string){return query},
        eq(field:string,value:unknown){filters[field]=value;return query},
        is(field:string,value:unknown){filters[field]=value;return query},
        insert(value:Record<string,unknown>){op='insert';payload=value;inserts.push(value);return query},
        update(value:Record<string,unknown>){op='update';payload=value;updates.push(value);return query},
        async maybeSingle(){
          if(table==='shifts')return {data:{id:'shift-1',status:options.shiftStatus??'completed',deleted_at:null},error:null}
          if(table==='business_users')return {data:{id:'host-1',status:options.staffStatus??'active',deleted_at:null},error:null}
          if(table==='workforce_actual_segments'){
            if(op==='update')return {data:options.conflict?null:{
              id:'segment-1',review_status:payload.review_status,version:payload.version,
            },error:null}
            return {data:{id:'segment-1',created_by:options.creator??'leader-1',
              review_status:options.reviewStatus??'draft',version:options.evidenceVersion??1},error:null}
          }
          throw Error('Unexpected table: '+table)
        },
        async single(){
          if(table==='workforce_actual_segments'&&op==='insert')
            return {data:{id:'segment-1',shift_id:payload.shift_id,review_status:'draft',version:1},error:null}
          throw Error('Unexpected insert: '+table)
        },
      }
      void filters
      return query
    },
  })
  return {db,inserts,updates,readCalls:()=>clientCalls}
}
const attendance={
  action:'record',shift_id:'shift-1',staff_id:'host-1',operational_role:'host',
  event_kind:'worked',coverage_kind:'planned',
  actual_start_at:'2026-09-30T21:30:00+07:00',
  actual_end_at:'2026-09-30T23:00:00+07:00',
  evidence_note:'Verified fake shift evidence for staging UAT',
}
const review={
  action:'review',segment_id:'segment-1',expected_version:1,
  decision:'approved',review_note:'Independent documented evidence review',
}

test('P0.4 Actual/Payroll anonymous and salary-ineligible users fail before service-role DB client',async()=>{
  for(const [resolver,status] of [[anonymous,401],[member,403]] as const){
    const actual=createWorkforceActualHandler({
      resolveUser:resolver,isEnabled:()=>true,client:blockedDb,
    })
    for(const operation of [
      actual.GET(get('/actual?shift_id=shift-1')),
      actual.POST(post('/actual',attendance)),
      actual.POST(post('/actual',review)),
    ]){
      const response=await operation
      assert.equal(response.status,status)
      assert.equal(response.headers.get('Cache-Control'),'no-store')
    }
  }
  for(const resolver of [anonymous,leader,member]){
    const payroll=createWorkforcePayrollHandler({
      resolveUser:resolver,isEnabled:()=>true,createClient:blockedDb,
    })
    for(const operation of [
      payroll.GET(get('/payroll?action=list_rates')),
      payroll.GET(get('/payroll?period_id=period-1')),
      payroll.GET(get('/payroll?period_id=period-1&export=csv')),
      payroll.POST(post('/payroll',{action:'create_period',period_start:'2026-09-01',period_end:'2026-09-30'})),
    ])assert.equal((await operation).status,resolver===anonymous?401:403)
  }
})

test('P0.4 operational Actor records completed fake shift and never asserts approved attendance on create',async()=>{
  const mock=fakeActualDb()
  const handler=createWorkforceActualHandler({
    resolveUser:leader,isEnabled:()=>true,client:mock.db as never,
  })
  const r=await handler.POST(post('/actual',attendance))
  assert.equal(r.status,201)
  assert.equal(r.headers.get('Cache-Control'),'no-store')
  const body=await r.json()
  assert.equal(body.segment.review_status,'draft')
  assert.equal(mock.inserts.length,1)
  assert.deepEqual(mock.inserts[0],{
    shift_id:'shift-1',staff_id:'host-1',operational_role:'host',
    event_kind:'worked',coverage_kind:'planned',
    actual_start_at:attendance.actual_start_at,actual_end_at:attendance.actual_end_at,
    evidence_note:attendance.evidence_note,created_by:'leader-1',review_status:'draft',
  })
  assert.equal(mock.updates.length,0)
})

test('P0.4 rejects scheduled shift, inactive staff and implicit no-show before write',async()=>{
  for(const changes of [{shiftStatus:'scheduled'},{staffStatus:'inactive'}]){
    const mock=fakeActualDb(changes)
    const handler=createWorkforceActualHandler({
      resolveUser:leader,isEnabled:()=>true,client:mock.db as never,
    })
    const result=await handler.POST(post('/actual',attendance))
    assert.equal(result.status,409)
    assert.equal(mock.inserts.length,0)
  }
  const mock=fakeActualDb()
  const handler=createWorkforceActualHandler({resolveUser:leader,isEnabled:()=>true,client:mock.db as never})
  const invalid={...attendance,event_kind:'no_show'}
  const result=await handler.POST(post('/actual',invalid))
  assert.equal(result.status,400)
  assert.equal(mock.readCalls(),0)
})

test('P0.4 independent reviewer changes status/version only; preserves original evidence',async()=>{
  const mock=fakeActualDb()
  const h=createWorkforceActualHandler({resolveUser:admin,isEnabled:()=>true,client:mock.db as never})
  const r=await h.POST(post('/actual',review))
  assert.equal(r.status,200)
  assert.deepEqual(mock.updates[0],{
    review_status:'approved',reviewed_by:'admin-1',
    reviewed_at:mock.updates[0].reviewed_at,
    review_note:review.review_note,version:2,
  })
  assert.equal(typeof mock.updates[0].reviewed_at,'string')
  assert.equal('evidence_note' in mock.updates[0],false)
  assert.equal('actual_start_at' in mock.updates[0],false)
  assert.equal((await r.json()).segment.version,2)
})

test('P0.4 review denies self-review, stale evidence and write race',async()=>{
  for(const [options,expected] of [
    [{creator:'admin-1'},403],
    [{evidenceVersion:2},409],
    [{reviewStatus:'approved'},409],
    [{conflict:true},409],
  ] satisfies Array<[FakeOptions,number]>){
    const mock=fakeActualDb(options)
    const h=createWorkforceActualHandler({resolveUser:admin,isEnabled:()=>true,client:mock.db as never})
    assert.equal((await h.POST(post('/actual',review))).status,expected)
    assert.equal(mock.updates.length,options.conflict?1:0)
  }
})

test('P0.4 capabilities cannot expose Payroll to Leader/Member, and anonymous gets no capabilities',async()=>{
  const flags=()=>true
  for(const [resolver,expected] of [
    [admin,{actual_staffing:true,team_performance:true,own_performance:true,payroll:true}],
    [leader,{actual_staffing:true,team_performance:true,own_performance:true,payroll:false}],
    [member,{actual_staffing:false,team_performance:false,own_performance:true,payroll:false}],
  ] as const){
    const response=await createWorkforceCapabilitiesHandler({
      resolveUser:resolver,enabled:flags,
    }).GET(get('/capabilities'))
    assert.equal(response.status,200)
    assert.equal(response.headers.get('Cache-Control'),'no-store')
    assert.deepEqual((await response.json()).capabilities,expected)
  }
  const anonResponse=await createWorkforceCapabilitiesHandler({
    resolveUser:anonymous,enabled:flags,
  }).GET(get('/capabilities'))
  assert.equal(anonResponse.status,401)
})
