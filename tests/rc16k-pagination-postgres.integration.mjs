import assert from 'node:assert/strict'
import { execFileSync, spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { assertIsolatedContainer, assertIsolatedCI } from './rc16-rehearsal-safety.mjs'

const container = process.argv[2] === '--container' ? process.argv[3] : null
const reportsOnly = process.argv.at(-1) === '--reports-only'
const major = process.env.RC16_PG_MAJOR ?? '17'
assert.ok(['16', '17'].includes(major))
if (container) {
  assert.equal(process.argv.length, reportsOnly ? 5 : 4)
  assert.match(container, /^rc16f-pg(?:16|17)-[a-z0-9-]{1,40}$/)
  assertIsolatedContainer(JSON.parse(execFileSync('docker', ['inspect', container], { encoding: 'utf8' }))[0], major)
} else { assert.equal(process.argv.length, reportsOnly ? 3 : 2); assertIsolatedCI(process.env) }
const read = path => readFileSync(path, 'utf8')
const foundation = read('supabase/migrations/20260814085659_p1c_shift_persistence.sql')
function extract(pattern) { const match = foundation.match(pattern); assert.ok(match); return match[0] }
const policies = foundation.slice(foundation.indexOf('create or replace function private.can_read_shift'), foundation.indexOf('create or replace function private.require_shift_actor'))
const privacy = read('supabase/migrations/20261008160638_member_registration_directory_privacy.sql')
const registrationPolicy = privacy.slice(0, privacy.indexOf('alter policy business_users'))
const summary = privacy.slice(privacy.indexOf('create or replace function public.get_shift_staffing_summary'), privacy.indexOf('create or replace function public.get_shift_staffing_summary') + privacy.slice(privacy.indexOf('create or replace function public.get_shift_staffing_summary')).indexOf('grant execute on function public.get_shift_staffing_summary(text[]) to authenticated;') + 'grant execute on function public.get_shift_staffing_summary(text[]) to authenticated;'.length)
const table = (path, name) => {
  const source=read(path)
  const match=source.match(new RegExp('create table (?:if not exists )?public\\.'+name+' \\([\\s\\S]*?\\n\\);','i'))
  assert.ok(match,'Missing actual DDL '+name);return match[0]
}
const reportSource='supabase/migrations/20260823000000_p3_report_persistence.sql'
const auditSource='supabase/migrations/20260830113000_core_v1_persistent_audit.sql'
const swapPolicy=read('supabase/migrations/20260826172730_shift_swap_two_flow_semantics.sql').match(/create policy swap_requests_select[\s\S]*?\n\);/)[0]
const setup = [
  "begin;",
  "do $$ begin if (select count(*) from information_schema.tables where table_schema='public')<>0 then raise exception 'Requires empty isolated fixture'; end if; end $$;",
  "create role anon; create role authenticated; create role service_role bypassrls; create schema private;",
  "create table public.business_users(id text primary key,system_permission text,status text default 'active',full_name text,email text,avatar_url text); insert into public.business_users(id,system_permission) values('admin','admin'),('leader','leader'),('member','member'),('other','member');",
  "create table public.brands(id text primary key,name text); create table public.platforms(id text primary key,name text); create table public.campaigns(id text primary key,name text); insert into public.brands values('b','Primary'),('large','Large'); insert into public.platforms values('p','Platform');",
  "alter table public.brands add column deleted_at timestamptz,add column archived_at timestamptz,add column deleted_by text,add column archived_by text,add column deletion_reason text; alter table public.platforms add column deleted_at timestamptz,add column archived_at timestamptz,add column deleted_by text,add column archived_by text,add column deletion_reason text; alter table public.campaigns add column deleted_at timestamptz,add column archived_at timestamptz,add column deleted_by text,add column archived_by text,add column deletion_reason text; alter table public.business_users add column deleted_at timestamptz,add column archived_at timestamptz,add column deleted_by text,add column archived_by text,add column deletion_reason text;",
  "create function private.current_business_user_id() returns text language sql stable as $$ select current_setting('rc16k.actor',true) $$;",
  "create function private.current_system_permission() returns text language sql stable security definer set search_path='' as $$ select system_permission from public.business_users where id=private.current_business_user_id() $$;",
  "create function private.current_business_user_is_active() returns boolean language sql stable as $$ select private.current_business_user_id() is not null $$; grant usage on schema private to authenticated;",
  extract(/create table public\.shifts \([\s\S]*?\n\);/),
  extract(/create table public\.shift_registrations \([\s\S]*?\n\);/),
  "alter table public.shifts add column host_names text[] default '{}', add column assistant_names text[] default '{}', add column technical_names text[] default '{}', add column execution_source text, add column status_mode text default 'manual', add column version int default 1; alter table public.shift_registrations add column imported_name text;",
  "create function private.is_leader_or_admin() returns boolean language sql stable as $$ select private.current_system_permission() in ('leader','admin') $$;",
  "create index shift_registrations_capacity_idx on public.shift_registrations(shift_id,operational_role,status); create index shift_registrations_user_schedule_idx on public.shift_registrations(user_id,status,shift_id);",
  policies, registrationPolicy,
  "grant select on public.brands,public.platforms,public.campaigns to authenticated;",
  "insert into public.shifts(id,date,start_time,end_time,start_at,end_at,end_date,crosses_midnight,duration_minutes,brand_id,platform_id,registration_cutoff_at,title,studio) select lpad(n::text,4,'0'),'2099-01-01','10:00','11:00','2099-01-01 10:00+07','2099-01-01 11:00+07','2099-01-01',false,60,case when n<=117 then 'b' else 'large' end,'p','2099-01-01 10:00+07',case when n=1 then 'literal_%' else 'Event '||n end,'Studio A' from generate_series(1,1000) n;",
  "insert into public.shifts(id,date,start_time,end_time,start_at,end_at,end_date,crosses_midnight,duration_minutes,brand_id,platform_id,registration_cutoff_at,status,title) values('secret','2099-01-01','10:00','11:00','2099-01-01 10:00+07','2099-01-01 11:00+07','2099-01-01',false,60,'b','p','2099-01-01 10:00+07','completed','Restricted Shift');",
  "insert into public.shift_registrations(id,shift_id,user_id,operational_role,status,source) values('own-1','0001','member','host','pending','self_registration'),('own-2','0001','member','support','approved','self_registration'),('own-3','0002','member','host','pending','self_registration');",
  "insert into public.shift_registrations(id,shift_id,user_id,operational_role,status,source) values('cancelled-1','0003','other','support','cancelled','self_registration');",
  "insert into public.business_users(id,system_permission) select 'other-'||n,'member' from generate_series(1,117) n; insert into public.shift_registrations(id,shift_id,user_id,operational_role,status,source) select 'pending-'||n,'0001','other-'||n,'host','pending','self_registration' from generate_series(1,117) n;",
  "grant select on public.business_users to authenticated;",
  table(reportSource,'reports'),table(reportSource,'report_revisions'),table(auditSource,'audit_logs'),table(auditSource,'audit_log_reviews'),
  ...JSON.parse(read('docs/release/rc16k-uxw2-production-schema-snapshot.json')).indexes
    .filter(index => ['reports_shift_id_idx','reports_submitted_by_idx'].includes(index.indexname)).map(index => index.indexdef + ';'),
  table('supabase/migrations/20260905191836_live_dashboard_update_persistence.sql','dashboard_updates'),
  table('supabase/migrations/20260826082036_shift_swap_production.sql','swap_requests'),
  "alter table public.reports enable row level security; grant select on public.reports to authenticated; "+read('supabase/migrations/20260903110000_f10_report_active_business_user_rls.sql').slice(read('supabase/migrations/20260903110000_f10_report_active_business_user_rls.sql').indexOf('drop policy if exists reports_active_select'),read('supabase/migrations/20260903110000_f10_report_active_business_user_rls.sql').indexOf('drop policy if exists report_revisions_read')),
  "alter table public.dashboard_updates enable row level security; grant select on public.dashboard_updates to authenticated; create policy dashboard_updates_scoped_read on public.dashboard_updates for select to authenticated using ((select private.can_read_shift(shift_id)));",
  "alter table public.swap_requests enable row level security; grant select on public.swap_requests to authenticated;",swapPolicy,
  "create function public.get_staff_directory() returns table(id text,full_name text) language sql stable as $$ select id,full_name from public.business_users where status='active' $$;",
  "alter table public.audit_logs enable row level security; grant select on public.audit_logs to authenticated;",read('supabase/migrations/20260830114000_core_v1_persistent_audit_read_permission.sql'),
  // Snapshot fixture deliberately minimal; real payroll schema/invariants are tested by the RC16 suite.
  "create table public.workforce_payroll_periods(id text primary key,status text); create table public.workforce_payroll_lines(id text primary key,period_id text,created_at timestamptz default now(),net_vnd bigint); create table public.workforce_payroll_audit(id bigserial primary key,period_id text,created_at timestamptz default now());",
  "grant select on public.workforce_payroll_periods,public.workforce_payroll_lines to service_role; grant all on public.workforce_payroll_audit,public.report_revisions,public.audit_logs,public.audit_log_reviews to service_role; grant usage,select on sequence public.workforce_payroll_audit_id_seq to service_role;",
  read('supabase/migrations/20261012145735_p0_audit_privilege_hardening.sql'),
  "set local statement_timeout='150s';",
  "insert into public.reports(id,shift_id,raw_ocr_output) select 'report-'||id,id,'private OCR' from public.shifts where brand_id='b'; update public.reports set status='confirmed',metrics_confirmed=true,normalized_metrics='{\"revenue\":100,\"orders\":2}' where id in ('report-0001','report-0002');",
  "insert into public.audit_logs(id,actor_business_user_id,actor_name,module,action,entity_type,entity_id,entity_name) select 'audit-'||n,'admin','Admin','calendar','update','shift','0001','Fixture' from generate_series(1,117)n; insert into public.audit_logs(actor_business_user_id,module,action,entity_type,entity_id,entity_name) values('other','staff','update','staff','other','Restricted');",
  "insert into public.swap_requests(id,requester_id,source_registration_id,source_shift_id,shift_id,operational_role,mode,status,reason,replacement_staff_id) values('swap-own','member','own-2','0001','0001','support','replacement','pending','Own fixture','other'),('swap-restricted','other','own-2','0001','0001','support','replacement','pending','Restricted fixture','admin');",
  "insert into public.workforce_payroll_periods values('period','locked'); insert into public.workforce_payroll_lines(id,period_id,net_vnd) select 'line-'||n,'period',100000 from generate_series(1,1001)n; insert into public.workforce_payroll_audit(period_id) select 'period' from generate_series(1,1001)n;",
  summary,
  read('supabase/migrations/20261012171503_rc16k_bounded_shift_lists.sql'),
  "analyze public.shifts; analyze public.shift_registrations; analyze public.reports;",
  "create function public.k_assert(value boolean,label text) returns void language plpgsql as $$ begin if value is distinct from true then raise exception 'RC16K_FAILED: %',label; end if; raise notice 'RC16K_PASS: %',label; end $$;",
]
const baselineChecks = [
  "set role authenticated; select set_config('rc16k.actor','member',true);",
  "select public.k_assert((public.get_shift_list_page('open',1,10,'{\"brandIds\":[\"b\"]}')->>'total')::int=117,'117 open rows');",
  "select public.k_assert(jsonb_array_length(public.get_shift_list_page('open',12,10,'{\"brandIds\":[\"b\"]}')->'rows')=7,'partial last page');",
  "select public.k_assert(public.get_shift_list_page('open',999,10,'{\"brandIds\":[\"b\"]}')->>'page'='12','mutation clamp');",
  "select public.k_assert(public.get_shift_list_page('all',1,20)->>'total'='1000','member excludes inaccessible shift');",
  "select public.k_assert(public.get_shift_list_page('mine',1,20)->>'total'='2','mine unique shift projection');",
  "select public.k_assert(public.get_shift_list_page('mine',1,20,'{\"roles\":[\"support\"]}')->>'total'='1','role filter before paging');",
  "select public.k_assert(public.get_shift_list_page('all',1,20,'{\"search\":\"_%\"}')->>'total'='1','literal wildcard search');",
  "select public.k_assert(public.get_shift_list_page('all',1,20,'{\"from\":\"2100-01-01\"}')->>'total'='0','empty filtered collection');",
  "select public.k_assert((public.get_shift_list_page('open',1,10)->'rows'->0->>'registration_conflict')::boolean,'off-page own conflict');",
  "select public.k_assert(not exists(select 1 from jsonb_array_elements(public.get_shift_list_page('open',1,50)->'registrations') r where r->>'user_id'<>'member'),'member cannot read other applicants');",
  "do $$ declare size int; result jsonb; seen text[]; p int; row jsonb; begin foreach size in array array[10,20,50] loop seen:='{}'; for p in 1..ceil(1000.0/size)::int loop result:=public.get_shift_list_page('open',p,size); if jsonb_array_length(result->'rows')>size then raise exception 'Page overflow'; end if; for row in select value from jsonb_array_elements(result->'rows') loop if row->>'id'=any(seen) then raise exception 'Duplicate page ID'; end if; seen:=array_append(seen,row->>'id'); end loop; end loop; perform public.k_assert(cardinality(seen)=1000,'1000 complete stable rows at '||size); end loop; begin perform public.get_shift_list_page('all',1,1000); exception when invalid_parameter_value then raise notice 'RC16K_PASS: server size cap'; return; end; raise exception 'Expected bounded size denial'; end $$;",
  "select set_config('rc16k.actor','leader',true);",
  "select public.k_assert(public.get_shift_list_page('all',1,20)->>'total'='1001','leader can read team scope');",
  "select public.k_assert(public.get_shift_list_page('open',1,10)->>'pendingTotal'='119','authoritative pending count');",
  "select public.k_assert(jsonb_array_length(public.get_shift_list_page('open',1,10)->'pendingIds')=20,'pending rows bounded separately');",
  "select public.k_assert((public.get_shift_list_page('open',1,10,'{}',2)->'pendingIds'->>0)<>(public.get_shift_list_page('open',1,10,'{}',1)->'pendingIds'->>0),'pending pagination no duplicate');",
  "select set_config('rc16k.actor','admin',true); select public.k_assert(public.get_shift_list_page('all',1,20)->>'total'='1001','admin scope');",
  "select public.k_assert(public.get_shift_list_page('all',1,20,'{\"supportIds\":[\"member\"]}')->>'total'='1','assigned role filter before paging');",
  "select public.k_assert(public.get_shift_list_page('all',1,20,'{\"assignedUserIds\":[\"member\"]}')->>'total'='1','staff detail filters before paging');",
  "select public.k_assert(public.get_shift_list_page('all',1,20,'{\"staffingStates\":[\"missing_staff\"]}')->>'total'='1001','authoritative capacity filtering');",
  "select public.k_assert((select shift_count from public.get_staff_workload(array['member']) where role='support')=1,'workload counts one shift per role');",
  "select set_config('rc16k.actor','member',true); do $$ begin begin perform public.get_staff_workload(array['other']); exception when insufficient_privilege then raise notice 'RC16K_PASS: Member cannot request another staff workload'; return; end; raise exception 'Expected workload denial'; end $$;",
  "select public.k_assert(public.get_report_list_page(1,10,'{\"brandIds\":[\"b\"]}')->>'total'='117','reports inaccessible shift excluded before count');",
  "select public.k_assert(public.get_report_list_page(1,10,'{\"from\":\"2099-01-01\",\"to\":\"2099-01-01\",\"reportStatuses\":[\"confirmed\"],\"metricsStatuses\":[\"confirmed\"]}',true)->>'total'='2','analytics detail server page'); select public.k_assert(public.get_analytics_snapshot('{\"from\":\"2099-01-01\",\"to\":\"2099-01-01\"}')->'totals'->>'reportCount'='2','analytics complete server count'); select public.k_assert(public.get_analytics_snapshot('{\"from\":\"2099-01-01\",\"to\":\"2099-01-01\"}')->'totals'->>'revenue'='200','analytics normalized revenue'); select public.k_assert((public.get_analytics_snapshot('{\"from\":\"2099-01-01\",\"to\":\"2099-01-01\"}')->'totals'->>'averageOrderValue')::numeric=50,'analytics paired average order value');",
  "select set_config('rc16k.actor','leader',true); select public.k_assert(public.get_registration_review_page(1,10)->>'total'='121','registration queue complete count'); select public.k_assert(jsonb_array_length(public.get_registration_review_page(13,10)->'rows')=1,'registration partial last page'); select public.k_assert(public.get_registration_review_page(999,10)->>'page'='13','registration page clamp'); select public.k_assert(public.get_registration_review_page(1,10,'{\"statuses\":[\"pending\"]}')->>'total'='119','registration status before paging'); select public.k_assert(public.get_registration_review_page(1,10,'{\"roles\":[\"support\"]}')->>'total'='2','registration role before paging'); select public.k_assert((public.get_registration_review_page(1,10)->'counts'->>'approved')::int=1,'registration counts preserve approved'); select public.k_assert(jsonb_array_length(public.get_registration_review_context('own-1')->'registrations')=1,'registration detail weekly context'); select public.k_assert(public.get_analytics_snapshot('{\"from\":\"2099-01-01\",\"to\":\"2099-01-01\"}')->'totals'->>'reportCount'='2','Leader analytics scoped aggregate');",
  "select set_config('rc16k.actor','admin',true); select public.k_assert(public.get_registration_review_page(1,10)->>'total'='121','Admin registration review scope'); select public.k_assert(public.get_analytics_snapshot('{\"from\":\"2099-01-01\",\"to\":\"2099-01-01\"}')->'totals'->>'reportCount'='2','Admin analytics scoped aggregate');",
  "select set_config('rc16k.actor','member',true); do $$ begin begin perform public.get_registration_review_page(); exception when insufficient_privilege then raise notice 'RC16K_PASS: Member registration review denied'; return; end; raise exception 'Expected registration review denial'; end $$; do $$ begin begin perform public.get_registration_review_context('own-1'); exception when insufficient_privilege then raise notice 'RC16K_PASS: Member registration detail denied'; return; end; raise exception 'Expected registration detail denial'; end $$;",
  "select public.k_assert(jsonb_array_length(public.get_report_list_page(12,10,'{\"brandIds\":[\"b\"]}')->'rows')=7,'report partial page');",
  "select public.k_assert(not (public.get_report_list_page(1,10,'{}',true)->'rows'->0 ? 'raw_ocr_output'),'analytics projection excludes OCR payload');",
  "select public.k_assert(public.get_swap_list_page()->>'total'='1','Member cannot read other swap');",
  "do $$ begin begin perform public.get_schedule_change_page(); exception when insufficient_privilege then raise notice 'RC16K_PASS: Member history denied'; return; end; raise exception 'Expected history denial'; end $$;",
  "do $$ begin begin perform public.get_audit_actor_page(); exception when insufficient_privilege then raise notice 'RC16K_PASS: Member actors denied'; return; end; raise exception 'Expected actor denial'; end $$;",
  "do $$ begin begin perform public.get_payroll_period_snapshot('period'); exception when insufficient_privilege then raise notice 'RC16K_PASS: authenticated salary snapshot denied'; return; end; raise exception 'Expected payroll denial'; end $$;",
  "select set_config('rc16k.actor','leader',true); select public.k_assert(public.get_schedule_change_page()->>'total'='117','Leader scoped history count'); select public.k_assert(jsonb_array_length(public.get_schedule_change_page(6,20)->'items')=17,'history final page'); select public.k_assert(public.get_audit_actor_page()->>'total'='1','Leader actor directory excludes staff Audit'); select public.k_assert(public.get_swap_list_page()->>'total'='2','Leader swap scope');",
  "reset role; update public.shifts set status='live' where id='1000'; insert into public.dashboard_updates(id,shift_id,time,current_viewers) values('update-old','1000','2099-01-01 10:00Z',1),('update-new','1000','2099-01-01 10:01Z',2); set role authenticated; select set_config('rc16k.actor','leader',true); select public.k_assert(public.get_shift_list_page('all',1,10,'{}',1,true)->'rows'->0->>'id'='1000','Live priority before pagination'); select public.k_assert(public.get_shift_list_page('all',1,10,'{}',1,true)->'updates'->0->>'id'='update-new','one latest update per shift');",
  "select public.k_assert(public.get_live_update_page('1000',1,10)->>'total'='2','Live history full count'); select public.k_assert(public.get_live_update_page('1000',99,10)->>'page'='1','Live history clamp'); select public.k_assert(public.get_live_update_page('1000',1,10)->'recent'->0->>'id'='update-new','Live summary remains global on history pages');",
  "select set_config('rc16k.actor','member',true); do $$ begin begin perform public.get_live_update_page('secret',1,10); exception when insufficient_privilege then raise notice 'RC16K_PASS: Member restricted Live history denied'; return; end; raise exception 'Expected Live denial'; end $$;",
  "reset role; insert into public.dashboard_updates(id,shift_id,time,peak_viewers) select 'history-'||n,'1000','2098-01-01'::timestamptz+n*interval '1 minute',n from generate_series(1,117)n; set role authenticated; select set_config('rc16k.actor','leader',true); select public.k_assert(jsonb_array_length(public.get_live_update_page('1000',12,10)->'rows')=9,'119 Live snapshots final partial page'); select public.k_assert(public.get_live_update_page('1000',12,10)->>'peakViewers'='117','Live peak metric covers all pages');",
  "reset role; set role service_role; select public.k_assert(public.get_payroll_period_snapshot('period')->>'lineCount'='1001','full salary snapshot bypasses max_rows'); select public.k_assert(jsonb_array_length(public.get_payroll_period_snapshot('period')->'audit')=1001,'full Audit snapshot'); select public.k_assert(not has_table_privilege('service_role','public.workforce_payroll_audit','UPDATE,DELETE,TRUNCATE'),'P0 Audit ACL remains unchanged');",
  "reset role; insert into public.workforce_payroll_lines(id,period_id,net_vnd) select 'overflow-'||n,'period',100000 from generate_series(1,1999)n; set role service_role; do $$ begin begin perform public.get_payroll_period_snapshot('period'); exception when program_limit_exceeded then raise notice 'RC16K_PASS: incomplete snapshot rejects instead of truncates'; return; end; raise exception 'Expected cap denial'; end $$;",
  "reset role; insert into public.brands(id,name,archived_at) select 'archive-'||n,'Archived '||n,'2099-01-01' from generate_series(1,117)n; set role authenticated; select set_config('rc16k.actor','admin',true); select public.k_assert(public.get_archived_entity_page(1,10)->>'total'='117','archive server complete count'); select public.k_assert(jsonb_array_length(public.get_archived_entity_page(12,10)->'items')=7,'archive partial last page'); select public.k_assert(public.get_archived_entity_page(999,10)->>'page'='12','archive mutation clamp');",
  "select set_config('rc16k.actor','leader',true); do $$ begin begin perform public.get_archived_entity_page(); exception when insufficient_privilege then raise notice 'RC16K_PASS: Leader archive denied'; return; end; raise exception 'Expected archive denial'; end $$;",
  "select set_config('rc16k.actor','unknown',true); do $$ begin begin perform public.get_archived_entity_page(); exception when insufficient_privilege then raise notice 'RC16K_PASS: unknown role fails closed'; return; end; raise exception 'Expected unknown role denial'; end $$;",
  "reset role; set role anon; do $$ begin begin perform public.get_shift_list_page(); exception when insufficient_privilege then raise notice 'RC16K_PASS: anonymous denied'; return; end; raise exception 'Anonymous unexpectedly allowed'; end $$;",
]
const reportsChecks = [
  "reset role; select set_config('rc16k.actor','admin',true);",
  // Reproduce captured Production definitions, then rehearse only the new forward migration.
  ...JSON.parse(read('docs/release/rc16k-uxw2-production-schema-snapshot.json')).functions.map(f => f.definition + ';'),
  "create temporary table reports_acl_before as select oid,proacl,proowner,prosecdef,proconfig from pg_proc where oid in ('private.can_read_shift(text)'::regprocedure,'private.filtered_shift_ids(text,jsonb)'::regprocedure,'public.get_report_list_page(integer,integer,jsonb,boolean)'::regprocedure); create temporary table reports_policies_before as select * from pg_policies;",
  "savepoint reports_forward;",
  read('supabase/migrations/20261014190429_rc16k_reports_forward_reconciliation.sql'),
  "rollback to savepoint reports_forward; select public.k_assert(not (public.get_report_list_page()->'summary' is not null),'migration rollback restores Production RPC');",
  read('supabase/migrations/20261014190429_rc16k_reports_forward_reconciliation.sql'),
  read('supabase/migrations/20261014190429_rc16k_reports_forward_reconciliation.sql'),
  "select public.k_assert(not exists(select 1 from reports_acl_before old join pg_proc p using(oid) where old.proacl is distinct from p.proacl or old.proowner<>p.proowner or old.prosecdef<>p.prosecdef or old.proconfig is distinct from p.proconfig),'forward replay preserves owners ACL search_path and security modes'); select public.k_assert(not exists((select * from reports_policies_before except select * from pg_policies) union all (select * from pg_policies except select * from reports_policies_before)),'forward preserves all RLS policies');",
  read('tests/fixtures/rc16k_reports_permission_assertions.sql'),
  "reset role; rollback;",
]
const sql = [...setup, ...(reportsOnly ? [] : baselineChecks), ...reportsChecks].join('\n')
const child = spawn(container ? 'docker' : 'psql', [...(container ? ['exec','-i',container,'psql'] : []), '-X','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-At'], { stdio: ['pipe','pipe','pipe'], timeout: 180000 })
let output=''
child.stdout.on('data', part => { output += part }); child.stderr.on('data', part => { output += part })
child.stdin.end(sql)
const code = await new Promise((resolve,reject) => { child.on('error',reject); child.on('close',resolve); child.stdin.on('error',reject) })
assert.equal(code,0,output)
console.log('PASS PostgreSQL ' + major + ': ' + (output.match(/RC16K_PASS:/g)?.length ?? 0) + ' bounded pagination/RLS assertions; fixture rolled back')
console.log('Reports filtered RPC fixture EXPLAIN: ' + (output.match(/Execution Time: [\d.]+ ms/)?.[0] ?? 'unavailable'))
