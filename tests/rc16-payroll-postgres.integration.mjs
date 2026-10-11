import assert from 'node:assert/strict'
import { spawn, execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { assertIsolatedContainer, assertIsolatedCI } from './rc16-rehearsal-safety.mjs'

// Only the named network-isolated test container or CI loopback PostgreSQL.
const container = process.argv[2] === '--container' ? process.argv[3] : null
const major = process.env.RC16_PG_MAJOR ?? '16'
assert.ok(['16', '17'].includes(major))
if (container) {
  assert.match(container, /^(rc16b-payroll-test|rc16f-pg(?:16|17)-[a-z0-9-]{1,40})$/)
  assert.equal(process.argv.length, 4)
  const info = JSON.parse(execFileSync('docker', ['inspect', container], { encoding: 'utf8' }))[0]
  assertIsolatedContainer(info, major)
} else {
  assert.equal(process.argv.length, 2)
  assertIsolatedCI(process.env)
}
const executable = container ? 'docker' : 'psql'
const args = [...(container ? ['exec', '-i', container, 'psql'] : []),
  '-X', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At']
function start(sql, database = 'postgres') {
  assert.match(database, /^(postgres|rc16g_(legacy|fresh|failure|production)|rc16h_(production|failure))$/)
  const databaseArgs = [...args]
  databaseArgs[databaseArgs.indexOf('-d') + 1] = database
  const child = spawn(executable, databaseArgs, { stdio: ['pipe', 'pipe', 'pipe'], timeout: 30000 })
  let output = ''
  const result = new Promise((resolve, reject) => {
    child.on('error', reject)
    child.stdout.on('data', chunk => { output += chunk })
    child.stderr.on('data', chunk => { output += chunk })
    child.on('close', code => resolve({ code, output }))
    child.stdin.on('error', reject)
    child.stdin.end(sql)
  })
  return { child, result }
}
async function sql(text, database = 'postgres') {
  const result = await start(text, database).result
  assert.equal(result.code, 0, result.output)
  return result.output
}
async function file(path) { return sql(readFileSync(path, 'utf8')) }
const serverVersion = (await sql('show server_version;')).trim()
assert.equal(serverVersion.split('.')[0], major)
console.log(`PostgreSQL ${serverVersion}: isolated synthetic rehearsal`)
assert.equal((await sql("select count(*) from information_schema.tables where table_schema='public';")).trim(), '0', 'Disposable database must start empty')
await file('tests/fixtures/rc16_payroll_bootstrap.sql')
await file('supabase/migrations/20261012000000_rc16_workforce_payroll_foundation.sql')
await file('tests/fixtures/rc16_payroll_integrity.sql')
console.log('PASS: existing RC1.6 PostgreSQL integrity regressions')
await file('supabase/migrations/20261012000001_rc16b_draft_payroll_correction.sql')
const checks = await file('tests/fixtures/rc16b_payroll_correction.sql')
console.log(`PASS: ${(checks.match(/RC16B_PASS:/g) ?? []).length} RC1.6B PostgreSQL assertions`)

function correction(key, version, gross = 125000) {
  return `set role service_role;
    select public.workforce_rc16b_correct_payroll_line('concurrency-period',
      'concurrency-line',${version},'${key}','correct_line','admin-1',
      'Approved concurrent correction',60,30,0,null,${gross});`
}
async function race(first, second) {
  const holder = start(`begin;
    select id from public.workforce_payroll_periods where id='concurrency-period' for update;
    select 'RC16B_LOCK_HELD'; select pg_sleep(1); commit;`)
  await new Promise((resolve, reject) => {
    let seen = ''
    holder.child.stdout.on('data', chunk => {
      seen += chunk
      if (seen.includes('RC16B_LOCK_HELD')) resolve()
    })
    holder.result.then(result => {
      if (!seen.includes('RC16B_LOCK_HELD')) reject(new Error(result.output))
    }, reject)
  })
  const results = await Promise.all([start(first).result, start(second).result])
  assert.equal((await holder.result).code, 0)
  return results
}
const conflict = await race(
  correction('20000000-0000-4000-8000-000000000001', 1),
  correction('20000000-0000-4000-8000-000000000002', 1),
)
assert.equal(conflict.filter(r => r.code === 0).length, 1)
assert.match(conflict.find(r => r.code !== 0).output, /WORKFORCE_PAYROLL_STALE_LINE/)
assert.match(await sql(`select version||':'||(select count(*) from public.workforce_payroll_audit
  where line_id='concurrency-line') from public.workforce_payroll_lines where id='concurrency-line';`), /2:1/)
console.log('PASS: concurrent different requests allow one winner, no lost update or extra audit')
const duplicate = await race(
  correction('20000000-0000-4000-8000-000000000003', 2),
  correction('20000000-0000-4000-8000-000000000003', 2),
)
assert.ok(duplicate.every(r => r.code === 0))
assert.equal(duplicate.filter(r => r.output.includes('"replayed": true')).length, 1)
assert.match(await sql(`select version||':'||(select count(*) from public.workforce_payroll_audit
  where line_id='concurrency-line') from public.workforce_payroll_lines where id='concurrency-line';`), /3:2/)
console.log('PASS: concurrent duplicate retries mutate and audit exactly once')

// Force audit insertion to fail after the line UPDATE; the transaction must roll back.
await sql(`create function public.rc16b_test_audit_failure() returns trigger language plpgsql as
  $$ begin raise exception 'RC16B_INJECTED_AUDIT_FAILURE'; end $$;
  create trigger rc16b_test_audit_failure before insert on public.workforce_payroll_audit
  for each row execute function public.rc16b_test_audit_failure();`)
const failed = await start(correction('20000000-0000-4000-8000-000000000004', 3)).result
assert.notEqual(failed.code, 0)
assert.match(failed.output, /RC16B_INJECTED_AUDIT_FAILURE/)
assert.match(await sql(`select version||':'||(select count(*) from public.workforce_payroll_audit
  where line_id='concurrency-line') from public.workforce_payroll_lines where id='concurrency-line';`), /3:2/)
await sql(`drop trigger rc16b_test_audit_failure on public.workforce_payroll_audit;
  drop function public.rc16b_test_audit_failure();`)
console.log('PASS: failed audit insertion rolls back line and idempotency key atomically')
await sql(correction('20000000-0000-4000-8000-000000000004', 3))
assert.match(await sql("select version from public.workforce_payroll_lines where id='concurrency-line';"), /4/)
console.log('PASS: rolled-back request remains safely retryable')

const reviewer = start(`begin; set role service_role;
  select public.workforce_rc16_transition_payroll('concurrency-period','draft','reviewed',
    'finance-1','Independent concurrent payroll review');
  select 'RC16B_REVIEW_HELD'; select pg_sleep(1); commit;`)
await new Promise((resolve,reject) => {
  let seen = ''
  reviewer.child.stdout.on('data', chunk => {
    seen += chunk
    if (seen.includes('RC16B_REVIEW_HELD')) resolve()
  })
  reviewer.result.then(result => {
    if (!seen.includes('RC16B_REVIEW_HELD')) reject(new Error(result.output))
  }, reject)
})
const afterReview = await start(correction('20000000-0000-4000-8000-000000000005', 4)).result
assert.equal((await reviewer.result).code, 0)
assert.notEqual(afterReview.code, 0)
assert.match(afterReview.output, /WORKFORCE_PAYROLL_PERIOD_NOT_DRAFT/)
assert.match(await sql(`select version||':'||(select count(*) from public.workforce_payroll_audit
  where line_id='concurrency-line') from public.workforce_payroll_lines where id='concurrency-line';`), /4:3/)
console.log('PASS: concurrent Review blocks waiting correction without partial mutation')

const runId = container ?? `ci-${process.env.GITHUB_RUN_ID}-${major}`
assert.match(runId, /^[a-z0-9-]{1,80}$/)
const manifest = readFileSync('tests/fixtures/rc16f_synthetic_uat.json', 'utf8')
await sql(`select set_config('rc16f.namespace','RC16F_${runId}',false);
  select set_config('rc16f.manifest','${manifest.replaceAll("'", "''")}',false);
  ${readFileSync('tests/fixtures/rc16f_synthetic_uat.sql', 'utf8')}`)
console.log(`PASS: ${runId} overnight/split/support/late/no-show/unknown/replacement/extra/cover fixture; locked active net 540667 VND`)

// Deliberately partial legacy fixture: DDL/digest compatibility, not a Staging clone.
await sql(`create schema private;
  create function private.set_updated_at() returns trigger language plpgsql as $$ begin return new; end $$;
  create table public.brands(id text primary key);
  create table public.platforms(id text primary key);
  create table public.campaigns(id text primary key);
  create table public.system_settings(id text primary key);`)
await file('supabase/migrations/20260924000000_rc13a_execution_source_storage_routes.sql')
await file('supabase/migrations/20261011091925_rc15_storage_route_prerequisites.sql')
const legacy = await start(readFileSync('supabase/migrations/20261011092015_rc15_shift_rpc_compatibility.sql', 'utf8')).result
assert.notEqual(legacy.code, 0)
assert.match(legacy.output, /RC15_SHIFT_RPC_DEFINITION_DRIFT/)
assert.equal((await sql("select count(*) from information_schema.columns where table_schema='public' and table_name='operational_storage_routes' and column_name in ('approved_by','approved_at','period_label_overrides','period_date_ranges','folder_label_overrides');")).trim(), '0')
assert.equal((await sql("select pg_get_constraintdef(oid) like '%EXISTING_BRAND_YEAR_PERIOD_PLATFORM%' from pg_constraint where conname='brands_storage_profile_check';")).trim(), 'f')
console.log('PASS: legacy RC13A rejects Production-only RC15 RPC patch; CREATE IF NOT EXISTS leaves route columns/profile checks unreconciled')
await file('tests/fixtures/rc15_production_shift_rpc_baseline.sql')
await file('supabase/migrations/20261011092015_rc15_shift_rpc_compatibility.sql')
await file('supabase/migrations/20261011092051_rc15_operational_files.sql')
console.log('PASS: recorded Production RPC baseline accepts RC15 compatibility patch and operational-file DDL')

const { runReconciliation } = await import('./rc16g-reconciliation.integration.mjs')
await runReconciliation({ sql, start })

const { runProductionRehearsal } = await import('./rc16h-production.integration.mjs')
await runProductionRehearsal({ sql, start })
