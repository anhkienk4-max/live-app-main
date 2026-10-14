import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { assertIsolatedCI } from './rc16-rehearsal-safety.mjs'

const migrations = ['supabase/migrations/20261012000000_rc16_workforce_payroll_foundation.sql', 'supabase/migrations/20261012000001_rc16b_draft_payroll_correction.sql', 'supabase/migrations/' + readdirSync('supabase/migrations').find(name => name.endsWith('_rc16l_actual_amendments.sql'))]
const sql = ['begin;', readFileSync('tests/fixtures/rc16_payroll_bootstrap.sql', 'utf8'), ...migrations.map(path => readFileSync(path, 'utf8')), readFileSync('tests/fixtures/rc16l_actual_amendments.sql', 'utf8'), 'rollback;'].join('\n')
if (process.argv[2] === '--pglite') {
  assert.equal(process.argv.length, 3)
  const { PGlite } = await import('@electric-sql/pglite')
  const db = new PGlite()
  try { await db.exec(sql); console.log('PASS PGlite: actual amendments, immutable before/after audit, independent reviewer, CAS, UUID replay, active evidence and ACL. This is not PostgreSQL 16/17 container evidence.') }
  finally { await db.close() }
} else {
  assert.equal(process.argv.length, 2)
  assertIsolatedCI(process.env)
  assert.ok(['16', '17'].includes(process.env.RC16_PG_MAJOR))
  async function execute(text, database = 'postgres') {
    assert.ok(['postgres', 'rc16l_actual_race'].includes(database))
    const child = spawn('psql', ['-X', '-U', 'postgres', '-d', database, '-v', 'ON_ERROR_STOP=1', '-At'], { stdio: ['pipe', 'pipe', 'pipe'], timeout: 60000 })
    let output = ''
    child.stdout.on('data', part => { output += part }); child.stderr.on('data', part => { output += part })
    const code = await new Promise((resolve, reject) => { child.on('error', reject); child.stdin.on('error', reject); child.on('close', resolve); child.stdin.end(text) })
    return { code, output }
  }
  const preflight = await execute(`do $$ begin
    if current_setting('server_version_num')::int/10000 <> ${process.env.RC16_PG_MAJOR}::int then raise exception 'RC16L_POSTGRES_MAJOR_MISMATCH'; end if;
    if exists(select 1 from information_schema.tables where table_schema='public') then raise exception 'RC16L_DISPOSABLE_DATABASE_REQUIRED'; end if;
  end $$;`)
  assert.equal(preflight.code, 0, preflight.output)
  const result = await execute(sql)
  assert.equal(result.code, 0, result.output)
  console.log(`PASS PostgreSQL ${process.env.RC16_PG_MAJOR}: ${(result.output.match(/RC16L_PASS:/g) ?? []).length} amendment assertions; transaction rolled back`)
  // A dedicated disposable CI database keeps concurrency fixtures out of other rehearsal suites.
  const created = await execute('create database rc16l_actual_race;')
  assert.equal(created.code, 0, created.output)
  const setup = [readFileSync('tests/fixtures/rc16_payroll_bootstrap.sql', 'utf8').replace(/create role (?:anon|authenticated|service_role)[^;]*;/g, ''), ...migrations.map(path => readFileSync(path, 'utf8')),
    `insert into public.workforce_actual_segments(id,shift_id,staff_id,operational_role,event_kind,actual_start_at,actual_end_at,evidence_note,created_by) values('race-source','shift-1','staff-1','host','worked','2026-09-30 09:00+07','2026-09-30 10:00+07','Original synthetic race evidence','admin-1');`].join('\n')
  // Roles created inside the earlier transaction were rolled back; recreate only these known fixture roles.
  const roles = await execute('create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;')
  assert.equal(roles.code, 0, roles.output)
  const installed = await execute(setup, 'rc16l_actual_race')
  assert.equal(installed.code, 0, installed.output)
  const amend = uuid => `set role service_role; select public.workforce_rc16l_amend_actual('race-source',1,'${uuid}','admin-1',
    '{"staff_id":"staff-1","operational_role":"host","event_kind":"worked","coverage_kind":"extra","actual_start_at":"2026-09-30T09:00:00+07:00","actual_end_at":"2026-09-30T10:30:00+07:00","evidence_note":"Verified concurrent overtime"}', 'Verified concurrent correction');`
  const conflict = await Promise.all(['16000000-0000-4000-8000-000000000010', '16000000-0000-4000-8000-000000000011'].map(uuid => execute(amend(uuid), 'rc16l_actual_race')))
  assert.equal(conflict.filter(row => row.code === 0).length, 1)
  assert.match(conflict.find(row => row.code !== 0).output, /WORKFORCE_ACTUAL_STALE_OR_LOCKED/)
  const rejected = await execute("update public.workforce_actual_segments set review_status='rejected',version=2,reviewed_by='finance-1',reviewed_at=now(),review_note='Independent rejection for retry fixture' where supersedes_segment_id='race-source';", 'rc16l_actual_race')
  assert.equal(rejected.code, 0, rejected.output)
  const duplicate = await Promise.all([1, 2].map(() => execute(amend('16000000-0000-4000-8000-000000000012'), 'rc16l_actual_race')))
  assert.ok(duplicate.every(row => row.code === 0))
  assert.equal(duplicate.filter(row => row.output.includes('"replayed": true')).length, 1)
  const audit = await execute("select count(*) from public.workforce_actual_audit where action='amend';", 'rc16l_actual_race')
  assert.equal(audit.code, 0); assert.equal(audit.output.trim(), '2')
  const cleanup = await execute('drop database rc16l_actual_race; drop role service_role; drop role authenticated; drop role anon;')
  assert.equal(cleanup.code, 0, cleanup.output)
  console.log('PASS PostgreSQL actual concurrency: one winner for distinct UUIDs; identical UUID replays once; audit stays atomic')
}
