import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { permissionMatrix, type Permission } from '../lib/permissions'
import { ROLE_DEFAULTS_CATALOG, previewRoleDefaults, validateRoleDefaultProposal, RBAC01_ISOLATED_DOMAINS } from '../lib/rbac/roleDefaults'
import { createRbac01RoleDefaultsHandler } from '../lib/server/rbac01RoleDefaultsHandler'
import type { SystemPermission } from '../lib/types/database.types'

const roles:SystemPermission[]=['member','leader','admin']
const actor=(systemPermission:SystemPermission)=>async()=>({id:'synthetic-auth',businessUserId:'synthetic-id',systemPermission})

test('RBAC-01 explicit catalog covers current matrix without duplicate permissions',()=>{
 const catalog=ROLE_DEFAULTS_CATALOG.map(x=>x.permission)
 assert.equal(new Set(catalog).size,catalog.length)
 for(const role of roles)for(const permission of permissionMatrix[role])assert.ok(catalog.includes(permission))
 assert.ok(RBAC01_ISOLATED_DOMAINS.includes('payroll'))
 assert.ok(RBAC01_ISOLATED_DOMAINS.includes('provider_credentials'))
 assert.ok(RBAC01_ISOLATED_DOMAINS.includes('private_storage'))
})
test('RBAC-01 legacy default exact parity for every role and permission',()=>{
 for(const role of roles){
  const actual=previewRoleDefaults(role)
  for(const item of ROLE_DEFAULTS_CATALOG){
   assert.equal(actual[item.permission].allowed,permissionMatrix[role].has(item.permission),
     role+' '+item.permission)
  }
 }
})
test('RBAC-01 denied proposal cannot cause live grant/revocation until full DB attestation',()=>{
 for(const role of roles){
  const target=[...permissionMatrix[role]].find(x=>x==='shifts.view_assigned') as Permission
  const preview=previewRoleDefaults(role,{[target]:'deny'})
  assert.equal(preview[target].proposedAllowed,false)
  assert.equal(preview[target].allowed,true,'legacy permissions must remain unchanged with shadow proposals')
 }
})
test('RBAC-01 rejects escalation, service role injection, admin bootstrap and unknown permissions',()=>{
 assert.deepEqual(validateRoleDefaultProposal('member',{'staff.manage':'allow'}),{ok:false,code:'PRIVILEGE_ESCALATION_DENIED'})
 assert.deepEqual(validateRoleDefaultProposal('member',{'service_role':'allow'}),{ok:false,code:'PERMISSION_INVALID'})
 assert.deepEqual(validateRoleDefaultProposal('admin',{'permissions.manage':'deny'}),{ok:false,code:'SECURITY_BOUNDARY_LOCKED'})
 assert.deepEqual(validateRoleDefaultProposal('admin',{'audit.restore':'deny'}),{ok:false,code:'SECURITY_BOUNDARY_LOCKED'})
 assert.deepEqual(validateRoleDefaultProposal('member',{'brands.manage':'deny'}),{ok:false,code:'NOT_A_LEGACY_GRANT'})
 assert.deepEqual(validateRoleDefaultProposal('admin',{'settings.admin':'deny'}),{ok:false,code:'SECURITY_BOUNDARY_LOCKED'})
 assert.deepEqual(validateRoleDefaultProposal('leader',{'shifts.view_assigned':'deny'}),{ok:true})
})
test('RBAC-01 denies unauthenticated and forged Member/Leader API POST before RPC',async()=>{
 let rpcCalls=0
 for(const role of [null,'member','leader'] as const){
  const handler=createRbac01RoleDefaultsHandler({
   enabled:()=>true,resolveUser:role?actor(role):async()=>null,
   createClient:async()=>({rpc:async()=>{rpcCalls++;return {data:{status:'proposed'},error:null}}}) as never,
  })
  const res=await handler.POST(new Request('https://local/api/role-defaults',{
   method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({action:'propose',role:'admin',decisions:{'staff.manage':'allow'}}),
  }))
  assert.equal(res.status,role?403:401)
 }
 assert.equal(rpcCalls,0)
})
test('RBAC-01 Admin cannot forge status or approvedBy or actor/user id',async()=>{
 let rpcCalls=0
 const handler=createRbac01RoleDefaultsHandler({
  enabled:()=>true,resolveUser:actor('admin'),
  createClient:async()=>({rpc:async()=>{rpcCalls++;return{data:{status:'proposed'},error:null}}}) as never,
 })
 for(const payload of [
  {action:'propose',role:'member',decisions:{'shifts.register':'deny'},approvedBy:'self'},
  {action:'propose',role:'member',decisions:{'shifts.register':'deny'},effective:true},
  {action:'propose',role:'member',decisions:{'service_role':'allow'}},
  {action:'propose',role:'member',decisions:{'staff.manage':'allow'}},
  {action:'approve',versionId:1},
 ]){
  const res=await handler.POST(new Request('https://local/api/role-defaults',{
   method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),
  }))
  assert.ok(res.status===403||res.status===400||res.status===409)
 }
 assert.equal(rpcCalls,0)
})
test('RBAC-01 gated Admin draft API requires live DB RPC, stores proposed only',async()=>{
 const calls:string[]=[]
 const handler=createRbac01RoleDefaultsHandler({
  enabled:()=>true,resolveUser:actor('admin'),
  createClient:async()=>({rpc:async(name:string)=>{calls.push(name);return{data:{version:1,status:'proposed',effective:false},error:null}}}) as never,
 })
 const input={action:'propose',role:'member',decisions:{'shifts.register':'deny'}}
 const res=await handler.POST(new Request('https://local/api/role-defaults',{method:'POST',body:JSON.stringify(input)}))
 assert.equal(res.status,200)
 assert.equal((await res.json()).result.effective,false)
 assert.deepEqual(calls,['rbac01_propose_role_defaults'])
})
test('RBAC-01 feature OFF is exact fallback, no DB access and no mutations',async()=>{
 let calls=0
 const handler=createRbac01RoleDefaultsHandler({
  enabled:()=>false,resolveUser:actor('admin'),
  createClient:async()=>{calls++;throw new Error('MUST_NOT_RUN')},
 })
 const read=await handler.GET(new Request('https://local/api/role-defaults'))
 assert.equal(read.status,200)
 const json=await read.json()
 assert.equal(json.enabled,false)
 assert.equal(json.effective,false)
 const update=await handler.POST(new Request('https://local/api/role-defaults',{
  method:'POST',body:JSON.stringify({action:'propose',role:'member',decisions:{'shifts.register':'deny'}}),
 }))
 assert.equal(update.status,503)
 assert.equal(calls,0)
})
test('RBAC-01 boundary guard not silently wired to Payroll/Reports/Storage or existing auth',()=>{
 const handler=readFileSync(new URL('../lib/server/rbac01RoleDefaultsHandler.ts',import.meta.url),'utf8')
 const sql=readFileSync(new URL('../docs/rbac01/RC19_RBAC01_REVIEW_ONLY.sql',import.meta.url),'utf8')
 assert.match(handler,/RBAC01_ENFORCEMENT_NOT_ATTESTED/)
 assert.match(sql,/RBAC01_ENFORCEMENT_NOT_ATTESTED/)
 assert.match(sql,/SELECT u.id INTO v_actor FROM public.business_users/)
 assert.match(sql,/auth\.uid\(\)/)
 assert.match(sql,/ENABLE ROW LEVEL SECURITY/)
 assert.doesNotMatch(sql,/GRANT .* ON private\.rbac01_role_default_versions TO authenticated/i)
 assert.match(sql,/REVOKE ALL ON FUNCTION public\.rbac01_propose_role_defaults/)
 assert.doesNotMatch(handler,/createSupabaseAdminClient|service_role/)
})
