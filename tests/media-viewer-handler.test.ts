import assert from 'node:assert/strict'
import test from 'node:test'
import {generateKeyPairSync,createPublicKey,verify} from 'node:crypto'
import {createMediaViewerGrantHandler} from '../lib/server/mediaViewerGrantHandler.ts'
import {createMediaJwksHandler} from '../lib/server/mediaJwksHandler.ts'
import {getPublicMediaJwks,signMediaViewerGrant} from '../lib/server/mediaViewerKey.ts'

const {privateKey}=generateKeyPairSync('ec',{namedCurve:'prime256v1'})
const settings={
  privateKey,kid:'staging-test-key',appOrigin:'https://ops5729.top',
  issuer:'https://ops5729.top',mediaOrigin:'https://media.ops5729.top',
  audience:'ada-media-monitor' as const,
}
const t0=Date.parse('2026-10-21T05:00:00Z')
const shift={
 id:'s1',brand_id:'b1',platform_id:'p1',studio:'studio-A',status:'live',
 start_at:'2026-10-21T04:00:00Z',end_at:'2026-10-21T06:00:00Z',deleted_at:null,
}
const grant={
 auth_user_id:'auth-u1',shift_id:'s1',active:true,
 valid_from:'2026-10-21T04:30:00Z',valid_until:'2026-10-21T05:30:00Z',
}
const route={
 brand_id:'b1',platform_id:'p1',studio:'studio-A',
 active_shift_id:'s1',media_path:'studio_poc_01',active:true,
}
const identity=async()=>({id:'auth-u1',businessUserId:'user-u1',systemPermission:'admin' as const})
const anon=async()=>null
type Fixture={
 shifts?:typeof shift[]
 media_viewer_grants?:typeof grant[]
 media_stream_routes?:typeof route[]
 errors?:Partial<Record<'shifts'|'media_viewer_grants'|'media_stream_routes',string>>
}
const fakeClient=(fixture:Fixture={},calls:string[]=[]):never=>({
 from(table:'shifts'|'media_viewer_grants'|'media_stream_routes'){
  calls.push(table)
  const chain={
   select(_columns:string){return chain},
   eq(_name:string,_value:unknown){return chain},
   limit(_count:number){return Promise.resolve({
     data:fixture[table]??(table==='shifts'?[shift]:table==='media_viewer_grants'?[grant]:[route]),
     error:fixture.errors?.[table]?{message:fixture.errors[table]}:null,
   })}
  }
  return chain
 }
}) as never

const post=(body:object,origin='https://ops5729.top')=>new Request(
 'https://ops5729.top/api/media/viewer-grant',{
  method:'POST',headers:{origin,'content-type':'application/json'},
  body:JSON.stringify(body),
 })
const handler=(client:never,who=identity)=>createMediaViewerGrantHandler({
 resolveUser:who,settings:()=>settings,now:()=>t0,
 createClient:async()=>client,
})

test('grants a signed short read token for exactly the approved active shift',async()=>{
 const calls:string[]=[]
 const response=await handler(fakeClient({},calls)).POST(post({shiftId:'s1'}))
 assert.equal(response.status,200)
 const body=await response.json()
 assert.equal(body.shiftId,'s1')
 assert.equal(body.mediaUrl,'https://media.ops5729.top/studio_poc_01/index.m3u8')
 assert.equal(body.ok,true)
 assert.deepEqual(calls.sort(),['shifts','media_viewer_grants','media_stream_routes'].sort())
 const [h,p,s]=body.token.split('.')
 const header=JSON.parse(Buffer.from(h,'base64url').toString())
 const payload=JSON.parse(Buffer.from(p,'base64url').toString())
 assert.equal(header.alg,'ES256')
 assert.equal(payload.aud,'ada-media-monitor')
 assert.equal(payload.exp-payload.iat,90)
 assert.deepEqual(payload.mediamtx_permissions,[{action:'read',path:'studio_poc_01'}])
 const key=getPublicMediaJwks(settings).keys[0]
 const valid=verify('sha256',Buffer.from(h+'.'+p),{
  key:createPublicKey({key,format:'jwk'}),dsaEncoding:'ieee-p1363',
 },Buffer.from(s,'base64url'))
 assert.equal(valid,true)
})

test('no authentication, CSRF origin, or exact shift ID => never fetches ACL',async()=>{
 let touched=false
 const forbid=()=>{touched=true;throw new Error('DB touched')}
 assert.equal((await handler(forbid as never,anon as never).POST(post({shiftId:'s1'}))).status,401)
 assert.equal((await handler(forbid as never).POST(post({shiftId:'s1'},'https://evil.example'))).status,403)
 assert.equal((await handler(forbid as never).POST(post({shiftId:'s1',path:'studio_poc_01'}))).status,400)
 assert.equal(touched,false)
})

test('missing explicit grant does not give admin implicit media access',async()=>{
 const response=await handler(fakeClient({media_viewer_grants:[]})).POST(post({shiftId:'s1'}))
 assert.equal(response.status,403)
})
test('wrong brand and stale active shift binding deny viewer media grant',async()=>{
 for(const wrong of [{...route,brand_id:'other'}, {...route,active_shift_id:'s2'},
  {...route,active:false},{...route,studio:'other'}]){
  const response=await handler(fakeClient({media_stream_routes:[wrong]})).POST(post({shiftId:'s1'}))
  assert.equal(response.status,403)
 }
})
test('rejected or expired shift/grant refuses access',async()=>{
 for(const invalid of [{...grant,active:false},{...grant,valid_until:'2026-10-21T04:59:00Z'}]){
  const response=await handler(fakeClient({media_viewer_grants:[invalid]})).POST(post({shiftId:'s1'}))
  assert.equal(response.status,403)
 }
 const ended=await handler(fakeClient({shifts:[{...shift,status:'completed'}]})).POST(post({shiftId:'s1'}))
 assert.equal(ended.status,403)
})
test('a missing RLS table or a database ACL error fails closed (not a preview bypass)',async()=>{
 const response=await handler(fakeClient({errors:{media_viewer_grants:'relation does not exist'}})).POST(post({shiftId:'s1'}))
 assert.equal(response.status,503)
})
test('JWKS emits only public P-256 key and no private signing bytes',async()=>{
 const response=await createMediaJwksHandler({settings:()=>settings}).GET()
 assert.equal(response.status,200)
 const body=await response.json()
 assert.equal(body.keys.length,1)
 assert.equal(body.keys[0].alg,'ES256')
 assert.equal(body.keys[0].kid,settings.kid)
 assert.equal(body.keys[0].d,undefined)
 assert.equal(body.keys[0].kty,'EC')
 const credential=signMediaViewerGrant({settings,path:'studio_poc_01',now:t0})
 assert.equal(credential.token.split('.').length,3)
})
