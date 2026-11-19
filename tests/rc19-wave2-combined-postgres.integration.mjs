import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { spawn, spawnSync } from 'node:child_process'

const container = process.env.WAVE2_PG_CONTAINER
assert.equal(container, 'ada-wave2-combined-pg17', 'Disposable combined PostgreSQL 17 container required')
const read = path => readFileSync(path, 'utf8')
function psql(sql, expectedFailure = false) {
  const result = spawnSync('docker', [
    'exec', '-i', container, 'psql', '-X', '-U', 'postgres', '-d', 'postgres',
    '-v', 'ON_ERROR_STOP=1', '-q', '-t', '-A',
  ], { input: sql, encoding: 'utf8', timeout: 30000, maxBuffer: 4 * 1024 * 1024 })
  if (result.error) throw result.error
  if (expectedFailure) assert.notEqual(result.status, 0, 'Expected SQL rejection')
  else assert.equal(result.status, 0, `psql failed: ${result.stderr}`)
  return result.stdout.trim() + (expectedFailure ? `\n${result.stderr}` : '')
}
function query(sql) { return psql(sql).split('\n').filter(Boolean).at(-1)?.trim() ?? '' }
function as(user, sql) {
  const uuid = `00000000-0000-4000-8000-${String(user).padStart(12, '0')}`
  return `set role authenticated; set request.jwt.claim.sub='${uuid}'; ${sql}`
}
function sourceFunction(filename, name) {
  const source = read(filename)
  const starts = [
    source.toLowerCase().indexOf(`create or replace function ${name.toLowerCase()}(`),
    source.toLowerCase().indexOf(`create function ${name.toLowerCase()}(`),
  ].filter(index => index >= 0)
  const start = Math.min(...starts)
  assert.ok(Number.isFinite(start), `Missing baseline function ${name}`)
  const end = source.indexOf('$$;', start)
  assert.ok(end >= 0, `Missing body terminator for ${name}`)
  return source.slice(start, end + 3)
}

const registrationMigration = read('supabase/migrations/20261028010000_rc19_reg02_multi_applicant_approval.sql')
const staffingMigration = read('supabase/migrations/20261029120000_rc19_staffing_role_scoped_gap_filter.sql')
const callerMigrationPath = 'supabase/migrations/20261012171503_rc16k_bounded_shift_lists.sql'
const transactional = sql => sql.replace(/^\s*begin\s*;/i, '').replace(/\s*commit\s*;\s*$/i, '')
const regFixture = 'tests/fixtures/rc19_reg02_pg17_base.sql'
const foundation = 'supabase/migrations/20260814085659_p1c_shift_persistence.sql'
const operational = 'supabase/migrations/20260906100000_gl19c_operational_settings_consumers.sql'
const bulk = 'supabase/migrations/20260824120000_bulk_staffing_approval.sql'
const integrity = 'supabase/migrations/20260829130000_core_v1_data_integrity_p1b.sql'

assert.equal(Math.floor(Number(query("select current_setting('server_version_num')")) / 10000), 17)
psql(read(regFixture))

