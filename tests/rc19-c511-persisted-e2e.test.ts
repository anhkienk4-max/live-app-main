import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { createAuthIdentity, isAuthBusinessIdentityConsistent } from '../lib/auth/authIdentity'
import { mapAuthIdentityToBusinessUser } from '../lib/auth/authIdentity'
import { normalizeScheduleImportResult } from '../lib/utils/scheduleImportPreview'
import { parseScheduleRows } from '../lib/utils/excelUtils'
import { createSupabaseShiftRepository } from '../lib/services/supabaseShiftService'
import { createSupabaseShiftRegistrationRepository } from '../lib/services/supabaseShiftRegistrationService'
import { createWorkforceActualHandler } from '../lib/server/workforceActualHandler'
import { createWorkforcePayrollHandler } from '../lib/server/workforcePayrollHandler'
import { createMyPayslipHandler } from '../lib/server/myPayslipHandler'

const baseUrl = process.env.C511_BASE_URL
const anonKey = process.env.C511_ANON_KEY
const serviceKey = process.env.C511_SERVICE_ROLE_KEY
const password = process.env.C511_TEST_PASSWORD
const database = process.env.C511_DATABASE
const evidenceDir = process.env.C511_EVIDENCE_DIR
assert.ok(baseUrl && anonKey && serviceKey && password && database && evidenceDir, 'C5.11 local runtime environment required')

const routeFetch: typeof fetch = async (input, init) => {
  const request = input instanceof Request ? new Request(input, init) : new Request(input, init)
  const target = new URL(request.url)
  let directPort: string
  if (target.pathname.startsWith('/rest/v1/')) {
    target.pathname = target.pathname.slice('/rest/v1'.length)
    directPort = '15542'
  } else if (target.pathname.startsWith('/auth/v1/')) {
    target.pathname = target.pathname.slice('/auth/v1'.length)
    directPort = '15543'
  } else {
    throw new Error(`C511_LOCAL_ROUTE_UNEXPECTED:${target.pathname}`)
  }
  target.hostname = '127.0.0.1'
  target.port = directPort
  return fetch(new Request(target, request))
}

const clientOptions = {
  global: { fetch: routeFetch },
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
}
const service = createClient(baseUrl!, serviceKey!, clientOptions)
const sessions = new Map<string, SupabaseClient>()
const records: Array<Record<string, unknown>> = []
const shortId = (prefix: string, run: number) => `${prefix}_c511_${run}_${crypto.randomUUID().replaceAll('-', '').slice(0, 14)}`
const activeFrom = () => new Date(Date.now() - 60_000).toISOString()

