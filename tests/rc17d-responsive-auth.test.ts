import test from 'node:test'
import assert from 'node:assert/strict'
import { groupNavigation, mobilePrimaryNavigation, getNavigationForRole, filterNav } from '@/lib/ui/role-ux'
import { filterWorkforceNavigation } from '@/lib/ui/workforceNavigation'
import { safeLocalRedirect } from '@/lib/auth/authMode'
import { googleProviderEnabled, startGoogleOAuth } from '@/lib/auth/googleOAuth'
import { createOAuthCallbackHandler } from '@/lib/auth/oauthCallback'
import type { User } from '@/lib/types/database.types'

for (const role of ['admin', 'leader', 'member'] as const) test('Groups preserve all filtered destinations for '+role, () => {
 const nav=filterWorkforceNavigation(filterNav(getNavigationForRole(role),{role:role==='member'?'staff':role,system_permission:role}),{actual_staffing:false,team_performance:false,own_performance:false,payroll:false})
 const grouped=groupNavigation(nav)
 assert.equal(grouped.flatMap(g=>g.items).length,nav.length)
 assert.deepEqual(new Set(grouped.flatMap(g=>g.items)),new Set(nav))
 assert.ok(grouped.every(g=>g.items.length>0))
 const primary=mobilePrimaryNavigation(nav)
 assert.equal(new Set(primary.map(i=>i.href.split('?')[0])).size,primary.length)
 assert.equal(primary[0].href,'/')
 assert.equal(primary[1].href.split('?')[0],'/calendar')
 assert.deepEqual(primary.map(item=>item.href.split('?')[0]),['/','/calendar','/shifts','/live'])
 assert.ok(primary.every(item=>nav.includes(item)))
 if(role==='member') assert.ok(!nav.some(i=>i.href.includes('registration')||i.href==='/payroll'||i.href==='/audit'))
})
test('Catalogue assigns requested operational, data, people and admin groups',()=>{
 const groups=groupNavigation(getNavigationForRole('admin'))
 assert.deepEqual(groups.map(g=>g.id),['overview','operations','data','people','system'])
 for(const [path,group] of [['/storage','data'],['/staff','people'],['/payroll','people'],['/brands','system'],['/calendar','operations']]) assert.ok(groups.find(g=>g.id===group)?.items.some(i=>i.href===path))
})
test('Safe local redirects reject protocol-relative, backslash and control-character tricks',()=>{
 for(const path of ['https://attacker.test','//attacker.test','/\\attacker.test','/\t/attacker.test','/\n/attacker.test','javascript:alert(1)',null,undefined]) assert.equal(safeLocalRedirect(path),'/')
 assert.equal(safeLocalRedirect('/calendar?calendar_view=month&calendar_date=2026-10-14#day'),'/calendar?calendar_view=month&calendar_date=2026-10-14#day')
})
test('Only the strict public Google flag enables the provider',()=>{
 for(const settings of [null,{}, {external:null},{external:{google:'true'}},{external:{google:1}},{external:{google:false}}]) assert.equal(googleProviderEnabled(settings),false)
 assert.equal(googleProviderEnabled({external:{google:true}}),true)
})
test('Google entry uses the real SDK and same-origin callback with a safe next',async()=>{
 let observed:unknown
 await startGoogleOAuth({auth:{async signInWithOAuth(args){observed=args;return{error:null}}}},'https://ops.example','//attacker.test')
 assert.deepEqual(observed,{provider:'google',options:{redirectTo:'https://ops.example/api/auth/callback?next=%2F'}})
})
const user={id:'staff-1',auth_user_id:'auth-1',email:'approved@example.test',status:'active',account_status:'active',role:'staff',system_permission:'member',archived_at:null,deleted_at:null} as User
function context(options:{approved?:boolean;verified?:boolean;exchangeError?:boolean;metadata?:boolean;persisted?:User}={}){
 let signsOut=0,reads=0,exchanges=0
 return {get counts(){return{signsOut,reads,exchanges}}, factory:async()=>({
  auth:{async exchangeCodeForSession(){exchanges++;return{error:options.exchangeError?new Error('secret-code'):null}},async getUser(){return{data:{user:{id:'auth-1',email:user.email,app_metadata:options.metadata===false?{}:{business_user_id:'staff-1',system_permission:'member'},user_metadata:{system_permission:'admin'}}},error:options.verified===false?new Error('unverified'):null}},async signOut(){signsOut++;return{error:null}}},
  async readBusinessUser(){reads++;return options.approved===false?null:options.persisted??user}
 })}
}
test('OAuth callback requires verified active approval and ignores forwarded-host',async()=>{
 const c=context();const handler=createOAuthCallbackHandler(c.factory)
 const r=await handler(new Request('https://ops.example/api/auth/callback?code=private&next=%2Fcalendar',{headers:{'x-forwarded-host':'attacker.test'}}))
 assert.equal(r.headers.get('location'),'https://ops.example/calendar');assert.equal(r.headers.get('cache-control'),'no-store');assert.equal(c.counts.signsOut,0)
})
for(const options of [{approved:false},{verified:false},{metadata:false},{persisted:{...user,status:'pending_approval'} as User},{persisted:{...user,account_status:'pending_approval'} as User},{persisted:{...user,archived_at:'2026-10-20'}},{persisted:{...user,deleted_at:'2026-10-20'}},{persisted:{...user,system_permission:'admin'}},{persisted:{...user,auth_user_id:'other-auth'}}]) test('OAuth callback denies missing, unverified, pending, archived or mismatched identity approval '+JSON.stringify(options),async()=>{
 const c=context(options);const r=await createOAuthCallbackHandler(c.factory)(new Request('https://ops.example/api/auth/callback?code=private'))
 assert.equal(r.headers.get('location'),'https://ops.example/login?reason=approval_required');assert.equal(c.counts.signsOut,1)
})
test('OAuth failure never leaks code/provider descriptions and missing code stays independent',async()=>{
 const c=context({exchangeError:true});const handler=createOAuthCallbackHandler(c.factory)
 for(const query of ['?code=private','?error=access_denied&error_description=secret-code','']){
  const r=await handler(new Request('https://ops.example/api/auth/callback'+query))
  assert.ok(!r.headers.get('location')?.includes('private'));assert.ok(!r.headers.get('location')?.includes('secret-code'))
 }
 assert.equal(c.counts.exchanges,1);assert.equal(c.counts.reads,0)
})
test('OAuth callback normalizes unsafe next to the application root',async()=>{
 const c=context();const r=await createOAuthCallbackHandler(c.factory)(new Request('https://ops.example/api/auth/callback?code=private&next='+encodeURIComponent('/\\attacker.test')))
 assert.equal(r.headers.get('location'),'https://ops.example/')
})

