import 'server-only'
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { authorizationErrorResponse, isAuthorizationError, requireRole, type ServerUserResolver } from '@/lib/server/authGuards'
import { permissionMatrix } from '@/lib/permissions'
import { ROLE_DEFAULTS_CATALOG, RBAC01_ISOLATED_DOMAINS, validateRoleDefaultProposal } from '@/lib/rbac/roleDefaults'
import { createClient } from '@/lib/supabase/server'

const roleSchema = z.enum(['member','leader','admin'])
const decisionSchema = z.enum(['deny','inherit'])
const proposalSchema = z.object({
  action:z.literal('propose'),role:roleSchema,
  decisions:z.record(z.string().max(70),decisionSchema).refine(x=>Object.keys(x).length<=60),
  comment:z.string().max(500).default(''),
}).strict()
const rollbackSchema=z.object({action:z.literal('rollback'),versionId:z.number().int().positive()}).strict()
const approveSchema=z.object({action:z.literal('approve'),versionId:z.number().int().positive()}).strict()
const bodySchema=z.discriminatedUnion('action',[proposalSchema,rollbackSchema,approveSchema])
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}})

type Options={
  resolveUser?:ServerUserResolver
  createClient?:()=>Promise<Pick<SupabaseClient,'rpc'>>
  enabled?:()=>boolean
}
const rpcFailure=(message:string)=>json({ok:false,error:{code:'RBAC01_DATABASE_UNAVAILABLE',message}},503)

/**
 * Role-default drafts never take effect from UI/API. Approval is disabled in
 * SQL and here until DB RLS/RPC/service-admin parity is reviewed. This endpoint
 * is NOT a business-authorization decision point.
 */
export function createRbac01RoleDefaultsHandler(options:Options={}) {
  const enabled=options.enabled??(()=>process.env.FEATURE_RBAC01_ROLE_DEFAULTS==='true')
  const client=options.createClient??createClient
  return {
    GET:async(request:Request)=>{
      try {
        await requireRole(request,'admin',options.resolveUser)
        const catalog={
          catalog:ROLE_DEFAULTS_CATALOG,
          legacy:{
            member:[...permissionMatrix.member],leader:[...permissionMatrix.leader],admin:[...permissionMatrix.admin],
          },
          isolatedDomains:RBAC01_ISOLATED_DOMAINS,
          enabled:enabled(),
          effective:false,
          approvalEnabled:false,
        }
        if(!enabled())return json({ok:true,...catalog,versions:[]})
        const db=await client()
        const result=await db.rpc('rbac01_list_role_defaults')
        if(result.error||!Array.isArray(result.data))return rpcFailure('Role-default schema is not installed or not accessible.')
        return json({ok:true,...catalog,versions:result.data})
      }catch(error){
        if(isAuthorizationError(error))return authorizationErrorResponse(error)
        return rpcFailure('Role-default review is unavailable.')
      }
    },
    POST:async(request:Request)=>{
      try {
        await requireRole(request,'admin',options.resolveUser)
        if(!enabled())return json({ok:false,error:{code:'RBAC01_DISABLED'}},503)
        if(Number(request.headers.get('content-length')||0)>16384)return json({ok:false,error:{code:'BODY_TOO_LARGE'}},413)
        let input:unknown
        try{input=await request.json()}catch{return json({ok:false,error:{code:'INVALID_JSON'}},400)}
        const parsed=bodySchema.safeParse(input)
        if(!parsed.success)return json({ok:false,error:{code:'RBAC01_INPUT_INVALID'}},400)
        const action=parsed.data
        // No approval path can be activated until audited DB and API enforcement
        // are complete. UI-provided approver/effective/status are never accepted.
        if(action.action==='approve')return json({ok:false,error:{code:'RBAC01_ENFORCEMENT_NOT_ATTESTED'}},409)
        if(action.action==='propose'){
          const valid=validateRoleDefaultProposal(action.role,action.decisions)
          if(!valid.ok)return json({ok:false,error:{code:valid.code}},403)
        }
        const db=await client()
        const call=action.action==='propose'
          ?db.rpc('rbac01_propose_role_defaults',{p_role:action.role,p_decisions:action.decisions,p_comment:action.comment})
          :db.rpc('rbac01_rollback_role_defaults',{p_version_id:action.versionId})
        const result=await call
        if(result.error||!result.data)return rpcFailure('Review-only database RPC rejected the update.')
        return json({ok:true,result:result.data})
      }catch(error){
        if(isAuthorizationError(error))return authorizationErrorResponse(error)
        return rpcFailure('Role-default draft action is unavailable.')
      }
    },
  }
}
