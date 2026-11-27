import { randomBytes, randomUUID } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { createClient } from '@supabase/supabase-js'

const schema = 'rc19-w4-application-acceptance/v2'
const root = process.cwd()

function stop(code) {
  throw new Error(code)
}

function required(name) {
  const value = process.env[name]?.trim()
  if (!value) stop(`REQUIRED_ENV_MISSING_${name}`)
  return value
}

function parseLoopbackUrl(value, expectedPort, code) {
  let url
  try {
    url = new URL(value)
  } catch {
    stop(code)
  }
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '::1'].includes(url.hostname)
    || url.port !== String(expectedPort) || url.username || url.password
    || url.search || url.hash || (url.pathname !== '/' && url.pathname !== '')) {
    stop(code)
  }
  return url.origin
}

function candidateSha() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim()
  } catch {
    stop('APPLICATION_GIT_SHA_UNAVAILABLE')
  }
}

function expectedSha() {
  const explicit = process.env.RC19_W4_EXPECTED_APPLICATION_SHA?.trim()
  if (explicit) return explicit
  const runnerTemp = process.env.RUNNER_TEMP?.trim()
  if (!runnerTemp) stop('APPLICATION_SHA_ATTESTATION_REQUIRED')
  const artifact = join(runnerTemp, 'rc19-w4-app-artifact', 'acceptance.json')
  if (!existsSync(artifact)) stop('APPLICATION_SHA_ATTESTATION_MISSING')
  let manifest
  try {
    manifest = JSON.parse(readFileSync(artifact, 'utf8'))
  } catch {
    stop('APPLICATION_SHA_ATTESTATION_INVALID')
  }
  if (manifest?.scope !== 'application-acceptance' || manifest?.deployment !== false
    || manifest?.steps?.runtime?.status !== 'passed'
    || manifest?.steps?.migrations?.status !== 'passed'
    || typeof manifest.application_sha !== 'string') {
    stop('APPLICATION_SHA_ATTESTATION_INVALID')
  }
  return manifest.application_sha
}

function validateSha(value) {
  if (!/^[0-9a-f]{40}$/u.test(value)) stop('APPLICATION_SHA_INVALID')
  return value
}

function assertNoRemoteLink() {
  const linkedProject = resolve(root, 'supabase', '.temp', 'project-ref')
  if (existsSync(linkedProject)) stop('REMOTE_SUPABASE_LINK_PRESENT')
  for (const name of ['SUPABASE_ACCESS_TOKEN', 'SUPABASE_DB_URL', 'SUPABASE_PROJECT_REF']) {
    if (process.env[name]?.trim()) stop('REMOTE_SUPABASE_ENV_PRESENT')
  }
}

function safeClient(url, key) {
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  })
}

async function requireNoError(result, code) {
  if (result.error) stop(code)
  return result.data
}

