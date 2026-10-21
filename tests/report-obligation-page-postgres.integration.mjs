import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const container = process.env.P0_PG_CONTAINER
const major = Number(process.env.P0_PG_MAJOR)
const migrationPath = path.join(root, 'supabase/migrations/20261021120000_global_report_obligation_page.sql')
const migration = readFileSync(migrationPath, 'utf8')
const sha = createHash('sha256').update(migration).digest('hex').toUpperCase()
assert.equal(sha, process.env.REPORT_QUEUE_MIGRATION_SHA256, 'report queue migration SHA mismatch')
assert.ok(container && [16,17].includes(major), 'disposable PostgreSQL matrix target required')

function psql(database, input, { allowFailure = false, transaction = false } = {}) {
  const args=['exec','-i',container,'psql','-X','-U','postgres','-d',database,'-v','ON_ERROR_STOP=1','-A','-t']
  if(transaction) args.push('--single-transaction')
  const result = spawnSync('docker', args, { input, encoding:'utf8', timeout:30000 })
  if (result.error) throw result.error
  if (!allowFailure) assert.equal(result.status,0,`psql failed (${result.status}): ${result.stderr}`)
  return result
}
function query(sql) { return psql('report_queue',sql).stdout.trim() }
function pageResult(result) {
  const jsonLine=result.stdout.trim().split(/\r?\n/).findLast(line=>line.startsWith('{'))
  assert.ok(jsonLine,'expected one JSON page from PostgreSQL')
  return JSON.parse(jsonLine)
}
function asUser(uuid, sql, allowFailure = false) {
  const result=psql('report_queue',`begin; set local role authenticated; select set_config('request.jwt.claim.sub','${uuid}',true); ${sql}; commit;`,{allowFailure})
  return result
}

psql('postgres','create database report_queue')
psql('report_queue',readFileSync(path.join(root,'tests/fixtures/report_obligation_supabase_base.sql'),'utf8'))
const target=query("select current_database() || '|' || current_user || '|' || current_setting('server_version_num')")
assert.equal(target.split('|')[0],'report_queue')
assert.equal(target.split('|')[1],'postgres')
assert.equal(Math.floor(Number(target.split('|')[2])/10000),major)
const injected=psql('report_queue',`${migration}\nDO $report_queue_failure$ BEGIN RAISE EXCEPTION 'REPORT_QUEUE_INJECTED_FAILURE'; END $report_queue_failure$;`,{allowFailure:true,transaction:true})
assert.notEqual(injected.status,0,'injected PostgreSQL failure must fail the migration transaction')
assert.match(injected.stderr,/REPORT_QUEUE_INJECTED_FAILURE/)
assert.equal(query("select to_regprocedure('public.get_report_obligation_page(integer,integer,jsonb)') is null"),'t','failed transaction must remove function and grants')
psql('report_queue',migration,{transaction:true})
const acl=query("select has_function_privilege('authenticated','public.get_report_obligation_page(integer,integer,jsonb)','EXECUTE')::int || '|' || has_function_privilege('anon','public.get_report_obligation_page(integer,integer,jsonb)','EXECUTE')::int || '|' || (select prosecdef::int from pg_proc where oid='public.get_report_obligation_page(integer,integer,jsonb)'::regprocedure)")
assert.equal(acl,'1|0|0','RPC must remain SECURITY INVOKER and authenticated-only')

const seed=[]
for(let i=1;i<=31;i++) {
  const id=`page-${String(i).padStart(2,'0')}`
  const startAt=new Date(Date.UTC(2026,0,2,0,0)-(i-1)*60_000).toISOString()
  seed.push(`('${id}','2026-01-01','12:00','13:00','${startAt}','completed','page-brand','platform','campaign','Historical ${id}',null,null,null,null,null)`)
}
seed.push(
  "('direct','2026-01-01','12:00','13:00',now(),'completed','other-brand','platform','campaign','Direct assignment','member',null,null,null,null)",
  "('direct-support','2026-01-01','12:00','13:00',now(),'completed','other-brand','platform','campaign','Direct Support',null,'member',null,null,null)",
  "('direct-technical','2026-01-01','12:00','13:00',now(),'completed','other-brand','platform','campaign','Direct Technical',null,null,'member',null,null)",
  "('unrelated','2026-01-01','12:00','13:00',now(),'completed','other-brand','platform','campaign','Unrelated',null,null,null,null,null)",
  "('approved','2026-01-01','12:00','13:00',now(),'completed','other-brand','platform','campaign','Approved registration',null,null,null,null,null)",
  "('manual','2026-01-01','12:00','13:00',now(),'completed','other-brand','platform','campaign','Manual assignment',null,null,null,null,null)",
  "('pending','2026-01-01','12:00','13:00',now(),'completed','other-brand','platform','campaign','Pending only',null,null,null,null,null)",
  "('submitted','2026-01-01','12:00','13:00',now(),'completed','other-brand','platform','campaign','Own submitted report',null,null,null,null,null)",
  "('deleted','2026-01-01','12:00','13:00',now(),'completed','other-brand','platform','campaign','Deleted',null,null,null,now(),null)",
  "('archived','2026-01-01','12:00','13:00',now(),'completed','other-brand','platform','campaign','Archived',null,null,null,null,now())",
  "('finalized','2026-01-01','12:00','13:00',now(),'completed','other-brand','platform','campaign','Finalized',null,null,null,null,null)",
  "('open','2026-01-01','12:00','13:00',now(),'scheduled','other-brand','platform','campaign','Open registration',null,null,null,null,null)"
)
psql('report_queue',`insert into public.shifts(id,date,start_time,end_time,start_at,status,brand_id,platform_id,campaign_id,title,host_id,support_id,technical_id,deleted_at,archived_at) values ${seed.join(',')};
insert into public.shift_registrations values
('approved','member','host','approved'),('manual','member','support','manually_assigned'),('pending','member','technical','pending'),('submitted','member','host','pending'),('open','member','host','pending');
update public.shifts set end_at=now()+interval '1 hour' where id='open';
insert into public.reports(id,shift_id,status,metrics_confirmed,submitted_by) values
('submitted-report','submitted','draft',false,'member'),('final-report','finalized','confirmed',true,'leader');`)

