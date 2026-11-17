import test from 'node:test'
import assert from 'node:assert/strict'
import { createHash, createHmac } from 'node:crypto'
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
import * as XLSX from 'xlsx'
import { mapImportResultToBatchRows } from '../lib/utils/scheduleImportBatch'
import { summarizeImportResult } from '../lib/utils/scheduleImportBatch'
import { processScheduleImportRows } from '../lib/utils/scheduleImportRecovery'
import { parseScheduleTabularData } from '../lib/utils/excelUtils'
import { createSupabaseScheduleImportPort } from '../lib/services/supabaseScheduleImportService'
import sharp from 'sharp'

const baseUrl = process.env.C511_BASE_URL
const anonKey = process.env.C511_ANON_KEY
const serviceKey = process.env.C511_SERVICE_ROLE_KEY
const password = process.env.C511_TEST_PASSWORD
const database = process.env.C511_DATABASE
const evidenceDir = process.env.C511_EVIDENCE_DIR
const runtimeKind = process.env.C511_RUNTIME_KIND
const authUsersBefore = Number(process.env.C511_AUTH_USERS_BEFORE)
const storageObjectsBefore = Number(process.env.C511_STORAGE_OBJECTS_BEFORE)
const authPort = process.env.C511_AUTH_PORT
const restPort = process.env.C511_REST_PORT
assert.ok(baseUrl && anonKey && serviceKey && password && database && evidenceDir
  && Number.isSafeInteger(authUsersBefore) && authUsersBefore >= 0
  && Number.isSafeInteger(storageObjectsBefore) && storageObjectsBefore >= 0
  && authPort && restPort && authPort !== restPort
  && !['15542', '15543'].includes(authPort) && !['15542', '15543'].includes(restPort),
'C5.11 local runtime environment required')
assert.match(authPort, /^\d{1,5}$/)
assert.match(restPort, /^\d{1,5}$/)
assert.ok(Number(authPort) > 0 && Number(authPort) <= 65535)
assert.ok(Number(restPort) > 0 && Number(restPort) <= 65535)
function assertFreshRuntimeKey(token: string, role: 'anon' | 'service_role') {
  const [header, body, signature] = token.split('.')
  assert.ok(header && body && signature, `${role} JWT must be well formed`)
  assert.equal(JSON.parse(Buffer.from(header, 'base64url').toString('utf8')).alg, 'HS256')
  const claims = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Record<string, unknown>
  const now = Math.floor(Date.now() / 1000)
  assert.equal(claims.role, role)
  assert.equal(claims.aud, 'authenticated')
  assert.equal(claims.iss, 'supabase')
  assert.ok(Number(claims.iat) <= now && now - Number(claims.iat) < 60, `${role} JWT must be minted immediately before the persisted leg`)
  assert.ok(Number(claims.exp) > now && Number(claims.exp) - Number(claims.iat) === 3600, `${role} JWT must keep its configured expiry`)
  assert.equal(createHmac('sha256', process.env.C511_LOCAL_JWT_SECRET!).update(`${header}.${body}`).digest('base64url'), signature,
    `${role} JWT must verify with the isolated runtime secret`)
}
assertFreshRuntimeKey(anonKey!, 'anon')
assertFreshRuntimeKey(serviceKey!, 'service_role')

