/* eslint-disable @typescript-eslint/no-require-imports -- local authenticated acceptance fixture */
const { chromium } = require('playwright')
const { Client } = require('pg')
const fs = require('node:fs')
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')

const connectionString = 'postgresql://postgres@127.0.0.1:55542/rc19_delta_d_persisted_v3_20261125'
async function connect() {
  const db = new Client({ connectionString }); await db.connect()
  const identity = await db.query("select current_database() db, current_setting('server_version_num') ver, shobj_description(oid,'pg_database') marker from pg_database where datname=current_database()")
  assert.deepEqual(identity.rows[0], { db: 'rc19_delta_d_persisted_v3_20261125', ver: '170011', marker: 'CODEX_DISPOSABLE_RC19_DELTA_D_PERSISTED_V3_20261125' })
  return db
}
async function main() {
  const config = JSON.parse(fs.readFileSync('\\\\wsl.localhost\\Ubuntu-24.04\\home\\anhkienk4\\.local\\share\\rc19-w4-delta-ab-20261124\\c511-canonical-v6-runtime.json', 'utf8'))
  const db = await connect(), suffix = randomUUID().slice(0, 8), shift = `delta-d-api-${suffix}`, segment = `delta-d-api-seg-${suffix}`
  let browser
  try {
    const seed = await db.query("select r.actor_business_user_id actor,u.auth_user_id,u.email,r.old_user_id old_user,r.replacement_user_id new_user,s.brand_id,s.platform_id from public.rc19_shift_assignment_replacements r join public.business_users u on u.id=r.actor_business_user_id join public.shifts s on s.id=r.shift_id where r.shift_id='delta-d-shift'")
    assert.equal(seed.rowCount, 1); const x = seed.rows[0]
    await db.query('begin')
    await db.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claim.role','authenticated',true)", [x.auth_user_id])
    await db.query("insert into public.shifts(id,date,start_time,end_time,timezone,start_at,end_at,end_date,crosses_midnight,duration_minutes,brand_id,platform_id,registration_cutoff_at,status,title,required_host_count,required_support_count,required_technical_count) select $1,(now() at time zone 'Asia/Ho_Chi_Minh')::date+$4::int,'08:00','12:00','Asia/Ho_Chi_Minh',((now() at time zone 'Asia/Ho_Chi_Minh')::date+$4::int+time '08:00') at time zone 'Asia/Ho_Chi_Minh',((now() at time zone 'Asia/Ho_Chi_Minh')::date+$4::int+time '12:00') at time zone 'Asia/Ho_Chi_Minh',(now() at time zone 'Asia/Ho_Chi_Minh')::date+$4::int,false,240,$2,$3,now()+interval '69 days','scheduled','D1 real HTTP synthetic',1,0,0", [shift,x.brand_id,x.platform_id,70+parseInt(suffix,16)%5000])
    await db.query("insert into public.shift_staffing_segments(id,shift_id,segment_index,start_at,end_at,required_host_count,required_support_count,required_technical_count,created_by) select $1,$2,1,start_at,end_at,1,0,0,$3 from public.shifts where id=$2", [segment,shift,x.actor])
    const original = await db.query("select * from public.manual_assign_shift_staff_to_segment($1,$2,'host','D1 API fixture',(select version from public.shifts where id=$1),$3)", [shift,x.old_user,segment])
    const versions = await db.query('select version from public.shifts where id=$1', [shift]); await db.query('commit')
    const body = { shiftId:shift, staffingSegmentId:segment, registrationId:original.rows[0].id, replacementUserId:x.new_user, role:'host', expectedShiftVersion:versions.rows[0].version, expectedRegistrationVersion:original.rows[0].version, reason:'D1 authenticated initial mutation', isEmergency:false, idempotencyKey:randomUUID(), incidentType:'planned_reassignment', evidenceReferenceId:null }
    browser = await chromium.launch({ headless:true }); const page = await browser.newPage(); let authStatus
    page.on('response', response => { if (response.url().includes('/auth/v1/token')) authStatus = response.status() })
    await page.goto('http://localhost:3112/login'); await page.getByTestId('email-input').fill(x.email); await page.getByTestId('password-input').fill(config.test_password); await page.getByRole('button',{name:'Đăng nhập'}).click()
    await page.waitForURL(url => url.pathname !== '/login', {timeout:45000}); assert.equal(authStatus,200)
    body.effectiveAt = new Date().toISOString()
    const response = await page.request.post('http://localhost:3112/api/staffing/replacements/incident-v1',{ headers:{Origin:'http://localhost:3112'}, data:body })
    const result = await response.json(); console.log(`auth=${authStatus} initial_http=${response.status()} code=${result.error?.code ?? 'none'}`)
    assert.equal(response.status(),200); assert.equal(result.readbackRequired,true); assert.equal(result.data.replayed,false)
    assert.equal(result.data.canonicalIncident.originalRegistrationId,body.registrationId); assert.equal(result.data.canonicalIncident.replacementStaffId,x.new_user)
    const members = await db.query("select email from public.business_users where system_permission='member' and status='active' and account_status='active' and archived_at is null and deleted_at is null and auth_user_id is not null order by id limit 1")
    assert.equal(members.rowCount,1)
    const memberContext = await browser.newContext(), memberPage = await memberContext.newPage()
    try {
      await memberPage.goto('http://localhost:3112/login'); await memberPage.getByTestId('email-input').fill(members.rows[0].email)
      await memberPage.getByTestId('password-input').fill(config.test_password); await memberPage.getByRole('button',{name:'Đăng nhập'}).click()
      await memberPage.waitForURL(url => url.pathname !== '/login', {timeout:45000})
      const denied = await memberPage.request.post('http://localhost:3112/api/staffing/replacements/incident-v1',{ headers:{Origin:'http://localhost:3112'}, data:body })
      console.log(`member_replay_http=${denied.status()}`); assert.equal(denied.status(),403)
    } finally { await memberContext.close() }
    await page.context().close()
    const freshContext = await browser.newContext(), freshPage = await freshContext.newPage()
    try {
      await freshPage.goto('http://localhost:3112/login'); await freshPage.getByTestId('email-input').fill(x.email)
      await freshPage.getByTestId('password-input').fill(config.test_password); await freshPage.getByRole('button',{name:'Đăng nhập'}).click()
      await freshPage.waitForURL(url => url.pathname !== '/login', {timeout:45000})
      const roster = await freshPage.request.get(`http://localhost:3112/api/operations/registration-context?id=${encodeURIComponent(result.data.registration.id)}`)
      console.log(`fresh_session_roster_http=${roster.status()}`); assert.equal(roster.status(),200)
      const readback = await roster.json(); assert.ok(readback.registrations.some(row => row.id === result.data.registration.id))
    } finally { await freshContext.close() }
    await db.end()
    const fresh = await connect()
    try {
      const read = await fresh.query("select r.id receipt,r.old_registration_id,r.new_registration_id,i.id incident,o.status old_status,n.status new_status,(select count(*)::int from public.audit_logs a where a.action='incident_recorded' and a.metadata->>'incident_id'=i.id::text) audits from public.rc19_shift_assignment_replacements r join private.rc19_staff_incidents i on i.replacement_receipt_id=r.id join public.shift_registrations o on o.id=r.old_registration_id join public.shift_registrations n on n.id=r.new_registration_id where r.id=$1", [result.data.receiptId])
      assert.equal(read.rowCount,1); assert.equal(read.rows[0].old_status,'removed'); assert.equal(read.rows[0].new_status,'manually_assigned'); assert.equal(read.rows[0].audits,1); assert.equal(read.rows[0].incident,result.data.canonicalIncident.id)
      console.log(`committed_readback shift=${shift} receipt=${read.rows[0].receipt} incident=${read.rows[0].incident} old=${read.rows[0].old_registration_id} new=${read.rows[0].new_registration_id} audit=1`)
    } finally { await fresh.end() }
  } finally { if (browser) await browser.close(); if (!db._ending) await db.end().catch(()=>{}) }
}
main().catch(error => { console.error(`FAILED ${error.message}`); process.exitCode=1 })
