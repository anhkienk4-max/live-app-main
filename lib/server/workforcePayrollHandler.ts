import 'server-only'
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { authorizationErrorResponse, isAuthorizationError, requireRole,
  type ServerUserResolver } from '@/lib/server/authGuards'
import { createSupabaseAdminClient } from '@/lib/server/supabaseAdmin'
import { readJsonBody, RequestBodyError } from '@/lib/server/apiSecurity'
import { calculatePayrollAmounts, calculatePayrollLine, selectApprovedRate, WorkforceCalculationError,
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
const correctionFields = {
  period_id:id,line_id:id,expected_version:z.number().int().min(1).max(2147483646),
  request_id:z.string().uuid(),reason:z.string().trim().min(8).max(2000),
}
const correction = z.object({
  ...correctionFields,action:z.literal('correct_line'),
  payable_minutes:line.shape.payable_minutes,overtime_minutes:line.shape.overtime_minutes,
  adjustment_vnd:line.shape.adjustment_vnd,adjustment_reason:line.shape.adjustment_reason,
}).strict()
const voidLine = z.object({...correctionFields,action:z.literal('void_line')}).strict()
const discoveryDate = z.string().date().refine(value=>!value.startsWith('0000'))
const pageNumber = (max:number) => z.string().regex(/^[1-9]\d{0,6}$/u)
  .transform(Number).refine(value=>value<=max)
const discoveryPage = {
  page:pageNumber(1000000).default('1'),page_size:pageNumber(100).default('50'),
}
const periodDiscovery = z.object({
  ...discoveryPage,action:z.literal('list_periods'),
  date_from:discoveryDate.optional(),date_to:discoveryDate.optional(),
  status:z.enum(['draft','reviewed','confirmed','payroll_ready','locked']).optional(),
}).strict().refine(value=>!value.date_from||!value.date_to||value.date_from<=value.date_to)
const rateDiscovery = z.object({
  ...discoveryPage,action:z.literal('list_rates'),staff_id:id.optional(),
  role:z.enum(['host','support','technical']).optional(),
  effective_date:discoveryDate.optional(),
  scope:z.enum(['staff_specific','role_default']).optional(),
}).strict().refine(value=>value.scope!=='role_default'||!value.staff_id)
const discoveryQuery = z.union([periodDiscovery,rateDiscovery])
const correctionErrors = new Set([
  'WORKFORCE_PAYROLL_STALE_LINE','WORKFORCE_PAYROLL_PERIOD_NOT_DRAFT',
  'WORKFORCE_PAYROLL_LINE_VOIDED','WORKFORCE_PAYROLL_IDEMPOTENCY_CONFLICT',
  'WORKFORCE_PAYROLL_LINE_NOT_FOUND','WORKFORCE_PAYROLL_GROSS_MISMATCH',
])
type Options={createClient?:()=>SupabaseClient;resolveUser?:ServerUserResolver}
const noStore={'Cache-Control':'no-store'}
const failure=(code:string,status:number)=>Response.json({ok:false,error:{code}},{status,headers:noStore})
function csvEscape(input:unknown):string {
  const s=String(input??'')
  const neutral=/^\s*[=+\-@\t\r]/u.test(s) ? "'"+s : s
  return '"'+neutral.replace(/"/gu,'""')+'"'
}
// Text identifiers must be formula-neutralized; salary arithmetic columns
// must remain numeric in Excel, including negative adjustments. Validate a
// strict integer literal before emitting a numeric CSV cell.
const csvNumericColumns=new Set([
  'actual_minutes','payable_minutes','overtime_minutes','rate_vnd_per_hour',
  'overtime_multiplier_basis_points','gross_vnd','adjustment_vnd','net_vnd',
])
function csvNumber(input:unknown):string {
  const value=String(input??'')
  if(!/^-?(?:0|[1-9]\d*)$/u.test(value))
    throw new WorkforceCalculationError('WORKFORCE_PAYROLL_CSV_NUMERIC_INVALID')
  return '"'+value+'"'
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
        if(q.has('action')){
          if([...q.keys()].some(key=>q.getAll(key).length!==1))
            return failure('WORKFORCE_PAYROLL_DISCOVERY_QUERY_INVALID',400)
          const parsed=discoveryQuery.safeParse(Object.fromEntries(q.entries()))
          if(!parsed.success)return failure('WORKFORCE_PAYROLL_DISCOVERY_QUERY_INVALID',400)
          const input=parsed.data
          const isPeriods=input.action==='list_periods'
          const client=connect()
          const offset=(input.page-1)*input.page_size
          const buildQuery=(head=false)=>{
            let query=client.from(isPeriods?'workforce_payroll_periods':'workforce_rate_cards')
              .select(isPeriods
                ?'id,period_start,period_end,status,revision,created_by,reviewed_by,confirmed_by,locked_by,locked_at,created_at,updated_at'
                :'id,staff_id,operational_role,effective_from,effective_through,vnd_per_hour,overtime_multiplier_basis_points,approved_by,approved_at,approval_note,created_at',
              {count:'exact',head})
            if(input.action==='list_periods'){
              if(input.date_from)query=query.gte('period_end',input.date_from)
              if(input.date_to)query=query.lte('period_start',input.date_to)
              if(input.status)query=query.eq('status',input.status)
              query=query.order('period_start',{ascending:false})
                .order('period_end',{ascending:false}).order('revision',{ascending:false})
            }else{
              query=query.not('approved_by','is',null).not('approved_at','is',null)
              if(input.staff_id)query=query.eq('staff_id',input.staff_id)
              if(input.role)query=query.eq('operational_role',input.role)
              if(input.scope==='role_default')query=query.is('staff_id',null)
              if(input.scope==='staff_specific')query=query.not('staff_id','is',null)
              if(input.effective_date)query=query.lte('effective_from',input.effective_date)
                .or('effective_through.is.null,effective_through.gte.'+input.effective_date)
              query=query.order('effective_from',{ascending:false})
            }
            return query.order('id',{ascending:true})
          }
          let {data,count,error}=await buildQuery().range(offset,offset+input.page_size-1)
            .overrideTypes<Record<string,unknown>[],{merge:false}>()
          // PostgREST rejects out-of-range offsets; prove an empty page with the same filters.
          if(error?.code==='PGRST103'){
            const recount=await buildQuery(true)
            if(!recount.error&&Number.isSafeInteger(recount.count)&&recount.count!==null
              &&recount.count>=0&&offset>=recount.count){
              data=[];count=recount.count;error=null
            }
          }
          if(error)return failure('WORKFORCE_PAYROLL_DISCOVERY_READ_FAILED',503)
          if(!Array.isArray(data)||!Number.isSafeInteger(count)||count===null||count<0
            ||data.length!==Math.min(input.page_size,Math.max(0,count-offset)))
            return failure('WORKFORCE_PAYROLL_DISCOVERY_READ_INCOMPLETE',503)
          const pagination={page:input.page,page_size:input.page_size,total_count:count,
            total_pages:Math.ceil(count/input.page_size),has_next:offset+data.length<count,
            has_previous:input.page>1}
          return Response.json({ok:true,
            ...(isPeriods?{periods:data}:{rates:data.map(row=>({...row,
              scope:row.staff_id===null?'role_default':'staff_specific'}))}),
            pagination,
          },{headers:noStore})
        }
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
            ...(lines.data??[]).filter(row=>!row.voided_at).map(row=>columns.map(k=>
               csvNumericColumns.has(k)?csvNumber(row[k]):csvEscape(row[k])).join(','))].join('\r\n')+'\r\n'
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
        const input=z.union([rate,period,line,transition,correction,voidLine])
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
        if(input.action==='correct_line'||input.action==='void_line'){
          let gross:number|null=null
          if(input.action==='correct_line'){
            const current=await db.from('workforce_payroll_lines')
              .select('actual_minutes,rate_vnd_per_hour,overtime_multiplier_basis_points')
              .eq('id',input.line_id).eq('period_id',input.period_id).maybeSingle()
            if(current.error)return failure('WORKFORCE_PAYROLL_LINE_READ_FAILED',503)
            if(!current.data)return failure('WORKFORCE_PAYROLL_LINE_NOT_FOUND',409)
            gross=calculatePayrollAmounts({
              actualMinutes:current.data.actual_minutes,
              rateVndPerHour:current.data.rate_vnd_per_hour,
              overtimeMultiplierBasisPoints:current.data.overtime_multiplier_basis_points,
              payableMinutes:input.payable_minutes,overtimeMinutes:input.overtime_minutes,
              adjustmentVnd:input.adjustment_vnd,adjustmentReason:input.adjustment_reason,
            }).grossVnd
          }
          // Status/version and retries are checked atomically by the RPC.
          const {data,error}=await db.rpc('workforce_rc16b_correct_payroll_line',{
            p_period_id:input.period_id,p_line_id:input.line_id,
            p_expected_version:input.expected_version,p_request_id:input.request_id,
            p_action:input.action,p_actor_id:actor,p_reason:input.reason,
            p_payable_minutes:input.action==='correct_line'?input.payable_minutes:null,
            p_overtime_minutes:input.action==='correct_line'?input.overtime_minutes:null,
            p_adjustment_vnd:input.action==='correct_line'?input.adjustment_vnd:null,
            p_adjustment_reason:input.action==='correct_line'?input.adjustment_reason:null,
            p_expected_gross_vnd:gross,
          })
          if(error){
            if(error.message==='WORKFORCE_PAYROLL_CORRECTION_INVALID')
              return failure(error.message,400)
            if(error.message==='WORKFORCE_PAYROLL_ACTOR_FORBIDDEN')
              return failure(error.message,403)
            return correctionErrors.has(error.message) ? failure(error.message,409)
              : failure('WORKFORCE_PAYROLL_CORRECTION_FAILED',503)
          }
          return Response.json({ok:true,...data},{headers:noStore})
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
        }).select('id,period_id,staff_id,segment_id,net_vnd,version,voided_at').single()
        return error ? failure('WORKFORCE_PAYROLL_LINE_CONFLICT_OR_UNVERIFIED',409)
          : Response.json({ok:true,line:data},{status:201,headers:noStore})
      })
    },
  }
}
