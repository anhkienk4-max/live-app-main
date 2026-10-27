import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const container = process.env.ATTENDANCE_PG_CONTAINER
const database = 'rc19_attendance_disposable'
const migration = name => readFileSync(path.join(root, 'supabase/migrations', name), 'utf8')

assert.equal(process.env.GITHUB_ACTIONS, 'true', 'destructive database setup requires isolated GitHub Actions')
assert.equal(process.env.ATTENDANCE_PG_MAJOR, '17', 'PostgreSQL 17 is required')
assert.equal(container, 'rc19-attendance-postgres17', 'only the named disposable CI container is permitted')
const labels = spawnSync('docker', ['inspect', '--format', '{{ index .Config.Labels "codex.disposable" }}', container], { encoding: 'utf8' })
assert.equal(labels.status, 0, 'disposable PostgreSQL container must exist')
assert.equal(labels.stdout.trim(), 'true', 'container must carry the disposable-test label')

function psql(db, sql, allowFailure = false) {
  const result = spawnSync('docker', ['exec', '-i', container, 'psql', '-X', '-U', 'postgres', '-d', db, '-v', 'ON_ERROR_STOP=1', '-A', '-t'], {
    input: sql,
    encoding: 'utf8',
    timeout: 30_000,
  })
  if (result.error) throw result.error
  if (!allowFailure) assert.equal(result.status, 0, `PostgreSQL command failed: ${result.stderr}`)
  return result
}

function expectSqlError(sql, message) {
  const result = psql(database, sql, true)
  assert.notEqual(result.status, 0, `expected PostgreSQL to reject: ${message}`)
  assert.match(result.stderr, new RegExp(message, 'i'))
}

function asMember(actor, sql) {
  return psql(database, `begin; set local role authenticated; select set_config('app.test_actor', '${actor}', true); ${sql}; commit;`)
}

function evidence({ requestId, shiftId, staffId, role, event, suffix, capture = 'camera', includeEventKind = true }) {
  const hash = suffix.toString(16).padStart(64, '0')
  const columns = includeEventKind ? 'request_id,shift_id,staff_id,operational_role,event_kind,' : 'request_id,shift_id,staff_id,operational_role,'
  const kindValue = includeEventKind ? `'${event}',` : ''
  return `insert into public.self_attendance_photo_evidence
    (${columns}provider,external_file_id,external_parent_id,file_name,mime_type,size_bytes,checksum_sha256,shift_context,capture_source)
    values ('${requestId}','${shiftId}','${staffId}','${role}',${kindValue}'google_drive','provider-file-${suffix}','attendance-root-0001','20261028_${role}_${event}_${suffix}.jpg','image/jpeg',100,'${hash}','{}'::jsonb,'${capture}');`
}

function rpc(actor, shiftId, role, event, requestId) {
  return asMember(actor, `select public.self_attendance_record('${shiftId}','${role}','${event}','${requestId}',null)`)
}

