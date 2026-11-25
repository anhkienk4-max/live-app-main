/* eslint-disable @typescript-eslint/no-require-imports -- disposable PG17 regression */
const { Client } = require('pg')
const { randomUUID, createHash } = require('node:crypto')
const assert = require('node:assert/strict')
async function main() {
  const d=new Client({connectionString:'postgresql://postgres@127.0.0.1:55542/rc19_delta_d_persisted_v3_20261125'});await d.connect()
  try {
    const i=await d.query("select current_database() db,current_setting('server_version_num') ver,shobj_description(oid,'pg_database') marker from pg_database where datname=current_database()")
    assert.deepEqual(i.rows[0],{db:'rc19_delta_d_persisted_v3_20261125',ver:'170011',marker:'CODEX_DISPOSABLE_RC19_DELTA_D_PERSISTED_V3_20261125'})
    const q=await d.query("select s.id shift,s.version shift_version,r.id assignment,r.version assignment_version,r.staffing_segment_id,r.operational_role,r.user_id,a.id actual,p.id period,l.id line from public.workforce_payroll_lines l join public.workforce_payroll_periods p on p.id=l.period_id join public.workforce_actual_segments a on a.id=l.segment_id join public.shift_registrations r on r.id=a.assignment_id join public.shifts s on s.id=a.shift_id where p.status='locked' and a.review_status='approved' and s.status='completed' and r.staffing_segment_id is not null and r.status in ('approved','manually_assigned') order by a.id limit 1")
    assert.equal(q.rowCount,1);const x=q.rows[0]
    const u=await d.query("select bu.auth_user_id,r.replacement_user_id from public.rc19_shift_assignment_replacements r join public.business_users bu on bu.id=r.actor_business_user_id where r.shift_id='delta-d-shift'");assert.equal(u.rowCount,1)
    async function snapshot(){const r=await d.query("select (select to_jsonb(a) from public.workforce_actual_segments a where id=$1) actual,(select to_jsonb(p) from public.workforce_payroll_periods p where id=$2) period,(select to_jsonb(l) from public.workforce_payroll_lines l where id=$3) line,(select to_jsonb(r) from public.shift_registrations r where id=$4) registration,(select count(*)::int from public.rc19_shift_assignment_replacements where shift_id=$5) receipts,(select count(*)::int from private.rc19_staff_incidents where shift_id=$5) incidents",[x.actual,x.period,x.line,x.assignment,x.shift]);return createHash('sha256').update(JSON.stringify(r.rows[0])).digest('hex')}
    const before=await snapshot();await d.query('begin');await d.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claim.role','authenticated',true)",[u.rows[0].auth_user_id]);await d.query('set local role authenticated');await d.query('savepoint denied')
    let errorCode='';try{await d.query("select public.replace_shift_assignment_with_incident_v1($1,$2,$3,$4,$5,$6,$7,now(),'Synthetic locked denial',true,$8,'skip',null)",[x.shift,x.staffing_segment_id,x.assignment,u.rows[0].replacement_user_id,x.operational_role,x.shift_version,x.assignment_version,randomUUID()])}catch(error){errorCode=error.message}
    await d.query('rollback to savepoint denied');await d.query('rollback');assert.equal(errorCode,'SHIFT_NOT_REPLACEABLE');const after=await snapshot();assert.equal(after,before)
    console.log(`locked_period=${x.period} actual=${x.actual} denial=SHIFT_NOT_REPLACEABLE before_sha256=${before} after_sha256=${after}`)
  } finally {await d.end()}
}
main().catch(error=>{console.error(error.message);process.exitCode=1})
