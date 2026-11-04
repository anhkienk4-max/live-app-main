import 'server-only'
import { isFeatureEnabled } from '@/lib/flags'
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { authorizationErrorResponse,isAuthorizationError,requireRole,
  type ServerUserResolver } from '@/lib/server/authGuards'
import { createSupabaseAdminClient } from '@/lib/server/supabaseAdmin'
import { summarizeWorkforcePerformance, type ScheduledStaffing } from '@/lib/workforce/workforcePerformance'
import { aggregateWorkforceTeam,rankVerifiedWorkforce } from '@/lib/workforce/workforceOverview'
import { WorkforceCalculationError,type ActualStaffingEvidence,
  type WorkforceRole } from '@/lib/workforce/payrollCalculation'
import { WORKFORCE_LATE_GRACE_MINUTES } from '@/lib/workforce/workforcePolicy'
import { workforcePeriodRange } from '@/lib/workforce/workforcePeriod'
import { readCompleteWorkforceRows, readWorkforceRowsForShifts,
  WorkforceScopeReadError } from '@/lib/server/workforceScopePagination'

const query=z.object({
  period:z.string().regex(/^\d{4}(?:-(0[1-9]|1[0-2]))?$/u).optional(),
  month:z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/u).optional(),
  role:z.enum(['host','support','technical']),
  page:z.coerce.number().int().min(1).max(100000).optional(),
  page_size:z.coerce.number().int().min(1).max(50).optional(),
  search:z.string().max(100).optional(),
  staff_id:z.string().max(128).optional(),
  record:z.enum(['complete','incomplete']).optional(),
  sort:z.enum(['name','assigned','approved_minutes','punctuality']).optional(),
  direction:z.enum(['asc','desc']).optional(),
}).strict().refine(input=>Boolean(input.period||input.month)&&!(input.period&&input.month))
  .refine(input=>Boolean(input.page)===Boolean(input.page_size))
const fail=(code:string,status:number)=>Response.json({ok:false,error:{code}},
  {status,headers:{'Cache-Control':'no-store'}})
type Options={createClient?:()=>SupabaseClient;resolveUser?:ServerUserResolver,
  isEnabled?:()=>boolean;
  grace?:()=>number|null;leaderboardMin?:()=>number|null}
function envInt(key:string):number|null{
  const v=process.env[key]?.trim()
  return v&&/^\d{1,3}$/u.test(v)?Number(v):null
}