let databaseCreated = false
try {
  psql('postgres', `create database ${database}`)
  databaseCreated = true
  const serverVersion = Number(psql(database, 'show server_version_num').stdout.trim())
  assert.equal(Math.floor(serverVersion / 10_000), 17, 'test connected to PostgreSQL 17 server')
  psql(database, readFileSync(path.join(root, 'tests/fixtures/rc19_attendance_photo_pg17_base.sql'), 'utf8'))
  psql(database, migration('20261022185140_rc19_p2_04_member_attendance_event_journal.sql'))
  psql(database, migration('20261023144000_rc19_p2_04b_drive_photo_checkin.sql'))

  const seed = `
    insert into public.brands values ('brand-1','Brand');
    insert into public.platforms values ('platform-1','Platform');
    insert into public.business_users values
      ('staff-host','Host'),('staff-support','Support'),('staff-technical','Technical'),('other-staff','Other');
    insert into public.shifts
      (id,date,start_time,end_time,start_at,end_at,status,brand_id,platform_id,host_id,support_id,technical_id)
    values
      ('shift-host',current_date,'09:00','13:00',statement_timestamp()-interval '1 hour',statement_timestamp()+interval '1 hour','live','brand-1','platform-1','staff-host',null,null),
      ('shift-support',current_date,'09:00','13:00',statement_timestamp()-interval '1 hour',statement_timestamp()+interval '1 hour','live','brand-1','platform-1',null,'staff-support',null),
      ('shift-technical',current_date,'09:00','13:00',statement_timestamp()-interval '1 hour',statement_timestamp()+interval '1 hour','live','brand-1','platform-1',null,null,'staff-technical');`
  psql(database, seed)

  // Reproduce the original three-column unique-key failure before the check-out migration.
  const hostCheckin = '10000000-0000-4000-8000-000000000001'
  const hostCheckout = '10000000-0000-4000-8000-000000000002'
  psql(database, evidence({ requestId: hostCheckin, shiftId: 'shift-host', staffId: 'staff-host', role: 'host', event: 'check_in', suffix: 1, includeEventKind: false }))
  rpc('staff-host', 'shift-host', 'host', 'check_in', hostCheckin)
  expectSqlError(
    evidence({ requestId: hostCheckout, shiftId: 'shift-host', staffId: 'staff-host', role: 'host', event: 'check_out', suffix: 2, includeEventKind: false }),
    'duplicate key value violates unique constraint',
  )

  psql(database, migration('20261025180000_rc19_u14_1_mandatory_checkout_photo.sql'))
  assert.equal(psql(database, `select count(*) from pg_attribute where attrelid='public.self_attendance_photo_evidence'::regclass and attname='event_kind' and not attisdropped`).stdout.trim(), '1')
  assert.equal(psql(database, `select count(*) from pg_constraint where conrelid='public.self_attendance_photo_evidence'::regclass and conname='self_attendance_photo_evidence_shift_staff_role_event_key' and pg_get_constraintdef(oid)='UNIQUE (shift_id, staff_id, operational_role, event_kind)'`).stdout.trim(), '1')

  // The event-aware context now permits a distinct check-out after check-in.
  asMember('staff-host', `select public.get_self_attendance_photo_context('shift-host','host','check_out')`)
  psql(database, evidence({ requestId: hostCheckout, shiftId: 'shift-host', staffId: 'staff-host', role: 'host', event: 'check_out', suffix: 2, capture: 'file_picker' }))
  rpc('staff-host', 'shift-host', 'host', 'check_out', hostCheckout)
  const replay = rpc('staff-host', 'shift-host', 'host', 'check_out', hostCheckout)
  assert.match(replay.stdout, /"replayed": true/)
  expectSqlError(
    `begin; set local role authenticated; select set_config('app.test_actor','staff-host',true); select public.get_self_attendance_photo_context('shift-host','host','check_out'); commit;`,
    'ATTENDANCE_ALREADY_RECORDED',
  )

  for (const [role, staffId, shiftId, suffix] of [
    ['support', 'staff-support', 'shift-support', 3],
    ['technical', 'staff-technical', 'shift-technical', 5],
  ]) {
    const checkinId = `20000000-0000-4000-8000-${String(suffix).padStart(12, '0')}`
    const checkoutId = `30000000-0000-4000-8000-${String(suffix).padStart(12, '0')}`
    expectSqlError(
      `begin; set local role authenticated; select set_config('app.test_actor','${staffId}',true); select public.get_self_attendance_photo_context('${shiftId}','${role}','check_out'); commit;`,
      'ATTENDANCE_CHECKIN_REQUIRED',
    )
    asMember(staffId, `select public.get_self_attendance_photo_context('${shiftId}','${role}','check_in')`)
    psql(database, evidence({ requestId: checkinId, shiftId, staffId, role, event: 'check_in', suffix, capture: 'camera' }))
    rpc(staffId, shiftId, role, 'check_in', checkinId)
    asMember(staffId, `select public.get_self_attendance_photo_context('${shiftId}','${role}','check_out')`)
    psql(database, evidence({ requestId: checkoutId, shiftId, staffId, role, event: 'check_out', suffix: suffix + 1, capture: 'file_picker' }))
    rpc(staffId, shiftId, role, 'check_out', checkoutId)
  }

  expectSqlError(
    evidence({ requestId: '40000000-0000-4000-8000-000000000001', shiftId: 'shift-host', staffId: 'staff-host', role: 'host', event: 'check_in', suffix: 9 }),
    'duplicate key value violates unique constraint',
  )
  expectSqlError(
    evidence({ requestId: hostCheckin, shiftId: 'shift-support', staffId: 'staff-support', role: 'support', event: 'check_in', suffix: 10 }),
    'duplicate key value violates unique constraint',
  )
  expectSqlError(
    `begin; set local role authenticated; select set_config('app.test_actor','other-staff',true); select public.get_self_attendance_photo_context('shift-host','host','check_in'); commit;`,
    'ATTENDANCE_NOT_ASSIGNED',
  )
  expectSqlError(
    `begin; set local role authenticated; select public.self_attendance_record('shift-host','host','check_in','50000000-0000-4000-8000-000000000001',null); commit;`,
    'AUTHENTICATION_REQUIRED',
  )
  expectSqlError(
    `begin; set local role authenticated; update public.self_attendance_photo_evidence set file_name='mutated-name.jpg' where request_id='${hostCheckin}'; commit;`,
    'permission denied|ATTENDANCE_EVENTS_IMMUTABLE',
  )
  expectSqlError(
    `set role anon; select public.get_self_attendance_photo_context('shift-host','host','check_in')`,
    'permission denied for function',
  )
  expectSqlError(
    `set role authenticated; insert into public.self_attendance_photo_evidence(request_id,shift_id,staff_id,operational_role,event_kind,external_file_id,external_parent_id,file_name,mime_type,size_bytes,checksum_sha256,shift_context,capture_source) values ('60000000-0000-4000-8000-000000000001','shift-host','staff-host','host','check_out','provider-file-denied','attendance-root-0001','20261028_host_checkout_denied.jpg','image/jpeg',100,'${'e'.repeat(64)}','{}'::jsonb,'camera');`,
    'permission denied',
  )

  assert.equal(psql(database, `select count(*) from public.self_attendance_events where event_kind='check_in' and verification_status='pending_verification'`).stdout.trim(), '3')
  assert.equal(psql(database, `select count(*) from public.self_attendance_events where event_kind='check_out' and verification_status='pending_verification'`).stdout.trim(), '3')
  assert.equal(psql(database, `select count(*) from public.self_attendance_photo_evidence`).stdout.trim(), '6')
  console.log('PostgreSQL 17 attendance photo contract: legacy duplicate reproduced; 3 roles have distinct check-in/check-out proof; duplicates, unassigned actor, anonymous RPC, direct evidence writes, and evidence mutation denied.')
} finally {
  if (databaseCreated) psql('postgres', `drop database if exists ${database} with (force)`, true)
}
