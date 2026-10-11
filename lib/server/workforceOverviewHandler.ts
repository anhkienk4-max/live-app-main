import 'server-only'
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { authorizationErrorResponse,isAuthorizationError,requireRole,
  type ServerUserResolver } from '@/lib/server/authGuards'
import { createSupabaseAdminClient } from '@/lib/server/supabaseAdmin'
import { summarizeWorkforcePerformance, type ScheduledStaffing } from '@/lib/workforce/workforcePerformance'
import { aggregateWorkforceTeam,rankVerifiedWorkforce } from '@/lib/workforce/workforceOverview'
import { WorkforceCalculationError,type ActualStaffingEvidence,
  type WorkforceRole } from '@/lib/workforce/payrollCalculation'

const query=z.object({
  month:z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/u),
  role:z.enum(['host','support','technical']),
}).strict()
const fail=(code:string,status:number)=>Response.json({ok:false,error:{code}},
  {status,headers:{'Cache-Control':'no-store'}})
type Options={createClient?:()=>SupabaseClient;resolveUser?:ServerUserResolver,
  grace?:()=>number|null;leaderboardMin?:()=>number|null}
function envInt(key:string):number|null{
  const v=process.env[key]?.trim()
  return v&&/^\d{1,3}$/u.test(v)?Number(v):null
}