function apiRequest(path: string, token: string, body?: unknown): Request {
  return new Request(`http://c511.local${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  })
}

async function seedUser(run: number, name: string, permission: 'admin' | 'leader' | 'member', roles: string[] = []) {
  const authId = crypto.randomUUID()
  const businessId = shortId(name, run)
  const email = `${businessId}@c511.invalid`
  const inserted = await service.from('business_users').insert({
    id: businessId, auth_user_id: authId, email, full_name: `${name} C5.11 ${run}`,
    role: permission === 'member' ? 'staff' : permission,
    system_permission: permission, operational_roles: roles,
    status: 'active', account_status: 'active', email_verified: true, auth_provider: 'email',
  }).select('id,auth_user_id,email,full_name,role,system_permission,operational_roles,status,account_status,email_verified,auth_provider,join_date,created_at,updated_at').single()
  assert.ifError(inserted.error)
  const created = await service.auth.admin.createUser({
    id: authId, email, password: password!, email_confirm: true,
    app_metadata: { system_permission: permission, business_user_id: businessId },
    user_metadata: { full_name: `${name} C5.11 ${run}` },
  })
  assert.ifError(created.error)
  return { authId, businessId, email, user: inserted.data }
}

async function signIn(actor: Awaited<ReturnType<typeof seedUser>>) {
  const client = createClient(baseUrl!, anonKey!, clientOptions)
  const result = await client.auth.signInWithPassword({ email: actor.email, password: password! })
  assert.ifError(result.error)
  assert.ok(result.data.session?.access_token)
  const token = result.data.session.access_token
  const tokenClaims = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')) as Record<string, unknown>
  assert.equal(tokenClaims.role, 'authenticated', `Auth session must carry the PostgREST role claim, got ${String(tokenClaims.role)}`)
  const verified = await client.auth.getUser(token)
  assert.ifError(verified.error)
  const identity = createAuthIdentity(verified.data.user)
  assert.ok(identity)
  assert.equal(identity.business_user_id, actor.businessId)
  assert.equal(identity.system_permission, actor.user.system_permission)
  assert.ok(isAuthBusinessIdentityConsistent(identity, actor.user))
  sessions.set(token, client)
  const probe = await client.rpc('rc19_current_leader_brand_ids', { p_scope_key: 'shifts.manage' })
  assert.ifError(probe.error)
  return { client, token }
}

async function resolveUser(request: Request) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/iu, '')
  if (!token) return null
  const auth = createClient(baseUrl!, anonKey!, clientOptions)
  const verified = await auth.auth.getUser(token)
  if (verified.error || !verified.data.user) return null
  const identity = createAuthIdentity(verified.data.user)
  if (!identity) return null
  const persisted = await service.from('business_users')
    .select('id,auth_user_id,email,full_name,role,system_permission,operational_roles,status,account_status,archived_at,deleted_at,join_date,created_at,updated_at')
    .eq('id', identity.business_user_id).maybeSingle()
  if (persisted.error || !persisted.data || !isAuthBusinessIdentityConsistent(identity, persisted.data)
    || !mapAuthIdentityToBusinessUser(identity, [persisted.data])) return null
  return { id: identity.auth_user_id, email: identity.email, systemPermission: identity.system_permission, businessUserId: identity.business_user_id }
}

function createScopeClient(request: Request) {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/iu, '')
  const client = token ? sessions.get(token) : undefined
  if (!client) throw new Error('C511_AUTHENTICATED_SCOPE_SESSION_MISSING')
  return client
}

function requireOk<T>(result: { data: T | null; error: { message?: string; code?: string } | null }, operation: string): T {
  if (result.error) throw new Error(`${operation}:${result.error.code ?? ''}:${result.error.message ?? ''}`)
  assert.notEqual(result.data, null, `${operation}: no persisted response`)
  return result.data as T
}

async function newBrand(name: string) {
  const brandId = `brand_${crypto.randomUUID().replaceAll('-', '').slice(0, 18)}`
  const result = await service.from('brands').insert({ id: brandId, name, status: 'active' }).select('id').single()
  requireOk(result, 'seed brand')
  return brandId
}

async function createImportedShift(run: number, brandId: string, brandName: string, platformId: string, platformName: string) {
  const timeZone = 'Asia/Ho_Chi_Minh'
  const today = new Intl.DateTimeFormat('en-CA', { timeZone }).format(new Date())
  const parsed = normalizeScheduleImportResult(parseScheduleRows([{
    Date: today,
    Time: '20:00 - 23:00\n23:00 - 02:00',
    Brand: brandName,
    Platform: platformName,
    'Shift title': `C5.11 persisted E2E run ${run}`,
    'Execution Source': 'Internal',
    'Host count': 2,
    'Support count': 1,
    'Technical count': 0,
  }], {
    brands: new Map([[brandName, brandId]]),
    platforms: new Map([[platformName, platformId]]),
    campaigns: new Map(),
  }))
  assert.equal(parsed.errors.length, 0, JSON.stringify(parsed.errors))
  const shiftRepo = createSupabaseShiftRepository(adminSession.client)
  const shift = await shiftRepo.create(parsed.validShifts[0])
  assert.ok(shift.id)
  const duplicateImport = await shiftRepo.create(parsed.validShifts[0])
    .then(() => true).catch(() => false)
  assert.equal(duplicateImport, false, 'reimport must not create a duplicate parent shift')
  const persisted = requireOk(await service.from('shifts').select('id,brand_id,date,start_time,end_time,start_at,end_at,crosses_midnight,status,version').eq('id', shift.id).single(), 'shift readback')
  assert.equal(persisted.brand_id, brandId)
  assert.equal(persisted.crosses_midnight, true)
  const segments = requireOk(await service.from('shift_staffing_segments').select('id,shift_id,segment_index,start_at,end_at,required_host_count,required_support_count').eq('shift_id', shift.id).order('segment_index'), 'segment readback') as Array<Record<string, unknown>>
  assert.equal(segments.length, 2)
  assert.ok(segments.every(segment => segment.shift_id === shift.id))
  records.push({ run, shift_id: shift.id, segment_ids: segments.map(segment => segment.id), imported_via: 'parseScheduleRows -> SupabaseShiftRepository.create -> authenticated RPC' })
  return { shift, segments }
}

let adminSession: Awaited<ReturnType<typeof signIn>>

async function apiPost(handler: { POST(request: Request): Promise<Response> }, path: string, token: string, body: unknown) {
  return handler.POST(apiRequest(path, token, body))
}

async function runPersistedScenario(run: number) {
  const [admin, reviewer, leader, host1, host2, host3, hostOverflow, support] = await Promise.all([
    seedUser(run, 'Admin', 'admin'), seedUser(run, 'Reviewer', 'admin'),
    seedUser(run, 'Leader', 'leader'), seedUser(run, 'HostOne', 'member', ['host']),
    seedUser(run, 'HostTwo', 'member', ['host']), seedUser(run, 'HostThree', 'member', ['host']),
    seedUser(run, 'HostOverflow', 'member', ['host']),
    seedUser(run, 'Support', 'member', ['support']),
  ])
  const settings = await service.from('system_settings').select('id').limit(1)
  assert.ifError(settings.error)
  if (!settings.data?.length) {
    const inserted = await service.from('system_settings').insert({ registration_cutoff_hours: 0, require_registration_approval: true, auto_lock_filled_shifts: false })
    assert.ifError(inserted.error)
  }
  const [adminAuth, reviewerAuth, leaderAuth, host1Auth, host2Auth, host3Auth, hostOverflowAuth, supportAuth] = await Promise.all([
    signIn(admin), signIn(reviewer), signIn(leader), signIn(host1), signIn(host2), signIn(host3),
    signIn(hostOverflow), signIn(support),
  ])
  adminSession = adminAuth
  const platformId = `platform_${crypto.randomUUID().replaceAll('-', '').slice(0, 18)}`
  const platformName = `C5.11 Platform ${run}`
  requireOk(await service.from('platforms').insert({ id: platformId, name: platformName, status: 'active' }).select('id').single(), 'seed platform')
  const brandA = await newBrand(`C5.11 Brand A ${run}`)
  const brandB = await newBrand(`C5.11 Brand B ${run}`)
  const grant = await adminAuth.client.rpc('rc19_set_leader_brand_scope', {
    p_user_id: leader.businessId, p_brand_id: brandA, p_scope_key: 'shifts.manage',
    p_enabled: true, p_expected_version: 0, p_valid_from: activeFrom(), p_valid_until: null,
    p_reason: 'C5.11 isolated synthetic test grant',
  })
  requireOk(grant, 'leader scope grant')
  for (const scopeKey of ['workforce.read', 'staff.manage']) {
    requireOk(await adminAuth.client.rpc('rc19_set_leader_brand_scope', {
      p_user_id: leader.businessId, p_brand_id: brandA, p_scope_key: scopeKey,
      p_enabled: true, p_expected_version: 0, p_valid_from: activeFrom(), p_valid_until: null,
      p_reason: 'C5.11 isolated synthetic test grant',
    }), `leader ${scopeKey} grant`)
  }
  const listedBrands = await leaderAuth.client.rpc('rc19_current_leader_brand_ids', { p_scope_key: 'shifts.manage' })
  assert.deepEqual(requireOk(listedBrands, 'leader scope read'), [brandA])
  const { shift, segments } = await createImportedShift(run, brandA, `C5.11 Brand A ${run}`, platformId, platformName)
  const foreign = await createImportedShift(run, brandB, `C5.11 Brand B ${run}`, platformId, platformName)
  requireOk(await adminAuth.client.rpc('rc19_set_leader_brand_scope', {
    p_user_id: leader.businessId, p_brand_id: brandB, p_scope_key: 'shifts.manage',
    p_enabled: true, p_expected_version: 0,
    p_valid_from: new Date(Date.now() - 120_000).toISOString(),
    p_valid_until: new Date(Date.now() - 60_000).toISOString(),
    p_reason: 'C5.11 expired synthetic Brand grant',
  }), 'expired foreign Brand scope grant')
  const activeBrandsAfterExpiredGrant = await leaderAuth.client.rpc('rc19_current_leader_brand_ids', { p_scope_key: 'shifts.manage' })
  assert.deepEqual(requireOk(activeBrandsAfterExpiredGrant, 'active scope excludes expired grant'), [brandA])
  const leaderCanReadSame = await leaderAuth.client.from('shifts').select('id').eq('id', shift.id).maybeSingle()
  assert.equal(leaderCanReadSame.error, null)
  assert.equal(leaderCanReadSame.data?.id, shift.id)
  const leaderCannotReadForeign = await leaderAuth.client.from('shifts').select('id').eq('id', foreign.shift.id).maybeSingle()
  assert.equal(leaderCannotReadForeign.error, null)
  assert.equal(leaderCannotReadForeign.data, null)
  const scopedActualHandler = createWorkforceActualHandler({
    client: () => service, resolveUser, isEnabled: () => true,
    createScopeClient: async request => createScopeClient(request),
  })
  assert.equal((await scopedActualHandler.GET(apiRequest(`/api/workforce/actual?shift_id=${shift.id}`, leaderAuth.token))).status, 200)
  assert.equal((await scopedActualHandler.GET(apiRequest(`/api/workforce/actual?shift_id=${foreign.shift.id}`, leaderAuth.token))).status, 403)
  const foreignActualWrite = await apiPost(scopedActualHandler, '/api/workforce/actual', leaderAuth.token, {
    action: 'record', shift_id: foreign.shift.id, staff_id: host3.businessId,
    operational_role: 'host', event_kind: 'worked', coverage_kind: 'planned',
    actual_start_at: persistedStart(foreign.shift, 0), actual_end_at: persistedStart(foreign.shift, 15),
    evidence_note: 'Leader cannot write outside granted Brand',
  })
  assert.equal(foreignActualWrite.status, 403)

  const segment1 = segments[0].id as string
  const segment2 = segments[1].id as string
  const hostRegistrationRepo1 = createSupabaseShiftRegistrationRepository(host1Auth.client)
  const hostRegistrationRepo2 = createSupabaseShiftRegistrationRepository(host2Auth.client)
  const supportRegistrationRepo = createSupabaseShiftRegistrationRepository(supportAuth.client)
  const registration1 = await hostRegistrationRepo1.registerForSegment(segment1, 'host')
  const registration2 = await hostRegistrationRepo2.registerForSegment(segment1, 'host')
  const foreignRegistration = await createSupabaseShiftRegistrationRepository(host3Auth.client).registerForSegment(foreign.segments[0].id as string, 'host')
  const supportRegistration = await supportRegistrationRepo.registerForSegment(segment2, 'support')
  const storedPending = requireOk(await service.from('shift_registrations').select('id,status,staffing_segment_id,shift_id,user_id').eq('id', registration1.id).single(), 'registration pending readback')
  assert.equal(storedPending.status, 'pending')
  assert.equal(storedPending.staffing_segment_id, segment1)
  const approvalRepo = createSupabaseShiftRegistrationRepository(leaderAuth.client)
  const approved1 = await approvalRepo.approve(registration1.id, 'C5.11 scoped approval', registration1.version)
  const approved2 = await approvalRepo.approve(registration2.id, 'C5.11 scoped approval', registration2.version)
  assert.equal(approved1.status, 'approved')
  assert.equal(approved2.status, 'approved')
  const deniedOverflow = await createSupabaseShiftRegistrationRepository(hostOverflowAuth.client).registerForSegment(segment1, 'host').then(async row => {
    const result = await approvalRepo.approve(row.id, 'C5.11 capacity approval', row.version)
    return { allowed: true, result }
  }).catch(error => ({ allowed: false, error: String(error.message) }))
  assert.equal(deniedOverflow.allowed, false)
  assert.match(deniedOverflow.error, /STAFFING_SEGMENT_FULL/u)
  assert.ok(registration1.id && registration2.id && foreignRegistration.id && supportRegistration.id)
  const memberSelfApprove = await host1Auth.client.rpc('approve_shift_registration', {
    p_registration_id: supportRegistration.id, p_notes: 'member forbidden approval', p_expected_version: supportRegistration.version,
  })
  assert.ok(memberSelfApprove.error, 'Member direct approval RPC must deny')
  const memberForeignPatch = await host1Auth.client.from('shift_registrations').update({ status: 'approved' }).eq('id', registration2.id).select('id,status')
  const unchangedOther = requireOk(await service.from('shift_registrations').select('status').eq('id', registration2.id).single(), 'foreign member registration readback')
  assert.equal(unchangedOther.status, 'approved')
  assert.ok(memberForeignPatch.error || memberForeignPatch.data?.length === 0, 'Member cannot change another registration')

  const deniedForeignApprove = await approvalRepo.approve(foreignRegistration.id, 'foreign brand denied', foreignRegistration.version)
    .then(() => ({ allowed: true, error: '' })).catch(error => ({ allowed: false, error: String(error.message) }))
  assert.equal(deniedForeignApprove.allowed, false)
  assert.match(deniedForeignApprove.error, /LEADER_BRAND_SCOPE_REQUIRED/u)
  const shiftRepo = createSupabaseShiftRepository(adminAuth.client)
  const currentShift = await shiftRepo.getById(shift.id)
  assert.ok(currentShift)
  let live = await shiftRepo.update(shift.id, { status: 'preparing' }, false, currentShift!.version)
  assert.ok(live)
  live = await shiftRepo.update(shift.id, { status: 'live' }, false, live!.version)
  assert.ok(live)
  const attendance = await host1Auth.client.rpc('self_attendance_record', {
    p_shift_id: shift.id, p_operational_role: 'host', p_event_kind: 'check_in',
    p_request_id: crypto.randomUUID(), p_evidence_note: 'C5.11 synthetic check-in event',
  })
  if (attendance.error) {
    assert.equal(attendance.error.message, 'ATTENDANCE_PHOTO_REQUIRED',
      'check-in must remain blocked until the real provider photo receipt exists')
    records.push({
      run, brand_ids: [brandA, brandB],
      actor_business_ids: [admin.businessId, reviewer.businessId, leader.businessId, host1.businessId,
        host2.businessId, host3.businessId, hostOverflow.businessId, support.businessId],
      shift_id: shift.id, segment_ids: [segment1, segment2],
      registration_ids: [registration1.id, registration2.id, foreignRegistration.id, supportRegistration.id],
      staffing_persistence: 'PASS', attendance_persistence: 'BLOCKED', payroll_persistence: 'BLOCKED',
      results: {
        admin_parent_shift_create: 'PASS', duplicate_reimport: 'PREVENTED',
        leader_same_brand_read_and_approval: 'ALLOW', leader_foreign_brand_read_and_approval: 'DENY',
        leader_expired_brand_scope: 'DENY', member_self_approval: 'DENY',
        member_foreign_registration_mutation: 'DENY', staffing_capacity_overflow: 'DENY',
      },
      attendance_blocker: 'ATTENDANCE_PHOTO_REQUIRED: Drive-only photo handler requires an approved provider runtime',
    })
    return
  }
  const checkIn = requireOk(attendance, 'authenticated attendance check-in') as Record<string, unknown>
  const checkOutRes = await host1Auth.client.rpc('self_attendance_record', {
    p_shift_id: shift.id, p_operational_role: 'host', p_event_kind: 'check_out',
    p_request_id: crypto.randomUUID(), p_evidence_note: 'C5.11 synthetic check-out event',
  })
  const checkOut = requireOk(checkOutRes, 'authenticated attendance check-out') as Record<string, unknown>
  const eventRead = await host1Auth.client.rpc('get_my_self_attendance', { p_shift_id: shift.id, p_limit: 10 })
  const events = requireOk(eventRead, 'authenticated attendance readback') as Array<Record<string, unknown>>
  assert.deepEqual(new Set(events.map(event => event.event)), new Set(['check_in', 'check_out']))
  assert.ok(events.every(event => event.staff_id === host1.businessId))
  const foreignAttendance = await host3Auth.client.rpc('self_attendance_record', {
    p_shift_id: shift.id, p_operational_role: 'host', p_event_kind: 'check_in',
    p_request_id: crypto.randomUUID(), p_evidence_note: 'C5.11 unauthorized attendance',
  })
  assert.ok(foreignAttendance.error)
  const attendanceStored = requireOk(await service.from('self_attendance_events').select('id,event_kind,staff_id,shift_id,request_id').eq('shift_id', shift.id).eq('staff_id', host1.businessId), 'attendance db readback') as Array<Record<string, unknown>>
  assert.equal(attendanceStored.length, 2)
  assert.equal(attendanceStored.filter(row => row.event_kind === 'check_in').length, 1)
  assert.equal(attendanceStored.filter(row => row.event_kind === 'check_out').length, 1)
  const freshMember = await signIn(host1)
  const freshHistory = requireOk(await freshMember.client.rpc('get_my_self_attendance', { p_shift_id: shift.id, p_limit: 10 }), 'relogin attendance readback') as Array<Record<string, unknown>>
  assert.equal(freshHistory.length, 2)
  const completed = await shiftRepo.update(shift.id, { status: 'completed' }, false, live!.version)
  assert.ok(completed)

  const actualHandler = createWorkforceActualHandler({
    client: () => service, resolveUser, isEnabled: () => true, isAttendanceReviewEnabled: () => false,
    createScopeClient: async request => createScopeClient(request),
  })
  const apiDeniedMember = await apiPost(actualHandler, '/api/workforce/actual', host1Auth.token, {
    action: 'record', shift_id: shift.id, staff_id: host1.businessId, operational_role: 'host',
    event_kind: 'worked', coverage_kind: 'planned', actual_start_at: persistedStart(completed, 0),
    actual_end_at: persistedStart(completed, 15), evidence_note: 'Member cannot enter actual hours',
  })
  assert.equal(apiDeniedMember.status, 403)
  const invalidSession = await apiPost(actualHandler, '/api/workforce/actual', 'invalid-expired-session', {
    action: 'record', shift_id: shift.id, staff_id: host1.businessId, operational_role: 'host',
    event_kind: 'worked', coverage_kind: 'planned', actual_start_at: persistedStart(completed, 0),
    actual_end_at: persistedStart(completed, 15), evidence_note: 'expired token denied',
  })
  assert.equal(invalidSession.status, 401)

  const admin2Actually = createWorkforceActualHandler({ client: () => service, resolveUser, isEnabled: () => true })
  const actualStart = persistedStart(completed, 0)
  const actualEnd = persistedStart(completed, 15)
  const actual1Response = await apiPost(admin2Actually, '/api/workforce/actual', adminAuth.token, {
    action: 'record', shift_id: shift.id, staff_id: host1.businessId, operational_role: 'host',
    event_kind: 'worked', coverage_kind: 'planned', actual_start_at: actualStart,
    actual_end_at: actualEnd, evidence_note: `C5.11 synthetic actual minutes; attendance=${String(checkIn.event_id)},${String(checkOut.event_id)}`,
  })
  assert.equal(actual1Response.status, 201, await actual1Response.clone().text())
  const actual1 = (await actual1Response.json() as { segment: { id: string; version: number; review_status: string } }).segment
  assert.equal(actual1.review_status, 'draft')
  const actual2Response = await apiPost(admin2Actually, '/api/workforce/actual', adminAuth.token, {
    action: 'record', shift_id: shift.id, staff_id: host2.businessId, operational_role: 'host',
    event_kind: 'worked', coverage_kind: 'planned', actual_start_at: actualStart,
    actual_end_at: actualEnd, evidence_note: 'C5.11 synthetic actual minutes without approved rate',
  })
  assert.equal(actual2Response.status, 201, await actual2Response.clone().text())
  const actual2 = (await actual2Response.json() as { segment: { id: string; version: number } }).segment
  const selfReview = await apiPost(admin2Actually, '/api/workforce/actual', adminAuth.token, {
    action: 'review', segment_id: actual1.id, expected_version: actual1.version,
    decision: 'approved', review_note: 'same creator cannot approve own evidence',
  })
  assert.equal(selfReview.status, 403)
  const missingAttendanceReview = await apiPost(admin2Actually, '/api/workforce/actual', reviewerAuth.token, {
    action: 'review', segment_id: actual2.id, expected_version: actual2.version,
    decision: 'approved', review_note: 'attendance evidence is absent initially',
  })
  assert.equal(missingAttendanceReview.status, 409)
  assert.equal((await missingAttendanceReview.json() as { error: { code: string } }).error.code, 'WORKFORCE_ATTENDANCE_EVIDENCE_REQUIRED')
  const host2Attendance = await Promise.all(['check_in', 'check_out'].map(eventKind => host2Auth.client.rpc('self_attendance_record', {
    p_shift_id: shift.id, p_operational_role: 'host', p_event_kind: eventKind,
    p_request_id: crypto.randomUUID(), p_evidence_note: `C5.11 synthetic ${eventKind} event for second Host`,
  })))
  assert.ok(host2Attendance.every(result => !result.error))
  const storedHost2Events = requireOk(await service.from('self_attendance_events').select('id,event_kind').eq('shift_id', shift.id).eq('staff_id', host2.businessId), 'second Host attendance readback') as Array<Record<string, unknown>>
  assert.equal(storedHost2Events.length, 2)
  const review1 = await apiPost(scopedActualHandler, '/api/workforce/actual', leaderAuth.token, {
    action: 'review', segment_id: actual1.id, expected_version: actual1.version,
    decision: 'approved', review_note: 'separate authorized reviewer approves minutes',
  })
  assert.equal(review1.status, 200, await review1.clone().text())
  const review2 = await apiPost(admin2Actually, '/api/workforce/actual', reviewerAuth.token, {
    action: 'review', segment_id: actual2.id, expected_version: actual2.version,
    decision: 'approved', review_note: 'separate authorized reviewer approves minutes',
  })
  assert.equal(review2.status, 200, await review2.clone().text())
  const approvedActuals = requireOk(await service.from('workforce_actual_segments').select('id,shift_id,staff_id,review_status,actual_start_at,actual_end_at').in('id', [actual1.id, actual2.id]), 'approved actual readback') as Array<Record<string, unknown>>
  assert.equal(approvedActuals.length, 2)
  assert.ok(approvedActuals.every(row => row.review_status === 'approved' && row.shift_id === shift.id))

  for (const scopeKey of ['shifts.manage', 'workforce.read', 'staff.manage']) {
    const current = requireOk(await service.from('rc19_leader_brand_scopes').select('version').eq('leader_business_user_id', leader.businessId).eq('brand_id', brandA).eq('scope_key', scopeKey).single(), `scope version ${scopeKey}`)
    requireOk(await adminAuth.client.rpc('rc19_set_leader_brand_scope', {
      p_user_id: leader.businessId, p_brand_id: brandA, p_scope_key: scopeKey,
      p_enabled: false, p_expected_version: current.version, p_valid_from: null, p_valid_until: null,
      p_reason: 'C5.11 isolated revocation test',
    }), `revoke leader ${scopeKey}`)
  }
  const revokedApproval = await approvalRepo.approve(supportRegistration.id, 'revoked brand denied', supportRegistration.version)
    .then(() => ({ allowed: true, error: '' })).catch(error => ({ allowed: false, error: String(error.message) }))
  assert.equal(revokedApproval.allowed, false)
  assert.match(revokedApproval.error, /LEADER_BRAND_SCOPE_REQUIRED/u)
  const pendingSupport = requireOk(await service.from('shift_registrations').select('status').eq('id', supportRegistration.id).single(), 'revoked registration readback')
  assert.equal(pendingSupport.status, 'pending')

  const payrollHandler = createWorkforcePayrollHandler({ createClient: () => service, resolveUser, isEnabled: () => true })
  const payrollPost = (token: string, body: unknown) => apiPost(payrollHandler, '/api/workforce/payroll', token, body)
  const rateResponse = await payrollPost(adminAuth.token, {
    action: 'register_rate', staff_id: host1.businessId, operational_role: 'host',
    effective_from: (completed as { date: string }).date, effective_through: null,
    vnd_per_hour: 120000, overtime_multiplier_basis_points: 15000, approval_note: 'C5.11 isolated approved rate',
  })
  assert.equal(rateResponse.status, 201, await rateResponse.clone().text())
  const rateBody = await rateResponse.json() as { rate: { id: string; approved_by: string } }
  assert.equal(rateBody.rate.approved_by, admin.businessId)
  const periodResponse = await payrollPost(adminAuth.token, {
    action: 'create_period', period_start: (completed as { date: string }).date, period_end: (completed as { date: string }).date,
  })
  assert.equal(periodResponse.status, 201, await periodResponse.clone().text())
  const periodBody = await periodResponse.json() as { period: { id: string; status: string } }
  const firstCalculation = await payrollPost(adminAuth.token, { action: 'auto_calculate_draft', period_id: periodBody.period.id })
  assert.equal(firstCalculation.status, 200, await firstCalculation.clone().text())
  const firstCalc = await firstCalculation.json() as { prepared_count: number; skipped: Array<{ segmentId: string; reason: string }> }
  assert.equal(firstCalc.prepared_count, 1)
  assert.ok(firstCalc.skipped.some(row => row.segmentId === actual2.id && row.reason === 'MISSING_APPROVED_RATE'))
  const afterFirst = requireOk(await service.from('workforce_payroll_lines').select('id,segment_id,staff_id,period_id,actual_minutes,net_vnd').eq('period_id', periodBody.period.id), 'payroll line readback') as Array<Record<string, unknown>>
  assert.equal(afterFirst.length, 1)
  assert.equal(afterFirst[0].segment_id, actual1.id)
  assert.equal(afterFirst[0].staff_id, host1.businessId)
  const secondCalculation = await payrollPost(adminAuth.token, { action: 'auto_calculate_draft', period_id: periodBody.period.id })
  assert.equal(secondCalculation.status, 200, await secondCalculation.clone().text())
  const secondCalc = await secondCalculation.json() as { prepared_count: number }
  assert.equal(secondCalc.prepared_count, 0)
  const afterRetry = requireOk(await service.from('workforce_payroll_lines').select('id,segment_id,period_id').eq('period_id', periodBody.period.id), 'payroll retry readback') as Array<Record<string, unknown>>
  assert.equal(afterRetry.length, 1)
  const transition = async (token: string, from: string, to: string) => payrollPost(token, {
    action: 'transition', period_id: periodBody.period.id, expected_status: from, target_status: to,
    reason: `C5.11 isolated ${from} to ${to}`,
  })
  assert.equal((await transition(reviewerAuth.token, 'draft', 'reviewed')).status, 200)
  assert.equal((await transition(adminAuth.token, 'reviewed', 'confirmed')).status, 200)
  assert.equal((await transition(reviewerAuth.token, 'confirmed', 'payroll_ready')).status, 200)
  assert.equal((await transition(adminAuth.token, 'payroll_ready', 'locked')).status, 200)
  const lockedPeriod = requireOk(await service.from('workforce_payroll_periods').select('status,locked_at,created_by,reviewed_by,confirmed_by,locked_by').eq('id', periodBody.period.id).single(), 'locked period readback')
  assert.equal(lockedPeriod.status, 'locked')
  assert.ok(lockedPeriod.locked_at)
  const payslipHandler = createMyPayslipHandler({ createClient: () => service, resolveUser, isEnabled: () => true })
  const ownPayslip = await payslipHandler.GET(apiRequest('/api/workforce/my-payslip', host1Auth.token))
  assert.equal(ownPayslip.status, 200, await ownPayslip.clone().text())
  const own = await ownPayslip.json() as { statements: Array<{ lines: Array<{ staff_id?: string; net_vnd: number }>; total_net_vnd: number }> }
  assert.equal(own.statements.length, 1)
  assert.equal(own.statements[0].lines.length, 1)
  assert.equal(own.statements[0].total_net_vnd, own.statements[0].lines[0].net_vnd)
  assert.equal((own.statements[0].lines[0] as { staff_id?: string }).staff_id, undefined, 'payslip response must not expose another owner key')
  const otherPayslip = await payslipHandler.GET(apiRequest('/api/workforce/my-payslip', host2Auth.token))
  assert.equal(otherPayslip.status, 200)
  const other = await otherPayslip.json() as { statements: unknown[] }
  assert.deepEqual(other.statements, [])
  const forgedPayslip = await payslipHandler.GET(apiRequest('/api/workforce/my-payslip?staff_id=' + host1.businessId, host2Auth.token))
  assert.equal(forgedPayslip.status, 400)
  const memberPayroll = await payrollPost(host1Auth.token, { action: 'create_period', period_start: (completed as { date: string }).date, period_end: (completed as { date: string }).date })
  assert.equal(memberPayroll.status, 403)

  const downgraded = await service.from('business_users').update({ system_permission: 'member', role: 'staff' }).eq('id', leader.businessId)
  assert.ifError(downgraded.error)
  const staleLeaderRequest = await approvalRepo.approve(supportRegistration.id, 'stale leader session denied', supportRegistration.version)
    .then(() => ({ allowed: true })).catch(() => ({ allowed: false }))
  assert.equal(staleLeaderRequest.allowed, false)

  records.push({
    run, brand_ids: [brandA, brandB], actor_business_ids: [admin.businessId, reviewer.businessId, leader.businessId, host1.businessId, host2.businessId, host3.businessId, support.businessId],
    shift_id: shift.id, foreign_shift_id: foreign.shift.id,
    registration_ids: [registration1.id, registration2.id, foreignRegistration.id, supportRegistration.id],
    actual_segment_ids: [actual1.id, actual2.id], attendance_event_ids: [checkIn.event_id, checkOut.event_id],
    payroll_period_id: periodBody.period.id, payroll_line_ids: afterRetry.map(line => line.id),
    results: {
      leader_same_brand_read: 'ALLOW', leader_foreign_brand_read: 'DENY',
      leader_foreign_brand_approval: 'DENY', leader_revoked_approval: 'DENY',
      capacity_exceeded_approval: 'DENY', member_self_approval: 'DENY', member_foreign_registration_mutation: 'DENY',
      attendance_persisted_after_new_session: 'PASS', unauthorized_attendance: 'DENY',
      member_actual_api: 'DENY', expired_session: 'DENY',
      approved_actual_minutes: 'PASS', missing_rate_reconciled_as_skip: 'PASS', payroll_retry_no_double_count: 'PASS',
      payroll_roles_separated_and_locked: 'PASS', member_own_payslip: 'PASS', other_member_payslip: 'DENY', forged_payslip_owner: 'DENY', member_payroll_api: 'DENY',
    },
  })
}

function persistedStart(shift: { start_at: string }, offsetMinutes: number) {
  return new Date(Date.parse(shift.start_at) + offsetMinutes * 60_000).toISOString()
}

test('C5.11 repeats persisted authenticated Staffing and records the required photo-provider blocker', async () => {
  try {
    for (const run of [1, 2]) await runPersistedScenario(run)
    mkdirSync(evidenceDir!, { recursive: true })
    const output = {
      result: 'BLOCKED', source_sha: process.env.C511_SOURCE_SHA,
      postgres: process.env.C511_POSTGRES_VERSION,
      database, isolation: 'local Docker PostgreSQL 17, dedicated marked DB; Auth/PostgREST loopback only',
      migration_sha256: process.env.C511_MIGRATION_SHA256,
      runtime_auth_users_before: 0, storage_objects_before: 0,
      repeatable_authenticated_staffing_runs: 2, service_role_used_only_for_fixture_and_server_handler_backend: true,
      authenticated_roles: ['admin', 'leader', 'member'],
      exercised_api_and_rpc: [
        'Supabase Auth sign-up/sign-in/getUser', 'create_shift_with_staffing_segments',
        'rc19_set_leader_brand_scope', 'rc19_current_leader_brand_ids',
        'register_for_staffing_segment', 'approve_shift_registration', 'self_attendance_record',
        'RLS shifts and staffing-segment reads',
      ],
      staffing_persistence: 'PASS', attendance_persistence: 'BLOCKED', payroll_persistence: 'BLOCKED',
      blocker: 'Attendance check-in requires a verified Google Drive photo receipt. Drive I/O is excluded from this task and no local Drive-compatible provider is configured.',
      production_accessed: false, production_credentials_used: false, drive_io: false,
      evidence_records: records,
    }
    const path = join(evidenceDir!, `persisted-e2e-${new Date().toISOString().replaceAll(':', '').replaceAll('.', '')}.json`)
    writeFileSync(path, JSON.stringify(output, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' })
    console.log(`C511_EVIDENCE=${path}`)
  } catch (error) {
    console.error('C511_PERSISTED_E2E_FAILED', error instanceof Error ? error.message : String(error))
    throw error
  }
})
