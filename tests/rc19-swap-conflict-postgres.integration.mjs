import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { spawn, spawnSync } from 'node:child_process'

const container = process.env.SWAP_PG_CONTAINER
assert.equal(container, 'ada-swap-pg17', 'Use only the disposable SWAP PostgreSQL 17 container')
const read = path => readFileSync(path, 'utf8')
function psql(sql, expectedFailure = false) {
  const result = spawnSync('docker', ['exec', '-i', container, 'psql', '-X', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-q', '-t', '-A'], { input: sql, encoding: 'utf8', timeout: 30000, maxBuffer: 2 * 1024 * 1024 })
  if (result.error) throw result.error
  if (expectedFailure) {
    assert.notEqual(result.status, 0, 'Expected authorization or validation rejection')
    return result.stderr.trim()
  }
  assert.equal(result.status, 0, `psql failed: ${result.stderr}`)
  return result.stdout.trim()
}
function query(sql) { return psql(sql).split('\n').filter(Boolean).at(-1)?.trim() ?? '' }
const as = (n, sql) => `set role authenticated; set request.jwt.claim.sub='00000000-0000-4000-8000-${String(n).padStart(12, '0')}'; ${sql}`
function functionSource(file, name) {
  const source = read(file)
  const lower = source.toLowerCase()
  const index = lower.indexOf(`create or replace function ${name.toLowerCase()}(`)
  assert.ok(index >= 0, `Missing source function ${name}`)
  const end = source.indexOf('$$;', index)
  assert.ok(end >= 0, `Missing terminator for ${name}`)
  return source.slice(index, end + 3)
}
const identity = 'supabase/migrations/20260811110239_p1b_master_data.sql'
const foundation = 'supabase/migrations/20260814085659_p1c_shift_persistence.sql'
const operational = 'supabase/migrations/20260906100000_gl19c_operational_settings_consumers.sql'
const fixture = 'tests/fixtures/rc19_reg02_pg17_base.sql'
const migrationPath = 'supabase/proposals/rc19-swap-conflict-preflight/20261030103157_rc19_swap_conflict_preflight.sql'

assert.equal(Math.floor(Number(query("select current_setting('server_version_num')")) / 10000), 17)
psql(read(fixture))
psql(`
alter table public.business_users add column full_name text not null default '', add column avatar_url text;
alter table public.shifts add column date date not null default date '2031-01-01', add column start_time time not null default time '09:00', add column end_time time not null default time '10:00', add column timezone text not null default 'Asia/Ho_Chi_Minh', add column host_id text, add column support_id text, add column technical_id text;
grant select on public.business_users,public.shifts,public.shift_registrations to authenticated;
grant usage on schema private to authenticated;
`)
const required = [
  [identity, 'private.current_business_user_id'],
  [identity, 'private.current_business_user_is_active'],
  [identity, 'private.current_system_permission'],
  [identity, 'private.is_leader_or_admin'],
  [foundation, 'private.can_read_shift'],
  [foundation, 'private.require_shift_actor'],
  [foundation, 'private.assert_shift_role_eligibility'],
  [foundation, 'private.shift_required_capacity'],
  [foundation, 'private.assert_shift_capacity'],
  [operational, 'private.assert_no_shift_registration_conflict'],
].map(([file, name]) => functionSource(file, name)).join('\n\n')
psql(required + `
grant execute on function private.current_business_user_id() to authenticated;
grant execute on function private.current_business_user_is_active() to authenticated;
grant execute on function private.current_system_permission() to authenticated;
grant execute on function private.is_leader_or_admin() to authenticated;
grant execute on function private.can_read_shift(text) to authenticated;
`)
psql(`
update public.business_users set full_name=id;
insert into public.shifts(id,start_at,end_at,registration_cutoff_at,registration_locked,date,start_time,end_time,timezone)
values
 ('swap_preflight_source','2031-01-09T18:00:00Z','2031-01-09T20:00:00Z','2031-01-09T17:00:00Z',true,'2031-01-10','01:00','03:00','Asia/Ho_Chi_Minh'),
 ('swap_preflight_target','2031-01-12T03:00:00Z','2031-01-12T05:00:00Z','2031-01-12T02:00:00Z',false,'2031-01-12','10:00','12:00','Asia/Ho_Chi_Minh'),
 ('swap_preflight_overlap','2031-01-09T19:00:00Z','2031-01-09T21:00:00Z','2031-01-09T18:00:00Z',true,'2031-01-10','02:00','04:00','Asia/Ho_Chi_Minh'),
 ('swap_preflight_overnight','2031-01-09T15:00:00Z','2031-01-09T19:00:00Z','2031-01-09T14:00:00Z',true,'2031-01-09','22:00','02:00','Asia/Ho_Chi_Minh'),
 ('swap_preflight_cancelled','2031-01-09T19:00:00Z','2031-01-09T21:00:00Z','2031-01-09T18:00:00Z',true,'2031-01-10','02:00','04:00','Asia/Ho_Chi_Minh');
update public.shifts set status='cancelled' where id in ('swap_preflight_cancelled','swap_preflight_overnight');
insert into public.shift_registrations(id,shift_id,user_id,operational_role,status,source) values
 ('swap_preflight_source_reg','swap_preflight_source','member1','host','approved','member'),
 ('swap_preflight_counterpart_reg','swap_preflight_target','member2','host','approved','member'),
 ('swap_preflight_overlap_reg','swap_preflight_overlap','member2','host','approved','member'),
 ('swap_preflight_overnight_reg','swap_preflight_overnight','member2','host','approved','member'),
 ('swap_preflight_cancelled_reg','swap_preflight_cancelled','member2','host','approved','member');
`)
psql(read(migrationPath))
assert.equal(query("select has_function_privilege('authenticated','public.check_shift_swap_conflict(text,text,text,text,text)','EXECUTE')::text||'|'||has_function_privilege('anon','public.check_shift_swap_conflict(text,text,text,text,text)','EXECUTE')::text"), 'true|false')
assert.equal(query(as(1, "select count(*) from public.shift_registrations where user_id='member2'")), '0', 'Member RLS must hide counterpart schedule rows')
assert.equal(query(as(1, "select public.check_shift_swap_conflict('swap_preflight_source_reg','replacement','member2')")), 'CONFLICT')
psql("update public.shifts set status='cancelled' where id='swap_preflight_overlap';")
assert.equal(query(as(1, "select public.check_shift_swap_conflict('swap_preflight_source_reg','replacement','member2')")), 'VERIFIED_CLEAR', 'Cancelled schedules are not conflicts')
psql("update public.shifts set status='scheduled' where id='swap_preflight_overlap';")
assert.equal(query(as(1, "select public.check_shift_swap_conflict('swap_preflight_source_reg','replacement','member2')")), 'CONFLICT', 'Active overlapping shifts block eligibility')
assert.equal(query(as(1, "select public.check_shift_swap_conflict('swap_preflight_source_reg','exchange',null,'swap_preflight_target','swap_preflight_counterpart_reg')")), 'CONFLICT', 'Exchange verifies both participants against private schedules')
psql("update public.shifts set status='cancelled' where id='swap_preflight_overlap'; update public.shifts set status='scheduled' where id='swap_preflight_overnight';")
assert.equal(query(as(1, "select public.check_shift_swap_conflict('swap_preflight_source_reg','replacement','member2')")), 'CONFLICT', 'Overnight shifts conflict across midnight')
psql("update public.shifts set status='cancelled' where id='swap_preflight_overnight';")
assert.equal(query(as(1, "select public.check_shift_swap_conflict('swap_preflight_source_reg','replacement','member2')")), 'VERIFIED_CLEAR')
psql("update public.shifts set status='scheduled' where id='swap_preflight_target';")
assert.equal(query(as(1, "select public.check_shift_swap_conflict('swap_preflight_source_reg','exchange',null,'swap_preflight_target','swap_preflight_counterpart_reg')")), 'VERIFIED_CLEAR')
psql("update public.business_users set operational_roles=array['support'] where id='member2';")
assert.match(psql(as(1, "select public.check_shift_swap_conflict('swap_preflight_source_reg','replacement','member2')"), true), /ROLE_NOT_QUALIFIED/)
assert.match(psql(as(2, "select public.check_shift_swap_conflict('swap_preflight_source_reg','replacement','member3')"), true), /SWAP_NOT_OWNER/)
assert.match(psql(as(1, "select public.check_shift_swap_conflict('swap_preflight_source_reg',null,'member2')"), true), /SWAP_PREFLIGHT_PAYLOAD_INVALID/)
assert.equal(query("select pg_get_function_result('public.check_shift_swap_conflict(text,text,text,text,text)'::regprocedure)"), 'text')
psql("update public.business_users set operational_roles=array['host','support','technical'] where id='member2';")

const before = query('select count(*) from public.shift_registrations')
function concurrentCall(sql) {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', ['exec', '-i', container, 'psql', '-X', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-q', '-t', '-A'], { stdio: ['pipe','pipe','pipe'] })
    let stdout='', stderr=''
    child.stdout.setEncoding('utf8').on('data', chunk => stdout += chunk)
    child.stderr.setEncoding('utf8').on('data', chunk => stderr += chunk)
    child.on('error', reject)
    child.on('close', code => code === 0 ? resolve(stdout.trim()) : reject(new Error(stderr)))
    child.stdin.end(sql)
  })
}
const [a,b] = await Promise.all([
  concurrentCall(as(1, "select public.check_shift_swap_conflict('swap_preflight_source_reg','replacement','member2')")),
  concurrentCall(as(1, "select public.check_shift_swap_conflict('swap_preflight_source_reg','replacement','member2')")),
])
assert.equal(a,'VERIFIED_CLEAR')
assert.equal(b,'VERIFIED_CLEAR')
assert.equal(query('select count(*) from public.shift_registrations'), before, 'Preflight is read-only; create/approval RPC remains authoritative')
console.log('SWAP_PG17=PASS source-owner, role, RLS privacy, cancelled/overnight conflicts, exchange, concurrent read-only checks, no mutation')