const routeFetch: typeof fetch = async (input, init) => {
  const request = input instanceof Request ? new Request(input, init) : new Request(input, init)
  const target = new URL(request.url)
  let directPort: string
  if (target.pathname.startsWith('/rest/v1/')) {
    target.pathname = target.pathname.slice('/rest/v1'.length)
    directPort = restPort
  } else if (target.pathname.startsWith('/auth/v1/')) {
    target.pathname = target.pathname.slice('/auth/v1'.length)
    directPort = authPort
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
  const now = Math.floor(Date.now() / 1000)
  const issuedAt = Number(tokenClaims.iat)
  const ageSeconds = now - issuedAt
  assert.equal(tokenClaims.aud, 'authenticated')
  assert.ok(ageSeconds >= -5 && ageSeconds < 60,
    `GoTrue actor session must be freshly issued (age=${ageSeconds}s, issued_at=${issuedAt}, checked_at=${now})`)
  assert.ok(Number(tokenClaims.exp) > now, 'Fresh actor session must not already be expired')
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

function signRuntimeClaims(claims: Record<string, unknown>) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
  const body = Buffer.from(JSON.stringify(claims)).toString('base64url')
  const unsigned = `${header}.${body}`
  return `${unsigned}.${createHmac('sha256', process.env.C511_LOCAL_JWT_SECRET!).update(unsigned).digest('base64url')}`
}

async function assertInvalidRuntimeTokensRejected(client: SupabaseClient, token: string) {
  const claims = JSON.parse(Buffer.from(token.split('.')[1]!, 'base64url').toString('utf8')) as Record<string, unknown>
  const now = Math.floor(Date.now() / 1000)
  const expired = signRuntimeClaims({ ...claims, iat: now - 7200, exp: now - 3600 })
  const expiredResult = await client.auth.getUser(expired)
  assert.ok(expiredResult.error, 'GoTrue must reject a correctly signed expired actor token')

  const tampered = token.split('.')
  const signature = tampered[2]!
  tampered[2] = `${signature[0] === 'A' ? 'B' : 'A'}${signature.slice(1)}`
  const invalidSignatureResult = await client.auth.getUser(tampered.join('.'))
  assert.ok(invalidSignatureResult.error, 'GoTrue must reject an actor token with an invalid signature')

  const invalidRole = signRuntimeClaims({ ...claims, role: 'codex_missing_database_role', iat: now, exp: now + 300 })
  const roleResponse = await routeFetch(new Request('http://c511.local/rest/v1/business_users?select=id&limit=0', {
    headers: { apikey: anonKey!, Authorization: `Bearer ${invalidRole}` },
  }))
  assert.equal(roleResponse.status, 401, 'PostgREST must reject a JWT role that is not a database role')
  records.push({ jwt_rejection_tests: { expired: 'DENY', invalid_signature: 'DENY', invalid_database_role: 'DENY' } })
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

async function prepareC511RegistrationSettings() {
  const settings = requireOk(await service.from('system_settings')
    .select('id,registration_cutoff_hours,require_registration_approval,auto_lock_filled_shifts').limit(2), 'system settings read')
  assert.ok(settings.length <= 1, 'C5.11 requires a single system settings row')
  const original = settings[0]
  const testValues = { registration_cutoff_hours: 0, require_registration_approval: true, auto_lock_filled_shifts: false }

  if (original) {
    requireOk(await service.from('system_settings').update(testValues).eq('id', original.id).select('id').single(), 'C5.11 test settings')
    return async () => {
      requireOk(await service.from('system_settings').update({
        registration_cutoff_hours: original.registration_cutoff_hours,
        require_registration_approval: original.require_registration_approval,
        auto_lock_filled_shifts: original.auto_lock_filled_shifts,
      }).eq('id', original.id).select('id').single(), 'C5.11 settings restore')
    }
  }

  const inserted = requireOk(await service.from('system_settings').insert(testValues).select('id').single(), 'C5.11 test settings insert')
  return async () => {
    requireOk(await service.from('system_settings').delete().eq('id', inserted.id).select('id').single(), 'C5.11 settings cleanup')
  }
}

async function confirmKaoIssue184Shift(run: number, brandId: string, platformId: string, adminClient: SupabaseClient) {
  const brandName = requireOk(await adminClient.from('brands').select('name').eq('id', brandId).single(), 'KAO fixture Brand name').name as string
  const platformName = requireOk(await adminClient.from('platforms').select('name').eq('id', platformId).single(), 'KAO fixture Platform name').name as string
  const sourceRow: Record<string, string | number> = {
    Date: '11/1/2026', Time: '10:00 - 18:00', Brand: brandName, Platform: platformName,
    'Shift title': `KAO Issue 184 ${run}`, 'External Shift ID': 'KAO-20261101-1000-1800',
    Weekday: 'Sunday', 'Số khung': 3,
    'Khung nhân sự': 'K01 10:00-11:00 H1 T1 KT0\nK02 11:00-16:00 H2 T1 KT0\nK03 16:00-18:00 H1 T1 KT0',
    Host: 'K01: Planned Host A\nK02: Planned Host B, Planned Host C\nK03: Planned Host A',
    Support: 'K01: Planned Support A\nK02: Planned Support B\nK03: Planned Support A',
    Technical: '',
  }
  const sourceName = `KAO Issue 184 synthetic Google Sheet ${run}`
  const parseSource = (source: Record<string, string | number>) => {
    const headers = Object.keys(source)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      headers, headers.map(header => source[header]),
    ]), 'KAO Import')
    return parseScheduleTabularData(XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer, 'array', {
      brands: new Map([[brandName, brandId]]), platforms: new Map([[platformName, platformId]]), campaigns: new Map(),
    }, [])
  }
  const preview = parseSource(sourceRow)
  assert.equal(preview.errors.length, 0, JSON.stringify(preview.errors))
  assert.equal(preview.validShifts.length, 1)
  assert.equal(preview.validShifts[0].date, '2026-11-01')
  assert.equal(preview.validShifts[0].start_at, '2026-11-01T03:00:00.000Z')
  assert.equal(preview.validShifts[0].end_at, '2026-11-01T11:00:00.000Z')
  const importPort = createSupabaseScheduleImportPort(adminClient)
  const batch = await importPort.createBatch({
    source: 'google_sheets', sourceName,
    createdBy: 'authenticated-admin', summary: summarizeImportResult(preview),
    previewRows: preview.rows.map(row => row.row),
  })
  const batchId = batch.id
  const batchRows = await importPort.listBatchRows(batchId)
  assert.equal(batchRows.length, 1, 'Preview should persist its source row before Confirm')
  const shiftRepo = createSupabaseShiftRepository(adminClient)
  const differentImportActor = await seedUser(run, 'C6ReimportDifferentAdmin', 'admin')
  const differentImportSession = await signIn(differentImportActor)
  const unauthorizedConfirm = await createSupabaseShiftRepository(differentImportSession.client)
    .createFromImport(batchId, batchRows[0].source_row_number, preview.validShifts[0])
    .then(() => ({ denied: false, message: '' }))
    .catch(error => ({ denied: true, message: String(error.message) }))
  assert.equal(unauthorizedConfirm.denied, true, 'another actor cannot confirm an Admin-owned import batch')
  assert.match(unauthorizedConfirm.message, /IMPORT_BATCH_ACTOR_MISMATCH/u)
  const unchangedPendingRow = requireOk(await adminClient.from('schedule_import_batch_rows')
    .select('outcome,shift_id').eq('batch_id', batchId).single(), 'unauthorized C6 Confirm readback')
  assert.equal(unchangedPendingRow.outcome, 'pending')
  assert.equal(unchangedPendingRow.shift_id, null)
  let nonAtomicOutcomeWrites = 0
  let initialRpcError: string | null = null
  const confirmed = await processScheduleImportRows({
    batchId, previews: preview.rows, batchRows, initialShifts: [],
    createShift: shiftRepo.create, refreshShifts: shiftRepo.getAll,
    createShiftFromImport: async (rowNumber, data) => {
      try { return await shiftRepo.createFromImport(batchId, rowNumber, data) }
      catch (error) { initialRpcError = error instanceof Error ? error.message : String(error); throw error }
    },
    recordOutcome: input => {
      nonAtomicOutcomeWrites += 1
      return importPort.recordRowOutcome(batchId, input.rowNumber, input.outcome, {
        expectedOutcome: input.expectedOutcome, shiftId: input.shiftId, failureCode: input.failureCode,
      })
    },
  })
  assert.equal(nonAtomicOutcomeWrites, 0, `successful Import Confirm and review decisions must persist receipts inside the RPC; RPC error=${initialRpcError ?? 'none'}`)
  assert.deepEqual(confirmed, { imported: 1, recovered: 0, duplicateSkipped: 0, retryable: 0, finalizedSkipped: 0 })
  const initialReceipt = requireOk(await adminClient.from('schedule_import_batch_rows')
    .select('outcome,shift_id,failure_code').eq('batch_id', batchId).single(), 'KAO atomic Confirm receipt')
  assert.equal(initialReceipt.outcome, 'imported')
  assert.ok(initialReceipt.shift_id)
  assert.equal(initialReceipt.failure_code, null)
  await importPort.markBatchStatus(batchId, 'confirmed')

  const parents = requireOk(await adminClient.from('shifts')
    .select('id,brand_id,platform_id,studio,campaign_id,import_batch_id,date,start_time,end_time,start_at,end_at,version,required_host_count,required_support_count,required_technical_count')
    .eq('brand_id', brandId).eq('date', '2026-11-01').eq('start_time', '10:00:00').eq('end_time', '18:00:00'),
  'KAO imported parent authenticated readback') as Array<Record<string, unknown>>
  assert.equal(parents.length, 1)
  const parent = parents[0]
  assert.equal(parent.id, initialReceipt.shift_id)
  assert.equal(parent.required_host_count, 2)
  assert.equal(parent.required_support_count, 1)
  assert.equal(parent.required_technical_count, 0)
  const segments = requireOk(await adminClient.from('shift_staffing_segments')
    .select('id,shift_id,segment_index,start_at,end_at,required_host_count,required_support_count,required_technical_count,planned_host_names,planned_support_names,planned_technical_names')
    .eq('shift_id', String(parent.id)).order('segment_index'), 'KAO imported segment authenticated readback') as Array<Record<string, unknown>>
  assert.deepEqual(segments.map(segment => [segment.start_at, segment.end_at, segment.required_host_count, segment.required_support_count, segment.required_technical_count]), [
    ['2026-11-01T03:00:00+00:00', '2026-11-01T04:00:00+00:00', 1, 1, 0],
    ['2026-11-01T04:00:00+00:00', '2026-11-01T09:00:00+00:00', 2, 1, 0],
    ['2026-11-01T09:00:00+00:00', '2026-11-01T11:00:00+00:00', 1, 1, 0],
  ])
  assert.deepEqual(segments.map(segment => segment.planned_host_names), [['Planned Host A'], ['Planned Host B', 'Planned Host C'], ['Planned Host A']])
  assert.deepEqual(segments.map(segment => segment.planned_support_names), [['Planned Support A'], ['Planned Support B'], ['Planned Support A']])
  assert.ok(segments.every(segment => Array.isArray(segment.planned_technical_names) && segment.planned_technical_names.length === 0))
  const registrations = requireOk(await adminClient.from('shift_registrations').select('id').eq('shift_id', String(parent.id)), 'KAO assignment readback') as Array<Record<string, unknown>>
  assert.equal(registrations.length, 0, 'planned names must not create approved assignments')

  let reconciliationPayrollPeriodId: string | null = null
  const readOperationalSnapshot = async () => {
    const parentSnapshot = requireOk(await adminClient.from('shifts')
      .select('id,date,start_time,end_time,start_at,end_at,version,title,status,required_host_count,required_support_count,required_technical_count')
      .eq('id', String(parent.id)).single(), 'KAO reconciliation parent snapshot')
    const segmentSnapshot = requireOk(await adminClient.from('shift_staffing_segments')
      .select('id,shift_id,segment_index,start_at,end_at,required_host_count,required_support_count,required_technical_count,planned_host_names,planned_support_names,planned_technical_names')
      .eq('shift_id', String(parent.id)).order('segment_index'), 'KAO reconciliation segment snapshot') as Array<Record<string, unknown>>
    const registrationSnapshot = requireOk(await adminClient.from('shift_registrations')
      .select('id,status,user_id').eq('shift_id', String(parent.id)).order('id'), 'KAO reconciliation staffing snapshot')
    const actualSnapshot = requireOk(await adminClient.from('workforce_actual_segments')
      .select('id,staff_id,review_status,actual_start_at,actual_end_at,version').eq('shift_id', String(parent.id)).order('id'), 'KAO reconciliation actual snapshot') as Array<Record<string, unknown>>
    const actualIds = actualSnapshot.map(row => String(row.id))
    const photoSnapshot = requireOk(await adminClient.from('self_attendance_photo_evidence')
      .select('id,request_id,staff_id,event_kind,external_file_id,external_parent_id,checksum_sha256').eq('shift_id', String(parent.id)).order('id'), 'KAO reconciliation evidence snapshot')
    const auditSnapshot = requireOk(await adminClient.from('audit_logs')
      .select('id,entity_id,entity_name,action').eq('entity_id', String(parent.id)).order('id'), 'KAO reconciliation audit snapshot')
    const reportSnapshot = requireOk(await service.from('reports')
      .select('id,shift_id,status,gmv,normalized_metrics,version_number').eq('shift_id', String(parent.id)).order('id'), 'KAO report and KPI snapshot') as Array<Record<string, unknown>>
    const reportIds = reportSnapshot.map(report => String(report.id))
    const reportRevisions = reportIds.length ? requireOk(await service.from('report_revisions')
      .select('id,report_id,version,status,event,metrics').in('report_id', reportIds).order('id'), 'KAO report revision snapshot') : []
    const reportImages = reportIds.length ? requireOk(await service.from('report_images')
      .select('id,report_id,image_type,storage_path').in('report_id', reportIds).order('id'), 'KAO report evidence image snapshot') : []
    const liveReportImages = reportIds.length ? requireOk(await service.from('live_report_images')
      .select('id,report_id,category,file_url,file_name,external_file_id,external_parent_id,checksum_sha256')
      .in('report_id', reportIds).order('id'), 'KAO live report image snapshot') : []
    const payrollLines = actualIds.length ? requireOk(await service.from('workforce_payroll_lines')
      .select('id,period_id,segment_id,rate_card_id,actual_seconds,payable_seconds,gross_vnd,voided_at')
      .in('segment_id', actualIds).order('id'), 'KAO reconciliation Payroll line snapshot') : []
    const payrollPeriods = reconciliationPayrollPeriodId ? requireOk(await service.from('workforce_payroll_periods')
      .select('id,status,revision,locked_by,locked_at').eq('id', reconciliationPayrollPeriodId), 'KAO reconciliation Payroll period snapshot') : []
    return { parent: parentSnapshot, segments: segmentSnapshot, registrations: registrationSnapshot,
      actuals: actualSnapshot, photos: photoSnapshot, audits: auditSnapshot, reports: reportSnapshot,
      reportRevisions, reportImages, liveReportImages, payrollLines, payrollPeriods }
  }
  const sourceBaseline = await readOperationalSnapshot()
  const scopedLeader = await seedUser(Date.now(), 'C6ScopedLeader', 'leader')
  const scopedLeaderAuth = await signIn(scopedLeader)
  requireOk(await adminClient.rpc('rc19_set_leader_brand_scope', {
    p_user_id: scopedLeader.businessId, p_brand_id: brandId, p_scope_key: 'shifts.manage',
    p_enabled: true, p_expected_version: 0, p_valid_from: activeFrom(), p_valid_until: null,
    p_reason: 'C6 synthetic in-scope import authorization fixture',
  }), 'C6 scoped Leader grant fixture')
  const leaderChangedSource = parseSource({ ...sourceRow, Host: 'K01: Scoped Leader planned label change' })
  const leaderBatch = await importPort.createBatch({
    source: 'google_sheets', sourceName, createdBy: 'authenticated-admin',
    summary: summarizeImportResult(leaderChangedSource), previewRows: leaderChangedSource.rows.map(item => item.row),
  })
  requireOk(await service.from('schedule_import_batches').update({ created_by: scopedLeader.businessId })
    .eq('id', leaderBatch.id).select('id').single(), 'C6 Leader batch actor fixture')
  const leaderReview = await createSupabaseShiftRepository(scopedLeaderAuth.client).createFromImport(
    leaderBatch.id, leaderChangedSource.rows[0].row.row_number, leaderChangedSource.validShifts[0],
  )
  assert.equal(leaderReview.kind, 'review_required', 'an in-scope Leader may submit a changed source only for review')
  assert.match(leaderReview.kind === 'review_required' ? leaderReview.failureCode : '', /^IMPORT_SOURCE_CHANGED_REVIEW_REQUIRED:/)
  const leaderReceipt = requireOk(await adminClient.from('schedule_import_batch_rows')
    .select('outcome,shift_id,failure_code').eq('batch_id', leaderBatch.id).single(), 'C6 Leader changed-source receipt')
  assert.equal(leaderReceipt.outcome, 'retryable')
  assert.equal(leaderReceipt.shift_id, null)
  assert.deepEqual(await readOperationalSnapshot(), sourceBaseline, 'Leader review must not mutate the authorized parent')

  const foreignBrandId = await newBrand(`C6 Foreign Brand ${run}`)
  const foreignBrandName = requireOk(await service.from('brands').select('name').eq('id', foreignBrandId).single(), 'C6 foreign Brand name').name as string
  const foreignSource = { ...sourceRow, Date: '2026-11-01', Brand: foreignBrandName, 'External Shift ID': `C6-FOREIGN-${run}` }
  const foreignWorkbook = XLSX.utils.book_new()
  const foreignHeaders = Object.keys(foreignSource)
  XLSX.utils.book_append_sheet(foreignWorkbook, XLSX.utils.aoa_to_sheet([
    foreignHeaders, foreignHeaders.map(header => foreignSource[header]),
  ]), 'C6 Foreign Brand')
  const foreignPreview = parseScheduleTabularData(XLSX.write(foreignWorkbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer, 'array', {
    brands: new Map([[foreignBrandName, foreignBrandId]]), platforms: new Map([[platformName, platformId]]), campaigns: new Map(),
  }, [])
  assert.equal(foreignPreview.errors.length, 0, JSON.stringify(foreignPreview.errors))
  const foreignLeader = await seedUser(Date.now(), 'C6ForeignLeader', 'leader')
  const foreignLeaderAuth = await signIn(foreignLeader)
  const foreignBatch = await importPort.createBatch({
    source: 'google_sheets', sourceName: `C6 foreign Brand ${run}`, createdBy: 'authenticated-admin',
    summary: summarizeImportResult(foreignPreview), previewRows: foreignPreview.rows.map(item => item.row),
  })
  requireOk(await service.from('schedule_import_batches').update({ created_by: foreignLeader.businessId })
    .eq('id', foreignBatch.id).select('id').single(), 'C6 foreign Leader batch actor fixture')
  const foreignLeaderAttempt = await createSupabaseShiftRepository(foreignLeaderAuth.client)
    .createFromImport(foreignBatch.id, foreignPreview.rows[0].row.row_number, foreignPreview.validShifts[0])
    .then(() => ({ denied: false, message: '' }))
    .catch(error => ({ denied: true, message: String(error.message) }))
  assert.equal(foreignLeaderAttempt.denied, true, 'Leader without an active grant cannot import another Brand')
  assert.match(foreignLeaderAttempt.message, /OPERATION_NOT_ALLOWED/u)
  const foreignPending = requireOk(await adminClient.from('schedule_import_batch_rows')
    .select('outcome,shift_id,failure_code').eq('batch_id', foreignBatch.id).single(), 'C6 foreign Leader receipt remains pending')
  assert.deepEqual(foreignPending, { outcome: 'pending', shift_id: null, failure_code: null })

  const member = await seedUser(Date.now(), 'C6UnauthorizedMember', 'member')
  const memberAuth = await signIn(member)
  const memberBatch = await importPort.createBatch({
    source: 'google_sheets', sourceName: `C6 member ${run}`, createdBy: 'authenticated-admin',
    summary: summarizeImportResult(foreignPreview), previewRows: foreignPreview.rows.map(item => item.row),
  })
  requireOk(await service.from('schedule_import_batches').update({ created_by: member.businessId })
    .eq('id', memberBatch.id).select('id').single(), 'C6 Member batch actor fixture')
  const memberAttempt = await createSupabaseShiftRepository(memberAuth.client)
    .createFromImport(memberBatch.id, foreignPreview.rows[0].row.row_number, foreignPreview.validShifts[0])
    .then(() => ({ denied: false }))
    .catch(() => ({ denied: true }))
  assert.equal(memberAttempt.denied, true, 'Member cannot invoke shift import Confirm')

  const anonClient = createClient(baseUrl!, anonKey!, clientOptions)
  const anonAttempt = await anonClient.rpc('create_schedule_import_shift', {
    p_batch_id: foreignBatch.id, p_row_number: foreignPreview.rows[0].row.row_number,
    p_data: {}, p_segments: [],
  })
  assert.ok(anonAttempt.error, 'anonymous role cannot execute the import RPC')
  const unauthorizedReceipts = requireOk(await adminClient.from('schedule_import_batch_rows')
    .select('outcome,shift_id').in('batch_id', [foreignBatch.id, memberBatch.id]), 'C6 unauthorized receipt readback') as Array<Record<string, unknown>>
  assert.equal(unauthorizedReceipts.length, 2)
  assert.ok(unauthorizedReceipts.every(row => row.outcome === 'pending' && row.shift_id === null))
  const roleScopeResults = {
    in_scope_leader: 'authenticated Leader with active shifts.manage Brand grant receives review_required; no parent mutation',
    foreign_brand_leader: 'authenticated Leader without Brand grant denied; pending receipt unchanged',
    member: 'authenticated Member denied Confirm; pending receipt unchanged',
    anonymous: 'anon EXECUTE denied; pending receipt unchanged',
  }

  const importSourceRevision = async (source: Record<string, string | number>, expectedFields: string[] = [], expectedSnapshot = sourceBaseline) => {
    const revisionPreview = parseSource(source)
    assert.equal(revisionPreview.errors.length, 0, `changed source should remain syntactically valid: ${JSON.stringify(revisionPreview.errors)}`)
    assert.equal(revisionPreview.validShifts.length, 1)
    const revisionBatch = await importPort.createBatch({
      source: 'google_sheets', sourceName, createdBy: 'authenticated-admin',
      summary: summarizeImportResult(revisionPreview), previewRows: revisionPreview.rows.map(item => item.row),
    })
    const revisionRows = await importPort.listBatchRows(revisionBatch.id)
    assert.equal(revisionRows.length, 1)
    let fallbackOutcomeWrites = 0
    let revisionRpcError: string | null = null
    const result = await processScheduleImportRows({
      batchId: revisionBatch.id, previews: revisionPreview.rows, batchRows: revisionRows, initialShifts: [],
      createShift: shiftRepo.create, refreshShifts: shiftRepo.getAll,
      createShiftFromImport: async (rowNumber, data) => {
        try { return await shiftRepo.createFromImport(revisionBatch.id, rowNumber, data) }
        catch (error) { revisionRpcError = error instanceof Error ? error.message : String(error); throw error }
      },
      recordOutcome: input => {
        fallbackOutcomeWrites += 1
        return importPort.recordRowOutcome(revisionBatch.id, input.rowNumber, input.outcome, {
          expectedOutcome: input.expectedOutcome, shiftId: input.shiftId, failureCode: input.failureCode,
        })
      },
    })
    assert.equal(fallbackOutcomeWrites, 0, `RPC-confirmed duplicate/review outcomes must own their receipts; RPC error=${revisionRpcError ?? 'none'}`)
    const receipt = requireOk(await adminClient.from('schedule_import_batch_rows')
      .select('outcome,shift_id,failure_code').eq('batch_id', revisionBatch.id).single(), 'changed-source persisted receipt')
    const originalReceipt = requireOk(await adminClient.from('schedule_import_batch_rows')
      .select('outcome,shift_id,failure_code').eq('batch_id', batchId).single(), 'original source receipt remains immutable')
    assert.equal(originalReceipt.outcome, 'imported')
    assert.equal(originalReceipt.shift_id, String(parent.id))
    assert.equal(originalReceipt.failure_code, null)
    const current = await readOperationalSnapshot()
    assert.deepEqual(current, expectedSnapshot, 'changed-source review must preserve parent, segments, staffing, evidence, actuals and audit')
    if (expectedFields.length) {
      assert.deepEqual(result, { imported: 0, recovered: 0, duplicateSkipped: 0, retryable: 1, finalizedSkipped: 0 })
      assert.equal(receipt.outcome, 'retryable')
      assert.equal(receipt.shift_id, null)
      assert.match(String(receipt.failure_code), /^IMPORT_SOURCE_CHANGED_REVIEW_REQUIRED:/)
      for (const field of expectedFields) assert.ok(String(receipt.failure_code).includes(field), `${field} should be reported: ${receipt.failure_code}`)
      await importPort.markBatchStatus(revisionBatch.id, 'failed')
      const retry = await shiftRepo.createFromImport(revisionBatch.id, revisionRows[0].source_row_number, revisionPreview.validShifts[0])
      assert.equal(retry.kind, 'review_required', 'retrying a review-required row stays fail-closed')
    }
    return { result, receipt, revisionBatch, revisionPreview }
  }

  const identical = await importSourceRevision(sourceRow)
  assert.equal(identical.result.duplicateSkipped, 1)
  assert.equal(identical.receipt.outcome, 'duplicate_skipped')
  assert.equal(identical.receipt.shift_id, null)
  await importPort.markBatchStatus(identical.revisionBatch.id, 'confirmed')

  await importSourceRevision({
    ...sourceRow, Host: 'K01: Planned Host A Revised\nK02: Planned Host B, Planned Host C\nK03: Planned Host A',
  }, ['host_names'])
  await importSourceRevision({
    ...sourceRow, 'Khung nhân sự': 'K01 10:00-11:00 H1 T1 KT0\nK02 11:00-16:00 H3 T1 KT0\nK03 16:00-18:00 H1 T1 KT0',
    Host: 'K01: Planned Host A\nK02: Planned Host B, Planned Host C, Planned Host D\nK03: Planned Host A',
  }, ['staffing_segments'])
  await importSourceRevision({
    ...sourceRow, 'Khung nhân sự': 'K01 10:00-11:00 H1 T1 KT0\nK02 11:00-15:00 H2 T1 KT0\nK03 15:00-18:00 H1 T1 KT0',
  }, ['staffing_segments'])
  await importSourceRevision({
    ...sourceRow, Date: '11/2/2026', Weekday: 'Monday', 'External Shift ID': 'KAO-20261102-1000-1800',
  }, ['date', 'external_shift_code'])
  await importSourceRevision({
    ...sourceRow, Time: '09:00 - 18:00', 'External Shift ID': 'KAO-20261101-0900-1800',
    'Khung nhân sự': 'K01 09:00-10:00 H1 T1 KT0\nK02 10:00-15:00 H2 T1 KT0\nK03 15:00-18:00 H1 T1 KT0',
  }, ['start_time', 'external_shift_code', 'staffing_segments'])

  const concurrentRevision = parseSource({ ...sourceRow, Host: 'K01: Concurrent Host Change' })
  assert.equal(concurrentRevision.errors.length, 0, JSON.stringify(concurrentRevision.errors))
  const concurrentRevisionBatches = await Promise.all([0, 1].map(() => importPort.createBatch({
    source: 'google_sheets', sourceName, createdBy: 'authenticated-admin',
    summary: summarizeImportResult(concurrentRevision), previewRows: concurrentRevision.rows.map(item => item.row),
  })))
  const concurrentRevisionResults = await Promise.all(concurrentRevisionBatches.map(async revisionBatch => {
    const revisionRows = await importPort.listBatchRows(revisionBatch.id)
    return processScheduleImportRows({
      batchId: revisionBatch.id, previews: concurrentRevision.rows, batchRows: revisionRows, initialShifts: [],
      createShift: shiftRepo.create, refreshShifts: shiftRepo.getAll,
      createShiftFromImport: (rowNumber, data) => shiftRepo.createFromImport(revisionBatch.id, rowNumber, data),
      recordOutcome: input => importPort.recordRowOutcome(revisionBatch.id, input.rowNumber, input.outcome, {
        expectedOutcome: input.expectedOutcome, shiftId: input.shiftId, failureCode: input.failureCode,
      }),
    })
  }))
  assert.ok(concurrentRevisionResults.every(result => result.imported === 0 && result.retryable === 1))
  for (const revisionBatch of concurrentRevisionBatches) {
    const receipt = requireOk(await adminClient.from('schedule_import_batch_rows')
      .select('outcome,shift_id,failure_code').eq('batch_id', revisionBatch.id).single(), 'concurrent changed-source receipt')
    assert.equal(receipt.outcome, 'retryable')
    assert.equal(receipt.shift_id, null)
    assert.match(String(receipt.failure_code), /^IMPORT_SOURCE_CHANGED_REVIEW_REQUIRED:/)
    assert.ok(String(receipt.failure_code).includes('host_names'))
    await importPort.markBatchStatus(revisionBatch.id, 'failed')
  }
  assert.deepEqual(await readOperationalSnapshot(), sourceBaseline, 'concurrent changed-source reviews must preserve the original shift and all history')
  const concurrentOriginalReceipt = requireOk(await adminClient.from('schedule_import_batch_rows')
    .select('outcome,shift_id,failure_code').eq('batch_id', batchId).single(), 'concurrent original source receipt readback')
  assert.equal(concurrentOriginalReceipt.outcome, 'imported')
  assert.equal(concurrentOriginalReceipt.shift_id, String(parent.id))
  assert.equal(concurrentOriginalReceipt.failure_code, null)

  const adminAuthUser = await adminClient.auth.getUser()
  assert.ifError(adminAuthUser.error)
  assert.ok(adminAuthUser.data.user)
  const adminActor = requireOk(await service.from('business_users').select('id')
    .eq('auth_user_id', adminAuthUser.data.user.id).single(), 'C6 fixture Admin identity')
  const protectedHost = await seedUser(run, 'C6ReimportProtectedHost', 'member', ['host'])
  const payrollAdmin = await seedUser(run, 'C6ReimportPayrollAdmin', 'admin')

  const approvedRegistration = await createSupabaseShiftRegistrationRepository(adminClient).assignManually(
    String(parent.id), protectedHost.businessId, 'host',
    'C6 synthetic protected assignment fixture', Number(parent.version), String(segments[0].id),
  )
  assert.equal(approvedRegistration.status, 'manually_assigned')
  await importSourceRevision({
    ...sourceRow, Host: 'K01: Approved Host Label Change\nK02: Planned Host B, Planned Host C\nK03: Planned Host A',
  }, ['host_names'], await readOperationalSnapshot())

  requireOk(await service.from('shifts').update({ status: 'completed' }).eq('id', String(parent.id)).select('id').single(), 'C6 synthetic completed shift fixture')
  const photoRequestId = crypto.randomUUID()
  requireOk(await service.from('self_attendance_photo_evidence').insert({
    request_id: photoRequestId, shift_id: String(parent.id), staff_id: protectedHost.businessId,
    operational_role: 'host', event_kind: 'check_in', provider: 'google_drive',
    external_file_id: `c6-synthetic-photo-${run}`, external_parent_id: `c6-synthetic-parent-${run}`,
    file_name: `C6 synthetic attendance ${run}.jpg`, mime_type: 'image/jpeg', size_bytes: 64,
    checksum_sha256: 'a'.repeat(64), shift_context: { synthetic_fixture: true }, capture_source: 'camera',
  }).select('id').single(), 'C6 synthetic private-photo receipt fixture')
  const actualId = `c6_actual_${run}_${crypto.randomUUID().replaceAll('-', '').slice(0, 10)}`
  requireOk(await service.from('workforce_actual_segments').insert({
    id: actualId, shift_id: String(parent.id), staff_id: protectedHost.businessId, operational_role: 'host',
    event_kind: 'worked', coverage_kind: 'planned', actual_start_at: '2026-11-01T03:00:00Z',
    actual_end_at: '2026-11-01T04:00:00Z', review_status: 'draft', evidence_note: 'C6 synthetic protected actual fixture',
    created_by: protectedHost.businessId,
  }).select('id').single(), 'C6 synthetic draft actual fixture')
  const approvedActual = requireOk(await service.from('workforce_actual_segments').update({
    review_status: 'approved', reviewed_by: adminActor.id, reviewed_at: new Date().toISOString(),
    review_note: 'C6 synthetic protected actual approved by fixture', version: 2,
  }).eq('id', actualId).select('id,version').single(), 'C6 synthetic approved actual fixture')
  requireOk(await service.from('workforce_payroll_segment_decisions').insert({
    segment_id: actualId, state: 'admin_confirmed', reviewed_by: adminActor.id,
    confirmed_by: payrollAdmin.businessId, confirmed_at: new Date().toISOString(),
    reason: 'C6 synthetic protected payroll decision fixture', missing_evidence: [], segment_version: approvedActual.version,
  }).select('segment_id').single(), 'C6 synthetic confirmed Payroll decision fixture')
  await importSourceRevision({
    ...sourceRow, 'Khung nhân sự': 'K01 10:00-11:00 H1 T1 KT0\nK02 11:00-15:00 H2 T1 KT0\nK03 15:00-18:00 H1 T1 KT0',
  }, ['staffing_segments'], await readOperationalSnapshot())

  const rateId = `c6_rate_${run}_${crypto.randomUUID().replaceAll('-', '').slice(0, 10)}`
  requireOk(await service.from('workforce_rate_cards').insert({
    id: rateId, staff_id: protectedHost.businessId, operational_role: 'host', effective_from: '2026-01-01',
    vnd_per_hour: 120000, overtime_multiplier_basis_points: 10000, approved_by: adminActor.id,
    approved_at: new Date().toISOString(), approval_note: 'C6 synthetic immutable Payroll fixture rate',
  }).select('id').single(), 'C6 synthetic approved rate fixture')
  const existingPeriods = requireOk(await service.from('workforce_payroll_periods').select('revision')
    .eq('period_start', '2026-11-01').eq('period_end', '2026-11-30'), 'C6 existing synthetic Payroll revisions') as Array<{ revision: number }>
  const revision = existingPeriods.reduce((latest, item) => Math.max(latest, Number(item.revision) || 0), 0) + 1
  const period = requireOk(await service.from('workforce_payroll_periods').insert({
    period_start: '2026-11-01', period_end: '2026-11-30', revision, status: 'draft', created_by: payrollAdmin.businessId,
  }).select('id').single(), 'C6 synthetic Payroll period fixture')
  reconciliationPayrollPeriodId = String(period.id)
  requireOk(await service.from('workforce_payroll_lines').insert({
    period_id: period.id, segment_id: actualId, rate_card_id: rateId, staff_id: protectedHost.businessId,
    operational_role: 'host', actual_minutes: 60, payable_minutes: 60, overtime_minutes: 0,
    rate_vnd_per_hour: 120000, overtime_multiplier_basis_points: 10000, gross_vnd: 120000,
    calculation_version: 'legacy-minute-snapshot-v1',
  }).select('id').single(), 'C6 synthetic Payroll line fixture')
  const transitionPeriod = async (client: SupabaseClient, actorId: string, expected: string, target: string) => requireOk(
    await client.rpc('workforce_rc16_transition_payroll', {
      p_period_id: period.id, p_expected_status: expected, p_target_status: target,
      p_actor_id: actorId, p_reason: `C6 synthetic ${expected} to ${target} fixture transition`,
    }), `C6 Payroll ${target} fixture transition`)
  await transitionPeriod(service, String(adminActor.id), 'draft', 'reviewed')
  await transitionPeriod(service, payrollAdmin.businessId, 'reviewed', 'confirmed')
  await transitionPeriod(service, String(adminActor.id), 'confirmed', 'payroll_ready')
  await transitionPeriod(service, payrollAdmin.businessId, 'payroll_ready', 'locked')
  const lockedSnapshot = await readOperationalSnapshot()
  assert.equal((lockedSnapshot.payrollPeriods as Array<{ status: string }>)[0]?.status, 'locked')
  await importSourceRevision({
    ...sourceRow, Date: '11/2/2026', Weekday: 'Monday', 'External Shift ID': 'KAO-20261102-1000-1800',
  }, ['date', 'external_shift_code'], lockedSnapshot)

  const staleUpdate = await adminClient.rpc('update_shift', {
    p_shift_id: String(parent.id), p_patch: { title: `stale overwrite ${run}` },
    p_confirm_impact: false, p_expected_version: Number(parent.version) - 1,
  })
  assert.ok(staleUpdate.error, 'a stale version must be rejected by the database RPC')
  const afterStaleUpdate = requireOk(await adminClient.from('shifts').select('title,version').eq('id', String(parent.id)).single(), 'stale version readback')
  assert.equal(afterStaleUpdate.title, `KAO Issue 184 ${run}`)

  const faultSource = {
    Date: '2026-11-02', Time: '10:00 - 12:00', Brand: brandName, Platform: platformName,
    'Shift title': '', 'External Shift ID': '', Weekday: 'Monday', 'Số khung': 2,
    'Khung nhân sự': 'K01 10:00-11:00 H1 T1 KT0\nK02 11:00-12:00 H1 T1 KT0',
    Host: 'K01: Planned Host A\nK02: Planned Host A',
    Support: 'K01: Planned Support A\nK02: Planned Support A', Technical: '',
  }
  for (const fault of ['second_segment_capacity', 'duplicate_segment_index'] as const) {
    const title = `C511 rollback ${fault} ${run}`
    const row = { ...faultSource, 'Shift title': title, 'External Shift ID': `C511-ROLLBACK-${fault}-${run}` }
    const faultWorkbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(faultWorkbook, XLSX.utils.aoa_to_sheet([
      Object.keys(row), Object.keys(row).map(key => row[key as keyof typeof row]),
    ]), 'Fault Injection')
    const faultPreview = parseScheduleTabularData(XLSX.write(faultWorkbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer, 'array', {
      brands: new Map([[brandName, brandId]]), platforms: new Map([[platformName, platformId]]), campaigns: new Map(),
    }, [])
    assert.equal(faultPreview.errors.length, 0, JSON.stringify(faultPreview.errors))
    const faultImport = createSupabaseScheduleImportPort(adminClient)
    const faultBatch = await faultImport.createBatch({
      source: 'google_sheets', sourceName: `Synthetic fault ${fault} ${run}`,
      createdBy: 'authenticated-admin', summary: summarizeImportResult(faultPreview),
      previewRows: faultPreview.rows.map(item => item.row),
    })
    const candidate = faultPreview.rows[0].shift!
    assert.equal(candidate.staffing_segments?.length, 2)
    const brokenSegments = candidate.staffing_segments!.map((segment, index) => ({
      ...segment,
      ...(fault === 'second_segment_capacity' && index === 1 ? { required_host_count: 101 } : {}),
      ...(fault === 'duplicate_segment_index' && index === 1 ? { segment_index: 1 } : {}),
    }))
    const injectedPreviews = faultPreview.rows.map(item => ({
      ...item, shift: { ...item.shift!, staffing_segments: brokenSegments },
    }))
    const batchRows = await faultImport.listBatchRows(faultBatch.id)
    const result = await processScheduleImportRows({
      batchId: faultBatch.id, previews: injectedPreviews, batchRows, initialShifts: [],
      createShift: createSupabaseShiftRepository(adminClient).create,
      refreshShifts: createSupabaseShiftRepository(adminClient).getAll,
      recordOutcome: input => faultImport.recordRowOutcome(faultBatch.id, input.rowNumber, input.outcome, {
        expectedOutcome: input.expectedOutcome, shiftId: input.shiftId, failureCode: input.failureCode,
      }),
    })
    assert.equal(result.imported, 0, `${fault} must never be reported as successfully imported`)
    assert.equal(result.retryable, 1)
    const storedOutcome = requireOk(await adminClient.from('schedule_import_batch_rows')
      .select('outcome,shift_id,failure_code').eq('batch_id', faultBatch.id).single(), `${fault} persisted import outcome`)
    assert.equal(storedOutcome.outcome, 'retryable')
    assert.equal(storedOutcome.shift_id, null)
    assert.ok(storedOutcome.failure_code)
    const rolledBackParent = requireOk(await adminClient.from('shifts').select('id').eq('title', title), `${fault} parent rollback`) as Array<Record<string, unknown>>
    assert.equal(rolledBackParent.length, 0, `${fault} parent must rollback with segment insert`)
    const rolledBackAudit = requireOk(await adminClient.from('audit_logs').select('id').eq('entity_name', title), `${fault} audit rollback`) as Array<Record<string, unknown>>
    assert.equal(rolledBackAudit.length, 0, `${fault} parent audit must rollback with transaction`)
  }

  const concurrentTitle = `C511 concurrent confirm ${run}`
  const concurrentSource = { ...faultSource, Date: '2026-11-03', Weekday: 'Tuesday', 'Shift title': concurrentTitle,
    'External Shift ID': `C511-CONCURRENT-${run}` }
  const concurrentWorkbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(concurrentWorkbook, XLSX.utils.aoa_to_sheet([
    Object.keys(concurrentSource), Object.keys(concurrentSource).map(key => concurrentSource[key as keyof typeof concurrentSource]),
  ]), 'Concurrent Confirm')
  const concurrentPreview = parseScheduleTabularData(XLSX.write(concurrentWorkbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer, 'array', {
    brands: new Map([[brandName, brandId]]), platforms: new Map([[platformName, platformId]]), campaigns: new Map(),
  }, [])
  assert.equal(concurrentPreview.errors.length, 0, JSON.stringify(concurrentPreview.errors))
  const concurrentImport = createSupabaseScheduleImportPort(adminClient)
  const concurrentBatch = await concurrentImport.createBatch({
    source: 'google_sheets', sourceName: `Synthetic concurrent Confirm ${run}`,
    createdBy: 'authenticated-admin', summary: summarizeImportResult(concurrentPreview),
    previewRows: concurrentPreview.rows.map(item => item.row),
  })
  const concurrentBatchRows = await concurrentImport.listBatchRows(concurrentBatch.id)
  const concurrentRepo = createSupabaseShiftRepository(adminClient)
  const concurrentWorker = () => processScheduleImportRows({
    batchId: concurrentBatch.id, previews: concurrentPreview.rows, batchRows: concurrentBatchRows,
    initialShifts: [], createShift: concurrentRepo.create, refreshShifts: concurrentRepo.getAll,
    recordOutcome: input => concurrentImport.recordRowOutcome(concurrentBatch.id, input.rowNumber, input.outcome, {
      expectedOutcome: input.expectedOutcome, shiftId: input.shiftId, failureCode: input.failureCode,
    }),
  })
  const concurrentResults = await Promise.all([concurrentWorker(), concurrentWorker()])
  const concurrentParents = requireOk(await adminClient.from('shifts').select('id')
    .eq('import_batch_id', concurrentBatch.id), 'concurrent parent readback') as Array<Record<string, unknown>>
  assert.equal(concurrentParents.length, 1, 'concurrent Confirm creates one parent')
  const concurrentSegments = requireOk(await adminClient.from('shift_staffing_segments').select('id')
    .eq('shift_id', String(concurrentParents[0].id)), 'concurrent segment readback') as Array<Record<string, unknown>>
  assert.equal(concurrentSegments.length, 2)
  assert.equal(concurrentResults.reduce((count, result) => count + result.imported + result.recovered, 0), 2)
  const concurrentOutcome = requireOk(await adminClient.from('schedule_import_batch_rows')
    .select('outcome,shift_id').eq('batch_id', concurrentBatch.id).single(), 'concurrent row outcome')
  assert.ok(['imported', 'warning'].includes(String(concurrentOutcome.outcome)))
  assert.equal(concurrentOutcome.shift_id, concurrentParents[0].id)
  const concurrentAudits = requireOk(await adminClient.from('audit_logs').select('id')
    .eq('entity_name', concurrentTitle), 'concurrent audit count') as Array<Record<string, unknown>>
  assert.ok(concurrentAudits.length >= 1, 'committed parent has an audit event')
  assert.equal(new Set(concurrentAudits.map(event => event.entity_id)).size, 1, 'concurrent audit events refer to one canonical parent')

  const timeoutTitle = `C511 timeout outcome ${run}`
  const timeoutSource = { ...faultSource, Date: '2026-11-04', Weekday: 'Wednesday', 'Shift title': timeoutTitle,
    'External Shift ID': `C511-TIMEOUT-${run}` }
  const timeoutWorkbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(timeoutWorkbook, XLSX.utils.aoa_to_sheet([
    Object.keys(timeoutSource), Object.keys(timeoutSource).map(key => timeoutSource[key as keyof typeof timeoutSource]),
  ]), 'Timeout Outcome')
  const timeoutPreview = parseScheduleTabularData(XLSX.write(timeoutWorkbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer, 'array', {
    brands: new Map([[brandName, brandId]]), platforms: new Map([[platformName, platformId]]), campaigns: new Map(),
  }, [])
  const timeoutImport = createSupabaseScheduleImportPort(adminClient)
  const timeoutBatch = await timeoutImport.createBatch({
    source: 'google_sheets', sourceName: `Synthetic statement-timeout ${run}`,
    createdBy: 'authenticated-admin', summary: summarizeImportResult(timeoutPreview),
    previewRows: timeoutPreview.rows.map(item => item.row),
  })
  const timeoutBatchRows = await timeoutImport.listBatchRows(timeoutBatch.id)
  const timeoutResult = await processScheduleImportRows({
    batchId: timeoutBatch.id, previews: timeoutPreview.rows, batchRows: timeoutBatchRows,
    initialShifts: [], createShift: async () => { throw Object.assign(new Error('canceling statement due to statement timeout'), { code: '57014' }) },
    refreshShifts: async () => [],
    recordOutcome: input => timeoutImport.recordRowOutcome(timeoutBatch.id, input.rowNumber, input.outcome, {
      expectedOutcome: input.expectedOutcome, shiftId: input.shiftId, failureCode: input.failureCode,
    }),
  })
  assert.equal(timeoutResult.imported, 0)
  assert.equal(timeoutResult.retryable, 1)
  const timeoutOutcome = requireOk(await adminClient.from('schedule_import_batch_rows')
    .select('outcome,failure_code').eq('batch_id', timeoutBatch.id).single(), 'timeout row outcome')
  assert.equal(timeoutOutcome.outcome, 'retryable')
  assert.equal(timeoutOutcome.failure_code, '57014')
  assert.equal((requireOk(await adminClient.from('shifts').select('id').eq('title', timeoutTitle), 'timeout no-parent readback') as unknown[]).length, 0)
  records.push({ run, transaction_faults: ['second segment capacity rollback', 'duplicate segment index rollback'],
    concurrent_confirm: 'one parent, two segments, one import outcome and audit events for one canonical parent',
    timeout_error: '57014 persisted as retryable; imported count remained zero',
    stale_version: 'update_shift rejected stale expected version without changing parent' })

  const reimport = parseSource(sourceRow)
  const retryRows = mapImportResultToBatchRows(`${batchId}-retry`, reimport)
  retryRows.forEach(row => { row.status = 'pending' })
  let retryCreateCalled = false
  const retry = await processScheduleImportRows({
    batchId: `${batchId}-retry`, previews: reimport.rows, batchRows: retryRows, initialShifts: [parent as never],
    createShift: async () => { retryCreateCalled = true; throw new Error('duplicate parent must not be recreated') },
    refreshShifts: async () => [parent as never], recordOutcome: async () => undefined,
  })
  assert.equal(retry.duplicateSkipped, 1)
  assert.equal(retryCreateCalled, false)

  records.push({
    run, shift_id: parent.id, segment_ids: segments.map(segment => segment.id),
    imported_via: 'XLSX Preview -> processScheduleImportRows Confirm -> authenticated create_schedule_import_shift RPC -> authenticated DB readback',
    original_receipt_immutable: true,
    changed_source: {
      A: 'identical source -> duplicate_skipped; same parent and child IDs',
      B: 'planned Host names -> retryable review_required; no assignment created',
      C: 'K02 Host capacity H2 to H3 -> retryable review_required; no staffing mutation',
      D: 'K02 time window change -> retryable review_required; no segment mutation',
      E: 'parent date and external code change -> retryable review_required; no parent mutation',
      F: 'parent start/end and external code change -> retryable review_required; no parent or segment mutation',
      G: 'approved manual assignment present -> review_required; registration and audit preserved',
      H: 'synthetic photo receipt, approved actual and decision present -> review_required; evidence and actuals preserved',
      I: 'locked Payroll period and line present -> review_required; locked records preserved',
      J: 'two concurrent changed-source requests -> both retryable, original import receipt unchanged',
    },
    authorization: roleScopeResults,
    planned_names_created_assignments: false,
    unsupported_changes: 'all changed source requires explicit manual reconciliation; no automatic mutation is currently supported',
    locator_limit: 'history matching uses source + source_name + row_number; renamed source or moved row lacks a stable source-document/row identity and requires separate design before claiming support',
    synthetic_provider_evidence: 'test fixture only; no Google Drive I/O or provider-backed evidence claim',
  })
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
  const [adminAuth, reviewerAuth, leaderAuth, host1Auth, host2Auth, host3Auth, hostOverflowAuth, supportAuth] = await Promise.all([
    signIn(admin), signIn(reviewer), signIn(leader), signIn(host1), signIn(host2), signIn(host3),
    signIn(hostOverflow), signIn(support),
  ])
  adminSession = adminAuth
  await assertInvalidRuntimeTokensRejected(adminAuth.client, adminAuth.token)
  const platformId = `platform_${crypto.randomUUID().replaceAll('-', '').slice(0, 18)}`
  const platformName = `C5.11 Platform ${run}`
  requireOk(await service.from('platforms').insert({ id: platformId, name: platformName, status: 'active' }).select('id').single(), 'seed platform')
  const brandA = await newBrand(`C5.11 Brand A ${run}`)
  const brandB = await newBrand(`C5.11 Brand B ${run}`)
  await confirmKaoIssue184Shift(run, brandA, platformId, adminAuth.client)
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
  const runOffsetMinutes = 90
  const { shift, segments } = await createImportedShift(run, brandA, `C5.11 Brand A ${run}`, platformId, platformName, runOffsetMinutes)
  const foreign = await createImportedShift(run, brandB, `C5.11 Brand B ${run}`, platformId, platformName, runOffsetMinutes)
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
  const cancellationShiftSetup = await createImportedShift(run, brandA, `C5.11 Brand A ${run}`, cancellationPlatformId, cancellationPlatformName, runOffsetMinutes)
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
  const restoreSettings = await prepareC511RegistrationSettings()
  try {
    await runPersistedScenario(Date.now())
    mkdirSync(evidenceDir!, { recursive: true })
    const output = {
      result: 'PASS', source_sha: process.env.C511_SOURCE_SHA,
      postgres: process.env.C511_POSTGRES_VERSION,
      database, isolation: runtimeKind === 'native-wsl'
        ? 'native WSL PostgreSQL 17, user-owned marked DB; Auth/PostgREST loopback only'
        : 'local Docker PostgreSQL 17, dedicated marked DB; Auth/PostgREST loopback only',
      migration_sha256: process.env.C511_MIGRATION_SHA256,
      attendance_review_migration_sha256: process.env.C512_MIGRATION_SHA256,
      c515_migration_sha256: {
        second_precision: process.env.C515_SECONDS_MIGRATION_SHA256,
        approval_hold: process.env.C515_APPROVAL_MIGRATION_SHA256,
        overtime_cancellation: process.env.C515_OT_CANCELLATION_MIGRATION_SHA256,
        live_shift_cancellation: process.env.C515_LIVE_CANCELLATION_MIGRATION_SHA256,
      },
      runtime_auth_users_before: authUsersBefore, storage_objects_before: storageObjectsBefore,
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
  } finally {
    await restoreSettings()
  }
})

test('C6 PG17 Preview/Confirm fault injection is atomic and retryable', async () => {
  const run = Date.now() + 100
  const admin = await seedUser(run, 'C6Admin', 'admin')
  const adminAuth = await signIn(admin)
  const brandId = await newBrand(`C6 PG17 Brand ${run}`)
  const platformId = `platform_c6_${crypto.randomUUID().replaceAll('-', '').slice(0, 18)}`
  requireOk(await service.from('platforms').insert({ id: platformId, name: `C6 PG17 ${run}`, status: 'active' }).select('id').single(), 'C6 fixture platform')
  const settings = await service.from('system_settings').select('id').limit(1)
  assert.ifError(settings.error)
  if (!settings.data?.length) {
    const inserted = await service.from('system_settings').insert({ registration_cutoff_hours: 0, require_registration_approval: true, auto_lock_filled_shifts: false })
    assert.ifError(inserted.error)
  }
  await confirmKaoIssue184Shift(run, brandId, platformId, adminAuth.client)
  mkdirSync(evidenceDir!, { recursive: true })
  const path = join(evidenceDir!, `c6-import-transaction-${run}.json`)
  writeFileSync(path, JSON.stringify({
    result: 'PASS', source_sha: process.env.C511_SOURCE_SHA, worktree_dirty: process.env.C511_WORKTREE_DIRTY === 'true',
    c6_migration_sha256: process.env.C6_MIGRATION_SHA256, postgres: process.env.C511_POSTGRES_VERSION,
    database, marker: 'CODEX_DISPOSABLE_RC19_C5_11_E2E_ONLY',
    authenticated_actor: 'synthetic Admin',
    reimport_identity_contract: 'source + source_name + row_number receipt history; business-code changes within that locator are detected and never create a new parent',
    reimport_supported_mutation: 'none; all changed source returns retryable IMPORT_SOURCE_CHANGED_REVIEW_REQUIRED',
    scenario_results: records.find(record => 'changed_source' in record)?.changed_source,
    authorization_results: records.find(record => 'authorization' in record)?.authorization,
    fault_injection: ['second-segment capacity rollback', 'duplicate segment index rollback', 'stale expected version denied'],
    concurrent_confirm: 'one parent, two segments, persisted idempotent row outcome, audit history linked to canonical parent',
    timeout_response: 'PostgreSQL SQLSTATE 57014 recorded retryable; imported count remained zero (injected RPC error contract)',
    production_accessed: false,
  }, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' })
  console.log(`C6_PG17_EVIDENCE=${path}`)
})
