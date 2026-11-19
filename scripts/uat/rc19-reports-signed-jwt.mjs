#!/usr/bin/env node
// RC19 #84: genuine signed-JWT HTTP authorization smoke. STAGING ONLY, read-only.
// Supply ephemeral JWTs via environment variables. Never store tokens in code or logs.
// SQL role-simulation success does not substitute for this authenticated HTTP check.
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const STAGING_ORIGIN='https://amagnzebmmuqiptmrjmc.supabase.co'
const MAX_ROWS=250
const check=(condition,code)=>{if(!condition)throw Error(code)}

export function assertStagingUrl(raw) {
  let url
  try{url=new URL(raw)}catch{throw Error('RC19_STAGING_URL_INVALID')}
  check(url.href===STAGING_ORIGIN+'/', 'RC19_PRODUCTION_OR_UNEXPECTED_URL_BLOCKED')
  return STAGING_ORIGIN
}
export function createReadOnlyClient({origin,key,token,transport=fetch}) {
  const base=assertStagingUrl(origin)
  check(typeof key==='string'&&key.length>=12&&!key.startsWith('sb_secret_'),'RC19_PUBLISHABLE_KEY_REQUIRED')
  check(token===null||(typeof token==='string'&&token.trim().length>40),'RC19_SIGNED_JWT_REQUIRED')
  return async function request(route,{method='GET',body}={}) {
    const safeGet=/^\/rest\/v1\/(reports|report_revisions|report_images|live_report_images)\?/u.test(route)
    const safeAuth=route==='/auth/v1/user'&&method==='GET'
    const safeRpc=route==='/rest/v1/rpc/get_report_revisions'&&method==='POST'
    check((method==='GET'&&(safeGet||safeAuth))||safeRpc,'RC19_UNSAFE_HTTP_ACTION_BLOCKED')
    const options={
      method,
      headers:{
        apikey:key,
        ...(token?{Authorization:'Bearer '+token}:{}),
        Accept:'application/json',
        ...(safeRpc?{'Content-Type':'application/json'}:{}),
      },
      redirect:'error',cache:'no-store',signal:AbortSignal.timeout(15000),
      ...(safeRpc?{body:JSON.stringify(body)}:{}),
    }
    let response
    try{response=await transport(base+route,options)}
    catch{throw Error('RC19_STAGING_HTTP_NETWORK_FAILED')}
    const length=Number(response.headers?.get?.('content-length')??'0')
    check(!Number.isFinite(length)||length<1000000,'RC19_RESPONSE_TOO_LARGE')
    let payload
    try{payload=await response.json()}catch{throw Error('RC19_NON_JSON_RESPONSE')}
    return {status:response.status,ok:response.ok,payload}
  }
}

function listRequest(client,table,query) {
  return client('/rest/v1/'+table+'?'+new URLSearchParams(query).toString())
}
async function readList(client,table,query) {
  const result=await listRequest(client,table,query)
  check(result.status===200&&Array.isArray(result.payload),'RC19_READ_API_UNAVAILABLE_'+table.toUpperCase())
  check(result.payload.length<MAX_ROWS,'RC19_FIXTURE_PAGINATION_REQUIRED_'+table.toUpperCase())
  return result.payload
}
async function readReports(client) {
  const rows=await readList(client,'reports',{select:'id,deleted_at,archived_at',limit:String(MAX_ROWS)})
  check(rows.every(row=>typeof row.id==='string'),'RC19_REPORT_ID_RESPONSE_INVALID')
  return rows
}
async function probeMember(client,adminReports,memberIndex) {
  const memberReports=await readReports(client)
  const memberIds=new Set(memberReports.map(row=>row.id))
  check(memberReports.every(row=>!row.deleted_at&&!row.archived_at),'RC19_MEMBER_ARCHIVE_VISIBLE')
  check(memberReports.every(row=>adminReports.some(other=>other.id===row.id)),'RC19_MEMBER_ROW_OUTSIDE_ADMIN')
  const foreign=adminReports.find(report=>!report.deleted_at&&!report.archived_at&&!memberIds.has(report.id))
  check(!!foreign,'RC19_MEMBER_FOREIGN_FIXTURE_REQUIRED')
  for(const table of ['reports','report_revisions','report_images','live_report_images']) {
    const query=table==='reports'
      ?{select:'id',id:'eq.'+foreign.id,limit:'10'}
      :{select:'report_id',report_id:'eq.'+foreign.id,limit:'10'}
    const probe=await listRequest(client,table,query)
    // A scoped SELECT may be explicitly revoked (401/403) or hidden by RLS ([]).
    // Both are safe denials. A 200 containing any foreign row is an exposure.
    if(probe.status===401||probe.status===403)continue
    check(probe.status===200&&Array.isArray(probe.payload),'RC19_FOREIGN_TABLE_PROBE_INVALID_'+table.toUpperCase())
    check(probe.payload.length===0,'RC19_FOREIGN_TABLE_LEAK_'+table.toUpperCase())
  }
  const negative=await client('/rest/v1/rpc/get_report_revisions',{
    method:'POST',body:{p_report_id:foreign.id},
  })
  check(!negative.ok&&negative.payload?.message==='REPORT_NOT_FOUND','RC19_FOREIGN_REVISION_RPC_LEAK')
  if(memberReports.length) {
    const ownId=memberReports[0].id
    const ownRevisions=await readList(client,'report_revisions',{
      select:'report_id',report_id:'eq.'+ownId,limit:String(MAX_ROWS),
    })
    const rpc=await client('/rest/v1/rpc/get_report_revisions',{
      method:'POST',body:{p_report_id:ownId},
    })
    check(rpc.status===200&&Array.isArray(rpc.payload),'RC19_AUTHORIZED_MEMBER_RPC_FAILED')
    check(ownRevisions.length===rpc.payload.length,'RC19_AUTHORIZED_MEMBER_REVISION_COUNT_MISMATCH')
  }
  return {actor:'Member '+memberIndex,foreignTables:4,negativeRpc:true,ownPositive:memberReports.length>0}
}

