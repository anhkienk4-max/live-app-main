/**
 * Authenticated staging-only P1-B concurrency UAT.
 *
 * This harness deliberately requires pre-provisioned staging users. It never
 * creates Auth accounts and refuses production URLs. All operational fixtures
 * use a unique prefix and are removed in the finally block.
 *
 * Required environment variables (values are never printed):
 * SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SECRET_KEY,
 * P1B_RACE_ADMIN_EMAIL, P1B_RACE_ADMIN_PASSWORD,
 * P1B_RACE_MEMBER_EMAIL, P1B_RACE_MEMBER_PASSWORD,
 * P1B_RACE_MEMBER_2_EMAIL, P1B_RACE_MEMBER_2_PASSWORD.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const STAGING_REF = 'amagnzebmmuqiptmrjmc'
const PRODUCTION_REF = 'egdjnpmoasarrttvhgds'
const required = [
  'SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SECRET_KEY',
  'P1B_RACE_ADMIN_EMAIL', 'P1B_RACE_ADMIN_PASSWORD',
  'P1B_RACE_MEMBER_EMAIL', 'P1B_RACE_MEMBER_PASSWORD',
  'P1B_RACE_MEMBER_2_EMAIL', 'P1B_RACE_MEMBER_2_PASSWORD',
] as const

type Fixture = { shiftIds: string[]; registrationIds: string[]; swapIds: string[] }

function env(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}

function assertStaging(url: string): void {
  if (!url.includes(STAGING_REF) || url.includes(PRODUCTION_REF)) {
    throw new Error('Refusing to run: SUPABASE_URL is not the staging project.')
  }
}

async function signIn(url: string, anonKey: string, email: string, password: string): Promise<SupabaseClient> {
  const client = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } })
  const { error } = await client.auth.signInWithPassword({ email, password })
  if (error) throw new Error(`Sign-in failed for configured test account: ${error.message}`)
  return client
}

async function rpc(client: SupabaseClient, fn: string, args: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await client.rpc(fn, args)
  if (error) throw Object.assign(new Error(error.message), { code: error.code, details: error.details })
  return data
}

function assertError(result: PromiseSettledResult<unknown>, code: string, message: string): void {
  const reason = result.status === 'rejected' ? result.reason as { code?: string; message?: string } : undefined
  if (result.status !== 'rejected' || reason?.code !== code || !reason.message?.includes(message)) {
    throw new Error(`Expected ${code}/${message} loser, got ${result.status === 'rejected' ? String(reason?.message ?? result.reason) : 'success'}`)
  }
}

async function main(): Promise<void> {
  for (const name of required) env(name)
  const url = env('SUPABASE_URL')
  const anonKey = env('SUPABASE_ANON_KEY')
  const secretKey = env('SUPABASE_SECRET_KEY')
  assertStaging(url)

  const admin = createClient(url, secretKey, { auth: { autoRefreshToken: false, persistSession: false } })
  const [adminClient, adminClient2, memberClient, member2Client] = await Promise.all([
    signIn(url, anonKey, env('P1B_RACE_ADMIN_EMAIL'), env('P1B_RACE_ADMIN_PASSWORD')),
    signIn(url, anonKey, env('P1B_RACE_ADMIN_EMAIL'), env('P1B_RACE_ADMIN_PASSWORD')),
    signIn(url, anonKey, env('P1B_RACE_MEMBER_EMAIL'), env('P1B_RACE_MEMBER_PASSWORD')),
    signIn(url, anonKey, env('P1B_RACE_MEMBER_2_EMAIL'), env('P1B_RACE_MEMBER_2_PASSWORD')),
  ])
  const prefix = `p1b-race-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const fixture: Fixture = { shiftIds: [], registrationIds: [], swapIds: [] }

  const { data: users, error: usersError } = await admin.from('business_users').select('id,auth_user_id,email').in('email', [env('P1B_RACE_MEMBER_EMAIL').toLowerCase(), env('P1B_RACE_MEMBER_2_EMAIL').toLowerCase()])
  if (usersError || !users || users.length < 2) throw new Error('Two mapped staging member users are required.')
  const member = users[0]
  const member2 = users[1]
  const { data: dimensions, error: dimensionsError } = await admin.from('brands').select('id').limit(1).single()
  if (dimensionsError || !dimensions) throw new Error('An existing staging brand is required.')
  const { data: platform, error: platformError } = await admin.from('platforms').select('id').limit(1).single()
  if (platformError || !platform) throw new Error('An existing staging platform is required.')

  const makeShift = async (suffix: string): Promise<{ id: string; version: number }> => {
    const id = `${prefix}-${suffix}`
    const { data, error } = await admin.from('shifts').insert({
      id, date: '2099-12-01', start_time: '10:00', end_time: '12:00',
      timezone: 'Asia/Ho_Chi_Minh', start_at: '2099-12-01T03:00:00.000Z', end_at: '2099-12-01T05:00:00.000Z',
      end_date: '2099-12-01', crosses_midnight: false, duration_minutes: 120,
      brand_id: dimensions.id, platform_id: platform.id, required_host_count: 1,
      required_support_count: 1, required_technical_count: 1, registration_locked: false,
      registration_cutoff_at: '2099-11-30T03:00:00.000Z', status: 'scheduled',
    }).select('id,version').single()
    if (error || !data) throw new Error(`Fixture shift creation failed: ${error?.message ?? 'unknown error'}`)
    fixture.shiftIds.push(id)
    return data as { id: string; version: number }
  }

  try {
    const shift = await makeShift('shift')
    const race = await Promise.allSettled([
      rpc(adminClient, 'update_shift', { p_shift_id: shift.id, p_patch: { title: `${prefix}-winner-a` }, p_confirm_impact: false, p_expected_version: shift.version }),
      rpc(adminClient2, 'update_shift', { p_shift_id: shift.id, p_patch: { title: `${prefix}-winner-b` }, p_confirm_impact: false, p_expected_version: shift.version }),
    ])
    const successes = race.filter(item => item.status === 'fulfilled')
    if (successes.length !== 1) throw new Error(`Shift race expected one success, got ${successes.length}`)
    assertError(race.find(item => item.status === 'rejected') ?? race[0], 'P0001', 'STALE_WRITE')
    const { data: persisted } = await admin.from('shifts').select('title,version').eq('id', shift.id).single()
    if (!persisted || persisted.version !== 2) throw new Error('Shift race did not advance exactly once.')
    console.log('[PASS] shift revision race')

    const registrationShift = await makeShift('registration-shift')
    const registrationId = `${prefix}-registration`
    const { error: registrationError } = await admin.from('shift_registrations').insert({
      id: registrationId, shift_id: registrationShift.id, user_id: member.id,
      operational_role: 'host', status: 'pending', source: 'self_registration',
    })
    if (registrationError) throw new Error(`Fixture registration creation failed: ${registrationError.message}`)
    fixture.registrationIds.push(registrationId)
    const { data: registration } = await admin.from('shift_registrations').select('version').eq('id', registrationId).single()
    if (!registration) throw new Error('Fixture registration could not be read.')
    const registrationRace = await Promise.allSettled([
      rpc(adminClient, 'approve_shift_registration', { p_registration_id: registrationId, p_notes: prefix, p_expected_version: registration.version }),
      rpc(memberClient, 'cancel_own_shift_registration', { p_registration_id: registrationId, p_notes: prefix, p_expected_version: registration.version }),
    ])
    if (registrationRace.filter(item => item.status === 'fulfilled').length !== 1) throw new Error('Registration race did not serialize to one winner.')
    assertError(registrationRace.find(item => item.status === 'rejected') ?? registrationRace[0], 'P0001', 'STALE_WRITE')
    console.log('[PASS] registration revision race')

    const swapShift = await makeShift('swap-shift')
    const swapRegistrationId = `${prefix}-swap-registration`
    const { error: swapRegistrationError } = await admin.from('shift_registrations').insert({
      id: swapRegistrationId, shift_id: swapShift.id, user_id: member.id,
      operational_role: 'host', status: 'manually_assigned', source: 'manual_assignment',
    })
    if (swapRegistrationError) throw new Error(`Fixture swap registration creation failed: ${swapRegistrationError.message}`)
    fixture.registrationIds.push(swapRegistrationId)
    const swap = await rpc(memberClient, 'create_shift_swap_request', {
      p_source_registration_id: swapRegistrationId, p_mode: 'replacement', p_reason: prefix,
      p_target_shift_id: null, p_replacement_staff_id: member2.id, p_counterpart_registration_id: null, p_notes: prefix,
    }) as { id: string; version: number }
    fixture.swapIds.push(swap.id)
    const swapRace = await Promise.allSettled([
      rpc(member2Client, 'respond_shift_swap_request', { p_request_id: swap.id, p_action: 'accept', p_notes: prefix, p_expected_version: swap.version }),
      rpc(memberClient, 'cancel_own_shift_swap_request', { p_request_id: swap.id, p_reason: prefix, p_expected_version: swap.version }),
    ])
    if (swapRace.filter(item => item.status === 'fulfilled').length !== 1) throw new Error('Swap race did not serialize to one winner.')
    assertError(swapRace.find(item => item.status === 'rejected') ?? swapRace[0], 'P0001', 'STALE_WRITE')
    console.log('[PASS] swap revision race')

    const nullResult = await Promise.allSettled([
      rpc(adminClient, 'update_shift', { p_shift_id: shift.id, p_patch: { title: prefix }, p_confirm_impact: false, p_expected_version: null }),
    ])
    assertError(nullResult[0], 'P0001', 'EXPECTED_VERSION_REQUIRED')
    console.log('[PASS] null expected-version guard')
  } finally {
    if (fixture.swapIds.length) await admin.from('swap_requests').delete().in('id', fixture.swapIds)
    if (fixture.registrationIds.length) await admin.from('shift_registrations').delete().in('id', fixture.registrationIds)
    if (fixture.shiftIds.length) await admin.from('shifts').delete().in('id', fixture.shiftIds)
    const { data: leftovers } = await admin.from('shifts').select('id').like('id', `${prefix}%`)
    if (leftovers && leftovers.length) throw new Error(`Fixture cleanup left ${leftovers.length} shift rows.`)
  }
}

main().catch(error => {
  console.error(`[FAIL] ${error instanceof Error ? error.message : 'Unknown P1-B concurrency UAT failure.'}`)
  process.exitCode = 1
})