export function createWorkforceOverviewHandler(options:Options={}) {
  return {async GET(request:Request):Promise<Response>{
    try{
      await requireRole(request,['admin','leader'],options.resolveUser)
      if(!(options.isEnabled??(()=>isFeatureEnabled('actual_staffing')))())
        return fail('WORKFORCE_FEATURE_DISABLED',503)
      const input=query.parse(Object.fromEntries(new URL(request.url).searchParams.entries()))
      const grace=(options.grace??(()=>WORKFORCE_LATE_GRACE_MINUTES))()
      if(grace===null||!Number.isSafeInteger(grace)||grace<0||grace>120)
        return fail('WORKFORCE_GRACE_POLICY_NOT_CONFIGURED',409)
      const period=input.period??input.month!
      const {from:first,to:last}=workforcePeriodRange(period)
      const db=(options.createClient??createSupabaseAdminClient)()
      const [staffRows,shiftRows]=await Promise.all([
        readCompleteWorkforceRows(
          (from,to)=>db.from('business_users')
            .select('id,full_name,department',{count:'exact'})
            .eq('status','active').is('deleted_at',null)
            .order('id',{ascending:true}).range(from,to),
          'WORKFORCE_TEAM_SCOPE_INCOMPLETE',
        ),
        readCompleteWorkforceRows(
          (from,to)=>db.from('shifts')
            .select('id,date,start_at,status,host_id,support_id,technical_id',{count:'exact'})
            .gte('date',first).lte('date',last).is('deleted_at',null)
            .order('id',{ascending:true}).range(from,to),
          'WORKFORCE_TEAM_SCOPE_INCOMPLETE',
        ),
      ])
      const shifts=shiftRows.filter(s=>s.status!=='cancelled')
      const shiftIds=shifts.map(s=>s.id)
      const [registrationRows,actualRows]=await Promise.all([
        readWorkforceRowsForShifts(
          shiftIds,
          (chunk,from,to)=>db.from('shift_registrations')
            .select('id,shift_id,user_id,operational_role,status',{count:'exact'})
            .in('shift_id',chunk).in('status',['approved','manually_assigned'])
            .order('id',{ascending:true}).range(from,to),
          'WORKFORCE_TEAM_EVIDENCE_INCOMPLETE',
        ),
        readWorkforceRowsForShifts(
          shiftIds,
          (chunk,from,to)=>db.from('workforce_actual_segments')
            .select('id,shift_id,staff_id,operational_role,event_kind,review_status,actual_start_at,actual_end_at',{count:'exact'})
            .in('shift_id',chunk).eq('review_status','approved')
            .order('id',{ascending:true}).range(from,to),
          'WORKFORCE_TEAM_EVIDENCE_INCOMPLETE',
        ),
      ])
      const registrations=registrationRows
      const known=new Map(staffRows.map(s=>[s.id,s]))
      const registrationsByShift=new Map<string,typeof registrations>()
      for(const registration of registrations){
        const rows=registrationsByShift.get(registration.shift_id)??[]
        rows.push(registration)
        registrationsByShift.set(registration.shift_id,rows)
      }
      const plannedByStaff=new Map<string,ScheduledStaffing[]>()
      const pairKeys=new Set<string>()
      const roleField={
        host:'host_id',support:'support_id',technical:'technical_id',
      }[input.role] as 'host_id'|'support_id'|'technical_id'
      for(const shift of shifts){
        const members=new Set<string>()
        if(shift[roleField])members.add(shift[roleField] as string)
        for(const r of registrationsByShift.get(shift.id)??[]){
          if(r.operational_role===input.role)members.add(r.user_id)
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
      const evidenceByStaff=new Map<string,ActualStaffingEvidence[]>()
      for(const row of evidence){
        const rows=evidenceByStaff.get(row.staffId)??[]
        rows.push(row)
        evidenceByStaff.set(row.staffId,rows)
      }
      const results=[...plannedByStaff].map(([staffId,planned])=>({
        ...summarizeWorkforcePerformance(staffId,input.role,planned,
          evidenceByStaff.get(staffId)??[],{lateGraceMinutes:grace}),
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
      const search=input.search?.trim().toLocaleLowerCase()??''
      const matching=results.filter(s=>(!input.staff_id||s.staffId===input.staff_id)
        &&(!input.record||(input.record==='complete'?s.isComplete:!s.isComplete))
        &&(!search||[s.staffId,s.name,s.department].some(value=>value?.toLocaleLowerCase().includes(search))))
      if(input.page_size){
        const sign=input.direction==='desc'?-1:1
        matching.sort((a,b)=>{
          const compared=input.sort==='assigned'?a.assignedShifts-b.assignedShifts
            :input.sort==='approved_minutes'?a.approvedActualMinutes-b.approvedActualMinutes
            :input.sort==='punctuality'?(a.punctualityPct??-1)-(b.punctualityPct??-1)
            :(a.name||a.staffId).localeCompare(b.name||b.staffId)
          return sign*compared||a.staffId.localeCompare(b.staffId)
        })
      }
      const totalPages=input.page_size?Math.max(1,Math.ceil(matching.length/input.page_size)):1
      const page=input.page_size?Math.min(input.page??1,totalPages):1
      const staff=input.page_size?matching.slice((page-1)*input.page_size,page*input.page_size):matching
      return Response.json({
        ok:true,period,...(period.includes('-')?{month:period}:{year:period}),role:input.role,team:aggregateWorkforceTeam(results),
        staff,staff_pagination:input.page_size?{
          page,page_size:input.page_size,total_count:matching.length,total_pages:totalPages,
          has_next:page<totalPages,has_previous:page>1,
        }:undefined,leaderboard,
        leaderboard_policy_configured:leaderboardPolicy!==null,
        unmatched_approved_segments:unmatched,
        gmv_per_hour:null,orders_per_hour:null,
        warning:unmatched>0?'UNMATCHED_APPROVED_STAFFING_REQUIRES_RECONCILIATION':null,
      },{headers:{'Cache-Control':'no-store'}})
    }catch(e){
      if(isAuthorizationError(e))return authorizationErrorResponse(e)
      if(e instanceof z.ZodError)return fail('WORKFORCE_TEAM_QUERY_INVALID',400)
      if(e instanceof WorkforceCalculationError)return fail(e.code,409)
      if(e instanceof WorkforceScopeReadError)return fail(e.code,503)
      if(e instanceof Error&&e.message==='WORKFORCE_LEADERBOARD_POLICY_REQUIRED')
        return fail('WORKFORCE_LEADERBOARD_POLICY_INVALID',409)
      return fail('WORKFORCE_TEAM_FAILED',503)
    }
  }}
}