async function getVerifiedUser(client,role) {
  const response=await client('/auth/v1/user')
  check(response.status===200&&typeof response.payload?.id==='string','RC19_REAL_JWT_AUTH_REQUIRED')
  check(response.payload.app_metadata?.system_permission===role,'RC19_JWT_ROLE_MISMATCH')
  check(typeof response.payload.app_metadata?.business_user_id==='string','RC19_JWT_BUSINESS_MAPPING_REQUIRED')
  return response.payload.id
}
export async function runSignedJwtGate(env,transport=fetch) {
  const origin=assertStagingUrl(env.RC19_STAGING_URL??STAGING_ORIGIN)
  const key=env.RC19_STAGING_PUBLISHABLE_KEY
  const memberTokens=Array.from({length:5},(_,i)=>env['RC19_MEMBER_JWT_'+(i+1)]).filter(Boolean)
  if(!memberTokens.length&&env.RC19_MEMBER_JWT)memberTokens.push(env.RC19_MEMBER_JWT)
  check(memberTokens.length>=1,'RC19_MEMBER_JWT_REQUIRED')
  if(env.RC19_REQUIRE_FIVE_MEMBERS==='true')
    check(memberTokens.length===5,'RC19_FIVE_MEMBER_TOKENS_REQUIRED')
  const members=memberTokens.map(token=>createReadOnlyClient({origin,key,token,transport}))
  const leader=createReadOnlyClient({origin,key,token:env.RC19_LEADER_JWT,transport})
  const admin=createReadOnlyClient({origin,key,token:env.RC19_ADMIN_JWT,transport})
  const anonymous=createReadOnlyClient({origin,key,token:null,transport})
  const actorIds=[await getVerifiedUser(admin,'admin'),await getVerifiedUser(leader,'leader')]
  for(const member of members)actorIds.push(await getVerifiedUser(member,'member'))
  check(new Set(actorIds).size===actorIds.length,'RC19_ROLE_ACTOR_REUSED')
  const adminReports=await readReports(admin)
  check(adminReports.length>0,'RC19_ADMIN_REPORT_FIXTURE_REQUIRED')
  const active=adminReports.filter(x=>!x.deleted_at&&!x.archived_at)
  const archived=adminReports.filter(x=>x.deleted_at||x.archived_at)
  check(active.length>0&&archived.length>0,'RC19_ACTIVE_AND_ARCHIVED_FIXTURES_REQUIRED')
  const leaderReports=await readReports(leader)
  check(leaderReports.length===active.length&&leaderReports.every(r=>active.some(a=>a.id===r.id)),
    'RC19_LEADER_REPORT_SCOPE_INCORRECT')
  const anon=await listRequest(anonymous,'reports',{select:'id',limit:'10'})
  check((anon.status===200&&Array.isArray(anon.payload)&&anon.payload.length===0)
    ||[401,403].includes(anon.status),'RC19_ANON_REPORT_LEAK')
  const checks=[]
  for(let i=0;i<members.length;i++)checks.push(await probeMember(members[i],adminReports,i+1))
  return {result:'RC19_STAGING_SIGNED_JWT_HTTP_PASS',memberCount:members.length,
    leaderActive:active.length,adminArchived:archived.length,anonymousDenied:true,checks}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  runSignedJwtGate(process.env).then(summary=>process.stdout.write(JSON.stringify(summary)+'\n'))
    .catch(error=>{
      // Never echo request body, URL query, credentials, IDs or server response.
      process.stderr.write('RC19_SIGNED_JWT_HTTP_NO_GO: '+
        (error instanceof Error?error.message:'RC19_UNKNOWN')+'\n')
      process.exitCode=1
    })
}
