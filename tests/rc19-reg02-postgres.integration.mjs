import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { spawn, spawnSync } from 'node:child_process'
import path from 'node:path'

const container = process.env.REG02_PG_CONTAINER
assert.match(container ?? '', /^ada-reg02-pg17$/, 'Disposable PostgreSQL container required')
const root = process.cwd()
const read = name => readFileSync(path.join(root, name), 'utf8')
const fixture = 'tests/fixtures/rc19_reg02_pg17_base.sql'
const migration = 'supabase/migrations/20261028010000_rc19_reg02_multi_applicant_approval.sql'

function psql(sql, expectedFailure = false) {
  const args = ['exec', '-i', container, 'psql', '-X', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-t', '-A']
  const run = spawnSync('docker', args, { input: sql, encoding: 'utf8', timeout: 30000, maxBuffer: 4 * 1024 * 1024 })
  if (run.error) throw run.error
  if (expectedFailure) assert.notEqual(run.status, 0, 'expected SQL rejection')
  else assert.equal(run.status, 0, 'psql error: ' + run.stderr)
  return run.stdout.trim() + (expectedFailure ? '\n' + run.stderr : '')
}
function query(sql) { return psql(sql).split('\n').filter(Boolean).at(-1)?.trim() ?? '' }
function as(uid, sql) {
  return 'set role authenticated; set request.jwt.claim.sub=' + "'00000000-0000-4000-8000-" + String(uid).padStart(12, '0') + "';" + sql
}
function sourceFunction(filename, name) {
  const source = read(filename)
  const start = source.toLowerCase().indexOf('create or replace function ' + name.toLowerCase() + '(')
  assert.ok(start >= 0, 'missing baseline function ' + name)
  const end = source.indexOf('$$;', start)
  assert.ok(end >= 0, 'missing body end ' + name)
  return source.slice(start, end + 3)
}
const foundation = 'supabase/migrations/20260814085659_p1c_shift_persistence.sql'
const operational = 'supabase/migrations/20260906100000_gl19c_operational_settings_consumers.sql'
const bulk = 'supabase/migrations/20260824120000_bulk_staffing_approval.sql'
const integrity = 'supabase/migrations/20260829130000_core_v1_data_integrity_p1b.sql'
assert.equal(Math.floor(Number(query("select current_setting('server_version_num')")) / 10000), 17)
assert.match(query("select current_setting('data_directory')"), /^\/var\/lib\/postgresql\//)
psql(read(fixture))
const sourceBootstrap = [
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
psql(sourceBootstrap + "\nrevoke all on function public.manual_assign_shift_staff(text,text,text,text) from public,anon,authenticated;" +
 "\nrevoke all on function public.manual_assign_shift_staff(text,text,text,text,integer) from public,anon;" +
 "\ngrant execute on function public.manual_assign_shift_staff(text,text,text,text,integer) to authenticated;" +
 "\nrevoke all on function public.bulk_review_shift_registrations(text[],text,text) from public,anon,authenticated;" +
 "\nrevoke all on function public.bulk_review_shift_registrations(text[],text,text,jsonb) from public,anon;" +
 "\ngrant execute on function public.bulk_review_shift_registrations(text[],text,text,jsonb) to authenticated;")

// Confirm the old implementation actually auto-approves under approval=false.
const old = query(as(1, "select status from public.register_for_shift('one','host')"))
assert.equal(old, 'approved', 'old auto-approval must be reproduced before patch')
psql("delete from public.shift_registrations where shift_id='one';")
console.log('BASELINE_AUTO_APPROVAL_REPRODUCED=PASS')
psql(read(migration))

function apply(shift, user, role = 'host') {
  return query(as(user, "select status from public.register_for_shift('" + shift + "','" + role + "')"))
}
function getId(shift, user, role = 'host') {
  return query("select id from public.shift_registrations where shift_id='" + shift +
     "' and user_id='member" + user + "' and operational_role='" + role + "' limit 1")
}
function approve(regId, user = 6) {
  return query(as(user, "select status from public.approve_shift_registration('" + regId + "',null,1)"))
}

assert.equal(apply('one',1),'pending')
assert.equal(apply('one',2),'pending')
assert.equal(apply('one',3,'support'),'pending')
const winner = getId('one',2)
assert.equal(approve(winner),'approved')
assert.equal(query("select status||'|'||review_notes||'|'||(version>1)::text from public.shift_registrations where shift_id='one' and user_id='member1'"), 'rejected|ROLE_CAPACITY_FILLED|true')
assert.equal(query("select status from public.shift_registrations where shift_id='one' and user_id='member3'"), 'pending')
assert.equal(query("select count(*) from public.shift_registrations where shift_id='one' and operational_role='host' and status in('approved','manually_assigned')"),'1')
console.log('ONE_SLOT_SURPLUS_ATOMIC=PASS')

assert.equal(apply('two',1),'pending')
assert.equal(apply('two',2),'pending')
assert.equal(apply('two',3),'pending')
assert.equal(approve(getId('two',2)),'approved')
assert.equal(query("select count(*) from public.shift_registrations where shift_id='two' and status='pending'"),'2')
assert.equal(approve(getId('two',1),7),'approved')
assert.equal(query("select status||'|'||review_notes from public.shift_registrations where shift_id='two' and user_id='member3'"),'rejected|ROLE_CAPACITY_FILLED')
console.log('TWO_SLOT_NO_EARLY_REJECTION=PASS')

assert.equal(apply('manual',1),'pending')
assert.equal(apply('manual',2),'pending')
assert.equal(query(as(6,"select status from public.manual_assign_shift_staff('manual','member4','host',null,1)")),'manually_assigned')
assert.equal(query("select count(*) from public.shift_registrations where shift_id='manual' and status='rejected' and review_notes='ROLE_CAPACITY_FILLED'"),'2')
console.log('MANUAL_ASSIGNMENT_RECONCILES_PENDING=PASS')

assert.equal(apply('night',1),'pending')
assert.match(psql(as(1,"select public.register_for_shift('overlap','host');"),true),/SHIFT_CONFLICT/)
assert.match(psql(as(1,"select public.register_for_shift('night','host');"),true),/ALREADY_REGISTERED/)
assert.match(psql(as(5,"select public.register_for_shift('zero','host');"),true),/ROLE_NOT_QUALIFIED/)
assert.match(psql(as(2,"select public.register_for_shift('zero','host');"),true),/SHIFT_FULL/)
assert.match(psql(as(2,"set request.jwt.claim.system_permission='admin'; select public.approve_shift_registration('" + getId('night',1) + "',null,1);"),true),/OPERATION_NOT_ALLOWED/)
console.log('DUPLICATE_ROLE_OVERNIGHT_CAPACITY_FORGERY=PASS')

// A Member can only SELECT their own registration rows despite the shared shift.
const memberVisible = query(as(1,"select count(*) from public.shift_registrations where shift_id='one'"))
assert.equal(memberVisible,'1')
console.log('MEMBER_RLS_DIRECT_SELECT=PASS')

assert.equal(apply('concurrent',3),'pending')
assert.equal(apply('concurrent',4),'pending')
const a=getId('concurrent',3), b=getId('concurrent',4)
function parallelSql(sql) {
  return new Promise((resolve, reject) => {
    const cp=spawn('docker',['exec','-i',container,'psql','-X','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-t','-A'])
    let stdout='',stderr=''
    cp.stdout.on('data', c=>stdout+=c)
    cp.stderr.on('data', c=>stderr+=c)
    cp.on('error',reject)
    cp.on('close',code=>resolve({code,stdout,stderr}))
    cp.stdin.end(sql)
  })
}
const [first,second]=await Promise.all([
  parallelSql(as(6,"select status from public.approve_shift_registration('"+a+"',null,1);")),
  parallelSql(as(7,"select status from public.approve_shift_registration('"+b+"',null,1);"))
])
assert.equal([first,second].filter(result=>result.code===0).length,1,'exactly one winner from parallel reviewers')
assert.equal(query("select count(*) from public.shift_registrations where shift_id='concurrent' and status='approved'"),'1')
assert.equal(query("select count(*) from public.shift_registrations where shift_id='concurrent' and status='rejected' and review_notes='ROLE_CAPACITY_FILLED'"),'1')
console.log('CONCURRENT_REVIEWERS_NO_OVERSUBSCRIPTION=PASS')

// Bulk approval delegates to the same canonical per-role transaction.
psql("insert into public.shifts(id,start_at,end_at,registration_cutoff_at,required_host_count,required_support_count,required_technical_count) values('bulk','2031-02-01T03:00:00Z','2031-02-01T05:00:00Z','2031-02-01T02:00:00Z',1,1,1)")
assert.equal(apply('bulk',1),'pending')
assert.equal(apply('bulk',2),'pending')
const bulkId=getId('bulk',2)
const versions=JSON.stringify({[bulkId]:1}).replace(/'/g,"''")
assert.equal(query(as(7,"select success::text from public.bulk_review_shift_registrations(array['"+bulkId+"']::text[],'approve',null,'"+versions+"'::jsonb)")), 'true')
assert.equal(query("select status from public.shift_registrations where shift_id='bulk' and user_id='member1'"),'rejected')
console.log('BULK_REVIEW_CANONICAL_APPROVAL=PASS')

// Transaction injected failure must roll back both approval AND loser rejection.
psql("insert into public.shifts(id,start_at,end_at,registration_cutoff_at,required_host_count,required_support_count,required_technical_count) values('rollback','2031-03-01T03:00:00Z','2031-03-01T05:00:00Z','2031-03-01T02:00:00Z',1,1,1)")
assert.equal(apply('rollback',1),'pending')
assert.equal(apply('rollback',2),'pending')
const rollbackId=getId('rollback',2)
const failure = psql("begin;"+as(6,"select status from public.approve_shift_registration('"+rollbackId+"',null,1);")+
  "do $reg02_fail$ begin raise exception 'REG02_INJECTED_ROLLBACK'; end $reg02_fail$; commit;",true)
assert.match(failure,/REG02_INJECTED_ROLLBACK/)
assert.equal(query("select count(*) from public.shift_registrations where shift_id='rollback' and status='pending'"),'2')
console.log('ROLLBACK_ALL_OR_NOTHING=PASS')

// Approved withdrawal never resurrects an old rejected request.
psql("update public.shift_registrations set status='removed' where shift_id='one' and user_id='member2'")
assert.equal(query("select status from public.shift_registrations where shift_id='one' and user_id='member1'"),'rejected')
console.log('NO_AUTOMATIC_RESURRECTION=PASS')
assert.equal(query("select count(*) from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname='reg02_reject_surplus' and p.prosecdef"),'1')
assert.equal(query("select has_function_privilege('anon','public.approve_shift_registration(text,text,integer)','EXECUTE')"),'f')
console.log('REG02_PG17_SYNTHETIC_SUITE=PASS')
