/* eslint-disable @typescript-eslint/no-require-imports -- standalone PostgreSQL acceptance fixture */
const { Client } = require('pg')
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')

async function main() {
  const db = new Client({ connectionString: 'postgresql://postgres@127.0.0.1:55542/rc19_delta_d_persisted_v3_20261125' })
  await db.connect()
  try {
    const identity = await db.query("select current_database() db, current_setting('server_version_num') ver, shobj_description(oid,'pg_database') marker from pg_database where datname=current_database()")
    assert.deepEqual(identity.rows[0], { db: 'rc19_delta_d_persisted_v3_20261125', ver: '170011', marker: 'CODEX_DISPOSABLE_RC19_DELTA_D_PERSISTED_V3_20261125' })
    await db.query('begin')
    const seed = await db.query("select r.actor_business_user_id actor,u.auth_user_id,r.old_user_id old_user,r.replacement_user_id new_user,n.auth_user_id new_auth,s.brand_id,s.platform_id from public.rc19_shift_assignment_replacements r join public.business_users u on u.id=r.actor_business_user_id join public.business_users n on n.id=r.replacement_user_id join public.shifts s on s.id=r.shift_id where r.shift_id='delta-d-shift'")
    assert.equal(seed.rowCount, 1)
    const x = seed.rows[0], suffix = randomUUID().slice(0, 8), shift = `delta-d-partial-${suffix}`, segment = `delta-d-partial-seg-${suffix}`
    await db.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claim.role','authenticated',true)", [x.auth_user_id])
    await db.query("insert into public.shifts(id,date,start_time,end_time,timezone,start_at,end_at,end_date,crosses_midnight,duration_minutes,brand_id,platform_id,registration_cutoff_at,status,title,required_host_count,required_support_count,required_technical_count) select $1,(now() at time zone 'Asia/Ho_Chi_Minh')::date,'08:00','20:00','Asia/Ho_Chi_Minh',now()-interval '3 hours',now()+interval '3 hours',(now() at time zone 'Asia/Ho_Chi_Minh')::date,false,360,$2,$3,now()-interval '1 day','scheduled','D1 partial synthetic',1,0,0", [shift,x.brand_id,x.platform_id])
    await db.query("insert into public.shift_staffing_segments(id,shift_id,segment_index,start_at,end_at,required_host_count,required_support_count,required_technical_count,created_by) values($1,$2,1,now()-interval '2 hours',now()+interval '2 hours',1,0,0,$3)", [segment,shift,x.actor])
    const original = await db.query("select * from public.manual_assign_shift_staff_to_segment($1,$2,'host','D1 partial fixture',(select version from public.shifts where id=$1),$3)", [shift,x.old_user,segment])
    const oldActual = `delta-d-original-${suffix}`
    await db.query("insert into public.workforce_actual_segments(id,shift_id,staff_id,operational_role,assignment_id,event_kind,actual_start_at,actual_end_at,evidence_note,created_by) values($1,$2,$3,'host',$4,'worked',now()-interval '100 minutes',now()-interval '40 minutes','synthetic original actual',$3)", [oldActual,shift,x.old_user,original.rows[0].id])
    const before = await db.query('select private.rc19_c515_required_payroll_evidence($1) missing', [oldActual])
    assert.equal(before.rows[0].missing.includes('assignment_evidence_mapping_required'), false)
    const result = await db.query("select public.replace_shift_assignment_with_incident_v1($1,$2,$3,$4,'host',(select version from public.shifts where id=$1),$5,now()-interval '30 minutes','Partial replacement',true,$6,'skip',null) result", [shift,segment,original.rows[0].id,x.new_user,original.rows[0].version,randomUUID()])
    const receipt = result.rows[0].result
    await db.query("select set_config('request.jwt.claim.sub',$1,true)", [x.new_auth])
    const interval = await db.query("select * from private.attendance_assignment_interval($1,'host',$2)", [shift,receipt.registration.id])
    const actual = interval.rows[0].starts_at.toISOString(), expected = new Date(receipt.effective_at).toISOString()
    console.log(`replacement=${receipt.replacement_id} expected_start=${expected} attendance_start=${actual}`)
    assert.equal(actual, expected, 'Replacement attendance interval must begin at effective_at')
    console.log('partial assignment interval: PASS')
    await db.query('savepoint early_actual')
    let denied = false
    try {
      await db.query("insert into public.workforce_actual_segments(id,shift_id,staff_id,operational_role,assignment_id,event_kind,actual_start_at,actual_end_at,evidence_note,created_by) values($1,$2,$3,'host',$4,'worked',now()-interval '1 hour',now()-interval '35 minutes','synthetic early actual',$3)", [`delta-d-early-${suffix}`,shift,x.new_user,receipt.registration.id])
    } catch (error) {
      denied = error.code === '23514' && error.message.includes('WORKFORCE_REPLACEMENT_INTERVAL_INVALID')
    }
    await db.query('rollback to savepoint early_actual')
    assert.equal(denied, true, 'Actual work before handover must be rejected')
    console.log('pre-handover actual work rejection: PASS')
    await db.query("insert into public.workforce_actual_segments(id,shift_id,staff_id,operational_role,assignment_id,event_kind,actual_start_at,actual_end_at,evidence_note,created_by) values($1,$2,$3,'host',$4,'worked',now()-interval '25 minutes',now()-interval '5 minutes','synthetic valid actual',$3)", [`delta-d-valid-${suffix}`,shift,x.new_user,receipt.registration.id])
    const saved = await db.query('select assignment_id from public.workforce_actual_segments where id=$1', [`delta-d-valid-${suffix}`])
    assert.equal(saved.rows[0].assignment_id, receipt.registration.id)
    console.log('post-handover actual work readback in transaction: PASS')
    const after = await db.query('select private.rc19_c515_required_payroll_evidence($1) missing', [oldActual])
    assert.equal(after.rows[0].missing.includes('assignment_evidence_mapping_required'), false, 'Original actual work must retain its assignment evidence mapping after replacement')
    console.log('original actual-work evidence mapping: PASS')
    await db.query("update public.workforce_actual_segments set evidence_note='synthetic original correction',version=version+1 where id=$1", [oldActual])
    console.log('original actual-work update after replacement: PASS')
    await db.query('savepoint original_boundary')
    let oldDenied = false
    try {
      await db.query("update public.workforce_actual_segments set actual_end_at=$2::timestamptz+interval '1 second',version=version+1 where id=$1", [oldActual,receipt.effective_at])
    } catch (error) { oldDenied = error.code === '23514' && error.message.includes('WORKFORCE_ASSIGNMENT_INVALID') }
    await db.query('rollback to savepoint original_boundary')
    assert.equal(oldDenied,true,'Original assignment cannot claim work after handover')
    console.log('original post-handover work rejection: PASS')
    if (process.env.D1_COMMIT_DISPOSABLE_FIXTURE === '1') {
      await db.query('commit')
      await db.end()
      const fresh = new Client({ connectionString: 'postgresql://postgres@127.0.0.1:55542/rc19_delta_d_persisted_v3_20261125' })
      await fresh.connect()
      try {
        const identity = await fresh.query("select shobj_description(oid,'pg_database') marker from pg_database where datname=current_database()")
        assert.equal(identity.rows[0].marker,'CODEX_DISPOSABLE_RC19_DELTA_D_PERSISTED_V3_20261125')
        const read = await fresh.query("select r.id receipt,r.old_registration_id,r.new_registration_id,r.effective_at,i.id incident,(select count(*)::int from public.workforce_actual_segments a where a.assignment_id in (r.old_registration_id,r.new_registration_id)) actuals,(select count(*)::int from public.audit_logs a where a.action='incident_recorded' and a.metadata->>'incident_id'=i.id::text) audits from public.rc19_shift_assignment_replacements r join private.rc19_staff_incidents i on i.replacement_receipt_id=r.id where r.id=$1", [receipt.replacement_id])
        assert.equal(read.rowCount,1); assert.equal(read.rows[0].actuals,2); assert.equal(read.rows[0].audits,1)
        console.log(`COMMITTED_READBACK ${JSON.stringify(read.rows[0])}`)
      } finally { await fresh.end() }
      return
    }
  } finally {
    if (!db._ending) { await db.query('rollback').catch(() => {}); await db.end() }
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1 })
