import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { permissionMatrix, type Permission } from '../lib/permissions'
import { previewRoleDefaults, validateRoleDefaultProposal } from '../lib/rbac/roleDefaults'
import { AuthorizationError } from '../lib/server/authGuards'
import { requireEffectiveAuditTeamPermission } from '../lib/server/rbac01bEffectivePermission'
import { createRbac01bAuditTeamCapabilityHandler } from '../lib/server/rbac01bAuditTeamCapabilityHandler'

const req = (url='https://local/api/audit/team-capability') => new Request(url, {
  headers: { 'x-role': 'admin', 'x-business-user-id': 'spoof-admin', 'x-app-metadata': '{"system_permission":"admin"}' },
})
const actor = (role: 'admin'|'leader'|'member') => async () => ({
  id: 'server-verified-auth-id', businessUserId: 'server-verified-business-id', systemPermission: role,
})

test('RBAC-01B: legacy defaults for ALL roles remain unchanged without approved active version', () => {
  for (const role of ['member','leader','admin'] as const)
    for (const [permission, entry] of Object.entries(previewRoleDefaults(role))) {
      assert.equal(entry.allowed,permissionMatrix[role].has(permission as Permission),
        role+' '+permission)
    }
  const pending = previewRoleDefaults('leader', {'audit.view_team':'deny'})
  assert.equal(pending['audit.view_team'].proposedAllowed,false)
  assert.equal(pending['audit.view_team'].allowed,true,'a proposed deny is not an active deny')
})

test('RBAC-01B: API/TS/SQL proposal contract is inherit or deny only, no privilege allow',()=>{
  assert.deepEqual(validateRoleDefaultProposal('leader', {'audit.view_team':'deny'}),{ok:true})
  assert.deepEqual(validateRoleDefaultProposal('leader', {'audit.view_team':'inherit'}),{ok:true})
  assert.deepEqual(validateRoleDefaultProposal('leader', {'audit.view_team':'allow'}),{ok:false,code:'RBAC01_APPROVAL_BLOCKED'})
  assert.deepEqual(validateRoleDefaultProposal('member', {'audit.view_team':'deny'}),{ok:false,code:'NOT_A_LEGACY_GRANT'})
  assert.deepEqual(validateRoleDefaultProposal('member', {'audit.view_team':'allow'}),{ok:false,code:'PRIVILEGE_ESCALATION_DENIED'})
  assert.deepEqual(validateRoleDefaultProposal('admin', {'permissions.manage':'deny'}),{ok:false,code:'SECURITY_BOUNDARY_LOCKED'})
})

test('RBAC-01B: Member forged request cannot access audit team despite RPC-positive result',async()=>{
  let calls=0
  const handler=createRbac01bAuditTeamCapabilityHandler({
    enabled:()=>true, resolveUser:actor('member'),
    createClient:async()=>({rpc:async()=>{calls++;return{data:true,error:null}}}) as never,
  })
  const response=await handler.GET(req('https://local/api/audit/team-capability?role=admin'))
  assert.equal(response.status,403)
  assert.equal(calls,0)
  assert.equal(response.headers.get('Cache-Control'),'no-store')
})

test('RBAC-01B: Server default-OFF uses legacy leader permission without new SQL calls',async()=>{
  let calls=0
  const handler=createRbac01bAuditTeamCapabilityHandler({
    enabled:()=>false, resolveUser:actor('leader'),
    createClient:async()=>({rpc:async()=>{calls++;return{data:false,error:null}}}) as never,
  })
  const response=await handler.GET(req())
  assert.equal(response.status,200)
  assert.equal(calls,0)
  assert.equal(response.headers.get('Cache-Control'),'private, no-store, max-age=0')
})

test('RBAC-01B: Admin is not affected by leader deny version or injected role header',async()=>{
  let calls=0
  const response=await createRbac01bAuditTeamCapabilityHandler({
    enabled:()=>true, resolveUser:actor('admin'),
    createClient:async()=>({rpc:async()=>{calls++;return{data:false,error:null}}}) as never,
  }).GET(req())
  assert.equal(response.status,200)
  assert.equal(calls,0)
})

