import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import type { Report, Shift, User } from '../lib/types/database.types.ts'
import { canExportReportDetail } from '../lib/permissions.ts'
import { clearReportShiftQuery, initialReportShift, loadReportTarget, reportShiftHref } from '../lib/utils/reportTarget.ts'
import { limitReportCandidates } from '../lib/utils/reportQueue.ts'
import { deriveReportAttention } from '../lib/ui/operational-attention.ts'
import { getReportIssues, recoveryActionFor } from '../lib/utils/dataQuality.ts'

const oldShift: Shift = {
  id: 'd706b643-0965-4308-a46f-6e97f5cada0a', date: '2026-09-14',
  start_time: '07:00', end_time: '09:00', status: 'completed',
  brand_id: 'female-ai', platform_id: 'shopee',
  created_at: '2026-09-14T00:00:00Z', updated_at: '2026-09-14T00:00:00Z',
}
const draft: Report = {
  id: '7e544141-5d7c-4319-b87a-59b0ca4f6659', shift_id: oldShift.id,
  status: 'draft', metrics_confirmed: false, submitted_by: 'member',
  created_at: '2026-09-14T00:00:00Z', updated_at: '2026-09-14T00:00:00Z',
}
const admin = { id: 'admin', role: 'admin', system_permission: 'admin' } as User
const member = { id: 'member', role: 'staff', system_permission: 'member' } as User
const recent = Array.from({ length: 30 }, (_, i): Shift => ({
  ...oldShift, id: `recent-${i}`, date: i < 12 ? '2026-09-30' : i < 22 ? '2026-09-29' : '2026-09-28',
}))
const lookup = (shift: Shift | null = oldShift, report: Report | null = draft) => ({
  getShift: async () => shift, getReport: async () => report,
})

test('Calendar deep link resolves the September 14 draft independently of all 30 recent candidates', async () => {
  const queue = limitReportCandidates([...recent, oldShift], 671)
  assert.equal(queue.length, 30)
  assert.equal(queue.some(shift => shift.id === oldShift.id), false)
  const href = reportShiftHref(oldShift.id)
  const shiftId = new URL(href, 'https://example.test').searchParams.get('shiftId')!
  const calls: string[] = []
  const target = await loadReportTarget(shiftId, {
    getShift: async id => { calls.push(`shift:${id}`); return oldShift },
    getReport: async id => { calls.push(`report:${id}`); return draft },
  }, admin, new Set())
  assert.deepEqual(calls, [`shift:${oldShift.id}`, `report:${oldShift.id}`])
  assert.equal(target.mode, 'form')
  assert.equal(target.report?.id, draft.id)
  const formOptions = [target.shift, ...queue]
  assert.equal(initialReportShift(formOptions, target.report, target.shift.id)?.id, draft.shift_id)
  assert.equal(initialReportShift(formOptions, target.report)?.date, '2026-09-14')
  assert.equal(queue.length, 30)
})

test('historical reopened report continues its exact editable form', async () => {
  const report = { ...draft, status: 'reopened' as const }
  const target = await loadReportTarget(oldShift.id, lookup(oldShift, report), member, new Set())
  assert.equal(target.mode, 'form')
  assert.equal(target.report, report)
})

test('historical finalized and review-only reports open exact detail', async () => {
  for (const report of [{ ...draft, status: 'confirmed' as const, metrics_confirmed: true },
    { ...draft, status: 'in_review' as const }, { ...draft, metrics_confirmed: true }]) {
    const target = await loadReportTarget(oldShift.id, lookup(oldShift, report), member, new Set())
    assert.equal(target.mode, 'detail')
    assert.equal(target.shift.id, report.shift_id)
    assert.equal(target.report, report)
  }
})

