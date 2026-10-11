import 'server-only'
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { authorizationErrorResponse, isAuthorizationError,
  requireUser, type ServerUserResolver } from '@/lib/server/authGuards'
import { createSupabaseAdminClient } from '@/lib/server/supabaseAdmin'
import { summarizeWorkforcePerformance, type ScheduledStaffing } from '@/lib/workforce/workforcePerformance'
import { WorkforceCalculationError, type ActualStaffingEvidence,
  type WorkforceRole } from '@/lib/workforce/payrollCalculation'

const noStore={'Cache-Control':'no-store'}
const fail=(code:string,status:number)=>Response.json({ok:false,error:{code}},{status,headers:noStore})
const params=z.object({
  month:z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/u),
  staff_id:z.string().min(1).max(120),
  role:z.enum(['host','support','technical']),
}).strict()
type Depends={
  createClient?:()=>SupabaseClient
  resolveUser?:ServerUserResolver
  lateGraceMinutes?:()=>number | null
}
export function createWorkforcePerformanceHandler(deps:Depends={}) {
  const db=deps.createClient??createSupabaseAdminClient
  const readGrace=deps.lateGraceMinutes??(()=>{
    const raw=process.env.WORKFORCE_LATE_GRACE_MINUTES
    return raw?.trim() && /^\d{1,3}$/u.test(raw) ? Number(raw) : null
  })
  return {
    async GET(request:Request):Promise<Response>{
      try{
        const user=await requireUser(request,deps.resolveUser)
        const raw=new URL(request.url).searchParams
        const input=params.parse(Object.fromEntries(raw.entries()))
        const isSupervisor=user.systemPermission==='admin'||user.systemPermission==='leader'
        if(!isSupervisor&&user.businessUserId!==input.staff_id)return fail('PERMISSION_DENIED',403)
        const grace=readGrace()
        if(!Number.isSafeInteger(grace)||grace===null||grace<0||grace>120)
          return fail('WORKFORCE_GRACE_POLICY_NOT_CONFIGURED',409)
        const year=Number(input.month.slice(0,4)),month=Number(input.month.slice(5))
        const first=input.month+'-01'
        const last=input.month+'-'+String(new Date(Date.UTC(year,month,0)).getUTCDate()).padStart(2,'0')
        const client=db()
        const [shiftRes,regRes]=await Promise.all([
          client.from('shifts')
            .select('id,date,start_at,status,host_id,support_id,technical_id')
            .gte('date',first).lte('date',last).is('deleted_at',null).limit(1000),
          client.from('shift_registrations')
            .select('shift_id,user_id,operational_role,status')
            .eq('user_id',input.staff_id)
            .in('status',['approved','manually_assigned']).limit(1000),
        ])
        if(shiftRes.error||regRes.error||(shiftRes.data??[]).length>=1000
          ||(regRes.data??[]).length>=1000)return fail('WORKFORCE_PLANNED_SCOPE_INCOMPLETE',503)
        const approvedIds=new Set((regRes.data??[])
          .filter(r=>r.operational_role===input.role).map(r=>r.shift_id))
        const roleField={
          host:'host_id',support:'support_id',technical:'technical_id',
        }[input.role] as keyof NonNullable<typeof shiftRes.data>[number]
        const planned:ScheduledStaffing[]=[]
        for(const shift of shiftRes.data??[]){
          if(shift.status==='cancelled')continue
          if(shift[roleField]!==input.staff_id&&!approvedIds.has(shift.id))continue
          // A missing timezone-normalized shift start must be repaired at the
          // schedule source. Never guess local timestamps for payroll KPIs.
          if(!shift.start_at)return fail('WORKFORCE_SHIFT_TIMESTAMPS_MISSING',409)
          planned.push({
            shiftId:shift.id,staffId:input.staff_id,role:input.role as WorkforceRole,
            scheduledStartAt:shift.start_at,shiftDate:shift.date,
          })
        }
        const shiftIds=planned.map(s=>s.shiftId)
        if(!shiftIds.length){
          const empty=summarizeWorkforcePerformance(input.staff_id,input.role,[],[],{
            lateGraceMinutes:grace,
          })
          return Response.json({ok:true,month:input.month,performance:empty,
            gmv_per_hour:null,orders_per_hour:null,
            metrics_note:'No planned staffing matches this scope; no GMV attribution is inferred'},
            {headers:noStore})
        }
        const evidenceRes=await client.from('workforce_actual_segments')
          .select('id,shift_id,staff_id,operational_role,event_kind,review_status,actual_start_at,actual_end_at')
          .eq('staff_id',input.staff_id).eq('operational_role',input.role)
          .eq('review_status','approved').in('shift_id',shiftIds).limit(1000)
        if(evidenceRes.error||(evidenceRes.data??[]).length>=1000)
          return fail('WORKFORCE_ACTUAL_SCOPE_INCOMPLETE',503)
        const evidence:ActualStaffingEvidence[]=(evidenceRes.data??[]).map(row=>({
          id:row.id,shiftId:row.shift_id,staffId:row.staff_id,role:row.operational_role,
          eventKind:row.event_kind,reviewStatus:row.review_status,
          startAt:row.actual_start_at,endAt:row.actual_end_at,
        }))
        const performance=summarizeWorkforcePerformance(input.staff_id,input.role,
          planned,evidence,{lateGraceMinutes:grace})
        return Response.json({
          ok:true,month:input.month,performance,
          gmv_per_hour:null,orders_per_hour:null,
          metrics_note:'Performance is evidence-based; no shift-level GMV attribution is approved',
        },{headers:noStore})
      }catch(e){
        if(isAuthorizationError(e))return authorizationErrorResponse(e)
        if(e instanceof z.ZodError)return fail('WORKFORCE_QUERY_INVALID',400)
        if(e instanceof WorkforceCalculationError)return fail(e.code,409)
        return fail('WORKFORCE_PERFORMANCE_FAILED',503)
      }
    },
  }
}
