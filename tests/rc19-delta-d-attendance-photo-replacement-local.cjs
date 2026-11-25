/* eslint-disable @typescript-eslint/no-require-imports -- isolated authenticated acceptance harness */
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { Client: PgClient } = require('pg')
const { chromium } = require('playwright')

const runtimePath = process.env.D1_RUNTIME_CONFIG
if (!runtimePath) throw new Error('D1_RUNTIME_CONFIG_REQUIRED')
const runtimeConfig = JSON.parse(fs.readFileSync(runtimePath, 'utf8'))
const expectedDatabase = process.env.D1_EXPECTED_DATABASE
const expectedMarker = process.env.D1_EXPECTED_MARKER
const expectedHead = process.env.D1_EXPECTED_HEAD
const expectedTree = process.env.D1_EXPECTED_TREE
if (!expectedDatabase || !expectedMarker || !expectedHead || !expectedTree)
  throw new Error('D1_EXPECTED_IDENTITY_REQUIRED')
const databaseUrl = new URL(process.env.D1_DATABASE_URL
  || `postgresql://postgres@127.0.0.1:${runtimeConfig.postgres_port}/${runtimeConfig.database}`)
if (!['127.0.0.1', '::1', 'localhost'].includes(databaseUrl.hostname))
  throw new Error('D1_DATABASE_MUST_BE_LOOPBACK')
const connectionString = databaseUrl.toString()
const appOrigin = process.env.D1_APP_ORIGIN || `http://127.0.0.1:${runtimeConfig.app_port}`
const authPort = Number(process.env.D1_AUTH_PORT || runtimeConfig.auth_port)
const restPort = Number(process.env.D1_REST_PORT || runtimeConfig.rest_port)
const apiProxyPort = Number(process.env.D1_PROXY_PORT || runtimeConfig.proxy_port)
const testPassword = crypto.randomBytes(32).toString('base64url')

function issueLocalRoleToken(jwtSecret, role) {
  const encode = value => Buffer.from(JSON.stringify(value)).toString('base64url')
  const header = encode({ alg: 'HS256', typ: 'JWT' })
  const now = Math.floor(Date.now() / 1000)
  const payload = encode({ iss: 'supabase', role, iat: now, exp: now + 1800 })
  const signature = crypto.createHmac('sha256', jwtSecret).update(`${header}.${payload}`).digest('base64url')
  return `${header}.${payload}.${signature}`
}

function routeFetch(input, init) {
  const request = input instanceof Request ? new Request(input, init) : new Request(input, init)
  const target = new URL(request.url)
  if (target.pathname.startsWith('/rest/v1/')) {
    target.pathname = target.pathname.slice('/rest/v1'.length)
    target.port = String(restPort)
  } else if (target.pathname.startsWith('/auth/v1/')) {
    target.pathname = target.pathname.slice('/auth/v1'.length)
    target.port = String(authPort)
  } else {
    throw new Error(`D1_TEST_UNEXPECTED_SUPABASE_PATH:${target.pathname}`)
  }
  target.hostname = '127.0.0.1'
  return fetch(new Request(target, request))
}

function requireData(result, operation) {
  if (result.error) throw new Error(`${operation}:${result.error.code ?? ''}:${result.error.message ?? ''}`)
  assert.notEqual(result.data, null, `${operation}: missing data`)
  return result.data
}