export function createWorkforceOverviewHandler(options:Options={}) {
  return {async GET(request:Request):Promise<Response>{
    try{
      await requireRole(request,['admin','leader'],options.resolveUser)
      const input=query.parse(Object.fromEntries(new URL(request.url).searchParams.entries()))
      const grace=(options.grace??(()=>envInt('WORKFORCE_LATE_GRACE_MINUTES')))()
      if(grace===null||!Number.isSafeInteger(grace)||grace<0||grace>120)
        return fail('WORKFORCE_GRACE_POLICY_NOT_CONFIGURED',409)
      const y=Number(input.month.slice(0,4)),m=Number(input.month.slice(5))
      const first=input.month+'-01'
      const last=input.month+'-'+String(new Date(Date.UTC(y,m,0)).getUTCDate()).padStart(2,'0')
      const db=(options.createClient??createSupabaseAdminClient)()
      const [staffRes,shiftRes]=await Promise.all([
        db.from('business_users').select('id,full_name,department')
          .eq('status','active').is('deleted_at',null).limit(1000),
        db.from('shifts').select('id,date,start_at,status,host_id,support_id,technical_id')
          .gte('date',first).lte('date',last).is('deleted_at',null).limit(1000),
      ])
      if(staffRes.error||shiftRes.error||(staffRes.data??[]).length>=1000
        ||(shiftRes.data??[]).length>=1000)
        return fail('WORKFORCE_TEAM_SCOPE_INCOMPLETE',503)
      const shifts=(shiftRes.data??[]).filter(s=>s.status!=='cancelled')
      const shiftIds=shifts.map(s=>s.id)
      const [regs,actual]=shiftIds.length?await Promise.all([
        db.from('shift_registrations').select('shift_id,user_id,operational_role,status')
          .in('shift_id',shiftIds).in('status',['approved','manually_assigned']).limit(1000),
        db.from('workforce_actual_segments')
          .select('id,shift_id,staff_id,operational_role,event_kind,review_status,actual_start_at,actual_end_at')
          .in('shift_id',shiftIds).eq('review_status','approved').limit(1000),
      ]):[{data:[],error:null},{data:[],error:null}]
      if(regs.error||actual.error||(regs.data??[]).length>=1000
        ||(actual.data??[]).length>=1000)
        return fail('WORKFORCE_TEAM_EVIDENCE_INCOMPLETE',503)
      const registrations=(regs.data??[]) as Array<{
        shift_id:string; user_id:string; operational_role:string; status:string
      }>
      const actualRows=(actual.data??[]) as Array<{
        id:string; shift_id:string; staff_id:string; operational_role:WorkforceRole;
        event_kind:'worked'|'no_show'; review_status:'approved';
        actual_start_at:string|null; actual_end_at:string|null
      }>
      const known=new Map((staffRes.data??[]).map(s=>[s.id,s]))
      const plannedByStaff=new Map<string,ScheduledStaffing[]>()
      const pairKeys=new Set<string>()
      const roleField={
        host:'host_id',support:'support_id',technical:'technical_id',
      }[input.role] as 'host_id'|'support_id'|'technical_id'
      for(const shift of shifts){
        const members=new Set<string>()
        if(shift[roleField])members.add(shift[roleField] as string)
        for(const r of registrations){
          if(r.shift_id===shift.id&&r.operational_role===input.role)members.add(r.user_id)
        }
        for(const staffId of members){
          if(!known.has(staffId))continue
          if(!shift.start_at)return fail('WORKFORCE_SHIFT_TIMESTAMPS_MISSING',409)
          const key=shift.id+':'+staffId+':'+input.role
          if(pairKeys.has(key))continue
          pairKeys.add(key)
          plannedByStaff.set(staffId,[...(plannedByStaff.get(staffId)??[]),{
            shiftId:shift.id,staffId,role:input.role as WorkforceRole,
            scheduledStartAt:shift.start_at,shiftDate:shift.date,
          }])
        }
      }
      const evidence:ActualStaffingEvidence[]=actualRows
        .filter(e=>e.operational_role===input.role)
        .map(e=>({id:e.id,shiftId:e.shift_id,staffId:e.staff_id,
          role:e.operational_role,eventKind:e.event_kind,reviewStatus:e.review_status,
          startAt:e.actual_start_at,endAt:e.actual_end_at}))
      const results=[...plannedByStaff].map(([staffId,planned])=>({
        ...summarizeWorkforcePerformance(staffId,input.role,planned,evidence,
          {lateGraceMinutes:grace}),
        name:known.get(staffId)?.full_name??null,
        department:known.get(staffId)?.department??null,
      }))
      const leaderboardPolicy=(options.leaderboardMin??(()=>
        envInt('WORKFORCE_LEADERBOARD_MIN_VERIFIED_SHIFTS')))()
      const leaderboard=leaderboardPolicy!==null
        ?rankVerifiedWorkforce(results,leaderboardPolicy).map((s,index)=>({
          rank:index+1,staff_id:s.staffId,name:known.get(s.staffId)?.full_name??null,
          punctuality_pct:s.punctualityPct,approved_worked_shifts:s.approvedWorkedShifts,
          approved_actual_minutes:s.approvedActualMinutes,
        })):[]
      const knownPairs=new Set(pairKeys)
      const unmatched=evidence.filter(e=>!knownPairs.has(
        e.shiftId+':'+e.staffId+':'+e.role)).length
      return Response.json({
        ok:true,month:input.month,role:input.role,team:aggregateWorkforceTeam(results),
        staff:results,leaderboard,
        leaderboard_policy_configured:leaderboardPolicy!==null,
        unmatched_approved_segments:unmatched,
        gmv_per_hour:null,orders_per_hour:null,
        warning:unmatched>0?'UNMATCHED_APPROVED_STAFFING_REQUIRES_RECONCILIATION':null,
      },{headers:{'Cache-Control':'no-store'}})
    }catch(e){
      if(isAuthorizationError(e))return authorizationErrorResponse(e)
      if(e instanceof z.ZodError)return fail('WORKFORCE_TEAM_QUERY_INVALID',400)
      if(e instanceof WorkforceCalculationError)return fail(e.code,409)
      if(e instanceof Error&&e.message==='WORKFORCE_LEADERBOARD_POLICY_REQUIRED')
        return fail('WORKFORCE_LEADERBOARD_POLICY_INVALID',409)
      return fail('WORKFORCE_TEAM_FAILED',503)
    }
  }}
}
