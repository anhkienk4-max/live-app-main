import 'server-only'
import { isFeatureEnabled } from '@/lib/flags'
import { createSupabaseAdminClient } from '@/lib/server/supabaseAdmin'
import { requirePermission, isAuthorizationError, authorizationErrorResponse, type ServerUserResolver } from '@/lib/server/authGuards'
import type { SupabaseClient } from '@supabase/supabase-js'

type Dependencies = {
  createClient?: () => SupabaseClient
  resolveUser?: ServerUserResolver
  isEnabled?: () => boolean
}
const noStore = {'Cache-Control':'private, no-store', 'X-Content-Type-Options':'nosniff'}
const failed=(code:string,status:number)=>Response.json({ok:false,error:{code}}, {status,headers:noStore})
const safeNumber=(value:unknown) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
const signedNumber=(value:unknown) => typeof value === 'number' && Number.isSafeInteger(value)
const idValue=(value:unknown) => typeof value === 'string' && value.length>0 && value.length<=120

export function createMyPayslipHandler(deps: Dependencies = {}) {
  const db=deps.createClient ?? createSupabaseAdminClient
  const resolve=deps.resolveUser
  return {
    async GET(request:Request):Promise<Response>{
      try{
        const actor=await requirePermission(request,'payroll.view_own',resolve)
        if (!actor.businessUserId || !idValue(actor.businessUserId) || !idValue(actor.id))
          return failed('MY_PAYSLIP_IDENTITY_REQUIRED',403)
        if (!(deps.isEnabled ?? (()=>isFeatureEnabled('my_payslip')))())
          return failed('MY_PAYSLIP_FEATURE_DISABLED',503)
        const query=new URL(request.url).searchParams
        // Never accept an owner parameter, even though it would be ignored.
        if ([...query.keys()].some(k=>k!=='year'))return failed('MY_PAYSLIP_QUERY_NOT_ALLOWED',400)
        const year=query.get('year')
        if (year!==null && (!/^20[2-9][0-9]$/.test(year)||Number(year)>2100))
          return failed('MY_PAYSLIP_YEAR_INVALID',400)
        const client=db()
        let periodsQuery=client.from('workforce_payroll_periods')
          .select('id,period_start,period_end,status,locked_at,revision')
          .eq('status','locked')
          .order('period_start',{ascending:false})
          .limit(13)
        if(year)periodsQuery=periodsQuery.gte('period_start',year+'-01-01').lte('period_start',year+'-12-31')
        const periodsRes=await periodsQuery
        if(periodsRes.error)return failed('MY_PAYSLIP_PERIOD_READ_FAILED',503)
        const periods=periodsRes.data??[]
        if(periods.length>12)return failed('MY_PAYSLIP_PERIOD_LIMIT',409)
        if(periods.some(p=>!idValue(p.id)||p.status!=='locked'||!p.locked_at||!p.period_start||!p.period_end))
          return failed('MY_PAYSLIP_PERIOD_INTEGRITY',409)
        if(!periods.length)return Response.json({ok:true,statements:[],scope:'own_locked_only',limited_to:12},{headers:noStore})
        const periodIds=periods.map(p=>p.id)
        const linesRes=await client.from('workforce_payroll_lines')
          .select('id,period_id,segment_id,staff_id,operational_role,actual_minutes,payable_minutes,overtime_minutes,actual_seconds,payable_seconds,overtime_seconds,overtime_request_id,overtime_day_class,overtime_time_class,rate_vnd_per_hour,overtime_multiplier_basis_points,gross_vnd,adjustment_vnd,net_vnd,adjustment_reason,voided_at')
          .eq('staff_id',actor.businessUserId)
          .in('period_id',periodIds).is('voided_at',null)
          .order('created_at',{ascending:true}).limit(201)
        if(linesRes.error)return failed('MY_PAYSLIP_LINES_READ_FAILED',503)
        const rows=linesRes.data??[]
        if(rows.length>200)return failed('MY_PAYSLIP_LINES_LIMIT',409)
        const periodsById=new Map(periods.map(p=>[p.id,p]))
        if(rows.some(l=>l.staff_id!==actor.businessUserId || !periodsById.has(l.period_id) ||
          !idValue(l.id)||!idValue(l.segment_id)||!['host','support','technical'].includes(l.operational_role) ||
          !safeNumber(l.actual_minutes)||!safeNumber(l.payable_minutes)||!safeNumber(l.overtime_minutes) ||
          (l.actual_seconds!==null&&!safeNumber(l.actual_seconds)) ||
          (l.payable_seconds!==null&&!safeNumber(l.payable_seconds)) ||
          (l.overtime_seconds!==null&&!safeNumber(l.overtime_seconds)) ||
          ((l.actual_seconds===null)!==(l.payable_seconds===null)) ||
          ((l.actual_seconds===null)!==(l.overtime_seconds===null)) ||
          (l.actual_seconds!==null && (l.actual_seconds<1 || l.payable_seconds>l.actual_seconds
            || l.overtime_seconds>l.payable_seconds)) ||
          !safeNumber(l.rate_vnd_per_hour)||!safeNumber(l.overtime_multiplier_basis_points) ||
          !safeNumber(l.gross_vnd)||!signedNumber(l.adjustment_vnd)||!safeNumber(l.net_vnd) ||
          l.gross_vnd+l.adjustment_vnd!==l.net_vnd || l.voided_at!==null))
          return failed('MY_PAYSLIP_LINE_INTEGRITY',409)
        const segmentIds=[...new Set(rows.map(l=>l.segment_id))]
        const segments=segmentIds.length?await client.from('workforce_actual_segments')
          .select('id,staff_id,shift_id,operational_role,event_kind,actual_start_at,actual_end_at,review_status')
          .eq('staff_id',actor.businessUserId).eq('review_status','approved')
          .in('id',segmentIds).limit(201):{data:[],error:null}
        if(segments.error)return failed('MY_PAYSLIP_ACTUAL_READ_FAILED',503)
        const segmentsById=new Map((segments.data??[]).map(s=>[s.id,s]))
        if(rows.some(l=>{
          const s=segmentsById.get(l.segment_id)
          return !s||s.staff_id!==actor.businessUserId||s.operational_role!==l.operational_role||
            s.event_kind!=='worked'||s.review_status!=='approved'||!s.actual_start_at||!s.actual_end_at||
            !idValue(s.shift_id) || (l.actual_seconds!==null &&
              Math.floor(Date.parse(s.actual_end_at)/1000)-Math.floor(Date.parse(s.actual_start_at)/1000)!==l.actual_seconds)
        }))return failed('MY_PAYSLIP_ACTUAL_NOT_APPROVED',409)
        const shiftIds=[...new Set((segments.data??[]).map(s=>s.shift_id))]
        const shifts=shiftIds.length?await client.from('shifts')
          .select('id,date,title,brand_id,platform_id')
          .in('id',shiftIds).limit(201):{data:[],error:null}
        if(shifts.error)return failed('MY_PAYSLIP_SHIFT_READ_FAILED',503)
        const shiftsById=new Map((shifts.data??[]).map(s=>[s.id,s]))
        if(rows.some(l=>!shiftsById.has(segmentsById.get(l.segment_id)?.shift_id)))
          return failed('MY_PAYSLIP_SHIFT_SCOPE_INVALID',409)
        let compensationAvailable=true
        let compensationCases:Array<Record<string,unknown>>=[]
        const adjustmentsRes=await client.from('workforce_payroll_adjustments')
          .select('id,period_id,compensation_case_id,staff_id,operational_role,amount_vnd,reason,confirmed_by,created_at')
          .eq('staff_id',actor.businessUserId).in('period_id',periodIds).order('created_at',{ascending:true}).limit(201)
        if(adjustmentsRes.error && ['PGRST205','42P01'].includes(adjustmentsRes.error.code??'')) compensationAvailable=false
        else if(adjustmentsRes.error)return failed('MY_PAYSLIP_ADJUSTMENT_READ_FAILED',503)
        else {
          const adjustments=adjustmentsRes.data??[]
          if(adjustments.length>200)return failed('MY_PAYSLIP_ADJUSTMENT_LIMIT',409)
          if(adjustments.some(a=>a.staff_id!==actor.businessUserId||!periodIds.includes(a.period_id)
            ||!safeNumber(a.amount_vnd)||a.amount_vnd<1||!idValue(a.compensation_case_id)
            ||!idValue(a.confirmed_by)||!['host','support','technical'].includes(a.operational_role)))
            return failed('MY_PAYSLIP_ADJUSTMENT_INTEGRITY',409)
          if(adjustments.length){
            const caseRes=await client.from('workforce_cancellation_compensation_cases')
              .select('id,period_id,staff_id,operational_role,proposed_amount_vnd,admin_confirmed_by,state,reason')
              .eq('staff_id',actor.businessUserId).eq('state','admin_confirmed')
              .in('id',adjustments.map(a=>a.compensation_case_id)).limit(201)
            if(caseRes.error)return failed('MY_PAYSLIP_COMPENSATION_CASE_READ_FAILED',503)
            if((caseRes.data??[]).length!==adjustments.length)return failed('MY_PAYSLIP_COMPENSATION_CASE_INCOMPLETE',409)
            const casesById=new Map((caseRes.data??[]).map(c=>[c.id,c]))
            if(adjustments.some(a=>{
              const c=casesById.get(a.compensation_case_id)
              return !c||c.period_id!==a.period_id||c.staff_id!==a.staff_id
                ||c.operational_role!==a.operational_role||c.proposed_amount_vnd!==a.amount_vnd
                ||c.admin_confirmed_by!==a.confirmed_by||c.state!=='admin_confirmed'
            }))return failed('MY_PAYSLIP_COMPENSATION_SCOPE_INVALID',409)
            compensationCases=caseRes.data??[]
          }
        }
        const statements=periods.map(p=>{
          const details=rows.filter(l=>l.period_id===p.id).map(l=>{
            const s=segmentsById.get(l.segment_id)!
            const shift=shiftsById.get(s.shift_id)!
            return {line_id:l.id,shift_id:s.shift_id,shift_date:shift.date,shift_title:shift.title,
              operational_role:l.operational_role,actual_start_at:s.actual_start_at,actual_end_at:s.actual_end_at,
              actual_minutes:l.actual_minutes,payable_minutes:l.payable_minutes,overtime_minutes:l.overtime_minutes,
              actual_seconds:l.actual_seconds,payable_seconds:l.payable_seconds,overtime_seconds:l.overtime_seconds,
              overtime_request_id:l.overtime_request_id,overtime_day_class:l.overtime_day_class,
              overtime_time_class:l.overtime_time_class,
              rate_vnd_per_hour:l.rate_vnd_per_hour, overtime_multiplier_basis_points:l.overtime_multiplier_basis_points,
              gross_vnd:l.gross_vnd,adjustment_vnd:l.adjustment_vnd,
              adjustment_reason:l.adjustment_reason,net_vnd:l.net_vnd,attendance_review:'approved'}
          })
          const cancellationAdjustments=compensationAvailable?(adjustmentsRes.data??[]).filter(a=>a.period_id===p.id)
            .map(a=>({id:a.id,compensation_case_id:a.compensation_case_id,staff_id:a.staff_id,
              operational_role:a.operational_role,amount_vnd:a.amount_vnd,reason:a.reason,confirmed_by:a.confirmed_by,
              shift_id:(compensationCases.find(c=>c.id===a.compensation_case_id)?.shift_id as string|undefined)??null})) : []
          const total=details.reduce((sum,l)=>sum+l.net_vnd,0)+cancellationAdjustments.reduce((sum,a)=>sum+a.amount_vnd,0)
          if(!Number.isSafeInteger(total))throw new Error('MY_PAYSLIP_TOTAL_UNSAFE')
          return {period_id:p.id,period_start:p.period_start,period_end:p.period_end,status:'locked',
            locked_at:p.locked_at,lines:details,compensation_adjustments:cancellationAdjustments,total_net_vnd:total}
        }).filter(p=>p.lines.length>0)
        return Response.json({ok:true,scope:'own_locked_only',limited_to:12,compensation_available:compensationAvailable,statements},{headers:noStore})
      }catch(error){
        if(isAuthorizationError(error))return authorizationErrorResponse(error)
        return failed('MY_PAYSLIP_READ_FAILED',503)
      }
    }
  }
}
