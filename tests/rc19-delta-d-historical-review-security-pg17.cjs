/* eslint-disable @typescript-eslint/no-require-imports -- disposable PG17 security test */
const { Client } = require('pg')
const assert = require('node:assert/strict')

async function main() {
  const db=new Client({connectionString:'postgresql://postgres@127.0.0.1:55542/rc19_delta_d_persisted_v3_20261125'}); await db.connect()
  try {
    const identity=await db.query("select current_database() db,current_setting('server_version_num') ver,shobj_description(oid,'pg_database') marker from pg_database where datname=current_database()")
    assert.deepEqual(identity.rows[0],{db:'rc19_delta_d_persisted_v3_20261125',ver:'170011',marker:'CODEX_DISPOSABLE_RC19_DELTA_D_PERSISTED_V3_20261125'})
    const actor=await db.query("select u.auth_user_id from public.rc19_shift_assignment_replacements r join public.business_users u on u.id=r.actor_business_user_id where r.id='090383cc-c2dd-46c3-9ec7-b1daeffd2a46'")
    const member=await db.query("select auth_user_id from public.business_users where system_permission='member' and status='active' and account_status='active' and deleted_at is null and archived_at is null and auth_user_id is not null order by id limit 1")
    const leader=await db.query("select auth_user_id from public.business_users where system_permission='leader' and status='active' and account_status='active' and deleted_at is null and archived_at is null and auth_user_id is not null order by id limit 1")
    assert.equal(actor.rowCount,1);assert.equal(member.rowCount,1);assert.equal(leader.rowCount,1)
    const acl=await db.query("select has_function_privilege('authenticated','public.rc19_d1_historical_actual_assignment_valid(text)','execute') authenticated,has_function_privilege('anon','public.rc19_d1_historical_actual_assignment_valid(text)','execute') anon,has_function_privilege('service_role','public.rc19_d1_historical_actual_assignment_valid(text)','execute') service")
    assert.deepEqual(acl.rows[0],{authenticated:true,anon:false,service:false})
    await db.query('begin'); await db.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claim.role','authenticated',true)",[actor.rows[0].auth_user_id]); await db.query('set local role authenticated')
    const valid=await db.query("select public.rc19_d1_historical_actual_assignment_valid('delta-d-original-25729098') ok");assert.equal(valid.rows[0].ok,true)
    const missing=await db.query("select public.rc19_d1_historical_actual_assignment_valid('synthetic-missing-actual') ok");assert.equal(missing.rows[0].ok,false)
    await db.query('savepoint member_denial'); await db.query("select set_config('request.jwt.claim.sub',$1,true)",[member.rows[0].auth_user_id]);let denied=false
    try { await db.query("select public.rc19_d1_historical_actual_assignment_valid('delta-d-original-25729098')") } catch(error) { denied=error.code==='42501' }
    await db.query('rollback to savepoint member_denial');assert.equal(denied,true)
    await db.query('savepoint leader_denial'); await db.query("select set_config('request.jwt.claim.sub',$1,true)",[leader.rows[0].auth_user_id]);let leaderDenied=false
    try { await db.query("select public.rc19_d1_historical_actual_assignment_valid('delta-d-original-25729098')") } catch(error) { leaderDenied=error.code==='42501' }
    await db.query('rollback to savepoint leader_denial');assert.equal(leaderDenied,true)
    await db.query('rollback');console.log('historical review security: admin allowed, missing false, member/leader denied, anon/service execute denied')
  } finally { await db.end() }
}
main().catch(error=>{console.error(error.message);process.exitCode=1})
