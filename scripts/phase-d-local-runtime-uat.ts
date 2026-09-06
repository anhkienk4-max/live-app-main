import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = process.env.SUPABASE_URL?.trim() || ''
const anonKey = process.env.SUPABASE_ANON_KEY?.trim() || ''
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || ''

if (!url.startsWith('http://127.0.0.1:54321') && !url.startsWith('http://localhost:54321')) {
  throw new Error('LOCAL_SUPABASE_REQUIRED')
}
if (!anonKey || !serviceKey) throw new Error('LOCAL_SUPABASE_KEYS_REQUIRED')

const service = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })
const prefix = `phase-d-${randomUUID()}`
const password = `Local-${randomUUID()}-Aa1!`
const createdAuthIds: string[] = []
const storageObjects: Array<{ bucket: string; path: string }> = []
const fixtureIds = {
  brand: `${prefix}-brand`,
  platform: `${prefix}-platform`,
  shift: '',
  registration: '',
  dashboardUpdate: '',
  member: '',
}

type RuntimeRole = 'admin' | 'leader' | 'member'
type Identity = { id: string; email: string; client: SupabaseClient }

function assertDenied(error: { message?: string } | null, pattern: RegExp) {
  assert.ok(error, 'expected operation to be denied')
  assert.match(error.message || '', pattern)
}

async function createIdentity(role: RuntimeRole): Promise<Identity> {
  const email = `${prefix}-${role}@example.test`
  const auth = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { system_permission: role, business_user_id: '' },
  })
  if (auth.error || !auth.data.user) throw auth.error || new Error('AUTH_FIXTURE_CREATE_FAILED')
  const id = auth.data.user.id
  createdAuthIds.push(id)
  const metadata = await service.auth.admin.updateUserById(id, {
    app_metadata: { system_permission: role, business_user_id: id },
  })
  if (metadata.error) throw metadata.error
  const inserted = await service.from('business_users').insert({
    id,
    auth_user_id: id,
    email,
    full_name: `Phase D ${role}`,
    role: role === 'member' ? 'staff' : role,
    system_permission: role,
    operational_roles: role === 'member' ? ['host'] : ['host', 'support', 'technical'],
    status: 'active',
    account_status: 'active',
    email_verified: true,
    auth_provider: 'email',
    join_date: '2026-09-06',
  })
  if (inserted.error) throw inserted.error
  const client = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } })
  const signedIn = await client.auth.signInWithPassword({ email, password })
  if (signedIn.error || !signedIn.data.session) throw signedIn.error || new Error('AUTH_FIXTURE_SIGN_IN_FAILED')
  return { id, email, client }
}

async function rpcRow(client: SupabaseClient, name: string, args: Record<string, unknown>) {
  const result = await client.rpc(name, args).single()
  if (result.error || !result.data) throw result.error || new Error(`${name.toUpperCase()}_RETURNED_NO_ROW`)
  return result.data as Record<string, unknown>
}

async function removeFixtureRows() {
  for (const object of storageObjects) await service.storage.from(object.bucket).remove([object.path])
  if (fixtureIds.dashboardUpdate) await service.from('dashboard_updates').delete().eq('id', fixtureIds.dashboardUpdate)
  if (fixtureIds.registration) await service.from('shift_registrations').delete().eq('id', fixtureIds.registration)
  if (fixtureIds.shift) await service.from('shifts').delete().eq('id', fixtureIds.shift)
  await service.from('platforms').delete().eq('id', fixtureIds.platform)
  await service.from('brands').delete().eq('id', fixtureIds.brand)
  await service.from('business_users').delete().like('email', `${prefix}-%`)
  for (const id of createdAuthIds) await service.auth.admin.deleteUser(id)
}