const invoker='select public.get_report_obligation_page(1,20,\'{}\'::jsonb)'
const memberResult=asUser('00000000-0000-0000-0000-000000000001',`select public.get_report_obligation_page(1,20,'{}'::jsonb)`)
assert.equal(memberResult.status,0,memberResult.stderr)
const page=pageResult(memberResult)
const memberIds=page.rows.map(row=>row.shift.id).sort()
assert.deepEqual(memberIds,['approved','direct','direct-support','direct-technical','manual','submitted'].sort(), 'Member queue must include direct roles and approved/manual staffing while omitting pending-only, unrelated, open-registration, and archived/deleted/finalized rows')
assert.equal(page.total,6)

for (const [role,uuid] of [['leader','00000000-0000-0000-0000-000000000002'],['admin','00000000-0000-0000-0000-000000000003']]) {
  const result=asUser(uuid,`select public.get_report_obligation_page(1,20,'{"brandIds":["page-brand"]}'::jsonb)`)
  assert.equal(result.status,0,result.stderr)
  const resultPage=pageResult(result)
  assert.equal(resultPage.total,31,`${role} should see the full 31-shift scoped queue`)
  assert.equal(resultPage.rows.length,20)
  const second=asUser(uuid,`select public.get_report_obligation_page(2,20,'{"brandIds":["page-brand"]}'::jsonb)`)
  const secondPage=pageResult(second)
  assert.equal(secondPage.rows.length,11)
  assert.equal(secondPage.rows.at(-1).shift.id,'page-31','historical last row must be reachable on final page')
  const lifecycle=asUser(uuid,`select public.get_report_obligation_page(1,50,'{}'::jsonb)`)
  const lifecyclePage=pageResult(lifecycle)
  const lifecycleIds=lifecyclePage.rows.map(row=>row.shift.id)
  assert.equal(lifecyclePage.total,36,`${role} queue should retain pending eligible work but omit deleted/archived/finalized shifts`)
  for(const excluded of ['deleted','archived','finalized','open']) assert.ok(!lifecycleIds.includes(excluded),`${role} must not see ${excluded} in report obligations`)
  assert.ok(lifecycleIds.includes('pending'),`${role} retains elevated scope over pending Member registrations`)
}

const filtered=asUser('00000000-0000-0000-0000-000000000003',`select public.get_report_obligation_page(1,20,'{"search":"Historical page-31","reportStatuses":["draft"],"metricsStatuses":["unconfirmed"]}'::jsonb)`)
const filteredPage=pageResult(filtered)
assert.equal(filteredPage.total,1)
assert.equal(filteredPage.rows[0].shift.id,'page-31')
for(const [uuid,filter] of [
  ['00000000-0000-0000-0000-000000000001','{"reportStatuses":["invalid"]}'],
  ['00000000-0000-0000-0000-000000000004','{}'],
]) {
  const denied=asUser(uuid,`select public.get_report_obligation_page(1,20,'${filter}'::jsonb)`,true)
  assert.notEqual(denied.status,0,'invalid filter and inactive identity must fail closed')
}
const unauthenticated=psql('report_queue',`begin; set local role authenticated; set local request.jwt.claim.sub = ''; select public.get_report_obligation_page(1,20,'{}'::jsonb); commit;`,{allowFailure:true})
assert.notEqual(unauthenticated.status,0,'missing identity must fail closed')
const before=query("select count(*) from public.shifts")
for(const uuid of ['00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000003']) {
  const result=asUser(uuid,invoker)
  assert.equal(result.status,0,result.stderr)
}
assert.equal(query("select count(*) from public.shifts"),before,'page reads must not mutate shift rows')
console.log(`REPORT_OBLIGATION_PAGE=PASS PostgreSQL ${major}; migration sha256=${sha}; member roles, lifecycle, filters, bounded pages verified`)