import { GET as providersGET } from '@/app/api/auth/providers/route'
test('Provider endpoint exposes only availability and fails closed on malformed settings or transport errors',async()=>{
 const keys=['NODE_ENV','NEXT_PUBLIC_SUPABASE_URL','NEXT_PUBLIC_SUPABASE_ANON_KEY','SUPABASE_URL','SUPABASE_SECRET_KEY','NEXT_PUBLIC_USE_MOCK_DATA','VERCEL','VERCEL_ENV','VERCEL_TARGET_ENV'] as const
 const original=Object.fromEntries(keys.map(k=>[k,process.env[k]]));const fetcher=globalThis.fetch
 try {
  for(const key of keys)delete process.env[key]
  const empty=await providersGET();assert.deepEqual(await empty.json(),{google:false})
  process.env.NODE_ENV='development';process.env.NEXT_PUBLIC_SUPABASE_URL='http://127.0.0.1:54321';process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY='local-test-public-key';process.env.NEXT_PUBLIC_USE_MOCK_DATA='false'
  for(const settings of [{external:{google:true}},{external:{google:false}},{external:{google:'true'}},null]){
   globalThis.fetch=async()=>Response.json(settings);const r=await providersGET();assert.deepEqual(await r.json(),{google:googleProviderEnabled(settings)});assert.equal(r.headers.get('cache-control'),'no-store')
  }
  globalThis.fetch=async()=>{throw new Error('secret transport details')};const r=await providersGET();assert.equal(r.status,503);assert.deepEqual(await r.json(),{google:false})
 }finally{globalThis.fetch=fetcher;for(const key of keys){if(original[key]===undefined)delete process.env[key];else process.env[key]=original[key]}}
})