async function main() {
  const cfg = runtimeConfig
  assert.equal(cfg.database, expectedDatabase)
  assert.equal(cfg.database_marker, expectedMarker)
  assert.equal(Number(cfg.postgres_port), Number(databaseUrl.port))
  assert.equal(Number(cfg.auth_port), authPort)
  assert.equal(Number(cfg.rest_port), restPort)
  assert.equal(Number(cfg.proxy_port), apiProxyPort)
  assert.equal(cfg.loopback_only, true)
  assert.ok(cfg.jwt_secret && cfg.anon_key && cfg.service_role_key)
  assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), expectedHead)
  assert.equal(execFileSync('git', ['rev-parse', 'HEAD^{tree}'], { encoding: 'utf8' }).trim(), expectedTree)
  const appHealth = await fetch(`${appOrigin}/login`, { redirect: 'manual' })
  assert.ok(appHealth.status === 200 || appHealth.status === 307 || appHealth.status === 308,
    `D1 app is not serving at ${appOrigin}: HTTP ${appHealth.status}`)

  const identityDb = new PgClient({ connectionString })
  await identityDb.connect()
  const identity = await identityDb.query("select current_database() db, current_setting('server_version_num') ver, host(inet_server_addr()) host, inet_server_port() port, shobj_description(oid,'pg_database') marker from pg_database where datname=current_database()")
  assert.deepEqual(identity.rows[0], {
    db: expectedDatabase, ver: process.env.D1_EXPECTED_PG_VERSION_NUM || '170011',
    host: databaseUrl.hostname === 'localhost' ? '127.0.0.1' : databaseUrl.hostname,
    port: Number(databaseUrl.port), marker: expectedMarker,
  })
  const d1Objects = await identityDb.query("select to_regprocedure('public.get_self_attendance_assignment_context(text,text,text,text)') is_assignment_preflight, to_regprocedure('public.self_attendance_record_assignment(text,text,text,uuid,text)') is_assignment_writer")
  assert.ok(d1Objects.rows[0].is_assignment_preflight)
  assert.ok(d1Objects.rows[0].is_assignment_writer)
  await identityDb.end()

  process.env.FEATURE_SELF_ATTENDANCE_PHOTO = 'true'
  process.env.FILE_STORAGE_ENABLED = 'true'
  process.env.FEATURE_RBAC_DYNAMIC_ENFORCEMENT = 'false'

  const { createClient } = require('@supabase/supabase-js')
  // Runtime files may retain expired local API keys. Refresh only technical anon/service tokens
  // from this loopback disposable runtime; browser actor sessions still come from real GoTrue login.
  const anonKey = issueLocalRoleToken(cfg.jwt_secret, 'anon')
  const serviceKey = issueLocalRoleToken(cfg.jwt_secret, 'service_role')
  const clientOptions = { global: { fetch: routeFetch }, auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false } }
  const service = createClient(`http://127.0.0.1:${apiProxyPort}`, serviceKey, clientOptions)
  const auth = createClient(`http://127.0.0.1:${apiProxyPort}`, anonKey, clientOptions)
  // Before fixture writes, bind REST and GoTrue to the already verified PG database.
  const identityCheck = new PgClient({ connectionString })
  await identityCheck.connect()
  const baseline = await identityCheck.query("select r.actor_business_user_id,r.shift_id,s.brand_id,s.platform_id from public.rc19_shift_assignment_replacements r join public.shifts s on s.id=r.shift_id where r.shift_id like 'd1-canonical-%' order by r.created_at desc limit 1")
  await identityCheck.end()
  assert.equal(baseline.rowCount, 1, 'expected a retained canonical D1 authorization context')
  const baselineShiftRest = requireData(await service.from('shifts').select('id,brand_id,platform_id').eq('id',baseline.rows[0].shift_id).single(), 'bind PostgREST shift')
  assert.equal(baselineShiftRest.id, baseline.rows[0].shift_id)
  assert.equal(baselineShiftRest.brand_id, baseline.rows[0].brand_id)
  assert.equal(baselineShiftRest.platform_id, baseline.rows[0].platform_id)
  const accounts = new Map()
  const runId = process.env.D1_FIXTURE_RUN_ID || crypto.randomUUID().replaceAll('-', '').slice(0, 12)
  assert.match(runId, /^[A-Za-z0-9_-]{8,64}$/u)
  const syntheticRoot = fs.mkdtempSync(path.join(os.tmpdir(), `rc19-w4-d1-photo-${runId}-`))
  fs.chmodSync(syntheticRoot, 0o700)
  const evidenceDir = path.join(process.cwd(), 'test_reports', `rc19-d1-attendance-${runId}`)
  fs.mkdirSync(evidenceDir, { recursive: true })

  async function seedActor(label, permission, roles = []) {
    const authUserId = crypto.randomUUID()
    const businessId = `d1_${label}_${runId}`
    const email = `${businessId}@c511.invalid`
    const created = await service.auth.admin.createUser({
      id: authUserId, email, password: testPassword, email_confirm: true,
      app_metadata: { system_permission: permission, business_user_id: businessId },
      user_metadata: { full_name: `RC19 D1 ${label} ${runId}` },
    })
    if (created.error) throw new Error(`seed_auth_user:${created.error.code ?? ''}`)
    const inserted = await service.from('business_users').insert({
      id: businessId, auth_user_id: authUserId, email, full_name: `RC19 D1 ${label} ${runId}`,
      role: permission === 'member' ? 'staff' : permission, system_permission: permission,
      operational_roles: roles, status: 'active', account_status: 'active',
      email_verified: true, auth_provider: 'email',
    }).select('id,auth_user_id,role,system_permission,operational_roles,status,account_status,email_verified,auth_provider').single()
    if (inserted.error) throw new Error(`seed_business_actor:${inserted.error.code ?? ''}`)
    return { authUserId, businessId, email, permission, roles }
  }

  async function signIn(actor) {
    const client = createClient(`http://127.0.0.1:${apiProxyPort}`, anonKey, clientOptions)
    const result = await client.auth.signInWithPassword({ email: actor.email, password: testPassword })
    if (result.error || !result.data.session?.access_token) throw new Error(`gotrue_signin_failed:${result.error?.code ?? ''}`)
    const token = result.data.session.access_token
    const verified = await client.auth.getUser(token)
    if (verified.error || verified.data.user?.id !== actor.authUserId) throw new Error('gotrue_session_identity_mismatch')
    accounts.set(token, { actor, client })
    return { actor, client, token }
  }

  async function resolveUser(request) {
    const token = request.headers.get('authorization')?.replace(/^Bearer\s+/iu, '')
    const session = token ? accounts.get(token) : null
    if (!session) return null
    const verified = await auth.auth.getUser(token)
    if (verified.error || verified.data.user?.id !== session.actor.authUserId) return null
    const business = await service.from('business_users').select('id,auth_user_id,email,role,system_permission,status,account_status,archived_at,deleted_at')
      .eq('id', session.actor.businessId).maybeSingle()
    if (business.error || business.data?.auth_user_id !== session.actor.authUserId || business.data?.status !== 'active' || business.data?.account_status !== 'active') return null
    return { id: session.actor.authUserId, email: session.actor.email, systemPermission: session.actor.permission, businessUserId: session.actor.businessId }
  }

  function scopeClient(request) {
    const token = request.headers.get('authorization')?.replace(/^Bearer\s+/iu, '')
    const session = token ? accounts.get(token) : null
    if (!session) throw new Error('D1_AUTHENTICATED_SESSION_MISSING')
    return session.client
  }

  const photoFiles = new Map()
  const { createSelfAttendancePhotoGetHandler, createSelfAttendancePhotoPostHandler } = await import('../lib/server/selfAttendancePhotoHandler.ts')
  const { requirePermission } = await import('../lib/server/authGuards.ts')
  const photoDeps = {
    authorize: request => requirePermission(request, 'attendance.record_own', resolveUser, async requestArg => scopeClient(requestArg)),
    createAdmin: () => service,
    createSession: async request => scopeClient(request),
    createDrive: root => {
      const parent = photoFiles.get(root)
      if (!parent) throw new Error('D1_SYNTHETIC_PARENT_NOT_FOUND')
      return { root, drive: {
        read: async fileId => {
          const file = photoFiles.get(fileId)
          if (!file) throw new Error('D1_SYNTHETIC_FILE_NOT_FOUND')
          return new Uint8Array(fs.readFileSync(file.path))
        },
        getMetadata: async fileId => {
          const file = photoFiles.get(fileId)
          if (!file) throw new Error('D1_SYNTHETIC_FILE_NOT_FOUND')
          const bytes = fs.readFileSync(file.path)
          return { id: fileId, name: file.name, size_bytes: bytes.length, parent_ids: [file.parentId] }
        },
        delete: async fileId => { const file = photoFiles.get(fileId); if (file) fs.rmSync(file.path, { force: true }); photoFiles.delete(fileId) },
      } }
    },
    prepareDestination: async (_client, input) => {
      const parentId = `d1-local-parent-${runId}-${input.eventKind}-${crypto.randomUUID()}`
      const parentPath = path.join(syntheticRoot, parentId)
      fs.mkdirSync(parentPath, { mode: 0o700 })
      photoFiles.set(parentId, { path: parentPath, name: parentId, parentId })
      const drive = photoDeps.createDrive(parentId).drive
      const storage = { upload: async asset => {
        assert.equal(asset.external_parent_id, parentId)
        assert.equal(asset.size_bytes, asset.content.byteLength)
        const fileId = `d1-local-file-${crypto.randomUUID()}`
        const filePath = path.join(parentPath, fileId)
        fs.writeFileSync(filePath, Buffer.from(asset.content), { flag: 'wx', mode: 0o600 })
        const bytes = fs.readFileSync(filePath)
        assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), asset.checksum_sha256)
        photoFiles.set(fileId, { path: filePath, name: asset.name, parentId })
        return { asset: { provider: 'google_drive', external_file_id: fileId, external_parent_id: parentId,
          name: asset.name, mime_type: asset.mime_type, size_bytes: bytes.length } }
      } }
      return { drive, storage, parentId, folderPath: `d1-local/${input.shiftId}/${input.eventKind}/${input.role}` }
    },
  }
  const photoPost = createSelfAttendancePhotoPostHandler(photoDeps)
  const photoGet = createSelfAttendancePhotoGetHandler(photoDeps)

  async function submitPhoto(session, shiftId, assignmentId, eventKind, colors) {
    const sharp = require('sharp')
    const bytes = await sharp({ create: { width: 12, height: 12, channels: 3, background: colors } }).jpeg().toBuffer()
    const form = new FormData()
    form.set('shift_id', shiftId); form.set('assignment_id', assignmentId); form.set('role', 'host')
    const requestId = crypto.randomUUID()
    form.set('event_kind', eventKind); form.set('request_id', requestId)
    form.set('capture_source', eventKind === 'check_in' ? 'camera' : 'file_picker')
    form.set('file', new File([bytes], `${eventKind}.jpg`, { type: 'image/jpeg' }))
    const response = await photoPost(new Request(`${appOrigin}/api/workforce/self-attendance-photo`, {
      method: 'POST', headers: { Origin: appOrigin, Authorization: `Bearer ${session.token}` }, body: form,
    }))
    const body = await response.json()
    assert.equal(response.status, 200, `photo ${eventKind}: ${body.error?.code ?? 'unknown'}`)
    assert.equal(body.event.assignment_id, assignmentId)
    const receipt = requireData(await service.from('self_attendance_photo_evidence')
      .select('request_id,shift_id,staff_id,operational_role,event_kind,assignment_id,provider,external_file_id,external_parent_id,file_name,mime_type,size_bytes,checksum_sha256')
      .eq('request_id', requestId).single(), `read ${eventKind} evidence`)
    assert.equal(receipt.shift_id, shiftId); assert.equal(receipt.staff_id, session.actor.businessId)
    assert.equal(receipt.assignment_id, assignmentId); assert.equal(receipt.event_kind, eventKind)
    assert.equal(receipt.provider, 'google_drive') // DB contract; provider is explicitly synthetic in the evidence artifact.
    const raw = fs.readFileSync(photoFiles.get(receipt.external_file_id).path)
    assert.equal(raw.length, receipt.size_bytes)
    assert.equal(crypto.createHash('sha256').update(raw).digest('hex'), receipt.checksum_sha256)
    const download = await photoGet(new Request(`${appOrigin}/api/workforce/self-attendance-photo?event_id=${body.event.event_id}`, {
      headers: { Authorization: `Bearer ${session.token}` },
    }))
    assert.equal(download.status, 200)
    const readback = Buffer.from(await download.arrayBuffer())
    assert.equal(crypto.createHash('sha256').update(readback).digest('hex'), receipt.checksum_sha256)
    return { event: body.event, receipt, inputBytes: bytes.length, inputSha256: crypto.createHash('sha256').update(bytes).digest('hex') }
  }

  let browser
  try {
    const seedDb = new PgClient({ connectionString })
    await seedDb.connect()
    const seed = (await seedDb.query("select actor_business_user_id,old_user_id,replacement_user_id,shift_id from public.rc19_shift_assignment_replacements where shift_id like 'd1-canonical-%' order by created_at desc limit 1")).rows[0]
    const templateActor = (await seedDb.query('select operational_roles from public.business_users where id=$1', [seed.old_user_id])).rows[0]
    await seedDb.end()
    assert.ok(seed)
    assert.ok(templateActor)
    const context = requireData(await service.from('shifts').select('brand_id,platform_id').eq('id',seed.shift_id).single(), 'read existing local Brand/platform fixture')
    assert.ok(templateActor.operational_roles.includes('host'))

    const adminActor = await seedActor('Admin', 'admin')
    const staffA = await seedActor('HostA', 'member', ['host'])
    const staffB = await seedActor('HostB', 'member', ['host'])
    const foreignStaff = await seedActor('ForeignMember', 'member', ['host'])
    const admin = await signIn(adminActor)
    const actorA = await signIn(staffA)
    const actorB = await signIn(staffB)
    const foreign = await signIn(foreignStaff)

    const db = new PgClient({ connectionString })
    await db.connect()
    const dbNow = (await db.query('select statement_timestamp() as now')).rows[0].now
    const k02Start = new Date(dbNow.getTime() - 150 * 60_000)
    const k02End = new Date(dbNow.getTime() + 150 * 60_000)
    const parentStart = new Date(k02Start.getTime() - 30 * 60_000)
    const parentEnd = new Date(k02End.getTime() + 30 * 60_000)
    await db.end()
    const localParts = value => Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }).formatToParts(value).map(part => [part.type, part.value]))
    const dateText = p => `${p.year}-${p.month}-${p.day}`
    const timeText = p => `${p.hour}:${p.minute}:${p.second}`
    const parentStartLocal = localParts(parentStart), parentEndLocal = localParts(parentEnd)
    const crossesMidnight = dateText(parentStartLocal) !== dateText(parentEndLocal)
    const shiftId = `d1_partial_attendance_${runId}`
    const shiftRow = requireData(await service.from('shifts').insert({
      id: shiftId, date: dateText(parentStartLocal), start_time: timeText(parentStartLocal), end_time: timeText(parentEndLocal),
      timezone: 'Asia/Ho_Chi_Minh', start_at: parentStart.toISOString(), end_at: parentEnd.toISOString(),
      end_date: dateText(parentEndLocal), crosses_midnight: crossesMidnight, duration_minutes: 360,
      brand_id: context.brand_id, platform_id: context.platform_id, title: `D1 attendance replacement ${runId}`,
      required_host_count: 1, required_support_count: 0, required_technical_count: 0,
      registration_cutoff_at: new Date(parentStart.getTime() - 60 * 60_000).toISOString(),
      allow_multi_role: false, status: 'scheduled', status_mode: 'manual', execution_source: 'internal',
      updated_by: adminActor.businessId,
    }).select('id,version,status,start_at,end_at,date').single(), 'create synthetic parent shift')
    assert.equal(shiftRow.status, 'scheduled')

    const segmentRows = [
      { id: `d1-k01-${runId}`, segment_index: 1, start_at: parentStart, end_at: k02Start },
      { id: `d1-k02-${runId}`, segment_index: 2, start_at: k02Start, end_at: k02End },
      { id: `d1-k03-${runId}`, segment_index: 3, start_at: k02End, end_at: parentEnd },
    ].map(segment => ({
      id: segment.id, shift_id: shiftId, segment_index: segment.segment_index,
      start_at: segment.start_at.toISOString(), end_at: segment.end_at.toISOString(),
      required_host_count: 1, required_support_count: 0, required_technical_count: 0,
      created_by: adminActor.businessId,
    }))
    requireData(await service.from('shift_staffing_segments').insert(segmentRows).select('id'), 'create three staffing segments')
    const k02 = segmentRows[1]
    const initialAssignment = requireData(await admin.client.rpc('manual_assign_shift_staff_to_segment', {
      p_shift_id: shiftId, p_user_id: staffA.businessId, p_role: 'host', p_notes: 'Synthetic D1 K02 original Host A',
      p_expected_version: shiftRow.version, p_staffing_segment_id: k02.id,
    }), 'manual assign Host A to K02')
    const afterAssignShift = requireData(await service.from('shifts').select('version,status').eq('id', shiftId).single(), 'read shift version after assignment')
    const originalAssignment = initialAssignment

    const checkInA = await submitPhoto(actorA, shiftId, originalAssignment.id, 'check_in', '#b84a32')
    const checkOutA = await submitPhoto(actorA, shiftId, originalAssignment.id, 'check_out', '#315ab8')
    assert.notEqual(checkInA.receipt.external_file_id, checkOutA.receipt.external_file_id)
    assert.notEqual(checkInA.receipt.checksum_sha256, checkOutA.receipt.checksum_sha256)

    const dbBeforeReplace = new PgClient({ connectionString })
    await dbBeforeReplace.connect()
    const otherSegmentsBefore = await dbBeforeReplace.query('select id,start_at,end_at,required_host_count from public.shift_staffing_segments where shift_id=$1 and id<>$2 order by segment_index', [shiftId, k02.id])
    await dbBeforeReplace.end()
    assert.equal(otherSegmentsBefore.rowCount, 2)

    browser = await chromium.launch({ headless: true })
    const contextBrowser = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    const page = await contextBrowser.newPage()
    await page.goto(`${appOrigin}/login`)
    await page.getByTestId('email-input').fill(adminActor.email)
    await page.getByTestId('password-input').fill(testPassword)
    await page.getByRole('button', { name: 'Đăng nhập' }).click()
    await page.waitForURL(url => url.pathname !== '/login', { timeout: 45000 })
    await page.screenshot({ path: path.join(evidenceDir, 'authenticated-admin-before-replacement.png'), fullPage: true })
    const body = {
      shiftId, staffingSegmentId: k02.id, registrationId: originalAssignment.id,
      replacementUserId: staffB.businessId, role: 'host', expectedShiftVersion: afterAssignShift.version,
      expectedRegistrationVersion: originalAssignment.version, effectiveAt: new Date().toISOString(),
      reason: 'Synthetic D1 K02 partial replacement after Host A evidence', isEmergency: false,
      idempotencyKey: crypto.randomUUID(), incidentType: 'planned_reassignment', evidenceReferenceId: null,
    }
    const replacementResponse = await page.evaluate(async payload => {
      const response = await fetch('/api/staffing/replacements/incident-v1', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      })
      return { status: response.status, body: await response.json() }
    }, body)
    const replacementBody = replacementResponse.body
    assert.equal(replacementResponse.status, 200, `replacement HTTP ${replacementResponse.status} ${replacementBody.error?.code ?? ''}`)
    assert.equal(replacementBody.readbackRequired, true)
    assert.equal(replacementBody.data.replayed, false)
    assert.equal(replacementBody.data.canonicalIncident.originalRegistrationId, originalAssignment.id)
    assert.equal(replacementBody.data.canonicalIncident.replacementStaffId, staffB.businessId)
    await page.screenshot({ path: path.join(evidenceDir, 'authenticated-admin-replacement-api-success.png'), fullPage: true })

    const replacement = replacementBody.data
    const checkInB = await submitPhoto(actorB, shiftId, replacement.registration.id, 'check_in', '#68904a')
    const checkOutB = await submitPhoto(actorB, shiftId, replacement.registration.id, 'check_out', '#8746a1')
    assert.notEqual(checkInB.receipt.external_file_id, checkOutB.receipt.external_file_id)

    const denied = await submitPhoto(foreign, shiftId, replacement.registration.id, 'check_in', '#212121').then(
      item => ({ allowed: true, item }),
      error => ({ allowed: false, error }),
    )
    assert.equal(denied.allowed, false, 'unassigned member must not upload for another assignment')

    const freshA = await signIn(staffA)
    const freshB = await signIn(staffB)
    const aHistory = requireData(await freshA.client.rpc('get_my_self_attendance', { p_shift_id: shiftId, p_limit: 10 }), 'fresh A attendance session')
    const bHistory = requireData(await freshB.client.rpc('get_my_self_attendance', { p_shift_id: shiftId, p_limit: 10 }), 'fresh B attendance session')
    assert.equal(aHistory.length, 2)
    assert.equal(bHistory.length, 2)
    assert.ok(aHistory.every(row => row.assignment_id === originalAssignment.id))
    assert.ok(bHistory.every(row => row.assignment_id === replacement.registration.id))

    const dbReadback = new PgClient({ connectionString })
    await dbReadback.connect()
    const rows = await dbReadback.query("select e.id event_id,e.event_kind,e.staff_id,e.assignment_id,e.request_id,p.external_file_id,p.external_parent_id,p.size_bytes,p.checksum_sha256,p.assignment_id photo_assignment,p.event_kind photo_event,p.staff_id photo_staff from public.self_attendance_events e join public.self_attendance_photo_evidence p on p.request_id=e.request_id where e.shift_id=$1 order by e.recorded_at,e.id", [shiftId])
    assert.equal(rows.rowCount, 4)
    assert.ok(rows.rows.every(row => row.assignment_id === row.photo_assignment && row.event_kind === row.photo_event && row.staff_id === row.photo_staff))
    assert.equal(rows.rows.filter(row => row.assignment_id === originalAssignment.id).length, 2)
    assert.equal(rows.rows.filter(row => row.assignment_id === replacement.registration.id).length, 2)
    const assignments = await dbReadback.query("select id,user_id,status,staffing_segment_id,operational_role from public.shift_registrations where id=any($1::text[]) order by id", [[originalAssignment.id, replacement.registration.id]])
    assert.equal(assignments.rowCount, 2)
    const unchangedSegments = await dbReadback.query('select id,start_at,end_at,required_host_count from public.shift_staffing_segments where shift_id=$1 and id<>$2 order by segment_index', [shiftId, k02.id])
    assert.deepEqual(unchangedSegments.rows.map(row => ({...row,start_at:row.start_at.toISOString(),end_at:row.end_at.toISOString()})), otherSegmentsBefore.rows.map(row => ({...row,start_at:row.start_at.toISOString(),end_at:row.end_at.toISOString()})))
    await dbReadback.end()

    const artifact = {
      evidence_type: 'synthetic_local_attendance_provider_acceptance',
      external_google_drive_acceptance: 'NOT_TESTED',
      source_head: expectedHead,
      source_tree: expectedTree,
      fixture_run_id: runId,
      runtime: { database: expectedDatabase, postgres: identity.rows[0].ver, database_marker: expectedMarker, app: appOrigin, auth_port: authPort, rest_port: restPort, api_proxy_port: apiProxyPort, loopback_only: true },
      synthetic_provider: { adapter: 'filesystem-backed Drive-compatible test dependency', root: syntheticRoot, bytes_are_written_and_read_back: true, acl_scope: 'preflight requires exact GoTrue actor and assignment; storage IDs are private to this test root' },
      shift_id: shiftId, k02_segment_id: k02.id,
      assignment_ids: { original_a: originalAssignment.id, replacement_b: replacement.registration.id },
      replacement: { http_status: replacementResponse.status, receipt_id: replacementBody.data.receiptId, canonical_incident_id: replacementBody.data.canonicalIncident.id, readback_required: replacementResponse.readbackRequired },
      attendance: rows.rows.map(row => ({ event_id: row.event_id, event_kind: row.event_kind, staff_id: row.staff_id, assignment_id: row.assignment_id, request_id: row.request_id, external_file_id: row.external_file_id, external_parent_id: row.external_parent_id, size_bytes: row.size_bytes, checksum_sha256: row.checksum_sha256 })),
      assertions: { assignment_specific_checkin_checkout_a_b: 'PASS', bytes_and_sha256_readback: 'PASS', metadata_parent_assignment_type_actor: 'PASS', unauthorized_foreign_member_upload: 'DENY', fresh_session_owner_history: 'PASS', other_segments_unchanged: 'PASS', actual_work_approval_payroll: 'NOT_RUN' },
    }
    fs.writeFileSync(path.join(evidenceDir, 'attendance-replacement-readback.json'), `${JSON.stringify(artifact, null, 2)}\n`, { flag: 'wx', mode: 0o600 })
    console.log(`D1_ATTENDANCE_PHOTO_PASS shift=${shiftId} k02=${k02.id} a_assignment=${originalAssignment.id} b_assignment=${replacement.registration.id} events=4 photos=4 http=${replacementResponse.status} artifact=${path.join(evidenceDir, 'attendance-replacement-readback.json')}`)
    await contextBrowser.close()
  } finally {
    if (browser) await browser.close()
    await service.auth.admin.signOut?.().catch?.(() => {})
  }
}

main().catch(error => {
  console.error(`D1_ATTENDANCE_PHOTO_FAIL ${error.code ?? ''} ${error.message}`)
  process.exitCode = 1
})
