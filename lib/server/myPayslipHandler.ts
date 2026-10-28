import 'server-only'
import { isFeatureEnabled } from '@/lib/flags'
import { createSupabaseAdminClient } from '@/lib/server/supabaseAdmin'
import { requireUser, isAuthorizationError, authorizationErrorResponse, type ServerUserResolver } from '@/lib/server/authGuards'
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
        const actor=await requireUser(request,resolve)
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
          .select('id,period_id,segment_id,staff_id,operational_role,actual_minutes,payable_minutes,overtime_minutes,rate_vnd_per_hour,overtime_multiplier_basis_points,gross_vnd,adjustment_vnd,net_vnd,adjustment_reason,voided_at')
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
            !idValue(s.shift_id)
        }))return failed('MY_PAYSLIP_ACTUAL_NOT_APPROVED',409)
        const shiftIds=[...new Set((segments.data??[]).map(s=>s.shift_id))]
        const shifts=shiftIds.length?await client.from('shifts')
          .select('id,date,title,brand_id,platform_id')
          .in('id',shiftIds).limit(201):{data:[],error:null}
        if(shifts.error)return failed('MY_PAYSLIP_SHIFT_READ_FAILED',503)
        const shiftsById=new Map((shifts.data??[]).map(s=>[s.id,s]))
        if(rows.some(l=>!shiftsById.has(segmentsById.get(l.segment_id)?.shift_id)))
          return failed('MY_PAYSLIP_SHIFT_SCOPE_INVALID',409)
        const statements=periods.map(p=>{
          const details=rows.filter(l=>l.period_id===p.id).map(l=>{
            const s=segmentsById.get(l.segment_id)!
            const shift=shiftsById.get(s.shift_id)!
            return {line_id:l.id,shift_id:s.shift_id,shift_date:shift.date,shift_title:shift.title,
              operational_role:l.operational_role,actual_start_at:s.actual_start_at,actual_end_at:s.actual_end_at,
              actual_minutes:l.actual_minutes,payable_minutes:l.payable_minutes,overtime_minutes:l.overtime_minutes,
              rate_vnd_per_hour:l.rate_vnd_per_hour, overtime_multiplier_basis_points:l.overtime_multiplier_basis_points,
              gross_vnd:l.gross_vnd,adjustment_vnd:l.adjustment_vnd,
              adjustment_reason:l.adjustment_reason,net_vnd:l.net_vnd,attendance_review:'approved'}
          })
          const total=details.reduce((sum,l)=>sum+l.net_vnd,0)
          if(!Number.isSafeInteger(total))throw new Error('MY_PAYSLIP_TOTAL_UNSAFE')
          return {period_id:p.id,period_start:p.period_start,period_end:p.period_end,status:'locked',
            locked_at:p.locked_at,lines:details,total_net_vnd:total}
        }).filter(p=>p.lines.length>0)
        return Response.json({ok:true,scope:'own_locked_only',limited_to:12,statements},{headers:noStore})
      }catch(error){
        if(isAuthorizationError(error))return authorizationErrorResponse(error)
        return failed('MY_PAYSLIP_READ_FAILED',503)
      }
    }
  }
}