test('RBAC-01B: new authenticated request reads latest DB decision; deny immediate without cache',async()=>{
  let decision=true
  const calls:string[]=[]
  const handler=createRbac01bAuditTeamCapabilityHandler({
    enabled:()=>true, resolveUser:actor('leader'),
    createClient:async()=>({rpc:async(name:string,args:unknown)=>{
      assert.deepEqual(args,{p_permission:'audit.view_team'})
      calls.push(name);return{data:decision,error:null}
    }}) as never,
  })
  assert.equal((await handler.GET(req())).status,200)
  decision=false // new approved version has revoked Leader ability; same session
  assert.equal((await handler.GET(req())).status,403)
  decision=true  // review-only SQL fixture simulates later rollback-to-inherit
  assert.equal((await handler.GET(req())).status,200)
  assert.deepEqual(calls,Array(3).fill('rbac01_effective_permission'))
})

test('RBAC-01B: when flag ON, missing RPC, SQL errors or null responses fail closed',async()=>{
  for(const data of [{data:null,error:null},{data:false,error:null},{data:true,error:{message:'permission denied'}}]){
    const response=await createRbac01bAuditTeamCapabilityHandler({
      enabled:()=>true,resolveUser:actor('leader'),
      createClient:async()=>({rpc:async()=>data}) as never,
    }).GET(req())
    assert.equal(response.status,403)
  }
  const response=await createRbac01bAuditTeamCapabilityHandler({
    enabled:()=>true,resolveUser:actor('leader'),
    createClient:async()=>{throw Error('DB offline')},
  }).GET(req())
  assert.equal(response.status,403)
})

test('RBAC-01B: unauthenticated client cannot invoke API, even with spoofed input',async()=>{
  await assert.rejects(
    ()=>requireEffectiveAuditTeamPermission(req(),{resolveUser:async()=>null,enabled:()=>true}),
    (e:unknown)=>e instanceof AuthorizationError && e.status===401,
  )
  const response=await createRbac01bAuditTeamCapabilityHandler({
    resolveUser:async()=>null,enabled:()=>true,
  }).GET(req())
  assert.equal(response.status,401)
})

test('RBAC-01B: UI preflight runs BEFORE any audit direct client fetch; signed feature flag defaults OFF',()=>{
  const ui=readFileSync(new URL('../components/features/audit/AuditHistory.tsx',import.meta.url),'utf8')
  const preflight=ui.indexOf("fetch('/api/audit/team-capability'")
  const list=ui.indexOf("auditService.getAuditLogs({ user: currentUser")
  assert.ok(preflight>0 && preflight<list)
  assert.match(ui,/NEXT_PUBLIC_FEATURE_RBAC01B_AUDIT_TEAM_ENFORCEMENT === 'true'/)
  assert.match(ui,/teamCapabilityDenied/)
  assert.match(ui,/setLogs\(\[\]\)/)
  assert.match(ui,/setSelected\(null\)/)
  assert.match(ui,/cache: 'no-store'/)
})

test('RBAC-01B: authorization is limited to the single audited slice; RLS helper preserves role and module scope',()=>{
  const sql=readFileSync(new URL('../docs/rbac01/RC19_RBAC01B_AUDIT_TEAM_REVIEW_ONLY.sql',import.meta.url),'utf8')
  assert.match(sql,/v_role = 'admin' THEN RETURN true/)
  assert.match(sql,/v_role <> 'leader' THEN RETURN false/)
  assert.match(sql,/status = 'approved'/)
  assert.match(sql,/v_decision IS DISTINCT FROM 'deny'/)
  assert.match(sql,/module = ANY\(ARRAY\['calendar','live','reports','campaigns','swaps','imports'\]/)
  assert.match(sql,/SECURITY INVOKER/)
  assert.doesNotMatch(sql,/GRANT .* ON private.rbac01_role_default_versions TO authenticated/i)
})