// Extend the Registration fixture with only the columns and read summary required by
// the real Staffing helper. All data and grants remain isolated to this disposable DB.
psql(`
do $$ begin create role service_role nologin; exception when duplicate_object then null; end $$;
alter table public.shifts
  add column date date not null default date '2031-01-01',
  add column start_time time not null default time '09:00',
  add column end_time time not null default time '10:00',
  add column timezone text not null default 'Asia/Ho_Chi_Minh',
  add column brand_id text,
  add column platform_id text,
  add column campaign_id text,
  add column studio text,
  add column title text not null default '',
  add column product_notes text,
  add column host_id text,
  add column support_id text,
  add column technical_id text,
  add column visible_to text[] not null default '{}';
alter table public.shift_registrations add column imported_name text;
create table public.brands(id text primary key, name text not null);
create table public.platforms(id text primary key, name text not null);
insert into public.brands values ('brand-a','Brand A');
insert into public.platforms values ('platform-a','Platform A');
update public.shifts set visible_to=array['member1'] where id='one';
grant select on public.brands,public.platforms to authenticated;
alter table public.shifts enable row level security;
create policy wave2_shifts_scope on public.shifts for select to authenticated using (
  exists(select 1 from public.business_users u where u.id=private.current_business_user_id()
    and u.system_permission in ('admin','leader'))
  or visible_to @> array[private.current_business_user_id()]
);
grant select on public.brands,public.platforms,public.shifts,public.shift_registrations to authenticated;
create or replace function public.get_shift_staffing_summary(p_shift_ids text[])
returns table(shift_id text, role text, required integer, approved integer,
  pending integer, remaining integer, approved_staff jsonb)
language sql stable security invoker set search_path=''
as $$
  select s.id,d.role,d.required,
    count(r.id) filter(where r.status in ('approved','manually_assigned'))::integer,
    count(r.id) filter(where r.status='pending')::integer,
    greatest(0,d.required-count(r.id) filter(where r.status in ('approved','manually_assigned'))::integer),
    '[]'::jsonb
  from public.shifts s
  cross join lateral (values
    ('host'::text,s.required_host_count::integer),
    ('support'::text,s.required_support_count::integer),
    ('technical'::text,s.required_technical_count::integer)
  ) d(role,required)
  left join public.shift_registrations r on r.shift_id=s.id and r.operational_role=d.role
  where s.id=any(p_shift_ids)
  group by s.id,d.role,d.required
$$;
grant execute on function public.get_shift_staffing_summary(text[]) to authenticated;
insert into public.shifts(id,start_at,end_at,registration_cutoff_at,required_host_count,required_support_count,required_technical_count,date,brand_id,platform_id,visible_to)
values
 ('support-gap','2031-02-01T03:00:00Z','2031-02-01T05:00:00Z','2031-02-01T02:00:00Z',1,1,0,'2031-02-01','brand-a','platform-a',array['member4']),
 ('technical-gap','2031-02-02T03:00:00Z','2031-02-02T05:00:00Z','2031-02-02T02:00:00Z',1,1,1,'2031-02-02','brand-a','platform-a','{}'),
 ('rollback','2031-02-03T03:00:00Z','2031-02-03T05:00:00Z','2031-02-03T02:00:00Z',1,1,1,'2031-02-03','brand-a','platform-a','{}');
`)

const bootstrap = [
  [foundation, 'private.assert_shift_role_eligibility'],
  [foundation, 'private.shift_required_capacity'],
  [foundation, 'private.assert_shift_capacity'],
  [operational, 'private.assert_no_shift_registration_conflict'],
  [operational, 'private.refresh_shift_registration_lock'],
  [operational, 'public.register_for_shift'],
  [foundation, 'private.insert_manual_shift_assignment'],
  [bulk, 'public.approve_shift_registration'],
  [foundation, 'public.manual_assign_shift_staff'],
  [integrity, 'public.approve_shift_registration'],
  [integrity, 'public.manual_assign_shift_staff'],
  [bulk, 'public.bulk_review_shift_registrations'],
  [integrity, 'public.bulk_review_shift_registrations'],
].map(([file, name]) => sourceFunction(file, name)).join('\n\n')
psql(bootstrap + `
revoke all on function public.manual_assign_shift_staff(text,text,text,text) from public,anon,authenticated;
revoke all on function public.manual_assign_shift_staff(text,text,text,text,integer) from public,anon;
grant execute on function public.manual_assign_shift_staff(text,text,text,text,integer) to authenticated;
revoke all on function public.bulk_review_shift_registrations(text[],text,text) from public,anon,authenticated;
revoke all on function public.bulk_review_shift_registrations(text[],text,text,jsonb) from public,anon;
grant execute on function public.bulk_review_shift_registrations(text[],text,text,jsonb) to authenticated;
`)

const baselineHelper = sourceFunction(callerMigrationPath, 'private.filtered_shift_ids')
psql(baselineHelper + '\nrevoke all on function private.filtered_shift_ids(text,jsonb) from public,anon,service_role; grant execute on function private.filtered_shift_ids(text,jsonb) to authenticated;')

