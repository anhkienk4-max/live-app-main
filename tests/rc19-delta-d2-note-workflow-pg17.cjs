/* eslint-disable @typescript-eslint/no-require-imports -- isolated PostgreSQL migration compile harness. */
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const assert = require('node:assert/strict')
const { Client } = require('pg')
const { randomUUID } = crypto

const migrationPath = path.resolve('supabase/migrations/20261125175702_rc19_w4_delta_d_note_workflow_v1.sql')
const baselinePath = path.resolve('tests/fixtures/rc19-d2-note-workflow-base.sql')

async function main() {
  const connectionString = process.env.D2_DATABASE_URL
  const expectedDatabase = process.env.D2_EXPECTED_DATABASE
  const expectedMarker = process.env.D2_EXPECTED_MARKER
  const expectedSha = process.env.D2_EXPECTED_MIGRATION_SHA256?.toLowerCase()
  assert.ok(connectionString && expectedDatabase && expectedMarker && expectedSha, 'Set D2_DATABASE_URL, D2_EXPECTED_DATABASE, D2_EXPECTED_MARKER, D2_EXPECTED_MIGRATION_SHA256.')

  const url = new URL(connectionString)
  assert.ok(['127.0.0.1', 'localhost', '::1'].includes(url.hostname), 'D2 harness only accepts loopback PostgreSQL.')
  assert.ok(/^rc19_d2_note_/.test(expectedDatabase), 'Expected a dedicated D2 disposable database name.')
  assert.notEqual(expectedDatabase, 'rc19_d1_canonical_20261125_8EB18F', 'Refusing the active D1 canonical database.')
  assert.equal(decodeURIComponent(url.pathname.slice(1)), expectedDatabase, 'Connection URL database must match the explicit target.')
  assert.ok(expectedMarker.startsWith('CODEX_DISPOSABLE_RC19_W4_D2_NOTE_PG17_'), 'Marker must identify a D2 disposable database.')

  const migration = fs.readFileSync(migrationPath)
  const migrationSha = crypto.createHash('sha256').update(migration).digest('hex')
  assert.equal(migrationSha, expectedSha, 'Migration source SHA does not match the requested exact candidate.')
  const client = new Client({ connectionString, connectionTimeoutMillis: 3000 })
  await client.connect()
  try {
    const identity = (await client.query(`
      SELECT current_database() AS database,
             current_setting('server_version_num') AS server_version_num,
             shobj_description(oid, 'pg_database') AS marker
      FROM pg_database WHERE datname=current_database()
    `)).rows[0]
    assert.equal(identity.database, expectedDatabase)
    assert.ok(identity.server_version_num.startsWith('17'), 'D2 migration compile test requires PostgreSQL 17.')
    assert.equal(identity.marker, expectedMarker)
    const tables = Number((await client.query(`
      SELECT count(*) AS count FROM pg_tables WHERE schemaname IN ('public','private')
    `)).rows[0].count)
    assert.equal(tables, 0, 'The target must be a fresh disposable database before fixture setup.')

    await client.query(fs.readFileSync(baselinePath, 'utf8'))
    await client.query(migration.toString('utf8'))
    const compiled = (await client.query(`
      SELECT to_regprocedure('public.mutate_shift_operational_note_v1(text,text,integer,uuid,text,date,text,text,timestamptz,text,text,text,uuid)') AS rpc,
             (SELECT relrowsecurity FROM pg_class WHERE oid='public.shift_operational_note_revisions'::regclass) AS revisions_rls,
             has_function_privilege('authenticated', 'public.mutate_shift_operational_note_v1(text,text,integer,uuid,text,date,text,text,timestamptz,text,text,text,uuid)', 'EXECUTE') AS authenticated_execute,
             has_function_privilege('anon', 'public.mutate_shift_operational_note_v1(text,text,integer,uuid,text,date,text,text,timestamptz,text,text,text,uuid)', 'EXECUTE') AS anon_execute
    `)).rows[0]
    assert.ok(compiled.rpc)
    assert.equal(compiled.revisions_rls, true)
    assert.equal(compiled.authenticated_execute, true)
    assert.equal(compiled.anon_execute, false)

    // Exercise persisted state transitions against explicit test-only identity helpers.
    // This is SQL workflow coverage, not GoTrue/authentication acceptance.
    const shiftId = `d2-note-${randomUUID()}`
    const segmentId = `${shiftId}-segment`
    const memberId = `${shiftId}-member`
    const adminId = `${shiftId}-admin`
    const registrationId = `${shiftId}-registration`
    const incidentId = randomUUID()
    const date = '2026-11-26'
    const eventAt = '2026-11-26T10:00:00.000Z'
    await client.query('BEGIN')
    try {
      await client.query(`INSERT INTO public.business_users(id,status,account_status,full_name,role) VALUES ($1,'active','active','D2 synthetic member','member')`, [memberId])
      await client.query(`INSERT INTO public.business_users(id,status,account_status,full_name,role) VALUES ($1,'active','active','D2 synthetic admin','admin')`, [adminId])
      await client.query('INSERT INTO public.shifts(id,date) VALUES ($1,$2)', [shiftId,date])
      await client.query('INSERT INTO public.shift_staffing_segments(id,shift_id) VALUES ($1,$2)', [segmentId,shiftId])
      await client.query(`INSERT INTO public.shift_registrations(id,shift_id,user_id,operational_role,staffing_segment_id) VALUES ($1,$2,$3,'host',$4)`, [registrationId,shiftId,memberId,segmentId])
      await client.query(`INSERT INTO private.rc19_staff_incidents(id,shift_id,staffing_segment_id,original_registration_id,original_staff_id,operational_role,business_date,incident_type,reason,created_by) VALUES ($1,$2,$3,$4,$5,'host',$6,'late','Synthetic note-link fixture',$5)`, [incidentId,shiftId,segmentId,registrationId,memberId,date])
      const mutate = async (actor, permission, payload) => {
        await client.query('SELECT set_config($1,$2,true),set_config($3,$4,true)', ['d2.test_actor', actor, 'd2.test_permission', permission])
        const args = [payload.action,payload.noteId,payload.expectedVersion,payload.idempotencyKey,payload.shiftId,payload.businessDate,payload.category,payload.note,payload.actualEventTime,payload.affectedRole,payload.affectedUserId,payload.staffingSegmentId,payload.canonicalIncidentId]
        return (await client.query('SELECT public.mutate_shift_operational_note_v1($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) AS result', args)).rows[0].result
      }
      const firstKey = randomUUID()
      const draft = await mutate(memberId,'member',{
        action:'save_draft',noteId:null,expectedVersion:null,idempotencyKey:firstKey,shiftId,businessDate:date,
        category:'incident',note:'Initial synthetic draft',actualEventTime:eventAt,affectedRole:'host',
        affectedUserId:memberId,staffingSegmentId:segmentId,canonicalIncidentId:incidentId,
      })
      assert.equal(draft.note.workflow_state,'draft')
      const draftId = draft.note.id
      // Reuse the exact first request's payload and key to prove replay stability.
      const replay = await mutate(memberId,'member',{
        action:'save_draft',noteId:null,expectedVersion:null,idempotencyKey:firstKey,shiftId,businessDate:date,
        category:'incident',note:'Initial synthetic draft',actualEventTime:eventAt,affectedRole:'host',
        affectedUserId:memberId,staffingSegmentId:segmentId,canonicalIncidentId:incidentId,
      })
      assert.equal(replay.replayed,true)
      assert.equal(replay.note.id,draftId)
      const second = await mutate(memberId,'member',{
        action:'save_draft',noteId:null,expectedVersion:null,idempotencyKey:randomUUID(),shiftId,businessDate:date,
        category:'normal',note:'Independent note on same shift',actualEventTime:eventAt,affectedRole:null,
        affectedUserId:null,staffingSegmentId:null,canonicalIncidentId:null,
      })
      assert.notEqual(second.note.id,draftId)
      const updated = await mutate(memberId,'member',{
        action:'save_draft',noteId:draftId,expectedVersion:1,idempotencyKey:randomUUID(),shiftId,businessDate:date,
        category:'incident',note:'Updated synthetic draft',actualEventTime:eventAt,affectedRole:'host',
        affectedUserId:memberId,staffingSegmentId:segmentId,canonicalIncidentId:incidentId,
      })
      assert.equal(updated.note.version,2)
      await client.query('SAVEPOINT stale_note')
      let staleCode=''
      try {
        await mutate(memberId,'member',{
          action:'save_draft',noteId:draftId,expectedVersion:1,idempotencyKey:randomUUID(),shiftId,businessDate:date,
          category:'incident',note:'Stale update must not persist',actualEventTime:eventAt,affectedRole:'host',
          affectedUserId:memberId,staffingSegmentId:segmentId,canonicalIncidentId:incidentId,
        })
      } catch (error) { staleCode=error.code }
      await client.query('ROLLBACK TO SAVEPOINT stale_note')
      assert.equal(staleCode,'40001')
      const afterStale=(await client.query('SELECT version,note FROM public.shift_operational_notes WHERE id=$1',[draftId])).rows[0]
      assert.deepEqual(afterStale,{version:2,note:'Updated synthetic draft'})
      const submit=await mutate(memberId,'member',{
        action:'submit',noteId:draftId,expectedVersion:2,idempotencyKey:randomUUID(),shiftId:null,businessDate:null,
        category:null,note:null,actualEventTime:null,affectedRole:null,affectedUserId:null,staffingSegmentId:null,canonicalIncidentId:null,
      })
      assert.equal(submit.note.workflow_state,'submitted')
      const correction=await mutate(adminId,'admin',{
        action:'request_correction',noteId:draftId,expectedVersion:3,idempotencyKey:randomUUID(),shiftId:null,businessDate:null,
        category:null,note:null,actualEventTime:null,affectedRole:null,affectedUserId:null,staffingSegmentId:null,canonicalIncidentId:null,
      })
      assert.equal(correction.note.workflow_state,'correction_requested')
      const corrected=await mutate(memberId,'member',{
        action:'save_draft',noteId:draftId,expectedVersion:4,idempotencyKey:randomUUID(),shiftId,businessDate:date,
        category:'incident',note:'Corrected synthetic draft',actualEventTime:eventAt,affectedRole:'host',
        affectedUserId:memberId,staffingSegmentId:segmentId,canonicalIncidentId:incidentId,
      })
      assert.equal(corrected.note.workflow_state,'submitted')
      const reviewed=await mutate(adminId,'admin',{
        action:'approve',noteId:draftId,expectedVersion:5,idempotencyKey:randomUUID(),shiftId:null,businessDate:null,
        category:null,note:null,actualEventTime:null,affectedRole:null,affectedUserId:null,staffingSegmentId:null,canonicalIncidentId:null,
      })
      assert.equal(reviewed.note.workflow_state,'reviewed')
      const persisted=(await client.query(`
        SELECT count(*)::int note_count,
          (SELECT count(*)::int FROM public.shift_operational_note_revisions WHERE note_id=$1) revision_count,
          (SELECT count(*)::int FROM private.rc19_shift_note_idempotency WHERE note_id=$1) idempotency_count,
          (SELECT workflow_state FROM public.shift_operational_notes WHERE id=$1) final_state,
          (SELECT canonical_incident_id::text FROM public.shift_operational_notes WHERE id=$1) incident_id,
          (SELECT staffing_segment_id FROM public.shift_operational_notes WHERE id=$1) segment_id
        FROM public.shift_operational_notes WHERE shift_id=$2
      `,[draftId,shiftId])).rows[0]
      assert.equal(persisted.note_count,2)
      assert.equal(persisted.revision_count,6)
      assert.equal(persisted.idempotency_count,6)
      assert.equal(persisted.final_state,'reviewed')
      assert.equal(persisted.incident_id,incidentId)
      assert.equal(persisted.segment_id,segmentId)
      console.log(JSON.stringify({identity,migration_sha256:migrationSha,apply:'PASS',workflow:'PASS',synthetic_test_identity_helpers:true,note_count:persisted.note_count,revision_count:persisted.revision_count,idempotency_count:persisted.idempotency_count,final_state:persisted.final_state,receipt:'none (direct SQL harness)'}))
      await client.query('COMMIT')
      return
    } catch (error) {
      await client.query('ROLLBACK')
      throw error
    }
  } finally {
    await client.end()
  }
}

main().catch((error) => {
  console.error(error.code ? `${error.code}: ${error.message}` : error.message)
  process.exitCode = 1
})
