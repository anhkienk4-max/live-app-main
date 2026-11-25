/* eslint-disable @typescript-eslint/no-require-imports -- isolated PG17 harness uses CommonJS. */
const assert = require('node:assert/strict')
const { Client } = require('pg')
const { execFileSync } = require('node:child_process')

const required = [
  'RC19_D3_DATABASE_URL', 'RC19_D3_EXPECTED_DATABASE', 'RC19_D3_EXPECTED_MARKER',
  'RC19_D3_EXPECTED_SHA', 'RC19_D3_FIXTURE_RUN_ID', 'RC19_D3_ADMIN_AUTH_USER_ID',
  'RC19_D3_LEADER_AUTH_USER_ID', 'RC19_D3_MEMBER_AUTH_USER_ID',
  'RC19_D3_MEMBER_BUSINESS_USER_ID', 'RC19_D3_MEMBER_OTHER_STAFF_ID', 'RC19_D3_LEADER_BRAND_ID',
  'RC19_D3_FOREIGN_BRAND_ID', 'RC19_D3_MONTH',
]
for (const key of required) {
  if (!process.env[key]) throw new Error(`Required isolated-test setting missing: ${key}`)
}

async function main() {
  const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim()
  const head = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
  assert.equal(head, process.env.RC19_D3_EXPECTED_SHA, 'runtime must match exact committed source SHA')
  assert.match(process.env.RC19_D3_EXPECTED_MARKER, /^CODEX_DISPOSABLE_/u, 'only explicit disposable DB markers are accepted')
  assert.match(process.env.RC19_D3_FIXTURE_RUN_ID, /^[A-Za-z0-9_-]{6,80}$/u)
  assert.match(process.env.RC19_D3_MONTH, /^\d{4}-(0[1-9]|1[0-2])$/u)

  const adminAuth = process.env.RC19_D3_ADMIN_AUTH_USER_ID
  const leaderAuth = process.env.RC19_D3_LEADER_AUTH_USER_ID
  const memberAuth = process.env.RC19_D3_MEMBER_AUTH_USER_ID
  const memberBusiness = process.env.RC19_D3_MEMBER_BUSINESS_USER_ID
  const client = new Client({ connectionString: process.env.RC19_D3_DATABASE_URL })
  await client.connect()
  try {
    const identity = await client.query(`
      select current_database() as database_name,
             current_setting('server_version_num')::integer as version_num,
             shobj_description(oid, 'pg_database') as marker
      from pg_database where datname = current_database()
    `)
    assert.equal(identity.rows[0].database_name, process.env.RC19_D3_EXPECTED_DATABASE)
    assert.ok(identity.rows[0].version_num >= 170000 && identity.rows[0].version_num < 180000)
    assert.equal(identity.rows[0].marker, process.env.RC19_D3_EXPECTED_MARKER)
    const privileges = await client.query(`
      select has_function_privilege('anon', 'public.rc19_workforce_incident_monthly(date,text,text,text,integer,integer)', 'EXECUTE') as anon_execute,
             has_function_privilege('authenticated', 'public.rc19_workforce_incident_monthly(date,text,text,text,integer,integer)', 'EXECUTE') as authenticated_execute,
             has_function_privilege('service_role', 'public.rc19_workforce_incident_monthly(date,text,text,text,integer,integer)', 'EXECUTE') as service_execute
    `)
    assert.deepEqual(privileges.rows[0], { anon_execute: false, authenticated_execute: true, service_execute: false })

    const tableCount = async () => (await client.query('select count(*)::integer n from private.rc19_staff_incidents')).rows[0].n
    const before = await tableCount()
    async function invoke(authId, staffId, brandId, role = null) {
      await client.query('begin')
      try {
        await client.query("select set_config('request.jwt.claim.sub',$1,true), set_config('request.jwt.claim.role','authenticated',true)", [authId])
        await client.query('set local role authenticated')
        const response = await client.query(
          'select public.rc19_workforce_incident_monthly($1::date,$2::text,$3::text,$4::text,50,0) as result',
          [`${process.env.RC19_D3_MONTH}-01`, staffId, brandId, role],
        )
        await client.query('rollback')
        return response.rows[0].result
      } catch (error) {
        await client.query('rollback')
        throw error
      }
    }

    const adminData = await invoke(adminAuth, null, null)
    assert.equal(adminData.month, process.env.RC19_D3_MONTH)
    assert.equal(adminData.timezone, 'Asia/Ho_Chi_Minh')
    assert.ok(adminData.totalIncidents > 0, 'fixture must include real persisted incident rows')

    const leaderData = await invoke(leaderAuth, null, process.env.RC19_D3_LEADER_BRAND_ID)
    assert.ok(leaderData.staff.length > 0, 'Leader fixture must have at least one in-scope incident')
    for (const staff of leaderData.staff) {
      for (const item of staff.items) {
        const brand = await client.query('select brand_id from public.shifts where id=$1', [item.shiftId])
        assert.equal(brand.rows[0]?.brand_id, process.env.RC19_D3_LEADER_BRAND_ID)
      }
    }
    await assert.rejects(
      invoke(leaderAuth, null, process.env.RC19_D3_FOREIGN_BRAND_ID),
      /WORKFORCE_BRAND_SCOPE_REQUIRED/u,
    )
    const memberData = await invoke(memberAuth, null, null)
    assert.ok(memberData.staff.length > 0, 'Member fixture must have at least one own incident')
    assert.ok(memberData.staff.every((staff) => staff.staff_id === memberBusiness))
    await assert.rejects(
      invoke(memberAuth, process.env.RC19_D3_MEMBER_OTHER_STAFF_ID, null),
      /WORKFORCE_SELF_SCOPE_REQUIRED/u,
    )
    assert.equal(await tableCount(), before, 'read and denial probes must not mutate canonical incidents')
    console.log(JSON.stringify({
      sourceSha: head,
      fixtureRunId: process.env.RC19_D3_FIXTURE_RUN_ID,
      database: identity.rows[0].database_name,
      marker: identity.rows[0].marker,
      postgresVersion: identity.rows[0].version_num,
      authenticatedAdmin: 'PASS', leaderBrandScope: 'PASS', leaderForeignBrand: 'DENIED',
      memberSelfScope: 'PASS', memberForeignStaff: 'DENIED', noMutation: 'PASS',
      incidentRows: before,
    }))
  } finally {
    await client.end()
  }
}

main().catch((error) => {
  console.error(error.message)
  process.exitCode = 1
})