// Verify legacy auto-approval before and after Registration #128.
assert.equal(query(as(1, "select status from public.register_for_shift('one','host')")), 'approved')
psql("delete from public.shift_registrations where shift_id='one';")
const oldRegister = query("select encode(convert_to(pg_get_functiondef('public.register_for_shift(text,text)'::regprocedure),'UTF8'),'base64')")
psql(`begin;${transactional(registrationMigration)}\nselect 1/0; commit;`, true)
assert.equal(query("select encode(convert_to(pg_get_functiondef('public.register_for_shift(text,text)'::regprocedure),'UTF8'),'base64')"), oldRegister)
assert.equal(query("select to_regprocedure('private.reg02_reject_surplus(text,text,text)') is null"), 't')
psql(registrationMigration)
assert.equal(query(as(1, "select status from public.register_for_shift('one','host')")), 'approved')
psql("delete from public.shift_registrations where shift_id='one'; update public.system_settings set require_registration_approval=true where id='singleton';")
console.log('REGISTRATION_THEN_STAFFING_MIGRATION_ORDER=PASS')
console.log('LEGACY_AUTO_APPROVAL_RETAINED_COMPETITIVE_POLICY_OPT_IN=PASS')

// Registration is now installed; failed Staffing migration must roll back only its own DDL.
const oldHelper = query("select encode(convert_to(pg_get_functiondef('private.filtered_shift_ids(text,jsonb)'::regprocedure),'UTF8'),'base64')")
psql(`begin;${transactional(staffingMigration)}\nselect 1/0; commit;`, true)
assert.equal(query("select encode(convert_to(pg_get_functiondef('private.filtered_shift_ids(text,jsonb)'::regprocedure),'UTF8'),'base64')"), oldHelper)
assert.equal(query("select to_regprocedure('private.reg02_reject_surplus(text,text,text)') is not null"), 't')
psql(staffingMigration)
assert.equal(query("select pg_get_function_identity_arguments('private.filtered_shift_ids(text,jsonb)'::regprocedure)"), 'p_scope text, p_filters jsonb')
assert.equal(query("select has_function_privilege('authenticated','private.filtered_shift_ids(text,jsonb)','EXECUTE')::text||'|'||has_function_privilege('anon','private.filtered_shift_ids(text,jsonb)','EXECUTE')::text"), 'true|false')
console.log('STAFFING_MIGRATION_ROLLBACK_RECOVERY_AND_ACL=PASS')

const apply = (shift, user, role='host') => query(as(user, `select status from public.register_for_shift('${shift}','${role}')`))
const registrationId = (shift,user,role='host') => query(`select id from public.shift_registrations where shift_id='${shift}' and user_id='member${user}' and operational_role='${role}' order by id limit 1`)
const approve = (id,user=6) => query(as(user, `select status from public.approve_shift_registration('${id}',null,1)`))
const filtered = (user, scope, filter) => query(as(user, `select coalesce(string_agg(id,',' order by id),'') from private.filtered_shift_ids('${scope}','${JSON.stringify(filter)}'::jsonb)`))

// Pending applications do not fill staffing; approval fills only the chosen role and
// atomically rejects the remaining applicants once that role reaches its capacity.
assert.equal(apply('one',1),'pending')
assert.equal(apply('one',2),'pending')
assert.equal(approve(registrationId('one',1)),'approved')
assert.equal(query("select status||'|'||review_notes from public.shift_registrations where shift_id='one' and user_id='member2'"),'rejected|ROLE_CAPACITY_FILLED')
assert.equal(filtered(7,'all',{shiftIds:['one'],operationalRoles:['host'],staffingStates:['fully_staffed']}),'one')
assert.equal(filtered(7,'all',{shiftIds:['one'],operationalRoles:['host'],staffingStates:['missing_staff']}),'')
assert.equal(filtered(7,'all',{shiftIds:['one'],operationalRoles:['support'],staffingStates:['missing_staff']}),'one')
assert.equal(filtered(7,'all',{shiftIds:['one'],operationalRoles:['technical'],staffingStates:['missing_staff']}),'one')
console.log('APPROVAL_CAPACITY_SURPLUS_AND_ROLE_FILTERS=PASS')

