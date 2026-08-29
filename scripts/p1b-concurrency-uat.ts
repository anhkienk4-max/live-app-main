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
type FixtureSlot = {
  date: string
  startTime: string
  endTime: string
  startAt: string
  endAt: string
}

const fixtureSlots: Record<string, FixtureSlot> = {
  shift: {
    date: '2099-12-01', startTime: '10:00', endTime: '12:00',
    startAt: '2099-12-01T03:00:00.000Z', endAt: '2099-12-01T05:00:00.000Z',
  },
  'registration-shift': {
    date: '2099-12-01', startTime: '13:00', endTime: '15:00',
    startAt: '2099-12-01T06:00:00.000Z', endAt: '2099-12-01T08:00:00.000Z',
  },
  'swap-shift': {
    date: '2099-12-01', startTime: '16:00', endTime: '18:00',
    startAt: '2099-12-01T09:00:00.000Z', endAt: '2099-12-01T11:00:00.000Z',
  },
}

function env(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}

function normalizeEmail(value: unknown): string {
  return String(value ?? '').trim().toLowerCase()
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

async function assertAuthenticated(client: SupabaseClient, label: string): Promise<string> {
  const { data, error } = await client.auth.getUser()
  if (error || !data.user?.id) throw new Error(`${label} staging authentication did not produce a user session.`)
  return data.user.id
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
  const [adminAuthId, admin2AuthId, memberAuthId, member2AuthId] = await Promise.all([
    assertAuthenticated(adminClient, 'Admin'),
    assertAuthenticated(adminClient2, 'Admin (second session)'),
    assertAuthenticated(memberClient, 'Member'),
    assertAuthenticated(member2Client, 'Member 2'),
  ])
  if (adminAuthId !== admin2AuthId) throw new Error('Independent Admin sessions resolved to different identities.')
  const prefix = `p1b-race-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const fixture: Fixture = { shiftIds: [], registrationIds: [], swapIds: [] }

  const memberEmail = normalizeEmail(env('P1B_RACE_MEMBER_EMAIL'))
  const member2Email = normalizeEmail(env('P1B_RACE_MEMBER_2_EMAIL'))
  const { data: users, error: usersError } = await admin.from('business_users').select('id,auth_user_id,email').in('email', [memberEmail, member2Email])
  if (usersError || !users) throw new Error('Unable to read mapped staging member users.')
  const mappedUsers = new Map<string, { id: string; auth_user_id: string | null; email: string | null }>()
  for (const row of users) {
    const email = normalizeEmail(row.email)
    if (![memberEmail, member2Email].includes(email)) continue
    if (mappedUsers.has(email)) throw new Error(`Ambiguous business user mapping for ${email}.`)
    mappedUsers.set(email, row as { id: string; auth_user_id: string | null; email: string | null })
  }
  if (mappedUsers.size !== 2) throw new Error('Both configured staging member emails must map to exactly one business user.')
  const member = mappedUsers.get(memberEmail)!
  const member2 = mappedUsers.get(member2Email)!
  if (member.auth_user_id !== memberAuthId || member2.auth_user_id !== member2AuthId) {
    throw new Error('Configured member sessions do not match their mapped business users.')
  }
  const { data: dimensions, error: dimensionsError } = await admin.from('brands').select('id').limit(1).single()
  if (dimensionsError || !dimensions) throw new Error('An existing staging brand is required.')
  const { data: platform, error: platformError } = await admin.from('platforms').select('id').limit(1).single()
  if (platformError || !platform) throw new Error('An existing staging platform is required.')

  const makeShift = async (suffix: keyof typeof fixtureSlots): Promise<{ id: string; version: number }> => {
    const id = `${prefix}-${suffix}`
    const slot = fixtureSlots[suffix]
    const { data, error } = await admin.from('shifts').insert({
      id, date: slot.date, start_time: slot.startTime, end_time: slot.endTime,
      timezone: 'Asia/Ho_Chi_Minh', start_at: slot.startAt, end_at: slot.endAt,
      end_date: slot.date, crosses_midnight: false, duration_minutes: 120,
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
    const shiftTitle = persisted?.title
    if (!persisted || persisted.version !== shift.version + 1 || ![`${prefix}-winner-a`, `${prefix}-winner-b`].includes(shiftTitle)) {
      throw new Error('Shift race did not preserve one winner and advance exactly once.')
    }
    console.log('[PASS] shift revision race')

    const registrationShift = await makeShift('registration-shift')
    const registration = await rpc(memberClient, 'register_for_shift', {
      p_shift_id: registrationShift.id,
      p_role: 'host',
    }) as { id?: string; version?: number }
    const registrationId = registration.id
    const registrationVersion = registration.version
    if (!registrationId || !Number.isInteger(registrationVersion)) throw new Error('Authenticated registration fixture creation returned no revision.')
    fixture.registrationIds.push(registrationId)
    const registrationRace = await Promise.allSettled([
      rpc(adminClient, 'approve_shift_registration', { p_registration_id: registrationId, p_notes: prefix, p_expected_version: registrationVersion }),
      rpc(memberClient, 'cancel_own_shift_registration', { p_registration_id: registrationId, p_notes: prefix, p_expected_version: registrationVersion }),
    ])
    const registrationWinners = registrationRace.filter(item => item.status === 'fulfilled')
    if (registrationWinners.length !== 1) throw new Error('Registration race did not serialize to one winner.')
    assertError(registrationRace.find(item => item.status === 'rejected') ?? registrationRace[0], 'P0001', 'STALE_WRITE')
    const { data: persistedRegistration, error: persistedRegistrationError } = await admin.from('shift_registrations').select('status,version').eq('id', registrationId).single()
    if (persistedRegistrationError || !persistedRegistration || persistedRegistration.version !== registrationVersion + 1 || !['approved', 'cancelled'].includes(persistedRegistration.status)) {
      throw new Error('Registration race final state/version is inconsistent.')
    }
    const registrationWinner = (registrationWinners[0] as PromiseFulfilledResult<{ status?: string }>).value
    if (registrationWinner?.status && registrationWinner.status !== persistedRegistration.status) throw new Error('Registration race final state does not match the winner.')
    console.log('[PASS] registration revision race')

    const swapShift = await makeShift('swap-shift')
    const swapRegistration = await rpc(adminClient, 'manual_assign_shift_staff', {
      p_shift_id: swapShift.id,
      p_user_id: member.id,
      p_role: 'host',
      p_notes: prefix,
      p_expected_version: swapShift.version,
    }) as { id?: string; version?: number }
    const swapRegistrationId = swapRegistration.id
    if (!swapRegistrationId) throw new Error('Authenticated swap fixture assignment returned no registration.')
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
    const swapWinners = swapRace.filter(item => item.status === 'fulfilled')
    if (swapWinners.length !== 1) throw new Error('Swap race did not serialize to one winner.')
    assertError(swapRace.find(item => item.status === 'rejected') ?? swapRace[0], 'P0001', 'STALE_WRITE')
    const { data: persistedSwap, error: persistedSwapError } = await admin.from('swap_requests').select('status,version').eq('id', swap.id).single()
    if (persistedSwapError || !persistedSwap || persistedSwap.version !== swap.version + 1 || !['accepted', 'cancelled'].includes(persistedSwap.status)) {
      throw new Error('Swap race final state/version is inconsistent.')
    }
    const swapWinner = (swapWinners[0] as PromiseFulfilledResult<{ status?: string }>).value
    if (swapWinner?.status && swapWinner.status !== persistedSwap.status) throw new Error('Swap race final state does not match the winner.')
    console.log('[PASS] swap revision race')

    const nullResult = await Promise.allSettled([
      rpc(adminClient, 'update_shift', { p_shift_id: shift.id, p_patch: { title: prefix }, p_confirm_impact: false, p_expected_version: null }),
    ])
    assertError(nullResult[0], 'P0001', 'EXPECTED_VERSION_REQUIRED')
    console.log('[PASS] null expected-version guard')
  } finally {
    if (fixture.swapIds.length) {
      const { error } = await admin.from('swap_requests').delete().in('id', fixture.swapIds)
      if (error) throw new Error(`Swap fixture cleanup failed: ${error.message}`)
    }
    if (fixture.registrationIds.length) {
      const { error } = await admin.from('shift_registrations').delete().in('id', fixture.registrationIds)
      if (error) throw new Error(`Registration fixture cleanup failed: ${error.message}`)
    }
    if (fixture.shiftIds.length) {
      const { error } = await admin.from('shifts').delete().in('id', fixture.shiftIds)
      if (error) throw new Error(`Shift fixture cleanup failed: ${error.message}`)
    }
    const [leftoverSwaps, leftoverRegistrations, leftoverShifts] = await Promise.all([
      fixture.swapIds.length ? admin.from('swap_requests').select('id').in('id', fixture.swapIds) : Promise.resolve({ data: [], error: null }),
      fixture.registrationIds.length ? admin.from('shift_registrations').select('id').in('id', fixture.registrationIds) : Promise.resolve({ data: [], error: null }),
      admin.from('shifts').select('id').like('id', `${prefix}%`),
    ])
    if (leftoverSwaps.error || leftoverRegistrations.error || leftoverShifts.error) throw new Error('Fixture cleanup verification query failed.')
    if (leftoverSwaps.data?.length || leftoverRegistrations.data?.length || leftoverShifts.data?.length) {
      throw new Error('Fixture cleanup left one or more swap, registration, or shift rows.')
    }
  }
}

main().catch(error => {
  console.error(`[FAIL] ${error instanceof Error ? error.message : 'Unknown P1-B concurrency UAT failure.'}`)
  process.exitCode = 1
})