async function createActor(service, url, anonKey, role, email, password, suffix) {
  const authResult = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { system_permission: role, business_user_id: '' },
    user_metadata: { full_name: `RC19 synthetic ${suffix}` },
  })
  const created = await requireNoError(authResult, `AUTH_FIXTURE_CREATE_FAILED_${suffix.toUpperCase()}`)
  if (!created?.user?.id) stop(`AUTH_FIXTURE_CREATE_FAILED_${suffix.toUpperCase()}`)
  const authId = created.user.id
  const metadata = await service.auth.admin.updateUserById(authId, {
    app_metadata: { system_permission: role, business_user_id: authId },
  })
  await requireNoError(metadata, `AUTH_FIXTURE_METADATA_FAILED_${suffix.toUpperCase()}`)

  const businessUser = {
    id: authId,
    auth_user_id: authId,
    email,
    full_name: `RC19 synthetic ${suffix}`,
    role: role === 'member' ? 'staff' : role,
    system_permission: role,
    operational_roles: role === 'member' ? ['host', 'support'] : ['host', 'support', 'technical'],
    status: 'active',
    account_status: 'active',
    email_verified: true,
    auth_provider: 'email',
    join_date: '2099-01-01',
  }
  const inserted = await service.from('business_users').insert(businessUser)
  await requireNoError(inserted, `BUSINESS_USER_FIXTURE_CREATE_FAILED_${suffix.toUpperCase()}`)

  const client = safeClient(url, anonKey)
  const signedIn = await client.auth.signInWithPassword({ email, password })
  if (signedIn.error || !signedIn.data.session) stop(`AUTH_FIXTURE_LOGIN_FAILED_${suffix.toUpperCase()}`)
  const userResult = await client.auth.getUser()
  if (userResult.error || !userResult.data.user
    || userResult.data.user.id !== authId
    || userResult.data.user.app_metadata?.system_permission !== role
    || userResult.data.user.app_metadata?.business_user_id !== authId) {
    stop(`AUTH_FIXTURE_IDENTITY_FAILED_${suffix.toUpperCase()}`)
  }
  const mapping = await service.from('business_users')
    .select('id,auth_user_id,email,system_permission,status,account_status,deleted_at,archived_at')
    .eq('id', authId)
    .maybeSingle()
  const row = await requireNoError(mapping, `BUSINESS_USER_MAPPING_READ_FAILED_${suffix.toUpperCase()}`)
  if (!row || row.id !== authId || row.auth_user_id !== authId || row.email !== email
    || row.system_permission !== role || row.status !== 'active' || row.account_status !== 'active'
    || row.deleted_at !== null || row.archived_at !== null) {
    stop(`BUSINESS_USER_MAPPING_MISMATCH_${suffix.toUpperCase()}`)
  }
  return { id: authId, client }
}

function segment(segmentIndex, startTime, endTime, operationalRole) {
  return {
    segment_index: segmentIndex,
    start_time: startTime,
    end_time: endTime,
    required_host_count: operationalRole === 'host' ? 1 : 0,
    required_support_count: operationalRole === 'support' ? 1 : 0,
    required_technical_count: 0,
    planned_host_names: [],
    planned_support_names: [],
    planned_technical_names: [],
  }
}

async function createShift(admin, service, brandId, platformId, title, date, segmentRows) {
  const result = await admin.rpc('create_shift_with_staffing_segments', {
    p_data: {
      date,
      start_time: '10:00',
      end_time: '14:00',
      timezone: 'Asia/Ho_Chi_Minh',
      brand_id: brandId,
      platform_id: platformId,
      title,
      required_host_count: 1,
      required_support_count: 1,
      required_technical_count: 0,
      status: 'scheduled',
    },
    p_segments: segmentRows,
  }).single()
  const row = await requireNoError(result, 'SHIFT_FIXTURE_CREATE_FAILED')
  if (!row?.id) stop('SHIFT_FIXTURE_CREATE_FAILED')
  const persisted = await service.from('shifts').select('id,brand_id,status')
    .eq('id', row.id).maybeSingle()
  const stored = await requireNoError(persisted, 'SHIFT_FIXTURE_READBACK_FAILED')
  if (!stored || stored.id !== row.id || stored.brand_id !== brandId || stored.status !== 'scheduled') {
    stop('SHIFT_FIXTURE_READBACK_MISMATCH')
  }
  return row.id
}