// Manual assignment uses the same capacity helper; pending Host entries are rejected,
// while the Support slot remains independently visible as missing.
assert.equal(apply('support-gap',1),'pending')
assert.equal(apply('support-gap',2),'pending')
assert.equal(query(as(6,"select status from public.manual_assign_shift_staff('support-gap','member4','host',null,1)")),'manually_assigned')
assert.equal(query("select count(*) from public.shift_registrations where shift_id='support-gap' and status='rejected' and review_notes='ROLE_CAPACITY_FILLED'"),'2')
assert.equal(filtered(7,'all',{shiftIds:['support-gap'],operationalRoles:['host'],staffingStates:['fully_staffed']}),'support-gap')
assert.equal(filtered(7,'all',{shiftIds:['support-gap'],operationalRoles:['support'],staffingStates:['missing_staff']}),'support-gap')
assert.equal(filtered(7,'all',{shiftIds:['technical-gap'],operationalRoles:['technical'],staffingStates:['missing_staff']}),'technical-gap')
console.log('MANUAL_ASSIGNMENT_AND_ROLE_SCOPED_GAPS=PASS')

// RLS and actor authorization hold after both migrations are installed.
assert.equal(query(as(1,"select count(*) from public.shift_registrations where shift_id='one'")),'1')
assert.equal(filtered(1,'all',{}),'one')
const memberApprovalTarget = registrationId('support-gap',1)
const memberApprovalVersion = query(`select version from public.shift_registrations where id='${memberApprovalTarget}'`)
assert.match(psql(as(1,`select public.approve_shift_registration('${memberApprovalTarget}',null,${memberApprovalVersion});`),true),/OPERATION_NOT_ALLOWED/)
assert.match(psql("set role anon; select * from private.filtered_shift_ids('all','{}');",true),/permission denied|42501/i)
console.log('RLS_MEMBER_SCOPE_AND_REVIEWER_AUTHORIZATION=PASS')

// Concurrent reviewers serialize on the same shift; rollback preserves both pending
// applications and a later retry can complete using the installed staffing helper.
assert.equal(apply('concurrent',3),'pending')
assert.equal(apply('concurrent',4),'pending')
const parallelSql = sql => new Promise((resolve,reject)=>{
  const child=spawn('docker',['exec','-i',container,'psql','-X','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-q','-t','-A'])
  let stdout='',stderr=''
  child.stdout.on('data',chunk=>stdout+=chunk)
  child.stderr.on('data',chunk=>stderr+=chunk)
  child.on('error',reject)
  child.on('close',code=>resolve({code,stdout,stderr}))
  child.stdin.end(sql)
})
const [first,second]=await Promise.all([
  parallelSql(as(6,`select status from public.approve_shift_registration('${registrationId('concurrent',3)}',null,1);`)),
  parallelSql(as(7,`select status from public.approve_shift_registration('${registrationId('concurrent',4)}',null,1);`)),
])
assert.equal([first,second].filter(result=>result.code===0).length,1)
assert.equal(query("select count(*) from public.shift_registrations where shift_id='concurrent' and status='approved'"),'1')
assert.equal(query("select count(*) from public.shift_registrations where shift_id='concurrent' and status='rejected' and review_notes='ROLE_CAPACITY_FILLED'"),'1')
assert.equal(apply('rollback',1),'pending')
assert.equal(apply('rollback',2),'pending')
const rollbackId=registrationId('rollback',2)
const failure=psql(`begin;${as(6,`select status from public.approve_shift_registration('${rollbackId}',null,1);`)} do $$ begin raise exception 'WAVE2_INJECTED_ROLLBACK'; end $$; commit;`,true)
assert.match(failure,/WAVE2_INJECTED_ROLLBACK/)
assert.equal(query("select count(*) from public.shift_registrations where shift_id='rollback' and status='pending'"),'2')
assert.equal(approve(rollbackId),'approved')
assert.equal(filtered(7,'all',{shiftIds:['rollback'],operationalRoles:['host'],staffingStates:['fully_staffed']}),'rollback')
console.log('CONCURRENT_APPROVAL_ROLLBACK_AND_RECOVERY=PASS')
console.log('WAVE2_COMBINED_PG17_SYNTHETIC_SUITE=PASS')
