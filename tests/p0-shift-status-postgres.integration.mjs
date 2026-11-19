import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { spawn, spawnSync } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const container = process.env.P0_PG_CONTAINER
const expectedMajor = Number(process.env.P0_PG_MAJOR)
const expectedMigrationSha = process.env.P0_MIGRATION_SHA256
assert.ok(container, 'P0_PG_CONTAINER is required')
assert.ok([16, 17].includes(expectedMajor), 'P0_PG_MAJOR must be PostgreSQL 16 or 17')

const migration = readFileSync(path.join(root, 'supabase/migrations/20261021034515_shift_automatic_status_scheduling_and_read_safety.sql'), 'utf8')
const migrationSha = createHash('sha256').update(migration).digest('hex').toUpperCase()
assert.equal(migrationSha, expectedMigrationSha, 'P0 migration SHA-256 changed; update the explicit expected hash after review')

function dockerPsql(input, { transaction = false, allowFailure = false, timeout = 30000 } = {}) {
  const args = ['exec', '-i', container, 'psql', '-X', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-A', '-t']
  if (transaction) args.push('--single-transaction')
  const result = spawnSync('docker', args, { input, encoding: 'utf8', timeout, maxBuffer: 1024 * 1024 })
  if (result.error) throw result.error
  if (!allowFailure) assert.equal(result.status, 0, `psql failed (${result.status}): ${result.stderr}`)
  return result
}

function query(sql) {
  return dockerPsql(sql).stdout.trim()
}

const identity = query("select current_database() || '|' || current_user || '|' || current_setting('server_version_num') || '|' || current_setting('data_directory')")
const [database, user, version, dataDirectory] = identity.split('|')
assert.equal(database, 'postgres', 'test target database must be the disposable postgres database')
assert.equal(user, 'postgres', 'migration executor must be postgres')
assert.equal(Math.floor(Number(version) / 10000), expectedMajor, 'server major does not match matrix')
assert.match(dataDirectory, /^\/var\/lib\/postgresql\//, 'test target must be inside the disposable container')
console.log(`TARGET=container:${container}; database=${database}; user=${user}; PostgreSQL=${version}; data_directory=${dataDirectory}`)

dockerPsql(readFileSync(path.join(root, 'tests/fixtures/p0_shift_status_supabase_base.sql'), 'utf8'))

const injectedRollback = dockerPsql(
  `${migration}\nDO $p0_failure$ BEGIN RAISE EXCEPTION 'P0_TEST_INJECTED_FAILURE'; END $p0_failure$;\n`,
  { transaction: true, allowFailure: true, timeout: 30000 },
)
assert.notEqual(injectedRollback.status, 0, 'injected failure must fail psql')
assert.match(injectedRollback.stderr, /P0_TEST_INJECTED_FAILURE/, 'failure must propagate from PostgreSQL')
assert.equal(query(`select (select count(*) from pg_extension where extname='pg_cron') || '|' ||
  (to_regprocedure('private.refresh_automatic_shift_statuses_scheduled()') is not null)::int || '|' ||
  (to_regclass('cron.job') is not null)::int`), '0|0|0', 'failed migration transaction must leave no extension, function, or cron job')
console.log('ATOMIC_ROLLBACK=PASS')

dockerPsql(migration, { transaction: true, timeout: 30000 })
const catalog = query(`select
  (select count(*) from cron.job where jobname='refresh-automatic-shift-statuses') || '|' ||
  has_function_privilege('postgres','private.refresh_automatic_shift_statuses_scheduled()','EXECUTE')::text || '|' ||
  has_function_privilege('authenticated','private.refresh_automatic_shift_statuses_scheduled()','EXECUTE')::text || '|' ||
  has_function_privilege('anon','public.refresh_automatic_shift_statuses()','EXECUTE')::text || '|' ||
  has_function_privilege('service_role','public.refresh_automatic_shift_statuses()','EXECUTE')::text || '|' ||
  has_function_privilege('authenticated','public.refresh_automatic_shift_statuses()','EXECUTE')::text`)
assert.equal(catalog, '1|true|false|false|false|true', 'cron schedule or function ACL differs from the migration contract')
console.log('MIGRATION_APPLY_AND_ACL=PASS')

const member = dockerPsql("begin; set local role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001',true); select * from public.refresh_automatic_shift_statuses(); commit;", { allowFailure: true })
assert.notEqual(member.status, 0, 'member must not invoke the Leader/Admin-only refresh RPC')
assert.match(member.stderr, /OPERATION_NOT_ALLOWED/, 'member denial must come from the actor authorization guard')
for (const userId of ['00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000003']) {
  dockerPsql(`begin; set local role authenticated; select set_config('request.jwt.claim.sub','${userId}',true); select * from public.refresh_automatic_shift_statuses(); commit;`)
}
console.log('RPC_RBAC_MEMBER_DENY_LEADER_ADMIN_ALLOW=PASS')

// Remove the minute job briefly so ordinary reads can be checked independently
// of the scheduled writer, then restore the same job for the runtime proof.
dockerPsql("select cron.unschedule(jobid) from cron.job where jobname='refresh-automatic-shift-statuses';")
dockerPsql(`
with hcm_midnight as (
  select date_trunc('day', statement_timestamp() at time zone 'Asia/Ho_Chi_Minh') at time zone 'Asia/Ho_Chi_Minh' as ts
), rows as (
  select 'overnight-completed'::text as id, (ts - interval '1 day' + interval '23 hours 30 minutes') as start_at,
    ts as end_at, (ts - interval '1 day' + interval '23 hours 30 minutes') as cutoff_at from hcm_midnight
  union all select 'active-live', statement_timestamp() - interval '15 minutes', statement_timestamp() + interval '30 minutes', statement_timestamp() - interval '1 hour'
  union all select 'future-preparing', statement_timestamp() + interval '30 minutes', statement_timestamp() + interval '90 minutes', statement_timestamp() - interval '10 minutes'
  union all select 'future-scheduled', statement_timestamp() + interval '2 hours', statement_timestamp() + interval '3 hours', statement_timestamp() + interval '1 hour'
  union all select 'manual-override', statement_timestamp() - interval '3 hours', statement_timestamp() - interval '2 hours', statement_timestamp() - interval '4 hours'
  union all select 'cancelled-shift', statement_timestamp() - interval '3 hours', statement_timestamp() - interval '2 hours', statement_timestamp() - interval '4 hours'
  union all select 'deleted-shift', statement_timestamp() - interval '3 hours', statement_timestamp() - interval '2 hours', statement_timestamp() - interval '4 hours'
  union all select 'archived-shift', statement_timestamp() - interval '3 hours', statement_timestamp() - interval '2 hours', statement_timestamp() - interval '4 hours'
)
insert into public.shifts(id,date,start_time,end_time,start_at,end_at,end_date,crosses_midnight,duration_minutes,registration_cutoff_at,status,status_mode,deleted_at,archived_at)
select id,(start_at at time zone 'Asia/Ho_Chi_Minh')::date,(start_at at time zone 'Asia/Ho_Chi_Minh')::time,
  (end_at at time zone 'Asia/Ho_Chi_Minh')::time,start_at,end_at,(end_at at time zone 'Asia/Ho_Chi_Minh')::date,
  (end_at at time zone 'Asia/Ho_Chi_Minh')::date <> (start_at at time zone 'Asia/Ho_Chi_Minh')::date,
  greatest(1,extract(epoch from (end_at-start_at))/60)::smallint,cutoff_at,
  case id when 'manual-override' then 'paused' when 'cancelled-shift' then 'cancelled' else 'scheduled' end,
  case when id='manual-override' then 'manual' else 'auto' end,
  case when id='deleted-shift' then statement_timestamp() end,
  case when id='archived-shift' then statement_timestamp() end
from rows;
`)

const beforeReads = query("select string_agg(id || ':' || status || ':' || version, ',' order by id) from public.shifts")
query('select id,status from public.shifts order by id; select count(*) from public.shifts;')
const afterReads = query("select string_agg(id || ':' || status || ':' || version, ',' order by id) from public.shifts")
assert.equal(afterReads, beforeReads, 'SELECT-only reads must not mutate shift status or version')
console.log('READ_PATH_NO_WRITE=PASS')

dockerPsql("select cron.schedule('refresh-automatic-shift-statuses','* * * * *','select private.refresh_automatic_shift_statuses_scheduled();');")
let scheduledRows = ''
const deadline = Date.now() + 90000
while (Date.now() < deadline) {
  scheduledRows = query(`select
    (select status from public.shifts where id='overnight-completed') || '|' ||
    (select status from public.shifts where id='active-live') || '|' ||
    (select status from public.shifts where id='future-preparing') || '|' ||
    (select status from public.shifts where id='future-scheduled') || '|' ||
    (select status || ':' || status_mode from public.shifts where id='manual-override') || '|' ||
    (select status from public.shifts where id='cancelled-shift') || '|' ||
    (select status from public.shifts where id='deleted-shift') || '|' ||
    (select status from public.shifts where id='archived-shift') || '|' ||
    (select count(*) from cron.job_run_details d join cron.job j using(jobid) where j.jobname='refresh-automatic-shift-statuses' and d.status='succeeded')`)
  if (scheduledRows === 'completed|live|preparing|scheduled|paused:manual|cancelled|scheduled|scheduled|1') break
  await delay(2000)
}
assert.equal(scheduledRows, 'completed|live|preparing|scheduled|paused:manual|cancelled|scheduled|scheduled|1', `scheduled transition postconditions failed: ${scheduledRows}`)
const systemAudits = query("select count(*) from public.p0_shift_audit where source='system' and shift_id in ('overnight-completed','active-live','future-preparing')")
assert.equal(systemAudits, '3', 'scheduled updates must flow through the audit source as system')
console.log('PG_CRON_TRANSITIONS_OVERNIGHT_MANUAL_CANCELLED_DELETED_AUDIT=PASS')

dockerPsql("select cron.unschedule(jobid) from cron.job where jobname='refresh-automatic-shift-statuses';")
dockerPsql("insert into public.shifts(id,date,start_time,end_time,start_at,end_at,end_date,crosses_midnight,duration_minutes,registration_cutoff_at,status,status_mode) values ('concurrent-auto',(now() at time zone 'Asia/Ho_Chi_Minh')::date,(now() at time zone 'Asia/Ho_Chi_Minh')::time,(now() at time zone 'Asia/Ho_Chi_Minh')::time,now()-interval '1 hour',now()+interval '1 hour',(now() at time zone 'Asia/Ho_Chi_Minh')::date,false,60,now()-interval '2 hours','scheduled','auto');")
function concurrentRefresh() {
  return new Promise((resolve, reject) => {
    const child = spawn('docker', ['exec','-i',container,'psql','-X','-U','postgres','-d','postgres','-v','ON_ERROR_STOP=1','-A','-t'], { stdio:['pipe','pipe','pipe'] })
    let stdout=''; let stderr=''
    child.stdout.setEncoding('utf8').on('data', chunk => stdout += chunk)
    child.stderr.setEncoding('utf8').on('data', chunk => stderr += chunk)
    const timeout = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('concurrent refresh timed out')) }, 20000)
    child.on('error', error => { clearTimeout(timeout); reject(error) })
    child.on('close', code => { clearTimeout(timeout); if(code !== 0) reject(new Error(`concurrent refresh exited ${code}: ${stderr}`)); else resolve(stdout.trim()) })
    child.stdin.end('select private.refresh_automatic_shift_statuses_scheduled();')
  })
}
const concurrentCounts = (await Promise.all([concurrentRefresh(),concurrentRefresh()])).map(Number)
assert.equal(concurrentCounts.reduce((sum,count)=>sum+count,0), 1, `concurrent calls must update one row once, got ${concurrentCounts}`)
assert.equal(query("select private.refresh_automatic_shift_statuses_scheduled()"), '0', 'repeat call must be idempotent')
assert.equal(query("select status || '|' || status_mode || '|' || version from public.shifts where id='concurrent-auto'"), 'live|auto|2')
console.log('IDEMPOTENCY_AND_CONCURRENCY=PASS')
console.log(`P0_POSTGRES_INTEGRATION=PASS PostgreSQL ${expectedMajor}; migration sha256=${migrationSha}`)
