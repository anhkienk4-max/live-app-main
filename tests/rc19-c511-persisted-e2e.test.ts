import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
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
import { createSelfAttendancePhotoGetHandler, createSelfAttendancePhotoPostHandler } from '../lib/server/selfAttendancePhotoHandler'
import { requirePermission } from '../lib/server/authGuards'
import { createAttendancePhotoReviewHandler } from '../lib/server/attendancePhotoReviewHandler'
import sharp from 'sharp'

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
    headers: { Authorization: `Bearer ${token}`, Origin: 'http://c511.local', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
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

function createLocalPhotoAdapter() {
  type Photo = { id: string; name: string; parent: string; bytes: Uint8Array }
  const photos = new Map<string, Photo>()
  const parents = new Set<string>()
  const driveFor = (root: string) => {
    if (!parents.has(root)) throw new Error('C511_LOCAL_PHOTO_PARENT_UNKNOWN')
    return { root, drive: {
      read: async (id: string) => {
        const photo = photos.get(id)
        if (!photo) throw new Error('C511_LOCAL_PHOTO_NOT_FOUND')
        return photo.bytes
      },
      getMetadata: async (id: string) => {
        const photo = photos.get(id)
        if (!photo) throw new Error('C511_LOCAL_PHOTO_NOT_FOUND')
        return { id: photo.id, name: photo.name, size_bytes: photo.bytes.byteLength, parent_ids: [photo.parent] }
      },
      delete: async (id: string) => { photos.delete(id) },
    } as never }
  }
  return {
    photos,
    post: createSelfAttendancePhotoPostHandler({
      authorize: request => requirePermission(request, 'attendance.record_own', resolveUser, async () => createScopeClient(request)),
      createAdmin: () => service as never,
      createSession: async request => createScopeClient(request) as never,
      createDrive: root => driveFor(root),
      prepareDestination: async (_client, input) => {
        const parentId = `c511-local-parent-${input.eventKind}-${crypto.randomUUID()}`
        parents.add(parentId)
        const drive = driveFor(parentId).drive
        const storage = { upload: async (asset: { name: string; mime_type: string; size_bytes: number; content: Uint8Array; external_parent_id: string }) => {
          const id = `c511-local-file-${crypto.randomUUID()}`
          const bytes = new Uint8Array(asset.content)
          if (asset.external_parent_id !== parentId || bytes.byteLength !== asset.size_bytes) throw new Error('C511_LOCAL_PHOTO_UPLOAD_INVALID')
          photos.set(id, { id, name: asset.name, parent: parentId, bytes })
          return { asset: { provider: 'google_drive', external_file_id: id, external_parent_id: parentId,
            name: asset.name, mime_type: asset.mime_type, size_bytes: bytes.byteLength } }
        } }
        return { drive, storage: storage as never, parentId, folderPath: `local-test/${input.eventKind}/${input.role}` }
      },
    }),
    get: createSelfAttendancePhotoGetHandler({
      authorize: request => requirePermission(request, 'attendance.record_own', resolveUser, async () => createScopeClient(request)),
      createAdmin: () => service as never,
      createSession: async request => createScopeClient(request) as never,
      createDrive: root => driveFor(root),
    }),
  }
}

async function submitAttendancePhoto(
  handler: ReturnType<typeof createLocalPhotoAdapter>['post'],
  token: string,
  shiftId: string,
  eventKind: 'check_in' | 'check_out',
  requestId = crypto.randomUUID(),
) {
  const background = eventKind === 'check_in' ? '#b84a32' : '#315ab8'
  const bytes = await sharp({ create: { width: 8, height: 8, channels: 3, background } }).jpeg().toBuffer()
  const form = new FormData()
  form.set('shift_id', shiftId)
  form.set('role', 'host')
  form.set('event_kind', eventKind)
  form.set('request_id', requestId)
  form.set('capture_source', eventKind === 'check_in' ? 'camera' : 'file_picker')
  form.set('file', new File([bytes], 'synthetic.jpg', { type: 'image/jpeg' }))
  const response = await handler(new Request('http://c511.local/api/workforce/self-attendance-photo', {
    method: 'POST', headers: { Origin: 'http://c511.local', Authorization: `Bearer ${token}` }, body: form,
  }))
  return { response, body: await response.json() as { ok: boolean; error?: { code: string }; event?: Record<string, unknown> }, requestId }
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

async function createImportedShift(run: number, brandId: string, brandName: string, platformId: string, platformName: string, startOffsetMinutes = 90) {
  const timeZone = 'Asia/Ho_Chi_Minh'
  const localParts = (value: Date) => Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(value).map(part => [part.type, part.value]))
  const start = localParts(new Date(Date.now() + startOffsetMinutes * 60_000))
  const middle = localParts(new Date(Date.now() + (startOffsetMinutes + 60) * 60_000))
  const end = localParts(new Date(Date.now() + (startOffsetMinutes + 120) * 60_000))
  const startDate = `${start.year}-${start.month}-${start.day}`
  const localTime = (parts: Record<string, string>) => `${parts.hour}:${parts.minute}`
  const parsed = normalizeScheduleImportResult(parseScheduleRows([{
    Date: startDate,
    Time: `${localTime(start)} - ${localTime(middle)}\n${localTime(middle)} - ${localTime(end)}`,
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
  assert.equal(persisted.crosses_midnight, end.day !== start.day)
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
    isPayrollEnabled: () => true,
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
  const approvedSupport = await approvalRepo.approve(supportRegistration.id, 'C5.11 scoped support approval', supportRegistration.version)
  assert.equal(approved1.status, 'approved')
  assert.equal(approved2.status, 'approved')
  assert.equal(approvedSupport.status, 'approved')
  const deniedOverflow = await createSupabaseShiftRegistrationRepository(hostOverflowAuth.client).registerForSegment(segment1, 'host')
    .then(async row => {
      await approvalRepo.approve(row.id, 'C5.11 capacity approval', row.version)
      return { allowed: true, error: '' }
    }).catch(error => ({ allowed: false, error: String(error.message) }))
  assert.equal(deniedOverflow.allowed, false)
  assert.match(deniedOverflow.error, /STAFFING_SEGMENT_FULL/u)
  const pendingRevocationRegistration = await createSupabaseShiftRegistrationRepository(hostOverflowAuth.client).registerForSegment(segment2, 'host')
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
  const photoAdapter = createLocalPhotoAdapter()
  const reviewApi = createAttendancePhotoReviewHandler({
    resolveUser,
    createClient: async () => reviewerAuth.client as never,
    createAdminClient: () => service as never,
    isEnabled: () => true,
  })
  const missingPhoto = await photoAdapter.post(new Request('http://c511.local/api/workforce/self-attendance-photo', {
    method: 'POST', headers: { Origin: 'http://c511.local', Authorization: `Bearer ${host1Auth.token}` },
    body: new FormData(),
  }))
  assert.equal(missingPhoto.status, 400, 'missing evidence remains denied before the upload pipeline')
  const checkInSubmission = await submitAttendancePhoto(photoAdapter.post, host1Auth.token, shift.id, 'check_in')
  assert.equal(checkInSubmission.response.status, 200, JSON.stringify(checkInSubmission.body))
  const checkIn = checkInSubmission.body.event!
  const checkInEventId = String(checkIn.event_id)
  const checkInReceipt = requireOk(await service.from('self_attendance_photo_evidence')
    .select('request_id,provider,external_file_id,external_parent_id,size_bytes,checksum_sha256,event_kind')
    .eq('request_id', checkInSubmission.requestId).single(), 'check-in upload receipt') as Record<string, unknown>
  assert.equal(checkInReceipt.event_kind, 'check_in')
  assert.equal(checkInReceipt.provider, 'google_drive', 'local adapter implements the Drive contract; this is not real Drive evidence')
  assert.ok(photoAdapter.photos.has(String(checkInReceipt.external_file_id)))
  assert.ok(String(checkInReceipt.external_parent_id).startsWith('c511-local-parent-check_in-'))
  const checkInReadback = await photoAdapter.get(new Request(`http://c511.local/api/workforce/self-attendance-photo?event_id=${checkInEventId}`, {
    headers: { Authorization: `Bearer ${host1Auth.token}` },
  }))
  assert.equal(checkInReadback.status, 200)
  assert.equal(createHash('sha256').update(new Uint8Array(await checkInReadback.arrayBuffer())).digest('hex'), checkInReceipt.checksum_sha256)
  const checkInRetry = await submitAttendancePhoto(photoAdapter.post, host1Auth.token, shift.id, 'check_in', checkInSubmission.requestId)
  assert.equal(checkInRetry.response.status, 200, 'same request retries reuse the immutable photo receipt')
  assert.equal(String(checkInRetry.body.event?.event_id), checkInEventId)
  assert.equal(photoAdapter.photos.size, 1)
  const foreignPhotoRead = await photoAdapter.get(new Request(`http://c511.local/api/workforce/self-attendance-photo?event_id=${checkInEventId}`, {
    headers: { Authorization: `Bearer ${host3Auth.token}` },
  }))
  assert.equal(foreignPhotoRead.status, 403, 'foreign actor cannot read another member photo bytes')

  const checkOutSubmission = await submitAttendancePhoto(photoAdapter.post, host1Auth.token, shift.id, 'check_out')
  assert.equal(checkOutSubmission.response.status, 200, JSON.stringify(checkOutSubmission.body))
  const checkOut = checkOutSubmission.body.event!
  const checkOutEventId = String(checkOut.event_id)
  const checkOutReceipt = requireOk(await service.from('self_attendance_photo_evidence')
    .select('request_id,event_kind,external_file_id,external_parent_id,checksum_sha256')
    .eq('request_id', checkOutSubmission.requestId).single(), 'check-out upload receipt') as Record<string, unknown>
  assert.equal(checkOutReceipt.event_kind, 'check_out')
  assert.notEqual(checkOutReceipt.external_file_id, checkInReceipt.external_file_id)
  assert.notEqual(checkOutReceipt.external_parent_id, checkInReceipt.external_parent_id)
  assert.notEqual(checkOutReceipt.checksum_sha256, checkInReceipt.checksum_sha256)
  const checkOutReadback = await photoAdapter.get(new Request(`http://c511.local/api/workforce/self-attendance-photo?event_id=${checkOutEventId}`, {
    headers: { Authorization: `Bearer ${host1Auth.token}` },
  }))
  assert.equal(checkOutReadback.status, 200)
  assert.equal(createHash('sha256').update(new Uint8Array(await checkOutReadback.arrayBuffer())).digest('hex'), checkOutReceipt.checksum_sha256)
  const eventRead = await host1Auth.client.rpc('get_my_self_attendance', { p_shift_id: shift.id, p_limit: 10 })
  const events = requireOk(eventRead, 'authenticated attendance readback') as Array<Record<string, unknown>>
  assert.deepEqual(new Set(events.map(event => event.event)), new Set(['check_in', 'check_out']))
  assert.ok(events.every(event => event.staff_id === host1.businessId))
  assert.ok(events.every(event => event.verification_status === 'pending_verification'),
    'photo upload and review do not themselves approve attendance')
  const foreignPhoto = await submitAttendancePhoto(photoAdapter.post, host3Auth.token, shift.id, 'check_in')
  assert.notEqual(foreignPhoto.response.status, 200, 'foreign assignment cannot upload attendance evidence')
  const attendanceStored = requireOk(await service.from('self_attendance_events').select('id,event_kind,staff_id,shift_id,request_id').eq('shift_id', shift.id).eq('staff_id', host1.businessId), 'attendance db readback') as Array<Record<string, unknown>>
  assert.equal(attendanceStored.length, 2)
  assert.equal(attendanceStored.filter(row => row.event_kind === 'check_in').length, 1)
  assert.equal(attendanceStored.filter(row => row.event_kind === 'check_out').length, 1)
  const freshMember = await signIn(host1)
  const freshHistory = requireOk(await freshMember.client.rpc('get_my_self_attendance', { p_shift_id: shift.id, p_limit: 10 }), 'relogin attendance readback') as Array<Record<string, unknown>>
  assert.equal(freshHistory.length, 2)
  const selfReviewDenied = await apiPost(createAttendancePhotoReviewHandler({
    resolveUser, createClient: async () => host1Auth.client as never,
    createAdminClient: () => service as never, isEnabled: () => true,
  }), '/api/workforce/attendance-photo-review', host1Auth.token, {
    event_id: checkInEventId, expected_version: 0, expected_evidence_revision: 1,
    decision: 'approved', reason: 'member cannot self review', idempotency_key: crypto.randomUUID(),
  })
  assert.equal(selfReviewDenied.status, 403, 'attendance owner cannot approve their own evidence')
  const reviewPayload = (eventId: string, reason: string) => ({
    event_id: eventId, expected_version: 0, expected_evidence_revision: 1,
    decision: 'approved', reason, idempotency_key: crypto.randomUUID(),
  })
  const checkInReviewResponse = await apiPost(reviewApi, '/api/workforce/attendance-photo-review', reviewerAuth.token,
    reviewPayload(checkInEventId, 'independent reviewer verified check-in image'))
  assert.equal(checkInReviewResponse.status, 200, await checkInReviewResponse.clone().text())
  const checkInReview = (await checkInReviewResponse.json() as { review: Record<string, unknown> }).review
  const checkOutReviewResponse = await apiPost(reviewApi, '/api/workforce/attendance-photo-review', reviewerAuth.token,
    reviewPayload(checkOutEventId, 'independent reviewer verified check-out image'))
  assert.equal(checkOutReviewResponse.status, 200, await checkOutReviewResponse.clone().text())
  const checkOutReview = (await checkOutReviewResponse.json() as { review: Record<string, unknown> }).review
  assert.equal(checkInReview.decision, 'approved')
  assert.equal(checkOutReview.decision, 'approved')
  const reviewReadback = requireOk(await service.from('self_attendance_photo_review_events')
    .select('attendance_event_id,evidence_request_id,version,evidence_revision,decision,reviewer_id')
    .in('attendance_event_id', [checkInEventId, checkOutEventId]), 'attendance evidence review readback') as Array<Record<string, unknown>>
  assert.equal(reviewReadback.length, 2)
  assert.ok(reviewReadback.every(row => row.decision === 'approved' && row.reviewer_id === reviewer.businessId))
  const afterEvidenceReview = requireOk(await host1Auth.client.rpc('get_my_self_attendance', { p_shift_id: shift.id, p_limit: 10 }), 'attendance remains pending after evidence review') as Array<Record<string, unknown>>
  assert.ok(afterEvidenceReview.every(event => event.verification_status === 'pending_verification'))
  const host2CheckIn = await submitAttendancePhoto(photoAdapter.post, host2Auth.token, shift.id, 'check_in')
  const host2CheckOut = await submitAttendancePhoto(photoAdapter.post, host2Auth.token, shift.id, 'check_out')
  const host2Photos = [host2CheckIn, host2CheckOut]
  assert.ok(host2Photos.every(item => item.response.status === 200), JSON.stringify(host2Photos.map(item => ({ status: item.response.status, body: item.body }))))
  const storedHost2Events = requireOk(await service.from('self_attendance_events').select('id,event_kind').eq('shift_id', shift.id).eq('staff_id', host2.businessId), 'second Host attendance readback') as Array<Record<string, unknown>>
  assert.equal(storedHost2Events.length, 2)
  for (const photo of host2Photos) {
    const event = photo.body.event!
    const reviewedResponse = await apiPost(reviewApi, '/api/workforce/attendance-photo-review', reviewerAuth.token,
      reviewPayload(String(event.event_id), 'independent reviewer verified second Host evidence'))
    assert.equal(reviewedResponse.status, 200, await reviewedResponse.clone().text())
    const reviewed = (await reviewedResponse.json() as { review: Record<string, unknown> }).review
    assert.equal(reviewed.decision, 'approved')
  }
  const completed = await shiftRepo.update(shift.id, { status: 'completed' }, false, live!.version)
  assert.ok(completed)

  const actualHandler = createWorkforceActualHandler({
    client: () => service, resolveUser, isEnabled: () => true, isAttendanceReviewEnabled: () => false,
    isPayrollEnabled: () => true,
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

  const admin2Actually = createWorkforceActualHandler({
    client: () => service, resolveUser, isEnabled: () => true,
    createScopeClient: async request => createScopeClient(request),
  })
  const actualStart = persistedStart(completed, 0)
  const actualEnd = persistedStart(completed, 15)
  const actual1Response = await apiPost(admin2Actually, '/api/workforce/actual', adminAuth.token, {
    action: 'record', shift_id: shift.id, staff_id: host1.businessId, operational_role: 'host',
    event_kind: 'worked', coverage_kind: 'planned', actual_start_at: actualStart,
    actual_end_at: actualEnd, evidence_note: `C5.11 synthetic actual minutes; attendance=${checkInEventId},${checkOutEventId}`,
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
  const actualWithoutAttendance = await apiPost(admin2Actually, '/api/workforce/actual', adminAuth.token, {
    action: 'record', shift_id: shift.id, staff_id: support.businessId, operational_role: 'support',
    event_kind: 'worked', coverage_kind: 'planned', actual_start_at: actualStart,
    actual_end_at: actualEnd, evidence_note: 'C5.11 synthetic support minutes without attendance evidence',
  })
  assert.equal(actualWithoutAttendance.status, 201, await actualWithoutAttendance.clone().text())
  const missingEvidenceSegment = (await actualWithoutAttendance.json() as { segment: { id: string; version: number } }).segment
  const selfReview = await apiPost(admin2Actually, '/api/workforce/actual', adminAuth.token, {
    action: 'review', segment_id: actual1.id, expected_version: actual1.version,
    decision: 'approved', review_note: 'same creator cannot approve own evidence',
  })
  assert.equal(selfReview.status, 403, await selfReview.clone().text())
  const missingAttendanceReview = await apiPost(admin2Actually, '/api/workforce/actual', reviewerAuth.token, {
    action: 'review', segment_id: missingEvidenceSegment.id, expected_version: missingEvidenceSegment.version,
    decision: 'approved', review_note: 'attendance evidence is absent initially',
  })
  assert.equal(missingAttendanceReview.status, 409)
  assert.equal((await missingAttendanceReview.json() as { error: { code: string } }).error.code, 'WORKFORCE_ATTENDANCE_EVIDENCE_REQUIRED')
  const reportDraft = requireOk(await adminAuth.client.rpc('create_report', { p_data: {
    shift_id: shift.id, dashboard_platform: 'other', revenue: 0, orders: 0,
    normalized_metrics: { synthetic: true },
  } }), 'create synthetic report draft') as { id: string }
  const visibilityBytes = Buffer.from(`C5.15 synthetic Visibility/KV receipt ${run}`)
  const visibilityChecksum = createHash('sha256').update(visibilityBytes).digest('hex')
  const visibilityImage = requireOk(await adminAuth.client.rpc('upsert_live_report_image_with_storage_metadata', { p_data: {
    report_id: reportDraft.id, category: 'key_visual', file_url: 'https://c511.invalid/synthetic-visibility.jpg',
    file_name: 'synthetic-visibility.jpg', mime_type: 'image/jpeg', size_bytes: visibilityBytes.byteLength,
    is_cover: true, provider: 'google_drive', external_file_id: `c511-local-visibility-${run}`,
    external_parent_id: `c511-local-visibility-parent-${run}`, checksum_sha256: visibilityChecksum,
  } }), 'seed synthetic Visibility/KV receipt') as Record<string, unknown>
  const report = requireOk(await adminAuth.client.rpc('update_report', {
    p_report_id: reportDraft.id,
    p_patch: { status: 'confirmed', metrics_confirmed: true, confirmed_at: new Date().toISOString(), confirmed_by: reviewer.businessId },
    p_reason: 'C5.15 synthetic report completeness fixture', p_event: 'confirm',
  }), 'confirm synthetic report fixture') as { id: string }
  const photoReceipts = requireOk(await service.from('self_attendance_photo_evidence')
    .select('request_id,event_kind,external_file_id,external_parent_id,checksum_sha256')
    .eq('shift_id', shift.id).eq('staff_id', host1.businessId), 'attendance photo receipt chain') as Array<Record<string, unknown>>
  assert.equal(photoReceipts.length, 2)
  const review1 = await apiPost(scopedActualHandler, '/api/workforce/actual', leaderAuth.token, {
    action: 'review', segment_id: actual1.id, expected_version: actual1.version,
    decision: 'approved', review_note: 'separate authorized reviewer approves minutes',
  })
  assert.equal(review1.status, 200, await review1.clone().text())
  const review1Body = await review1.json() as { segment: { payroll_decision: { state: string; version: number } } }
  assert.equal(review1Body.segment.payroll_decision.state, 'pending_admin_confirmation')
  const review2 = await apiPost(admin2Actually, '/api/workforce/actual', reviewerAuth.token, {
    action: 'review', segment_id: actual2.id, expected_version: actual2.version,
    decision: 'approved', review_note: 'separate authorized reviewer approves minutes',
  })
  assert.equal(review2.status, 200, await review2.clone().text())
  const review2Body = await review2.json() as { segment: { payroll_decision: { state: string } } }
  assert.equal(review2Body.segment.payroll_decision.state, 'admin_confirmed')
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
  assert.deepEqual(requireOk(await leaderAuth.client.rpc('rc19_current_leader_brand_ids', { p_scope_key: 'shifts.manage' }), 'revoked Leader scope read'), [])
  assert.equal((await scopedActualHandler.GET(apiRequest(`/api/workforce/actual?shift_id=${shift.id}`, leaderAuth.token))).status, 403)
  const pendingRevoked = requireOk(await service.from('shift_registrations').select('status').eq('id', pendingRevocationRegistration.id).single(), 'revoked registration readback')
  assert.equal(pendingRevoked.status, 'pending')

  for (const scopeKey of ['shifts.manage', 'workforce.read', 'staff.manage']) {
    const current = requireOk(await service.from('rc19_leader_brand_scopes').select('version').eq('leader_business_user_id', leader.businessId).eq('brand_id', brandA).eq('scope_key', scopeKey).single(), `restore Leader ${scopeKey} scope`)
    requireOk(await adminAuth.client.rpc('rc19_set_leader_brand_scope', {
      p_user_id: leader.businessId, p_brand_id: brandA, p_scope_key: scopeKey,
      p_enabled: true, p_expected_version: current.version, p_valid_from: activeFrom(), p_valid_until: null,
      p_reason: 'C5.15 authenticated payroll confirmation scenario',
    }), `restore Leader ${scopeKey} scope`)
  }

  const payrollHandler = createWorkforcePayrollHandler({ createClient: () => service,
    createSessionClient: async () => adminAuth.client, resolveUser, isEnabled: () => true })
  const payrollPost = (token: string, body: unknown) => apiPost(payrollHandler, '/api/workforce/payroll', token, body)
  const actualRows = requireOk(await service.from('workforce_actual_segments')
    .select('id,version,reviewed_by,created_by').in('id', [actual1.id, actual2.id]), 'payroll decision actual readback') as Array<Record<string, unknown>>
  const actual1Row = actualRows.find(row => row.id === actual1.id)!
  const actual2Row = actualRows.find(row => row.id === actual2.id)!
  const leaderPreapproval = requireOk(await leaderAuth.client.rpc('rc19_c515_record_payroll_review', {
    p_segment_id: actual1.id, p_segment_version: actual1Row.version,
    p_reason: 'Leader reviewed actual hours; Admin confirmation remains required',
  }), 'Leader payroll preapproval') as { state: string; version: number }
  assert.equal(leaderPreapproval.state, 'pending_admin_confirmation')
  assert.ok((await service.from('workforce_payroll_segment_decisions').select('segment_id')
    .eq('segment_id', actual1.id).eq('state', 'admin_confirmed').maybeSingle()).data === null,
  'Leader preapproval cannot authorize a payable Payroll line')
  const leaderSelfEscalation = await leaderAuth.client.rpc('rc19_c515_confirm_payroll_segment', {
    p_segment_id: actual1.id, p_expected_version: leaderPreapproval.version,
    p_idempotency_key: crypto.randomUUID(), p_reason: 'Leader cannot confirm own Payroll preapproval',
  })
  assert.ok(leaderSelfEscalation.error, 'Leader cannot perform final Payroll confirmation')
  const adminDirect = requireOk(await reviewerAuth.client.rpc('rc19_c515_record_payroll_review', {
    p_segment_id: actual2.id, p_segment_version: actual2Row.version,
    p_reason: 'Admin directly confirms complete evidence and approved actual hours',
  }), 'Admin direct Payroll confirmation') as { state: string; version: number }
  assert.equal(adminDirect.state, 'admin_confirmed')
  const adminFinal = requireOk(await reviewerAuth.client.rpc('rc19_c515_confirm_payroll_segment', {
    p_segment_id: actual1.id, p_expected_version: leaderPreapproval.version,
    p_idempotency_key: crypto.randomUUID(), p_reason: 'Admin confirms Leader-preapproved actual hours',
  }), 'Admin confirms Leader preapproval') as { state: string }
  assert.equal(adminFinal.state, 'admin_confirmed')
  requireOk(await reviewerAuth.client.rpc('reopen_report', {
    p_report_id: report.id, p_reason: 'C5.15 isolated missing final report Hold test',
  }), 'reopen synthetic report for Hold test')
  const holdRefresh = requireOk(await reviewerAuth.client.rpc('rc19_c515_refresh_payroll_gates', {
    p_segment_ids: [actual1.id, actual2.id],
  }), 'Payroll Hold refresh after report reopened') as Array<{ segment_id: string; state: string; missing_evidence: string[]; verified_complete: boolean }>
  assert.equal(holdRefresh.length, 2)
  assert.ok(holdRefresh.every(gate => gate.state === 'payroll_hold' && gate.missing_evidence.includes('final_report') && !gate.verified_complete))
  requireOk(await reviewerAuth.client.rpc('update_report', {
    p_report_id: report.id,
    p_patch: { status: 'confirmed', metrics_confirmed: true, confirmed_at: new Date().toISOString(), confirmed_by: reviewer.businessId },
    p_reason: 'C5.15 isolated report completeness restored', p_event: 'confirm',
  }), 'restore synthetic confirmed report')
  for (const segmentId of [actual1.id, actual2.id]) {
    const current = requireOk(await service.from('workforce_payroll_segment_decisions')
      .select('version').eq('segment_id', segmentId).single(), 'Payroll Hold decision readback')
    const release = requireOk(await reviewerAuth.client.rpc('rc19_c515_confirm_payroll_segment', {
      p_segment_id: segmentId, p_expected_version: current.version,
      p_idempotency_key: crypto.randomUUID(), p_reason: 'Admin rechecks complete evidence and releases Payroll Hold',
    }), 'Admin Payroll Hold release') as { state: string }
    assert.equal(release.state, 'admin_confirmed')
  }
  const rateResponse = await payrollPost(adminAuth.token, {
    action: 'register_rate', staff_id: host1.businessId, operational_role: 'host',
    effective_from: (completed as { date: string }).date, effective_through: null,
    vnd_per_hour: 120000, overtime_multiplier_basis_points: 15000, approval_note: 'C5.11 isolated approved rate',
  })
  assert.equal(rateResponse.status, 201, await rateResponse.clone().text())
  const rateBody = await rateResponse.json() as { rate: { id: string; approved_by: string } }
  assert.equal(rateBody.rate.approved_by, admin.businessId)
  const otReceiptHash = createHash('sha256').update(`C5.15 synthetic OT evidence ${run}`).digest('hex')
  const otReceipt = requireOk(await service.from('operational_files').insert({
    scope_key: `shift:${shift.id}`, category: 'staffing_document', brand_id: brandA, platform_id: platformId,
    shift_id: shift.id, period_date: completed.date, execution_source: 'internal', provider: 'google_drive',
    external_file_id: `c511-local-ot-${run}`, external_parent_id: `c511-local-ot-parent-${run}`,
    provider_metadata: { test_fixture: true }, folder_path: `c511-local/${shift.id}/overtime`,
    file_name: `c511-overtime-${run}.txt`, mime_type: 'text/plain', size_bytes: 1,
    checksum_sha256: otReceiptHash, integrity_status: 'sha256_verified', artifact_key: `c511-ot-${otReceiptHash}`,
    uploaded_by: admin.businessId,
  }).select('id,shift_id,brand_id,platform_id,checksum_sha256').single(), 'seed synthetic OT evidence receipt') as Record<string, unknown>
  const localStartHour = Number(new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', hourCycle: 'h23',
  }).format(new Date(actualStart)))
  const otDayClass = [0, 6].includes(new Date(`${completed.date}T00:00:00Z`).getUTCDay()) ? 'weekend' : 'weekday'
  const otTimeClass = localStartHour < 6 || localStartHour >= 22 ? 'night' : 'day'
  const otRequestResponse = await apiPost(scopedActualHandler, '/api/workforce/actual', leaderAuth.token, {
    action: 'request_overtime', segment_id: actual1.id,
    overtime_start_at: actualStart, overtime_end_at: persistedStart(completed, 5),
    day_class: otDayClass, time_class: otTimeClass,
    reason: 'Approved actual segment includes documented overtime', evidence_receipt_id: String(otReceipt.id),
    idempotency_key: crypto.randomUUID(),
  })
  assert.equal(otRequestResponse.status, 201, await otRequestResponse.clone().text())
  const otRequest = (await otRequestResponse.json() as { overtime: { id: string; state: string; version: number; leader_preapproved_by: string } }).overtime
  assert.equal(otRequest.state, 'pending_admin_confirmation')
  assert.equal(otRequest.leader_preapproved_by, leader.businessId)
  const memberOtDenied = await apiPost(scopedActualHandler, '/api/workforce/actual', host1Auth.token, {
    action: 'request_overtime', segment_id: actual1.id,
    overtime_start_at: actualStart, overtime_end_at: persistedStart(completed, 5),
    day_class: otDayClass, time_class: otTimeClass, reason: 'Member cannot request Payroll overtime',
    evidence_receipt_id: String(otReceipt.id), idempotency_key: crypto.randomUUID(),
  })
  assert.equal(memberOtDenied.status, 403)
  const duplicateOtDenied = await apiPost(scopedActualHandler, '/api/workforce/actual', leaderAuth.token, {
    action: 'request_overtime', segment_id: actual1.id,
    overtime_start_at: actualStart, overtime_end_at: persistedStart(completed, 5),
    day_class: otDayClass, time_class: otTimeClass, reason: 'Duplicate overtime interval cannot be added',
    evidence_receipt_id: String(otReceipt.id), idempotency_key: crypto.randomUUID(),
  })
  assert.equal(duplicateOtDenied.status, 409)
  const otAdminConfirm = await apiPost(scopedActualHandler, '/api/workforce/actual', reviewerAuth.token, {
    action: 'decide_overtime', request_id: otRequest.id, expected_version: otRequest.version,
    decision: 'admin_confirm', reason: 'Admin confirms configured OT rate and evidence', idempotency_key: crypto.randomUUID(),
  })
  assert.equal(otAdminConfirm.status, 200, await otAdminConfirm.clone().text())
  const confirmedOvertime = (await otAdminConfirm.json() as { overtime: { state: string; multiplier_basis_points: number; rate_card_id: string } }).overtime
  assert.equal(confirmedOvertime.state, 'admin_confirmed')
  assert.equal(confirmedOvertime.multiplier_basis_points, 15000)
  assert.equal(confirmedOvertime.rate_card_id, rateBody.rate.id)
  const periodResponse = await payrollPost(adminAuth.token, {
    action: 'create_period', period_start: (completed as { date: string }).date, period_end: (completed as { date: string }).date,
  })
  assert.equal(periodResponse.status, 201, await periodResponse.clone().text())
  const periodBody = await periodResponse.json() as { period: { id: string; status: string } }
  const firstCalculation = await payrollPost(adminAuth.token, { action: 'auto_calculate_draft', period_id: periodBody.period.id })
  assert.equal(firstCalculation.status, 201, await firstCalculation.clone().text())
  const firstCalc = await firstCalculation.json() as { prepared_count: number; skipped: Array<{ segmentId: string; reason: string }> }
  assert.equal(firstCalc.prepared_count, 1)
  assert.ok(firstCalc.skipped.some(row => row.segmentId === actual2.id && row.reason === 'WORKFORCE_RATE_NOT_APPROVED'))
  const afterFirst = requireOk(await service.from('workforce_payroll_lines').select('id,segment_id,staff_id,period_id,actual_minutes,actual_seconds,payable_seconds,overtime_seconds,overtime_request_id,overtime_multiplier_basis_points,gross_vnd,net_vnd').eq('period_id', periodBody.period.id), 'payroll line readback') as Array<Record<string, unknown>>
  assert.equal(afterFirst.length, 1)
  assert.equal(afterFirst[0].segment_id, actual1.id)
  assert.equal(afterFirst[0].staff_id, host1.businessId)
  assert.equal(afterFirst[0].actual_seconds, 900)
  assert.equal(afterFirst[0].payable_seconds, 900)
  assert.equal(afterFirst[0].overtime_seconds, 300)
  assert.equal(afterFirst[0].overtime_request_id, otRequest.id)
  assert.equal(afterFirst[0].overtime_multiplier_basis_points, 15000)
  assert.equal(afterFirst[0].gross_vnd, 35000)
  const host2Rate = await payrollPost(adminAuth.token, {
    action: 'register_rate', staff_id: host2.businessId, operational_role: 'host',
    effective_from: (completed as { date: string }).date, effective_through: null,
    vnd_per_hour: 120000, overtime_multiplier_basis_points: 15000, approval_note: 'C5.11 isolated approved HostTwo rate',
  })
  assert.equal(host2Rate.status, 201, await host2Rate.clone().text())
  const secondCalculation = await payrollPost(adminAuth.token, { action: 'auto_calculate_draft', period_id: periodBody.period.id })
  assert.equal(secondCalculation.status, 201, await secondCalculation.clone().text())
  const secondCalc = await secondCalculation.json() as { prepared_count: number }
  assert.equal(secondCalc.prepared_count, 1)
  const thirdCalculation = await payrollPost(adminAuth.token, { action: 'auto_calculate_draft', period_id: periodBody.period.id })
  assert.equal(thirdCalculation.status, 200, await thirdCalculation.clone().text())
  assert.equal((await thirdCalculation.json() as { prepared_count: number }).prepared_count, 0)
  const afterRetry = requireOk(await service.from('workforce_payroll_lines').select('id,segment_id,period_id').eq('period_id', periodBody.period.id), 'payroll retry readback') as Array<Record<string, unknown>>
  assert.equal(afterRetry.length, 2)
  const cancellationPlatformId = `platform_cancel_${crypto.randomUUID().replaceAll('-', '').slice(0, 14)}`
  const cancellationPlatformName = `C5.15 cancellation platform ${run}`
  requireOk(await service.from('platforms').insert({ id: cancellationPlatformId, name: cancellationPlatformName, status: 'active' }).select('id').single(), 'seed cancellation platform')
  const cancellationHost1 = await seedUser(run, 'CancellationHostOne', 'member', ['host'])
  const cancellationHost1Auth = await signIn(cancellationHost1)
  const cancellationHost2 = await seedUser(run, 'CancellationHostTwo', 'member', ['host'])
  const cancellationHost2Auth = await signIn(cancellationHost2)
  const cancellationShiftSetup = await createImportedShift(run, brandA, `C5.11 Brand A ${run}`, cancellationPlatformId, cancellationPlatformName)
  const cancellationShift = cancellationShiftSetup.shift
  assert.notEqual(cancellationShift.id, shift.id)
  const cancellationHost1Registration = await createSupabaseShiftRegistrationRepository(cancellationHost1Auth.client)
    .registerForSegment(cancellationShiftSetup.segments[0].id as string, 'host')
  const cancellationHost2Registration = await createSupabaseShiftRegistrationRepository(cancellationHost2Auth.client)
    .registerForSegment(cancellationShiftSetup.segments[0].id as string, 'host')
  await approvalRepo.approve(cancellationHost1Registration.id, 'C5.15 approved cancellation fixture HostOne', cancellationHost1Registration.version)
  await approvalRepo.approve(cancellationHost2Registration.id, 'C5.15 approved cancellation fixture HostTwo', cancellationHost2Registration.version)
  const cancellationCurrent = await shiftRepo.getById(cancellationShift.id)
  assert.ok(cancellationCurrent)
  const cancellationDate = cancellationShift.date
  const cancellationPreparing = await shiftRepo.update(cancellationShift.id, { status: 'preparing' }, false, cancellationCurrent!.version)
  assert.ok(cancellationPreparing)
  const cancellationLive = await shiftRepo.update(cancellationShift.id, { status: 'live' }, false, cancellationPreparing!.version)
  assert.ok(cancellationLive)
  const cancellationReportDraft = requireOk(await adminAuth.client.rpc('create_report', { p_data: {
    shift_id: cancellationShift.id, dashboard_platform: 'other', revenue: 0, orders: 0,
    normalized_metrics: { synthetic: true, cancelled_after_partial_work: true },
  } }), 'create cancelled shift final report before cancellation') as { id: string }
  const cancellationVisibilityBytes = Buffer.from(`C5.15 cancellation Visibility evidence ${run}`)
  const cancellationVisibilityChecksum = createHash('sha256').update(cancellationVisibilityBytes).digest('hex')
  requireOk(await adminAuth.client.rpc('upsert_live_report_image_with_storage_metadata', { p_data: {
    report_id: cancellationReportDraft.id, category: 'key_visual', file_url: 'https://c511.invalid/cancelled-visibility.jpg',
    file_name: 'cancelled-visibility.jpg', mime_type: 'image/jpeg', size_bytes: cancellationVisibilityBytes.byteLength,
    is_cover: true, provider: 'google_drive', external_file_id: `c511-local-cancelled-kv-${run}`,
    external_parent_id: `c511-local-cancelled-kv-parent-${run}`, checksum_sha256: cancellationVisibilityChecksum,
  } }), 'seed cancelled shift Visibility receipt')
  requireOk(await adminAuth.client.rpc('update_report', {
    p_report_id: cancellationReportDraft.id,
    p_patch: { status: 'confirmed', metrics_confirmed: true, confirmed_at: new Date().toISOString(), confirmed_by: reviewer.businessId },
    p_reason: 'C5.15 synthetic cancellation report completeness', p_event: 'confirm',
  }), 'confirm cancelled shift report before cancellation')
  const cancellationPhotos = [
    await submitAttendancePhoto(photoAdapter.post, cancellationHost1Auth.token, cancellationShift.id, 'check_in'),
    await submitAttendancePhoto(photoAdapter.post, cancellationHost1Auth.token, cancellationShift.id, 'check_out'),
    await submitAttendancePhoto(photoAdapter.post, cancellationHost2Auth.token, cancellationShift.id, 'check_in'),
    await submitAttendancePhoto(photoAdapter.post, cancellationHost2Auth.token, cancellationShift.id, 'check_out'),
  ]
  assert.ok(cancellationPhotos.every(photo => photo.response.status === 200), JSON.stringify(cancellationPhotos.map(photo => photo.body)))
  for (const photo of cancellationPhotos) {
    const eventId = String(photo.body.event?.event_id)
    const response = await apiPost(reviewApi, '/api/workforce/attendance-photo-review', reviewerAuth.token,
      reviewPayload(eventId, 'Independent review of cancelled-shift attendance photo'))
    assert.equal(response.status, 200, await response.clone().text())
  }
  const memberCancelAttempt = await cancellationHost1Auth.client.rpc('update_shift', {
    p_shift_id: cancellationShift.id, p_patch: { status: 'cancelled' },
    p_confirm_impact: false, p_expected_version: cancellationLive!.version,
  })
  assert.ok(memberCancelAttempt.error, 'Members cannot directly cancel a live shift')
  assert.equal((await shiftRepo.getById(cancellationShift.id))?.status, 'live', 'Denied member call leaves the shift live')
  const cancelledShift = await shiftRepo.update(cancellationShift.id, { status: 'cancelled' }, false, cancellationLive!.version)
  assert.ok(cancelledShift)
  const cancellationActualEndDate = new Date(Date.now() - 60_000)
  const cancellationActualEnd = cancellationActualEndDate.toISOString()
  const cancellationActualStart = new Date(cancellationActualEndDate.getTime() - 15 * 60_000).toISOString()
  const cancellationActuals = await Promise.all([cancellationHost1, cancellationHost2].map(async (staff) => {
    const response = await apiPost(admin2Actually, '/api/workforce/actual', adminAuth.token, {
      action: 'record', shift_id: cancellationShift.id, staff_id: staff.businessId, operational_role: 'host',
      event_kind: 'worked', coverage_kind: 'planned', actual_start_at: cancellationActualStart,
      actual_end_at: cancellationActualEnd, evidence_note: 'Synthetic approved work before Brand cancellation',
    })
    assert.equal(response.status, 201, await response.clone().text())
    return (await response.json() as { segment: { id: string; version: number } }).segment
  }))
  const cancellationReviews = await Promise.all(cancellationActuals.map(segment => apiPost(
    scopedActualHandler, '/api/workforce/actual', leaderAuth.token, {
      action: 'review', segment_id: segment.id, expected_version: segment.version,
      decision: 'approved', review_note: 'Leader reviewed actual work before Brand cancellation',
    })))
  assert.ok(cancellationReviews.every(response => response.status === 200), await Promise.all(cancellationReviews.map(response => response.clone().text())))
  const cancellationPeriod = periodBody.period
  assert.equal(cancellationPeriod.status, 'draft')
  for (const staff of [cancellationHost1, cancellationHost2]) {
    const cancellationRate = await payrollPost(adminAuth.token, {
      action: 'register_rate', staff_id: staff.businessId, operational_role: 'host',
      effective_from: cancellationDate, effective_through: null, vnd_per_hour: 120000,
      overtime_multiplier_basis_points: 15000, approval_note: 'C5.15 cancellation fixture effective rate',
    })
    assert.equal(cancellationRate.status, 201, await cancellationRate.clone().text())
  }
  const cancellationLeaderReviews = await Promise.all(cancellationActuals.map(async segment => {
    const current = requireOk(await service.from('workforce_actual_segments').select('id,version').eq('id', segment.id).single(), 'cancelled actual segment readback')
    return leaderAuth.client.rpc('rc19_c515_record_payroll_review', {
      p_segment_id: segment.id, p_segment_version: current.version,
      p_reason: 'Leader preapproval for actual seconds worked before cancellation',
    })
  }))
  cancellationLeaderReviews.forEach(result => assert.ifError(result.error))
  const cancellationActualPayrollConfirmations = await Promise.all(cancellationActuals.map(async segment => {
    const decision = requireOk(await service.from('workforce_payroll_segment_decisions').select('version').eq('segment_id', segment.id).single(), 'cancelled payroll review readback')
    return reviewerAuth.client.rpc('rc19_c515_confirm_payroll_segment', {
      p_segment_id: segment.id, p_expected_version: decision.version,
      p_idempotency_key: crypto.randomUUID(), p_reason: 'Admin confirms actual seconds worked before cancellation',
    })
  }))
  cancellationActualPayrollConfirmations.forEach(result => assert.ifError(result.error))
  const cancellationCalculation = await payrollPost(adminAuth.token, { action: 'auto_calculate_draft', period_id: cancellationPeriod.id })
  assert.equal(cancellationCalculation.status, 201, await cancellationCalculation.clone().text())
  const cancellationLines = requireOk(await service.from('workforce_payroll_lines')
    .select('id,segment_id,staff_id,actual_seconds,gross_vnd').eq('period_id', cancellationPeriod.id)
    .in('segment_id', cancellationActuals.map(segment => segment.id)), 'cancelled shift payroll readback') as Array<Record<string, unknown>>
  assert.equal(cancellationLines.length, 2)
  assert.ok(cancellationLines.every(line => line.actual_seconds === 900 && line.gross_vnd === 30000), 'co-hosts retain their own actual payable seconds after cancellation')
  const cancellationEvidenceHash = createHash('sha256').update(`C5.15 synthetic cancellation evidence ${run}`).digest('hex')
  const cancellationReceipt = requireOk(await service.from('operational_files').insert({
    scope_key: `shift:${cancellationShift.id}`, category: 'acceptance_document', brand_id: brandA, platform_id: cancellationPlatformId,
    shift_id: cancellationShift.id, period_date: cancellationDate, execution_source: 'internal', provider: 'google_drive',
    external_file_id: `c511-local-cancel-${run}`, external_parent_id: `c511-local-cancel-parent-${run}`,
    provider_metadata: { test_fixture: true }, folder_path: `c511-local/${cancellationShift.id}/cancellation`,
    file_name: `c511-cancellation-${run}.txt`, mime_type: 'text/plain', size_bytes: 1,
    checksum_sha256: cancellationEvidenceHash, integrity_status: 'sha256_verified',
    artifact_key: `c511-cancel-${cancellationEvidenceHash}`, uploaded_by: admin.businessId,
  }).select('id').single(), 'seed synthetic cancellation evidence receipt') as { id: string }
  const compensationKey = crypto.randomUUID()
  const compensationProposal = await apiPost(scopedActualHandler, '/api/workforce/actual', leaderAuth.token, {
    action: 'propose_cancellation_compensation', shift_id: cancellationShift.id, staff_id: cancellationHost1.businessId,
    operational_role: 'host', actual_segment_id: cancellationActuals[0].id, registration_id: null,
    period_id: cancellationPeriod.id, cancellation_reason: 'Brand cancelled remaining live time',
    reason: 'Discretionary synthetic compensation proposal for review', evidence_receipt_id: cancellationReceipt.id,
    proposed_amount_vnd: 5000, idempotency_key: compensationKey,
  })
  assert.equal(compensationProposal.status, 201, await compensationProposal.clone().text())
  const proposalBody = await compensationProposal.json() as { case: { id: string; state: string; version: number; actual_seconds: number; actual_earnings_vnd: number } }
  assert.equal(proposalBody.case.state, 'pending_admin_confirmation')
  assert.equal(proposalBody.case.actual_seconds, 900)
  assert.equal(proposalBody.case.actual_earnings_vnd, 30000)
  const proposalReplay = await apiPost(scopedActualHandler, '/api/workforce/actual', leaderAuth.token, {
    action: 'propose_cancellation_compensation', shift_id: cancellationShift.id, staff_id: cancellationHost1.businessId,
    operational_role: 'host', actual_segment_id: cancellationActuals[0].id, registration_id: null,
    period_id: cancellationPeriod.id, cancellation_reason: 'Brand cancelled remaining live time',
    reason: 'Discretionary synthetic compensation proposal for review', evidence_receipt_id: cancellationReceipt.id,
    proposed_amount_vnd: 5000, idempotency_key: compensationKey,
  })
  assert.equal(proposalReplay.status, 201)
  assert.equal((await proposalReplay.json() as { replayed: boolean }).replayed, true)
  const memberCompensationDenied = await apiPost(scopedActualHandler, '/api/workforce/actual', host1Auth.token, {
    action: 'propose_cancellation_compensation', shift_id: cancellationShift.id, staff_id: cancellationHost1.businessId,
    operational_role: 'host', actual_segment_id: cancellationActuals[0].id, registration_id: null,
    period_id: cancellationPeriod.id, cancellation_reason: 'Brand cancelled remaining live time',
    reason: 'Member cannot propose a payroll compensation amount', evidence_receipt_id: cancellationReceipt.id,
    proposed_amount_vnd: 5000, idempotency_key: crypto.randomUUID(),
  })
  assert.equal(memberCompensationDenied.status, 403)
  const compensationEdit = await apiPost(scopedActualHandler, '/api/workforce/actual', leaderAuth.token, {
    action: 'decide_cancellation_compensation', case_id: proposalBody.case.id,
    expected_version: proposalBody.case.version, decision: 'edit', reason: 'Leader adjusts synthetic proposal for Admin review',
    new_amount_vnd: 6000, idempotency_key: crypto.randomUUID(),
  })
  assert.equal(compensationEdit.status, 200, await compensationEdit.clone().text())
  const editedCase = (await compensationEdit.json() as { case: { version: number; state: string; proposed_amount_vnd: number } }).case
  assert.equal(editedCase.state, 'pending_admin_confirmation')
  assert.equal(editedCase.proposed_amount_vnd, 6000)
  const compensationQueue = await scopedActualHandler.GET(apiRequest(
    `/api/workforce/actual?action=cancellation_compensation_cases&brand_id=${brandA}&state=pending_admin_confirmation`, leaderAuth.token))
  assert.equal(compensationQueue.status, 200, await compensationQueue.clone().text())
  assert.ok(((await compensationQueue.json() as { cases: Array<{ id: string; history: unknown[] }> }).cases)
    .some(row => row.id === proposalBody.case.id && row.history.length >= 2))
  const compensationConfirm = await apiPost(scopedActualHandler, '/api/workforce/actual', reviewerAuth.token, {
    action: 'decide_cancellation_compensation', case_id: proposalBody.case.id,
    expected_version: editedCase.version, decision: 'admin_confirm', reason: 'Admin confirms discretionary synthetic amount',
    new_amount_vnd: null, idempotency_key: crypto.randomUUID(),
  })
  assert.equal(compensationConfirm.status, 200, await compensationConfirm.clone().text())
  const confirmedCase = (await compensationConfirm.json() as { case: { state: string; admin_confirmed_by: string }; adjustment: { amount_vnd: number } }).case
  assert.equal(confirmedCase.state, 'admin_confirmed')
  assert.equal(confirmedCase.admin_confirmed_by, reviewer.businessId)
  const compensationAdjustment = requireOk(await service.from('workforce_payroll_adjustments')
    .select('id,period_id,compensation_case_id,staff_id,amount_vnd,confirmed_by')
    .eq('compensation_case_id', proposalBody.case.id).single(), 'cancellation Payroll adjustment readback') as Record<string, unknown>
  assert.equal(compensationAdjustment.amount_vnd, 6000)
  assert.equal(compensationAdjustment.confirmed_by, reviewer.businessId)
  const lockedCaseProposal = await apiPost(scopedActualHandler, '/api/workforce/actual', leaderAuth.token, {
    action: 'propose_cancellation_compensation', shift_id: cancellationShift.id, staff_id: cancellationHost2.businessId,
    operational_role: 'host', actual_segment_id: cancellationActuals[1].id, registration_id: null,
    period_id: cancellationPeriod.id, cancellation_reason: 'Brand cancelled remaining live time',
    reason: 'Pending synthetic case for locked-period protection', evidence_receipt_id: cancellationReceipt.id,
    proposed_amount_vnd: 3000, idempotency_key: crypto.randomUUID(),
  })
  assert.equal(lockedCaseProposal.status, 201, await lockedCaseProposal.clone().text())
  const lockedProposalCase = (await lockedCaseProposal.json() as { case: { id: string; version: number } }).case
  const transition = async (token: string, periodId: string, from: string, to: string) => payrollPost(token, {
    action: 'transition', period_id: periodId, expected_status: from, target_status: to,
    reason: `C5.11 isolated ${from} to ${to}`,
  })
  for (const lockedPeriodId of new Set([periodBody.period.id, cancellationPeriod.id])) {
    assert.equal((await transition(reviewerAuth.token, lockedPeriodId, 'draft', 'reviewed')).status, 200)
    assert.equal((await transition(adminAuth.token, lockedPeriodId, 'reviewed', 'confirmed')).status, 200)
    assert.equal((await transition(reviewerAuth.token, lockedPeriodId, 'confirmed', 'payroll_ready')).status, 200)
    assert.equal((await transition(adminAuth.token, lockedPeriodId, 'payroll_ready', 'locked')).status, 200)
  }
  const lockedPeriod = requireOk(await service.from('workforce_payroll_periods').select('status,locked_at,created_by,reviewed_by,confirmed_by,locked_by').eq('id', periodBody.period.id).single(), 'locked period readback')
  assert.equal(lockedPeriod.status, 'locked')
  assert.ok(lockedPeriod.locked_at)
  const lockedCompensationConfirm = await apiPost(scopedActualHandler, '/api/workforce/actual', reviewerAuth.token, {
    action: 'decide_cancellation_compensation', case_id: lockedProposalCase.id,
    expected_version: lockedProposalCase.version, decision: 'admin_confirm', reason: 'Locked Payroll period must reject late adjustment',
    new_amount_vnd: null, idempotency_key: crypto.randomUUID(),
  })
  assert.equal(lockedCompensationConfirm.status, 403)
  const payslipHandler = createMyPayslipHandler({ createClient: () => service, resolveUser, isEnabled: () => true })
  const ownPayslip = await payslipHandler.GET(apiRequest('/api/workforce/my-payslip', host1Auth.token))
  assert.equal(ownPayslip.status, 200, await ownPayslip.clone().text())
  const own = await ownPayslip.json() as { statements: Array<{ lines: Array<{ staff_id?: string; net_vnd: number }>; total_net_vnd: number }> }
  assert.equal(own.statements.length, 1)
  assert.equal(own.statements[0].lines.length, 1)
  assert.equal(own.statements[0].total_net_vnd, own.statements[0].lines[0].net_vnd)
  assert.equal((own.statements[0].lines[0] as { staff_id?: string }).staff_id, undefined, 'payslip response must not expose another owner key')
  const host2Payslip = await payslipHandler.GET(apiRequest('/api/workforce/my-payslip', host2Auth.token))
  assert.equal(host2Payslip.status, 200)
  const host2Own = await host2Payslip.json() as { statements: Array<{ lines: Array<{ net_vnd: number }>; total_net_vnd: number }> }
  assert.equal(host2Own.statements.length, 1)
  assert.equal(host2Own.statements[0].lines.length, 1)
  assert.equal(host2Own.statements[0].total_net_vnd, host2Own.statements[0].lines[0].net_vnd)
  const noPayrollPayslip = await payslipHandler.GET(apiRequest('/api/workforce/my-payslip', supportAuth.token))
  assert.equal(noPayrollPayslip.status, 200)
  assert.deepEqual((await noPayrollPayslip.json() as { statements: unknown[] }).statements, [])
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
    actual_segment_ids: [actual1.id, actual2.id], attendance_event_ids: [checkInEventId, checkOutEventId],
    attendance_photo_receipts: photoReceipts,
    attendance_evidence_reviews: reviewReadback,
    payroll_period_id: periodBody.period.id, payroll_line_ids: afterRetry.map(line => line.id),
    results: {
      leader_same_brand_read: 'ALLOW', leader_foreign_brand_read: 'DENY',
      leader_foreign_brand_approval: 'DENY', leader_revoked_approval: 'DENY',
      capacity_exceeded_approval: 'DENY', member_self_approval: 'DENY', member_foreign_registration_mutation: 'DENY',
      attendance_persisted_after_new_session: 'PASS', photo_receipt_and_checksum_readback: 'PASS',
      check_in_out_separate_evidence: 'PASS', photo_retry_idempotent: 'PASS',
      independent_evidence_review: 'PASS', member_self_review: 'DENY', unauthorized_attendance: 'DENY',
      member_actual_api: 'DENY', expired_session: 'DENY',
      approved_actual_minutes: 'PASS', missing_rate_reconciled_as_skip: 'PASS', payroll_retry_no_double_count: 'PASS',
      payroll_roles_separated_and_locked: 'PASS', member_own_payslip: 'PASS', other_member_payslip: 'DENY', forged_payslip_owner: 'DENY', member_payroll_api: 'DENY',
    },
  })
}

function persistedStart(shift: { start_at: string }, offsetMinutes: number) {
  return new Date(Date.parse(shift.start_at) + offsetMinutes * 60_000).toISOString()
}

test('C5.12 persists authenticated Staffing, Attendance, evidence review, Payroll and payslip', async () => {
  try {
    await runPersistedScenario(1)
    mkdirSync(evidenceDir!, { recursive: true })
    const output = {
      result: 'PASS', source_sha: process.env.C511_SOURCE_SHA,
      postgres: process.env.C511_POSTGRES_VERSION,
      database, isolation: 'local Docker PostgreSQL 17, dedicated marked DB; Auth/PostgREST loopback only',
      migration_sha256: process.env.C511_MIGRATION_SHA256,
      attendance_review_migration_sha256: process.env.C512_MIGRATION_SHA256,
      c515_migration_sha256: {
        second_precision: process.env.C515_SECONDS_MIGRATION_SHA256,
        approval_hold: process.env.C515_APPROVAL_MIGRATION_SHA256,
        overtime_cancellation: process.env.C515_OT_CANCELLATION_MIGRATION_SHA256,
        live_shift_cancellation: process.env.C515_LIVE_CANCELLATION_MIGRATION_SHA256,
      },
      runtime_auth_users_before: 0, storage_objects_before: 0,
      authenticated_persisted_staffing_scenarios: 1, service_role_used_only_for_fixture_and_server_handler_backend: true,
      authenticated_roles: ['admin', 'leader', 'member'],
      exercised_api_and_rpc: [
        'Supabase Auth sign-up/sign-in/getUser', 'create_shift_with_staffing_segments',
        'rc19_set_leader_brand_scope', 'rc19_current_leader_brand_ids',
        'register_for_staffing_segment', 'approve_shift_registration', 'server-side photo upload handler',
        'self_attendance_record', 'review_self_attendance_photo',
        'RLS shifts and staffing-segment reads',
      ],
      staffing_persistence: 'PASS', attendance_persistence: 'PASS', evidence_review: 'PASS',
      approved_actual_minutes: 'PASS', payroll_persistence: 'PASS', member_payslip_readback: 'PASS',
      storage_adapter: 'server-side dependency-injected local byte store; not selectable by client; SHA readback verified',
      real_drive_e2e: 'BLOCKED: Production Drive OAuth identity and private folder ACL have not been verified in this local task',
      production_accessed: false, production_credentials_used: false, real_drive_io: false,
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
