import 'server-only'
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { authorizationErrorResponse, isAuthorizationError, requireRole,
  type ServerUserResolver } from '@/lib/server/authGuards'
import { createSupabaseAdminClient } from '@/lib/server/supabaseAdmin'
import { readJsonBody, RequestBodyError } from '@/lib/server/apiSecurity'
import { calculatePayrollLine, selectApprovedRate, WorkforceCalculationError,
  type ActualStaffingEvidence, type ApprovedPayrollRate } from '@/lib/workforce/payrollCalculation'

const id = z.string().trim().min(1).max(120)
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/u)
const rate = z.object({
  action: z.literal('register_rate'), staff_id: id.nullable(),
  operational_role: z.enum(['host','support','technical']),
  effective_from: date, effective_through: date.nullable(),
  vnd_per_hour: z.number().int().min(0).max(100000000),
  overtime_multiplier_basis_points: z.number().int().min(10000).max(50000),
  approval_note: z.string().trim().min(8).max(1000),
}).strict()
const period = z.object({action:z.literal('create_period'),period_start:date,period_end:date}).strict()
const line = z.object({
  action:z.literal('prepare_line'),period_id:id,segment_id:id,
  payable_minutes:z.number().int().min(0).max(1440),
  overtime_minutes:z.number().int().min(0).max(1440),
  adjustment_vnd:z.number().int().min(-1e12).max(1e12),
  adjustment_reason:z.string().trim().min(8).max(1000).nullable(),
}).strict()
const transition = z.object({
  action:z.literal('transition'),period_id:id,
  expected_status:z.enum(['draft','reviewed','confirmed','payroll_ready']),
  target_status:z.enum(['reviewed','confirmed','payroll_ready','locked']),
  reason:z.string().trim().min(8).max(2000),
}).strict()
type Options={createClient?:()=>SupabaseClient;resolveUser?:ServerUserResolver}
const noStore={'Cache-Control':'no-store'}
const failure=(code:string,status:number)=>Response.json({ok:false,error:{code}},{status,headers:noStore})
function csvEscape(input:unknown):string {
  const s=String(input??'')
  const neutral=/^\s*[=+\-@\t\r]/u.test(s) ? "'"+s : s
  return '"'+neutral.replace(/"/gu,'""')+'"'
}

export function createWorkforcePayrollHandler(options:Options={}) {
  const connect=options.createClient??createSupabaseAdminClient
  async function run<T extends Response>(f:()=>Promise<T>):Promise<Response>{
    try{return await f()}
    catch(e){
      if(isAuthorizationError(e))return authorizationErrorResponse(e)
      if(e instanceof RequestBodyError)return failure(e.code,e.status)
      if(e instanceof z.ZodError)return failure('WORKFORCE_REQUEST_INVALID',400)
      if(e instanceof WorkforceCalculationError)return failure(e.code,409)
      return failure('WORKFORCE_PAYROLL_FAILED',500)
    }
  }
  return {
    GET(request:Request){
      return run(async()=>{
        await requireRole(request,'admin',options.resolveUser)
        const q=new URL(request.url).searchParams
        const parsed=id.safeParse(q.get('period_id'))
        if(!parsed.success)return failure('WORKFORCE_PERIOD_ID_REQUIRED',400)
        const client=connect()
        const r=await client.from('workforce_payroll_periods').select('*')
          .eq('id',parsed.data).maybeSingle()
        if(r.error)return failure('WORKFORCE_PERIOD_READ_FAILED',503)
        if(!r.data)return failure('WORKFORCE_PERIOD_NOT_FOUND',404)
        const [lines,audit]=await Promise.all([
          client.from('workforce_payroll_lines').select('*')
            .eq('period_id',parsed.data).order('created_at',{ascending:true}).limit(3000),
          client.from('workforce_payroll_audit').select('*')
            .eq('period_id',parsed.data).order('created_at',{ascending:true}).limit(3000),
        ])
        if(lines.error||audit.error||(lines.data??[]).length>=3000||(audit.data??[]).length>=3000)
          return failure('WORKFORCE_PAYROLL_READ_INCOMPLETE',503)
        if(q.get('export')==='csv'){
          if(r.data.status!=='locked')return failure('WORKFORCE_PAYROLL_EXPORT_REQUIRES_LOCK',409)
          const columns=['staff_id','operational_role','segment_id','actual_minutes',
            'payable_minutes','overtime_minutes','rate_vnd_per_hour',
            'overtime_multiplier_basis_points','gross_vnd','adjustment_vnd','net_vnd',
            'adjustment_reason','calculation_version']
          const csv='\ufeff'+[columns.map(csvEscape).join(','),
            ...(lines.data??[]).map(row=>columns.map(k=>csvEscape(row[k])).join(','))].join('\r\n')+'\r\n'
          const filename='payroll-'+r.data.period_start+'-'+r.data.period_end+'.csv'
          return new Response(csv,{headers:{'Content-Type':'text/csv; charset=utf-8',
            'Content-Disposition':'attachment; filename="'+filename+'"',
            'X-Content-Type-Options':'nosniff','Cache-Control':'no-store'}})
        }
        return Response.json({ok:true,period:r.data,lines:lines.data??[],audit:audit.data??[]},
          {headers:noStore})
      })
    },
    POST(request:Request){
      return run(async()=>{
        const user=await requireRole(request,'admin',options.resolveUser)
        const actor=user.businessUserId
        if(!actor)return failure('WORKFORCE_BUSINESS_USER_REQUIRED',403)
        const input=z.union([rate,period,line,transition])
          .parse(await readJsonBody(request,16384))
        const db=connect()
        if(input.action==='register_rate'){
          if(input.staff_id===actor)return failure('WORKFORCE_RATE_SELF_APPROVAL_BLOCKED',403)
          if(input.effective_through && input.effective_through<input.effective_from)
            return failure('WORKFORCE_RATE_DATES_INVALID',400)
          const {data,error}=await db.from('workforce_rate_cards').insert({
            staff_id:input.staff_id,operational_role:input.operational_role,
            effective_from:input.effective_from,effective_through:input.effective_through,
            vnd_per_hour:input.vnd_per_hour,
            overtime_multiplier_basis_points:input.overtime_multiplier_basis_points,
            approved_by:actor,approved_at:new Date().toISOString(),approval_note:input.approval_note,
          }).select('id,staff_id,operational_role,effective_from,effective_through').single()
          return error ? failure('WORKFORCE_RATE_DUPLICATE_OR_INVALID',409)
            : Response.json({ok:true,rate:data},{status:201,headers:noStore})
        }
        if(input.action==='create_period'){
          if(input.period_start>input.period_end)return failure('WORKFORCE_PERIOD_INVALID',400)
          const {data,error}=await db.from('workforce_payroll_periods').insert({
            period_start:input.period_start,period_end:input.period_end,
            created_by:actor,status:'draft',
          }).select('id,period_start,period_end,status,revision').single()
          return error ? failure('WORKFORCE_PERIOD_CONFLICT',409)
            : Response.json({ok:true,period:data},{status:201,headers:noStore})
        }
        if(input.action==='transition'){
          const {data,error}=await db.rpc('workforce_rc16_transition_payroll',{
            p_period_id:input.period_id,p_expected_status:input.expected_status,
            p_target_status:input.target_status,p_actor_id:actor,p_reason:input.reason,
          })
          return error ? failure('WORKFORCE_PAYROLL_TRANSITION_REJECTED',409)
            : Response.json({ok:true,period:data},{headers:noStore})
        }
        const p=await db.from('workforce_payroll_periods')
          .select('id,status,period_start,period_end').eq('id',input.period_id).maybeSingle()
        if(p.error)return failure('WORKFORCE_PERIOD_READ_FAILED',503)
        if(!p.data||p.data.status!=='draft')return failure('WORKFORCE_PAYROLL_PERIOD_NOT_DRAFT',409)
        const a=await db.from('workforce_actual_segments')
          .select('id,shift_id,staff_id,operational_role,event_kind,review_status,actual_start_at,actual_end_at')
          .eq('id',input.segment_id).maybeSingle()
        if(a.error)return failure('WORKFORCE_ACTUAL_READ_FAILED',503)
        if(!a.data||a.data.review_status!=='approved'||a.data.event_kind!=='worked')
          return failure('WORKFORCE_ATTENDANCE_NOT_APPROVED',409)
        const shift=await db.from('shifts').select('id,date,deleted_at')
          .eq('id',a.data.shift_id).maybeSingle()
        if(shift.error)return failure('WORKFORCE_SHIFT_READ_FAILED',503)
        if(!shift.data||shift.data.deleted_at||shift.data.date<p.data.period_start
          ||shift.data.date>p.data.period_end)return failure('WORKFORCE_SHIFT_OUTSIDE_PERIOD',409)
        const cards=await db.from('workforce_rate_cards')
          .select('id,staff_id,operational_role,effective_from,effective_through,vnd_per_hour,overtime_multiplier_basis_points,approved_by')
          .eq('operational_role',a.data.operational_role).limit(1000)
        if(cards.error||(cards.data??[]).length>=1000)return failure('WORKFORCE_RATES_INCOMPLETE',503)
        const evidence:ActualStaffingEvidence={
          id:a.data.id,shiftId:a.data.shift_id,staffId:a.data.staff_id,
          role:a.data.operational_role,eventKind:a.data.event_kind,
          reviewStatus:a.data.review_status,startAt:a.data.actual_start_at,
          endAt:a.data.actual_end_at,
        }
        const approvedRates:ApprovedPayrollRate[]=(cards.data??[]).map(v=>({
          id:v.id,staffId:v.staff_id,role:v.operational_role,
          effectiveFrom:v.effective_from,effectiveThrough:v.effective_through,
          vndPerHour:v.vnd_per_hour,
          overtimeMultiplierBasisPoints:v.overtime_multiplier_basis_points,
          approvedBy:v.approved_by,
        }))
        const selected=selectApprovedRate(evidence,shift.data.date,approvedRates)
        const total=calculatePayrollLine({
          segment:evidence,shiftDate:shift.data.date,rate:selected,
          payableMinutes:input.payable_minutes,overtimeMinutes:input.overtime_minutes,
          adjustmentVnd:input.adjustment_vnd,adjustmentReason:input.adjustment_reason,
        })
        const {data,error}=await db.from('workforce_payroll_lines').insert({
          period_id:p.data.id,segment_id:total.segmentId,rate_card_id:total.rateCardId,
          staff_id:total.staffId,operational_role:total.role,
          actual_minutes:total.actualMinutes,payable_minutes:total.payableMinutes,
          overtime_minutes:total.overtimeMinutes,rate_vnd_per_hour:total.rateVndPerHour,
          overtime_multiplier_basis_points:total.overtimeMultiplierBasisPoints,
          gross_vnd:total.grossVnd,adjustment_vnd:total.adjustmentVnd,
          adjustment_reason:total.adjustmentReason,calculation_version:total.calculationVersion,
        }).select('id,period_id,staff_id,segment_id,net_vnd').single()
        return error ? failure('WORKFORCE_PAYROLL_LINE_CONFLICT_OR_UNVERIFIED',409)
          : Response.json({ok:true,line:data},{status:201,headers:noStore})
      })
    },
  }
}
