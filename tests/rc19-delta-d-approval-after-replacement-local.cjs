/* eslint-disable @typescript-eslint/no-require-imports -- local authenticated diagnostic */
const { chromium } = require('playwright')
const { Client } = require('pg')
const fs = require('node:fs')
const assert = require('node:assert/strict')

async function main() {
  const config = JSON.parse(fs.readFileSync('\\\\wsl.localhost\\Ubuntu-24.04\\home\\anhkienk4\\.local\\share\\rc19-w4-delta-ab-20261124\\c511-canonical-v6-runtime.json','utf8'))
  const db = new Client({ connectionString:'postgresql://postgres@127.0.0.1:55542/rc19_delta_d_persisted_v3_20261125' }); await db.connect()
  let browser
  try {
    const identity = await db.query("select current_database() db,current_setting('server_version_num') ver,shobj_description(oid,'pg_database') marker from pg_database where datname=current_database()")
    assert.deepEqual(identity.rows[0],{db:'rc19_delta_d_persisted_v3_20261125',ver:'170011',marker:'CODEX_DISPOSABLE_RC19_DELTA_D_PERSISTED_V3_20261125'})
    const q = await db.query("select r.shift_id,u.email,u.auth_user_id,a.id actual_id,a.version from public.rc19_shift_assignment_replacements r join public.business_users u on u.id=r.actor_business_user_id join public.workforce_actual_segments a on a.assignment_id=r.old_registration_id where r.id='090383cc-c2dd-46c3-9ec7-b1daeffd2a46' and r.shift_id like 'delta-d-partial-%' and a.review_status='draft'")
    assert.equal(q.rowCount,1); const x=q.rows[0]
    await db.query('begin'); await db.query("select set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claim.role','authenticated',true)",[x.auth_user_id])
    await db.query("update public.shifts set status='completed' where id=$1 and status='scheduled'",[x.shift_id])
    const ready=await db.query("select status from public.shifts where id=$1",[x.shift_id]); assert.equal(ready.rows[0].status,'completed'); await db.query('commit')
    browser=await chromium.launch({headless:true}); const page=await browser.newPage(); await page.goto('http://localhost:3112/login')
    await page.getByTestId('email-input').fill(x.email); await page.getByTestId('password-input').fill(config.test_password); await page.getByRole('button',{name:'Đăng nhập'}).click(); await page.waitForURL(url=>url.pathname!='/login',{timeout:45000})
    const response=await page.request.post('http://localhost:3112/api/workforce/actual',{headers:{Origin:'http://localhost:3112'},data:{action:'review',segment_id:x.actual_id,expected_version:x.version,decision:'approved',review_note:'Synthetic independent review'}})
    const body=await response.json(); console.log(`review_http=${response.status()} code=${body.error?.code??'none'} actual=${x.actual_id}`)
    assert.equal(response.status(),200,'Post-replacement historical work should be reviewable through the real handler')
  } finally { if(browser)await browser.close(); await db.end() }
}
main().catch(error=>{console.error(`FAILED ${error.message}`);process.exitCode=1})