async function main() {
  if (process.env.RC19_W4_RUN_BROWSER_UAT?.trim().toLowerCase() === 'true') {
    stop('BROWSER_UAT_REQUIRES_SEPARATE_REVIEWED_APP_RUNTIME')
  }

  const sha = validateSha(candidateSha())
  if (sha !== validateSha(expectedSha())) stop('APPLICATION_SHA_MISMATCH')
  assertNoRemoteLink()

  const url = parseLoopbackUrl(required('RC19_W4_RUNTIME_URL'), 55421, 'RUNTIME_URL_NOT_DISPOSABLE_LOOPBACK')
  const databaseUrl = new URL(required('RC19_W4_RUNTIME_DATABASE_URL'))
  if (!['127.0.0.1', 'localhost', '::1'].includes(databaseUrl.hostname)
    || databaseUrl.port !== '55432' || databaseUrl.pathname !== '/postgres'
    || databaseUrl.username !== 'postgres' || !databaseUrl.password) {
    stop('DATABASE_URL_NOT_DISPOSABLE_LOOPBACK')
  }
  const marker = required('RC19_W4_RUNTIME_DATABASE_MARKER')
  if (!/^RC19_W4_APPLICATION_[0-9]+_[0-9]+$/u.test(marker)) stop('DATABASE_MARKER_INVALID')
  const anonKey = required('RC19_W4_RUNTIME_ANON_KEY')
  const serviceKey = required('RC19_W4_RUNTIME_SERVICE_ROLE_KEY')
  const actorInputs = [
    ['admin', 'admin', 'RC19_W4_SYNTHETIC_ADMIN_EMAIL', 'RC19_W4_SYNTHETIC_ADMIN_PASSWORD'],
    ['leader', 'leader', 'RC19_W4_SYNTHETIC_LEADER_EMAIL', 'RC19_W4_SYNTHETIC_LEADER_PASSWORD'],
    ['member', 'member', 'RC19_W4_SYNTHETIC_MEMBER_EMAIL', 'RC19_W4_SYNTHETIC_MEMBER_PASSWORD'],
  ]
  const credentials = actorInputs.map(([name, role, emailKey, passwordKey]) => ({
    name, role, email: required(emailKey), password: required(passwordKey),
  }))
  if (credentials.some(item => !item.email.toLowerCase().endsWith('@example.test') || item.password.length < 16)
    || new Set(credentials.map(item => item.email.toLowerCase())).size !== credentials.length) {
    stop('SYNTHETIC_CREDENTIAL_CONTRACT_INVALID')
  }

  const health = await fetch(`${url}/auth/v1/health`, { signal: AbortSignal.timeout(10000) })
  if (!health.ok) stop('GOTRUE_HEALTH_FAILED')
  const authSettings = await fetch(`${url}/auth/v1/settings`, {
    headers: { apikey: anonKey }, signal: AbortSignal.timeout(10000),
  })
  if (!authSettings.ok) stop('GOTRUE_SETTINGS_FAILED')
  const rest = await fetch(`${url}/rest/v1/`, {
    headers: { apikey: anonKey }, signal: AbortSignal.timeout(10000),
  })
  if (!rest.ok) stop('POSTGREST_HEALTH_FAILED')

  const service = safeClient(url, serviceKey)
  const markerResult = await service.from('rc19_w4_application_runtime_probe')
    .select('marker').eq('marker', marker).limit(2)
  const markerRows = await requireNoError(markerResult, 'DATABASE_MARKER_READ_FAILED')
  if (!Array.isArray(markerRows) || markerRows.length !== 1 || markerRows[0].marker !== marker) {
    stop('DATABASE_MARKER_MISMATCH')
  }

  const authUsers = []
  for (const item of credentials) {
    authUsers.push(await createActor(
      service, url, anonKey, item.role, item.email, item.password, item.name,
    ))
  }
  const [admin, leader, member] = authUsers
  const supportPassword = `${randomBytes(24).toString('base64url')}Aa9!`
  const unassignedPassword = `${randomBytes(24).toString('base64url')}Ub7!`
  const foreignLeaderPassword = `${randomBytes(24).toString('base64url')}Lf5!`
  const [memberSupport, memberUnassigned, leaderOtherBrand] = await Promise.all([
    createActor(service, url, anonKey, 'member', `rc19-${randomUUID()}-support@example.test`, supportPassword, 'member-support'),
    createActor(service, url, anonKey, 'member', `rc19-${randomUUID()}-unassigned@example.test`, unassignedPassword, 'member-unassigned'),
    createActor(service, url, anonKey, 'leader', `rc19-${randomUUID()}-other-brand@example.test`, foreignLeaderPassword, 'leader-other-brand'),
  ])

  const brandIds = [randomUUID(), randomUUID()]
  const platformId = randomUUID()
  const brands = await service.from('brands').insert(brandIds.map((id, index) => ({
    id, name: `RC19 synthetic Brand ${index + 1}`, status: 'active',
  })))
  await requireNoError(brands, 'BRAND_FIXTURE_CREATE_FAILED')
  const platform = await service.from('platforms').insert({
    id: platformId, name: 'RC19 synthetic Platform', status: 'active',
  })
  await requireNoError(platform, 'PLATFORM_FIXTURE_CREATE_FAILED')

  for (const [actorId, brandId] of [[leader.id, brandIds[0]], [leaderOtherBrand.id, brandIds[1]]]) {
    const scope = await admin.client.rpc('rc19_set_leader_brand_scope', {
      p_user_id: actorId,
      p_brand_id: brandId,
      p_scope_key: 'shifts.read',
      p_enabled: true,
      p_expected_version: 0,
      p_valid_from: new Date(Date.now() - 5000).toISOString(),
      p_valid_until: null,
      p_reason: 'Disposable RC19 application acceptance fixture',
    })
    await requireNoError(scope, 'LEADER_SCOPE_FIXTURE_CREATE_FAILED')
  }

  const suffix = randomUUID()
  const scopedShiftId = await createShift(
    admin.client, service, brandIds[0], platformId, `RC19 acceptance ${suffix} scoped`, '2099-12-01',
    [segment(1, '10:00', '12:00', 'host'), segment(2, '12:00', '14:00', 'support')],
  )
  const foreignShiftId = await createShift(
    admin.client, service, brandIds[1], platformId, `RC19 acceptance ${suffix} foreign`, '2099-12-02',
    [segment(1, '10:00', '14:00', 'host')],
  )

  const segmentRows = await service.from('shift_staffing_segments')
    .select('id,shift_id,segment_index').in('shift_id', [scopedShiftId, foreignShiftId])
  const storedSegments = await requireNoError(segmentRows, 'SEGMENT_FIXTURE_READBACK_FAILED')
  if (!Array.isArray(storedSegments) || storedSegments.length !== 3
    || storedSegments.some(row => !row.id || ![scopedShiftId, foreignShiftId].includes(row.shift_id))) {
    stop('SEGMENT_FIXTURE_READBACK_MISMATCH')
  }
  const segmentByKey = new Map(storedSegments.map(row => [`${row.shift_id}:${row.segment_index}`, row.id]))
  const assignmentInputs = [
    { actorId: member.id, role: 'host', segmentId: segmentByKey.get(`${scopedShiftId}:1`) },
    { actorId: memberSupport.id, role: 'support', segmentId: segmentByKey.get(`${scopedShiftId}:2`) },
  ]
  for (const assignment of assignmentInputs) {
    if (!assignment.segmentId) stop('ASSIGNMENT_FIXTURE_SEGMENT_MISSING')
    const versionResult = await service.from('shifts').select('version').eq('id', scopedShiftId).single()
    const versionRow = await requireNoError(versionResult, 'ASSIGNMENT_FIXTURE_VERSION_READ_FAILED')
    const assigned = await admin.client.rpc('manual_assign_shift_staff_to_segment', {
      p_shift_id: scopedShiftId,
      p_user_id: assignment.actorId,
      p_role: assignment.role,
      p_notes: 'RC19 disposable application acceptance fixture',
      p_expected_version: versionRow.version,
      p_staffing_segment_id: assignment.segmentId,
    }).single()
    const assignmentRow = await requireNoError(assigned, 'ASSIGNMENT_FIXTURE_CREATE_FAILED')
    if (!assignmentRow?.id || assignmentRow.staffing_segment_id !== assignment.segmentId
      || assignmentRow.user_id !== assignment.actorId || assignmentRow.operational_role !== assignment.role) {
      stop('ASSIGNMENT_FIXTURE_CREATE_MISMATCH')
    }
  }

  const agencyColumn = await service.from('shifts')
    .select('id,authoritative_agency_id').eq('id', scopedShiftId).maybeSingle()
  if (!agencyColumn.error) {
    if (!agencyColumn.data || !agencyColumn.data.authoritative_agency_id) {
      stop('AGENCY_FIXTURE_REQUIRES_CANONICAL_MEMBERSHIP_SETUP')
    }
    stop('AGENCY_FIXTURE_PROVISIONING_NOT_IMPLEMENTED')
  }
  if (agencyColumn.error.code !== 'PGRST204' && agencyColumn.error.code !== '42703') {
    stop('AGENCY_CAPABILITY_CHECK_FAILED')
  }

  const leaderBrandsResult = await leader.client.rpc('rc19_current_leader_brand_ids', {
    p_scope_key: 'shifts.read',
  })
  const leaderBrands = await requireNoError(leaderBrandsResult, 'LEADER_SCOPE_API_FAILED')
  if (!Array.isArray(leaderBrands) || leaderBrands.length !== 1 || leaderBrands[0] !== brandIds[0]) {
    stop('LEADER_SCOPE_API_MISMATCH')
  }

  const adminShiftsResult = await admin.client.from('shifts').select('id,brand_id')
    .in('id', [scopedShiftId, foreignShiftId])
  const adminShifts = await requireNoError(adminShiftsResult, 'ADMIN_POSTGREST_READ_FAILED')
  if (!Array.isArray(adminShifts) || adminShifts.length !== 2) stop('ADMIN_POSTGREST_SCOPE_MISMATCH')

  const leaderShiftsResult = await leader.client.from('shifts').select('id,brand_id')
    .in('id', [scopedShiftId, foreignShiftId])
  const leaderShifts = await requireNoError(leaderShiftsResult, 'LEADER_POSTGREST_READ_FAILED')
  if (!Array.isArray(leaderShifts) || leaderShifts.length !== 1
    || leaderShifts[0].id !== scopedShiftId || leaderShifts[0].brand_id !== brandIds[0]) {
    stop('LEADER_BRAND_ISOLATION_FAILED')
  }

  const memberDirectoryResult = await member.client.from('business_users')
    .select('id,auth_user_id').order('id', { ascending: true })
  const memberDirectory = await requireNoError(memberDirectoryResult, 'MEMBER_POSTGREST_READ_FAILED')
  if (!Array.isArray(memberDirectory) || memberDirectory.length !== 1
    || memberDirectory[0].id !== member.id || memberDirectory[0].auth_user_id !== member.id) {
    stop('MEMBER_SELF_ONLY_RLS_FAILED')
  }
  const memberForeignResult = await member.client.from('business_users')
    .select('id').eq('id', admin.id)
  const memberForeign = await requireNoError(memberForeignResult, 'MEMBER_FOREIGN_READ_FAILED')
  if (!Array.isArray(memberForeign) || memberForeign.length !== 0) stop('MEMBER_FOREIGN_READ_VISIBLE')

  const wrongScopeShifts = await leaderOtherBrand.client.from('shifts').select('id')
    .eq('id', scopedShiftId)
  const wrongScopeRows = await requireNoError(wrongScopeShifts, 'UNSCOPED_LEADER_API_FAILED')
  if (!Array.isArray(wrongScopeRows) || wrongScopeRows.length !== 0) stop('WRONG_BRAND_LEADER_VISIBLE')

  const anonymous = safeClient(url, anonKey)
  const anonymousRead = await anonymous.from('business_users').select('id').limit(1)
  if (!anonymousRead.error || (anonymousRead.data?.length ?? 0) > 0) stop('ANONYMOUS_POSTGREST_NOT_DENIED')

  const persistedAssignments = await service.from('shift_registrations')
    .select('id,shift_id,user_id,operational_role,staffing_segment_id')
    .in('shift_id', [scopedShiftId, foreignShiftId])
  const assignments = await requireNoError(persistedAssignments, 'ASSIGNMENT_FIXTURE_READBACK_FAILED')
  if (!Array.isArray(assignments) || assignments.length !== 2
    || assignments.some(row => !row.id || row.shift_id !== scopedShiftId
      || ![member.id, memberSupport.id].includes(row.user_id))
    || new Set(assignments.map(row => row.staffing_segment_id)).size !== 2) {
    stop('ASSIGNMENT_FIXTURE_READBACK_MISMATCH')
  }
  const unassignedMemberResult = await service.from('shift_registrations')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', memberUnassigned.id)
    .in('shift_id', [scopedShiftId, foreignShiftId])
  await requireNoError(unassignedMemberResult, 'UNASSIGNED_MEMBER_READBACK_FAILED')
  if (unassignedMemberResult.count !== 0) stop('UNASSIGNED_MEMBER_HAS_ASSIGNMENT')

  const report = {
    schema,
    status: 'BLOCKED',
    application_sha: sha,
    runtime_database_marker: marker,
    synthetic_users: {
      admin: { login: true, canonical_business_user_mapping: true },
      leader: { login: true, canonical_business_user_mapping: true },
      member: { login: true, canonical_business_user_mapping: true },
    },
    authorization: { rbac: true, rls: true, application_api: true },
    browser_uat: { requested: false, ran: false, passed: false, status: 'NOT RUN' },
    cases: [
      {
        case_id: 'auth-canonical-business-identity', actor: 'Admin, Leader, Member',
        expected: 'Authenticated GoTrue identity maps to one active canonical business user with matching role.',
        actual: 'Synthetic Admin/Leader/Member login, Auth identity and canonical mapping checks passed.',
        evidence_scope: 'Disposable local Auth/PostgREST fixture; no hosted runtime.', status: 'PASS',
      },
      {
        case_id: 'agency-membership', actor: 'In-Agency, out-of-Agency, revoked Member',
        expected: 'Current canonical membership permits only in-scope operations; missing or revoked membership denies.',
        actual: 'Canonical Agency fixture provisioning is not implemented in this entrypoint.',
        evidence_scope: 'Source review only.', status: 'BLOCKED',
      },
      {
        case_id: 'external-summary', actor: 'Admin, scoped Leader, Member',
        expected: 'Authorized CAS mutation and idempotent replay match persisted summary readback.',
        actual: 'Not exercised by this entrypoint.', evidence_scope: 'No case evidence.', status: 'NOT RUN',
      },
      {
        case_id: 'workforce-full-scope-aggregates', actor: 'Admin, scoped Leader, Member',
        expected: 'Filtered category/status/late-minute totals equal complete authorized scope before pagination.',
        actual: 'Not exercised by this entrypoint.', evidence_scope: 'No case evidence.', status: 'NOT RUN',
      },
      {
        case_id: 'pass-swap-receipt-lifecycle', actor: 'Requester, counterpart, Leader, revoked actor',
        expected: 'Same-key retry returns one persisted row; changed payload and unauthorized replay deny.',
        actual: 'Not exercised by this entrypoint.', evidence_scope: 'No Auth/PG17 case evidence.', status: 'NOT RUN',
      },
      ...Array.from({ length: 11 }, (_, index) => ({
        case_id: `D${String(index + 1).padStart(2, '0')}`,
        actor: 'Per Codex 02 case definition',
        expected: 'Case-specific expected result and persisted readback from Codex 02 mapping.',
        actual: 'Not run; named business-group mapping is required from Codex 02.',
        evidence_scope: 'No case evidence.', status: 'NOT RUN',
      })),
      {
        case_id: 'temporal-attendance-payroll', actor: 'Member, Attendance reviewer, Payroll actor',
        expected: 'Temporal boundaries and source-to-payroll linkage match canonical persisted rows.',
        actual: 'Not exercised by this entrypoint.', evidence_scope: 'No case evidence.', status: 'NOT RUN',
      },
      {
        case_id: 'persisted-fixture-readback', actor: 'Disposable fixture service role',
        expected: 'Created shifts, segments and registrations read back exactly from PostgreSQL.',
        actual: 'Synthetic shift/segment/registration readback checks passed.',
        evidence_scope: 'Disposable local PostgreSQL fixture; not authenticated application API readback.', status: 'PASS',
      },
      {
        case_id: 'authenticated-browser', actor: 'Admin, Leader, Member',
        expected: 'Next.js starts at the attested SHA; authenticated browser action and persisted readback pass.',
        actual: 'This entrypoint does not start Next.js or run a browser.',
        evidence_scope: 'No browser evidence.', status: 'NOT RUN',
      },
    ],
    fixtures: {
      authenticated_users: authUsers.length + 3,
      brands: brandIds.length,
      platforms: 1,
      parent_shifts: 2,
      staffing_segments: storedSegments.length,
      canonical_assignments: assignments.length,
      wrong_brand_denied: true,
      unassigned_member_has_no_assignment: true,
      wrong_agency_denial: 'blocked_without_authoritative_membership_fixture',
      anonymous_denied: true,
      agency_membership: 'not_asserted_by_brand_code',
    },
  }
  process.stdout.write(`${JSON.stringify(report)}\n`)
}

main().catch(error => {
  const code = typeof error?.message === 'string' && /^[A-Z0-9_]+$/u.test(error.message)
    ? error.message : 'APPLICATION_ACCEPTANCE_FAILED'
  process.stderr.write(`${code}\n`)
  process.exitCode = 1
})
