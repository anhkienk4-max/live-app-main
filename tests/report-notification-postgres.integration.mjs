import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const container = process.env.P0_PG_CONTAINER
const major = Number(process.env.P0_PG_MAJOR)
const migrationPath = path.join(root, 'supabase/migrations/20261021190000_global_report_notification_transition_keys.sql')
const migration = readFileSync(migrationPath, 'utf8')
const sha = createHash('sha256').update(migration).digest('hex').toUpperCase()
assert.equal(sha, process.env.REPORT_NOTIFICATION_MIGRATION_SHA256, 'report notification migration SHA mismatch')
assert.ok(container && [16, 17].includes(major), 'disposable PostgreSQL 16/17 required')

function psql(database, input, { allowFailure = false, transaction = false } = {}) {
  const args = ['exec', '-i', container, 'psql', '-X', '-U', 'postgres', '-d', database, '-v', 'ON_ERROR_STOP=1', '-A', '-t']
  if (transaction) args.push('--single-transaction')
  const result = spawnSync('docker', args, { input, encoding: 'utf8', timeout: 30000 })
  if (result.error) throw result.error
  if (!allowFailure) assert.equal(result.status, 0, `psql failed (${result.status}): ${result.stderr}`)
  return result
}
function query(sql) {
  return psql('report_notice', sql).stdout.trim().split(/\r?\n/).at(-1)
}
function mutate(sql) {
  psql('report_notice', `begin; select set_config('app.actor','reviewer',true); ${sql}; commit;`)
}

psql('postgres', 'create database report_notice')
psql('report_notice', readFileSync(path.join(root, 'tests/fixtures/report_notification_supabase_base.sql'), 'utf8'))
assert.equal(query("select current_database()"), 'report_notice')
assert.equal(Math.floor(Number(query("select current_setting('server_version_num')")) / 10000), major)

// Migration applies atomically. An injected failure must not replace the trigger function.
const failed = psql('report_notice',
  `${migration}\nDO $injected$ BEGIN RAISE EXCEPTION 'NOTIFICATION_INJECTED_FAILURE'; END $injected$;`,
  { allowFailure: true, transaction: true })
assert.notEqual(failed.status, 0, 'migration rollback scenario must fail')
assert.match(failed.stderr, /NOTIFICATION_INJECTED_FAILURE/)
assert.equal(query("select to_regprocedure('private.emit_report_notification()') is null"), 't')

psql('report_notice', migration, { transaction: true })
assert.equal(query("select to_regprocedure('private.emit_report_notification()') is not null"), 't')
psql('report_notice',
  'create trigger reports_notification_events after insert or update of status on public.reports for each row execute function private.emit_report_notification();')

// First lifecycle: draft -> review -> reopened.
mutate("insert into public.reports(id,shift_id,status,version_number,submitted_by) values ('r1','shift-a','draft',1,'submitter')")
assert.equal(query('select count(*) from public.notifications'), '0')
mutate("update public.reports set status='in_review' where id='r1'")
assert.equal(query('select count(*) from public.notifications'), '1')
assert.equal(query("select event_key from public.notifications where recipient_id='reviewer'"),
  'report_submitted:r1:2:reviewer')
assert.equal(query("select action_url from public.notifications where recipient_id='reviewer'"),
  '/reports?shiftId=shift-a')
assert.equal(query("select count(*) from public.notifications where recipient_id='disabled-reviewer'"), '0')

// Repeating an unchanged status is not a new event.
mutate("update public.reports set status='in_review' where id='r1'")
assert.equal(query('select count(*) from public.notifications'), '1')
mutate("update public.reports set status='reopened', review_notes='Needs evidence' where id='r1'")
assert.equal(query('select count(*) from public.notifications'), '2')
assert.equal(query("select event_key from public.notifications where recipient_id='submitter'"),
  'report_reviewed:r1:2:submitter:reopened')

// record_report_revision runs after each state write in the production RPC.
mutate("update public.reports set version_number=2 where id='r1'")
mutate("update public.reports set status='in_review' where id='r1'")
assert.equal(query('select count(*) from public.notifications'), '3')
assert.equal(query("select count(*) from public.notifications where event_key='report_submitted:r1:3:reviewer'"), '1')
mutate("update public.reports set status='confirmed' where id='r1'")
assert.equal(query('select count(*) from public.notifications'), '4')
assert.equal(query("select count(*) from public.notifications where event_key='report_reviewed:r1:3:submitter:confirmed'"), '1')

// A replay of the same database update is not a distinct transition.
mutate("update public.reports set status='confirmed' where id='r1'")
assert.equal(query('select count(*) from public.notifications'), '4')
assert.equal(query("select count(*) from public.notifications where action_url='/reports?shiftId=shift-a'"), '4')

// Malformed shift IDs never turn into arbitrary URL query parameters.
mutate("insert into public.shifts(id,host_id,support_id) values ('shift?bad=1','submitter','reviewer')")
mutate("insert into public.reports(id,shift_id,status,version_number,submitted_by) values ('r2','shift?bad=1','draft',1,'submitter')")
mutate("update public.reports set status='in_review' where id='r2'")
assert.equal(query("select action_url from public.notifications where related_entity_id='r2'"), '/reports')

console.log(`Report notification transition PostgreSQL ${major}: PASS (re-submission, review, idempotency, recipient scope, URL, rollback)`)