test('authorized historical shift without report opens an exact new form', async () => {
  for (const [user, shift, staffed] of [
    [admin, oldShift, new Set<string>()],
    [member, oldShift, new Set([oldShift.id])],
    [member, { ...oldShift, host_id: member.id }, new Set<string>()],
  ] as const) {
    const target = await loadReportTarget(oldShift.id, lookup(shift, null), user, staffed)
    assert.equal(target.mode, 'form')
    assert.equal(target.report, undefined)
    assert.equal(initialReportShift([target.shift, ...recent], undefined, target.shift.id)?.id, oldShift.id)
  }
})

test('unassigned staff and another report owner cannot open an editable target', async () => {
  await assert.rejects(loadReportTarget(oldShift.id, lookup(oldShift, null), member, new Set()), /REPORT_TARGET_FORBIDDEN/)
  await assert.rejects(loadReportTarget(oldShift.id, lookup(oldShift, { ...draft, submitted_by: 'someone-else' }), member, new Set([oldShift.id])), /REPORT_TARGET_FORBIDDEN/)
})

test('missing, inaccessible, deleted, archived and mismatched targets never resolve another shift', async () => {
  for (const shift of [null, { ...oldShift, deleted_at: '2026-10-07' },
    { ...oldShift, archived_at: '2026-10-07' }, recent[0]]) {
    await assert.rejects(loadReportTarget(oldShift.id, lookup(shift), admin, new Set()), /REPORT_TARGET_UNAVAILABLE/)
  }
  await assert.rejects(loadReportTarget('bad-shift-id', lookup(null, null), admin, new Set()), /REPORT_TARGET_UNAVAILABLE/)
  await assert.rejects(loadReportTarget('', lookup(), admin, new Set()), /REPORT_TARGET_UNAVAILABLE/)
  await assert.rejects(loadReportTarget(oldShift.id, lookup(oldShift, { ...draft, shift_id: recent[0].id }), admin, new Set()), /REPORT_TARGET_UNAVAILABLE/)
  await assert.rejects(loadReportTarget(oldShift.id, lookup(oldShift, { ...draft, deleted_at: '2026-10-07' }), admin, new Set()), /REPORT_TARGET_UNAVAILABLE/)
})

test('nonreportable historical shift cannot start a new report', async () => {
  await assert.rejects(loadReportTarget(oldShift.id, lookup({ ...oldShift, status: 'scheduled' }, null), admin, new Set()), /REPORT_TARGET_UNAVAILABLE/)
})

test('explicit form targets never fall back to the first recent shift', () => {
  assert.equal(initialReportShift(recent, draft), undefined)
  assert.equal(initialReportShift(recent, undefined, oldShift.id), undefined)
  assert.equal(initialReportShift(recent, undefined, ''), undefined)
  assert.equal(initialReportShift([oldShift, ...recent], draft, recent[0].id), undefined)
  assert.equal(initialReportShift(recent)?.id, recent[0].id)
})

test('target links encode identifiers and closing consumes only shiftId', () => {
  assert.equal(reportShiftHref('id/with ?&'), '/reports?shiftId=id%2Fwith%20%3F%26')
  assert.equal(clearReportShiftQuery('/reports', `page=2&shiftId=${oldShift.id}&filter=draft`), '/reports?page=2&filter=draft')
  assert.equal(clearReportShiftQuery('/reports', `shiftId=${oldShift.id}`), '/reports')
})

test('report-specific attention and recovery links preserve their known shift', () => {
  assert.equal(deriveReportAttention(draft.id, 'draft', oldShift.date, oldShift.id)[0].href, reportShiftHref(oldShift.id))
  const issue = getReportIssues([draft], [oldShift]).find(issue => issue.issue_code === 'incomplete_report')!
  assert.equal(issue.action_url, reportShiftHref(oldShift.id))
  assert.equal(recoveryActionFor(issue).url, reportShiftHref(oldShift.id))
})

