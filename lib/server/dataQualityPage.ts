import type { SupabaseClient } from '@supabase/supabase-js'
import { withShiftStaffingSummary } from '@/lib/services/supabaseStaffingReadService'
import { filterDataQualityIssues, getAllIssues } from '@/lib/utils/dataQuality'
import { shiftFromRow } from '@/lib/services/supabaseShiftService'
import { reportFromRow } from '@/lib/services/supabaseReportService'
import { registrationFromRow } from '@/lib/services/supabaseShiftRegistrationService'
import { localListPage, type ListQuery } from '@/lib/services/operationsPageService'

async function completeRows(client: SupabaseClient, table: 'shifts' | 'reports' | 'shift_registrations') {
  const rows: Array<Record<string, unknown>> = []
  let total: number | undefined
  const seen = new Set<unknown>()
  const columns:string=table==='reports'?'id,shift_id,status,revenue,orders,metrics_confirmed,ocr_review,raw_ocr_output,created_at,updated_at'
    :table==='shift_registrations'?'id,shift_id,user_id,operational_role,status,source,imported_name,requested_at,created_at,updated_at'
    :'id,date,start_time,end_time,brand_id,platform_id,status,host_names,assistant_names,technical_names,required_host_count,required_support_count,required_technical_count,created_at,updated_at'
  // shortcut: The cross-record diagnostic scan is capped at 10000 per source; move it to a job above this bound.
  for (let offset=0; ; offset+=50) {
    let query=client.from(table).select(columns,{count:'exact'})
    if(table!=='shift_registrations')query=query.is('deleted_at',null).is('archived_at',null)
    const result=await query.order('id').range(offset,offset+49)
    if(result.error || result.count===null || result.count>10000 || (total!==undefined && total!==result.count)
      || result.data?.length!==Math.min(50,Math.max(0,result.count-offset))) throw new Error('QUALITY_READ_INCOMPLETE')
    total ??= result.count
    for(const rawRow of result.data??[]) { const row=rawRow as unknown as Record<string,unknown>;if(seen.has(row.id))throw new Error('QUALITY_READ_INCOMPLETE');seen.add(row.id);rows.push(row) }
    if(rows.length>=total)return rows
  }
}
export async function readDataQualityPage(client: SupabaseClient, query: ListQuery) {
  const [shifts,reports,registrations]=await Promise.all(['shifts','reports','shift_registrations'].map(table=>completeRows(client,table as 'shifts'|'reports'|'shift_registrations')))
  const visibleShifts=await withShiftStaffingSummary(client,shifts.map(row=>shiftFromRow(row as Parameters<typeof shiftFromRow>[0],'database')))
  const all=getAllIssues({
    shifts:visibleShifts,
    reports:reports.map(row=>reportFromRow(row as Parameters<typeof reportFromRow>[0])),
    registrations:registrations.map(row=>registrationFromRow(row as Parameters<typeof registrationFromRow>[0])),
  }).sort((a,b)=>a.id.localeCompare(b.id))
  const filtered=filterDataQualityIssues(all,query.filters?.severity??[],query.filters?.qualitySources??[])
  return { ...localListPage(filtered,query), counts:{error:all.filter(i=>i.severity==='error').length,warning:all.filter(i=>i.severity==='warning').length,info:all.filter(i=>i.severity==='info').length}, totalIssues:all.length }
}
