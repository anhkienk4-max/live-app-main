import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

const configPath = process.env.C511_CONFIG_PATH
assert.ok(configPath, 'C511_CONFIG_PATH must point to the local disposable runtime config')
const config = JSON.parse(readFileSync(configPath, 'utf8'))
assert.match(config.database_identity, /^170\d+\|rc19_c511_e2e_[^|]+\|CODEX_DISPOSABLE_RC19_C5_11_E2E_ONLY\|/)
const [pgVersion, database] = config.database_identity.split('|')
assert.equal(config.database, database)

const routeFetch = async (input, init) => {
  const request = input instanceof Request ? new Request(input, init) : new Request(input, init)
  const target = new URL(request.url)
  const port = target.pathname.startsWith('/rest/v1/') ? '15542'
    : target.pathname.startsWith('/auth/v1/') ? '15543' : null
  assert.ok(port, `unexpected local route ${target.pathname}`)
  target.pathname = target.pathname.replace(/^\/(rest|auth)\/v1/u, '') || '/'
  target.hostname = '127.0.0.1'
  target.port = port
  return fetch(new Request(target, request))
}
const options = { global: { fetch: routeFetch }, auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } }
const service = createClient('http://127.0.0.1', config.service_role_key, options)
const anon = createClient('http://127.0.0.1', config.anon_key, options)
const run = randomUUID().replaceAll('-', '').slice(0, 12)
const password = config.test_password

function ok(result, label) {
  assert.ifError(result.error, `${label}: ${result.error?.code ?? ''} ${result.error?.message ?? ''}`)
  return result.data
}

async function seedActor(label, permission, operationalRoles = []) {
  const authId = randomUUID()
  const id = `${label.toLowerCase()}_${run}`
  const email = `${id}@rc19.invalid`
  const row = ok(await service.from('business_users').insert({
    id, auth_user_id: authId, email, full_name: `RC19 pagination ${label} ${run}`,
    role: permission === 'member' ? 'staff' : permission, system_permission: permission,
    operational_roles: operationalRoles, status: 'active', account_status: 'active',
    email_verified: true, auth_provider: 'email',
  }).select('id').single(), `seed ${label}`)
  ok(await service.auth.admin.createUser({
    id: authId, email, password, email_confirm: true,
    app_metadata: { system_permission: permission, business_user_id: id },
    user_metadata: { full_name: `RC19 pagination ${label} ${run}` },
  }), `create auth ${label}`)
  const client = createClient('http://127.0.0.1', config.anon_key, options)
  const signedIn = ok(await client.auth.signInWithPassword({ email, password }), `sign in ${label}`)
  assert.equal(signedIn.user.app_metadata.business_user_id, row.id)
  return { id, authId, client }
}

async function createShift(admin, brandId, platformId, date, start, end, title) {
  const result = await admin.rpc('create_shift', { p_data: {
    date, start_time: start, end_time: end, timezone: 'Asia/Ho_Chi_Minh',
    brand_id: brandId, platform_id: platformId, title, status: 'scheduled',
    execution_source: 'internal', required_host_count: 1, required_support_count: 0,
    required_technical_count: 0, allow_multi_role: false,
  } })
  return ok(result, `create ${title}`)
}

