import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'

// Only the named network-isolated test container or CI loopback PostgreSQL.
const container = process.argv[2] === '--container' ? process.argv[3] : null
if (container) assert.equal(container, 'rc16b-payroll-test')
else {
  assert.equal(process.env.CI, 'true', 'Local runs require --container rc16b-payroll-test')
  assert.equal(process.env.PGHOST, 'localhost')
  assert.equal(process.env.PGPORT, '5432')
  assert.equal(process.env.PGDATABASE, 'postgres')
}
const executable = container ? 'docker' : 'psql'
const args = [...(container ? ['exec', '-i', container, 'psql'] : []),
  '-X', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1', '-At']
function start(sql) {
  const child = spawn(executable, args, { stdio: ['pipe', 'pipe', 'pipe'], timeout: 30000 })
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
async function sql(text) {
  const result = await start(text).result
  assert.equal(result.code, 0, result.output)
  return result.output
}
async function file(path) { return sql(readFileSync(path, 'utf8')) }
assert.match(await sql('show server_version;'), /^16\./)
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