test('desktop/mobile Calendar and report page wire exact targets without an eager all-shift fetch', () => {
  const calendar = readFileSync(new URL('../components/features/calendar/DaySessionsDialog.tsx', import.meta.url), 'utf8')
  const list = readFileSync(new URL('../components/features/reports/ReportsList.tsx', import.meta.url), 'utf8')
  const form = readFileSync(new URL('../components/features/reports/ReportFormModal.tsx', import.meta.url), 'utf8')
  assert.equal(calendar.match(/router\.push\(reportShiftHref\(shift\.id\)\)/g)?.length, 2)
  assert.doesNotMatch(calendar, /location\.assign\('\/reports'\)/)
  assert.match(list, /getReportObligationPage\(\{ page: queuePage, pageSize: queuePageSize/)
  assert.doesNotMatch(list, /shiftService\.getReportCandidates\(30\)/)
  assert.match(list, /getShift: id => shiftService\.getById\(id\)/)
  assert.match(list, /getReport: id => reportService\.getByShift\(id\)/)
  assert.doesNotMatch(list, /shiftService\.getAll\(|reportService\.getAll\(/)
  assert.match(list, /completedShifts=\{formShifts\}/)
  assert.match(list, /router\.replace\(clearReportShiftQuery/)
  assert.match(list, /handledTarget\.current === deepLinkShiftId/)
  assert.match(list, /targetRequest\.current\.promise/)
  assert.match(form, /initialReportShift\(completedShiftsRef\.current, initialReport, initialShiftId\)/)
  assert.match(form, /disabled=\{explicitShiftId !== undefined\}/)
  assert.match(form, /targetUnavailable && <p role="alert"/)
})

test('Report detail export is fail-closed and respects Member submitter ownership', () => {
  const leader = { id: 'leader', role: 'leader', system_permission: 'leader' } as User
  assert.equal(canExportReportDetail(null, 'member'), false)
  assert.equal(canExportReportDetail(undefined, undefined), false)
  assert.equal(canExportReportDetail(member, undefined), false)
  assert.equal(canExportReportDetail(member, null), false)
  assert.equal(canExportReportDetail(member, 'other-member'), false)
  assert.equal(canExportReportDetail(member, member.id), true)
  assert.equal(canExportReportDetail(leader, 'other-member'), true)
  assert.equal(canExportReportDetail(admin, 'other-member'), true)
})

test('Report detail modal delegates Excel visibility to centralized export authorization', () => {
  const source = readFileSync(new URL('../components/features/reports/ReportDetailModal.tsx', import.meta.url), 'utf8')
  assert.match(source, /const canExport = canExportReportDetail\(currentUser, report\.submitted_by\)/)
  assert.doesNotMatch(source, /const canExport = !currentUser/)
  assert.doesNotMatch(source, /hasPermission\(currentUser, 'reports\.submit'\).*report\.submitted_by/)
})

const rc19ReportSecurityMigration = readFileSync(
  new URL('../supabase/migrations/20261023093000_rc19_p0_report_read_ownership_and_revisions.sql', import.meta.url), 'utf8',
)

test('RC19 #84 direct report scope is constrained by assignment, ownership and role', () => {
  const sql = rc19ReportSecurityMigration
  assert.match(sql, /create or replace function private\.can_read_report\(p_report_id text\)/i)
  assert.match(sql, /security definer[\s\S]*?set search_path = ''/i)
  assert.match(sql, /current_business_user_is_active\(\)/i)
  assert.match(sql, /actor_role = 'admin'/i)
  assert.match(sql, /actor_role = 'leader'/i)
  assert.match(sql, /coalesce\(report\.submitted_by = actor_id, false\)/i)
  assert.match(sql, /actor_id in \(shift\.host_id, shift\.support_id, shift\.technical_id\)/i)
  assert.match(sql, /assignment\.status in \('approved', 'manually_assigned'\)/i)
  assert.doesNotMatch(sql, /assignment\.status in \([^)]*'pending'/i)
  assert.match(sql, /create policy reports_active_select[\s\S]*?private\.can_read_report\(id\)/i)
  assert.match(sql, /create policy reports_archived_select[\s\S]*?= 'admin'[\s\S]*?private\.can_read_report\(id\)/i)
})

test('RC19 #84 revision SECURITY DEFINER independently checks report ownership', () => {
  const sql = rc19ReportSecurityMigration
  assert.match(sql, /create or replace function public\.get_report_revisions\(p_report_id text\)/i)
  assert.match(sql, /security definer[\s\S]*?set search_path = ''/i)
  assert.match(sql, /if not private\.can_read_report\(p_report_id\) then/i)
  assert.match(sql, /message = 'REPORT_NOT_FOUND'/i)
  assert.match(sql, /revoke all on function public\.get_report_revisions\(text\) from public, anon, authenticated, service_role/i)
  assert.match(sql, /grant execute on function public\.get_report_revisions\(text\) to authenticated/i)
  assert.doesNotMatch(sql, /delete from|truncate|drop table|drop column/i)
})


test('RC19 #84 follow-up: revision RPC invokes table RLS rather than bypassing as definer', () => {
  const sql = readFileSync(
    new URL('../supabase/migrations/20261023102000_rc19_p0_report_revision_rpc_invoker.sql', import.meta.url), 'utf8',
  )
  assert.match(sql, /alter function public\.get_report_revisions\(text\) security invoker/i)
  assert.match(sql, /revoke all on function public\.get_report_revisions\(text\) from public, anon, authenticated, service_role/i)
  assert.match(sql, /grant execute on function public\.get_report_revisions\(text\) to authenticated/i)
  assert.doesNotMatch(sql, /create table|drop policy|truncate|update public\.reports|delete from/i)
})


test('RC19 #84 invoker RPC resolves authenticated actor without privileged helper grant', () => {
  const sql = readFileSync(
    new URL('../supabase/migrations/20261023103500_rc19_p0_report_revision_invoker_identity_fix.sql', import.meta.url), 'utf8',
  )
  assert.match(sql, /create or replace function public\.get_report_revisions\(p_report_id text\)/i)
  assert.match(sql, /security invoker[\s\S]*?set search_path = ''/i)
  assert.match(sql, /actor_id := private\.current_business_user_id\(\)/i)
  assert.match(sql, /not private\.current_business_user_is_active\(\)/i)
  assert.match(sql, /if not private\.can_read_report\(p_report_id\) then/i)
  assert.match(sql, /message = 'REPORT_NOT_FOUND'/i)
  assert.match(sql, /revoke all on function public\.get_report_revisions\(text\) from public, anon, authenticated, service_role/i)
  assert.match(sql, /grant execute on function public\.get_report_revisions\(text\) to authenticated/i)
  assert.doesNotMatch(sql, /private\.require_report_actor\(false\)/i)
  assert.doesNotMatch(sql, /grant execute on function private\.require_report_actor/i)
  assert.doesNotMatch(sql, /update public\.|delete from public\.|truncate|drop table/i)
})


test('RC19 #77 historical report shift context is authorization-gated and minimal', () => {
  const sql = readFileSync(
    new URL('../supabase/migrations/20261023112000_rc19_report_authorized_shift_display_context.sql', import.meta.url), 'utf8',
  )
  assert.match(sql, /create or replace function private\.report_shift_display_context\(p_report_id text\)/i)
  assert.match(sql, /language plpgsql[\s\S]*?stable[\s\S]*?security definer[\s\S]*?set search_path = ''/i)
  assert.match(sql, /not private\.current_business_user_is_active\(\)/i)
  assert.match(sql, /not private\.can_read_report\(p_report_id\)/i)
  assert.match(sql, /where report\.id = p_report_id/i)
  const keys = [...sql.matchAll(/'([a-z_]+)', shift\.[a-z_]+/g)].map(match => match[1])
  assert.deepEqual(keys, ['date', 'start_time', 'end_time', 'brand_id', 'platform_id', 'campaign_id'])
  assert.doesNotMatch(sql, /'host_id'|'support_id'|'technical_id'|'studio'|'product_notes'|'recording_url'/i)
  assert.match(sql, /revoke all on function private\.report_shift_display_context\(text\)[\s\S]*?from public, anon, authenticated, service_role/i)
  assert.match(sql, /grant execute on function private\.report_shift_display_context\(text\)[\s\S]*?to authenticated/i)
  assert.doesNotMatch(sql, /create policy|alter policy|alter table public\.shifts|delete from|truncate|drop table/i)
})


test('RC19 #77 new paginated Reports RPC is RLS invoker, validates before lazy CTEs and cannot widen Shift',()=>{
  const initial=readFileSync(new URL('../supabase/migrations/20261023153500_rc19_reports_historical_pagination_v2.sql',import.meta.url),'utf8')
  const guard=readFileSync(new URL('../supabase/migrations/20261023155000_rc19_reports_history_validate_filters_v2.sql',import.meta.url),'utf8')
  assert.match(initial,/create or replace function public\.get_report_list_with_history/i)
  assert.match(initial,/security invoker/i)
  assert.match(initial,/from public\.reports r/i)
  assert.match(initial,/private\.report_shift_display_context\(r\.id\)/i)
  assert.match(initial,/historicalShiftContexts/i)
  assert.match(initial,/private\.can_read_report\(p_report_id\)/i)
  assert.match(initial,/revoke all on function public\.get_report_list_with_history\(integer,integer,jsonb\)/i)
  assert.doesNotMatch(initial,/create policy|alter policy|alter table public\.shifts|grant select on public\.shifts|truncate public\./i)
  assert.match(guard,/RC19_HISTORY_VALIDATE_ALL_FILTERS/)
  assert.match(guard,/perform 1 from private\.filtered_shift_ids\('all'/i)
  assert.match(guard,/LIST_FILTER_INVALID/)
  assert.doesNotMatch(guard,/security definer/i)
})

test('Reports history is listed read-only without fabricated shifts; XLSX includes six-field context',async()=>{
  const api=readFileSync(new URL('../lib/server/operationsCollectionHandler.ts',import.meta.url),'utf8')
  const frontend=readFileSync(new URL('../components/features/reports/ReportsList.tsx',import.meta.url),'utf8')
  const paging=readFileSync(new URL('../lib/services/operationsPageService.ts',import.meta.url),'utf8')
  const exportService=readFileSync(new URL('../lib/services/dataService.ts',import.meta.url),'utf8')
  const exportUtils=readFileSync(new URL('../lib/utils/excelUtils.ts',import.meta.url),'utf8')
  assert.match(api,/entity === 'reports'[\s\S]*?get_report_list_with_history/)
  assert.match(api,/historicalShiftContexts/)
  assert.match(frontend,/data-testid="report-historical-read-only"/)
  assert.match(frontend,/data-testid="historical-report-detail-read-only"/)
  assert.match(frontend,/Lịch sử · Chỉ xem/)
  assert.match(frontend,/getAllFilteredWithHistoricalContext/)
  assert.match(paging,/REPORT_HISTORY_RESPONSE_INVALID/)
  assert.match(exportService,/getAllFilteredWithHistoricalContext/)
  assert.match(exportUtils,/historicalShiftContexts\?: Record/)
  assert.doesNotMatch(frontend,/if \(!shift\) return null/)
  const {buildReportExportRows}=await import('../lib/utils/excelUtils.ts')
  const rows=buildReportExportRows([{
    ...draft,id:'history-only',shift_id:'hidden-shift',status:'confirmed',
    metrics_confirmed:true,orders:3,
  }],{
    shifts:[],campaigns:[],users:[],brands:new Map([['brand-a','Brand A']]),
    platforms:new Map([['tt','TikTok']]),
    historicalShiftContexts:{'history-only':{
      date:'2026-10-23',start_time:'23:45:00',end_time:'01:45:00',
      brand_id:'brand-a',platform_id:'tt',campaign_id:null,
    }},
  })
  assert.equal(rows.length,1)
  assert.equal(rows[0]['Report ID'],'history-only')
  assert.equal(rows[0]['Start Date'],'2026-10-23')
  assert.equal(rows[0]['End Date'],'2026-10-24')
  assert.equal(rows[0]['Brand'],'Brand A')
  assert.equal(rows[0]['Platform'],'TikTok')
  assert.equal(rows[0]['Host'],'')
  assert.equal(rows[0]['Support'],'')
  assert.equal(rows[0]['Technical'],'')
})


test('RC19 #77 hidden historical Shift staffing cannot be inferred by ID probe filters',()=>{
  const privacy=readFileSync(new URL('../supabase/migrations/20261023160500_rc19_reports_history_staff_filter_privacy.sql',import.meta.url),'utf8')
  assert.match(privacy,/create or replace function private\.report_historical_staff_filters_match/i)
  assert.match(privacy,/private\.can_read_report\(p_report_id\)/)
  assert.match(privacy,/jsonb_array_length\(coalesce\(p_filters->'hostIds'/)
  assert.match(privacy,/jsonb_array_length\(coalesce\(p_filters->'supportIds'/)
  assert.match(privacy,/jsonb_array_length\(coalesce\(p_filters->'technicalIds'/)
  assert.doesNotMatch(privacy,/from public\.shifts|from public\.shift_registrations|host_id in|support_id in|technical_id in/i)
  assert.doesNotMatch(privacy,/grant select on public\.shifts|alter policy|create policy/i)
})


test('RC19 P0 Reports direct-table security gate matches revision RPC and report-specific Member scope',()=>{
  const sql=readFileSync(new URL('../supabase/migrations/20261023093000_rc19_p0_report_read_ownership_and_revisions.sql',import.meta.url),'utf8')
  const segment=sql.slice(sql.indexOf('create or replace function private.can_read_report'))
  assert.match(segment,/security definer/i)
  assert.match(segment,/set search_path = ''/)
  assert.match(segment,/actor_role = 'member'/)
  assert.match(segment,/report\.submitted_by = actor_id/)
  assert.match(segment,/actor_id in \(shift\.host_id, shift\.support_id, shift\.technical_id\)/)
  assert.match(segment,/assignment\.status in \('approved', 'manually_assigned'\)/)
  assert.doesNotMatch(segment,/assignment\.status in \('pending'/)
  assert.match(sql,/create policy reports_active_select[\s\S]*?private\.can_read_report\(id\)/i)
  assert.match(sql,/create policy reports_archived_select[\s\S]*?private\.can_read_report\(id\)/i)
  const rpc=sql.slice(sql.indexOf('create or replace function public.get_report_revisions'))
  assert.match(rpc,/security definer/i)
  assert.match(rpc,/if not private\.can_read_report\(p_report_id\) then/i)
  assert.match(rpc,/REPORT_NOT_FOUND/)
  assert.match(sql,/grant execute on function public\.get_report_revisions\(text\) to authenticated/i)
  assert.doesNotMatch(sql,/grant execute on function public\.get_report_revisions\(text\) to anon/i)
  assert.doesNotMatch(sql,/alter table public\.reports disable row level security|grant select on public\.reports to anon/i)
})

test('RC19 #84 orphan live-image read policy fails closed without a linked report', () => {
  const sql = readFileSync(
    new URL('../supabase/migrations/20261024003000_rc19_p0_orphan_live_image_read_rls.sql', import.meta.url), 'utf8',
  )
  assert.match(sql, /create policy live_report_images_read[\s\S]*?for select to authenticated/i)
  assert.match(sql, /\(select private\.current_business_user_is_active\(\)\)/i)
  assert.match(sql, /and report_id is not null/i)
  assert.match(sql, /from public\.reports report[\s\S]*?report\.id = live_report_images\.report_id/i)
  assert.match(sql, /report\.deleted_at is null and report\.archived_at is null/i)
  assert.match(sql, /private\.current_system_permission\(\)\) = 'admin'/i)
  assert.doesNotMatch(sql, /report_id is null\) or|or \(report_id is null\)/i)
  assert.doesNotMatch(sql, /grant select on public\.reports|delete from public\.|truncate public\./i)
})
