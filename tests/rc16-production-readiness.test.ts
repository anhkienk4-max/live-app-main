import assert from 'node:assert/strict'
import test from 'node:test'
import { isFeatureEnabled } from '@/lib/flags'
import { createWorkforceActualHandler } from '@/lib/server/workforceActualHandler'
import { createWorkforcePayrollHandler } from '@/lib/server/workforcePayrollHandler'
import { createWorkforcePerformanceHandler } from '@/lib/server/workforcePerformanceHandler'
import { createWorkforceOverviewHandler } from '@/lib/server/workforceOverviewHandler'
import { createWorkforceCapabilitiesHandler } from '@/lib/server/workforceCapabilitiesHandler'
// @ts-expect-error isolated JavaScript test harness
import { verifyProductionManifest } from './rc16h-production.integration.mjs'
import { readFileSync } from 'node:fs'

const request=(path:string)=>new Request('https://example.test/api/workforce/'+path)
const admin=async()=>({id:'auth-admin',businessUserId:'admin-1',systemPermission:'admin' as const})
const noDb=()=>{assert.fail('Disabled feature must not access the database')}

test('Existing Workforce/Payroll flags fail closed and remain independent',()=>{
  const oldWorkforce=process.env.FEATURE_ACTUAL_STAFFING,oldPayroll=process.env.FEATURE_PAYROLL
  try{
    delete process.env.FEATURE_ACTUAL_STAFFING
    delete process.env.FEATURE_PAYROLL
    assert.equal(isFeatureEnabled('actual_staffing'),false)
    assert.equal(isFeatureEnabled('payroll'),false)
    for(const bad of ['1','yes','enabled','invalid']){
      process.env.FEATURE_PAYROLL=bad
      assert.equal(isFeatureEnabled('payroll'),false)
    }
    process.env.FEATURE_ACTUAL_STAFFING='true'
    process.env.FEATURE_PAYROLL='false'
    assert.equal(isFeatureEnabled('actual_staffing'),true)
    assert.equal(isFeatureEnabled('payroll'),false)
    process.env.FEATURE_ACTUAL_STAFFING='false'
    process.env.FEATURE_PAYROLL='true'
    assert.equal(isFeatureEnabled('actual_staffing'),false)
    assert.equal(isFeatureEnabled('payroll'),true)
  }finally{
    if(oldWorkforce===undefined)delete process.env.FEATURE_ACTUAL_STAFFING
    else process.env.FEATURE_ACTUAL_STAFFING=oldWorkforce
    if(oldPayroll===undefined)delete process.env.FEATURE_PAYROLL
    else process.env.FEATURE_PAYROLL=oldPayroll
  }
})

test('Disabled modules reject every authorized read/write before privileged access',async()=>{
  const deps={resolveUser:admin,isEnabled:()=>false,createClient:noDb,client:noDb}
  const actual=createWorkforceActualHandler(deps),payroll=createWorkforcePayrollHandler(deps)
  const responses=await Promise.all([
    actual.GET(request('actual?shift_id=shift-1')),
    actual.POST(request('actual')),
    ...['action=list_periods','action=list_rates','period_id=p','period_id=p&export=csv']
      .map(q=>payroll.GET(request('payroll?'+q))),
    ...['register_rate','create_period','prepare_line','correct_line','void_line','transition'].map(action=>
      payroll.POST(new Request(request('payroll'),{method:'POST',body:JSON.stringify({action})}))),
    createWorkforceOverviewHandler(deps).GET(request('overview?month=2026-09&role=host')),
    createWorkforcePerformanceHandler(deps).GET(request('performance?month=2026-09&role=host&staff_id=admin-1')),
  ])
  for(const r of responses){
    assert.equal(r.status,503)
    assert.equal(r.headers.get('Cache-Control'),'no-store')
    assert.match((await r.json()).error.code,/^WORKFORCE_(PAYROLL_)?FEATURE_DISABLED$/u)
  }
})

test('OFF flags preserve authentication, salary denial and employee self scope',async()=>{
  for(const role of [null,'leader','member'] as const){
    const resolveUser=async()=>role?{id:'auth',businessUserId:'staff-1',systemPermission:role}:null
    const deps={resolveUser,isEnabled:()=>false,createClient:noDb,client:noDb}
    const h=createWorkforcePayrollHandler(deps)
    assert.equal((await h.GET(request('payroll?action=list_rates'))).status,role?403:401)
    assert.equal((await h.POST(request('payroll'))).status,role?403:401)
    if(role==='member'){
      assert.equal((await createWorkforceActualHandler(deps).GET(request('actual?shift_id=s'))).status,403)
      assert.equal((await createWorkforceOverviewHandler(deps).GET(request('overview'))).status,403)
      assert.equal((await createWorkforcePerformanceHandler(deps).GET(
        request('performance?month=2026-09&role=host&staff_id=other'))).status,403)
    }
  }
})

test('Authenticated capabilities provide only role-filtered booleans; no salary/configuration',async()=>{
  for(const role of ['admin','leader','member'] as const){
    for(const workforce of [false,true])for(const payroll of [false,true]){
      const h=createWorkforceCapabilitiesHandler({
        resolveUser:async()=>({id:'auth',businessUserId:'staff-1',systemPermission:role}),
        enabled:flag=>flag==='payroll'?payroll:workforce,
      })
      const r=await h.GET(request('capabilities'))
      assert.equal(r.status,200);assert.equal(r.headers.get('Cache-Control'),'no-store')
      assert.deepEqual(await r.json(),{ok:true,capabilities:{
        actual_staffing:workforce&&role!=='member',team_performance:workforce&&role!=='member',
        own_performance:workforce,payroll:payroll&&role==='admin',
      }})
    }
  }
})

test('Capabilities reject anonymous and conceal own performance without mapped identity',async()=>{
  assert.equal((await createWorkforceCapabilitiesHandler({resolveUser:async()=>null})
    .GET(request('capabilities'))).status,401)
  const r=await createWorkforceCapabilitiesHandler({
    resolveUser:async()=>({id:'auth',systemPermission:'member'}),enabled:()=>true,
  }).GET(request('capabilities'))
  assert.equal((await r.json()).capabilities.own_performance,false)
})

test('Production manifest pins only missing RC16 migrations and rejects drift/extra steps',()=>{
  const m=JSON.parse(readFileSync('supabase/release/rc16h/manifest.json','utf8'))
  assert.equal(verifyProductionManifest(m),m)
  assert.throws(()=>verifyProductionManifest({...m,target:'staging'}))
  assert.throws(()=>verifyProductionManifest({...m,steps:[...m.steps].reverse()}))
  assert.throws(()=>verifyProductionManifest({...m,steps:[...m.steps,m.steps[0]]}))
  assert.throws(()=>verifyProductionManifest({...m,steps:m.steps.map((s:{sha256:string},i:number)=>
    i===0?{...s,sha256:'0'.repeat(64)}:s)}))
})
