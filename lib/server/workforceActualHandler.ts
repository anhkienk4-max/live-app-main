import 'server-only'

import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { authorizationErrorResponse, isAuthorizationError,
  requireRole, type ServerUserResolver } from '@/lib/server/authGuards'
import { createSupabaseAdminClient } from '@/lib/server/supabaseAdmin'
import { readJsonBody, RequestBodyError } from '@/lib/server/apiSecurity'

const id = z.string().trim().min(1).max(120)
const time = z.string().datetime({ offset: true })
const record = z.object({
  action:z.literal('record'),
  shift_id:id,
  staff_id:id,
  operational_role:z.enum(['host','support','technical']),
  event_kind:z.enum(['worked','no_show']),
  coverage_kind:z.enum(['planned','cover','replacement','extra']),
  actual_start_at:time.nullable(),
  actual_end_at:time.nullable(),
  evidence_note:z.string().trim().min(8).max(2000),
}).strict().superRefine((v,ctx)=>{
  if (v.event_kind==='no_show' && (v.actual_start_at!==null || v.actual_end_at!==null)) {
    ctx.addIssue({code:'custom',message:'NO_SHOW_MUST_NOT_HAVE_ACTUAL_TIMES'})
  }
  if (v.event_kind==='worked' && (!v.actual_start_at || !v.actual_end_at
    || Date.parse(v.actual_end_at)<=Date.parse(v.actual_start_at))) {
    ctx.addIssue({code:'custom',message:'WORKED_REQUIRES_VALID_TIMES'})
  }
})
const review = z.object({
  action:z.literal('review'),
  segment_id:id,
  expected_version:z.number().int().min(1),
  decision:z.enum(['approved','rejected']),
  review_note:z.string().trim().min(8).max(2000),
}).strict()

type Depends = { client?:()=>SupabaseClient; resolveUser?:ServerUserResolver }
const noStore={'Cache-Control':'no-store'}
const fail=(code:string,status:number)=>Response.json({ok:false,error:{code}},
  {status,headers:noStore})

export function createWorkforceActualHandler(deps:Depends={}) {
  const db=deps.client??createSupabaseAdminClient
  async function guard<T extends Response>(execute:()=>Promise<T>):Promise<Response>{
    try{return await execute()}
    catch(e){
      if(isAuthorizationError(e))return authorizationErrorResponse(e)
      if(e instanceof RequestBodyError)return fail(e.code,e.status)
      if(e instanceof z.ZodError)return fail('WORKFORCE_REQUEST_INVALID',400)
      return fail('WORKFORCE_ACTUAL_FAILED',500)
    }
  }
  return {
    GET(request:Request){
      return guard(async()=>{
        await requireRole(request,['admin','leader'],deps.resolveUser)
        const search=new URL(request.url).searchParams
        const shiftId=id.safeParse(search.get('shift_id'))
        if(!shiftId.success)return fail('WORKFORCE_SHIFT_ID_REQUIRED',400)
        const {data,error}=await db().from('workforce_actual_segments')
          .select('id,shift_id,staff_id,operational_role,event_kind,coverage_kind,actual_start_at,actual_end_at,review_status,evidence_note,created_by,reviewed_by,reviewed_at,version,created_at')
          .eq('shift_id',shiftId.data).order('created_at',{ascending:true}).limit(200)
        if(error)return fail('WORKFORCE_ACTUAL_READ_FAILED',503)
        return Response.json({ok:true,segments:data??[]},{headers:noStore})
      })
    },
    POST(request:Request){
      return guard(async()=>{
        const user=await requireRole(request,['admin','leader'],deps.resolveUser)
        const actor=user.businessUserId
        if(!actor)return fail('WORKFORCE_BUSINESS_USER_REQUIRED',403)
        const body=await readJsonBody(request,16*1024)
        const action=z.union([record,review]).parse(body)
        const client=db()
        if(action.action==='record'){
          const [shift,staff]=await Promise.all([
            client.from('shifts').select('id,status,deleted_at')
              .eq('id',action.shift_id).is('deleted_at',null).maybeSingle(),
            client.from('business_users').select('id,status,deleted_at')
              .eq('id',action.staff_id).is('deleted_at',null).maybeSingle(),
          ])
          if(shift.error||staff.error)return fail('WORKFORCE_SCOPE_LOOKUP_FAILED',503)
          if(!shift.data||shift.data.status==='cancelled'||!staff.data||staff.data.status!=='active')
            return fail('WORKFORCE_SHIFT_OR_STAFF_INVALID',409)
          const {data,error}=await client.from('workforce_actual_segments').insert({
            shift_id:action.shift_id,staff_id:action.staff_id,
            operational_role:action.operational_role,event_kind:action.event_kind,
            coverage_kind:action.coverage_kind,actual_start_at:action.actual_start_at,
            actual_end_at:action.actual_end_at,evidence_note:action.evidence_note,
            created_by:actor,review_status:'draft',
          }).select('id,shift_id,review_status,version').single()
          if(error)return fail('WORKFORCE_ACTUAL_CONFLICT_OR_INVALID',409)
          return Response.json({ok:true,segment:data},{status:201,headers:noStore})
        }
        // Review is optimistic and only draft evidence can be decided.
        const {data:current,error:lookup}=await client.from('workforce_actual_segments')
          .select('id,review_status,version,created_by')
          .eq('id',action.segment_id).maybeSingle()
        if(lookup)return fail('WORKFORCE_ACTUAL_READ_FAILED',503)
        if(!current||current.review_status!=='draft'||current.version!==action.expected_version)
          return fail('WORKFORCE_ACTUAL_STALE_OR_LOCKED',409)
        // Evidence provenance stays immutable. A rejected segment is retained;
        // reviewed_by/reviewed_at are never authored by the caller.
        const {data,error}=await client.from('workforce_actual_segments')
          .update({
            review_status:action.decision,
            reviewed_by:actor,reviewed_at:new Date().toISOString(),
            evidence_note:current.created_by===actor
              ? action.review_note : action.review_note,
            version:action.expected_version+1,
          }).eq('id',action.segment_id).eq('version',action.expected_version)
          .eq('review_status','draft').select('id,review_status,version').maybeSingle()
        if(error||!data)return fail('WORKFORCE_ACTUAL_STALE_OR_LOCKED',409)
        return Response.json({ok:true,segment:data},{headers:noStore})
      })
    },
  }
}
