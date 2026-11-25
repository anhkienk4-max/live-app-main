/* eslint-disable @typescript-eslint/no-require-imports -- This standalone Node fixture uses CommonJS. */
const { Client } = require('pg')
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')

const config = { connectionString: 'postgresql://postgres@127.0.0.1:55542/rc19_delta_d_persisted_v3_20261125' }
async function main() {
  const db = new Client(config)
  await db.connect()
  try {
    const identity = await db.query("select current_database() db, current_setting('server_version_num') ver, shobj_description(oid,'pg_database') marker from pg_database where datname=current_database()")
    assert.deepEqual(identity.rows[0], { db: 'rc19_delta_d_persisted_v3_20261125', ver: '170011', marker: 'CODEX_DISPOSABLE_RC19_DELTA_D_PERSISTED_V3_20261125' })
    const seed = await db.query("select r.actor_business_user_id actor,u.auth_user_id,r.old_user_id old_user,r.replacement_user_id new_user,s.brand_id,s.platform_id from public.rc19_shift_assignment_replacements r join public.business_users u on u.id=r.actor_business_user_id join public.shifts s on s.id=r.shift_id where r.shift_id='delta-d-shift'")
    assert.equal(seed.rowCount, 1)
    const x = seed.rows[0]
    const candidates = await db.query("select id from public.business_users where operational_roles @> array['host']::text[] and status='active' and account_status='active' and archived_at is null and deleted_at is null and id<>$1 and id<>$2 order by id limit 1", [x.old_user, x.new_user])
    assert.equal(candidates.rowCount, 1)
    for (const [index, kind] of ['same_key', 'different_key', 'different_candidate'].entries()) {
      const suffix = randomUUID().slice(0, 8), shift = `delta-d-race-${suffix}`, segment = `delta-d-seg-${suffix}`
      await db.query('begin')
      await db.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claim.role','authenticated',true)", [x.auth_user_id])
      const dates = await db.query("select (statement_timestamp() at time zone 'Asia/Ho_Chi_Minh')::date + $1::int d", [40 + index])
      const d = dates.rows[0].d.toISOString().slice(0, 10)
      await db.query("insert into public.shifts(id,date,start_time,end_time,timezone,start_at,end_at,end_date,crosses_midnight,duration_minutes,brand_id,platform_id,registration_cutoff_at,status,title,required_host_count,required_support_count,required_technical_count) values ($1,$2,'08:00','12:00','Asia/Ho_Chi_Minh',($2::date+time '08:00') at time zone 'Asia/Ho_Chi_Minh',($2::date+time '12:00') at time zone 'Asia/Ho_Chi_Minh',$2,false,240,$3,$4,($2::date+time '07:00') at time zone 'Asia/Ho_Chi_Minh','scheduled','D1 race synthetic',1,0,0)", [shift, d, x.brand_id, x.platform_id])
      await db.query("insert into public.shift_staffing_segments(id,shift_id,segment_index,start_at,end_at,required_host_count,required_support_count,required_technical_count,created_by) values($1,$2,1,($3::date+time '08:00') at time zone 'Asia/Ho_Chi_Minh',($3::date+time '12:00') at time zone 'Asia/Ho_Chi_Minh',1,0,0,$4)", [segment, shift, d, x.actor])
      const assignment = await db.query("select * from public.manual_assign_shift_staff_to_segment($1,$2,'host','D1 concurrency fixture',(select version from public.shifts where id=$1),$3)", [shift, x.old_user, segment])
      const versions = await db.query('select version from public.shifts where id=$1', [shift])
      await db.query('commit')
      const key = randomUUID(), effective = new Date().toISOString()
      async function replace(candidate, requestKey) {
        const c = new Client(config); await c.connect()
        try {
          await c.query('begin')
          await c.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claim.role','authenticated',true)", [x.auth_user_id])
          const result = await c.query('select public.replace_shift_assignment_with_incident_v1($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) result', [shift,segment,assignment.rows[0].id,candidate,'host',versions.rows[0].version,assignment.rows[0].version,effective,'D1 race',false,requestKey,'skip',null])
          await c.query('commit'); return result.rows[0].result
        } catch (error) { await c.query('rollback'); throw error } finally { await c.end() }
      }
      const secondKey = kind === 'same_key' ? key : randomUUID()
      const secondCandidate = kind === 'different_candidate' ? candidates.rows[0].id : x.new_user
      const outcomes = await Promise.allSettled([replace(x.new_user,key),replace(secondCandidate,secondKey)])
      assert.equal(outcomes.filter(o => o.status === 'fulfilled').length, kind === 'same_key' ? 2 : 1)
      const counts = await db.query("select (select count(*)::int from private.rc19_staff_incidents where shift_id=$1) incidents,(select count(*)::int from public.rc19_shift_assignment_replacements where shift_id=$1) receipts,(select count(*)::int from public.shift_registrations where shift_id=$1 and status in ('approved','manually_assigned')) active,(select count(*)::int from public.audit_logs where action='incident_recorded' and metadata->>'incident_id' in (select id::text from private.rc19_staff_incidents where shift_id=$1)) audits", [shift])
      assert.deepEqual(counts.rows[0], { incidents: 1, receipts: 1, active: 1, audits: 1 })
      console.log(`${kind}: PASS shift=${shift} incidents=1 receipts=1 active=1 audits=1`)
    }
  } finally { await db.end() }
}
main().catch(error => { console.error(error); process.exitCode = 1 })