async function pageAll(actor, filters, scope = 'all') {
  const collected = []
  let first
  for (let page = 1; page <= 10; page += 1) {
    const body = ok(await actor.rpc('get_shift_list_page', {
      p_scope: scope, p_page: page, p_page_size: 10, p_filters: filters,
      p_pending_page: 1, p_include_live: false,
    }), `page ${page}`)
    if (!first) first = body
    collected.push(...body.rows)
    if (collected.length >= body.total) break
  }
  assert.ok(first)
  assert.equal(collected.length, first.total)
  assert.equal(new Set(collected.map(row => row.id)).size, collected.length, 'pagination must not duplicate IDs')
  return { total: first.total, rows: collected }
}

  const admin = await seedActor('Admin', 'admin')
  const leader = await seedActor('Leader', 'leader')
  const member = await seedActor('Member', 'member', ['host'])
  const brandA = ok(await service.from('brands').insert({ id: `brand_a_${run}`, name: `RC19 A ${run}`, status: 'active' }).select('id').single(), 'brand A').id
  const brandB = ok(await service.from('brands').insert({ id: `brand_b_${run}`, name: `RC19 B ${run}`, status: 'active' }).select('id').single(), 'brand B').id
  const platformId = ok(await service.from('platforms').insert({ id: `platform_${run}`, name: `RC19 Platform ${run}`, status: 'active' }).select('id').single(), 'platform').id

  ok(await admin.client.rpc('rc19_set_leader_brand_scope', {
    p_user_id: leader.id, p_brand_id: brandA, p_scope_key: 'shifts.manage',
    p_enabled: true, p_expected_version: 0, p_valid_from: new Date(Date.now() - 60_000).toISOString(),
    p_valid_until: null, p_reason: 'disposable pagination test grant',
  }), `grant ${brandA}`)
  ok(await admin.client.rpc('rc19_set_leader_brand_scope', {
    p_user_id: leader.id, p_brand_id: brandB, p_scope_key: 'shifts.manage',
    p_enabled: true, p_expected_version: 0, p_valid_from: new Date(Date.now() - 120_000).toISOString(),
    p_valid_until: new Date(Date.now() - 60_000).toISOString(), p_reason: 'expired disposable pagination grant',
  }), `expired grant ${brandB}`)
  const shiftRows = []
  for (let index = 0; index < 37; index += 1) {
    const startMinute = index
    const start = `23:${String(startMinute).padStart(2, '0')}`
    const end = `00:${String(startMinute).padStart(2, '0')}`
    const brandId = index % 2 ? brandB : brandA
    const row = await createShift(admin.client, brandId, platformId, '2026-11-12', start, end, `C2PAG-${run} dense ${index}`)
    shiftRows.push(row)
  }
  shiftRows.push(await createShift(admin.client, brandA, platformId, '2026-11-10', '23:30', '01:30', `C2PAG-${run} overnight`))
  const monthBoundary = await createShift(admin.client, brandA, platformId, '2026-11-30', '23:30', '01:30', `C2PAG-${run} month boundary`)

  const dayFilters = { from: '2026-11-10', to: '2026-11-12', calendarOverlap: true, search: `C2PAG-${run}` }
  const adminPages = await pageAll(admin.client, dayFilters)
  assert.equal(adminPages.total, 38)
  const expectedOrder = [...shiftRows].sort((a, b) => String(a.date).localeCompare(String(b.date))
    || String(a.start_time).localeCompare(String(b.start_time)) || String(a.id).localeCompare(String(b.id)))
  assert.deepEqual(adminPages.rows.map(row => row.id), expectedOrder.map(row => row.id), 'Admin ordering is stable across page boundaries')

  const leaderPages = await pageAll(leader.client, dayFilters)
  const brandACount = shiftRows.filter(row => row.brand_id === brandA).length
  assert.equal(leaderPages.total, brandACount)
  assert.ok(leaderPages.rows.every(row => row.brand_id === brandA))
  const forgedForeign = ok(await leader.client.rpc('get_shift_list_page', {
    p_scope: 'all', p_page: 1, p_page_size: 10, p_filters: { ...dayFilters, brandIds: [brandB] },
    p_pending_page: 1, p_include_live: false,
  }), 'forged foreign Brand filter')
  assert.equal(forgedForeign.total, 0)

  const memberPages = await pageAll(member.client, dayFilters, 'open')
  assert.equal(memberPages.total, 37)
  assert.ok(memberPages.rows.every(row => row.brand_id === brandA || row.brand_id === brandB))
  const directMemberRead = ok(await member.client.from('shifts').select('id').in('id', memberPages.rows.map(row => row.id)), 'Member direct RLS probe')
  assert.equal(directMemberRead.length, 37, 'Member direct RLS permits eligible open shifts')

  const leaderScopeRows = ok(await service.from('rc19_leader_brand_scopes').select('brand_id,version')
    .eq('leader_business_user_id', leader.id).eq('brand_id', brandA).eq('scope_key', 'shifts.manage').single(), 'Leader grant readback')
  ok(await admin.client.rpc('rc19_set_leader_brand_scope', {
    p_user_id: leader.id, p_brand_id: brandA, p_scope_key: 'shifts.manage', p_enabled: false,
    p_expected_version: leaderScopeRows.version, p_valid_from: null, p_valid_until: null,
    p_reason: 'revoke active Brand during pagination test',
  }), 'revoke active Brand')
  const revokedPage = ok(await leader.client.rpc('get_shift_list_page', {
    p_scope: 'all', p_page: 1, p_page_size: 10, p_filters: { ...dayFilters, brandIds: [brandB] },
    p_pending_page: 1, p_include_live: false,
  }), 'revoked Brand page')
  assert.equal(revokedPage.total, 0)
  const staleNextPage = ok(await leader.client.rpc('get_shift_list_page', {
    p_scope: 'all', p_page: 2, p_page_size: 10, p_filters: dayFilters,
    p_pending_page: 1, p_include_live: false,
  }), 'post-revocation next page')
  assert.ok(staleNextPage.rows.every(row => row.brand_id === brandA), 'revoked rows cannot leak across an offset page boundary')

  const month = await pageAll(admin.client, { from: '2026-11-30', to: '2026-11-30', calendarOverlap: true, search: `C2PAG-${run}` })
  assert.deepEqual(month.rows.map(row => row.id), [monthBoundary.id])
  const anonDenied = await anon.rpc('get_shift_list_page', {
    p_scope: 'all', p_page: 1, p_page_size: 10, p_filters: dayFilters,
    p_pending_page: 1, p_include_live: false,
  })
  assert.ok(anonDenied.error, 'anonymous RPC access is denied')

  console.log(JSON.stringify({ result: 'PASS', postgres: pgVersion, database, marker: 'CODEX_DISPOSABLE_RC19_C5_11_E2E_ONLY',
    actor_roles: ['admin', 'leader', 'member', 'anon'], same_day_rows: 37, admin_total: adminPages.total,
    leader_brand_a_total: leaderPages.total, member_open_total: memberPages.total,
    pagination_pages: { admin: Math.ceil(adminPages.total / 10), leader: Math.ceil(leaderPages.total / 10), member: Math.ceil(memberPages.total / 10) },
    no_duplicates: true, stable_order: true, brand_filter_forgery_denied: true, revoke_between_pages_enforced: true,
    month_boundary: 'PASS', anonymous_rpc: 'DENY', real_database_readback: true }, null, 2))