async function main() {
  try {
    const [admin, leader, member] = await Promise.all([
      createIdentity('admin'),
      createIdentity('leader'),
      createIdentity('member'),
    ])
    fixtureIds.member = member.id

    const adminSelf = await rpcRow(admin.client, 'update_staff_member', {
      p_user_id: admin.id,
      p_data: { operational_roles: ['support', 'technical'] },
    })
    assert.deepEqual(adminSelf.operational_roles, ['support', 'technical'])
    assert.equal(adminSelf.system_permission, 'admin')

    const leaderSelf = await leader.client.rpc('update_staff_member', {
      p_user_id: leader.id,
      p_data: { operational_roles: ['host'] },
    })
    assertDenied(leaderSelf.error, /STAFF_SELF_PRIVILEGE_ESCALATION_DENIED/)
    const memberEscalation = await member.client.rpc('update_staff_member', {
      p_user_id: member.id,
      p_data: { system_permission: 'admin' },
    })
    assertDenied(memberEscalation.error, /STAFF_SELF_PRIVILEGE_ESCALATION_DENIED/)
    console.log('[PASS] role authority')

    const brand = await service.from('brands').insert({ id: fixtureIds.brand, name: fixtureIds.brand, status: 'active' })
    if (brand.error) throw brand.error
    const platform = await service.from('platforms').insert({ id: fixtureIds.platform, name: fixtureIds.platform, status: 'active' })
    if (platform.error) throw platform.error

    const shift = await rpcRow(admin.client, 'create_shift', {
      p_data: {
        date: '2099-12-01',
        start_time: '10:00',
        end_time: '12:00',
        timezone: 'Asia/Ho_Chi_Minh',
        brand_id: fixtureIds.brand,
        platform_id: fixtureIds.platform,
        title: prefix,
        required_host_count: 1,
        required_support_count: 1,
        required_technical_count: 1,
      },
    })
    fixtureIds.shift = String(shift.id)

    const registration = await rpcRow(member.client, 'register_for_shift', {
      p_shift_id: fixtureIds.shift,
      p_role: 'host',
    })
    fixtureIds.registration = String(registration.id)
    assert.equal(registration.status, 'pending')
    const shiftAfterRegistration = await service.from('shifts').select('version').eq('id', fixtureIds.shift).single()
    if (shiftAfterRegistration.error) throw shiftAfterRegistration.error
    const memberManualAssignment = await member.client.rpc('manual_assign_shift_staff', {
      p_shift_id: fixtureIds.shift,
      p_user_id: leader.id,
      p_role: 'support',
      p_notes: prefix,
      p_expected_version: Number(shiftAfterRegistration.data.version),
    })
    assertDenied(memberManualAssignment.error, /OPERATION_NOT_ALLOWED/)
    const approved = await rpcRow(leader.client, 'approve_shift_registration', {
      p_registration_id: fixtureIds.registration,
      p_notes: prefix,
      p_expected_version: Number(registration.version),
    })
    assert.equal(approved.status, 'approved')
    assert.equal(approved.reviewed_by, leader.id)
    console.log('[PASS] registration and staffing permissions')

    const firstAvatarPath = `profiles/${member.id}/avatar/${randomUUID()}.png`
    const secondAvatarPath = `profiles/${member.id}/avatar/${randomUUID()}.png`
    for (const path of [firstAvatarPath, secondAvatarPath]) {
      const upload = await member.client.storage.from('profile-avatars').upload(path, new Uint8Array([137, 80, 78, 71]), {
        contentType: 'image/png',
        upsert: false,
      })
      if (upload.error) throw upload.error
      storageObjects.push({ bucket: 'profile-avatars', path })
    }
    const firstAvatarUrl = member.client.storage.from('profile-avatars').getPublicUrl(firstAvatarPath).data.publicUrl
    await rpcRow(member.client, 'update_staff_member', {
      p_user_id: member.id,
      p_data: { avatar_url: firstAvatarUrl, avatar_storage_path: firstAvatarPath },
    })
    const secondAvatarUrl = member.client.storage.from('profile-avatars').getPublicUrl(secondAvatarPath).data.publicUrl
    const avatarUpdated = await rpcRow(member.client, 'update_staff_member', {
      p_user_id: member.id,
      p_data: { avatar_url: secondAvatarUrl, avatar_storage_path: secondAvatarPath },
    })
    assert.equal(avatarUpdated.avatar_storage_path, secondAvatarPath)
    const firstRemoved = await member.client.storage.from('profile-avatars').remove([firstAvatarPath])
    if (firstRemoved.error) throw firstRemoved.error
    storageObjects.splice(storageObjects.findIndex(item => item.path === firstAvatarPath), 1)
    const avatarRows = await service.storage.from('profile-avatars').list(`profiles/${member.id}/avatar`)
    if (avatarRows.error) throw avatarRows.error
    assert.deepEqual(avatarRows.data.map(row => row.name), [secondAvatarPath.split('/').at(-1)])
    console.log('[PASS] avatar persistence replacement cleanup')

    const shiftAfterApproval = await service.from('shifts').select('version').eq('id', fixtureIds.shift).single()
    if (shiftAfterApproval.error) throw shiftAfterApproval.error
    const preparing = await rpcRow(admin.client, 'update_shift', {
      p_shift_id: fixtureIds.shift,
      p_patch: { status: 'preparing' },
      p_confirm_impact: false,
      p_expected_version: Number(shiftAfterApproval.data.version),
    })
    assert.equal(preparing.status, 'preparing')
    const screenshotPath = `dashboard/${fixtureIds.shift}/${randomUUID()}.png`
    const screenshotUpload = await member.client.storage.from('live-dashboard-images').upload(
      screenshotPath,
      new Uint8Array([137, 80, 78, 71]),
      { contentType: 'image/png', upsert: false },
    )
    if (screenshotUpload.error) throw screenshotUpload.error
    storageObjects.push({ bucket: 'live-dashboard-images', path: screenshotPath })
    const screenshotUrl = member.client.storage.from('live-dashboard-images').getPublicUrl(screenshotPath).data.publicUrl
    const dashboardUpdate = await rpcRow(member.client, 'create_dashboard_update', {
      p_data: {
        shift_id: fixtureIds.shift,
        revenue: 10,
        orders: 1,
        peak_viewers: 3,
        current_viewers: 2,
        screenshot_url: screenshotUrl,
        screenshot_storage_path: screenshotPath,
        dashboard_platform: 'other',
        notes: prefix,
      },
    })
    fixtureIds.dashboardUpdate = String(dashboardUpdate.id)
    assert.equal(dashboardUpdate.created_by, member.id)
    const persistedUpdate = await member.client.from('dashboard_updates').select('*').eq('id', fixtureIds.dashboardUpdate).single()
    if (persistedUpdate.error) throw persistedUpdate.error
    assert.equal(persistedUpdate.data.screenshot_storage_path, screenshotPath)
    const removedUpdate = await member.client.rpc('delete_dashboard_update', {
      p_update_id: fixtureIds.dashboardUpdate,
      p_reason: prefix,
    })
    if (removedUpdate.error) throw removedUpdate.error
    assert.equal(removedUpdate.data, true)
    const screenshotRemoved = await member.client.storage.from('live-dashboard-images').remove([screenshotPath])
    if (screenshotRemoved.error) throw screenshotRemoved.error
    storageObjects.splice(storageObjects.findIndex(item => item.path === screenshotPath), 1)
    console.log('[PASS] live screenshot persistence cleanup')
    console.log('[PASS] cross-module operational journey')
  } finally {
    await removeFixtureRows()
    const [users, shifts, registrations, updates, avatars, screenshots] = await Promise.all([
      service.from('business_users').select('id', { count: 'exact', head: true }).like('email', `${prefix}-%`),
      service.from('shifts').select('id', { count: 'exact', head: true }).eq('title', prefix),
      fixtureIds.registration
        ? service.from('shift_registrations').select('id', { count: 'exact', head: true }).eq('id', fixtureIds.registration)
        : Promise.resolve({ count: 0, error: null }),
      fixtureIds.dashboardUpdate
        ? service.from('dashboard_updates').select('id', { count: 'exact', head: true }).eq('id', fixtureIds.dashboardUpdate)
        : Promise.resolve({ count: 0, error: null }),
      service.storage.from('profile-avatars').list(`profiles/${fixtureIds.member || 'none'}/avatar`),
      fixtureIds.shift
        ? service.storage.from('live-dashboard-images').list(`dashboard/${fixtureIds.shift}`)
        : Promise.resolve({ data: [], error: null }),
    ])
    for (const result of [users, shifts, registrations, updates]) {
      if (result.error) throw result.error
      assert.equal(result.count, 0)
    }
    if (avatars.error) throw avatars.error
    if (screenshots.error) throw screenshots.error
    assert.equal(avatars.data.length, 0)
    assert.equal(screenshots.data.length, 0)
    console.log('[PASS] fixture cleanup')
  }
}

await main()
