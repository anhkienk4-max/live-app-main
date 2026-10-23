import assert from 'node:assert/strict'
import test from 'node:test'
import {runSignedJwtGate,createReadOnlyClient,assertStagingUrl,STAGING_ORIGIN} from './rc19-reports-signed-jwt.mjs'

const KEY='sb_publishable_test_only_key_abcdefghijklmnopqrstuvwxyz'
const fakeToken=role=>'fake-test-jwt-no-real-signature-'+role+'-0123456789abcdefghijklmnopqrstuvwxyz'
const USERS=Object.fromEntries(['admin','leader','member'].map(role=>[
  fakeToken(role),{id:'auth-'+role,app_metadata:{system_permission:role,business_user_id:role}},
]))
const active=[{id:'r1',deleted_at:null,archived_at:null},{id:'r2',deleted_at:null,archived_at:null}]
const archived=[{id:'r3',deleted_at:null,archived_at:'2026-10-01'}]
const env={RC19_STAGING_URL:STAGING_ORIGIN,RC19_STAGING_PUBLISHABLE_KEY:KEY,
  RC19_MEMBER_JWT:fakeToken('member'),RC19_LEADER_JWT:fakeToken('leader'),RC19_ADMIN_JWT:fakeToken('admin')}
function transport({leak=false,wrongRpc=false,wrongRole=false,anonLeak=false}={}) {
  return async (url,options)=>{
    assert.equal(options.redirect,'error')
    assert.equal(options.cache,'no-store')
    assert.equal(options.headers.apikey,KEY)
    const token=(options.headers.Authorization??'').replace(/^Bearer /,'')
    const user=USERS[token]
    const role=user?.app_metadata.system_permission??'anon'
    const location=new URL(url)
    assert.equal(location.origin,STAGING_ORIGIN)
    const response=(status,payload)=>({status,ok:status>=200&&status<300,
      headers:{get:()=>null},json:async()=>payload})
    if(location.pathname==='/auth/v1/user'){
      if(!user)return response(401,{code:'unauthorized'})
      return response(200,wrongRole&&role==='member'
        ?{...user,app_metadata:{...user.app_metadata,system_permission:'admin'}}:user)
    }
    if(location.pathname==='/rest/v1/rpc/get_report_revisions'){
      assert.equal(options.method,'POST')
      const id=JSON.parse(options.body).p_report_id
      if(role==='member'&&id==='r2')
        return wrongRpc?response(200,[{version:7}]):response(400,{code:'P0001',message:'REPORT_NOT_FOUND'})
      return response(200,id==='r1'?[{version:1}]:[])
    }
    assert.equal(options.method,'GET')
    const table=location.pathname.split('/')[3]
    let visible=role==='admin'?[...active,...archived]
      :role==='leader'?active:role==='member'?[active[0]]:anonLeak?active:[]
    if(table==='reports'){
      if(location.searchParams.has('id')){
        if(leak&&role==='member')return response(200,[{id:'r2'}])
        visible=visible.filter(r=>r.id===location.searchParams.get('id')?.replace(/^eq\./,''))
      }
      return response(200,visible.map(r=>location.searchParams.get('select')==='id'?{id:r.id}:r))
    }
    if(['report_revisions','report_images','live_report_images'].includes(table)){
      const id=location.searchParams.get('report_id')?.replace(/^eq\./,'')
      return response(200,role==='member'&&id==='r1'&&table==='report_revisions'
        ?[{report_id:'r1'}]:[])
    }
    throw Error('UNKNOWN_TEST_ROUTE')
  }
}

test('hard-pin Staging origin and forbid any Production URL',()=>{
  assert.equal(assertStagingUrl(STAGING_ORIGIN),STAGING_ORIGIN)
  for(const origin of ['https://egdjnpmoasarrttvhgds.supabase.co',
    'http://amagnzebmmuqiptmrjmc.supabase.co',STAGING_ORIGIN+'/other',
    'https://amagnzebmmuqiptmrjmc.supabase.co.evil.test'])
    assert.throws(()=>assertStagingUrl(origin),/RC19_PRODUCTION_OR_UNEXPECTED_URL_BLOCKED/)
})
test('HTTP allowlist forbids mutations, wrong endpoints and secret keys',async()=>{
  const client=createReadOnlyClient({origin:STAGING_ORIGIN,key:KEY,
    token:fakeToken('member'),transport:transport()})
  for(const [route,method] of [['/rest/v1/reports','POST'],
    ['/rest/v1/rpc/archive_report','POST'],
    ['/rest/v1/reports?select=id','DELETE'],['/auth/v1/user','POST']])
    await assert.rejects(client(route,{method}),/RC19_UNSAFE_HTTP_ACTION_BLOCKED/)
  assert.throws(()=>createReadOnlyClient({origin:STAGING_ORIGIN,
    key:'sb_secret_never-use',token:null}),/RC19_PUBLISHABLE_KEY_REQUIRED/)
})
test('signed JWT HTTP contract passes mocked positive and negative reads',async()=>{
  const outcome=await runSignedJwtGate(env,transport())
  assert.equal(outcome.result,'RC19_STAGING_SIGNED_JWT_HTTP_PASS')
  assert.equal(outcome.memberCount,1)
  assert.equal(outcome.leaderActive,2)
  assert.equal(outcome.adminArchived,1)
  assert.equal(outcome.anonymousDenied,true)
  assert.equal(outcome.checks[0].foreignTables,4)
  assert.equal(outcome.checks[0].ownPositive,true)
  assert.ok(!JSON.stringify(outcome).includes(fakeToken('member')))
})
test('foreign report or history disclosure is a hard gate failure',async()=>{
  await assert.rejects(runSignedJwtGate(env,transport({leak:true})),/RC19_FOREIGN_TABLE_LEAK_REPORTS/)
  await assert.rejects(runSignedJwtGate(env,transport({wrongRpc:true})),/RC19_FOREIGN_REVISION_RPC_LEAK/)
})
test('wrong identity role, anon records and missing JWT fail closed',async()=>{
  await assert.rejects(runSignedJwtGate(env,transport({wrongRole:true})),/RC19_JWT_ROLE_MISMATCH/)
  await assert.rejects(runSignedJwtGate(env,transport({anonLeak:true})),/RC19_ANON_REPORT_LEAK/)
  await assert.rejects(runSignedJwtGate({...env,RC19_MEMBER_JWT:undefined}),/RC19_MEMBER_JWT_REQUIRED/)
  await assert.rejects(runSignedJwtGate({...env,RC19_REQUIRE_FIVE_MEMBERS:'true'}),
    /RC19_FIVE_MEMBER_TOKENS_REQUIRED/)
})
