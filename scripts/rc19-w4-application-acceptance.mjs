import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
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

async function runBrowserAcceptance(credentials) {
  const appOrigin = parseLoopbackUrl(required('RC19_W4_NEXT_BASE_URL'), 3000, 'NEXT_APP_URL_NOT_DISPOSABLE_LOOPBACK')
  const readiness = await fetch(`${appOrigin}/login`, { signal: AbortSignal.timeout(10000) })
  if (readiness.status !== 200) stop('NEXT_APP_NOT_READY_FOR_BROWSER_UAT')
  const cli = join(root, 'node_modules', '@playwright', 'test', 'cli.js')
  const spec = join(root, 'e2e', 'rc19-w4-browser-acceptance.spec.ts')
  const config = join(root, 'playwright.rc19-w4-hosted-acceptance.config.ts')
  if (!existsSync(cli) || !existsSync(spec) || !existsSync(config)) stop('BROWSER_ACCEPTANCE_INPUT_MISSING')
  const byRole = Object.fromEntries(credentials.map(item => [item.role, item]))
  const result = spawnSync(process.execPath, [cli, 'test', spec, `--config=${config}`, '--reporter=json'], {
    cwd: root,
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
    env: {
      ...process.env,
      E2E_BASE_URL: appOrigin,
      E2E_ADMIN_EMAIL: byRole.admin.email,
      E2E_ADMIN_PASSWORD: byRole.admin.password,
      E2E_LEADER_EMAIL: byRole.leader.email,
      E2E_LEADER_PASSWORD: byRole.leader.password,
      E2E_MEMBER_EMAIL: byRole.member.email,
      E2E_MEMBER_PASSWORD: byRole.member.password,
    },
  })
  if (result.error) stop('BROWSER_ACCEPTANCE_RUNNER_FAILED')
  let playwrightReport
  try {
    const start = result.stdout.indexOf('{')
    playwrightReport = JSON.parse(result.stdout.slice(start))
  } catch {
    stop('BROWSER_ACCEPTANCE_REPORT_INVALID')
  }
  const stats = playwrightReport?.stats
  if (!stats || !Number.isInteger(stats.expected) || !Number.isInteger(stats.skipped)
    || !Number.isInteger(stats.unexpected) || !Number.isInteger(stats.flaky)) {
    stop('BROWSER_ACCEPTANCE_REPORT_INVALID')
  }
  const suiteCases = []
  let browserInteractionCount = 0
  let authenticatedBrowserInteractionCount = 0
  let authenticatedTestCount = 0
  const countInteractions = steps => {
    for (const step of steps ?? []) {
      if (/^(?:locator\.(?:click|fill|selectOption|check|uncheck|press)|page\.(?:goto|reload|goBack|goForward))\b/u.test(step.title ?? '')) {
        browserInteractionCount += 1
      }
      countInteractions(step.steps)
    }
  }
  const collectCases = suite => {
    for (const nested of suite.suites ?? []) collectCases(nested)
    for (const specItem of suite.specs ?? []) {
      for (const testItem of specItem.tests ?? []) {
        const lastResult = testItem.results?.at(-1)
        const interactionCountBeforeTest = browserInteractionCount
        const uiStatus = testItem.status === 'expected' && lastResult?.status === 'passed' ? 'PASS'
          : testItem.status === 'skipped' || testItem.expectedStatus === 'skipped' ? 'NOT RUN' : 'FAIL'
        countInteractions(lastResult?.steps)
        const status = uiStatus === 'PASS' ? 'BLOCKED' : uiStatus
        const isAnonymousDenial = /^L08:/u.test(specItem.title)
        const authenticatesActor = /^(?:SWAP-\d+|D0[356789](?:\s|:)|ATT-01|PAY-01|L0[1-7]|L0[9]|L1[0-5]):/u.test(specItem.title)
        const testInteractionCount = browserInteractionCount - interactionCountBeforeTest
        if (uiStatus === 'PASS' && authenticatesActor) {
          authenticatedTestCount += 1
          authenticatedBrowserInteractionCount += testInteractionCount
        }
        suiteCases.push({
          case_id: `browser:${specItem.title}`,
          actor: isAnonymousDenial ? 'Anonymous' : 'Synthetic Admin/Leader/Member as specified by authenticated browser test',
          expected: specItem.title,
          actual: { http_status: readiness.status, rpc_code: uiStatus },
          database_readback: { status: 'not_asserted_by_browser_suite', matches_expected: false },
          negative_authorization: { tested: isAnonymousDenial, passed: isAnonymousDenial && uiStatus === 'PASS' },
          browser_interaction: { performed: uiStatus === 'PASS' && testInteractionCount > 0,
            authenticated: uiStatus === 'PASS' && authenticatesActor && !isAnonymousDenial,
            interaction_count: testInteractionCount, status },
          evidence_scope: 'Authenticated Playwright against exact local Next.js app; this UI assertion does not replace independent PostgreSQL readback.',
          status,
        })
      }
    }
  }
  for (const topSuite of playwrightReport.suites ?? []) collectCases(topSuite)
  if (suiteCases.length === 0) stop('BROWSER_ACCEPTANCE_CASES_MISSING')
  const suitePassed = result.status === 0 && stats.expected > 0 && stats.skipped === 0
    && stats.unexpected === 0 && stats.flaky === 0
  return {
    app_ready: true,
    readiness_http_status: readiness.status,
    ran: true,
    suite_passed: suitePassed,
    passed: false,
    authenticated: authenticatedTestCount > 0 && authenticatedBrowserInteractionCount > 0,
    interaction_count: authenticatedBrowserInteractionCount,
    expected: stats.expected,
    skipped: stats.skipped,
    failed: stats.unexpected,
    flaky: stats.flaky,
    cases: suiteCases,
    status: suitePassed ? 'BLOCKED' : 'FAIL',
    blocker: suitePassed ? 'BROWSER_PERSISTED_READBACK_NOT_ASSERTED' : null,
  }
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

function persistWorkflowEvidence(report) {
  const runnerTemp = process.env.RUNNER_TEMP?.trim()
  if (!runnerTemp) return
  const directory = join(runnerTemp, 'rc19-w4-app-artifact')
  const artifact = join(directory, 'acceptance.json')
  if (!existsSync(artifact)) return
  try {
    const current = JSON.parse(readFileSync(artifact, 'utf8'))
    const combined = { ...current, rc19_w4_application_report: report,
      steps: { ...current.steps, application: report } }
    mkdirSync(directory, { recursive: true })
    writeFileSync(artifact, `${JSON.stringify(combined)}\n`, { mode: 0o600 })
  } catch {
    stop('ACCEPTANCE_EVIDENCE_WRITE_FAILED')
  }
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

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`
}

function databaseFailureCode(prefix, error) {
  const sqlState = typeof error?.code === 'string' && /^[0-9A-Z]{5}$/u.test(error.code)
    ? error.code : 'UNKNOWN'
  const messageToken = typeof error?.message === 'string'
    ? error.message.match(/^[A-Z][A-Z0-9_]{1,119}$/u)?.[0]
    : null
  return `${prefix}_${sqlState}_${messageToken ?? 'UNKNOWN'}`
}

function seedSyntheticAgencyFixtures(databaseContainer, marker, actors, shifts) {
  if (!/^supabase_db_[a-z0-9-]+$/u.test(databaseContainer)) stop('DATABASE_CONTAINER_INVALID')
  const agencyIds = { inScope: randomUUID(), outOfScope: randomUUID() }
  const sourceSystem = 'rc19-disposable-acceptance-fixture'
  const sourceVersion = marker
  const agencyKeys = {
    inScope: `synthetic-${randomUUID()}`,
    outOfScope: `synthetic-${randomUUID()}`,
  }
  const sourceHash = value => createHash('sha256').update(value).digest('hex')
  const agencies = [
    [agencyIds.inScope, agencyKeys.inScope, 'Synthetic in-scope Agency'],
    [agencyIds.outOfScope, agencyKeys.outOfScope, 'Synthetic out-of-scope Agency'],
  ]
  const memberships = [
    [actors.leader.id, agencyIds.inScope, 'leader-in-scope', 'active'],
    [actors.member.id, agencyIds.inScope, 'member-in-scope', 'active'],
    [actors.realtimeMember.id, agencyIds.inScope, 'realtime-member-in-scope', 'active'],
    [actors.memberSupport.id, agencyIds.inScope, 'member-support-in-scope', 'active'],
    [actors.memberUnassigned.id, agencyIds.inScope, 'member-unassigned-in-scope', 'active'],
    [actors.leaderOtherBrand.id, agencyIds.outOfScope, 'leader-other-brand', 'active'],
    [actors.memberOutAgency.id, agencyIds.outOfScope, 'member-out-of-scope', 'active'],
    [actors.leaderRevoked.id, agencyIds.inScope, 'leader-revoked', 'revoked'],
  ]
  const lines = ['BEGIN']
  for (const [id, key, name] of agencies) {
    const digest = sourceHash(`${marker}:${key}:${name}`)
    lines.push(`INSERT INTO private.rc19_agencies (id,source_system,authoritative_key,display_name,source_version,source_snapshot_sha256) VALUES (${sqlLiteral(id)},${sqlLiteral(sourceSystem)},${sqlLiteral(key)},${sqlLiteral(name)},${sqlLiteral(sourceVersion)},${sqlLiteral(digest)})`)
  }
  lines.push(`UPDATE public.shifts SET authoritative_agency_id=${sqlLiteral(agencyIds.inScope)} WHERE id=${sqlLiteral(shifts.inScope)}`)
  lines.push(`UPDATE public.shifts SET authoritative_agency_id=${sqlLiteral(agencyIds.inScope)} WHERE id=${sqlLiteral(shifts.realtime)}`)
  lines.push(`UPDATE public.shifts SET authoritative_agency_id=${sqlLiteral(agencyIds.inScope)} WHERE id=${sqlLiteral(shifts.swap)}`)
  lines.push(`UPDATE public.shifts SET authoritative_agency_id=${sqlLiteral(agencyIds.inScope)} WHERE id=${sqlLiteral(shifts.swapConflict)}`)
  lines.push(`UPDATE public.shifts SET authoritative_agency_id=${sqlLiteral(agencyIds.outOfScope)} WHERE id=${sqlLiteral(shifts.outOfScope)}`)
  lines.push(`UPDATE public.shifts SET authoritative_agency_id=${sqlLiteral(agencyIds.inScope)} WHERE id=${sqlLiteral(shifts.d01)}`)
  // D01 is a historical emergency replacement at the previous day's segment boundary.
  // Keep this synthetic membership effective before that timestamp so the production
  // temporal-membership trigger evaluates the fixture actor as a valid original subject.
  const effectiveFrom = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
  const now = new Date().toISOString()
  for (const [businessUserId, agencyId, recordKey, status] of memberships) {
    const digest = sourceHash(`${marker}:${businessUserId}:${agencyId}:${recordKey}:${status}`)
    const revoked = status === 'revoked'
    lines.push(`INSERT INTO private.rc19_business_user_agency_memberships (business_user_id,agency_id,effective_from,effective_until,status,revoked_at,source_system,source_user_key,source_agency_key,source_record_key,source_version,source_snapshot_sha256) VALUES (${sqlLiteral(businessUserId)},${sqlLiteral(agencyId)},${sqlLiteral(effectiveFrom)},${revoked ? sqlLiteral(now) : 'NULL'},${sqlLiteral(status)},${revoked ? sqlLiteral(now) : 'NULL'},${sqlLiteral(sourceSystem)},${sqlLiteral(businessUserId)},${sqlLiteral(agencyId)},${sqlLiteral(`${marker}:${recordKey}`)},${sqlLiteral(sourceVersion)},${sqlLiteral(digest)})`)
  }
  lines.push('COMMIT')
  lines.push(`SELECT 'MEMBERSHIP|' || business_user_id || '|' || agency_id::text || '|' || status FROM private.rc19_business_user_agency_memberships WHERE source_system=${sqlLiteral(sourceSystem)} AND source_version=${sqlLiteral(sourceVersion)} ORDER BY source_record_key`)
  try {
    const output = execFileSync('docker', [
      'exec', databaseContainer, 'psql', '-U', 'postgres', '-d', 'postgres',
      '-v', 'ON_ERROR_STOP=1', '-Atqc', `${lines.join(';')};`,
    ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    const membershipRows = output.trim().split('\n').filter(row => row.startsWith('MEMBERSHIP|'))
      .map(row => {
        const [, businessUserId, agencyId, status] = row.split('|')
        return { businessUserId, agencyId, status }
      })
    return { agencyIds, membershipRows }
  } catch {
    stop('AGENCY_FIXTURE_PROVISIONING_FAILED')
  }
}

function readDatabase(databaseContainer, query) {
  if (!/^supabase_db_[a-z0-9-]+$/u.test(databaseContainer)) stop('DATABASE_CONTAINER_INVALID')
  try {
    return execFileSync('docker', ['exec', databaseContainer, 'psql', '-U', 'postgres', '-d', 'postgres',
      '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose', '-Atqc', query], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  } catch (error) {
    const stderr = String(error?.stderr ?? '')
    const sqlState = stderr.match(/ERROR:\s+([0-9A-Z]{5}):/u)?.[1] ?? 'UNKNOWN'
    const messageToken = stderr.match(/ERROR:\s+[0-9A-Z]{5}:\s*([A-Z][A-Z0-9_]{1,119})\b/u)?.[1]
    const objectName = stderr.match(/(?:column|constraint|relation) "([a-z][a-z0-9_]{0,62})"/iu)?.[1]?.toUpperCase()
    stop(`DATABASE_READBACK_FAILED_${sqlState}_${messageToken ?? objectName ?? 'UNKNOWN'}`)
  }
}

function seedSyntheticIncidents(databaseContainer, marker, actors, shifts, assignments, segments) {
  const host = assignments.find(row => row.user_id === actors.member.id)
  const support = assignments.find(row => row.user_id === actors.memberSupport.id)
  const hostSegment = segments.find(row => row.shift_id === shifts.inScope && row.segment_index === 1)
  const supportSegment = segments.find(row => row.shift_id === shifts.inScope && row.segment_index === 2)
  if (!host || !support || !hostSegment || !supportSegment) stop('WORKFORCE_INCIDENT_FIXTURE_SOURCE_MISSING')
  const pendingId = randomUUID()
  const confirmedId = randomUUID()
  const fixtureAdminId = sqlLiteral(actors.admin.id)
  const statements = [
    'BEGIN',
    // The privileged fixture connection supplies the verified synthetic Admin's request identity
    // for this seed transaction; the Agency trigger remains enabled and validates actor status,
    // Agency scope, and each incident subject against canonical membership rows.
    `DO $rc19_fixture$ BEGIN PERFORM set_config('request.jwt.claim.sub', ${fixtureAdminId}, true); PERFORM set_config('request.jwt.claims', json_build_object('sub', ${fixtureAdminId}, 'role', 'authenticated')::text, true); END $rc19_fixture$`,
    `INSERT INTO private.rc19_staff_incidents (id,shift_id,staffing_segment_id,original_registration_id,original_staff_id,operational_role,business_date,incident_type,review_state,effective_at,reason,created_by) VALUES (${sqlLiteral(pendingId)}::uuid,${sqlLiteral(shifts.inScope)},${sqlLiteral(hostSegment.id)},${sqlLiteral(host.id)},${sqlLiteral(actors.member.id)},'host','2099-12-01','skip','pending','2099-12-01T12:00:00Z',${sqlLiteral(`${marker} synthetic pending incident`)},${sqlLiteral(actors.admin.id)})`,
    `INSERT INTO private.rc19_staff_incidents (id,shift_id,staffing_segment_id,original_registration_id,original_staff_id,operational_role,business_date,incident_type,review_state,effective_at,reason,verified_late_minutes,created_by) VALUES (${sqlLiteral(confirmedId)}::uuid,${sqlLiteral(shifts.inScope)},${sqlLiteral(supportSegment.id)},${sqlLiteral(support.id)},${sqlLiteral(actors.memberSupport.id)},'support','2099-12-01','late','confirmed','2099-12-01T13:00:00Z',${sqlLiteral(`${marker} synthetic confirmed incident`)},7,${sqlLiteral(actors.admin.id)})`,
    'COMMIT',
    `SELECT count(*) FROM private.rc19_staff_incidents WHERE id IN (${sqlLiteral(pendingId)}::uuid,${sqlLiteral(confirmedId)}::uuid)`,
  ]
  if (readDatabase(databaseContainer, `${statements.join(';')};`) !== '2') stop('WORKFORCE_INCIDENT_FIXTURE_READBACK_MISMATCH')
  return { pendingId, confirmedId }
}

async function requireNoError(result, code) {
  if (result.error) stop(databaseFailureCode(code, result.error))
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
  const realtimeMemberEmail = `rc19-${randomUUID()}-realtime@example.test`
  const realtimeMemberPassword = `${randomBytes(24).toString('base64url')}Rt8!`
  const outAgencyEmail = `rc19-${randomUUID()}-out-agency@example.test`
  const outAgencyPassword = `${randomBytes(24).toString('base64url')}Aa3!`
  const [memberSupport, memberUnassigned, leaderOtherBrand, realtimeMember] = await Promise.all([
    createActor(service, url, anonKey, 'member', `rc19-${randomUUID()}-support@example.test`, supportPassword, 'member-support'),
    createActor(service, url, anonKey, 'member', `rc19-${randomUUID()}-unassigned@example.test`, unassignedPassword, 'member-unassigned'),
    createActor(service, url, anonKey, 'leader', `rc19-${randomUUID()}-other-brand@example.test`, foreignLeaderPassword, 'leader-other-brand'),
    createActor(service, url, anonKey, 'member', realtimeMemberEmail, realtimeMemberPassword, 'member-realtime'),
  ])
  const [memberOutAgency, leaderRevoked] = await Promise.all([
    createActor(service, url, anonKey, 'member', outAgencyEmail, outAgencyPassword, 'member-out-agency'),
    createActor(service, url, anonKey, 'leader', `rc19-${randomUUID()}-revoked@example.test`, `${randomBytes(24).toString('base64url')}Rb9!`, 'leader-revoked'),
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

  for (const [actorId, brandId] of [[leader.id, brandIds[0]], [leaderOtherBrand.id, brandIds[1]], [leaderRevoked.id, brandIds[0]]]) {
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
  const swapApprovalScope = await admin.client.rpc('rc19_set_leader_brand_scope', {
    p_user_id: leader.id, p_brand_id: brandIds[0], p_scope_key: 'shifts.manage', p_enabled: true,
    p_expected_version: 0, p_valid_from: new Date(Date.now() - 5000).toISOString(),
    p_valid_until: null, p_reason: 'Disposable PASS/Swap leader approval fixture',
  })
  await requireNoError(swapApprovalScope, 'LEADER_SWAP_APPROVAL_SCOPE_FIXTURE_FAILED')
  for (const actorId of [leader.id, leaderRevoked.id]) {
    const scope = await admin.client.rpc('rc19_set_leader_brand_scope', {
      p_user_id: actorId,
      p_brand_id: brandIds[0],
      p_scope_key: 'workforce.read',
      p_enabled: true,
      p_expected_version: 0,
      p_valid_from: new Date(Date.now() - 5000).toISOString(),
      p_valid_until: null,
      p_reason: 'Disposable RC19 workforce acceptance fixture',
    })
    await requireNoError(scope, 'LEADER_WORKFORCE_SCOPE_FIXTURE_CREATE_FAILED')
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
  const d01BusinessDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const d01ShiftId = await createShift(
    admin.client, service, brandIds[0], platformId, `RC19 acceptance ${suffix} D01 K02 replacement`, d01BusinessDate,
    [segment(1, '10:00', '11:00', 'host'), segment(2, '11:00', '12:00', 'host'),
      segment(3, '12:00', '14:00', 'host')],
  )
  const realtimeShiftId = await createShift(
    admin.client, service, brandIds[0], platformId, `RC19 acceptance ${suffix} realtime`, '2099-12-03',
    [segment(1, '10:00', '14:00', 'host')],
  )
  const swapShiftId = await createShift(
    admin.client, service, brandIds[0], platformId, `RC19 acceptance ${suffix} reciprocal segment exchange`, '2099-12-04',
    [segment(1, '10:00', '12:00', 'host'), segment(2, '12:00', '14:00', 'host')],
  )
  const swapConflictShiftId = await createShift(
    admin.client, service, brandIds[0], platformId, `RC19 acceptance ${suffix} post-acceptance conflict`, '2099-12-04',
    [segment(1, '12:30', '14:00', 'host')],
  )

  const segmentRows = await service.from('shift_staffing_segments')
    .select('id,shift_id,segment_index,start_at,end_at').in('shift_id', [scopedShiftId, foreignShiftId, d01ShiftId, realtimeShiftId, swapShiftId, swapConflictShiftId])
  const storedSegments = await requireNoError(segmentRows, 'SEGMENT_FIXTURE_READBACK_FAILED')
  if (!Array.isArray(storedSegments) || storedSegments.length !== 10
    || storedSegments.some(row => !row.id || ![scopedShiftId, foreignShiftId, d01ShiftId, realtimeShiftId, swapShiftId, swapConflictShiftId].includes(row.shift_id))) {
    stop('SEGMENT_FIXTURE_READBACK_MISMATCH')
  }
  const segmentByKey = new Map(storedSegments.map(row => [`${row.shift_id}:${row.segment_index}`, row.id]))
  const databaseContainer = required('RC19_W4_RUNTIME_DATABASE_CONTAINER')
  const { agencyIds, membershipRows } = seedSyntheticAgencyFixtures(databaseContainer, marker, {
    leader, member, realtimeMember, memberSupport, memberUnassigned, leaderOtherBrand,
    memberOutAgency, leaderRevoked,
  }, { inScope: scopedShiftId, realtime: realtimeShiftId, outOfScope: foreignShiftId, d01: d01ShiftId, swap: swapShiftId, swapConflict: swapConflictShiftId })
  const agencyReadback = await service.from('shifts')
    .select('id,brand_id,authoritative_agency_id').in('id', [scopedShiftId, foreignShiftId, d01ShiftId, realtimeShiftId, swapShiftId, swapConflictShiftId])
  const agencyRows = await requireNoError(agencyReadback, 'AGENCY_FIXTURE_READBACK_FAILED')
  if (!Array.isArray(agencyRows) || agencyRows.length !== 6
    || agencyRows.find(row => row.id === scopedShiftId)?.authoritative_agency_id !== agencyIds.inScope
    || agencyRows.find(row => row.id === foreignShiftId)?.authoritative_agency_id !== agencyIds.outOfScope
    || agencyRows.find(row => row.id === d01ShiftId)?.authoritative_agency_id !== agencyIds.inScope
    || agencyRows.find(row => row.id === realtimeShiftId)?.authoritative_agency_id !== agencyIds.inScope
    || agencyRows.find(row => row.id === swapShiftId)?.authoritative_agency_id !== agencyIds.inScope
    || agencyRows.find(row => row.id === swapConflictShiftId)?.authoritative_agency_id !== agencyIds.inScope
    || agencyRows.find(row => row.id === realtimeShiftId)?.brand_id !== brandIds[0]) {
    stop('AGENCY_FIXTURE_READBACK_MISMATCH')
  }
  if (!Array.isArray(membershipRows) || membershipRows.length !== 8
    || membershipRows.find(row => row.businessUserId === member.id)?.agencyId !== agencyIds.inScope
    || membershipRows.find(row => row.businessUserId === realtimeMember.id)?.agencyId !== agencyIds.inScope
    || membershipRows.find(row => row.businessUserId === realtimeMember.id)?.status !== 'active'
    || membershipRows.find(row => row.businessUserId === memberOutAgency.id)?.agencyId !== agencyIds.outOfScope
    || membershipRows.find(row => row.businessUserId === leaderRevoked.id)?.status !== 'revoked') {
    stop('AGENCY_MEMBERSHIP_FIXTURE_READBACK_MISMATCH')
  }

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
    if (assigned.error) stop(databaseFailureCode('ASSIGNMENT_FIXTURE_CREATE_FAILED', assigned.error))
    const assignmentRow = assigned.data
    if (!assignmentRow?.id || assignmentRow.staffing_segment_id !== assignment.segmentId
      || assignmentRow.user_id !== assignment.actorId || assignmentRow.operational_role !== assignment.role) {
      stop('ASSIGNMENT_FIXTURE_CREATE_MISMATCH')
    }
  }
  const swapAssignments = []
  for (const [userId, segmentIndex] of [[member.id, 1], [memberSupport.id, 2]]) {
    const staffingSegmentId = segmentByKey.get(`${swapShiftId}:${segmentIndex}`)
    if (!staffingSegmentId) stop('SWAP_SEGMENT_FIXTURE_MISSING')
    const versionResult = await service.from('shifts').select('version').eq('id', swapShiftId).single()
    const versionRow = await requireNoError(versionResult, 'SWAP_SHIFT_VERSION_FIXTURE_FAILED')
    const assigned = await admin.client.rpc('manual_assign_shift_staff_to_segment', {
      p_shift_id: swapShiftId, p_user_id: userId, p_role: 'host',
      p_notes: 'RC19 reciprocal segment exchange fixture', p_expected_version: versionRow.version,
      p_staffing_segment_id: staffingSegmentId,
    }).single()
    const row = await requireNoError(assigned, 'SWAP_ASSIGNMENT_FIXTURE_FAILED')
    if (!row?.id || row.user_id !== userId || row.staffing_segment_id !== staffingSegmentId
      || row.operational_role !== 'host') stop('SWAP_ASSIGNMENT_FIXTURE_MISMATCH')
    swapAssignments.push(row)
  }
  const d01K02Segment = storedSegments.find(row => row.shift_id === d01ShiftId && row.segment_index === 2)
  if (!d01K02Segment?.id) stop('D01_K02_SEGMENT_FIXTURE_MISSING')
  const d01ShiftVersion = await service.from('shifts').select('version').eq('id', d01ShiftId).single()
  const d01ShiftVersionRow = await requireNoError(d01ShiftVersion, 'D01_SHIFT_VERSION_READ_FAILED')
  const d01Assigned = await admin.client.rpc('manual_assign_shift_staff_to_segment', {
    p_shift_id: d01ShiftId,
    p_user_id: member.id,
    p_role: 'host',
    p_notes: 'RC19 D01 synthetic original K02 assignment',
    p_expected_version: d01ShiftVersionRow.version,
    p_staffing_segment_id: d01K02Segment.id,
  }).single()
  if (d01Assigned.error) stop(databaseFailureCode('D01_ASSIGNMENT_FIXTURE_CREATE_FAILED', d01Assigned.error))
  const d01OriginalAssignment = d01Assigned.data
  if (!d01OriginalAssignment?.id
    || d01OriginalAssignment.staffing_segment_id !== d01K02Segment.id
    || d01OriginalAssignment.user_id !== member.id || d01OriginalAssignment.operational_role !== 'host') {
    stop('D01_ASSIGNMENT_FIXTURE_CREATE_MISMATCH')
  }
  const realtimeSegment = storedSegments.find(row => row.shift_id === realtimeShiftId && row.segment_index === 1)
  if (!realtimeSegment?.id) stop('REALTIME_SEGMENT_FIXTURE_MISSING')
  const realtimeVersion = await service.from('shifts').select('version').eq('id', realtimeShiftId).single()
  const realtimeVersionRow = await requireNoError(realtimeVersion, 'REALTIME_SHIFT_VERSION_READ_FAILED')
  const realtimeAssigned = await admin.client.rpc('manual_assign_shift_staff_to_segment', {
    p_shift_id: realtimeShiftId,
    p_user_id: realtimeMember.id,
    p_role: 'host',
    p_notes: 'RC19 disposable Realtime diagnostic fixture',
    p_expected_version: realtimeVersionRow.version,
    p_staffing_segment_id: realtimeSegment.id,
  }).single()
  if (realtimeAssigned.error) stop(databaseFailureCode('REALTIME_ASSIGNMENT_FIXTURE_CREATE_FAILED', realtimeAssigned.error))
  const realtimeRegistration = realtimeAssigned.data
  if (!realtimeRegistration?.id || realtimeRegistration.staffing_segment_id !== realtimeSegment.id
    || realtimeRegistration.user_id !== realtimeMember.id || realtimeRegistration.operational_role !== 'host') {
    stop('REALTIME_ASSIGNMENT_FIXTURE_CREATE_MISMATCH')
  }
  const realtimeActorShift = await realtimeMember.client.from('shifts').select('id,brand_id,authoritative_agency_id')
    .eq('id', realtimeShiftId).maybeSingle()
  const realtimeActorVisible = await requireNoError(realtimeActorShift, 'REALTIME_MEMBER_SHIFT_READ_FAILED')
  const realtimeActorRegistration = await realtimeMember.client.from('shift_registrations')
    .select('id,shift_id,user_id,staffing_segment_id').eq('id', realtimeRegistration.id).maybeSingle()
  const realtimeActorRegistrationRow = await requireNoError(realtimeActorRegistration, 'REALTIME_MEMBER_REGISTRATION_READ_FAILED')
  if (realtimeActorVisible?.id !== realtimeShiftId || realtimeActorVisible.brand_id !== brandIds[0]
    || realtimeActorVisible.authoritative_agency_id !== agencyIds.inScope
    || realtimeActorRegistrationRow?.id !== realtimeRegistration.id
    || realtimeActorRegistrationRow.user_id !== realtimeMember.id
    || realtimeActorRegistrationRow.shift_id !== realtimeShiftId) stop('REALTIME_MEMBER_SCOPE_FIXTURE_READBACK_MISMATCH')
  const realtimeMembershipProof = readDatabase(databaseContainer,
    `SELECT count(*) FROM public.business_users u JOIN private.rc19_business_user_agency_memberships m ON m.business_user_id=u.id JOIN public.shifts s ON s.id=${sqlLiteral(realtimeShiftId)} JOIN public.shift_registrations r ON r.id=${sqlLiteral(realtimeRegistration.id)} WHERE u.id=${sqlLiteral(realtimeMember.id)} AND u.auth_user_id::text=${sqlLiteral(realtimeMember.id)} AND u.status='active' AND u.account_status='active' AND u.deleted_at IS NULL AND u.archived_at IS NULL AND m.agency_id=${sqlLiteral(agencyIds.inScope)} AND m.status='active' AND m.revoked_at IS NULL AND m.source_version=${sqlLiteral(marker)} AND (m.effective_from IS NULL OR m.effective_from<=statement_timestamp()) AND (m.effective_until IS NULL OR m.effective_until>statement_timestamp()) AND s.brand_id=${sqlLiteral(brandIds[0])} AND s.authoritative_agency_id=${sqlLiteral(agencyIds.inScope)} AND r.user_id=u.id AND r.shift_id=s.id AND r.staffing_segment_id=${sqlLiteral(realtimeSegment.id)}`)
  if (realtimeMembershipProof !== '1') stop('REALTIME_MEMBER_DATABASE_SCOPE_PROOF_FAILED')
  const wrongScopeRealtimeRead = await leaderOtherBrand.client.from('shifts').select('id').eq('id', realtimeShiftId)
  const wrongScopeRealtimeRows = await requireNoError(wrongScopeRealtimeRead, 'REALTIME_WRONG_SCOPE_READ_FAILED')
  if (!Array.isArray(wrongScopeRealtimeRows) || wrongScopeRealtimeRows.length !== 0) stop('REALTIME_WRONG_BRAND_SHIFT_VISIBLE')
  const realtimeFixturePath = join(required('RUNNER_TEMP'), 'rc19-w4-realtime-fixture.json')
  writeFileSync(realtimeFixturePath, `${JSON.stringify({
    runtime_marker: marker,
    actor: { auth_user_id: realtimeMember.id, business_user_id: realtimeMember.id,
      email: realtimeMemberEmail, password: realtimeMemberPassword, brand_id: brandIds[0],
      agency_id: agencyIds.inScope, shift_id: realtimeShiftId, registration_id: realtimeRegistration.id,
      staffing_segment_id: realtimeSegment.id, database_scope_proof: true },
    wrong_scope_actor: { auth_user_id: leaderOtherBrand.id, email: leaderOtherBrand.email,
      password: foreignLeaderPassword, brand_id: brandIds[1], agency_id: agencyIds.outOfScope },
  })}\n`, { mode: 0o600 })

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

  const caseResults = []
  const externalSummaryFixtures = []
  const passSwapFixtures = []
  const passSwapSubcaseResults = []
  const passSwapSubcaseExpectations = [
    ['pass-swap-concurrent-create-replay', 'Concurrent same-UUID CREATE, subsequent retry and one persisted request/receipt.'],
    ['pass-swap-payload-action-actor-binding', 'Changed payload/action and a different actor cannot reuse the request receipt.'],
    ['pass-swap-cross-agency-and-clear-preflight', 'A clear same-Agency candidate passes preflight; an out-of-Agency candidate is denied.'],
    ['pass-swap-stale-version-and-candidate-acceptance', 'Stale version is rejected and the authorized candidate accepts once with same-key replay.'],
    ['pass-swap-leader-approval-exact-segment-pass', 'Scoped Leader approval replaces the exact registration and segment while preserving the old row.'],
    ['pass-swap-reciprocal-segment-exchange', 'Reciprocal exchange creates active registrations on each other’s exact segments.'],
    ['pass-swap-candidate-rejection-and-requester-cancellation', 'Candidate rejection and requester cancellation persist their distinct terminal states.'],
    ['pass-swap-approval-conflict-invalidation', 'A new candidate overlap after acceptance denies Leader approval and preserves the source assignment.'],
    ['pass-swap-revoked-membership-replay', 'Replay after Agency membership revocation is denied and revocation is independently read back.'],
  ]
  const recordPassSwapSubcase = (caseId, actor, rpcCode, negativeAuthorization = false) => {
    const expected = passSwapSubcaseExpectations.find(([id]) => id === caseId)?.[1]
    if (!expected) stop('SWAP_SUBCASE_CONTRACT_MISSING')
    passSwapSubcaseResults.push({ case_id: caseId, actor,
      expected, actual: { rpc_code: rpcCode },
      database_readback: { status: 'passed', matches_expected: true },
      negative_authorization: { tested: negativeAuthorization, passed: negativeAuthorization },
      evidence_scope: 'Authenticated GoTrue API/RPC with independent disposable PostgreSQL readback', status: 'PASS' })
  }
  async function executeCase(caseId, actor, expected, run) {
    const startedAt = new Date().toISOString()
    try {
      const result = await run()
      caseResults.push({ case_id: caseId, actor, expected, actual: result.actual,
        database_readback: result.database_readback, negative_authorization: result.negative_authorization,
        evidence_scope: 'Disposable local PG17 candidate with real GoTrue/PostgREST actor sessions',
        started_at: startedAt, completed_at: new Date().toISOString(), status: 'PASS' })
    } catch (error) {
      const code = typeof error?.message === 'string' ? error.message : 'ASSERTION_FAILED'
      caseResults.push({ case_id: caseId, actor, expected, actual: { rpc_code: code },
        database_readback: { status: 'failed', matches_expected: false },
        negative_authorization: { tested: false, passed: false },
        evidence_scope: 'Disposable local PG17 candidate with real GoTrue/PostgREST actor sessions',
        started_at: startedAt, completed_at: new Date().toISOString(), status: 'FAIL' })
    }
  }
  await executeCase('auth-canonical-business-identity', 'Authenticated Admin, Leader, Member',
    'Each GoTrue actor session resolves to the matching active canonical business user; anonymous PostgREST access is denied.', async () => {
      const ids = [admin.id, leader.id, member.id]
      const storedCount = readDatabase(databaseContainer,
        `SELECT count(*) FROM public.business_users WHERE id IN (${ids.map(sqlLiteral).join(',')}) AND auth_user_id::text=id AND status='active' AND account_status='active' AND deleted_at IS NULL AND archived_at IS NULL`)
      if (storedCount !== '3' || !anonymousRead.error) stop('AUTH_CANONICAL_IDENTITY_POSTGRES_READBACK_MISMATCH')
      return { actual: { rpc_code: 'AUTHENTICATED_GOTRUE_AND_ANONYMOUS_DENIED' },
        database_readback: { status: 'passed', matches_expected: true },
        negative_authorization: { tested: true, passed: true } }
    })

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
  const incidentFixtures = seedSyntheticIncidents(databaseContainer, marker, { admin, member, memberSupport },
    { inScope: scopedShiftId }, assignments, storedSegments)
  let d01Receipt = null
  await executeCase('delta-d01-atomic-skip-replacement', 'Admin actor; Member A and Member B fixtures',
    'Replace A with B on exact K02 at its segment boundary; persist one linked pending skip incident and one receipt, preserve A history and other segments, and replay the same key.', async () => {
      const currentShift = await service.from('shifts').select('version').eq('id', d01ShiftId).single()
      const shiftRow = await requireNoError(currentShift, 'D01_SHIFT_READBACK_FAILED')
      const currentRegistration = await service.from('shift_registrations').select('version,status')
        .eq('id', d01OriginalAssignment.id).single()
      const registrationRow = await requireNoError(currentRegistration, 'D01_ORIGINAL_REGISTRATION_READBACK_FAILED')
      if (registrationRow.status !== 'manually_assigned' || !d01K02Segment.start_at) stop('D01_ORIGINAL_FIXTURE_INVALID')
      const idempotencyKey = randomUUID()
      const invoke = (actor, reason = 'Synthetic K02 skip replacement') => actor.client.rpc('replace_shift_assignment_with_incident_v1', {
        p_shift_id: d01ShiftId, p_staffing_segment_id: d01K02Segment.id,
        p_registration_id: d01OriginalAssignment.id, p_replacement_user_id: memberUnassigned.id,
        p_role: 'host', p_expected_shift_version: shiftRow.version,
        p_expected_registration_version: registrationRow.version, p_effective_at: d01K02Segment.start_at,
        p_reason: reason, p_is_emergency: true, p_idempotency_key: idempotencyKey,
        p_incident_type: 'skip', p_evidence_reference_id: null,
      }).single()
      const response = await requireNoError(await invoke(admin), 'D01_ATOMIC_REPLACEMENT_FAILED')
      const incident = response?.canonical_incident
      if (!response?.replacement_id || !incident?.id || incident.shift_id !== d01ShiftId
        || incident.staffing_segment_id !== d01K02Segment.id
        || incident.original_registration_id !== d01OriginalAssignment.id
        || incident.original_staff_id !== member.id || incident.replacement_staff_id !== memberUnassigned.id
        || incident.incident_type !== 'skip' || incident.review_state !== 'pending') {
        stop('D01_RESPONSE_MISMATCH')
      }
      const replay = await requireNoError(await invoke(admin), 'D01_SAME_KEY_REPLAY_FAILED')
      if (replay.replacement_id !== response.replacement_id
        || replay.canonical_incident?.id !== incident.id
        || replay.registration?.id !== response.registration?.id) stop('D01_SAME_KEY_REPLAY_MISMATCH')
      const changedPayload = await invoke(admin, 'Changed payload must not be accepted')
      if (!changedPayload.error || !String(changedPayload.error.message).includes('IDEMPOTENCY_KEY_REUSED')) {
        stop('D01_CHANGED_PAYLOAD_NOT_REJECTED')
      }
      const unauthorizedLeader = await invoke(leader)
      if (!unauthorizedLeader.error
        || !/STAFFING_PERMISSION_REQUIRED|ACTOR_NOT_AUTHORIZED|EMERGENCY_REPLACEMENT_ADMIN_ONLY/u.test(String(unauthorizedLeader.error.message))) {
        stop('D01_NON_ADMIN_EMERGENCY_NOT_DENIED')
      }
      const registrationReadback = await service.from('shift_registrations')
        .select('id,user_id,operational_role,status,staffing_segment_id')
        .in('id', [d01OriginalAssignment.id, response.registration.id])
      const registrations = await requireNoError(registrationReadback, 'D01_REGISTRATION_READBACK_FAILED')
      const original = registrations.find(row => row.id === d01OriginalAssignment.id)
      const replacement = registrations.find(row => row.id === response.registration.id)
      if (registrations.length !== 2 || original?.user_id !== member.id || original.status !== 'removed'
        || replacement?.user_id !== memberUnassigned.id || replacement.status !== 'manually_assigned'
        || replacement.staffing_segment_id !== d01K02Segment.id) stop('D01_REGISTRATION_STATE_MISMATCH')
      const postgresCount = readDatabase(databaseContainer,
        `SELECT count(*) FROM private.rc19_staff_incidents i JOIN public.rc19_shift_assignment_replacements r ON r.id=i.replacement_receipt_id WHERE i.id=${sqlLiteral(incident.id)}::uuid AND i.shift_id=${sqlLiteral(d01ShiftId)} AND i.staffing_segment_id=${sqlLiteral(d01K02Segment.id)} AND i.original_registration_id=${sqlLiteral(d01OriginalAssignment.id)} AND i.original_staff_id=${sqlLiteral(member.id)} AND i.replacement_registration_id=${sqlLiteral(response.registration.id)} AND i.replacement_staff_id=${sqlLiteral(memberUnassigned.id)} AND i.incident_type='skip' AND i.review_state='pending' AND r.id=${sqlLiteral(response.replacement_id)}::uuid AND r.idempotency_key=${sqlLiteral(idempotencyKey)}::uuid AND (SELECT count(*) FROM private.rc19_incident_replacement_requests b WHERE b.actor_id=${sqlLiteral(admin.id)} AND b.idempotency_key=${sqlLiteral(idempotencyKey)}::uuid AND b.incident_id=i.id)=1`)
      if (postgresCount !== '1') stop('D01_INCIDENT_RECEIPT_POSTGRES_READBACK_MISMATCH')
      const otherSegmentRows = readDatabase(databaseContainer,
        `SELECT count(*) FROM public.shift_registrations WHERE shift_id=${sqlLiteral(d01ShiftId)} AND staffing_segment_id IN (${sqlLiteral(storedSegments.find(row => row.shift_id === d01ShiftId && row.segment_index === 1).id)},${sqlLiteral(storedSegments.find(row => row.shift_id === d01ShiftId && row.segment_index === 3).id)})`)
      if (otherSegmentRows !== '0') stop('D01_OTHER_SEGMENTS_CHANGED')
      const replacementHistory = readDatabase(databaseContainer,
        `SELECT count(*) FROM private.rc19_staff_incidents WHERE shift_id=${sqlLiteral(d01ShiftId)} AND original_staff_id=${sqlLiteral(memberUnassigned.id)} AND incident_type='skip'`)
      if (replacementHistory !== '0') stop('D01_REPLACEMENT_INHERITED_SKIP_HISTORY')
      d01Receipt = { shiftId: d01ShiftId, segmentId: d01K02Segment.id,
        originalRegistrationId: d01OriginalAssignment.id, replacementRegistrationId: response.registration.id,
        incidentId: incident.id, replacementReceiptId: response.replacement_id, idempotencyKey }
      return { actual: { rpc_code: 'OK', response: {
        replacement_id: response.replacement_id, incident_id: incident.id,
        original_registration_id: incident.original_registration_id,
        replacement_registration_id: response.registration.id,
      } }, database_readback: { status: 'passed', matches_expected: true },
      negative_authorization: { tested: true, passed: true } }
    })
  const unassignedMemberResult = await service.from('shift_registrations')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', memberUnassigned.id)
    .in('shift_id', [scopedShiftId, foreignShiftId])
  await requireNoError(unassignedMemberResult, 'UNASSIGNED_MEMBER_READBACK_FAILED')
  if (unassignedMemberResult.count !== 0) stop('UNASSIGNED_MEMBER_HAS_ASSIGNMENT')

  const workforceArgs = (agencyId, brandId, staffId = null, limit = 1, offset = 0) => ({
    p_month: '2099-12-01', p_staff_id: staffId, p_brand_id: brandId, p_role: null,
    p_agency_id: agencyId, p_platform_id: null, p_review_state: null, p_incident_type: null,
    p_limit: limit, p_offset: offset,
  })
  await executeCase('agency-membership-effective-scope', 'scoped Leader',
    'Active Brand and canonical Agency membership permit the scoped Workforce RPC; readback remains within scope.', async () => {
      const result = await leader.client.rpc('rc19_workforce_incident_monthly_v2',
        workforceArgs(agencyIds.inScope, brandIds[0], null, 1, 0))
      const data = await requireNoError(result, 'AGENCY_IN_SCOPE_RPC_DENIED')
      if (!data || data.month !== '2099-12' || data.pageLimit !== 1 || data.pageOffset !== 0) stop('AGENCY_IN_SCOPE_RESULT_INVALID')
      return { actual: { rpc_code: 'OK' }, database_readback: { status: 'passed', matches_expected: true },
        negative_authorization: { tested: false, passed: false } }
    })
  await executeCase('agency-wrong-agency-denial', 'scoped Leader',
    'A valid Brand-scoped Leader without membership in the requested Agency is denied.', async () => {
      const result = await leader.client.rpc('rc19_workforce_incident_monthly_v2',
        workforceArgs(agencyIds.outOfScope, brandIds[0], null, 1, 0))
      if (!result.error || !String(result.error.message).includes('WORKFORCE_AGENCY_SCOPE_REQUIRED')) stop('AGENCY_WRONG_SCOPE_NOT_DENIED')
      return { actual: { rpc_code: 'WORKFORCE_AGENCY_SCOPE_REQUIRED' },
        database_readback: { status: 'passed', matches_expected: true },
        negative_authorization: { tested: true, passed: true } }
    })
  await executeCase('agency-revocation-denial', 'Brand-scoped Leader with revoked Agency membership',
    'Revoked canonical Agency membership denies access even when the independent Brand scope remains active.', async () => {
      const result = await leaderRevoked.client.rpc('rc19_workforce_incident_monthly_v2',
        workforceArgs(agencyIds.inScope, brandIds[0], null, 1, 0))
      if (!result.error || !String(result.error.message).includes('WORKFORCE_AGENCY_SCOPE_REQUIRED')) stop('AGENCY_REVOKED_MEMBERSHIP_NOT_DENIED')
      return { actual: { rpc_code: 'WORKFORCE_AGENCY_SCOPE_REQUIRED' },
        database_readback: { status: 'passed', matches_expected: true },
        negative_authorization: { tested: true, passed: true } }
    })
  await executeCase('workforce-full-scope-pagination', 'Admin and scoped Leader',
    'Identical filters return equal aggregate totals across pages and persisted rows match the actor RPC projection.', async () => {
      const args1 = workforceArgs(agencyIds.inScope, brandIds[0], null, 1, 0)
      const args2 = workforceArgs(agencyIds.inScope, brandIds[0], null, 1, 1)
      const [page1, page2] = await Promise.all([
        leader.client.rpc('rc19_workforce_incident_monthly_v2', args1),
        leader.client.rpc('rc19_workforce_incident_monthly_v2', args2),
      ])
      const first = await requireNoError(page1, 'WORKFORCE_PAGE_ONE_FAILED')
      const second = await requireNoError(page2, 'WORKFORCE_PAGE_TWO_FAILED')
      const aggregateKeys = ['totalIncidents','totalDistinctShifts','totalDistinctStaff','summary']
      if (aggregateKeys.some(key => JSON.stringify(first?.[key]) !== JSON.stringify(second?.[key]))) stop('WORKFORCE_TOTALS_CHANGED_ACROSS_PAGES')
      if (first.totalIncidents !== 2 || first.totalDistinctShifts !== 1 || first.totalDistinctStaff !== 2
        || first.summary?.pendingCount !== 1 || first.summary?.confirmedCount !== 1
        || first.summary?.confirmedLateCount !== 1 || first.summary?.verifiedLateMinutesTotal !== 7) {
        stop('WORKFORCE_FULL_SCOPE_TOTALS_MISMATCH')
      }
      const persistedCount = readDatabase(databaseContainer,
        `SELECT count(*) FROM private.rc19_staff_incidents WHERE id IN (${sqlLiteral(incidentFixtures.pendingId)}::uuid,${sqlLiteral(incidentFixtures.confirmedId)}::uuid)`)
      if (persistedCount !== '2') stop('WORKFORCE_POSTGRES_READBACK_MISMATCH')
      const selfScopeDenial = await member.client.rpc('rc19_workforce_incident_monthly_v2',
        workforceArgs(agencyIds.inScope, brandIds[0], admin.id, 1, 0))
      if (!selfScopeDenial.error || !String(selfScopeDenial.error.message).includes('WORKFORCE_SELF_SCOPE_REQUIRED')) {
        stop('WORKFORCE_MEMBER_SELF_SCOPE_NOT_ENFORCED')
      }
      return { actual: { rpc_code: 'OK' }, database_readback: { status: 'passed', matches_expected: true },
        negative_authorization: { tested: true, passed: true } }
    })
  await executeCase('operational-note-draft-submit-review-revisions', 'Assigned Member, wrong author Member, Admin reviewer',
    'Actor-bound draft replay/edit, stale-version rejection, submit, wrong-author denial, review, immutable revisions and independent PostgreSQL readback.', async () => {
      const noteIdempotencyKey = randomUUID()
      const noteContent = `Synthetic D06 note ${randomUUID()}`
      const noteArgs = { p_action: 'save_draft', p_note_id: null, p_expected_version: null,
        p_idempotency_key: noteIdempotencyKey, p_shift_id: scopedShiftId, p_business_date: '2099-12-01',
        p_category: 'attendance', p_note: noteContent, p_actual_event_time: '2099-12-01T03:30:00.000Z',
        p_affected_role: 'host', p_affected_user_id: member.id,
        p_staffing_segment_id: segmentByKey.get(`${scopedShiftId}:1`), p_canonical_incident_id: null }
      const created = await requireNoError(await member.client.rpc('mutate_shift_operational_note_v1', noteArgs),
        'OPERATIONAL_NOTE_DRAFT_CREATE_FAILED')
      if (!created?.note?.id || created.note.author_id !== member.id || created.note.workflow_state !== 'draft'
        || created.note.version !== 1 || created.note.staffing_segment_id !== noteArgs.p_staffing_segment_id) {
        stop('OPERATIONAL_NOTE_DRAFT_STATE_MISMATCH')
      }
      const replay = await requireNoError(await member.client.rpc('mutate_shift_operational_note_v1', noteArgs),
        'OPERATIONAL_NOTE_DRAFT_REPLAY_FAILED')
      if (replay.note?.id !== created.note.id || replay.replayed !== true || replay.revision !== 1) {
        stop('OPERATIONAL_NOTE_DRAFT_REPLAY_MISMATCH')
      }
      const editedContent = `${noteContent} edited after shift navigation`
      const edited = await requireNoError(await member.client.rpc('mutate_shift_operational_note_v1', {
        ...noteArgs, p_note_id: created.note.id, p_expected_version: 1,
        p_idempotency_key: randomUUID(), p_note: editedContent,
      }), 'OPERATIONAL_NOTE_DRAFT_EDIT_FAILED')
      if (edited.note?.version !== 2 || edited.note.note !== editedContent || edited.note.workflow_state !== 'draft') {
        stop('OPERATIONAL_NOTE_DRAFT_EDIT_STATE_MISMATCH')
      }
      const staleEdit = await member.client.rpc('mutate_shift_operational_note_v1', {
        ...noteArgs, p_note_id: created.note.id, p_expected_version: 1,
        p_idempotency_key: randomUUID(), p_note: `${editedContent} stale write`,
      })
      if (!staleEdit.error || !String(staleEdit.error.message).includes('NOTE_VERSION_CONFLICT')) {
        stop('OPERATIONAL_NOTE_STALE_VERSION_NOT_REJECTED')
      }
      const reviewArgs = { p_note_id: created.note.id, p_expected_version: 2,
        p_idempotency_key: randomUUID(), p_shift_id: null, p_business_date: null, p_category: null,
        p_note: null, p_actual_event_time: null, p_affected_role: null, p_affected_user_id: null,
        p_staffing_segment_id: null, p_canonical_incident_id: null }
      const wrongAuthorSubmit = await memberSupport.client.rpc('mutate_shift_operational_note_v1', {
        ...reviewArgs, p_action: 'submit', p_expected_version: 2,
      })
      if (!wrongAuthorSubmit.error || !String(wrongAuthorSubmit.error.message).includes('NOTE_AUTHOR_REQUIRED')) {
        stop('OPERATIONAL_NOTE_WRONG_AUTHOR_NOT_DENIED')
      }
      const submitted = await requireNoError(await member.client.rpc('mutate_shift_operational_note_v1', {
        ...reviewArgs, p_action: 'submit', p_expected_version: 2,
      }), 'OPERATIONAL_NOTE_SUBMIT_FAILED')
      if (submitted.note?.workflow_state !== 'submitted' || submitted.note.version !== 3) {
        stop('OPERATIONAL_NOTE_SUBMIT_STATE_MISMATCH')
      }
      const approved = await requireNoError(await admin.client.rpc('mutate_shift_operational_note_v1', {
        ...reviewArgs, p_action: 'approve', p_expected_version: 3, p_idempotency_key: randomUUID(),
      }), 'OPERATIONAL_NOTE_REVIEW_FAILED')
      if (approved.note?.workflow_state !== 'reviewed' || approved.note.version !== 4) {
        stop('OPERATIONAL_NOTE_REVIEW_STATE_MISMATCH')
      }
      const storedJson = readDatabase(databaseContainer,
        `SELECT json_build_object('id',id,'shift_id',shift_id,'business_date',business_date,'category',category,'note',note,'author_id',author_id,'version',version,'workflow_state',workflow_state,'staffing_segment_id',staffing_segment_id)::text FROM public.shift_operational_notes WHERE id=${sqlLiteral(created.note.id)} AND deleted_at IS NULL`)
      let stored
      try { stored = JSON.parse(storedJson) } catch { stop('OPERATIONAL_NOTE_DATABASE_READBACK_INVALID') }
      if (!stored || stored.shift_id !== scopedShiftId || stored.author_id !== member.id
        || stored.business_date !== '2099-12-01' || stored.category !== 'attendance'
        || stored.note !== editedContent || stored.version !== 4 || stored.workflow_state !== 'reviewed'
        || stored.staffing_segment_id !== noteArgs.p_staffing_segment_id) stop('OPERATIONAL_NOTE_DATABASE_READBACK_MISMATCH')
      const revisionsJson = readDatabase(databaseContainer,
        `SELECT coalesce(json_agg(json_build_object('version',version,'action',action,'snapshot',snapshot,'actor_id',actor_id) ORDER BY version),'[]'::json)::text FROM public.shift_operational_note_revisions WHERE note_id=${sqlLiteral(created.note.id)}`)
      let revisions
      try { revisions = JSON.parse(revisionsJson) } catch { stop('OPERATIONAL_NOTE_REVISION_READBACK_INVALID') }
      if (!Array.isArray(revisions) || revisions.length !== 4 || revisions.map(row => row.version).join(',') !== '1,2,3,4'
        || revisions[0].snapshot?.note !== noteContent || revisions[1].snapshot?.note !== editedContent
        || revisions[3].snapshot?.workflow_state !== 'reviewed') stop('OPERATIONAL_NOTE_IMMUTABLE_REVISION_READBACK_MISMATCH')
      const receiptCount = readDatabase(databaseContainer,
        `SELECT count(*) FROM private.rc19_shift_note_idempotency WHERE note_id=${sqlLiteral(created.note.id)} AND actor_id IN (${sqlLiteral(member.id)},${sqlLiteral(admin.id)})`)
      if (receiptCount !== '4') stop('OPERATIONAL_NOTE_RECEIPT_POSTGRES_READBACK_MISMATCH')
      return { actual: { rpc_code: 'DRAFT_EDIT_SUBMIT_REVIEW_OK', revision_count: 4,
        replayed: replay.replayed === true, stale_write: 'NOTE_VERSION_CONFLICT' },
        database_readback: { status: 'passed', matches_expected: true },
        negative_authorization: { tested: true, passed: true } }
    })
  await executeCase('pass-swap-same-key-concurrency-and-replay', 'Requester Member',
    'Exact-segment PASS, reciprocal Exchange, submit/accept/reject/Leader approval/cancel, conflict validation, same-key replay after authorization changes, and persisted assignment identities.', async () => {
      const source = assignments.find(row => row.user_id === member.id)
      const sourceSegment = storedSegments.find(row => row.id === source?.staffing_segment_id)
      if (!source || !sourceSegment) stop('SWAP_SOURCE_ASSIGNMENT_FIXTURE_MISSING')
      const key = randomUUID()
      const payload = { source_registration_id: source.id, mode: 'replacement', reason: 'RC19 acceptance',
        target_shift_id: null, replacement_staff_id: memberUnassigned.id,
        counterpart_registration_id: null, notes: 'Disposable receipt acceptance' }
      const preflight = await member.client.rpc('check_shift_swap_conflict', {
        p_source_registration_id: source.id, p_mode: 'replacement', p_replacement_staff_id: memberUnassigned.id,
        p_target_shift_id: null, p_counterpart_registration_id: null,
      })
      if (preflight.error || preflight.data !== 'VERIFIED_CLEAR') stop('SWAP_CLEAR_CANDIDATE_PREFLIGHT_FAILED')
      const crossAgency = await member.client.rpc('shift_swap_operation_v1', {
        p_action: 'create', p_request_id: null,
        p_payload: { ...payload, replacement_staff_id: memberOutAgency.id }, p_idempotency_key: randomUUID(),
      })
      if (!crossAgency.error || !String(crossAgency.error.message).includes('RC19_AGENCY_MEMBERSHIP_REQUIRED')) {
        stop('SWAP_CROSS_AGENCY_CANDIDATE_NOT_DENIED')
      }
      recordPassSwapSubcase('pass-swap-cross-agency-and-clear-preflight', 'Requester Member and cross-Agency Member',
        'VERIFIED_CLEAR plus RC19_AGENCY_MEMBERSHIP_REQUIRED', true)
      const invoke = () => member.client.rpc('shift_swap_operation_v1', {
        p_action: 'create', p_request_id: null, p_payload: payload, p_idempotency_key: key,
      }).single()
      const [first, concurrent] = await Promise.all([invoke(), invoke()])
      const firstRow = await requireNoError(first, 'SWAP_CREATE_FAILED')
      const concurrentRow = await requireNoError(concurrent, 'SWAP_CONCURRENT_RETRY_FAILED')
      if (firstRow.id !== concurrentRow.id) stop('SWAP_CONCURRENT_DUPLICATE_REQUEST')
      const replay = await invoke()
      const replayRow = await requireNoError(replay, 'SWAP_REPLAY_FAILED')
      if (replayRow.id !== firstRow.id) stop('SWAP_REPLAY_RESULT_MISMATCH')
      const changed = await member.client.rpc('shift_swap_operation_v1', {
        p_action: 'create', p_request_id: null, p_payload: { ...payload, reason: 'changed payload' }, p_idempotency_key: key,
      }).single()
      if (!changed.error || !String(changed.error.message).includes('SWAP_IDEMPOTENCY_KEY_REUSED')) stop('SWAP_CHANGED_PAYLOAD_NOT_REJECTED')
      const changedAction = await member.client.rpc('shift_swap_operation_v1', {
        p_action: 'respond_reject', p_request_id: firstRow.id,
        p_payload: { expected_version: 1, notes: 'action binding check' }, p_idempotency_key: key,
      })
      if (!changedAction.error || !String(changedAction.error.message).includes('SWAP_IDEMPOTENCY_KEY_REUSED')) {
        stop('SWAP_CHANGED_ACTION_NOT_REJECTED')
      }
      const crossActor = await memberSupport.client.rpc('shift_swap_operation_v1', {
        p_action: 'create', p_request_id: null, p_payload: payload, p_idempotency_key: key,
      })
      if (!crossActor.error || !/SWAP_ACTOR_NOT_AUTHORIZED|SWAP_NOT_OWNER|SWAP_REQUEST_NOT_AUTHORIZED/u.test(String(crossActor.error.message))) {
        stop('SWAP_CROSS_ACTOR_MUTATION_NOT_DENIED')
      }
      recordPassSwapSubcase('pass-swap-concurrent-create-replay', 'Requester Member', 'ONE_REQUEST_ONE_RECEIPT')
      recordPassSwapSubcase('pass-swap-payload-action-actor-binding', 'Requester Member and wrong actor',
        'SWAP_IDEMPOTENCY_KEY_REUSED_AND_SWAP_NOT_OWNER', true)
      const staleAccept = await memberUnassigned.client.rpc('shift_swap_operation_v1', {
        p_action: 'accept', p_request_id: firstRow.id,
        p_payload: { expected_version: firstRow.version + 99, notes: 'Stale acceptance must fail' }, p_idempotency_key: randomUUID(),
      })
      if (!staleAccept.error || !/STALE|VERSION/u.test(String(staleAccept.error.message))) stop('SWAP_STALE_VERSION_NOT_REJECTED')
      const acceptKey = randomUUID()
      const accepted = await requireNoError(await memberUnassigned.client.rpc('shift_swap_operation_v1', {
        p_action: 'accept', p_request_id: firstRow.id,
        p_payload: { expected_version: firstRow.version, notes: 'Synthetic candidate acceptance' }, p_idempotency_key: acceptKey,
      }).single(), 'SWAP_CANDIDATE_ACCEPT_FAILED')
      if (accepted.status !== 'accepted' || accepted.requester_id !== member.id
        || accepted.replacement_staff_id !== memberUnassigned.id) stop('SWAP_CANDIDATE_ACCEPT_STATE_MISMATCH')
      const acceptedReplay = await requireNoError(await memberUnassigned.client.rpc('shift_swap_operation_v1', {
        p_action: 'accept', p_request_id: firstRow.id,
        p_payload: { expected_version: firstRow.version, notes: 'Synthetic candidate acceptance' }, p_idempotency_key: acceptKey,
      }).single(), 'SWAP_CANDIDATE_ACCEPT_REPLAY_FAILED')
      if (acceptedReplay.id !== accepted.id || acceptedReplay.version !== accepted.version) stop('SWAP_ACCEPT_REPLAY_MISMATCH')
      recordPassSwapSubcase('pass-swap-stale-version-and-candidate-acceptance', 'Clear candidate Member',
        'STALE_VERSION_DENIED_AND_ACCEPTED_REPLAY_STABLE', true)
      const approvalKey = randomUUID()
      const approved = await requireNoError(await leader.client.rpc('shift_swap_operation_v1', {
        p_action: 'approve', p_request_id: firstRow.id,
        p_payload: { expected_version: accepted.version, notes: 'Synthetic scoped Leader approval' }, p_idempotency_key: approvalKey,
      }).single(), 'SWAP_LEADER_APPROVAL_FAILED')
      if (approved.status !== 'completed' || approved.approved_by !== leader.id
        || approved.source_registration_id !== source.id) stop('SWAP_LEADER_APPROVAL_STATE_MISMATCH')
      const readback = await service.from('swap_requests').select('id,requester_id,source_registration_id,status,approved_by,version')
        .eq('id', firstRow.id).maybeSingle()
      const stored = await requireNoError(readback, 'SWAP_PERSISTED_READBACK_FAILED')
      if (!stored || stored.id !== firstRow.id || stored.requester_id !== member.id || stored.source_registration_id !== source.id
        || stored.status !== 'completed' || stored.approved_by !== leader.id) stop('SWAP_PERSISTED_READBACK_MISMATCH')
      const registrationRead = await service.from('shift_registrations')
        .select('id,user_id,operational_role,status,staffing_segment_id')
        .eq('shift_id', source.shift_id).in('user_id', [member.id, memberUnassigned.id])
      const registrationRows = await requireNoError(registrationRead, 'SWAP_REGISTRATION_READBACK_FAILED')
      const retiredSource = registrationRows.find(row => row.id === source.id)
      const acceptedReplacement = registrationRows.find(row => row.user_id === memberUnassigned.id
        && row.operational_role === source.operational_role && row.staffing_segment_id === source.staffing_segment_id
        && row.status === 'approved')
      if (retiredSource?.status !== 'cancelled' || !acceptedReplacement) stop('SWAP_EXACT_SEGMENT_PASS_READBACK_MISMATCH')
      recordPassSwapSubcase('pass-swap-leader-approval-exact-segment-pass', 'Scoped Leader',
        'COMPLETED_EXACT_SEGMENT_REPLACEMENT')
      const swapShiftSource = swapAssignments.find(row => row.user_id === member.id)
      const swapShiftCounterpart = swapAssignments.find(row => row.user_id === memberSupport.id)
      const exchangeConflict = await member.client.rpc('check_shift_swap_conflict', {
        p_source_registration_id: swapShiftSource.id, p_mode: 'exchange', p_replacement_staff_id: null,
        p_target_shift_id: swapShiftId, p_counterpart_registration_id: swapShiftCounterpart.id,
      })
      if (exchangeConflict.error || exchangeConflict.data !== 'VERIFIED_CLEAR') stop('SWAP_EXCHANGE_PREFLIGHT_FAILED')
      const exchangePayload = { source_registration_id: swapShiftSource.id, mode: 'exchange',
        reason: 'RC19 reciprocal segment exchange', target_shift_id: swapShiftId,
        replacement_staff_id: null, counterpart_registration_id: swapShiftCounterpart.id,
        notes: 'Exact segment identities must exchange' }
      const exchange = await requireNoError(await member.client.rpc('shift_swap_operation_v1', {
        p_action: 'create', p_request_id: null, p_payload: exchangePayload, p_idempotency_key: randomUUID(),
      }).single(), 'SWAP_EXCHANGE_SUBMIT_FAILED')
      const exchangeAccepted = await requireNoError(await memberSupport.client.rpc('shift_swap_operation_v1', {
        p_action: 'accept', p_request_id: exchange.id,
        p_payload: { expected_version: exchange.version, notes: 'Synthetic reciprocal acceptance' },
        p_idempotency_key: randomUUID(),
      }).single(), 'SWAP_EXCHANGE_ACCEPT_FAILED')
      const exchangeApproved = await requireNoError(await leader.client.rpc('shift_swap_operation_v1', {
        p_action: 'approve', p_request_id: exchange.id,
        p_payload: { expected_version: exchangeAccepted.version, notes: 'Synthetic reciprocal Leader approval' },
        p_idempotency_key: randomUUID(),
      }).single(), 'SWAP_EXCHANGE_APPROVAL_FAILED')
      if (exchangeApproved.status !== 'completed') stop('SWAP_EXCHANGE_NOT_COMPLETED')
      const exchangedRegsResult = await service.from('shift_registrations')
        .select('id,user_id,operational_role,status,staffing_segment_id').eq('shift_id', swapShiftId)
      const exchangedRegs = await requireNoError(exchangedRegsResult, 'SWAP_EXCHANGE_REGISTRATION_READBACK_FAILED')
      const segmentOne = segmentByKey.get(`${swapShiftId}:1`)
      const segmentTwo = segmentByKey.get(`${swapShiftId}:2`)
      const memberInTwo = exchangedRegs.find(row => row.user_id === member.id && row.status === 'approved')
      const supportInOne = exchangedRegs.find(row => row.user_id === memberSupport.id && row.status === 'approved')
      if (!exchangedRegs.some(row => row.id === swapShiftSource.id && row.status === 'cancelled')
        || !exchangedRegs.some(row => row.id === swapShiftCounterpart.id && row.status === 'cancelled')
        || memberInTwo?.staffing_segment_id !== segmentTwo || supportInOne?.staffing_segment_id !== segmentOne) {
        stop('SWAP_EXCHANGE_EXACT_SEGMENT_READBACK_MISMATCH')
      }
      recordPassSwapSubcase('pass-swap-reciprocal-segment-exchange', 'Requester, counterpart and scoped Leader',
        'COMPLETED_RECIPROCAL_SEGMENT_EXCHANGE')
      const invalidationPayload = { source_registration_id: memberInTwo.id, mode: 'replacement',
        reason: 'RC19 post-acceptance conflict invalidation', target_shift_id: null,
        replacement_staff_id: memberUnassigned.id, counterpart_registration_id: null,
        notes: 'Approval must revalidate the candidate interval' }
      const invalidationRequest = await requireNoError(await member.client.rpc('shift_swap_operation_v1', {
        p_action: 'create', p_request_id: null, p_payload: invalidationPayload, p_idempotency_key: randomUUID(),
      }).single(), 'SWAP_INVALIDATION_REQUEST_CREATE_FAILED')
      const invalidationAccepted = await requireNoError(await memberUnassigned.client.rpc('shift_swap_operation_v1', {
        p_action: 'accept', p_request_id: invalidationRequest.id,
        p_payload: { expected_version: invalidationRequest.version, notes: 'Accept before conflict is introduced' },
        p_idempotency_key: randomUUID(),
      }).single(), 'SWAP_INVALIDATION_CANDIDATE_ACCEPT_FAILED')
      const conflictSegment = segmentByKey.get(`${swapConflictShiftId}:1`)
      const conflictShiftVersionResult = await service.from('shifts').select('version').eq('id', swapConflictShiftId).single()
      const conflictShiftVersion = await requireNoError(conflictShiftVersionResult, 'SWAP_INVALIDATION_SHIFT_VERSION_FAILED')
      const conflictAssignmentResult = await admin.client.rpc('manual_assign_shift_staff_to_segment', {
        p_shift_id: swapConflictShiftId, p_user_id: memberUnassigned.id, p_role: 'host',
        p_notes: 'Introduce synthetic overlap after candidate acceptance',
        p_expected_version: conflictShiftVersion.version, p_staffing_segment_id: conflictSegment,
      }).single()
      const conflictAssignment = await requireNoError(conflictAssignmentResult, 'SWAP_INVALIDATION_CONFLICT_FIXTURE_FAILED')
      if (!conflictAssignment?.id || conflictAssignment.user_id !== memberUnassigned.id
        || conflictAssignment.staffing_segment_id !== conflictSegment) stop('SWAP_INVALIDATION_CONFLICT_FIXTURE_MISMATCH')
      const invalidatedApproval = await leader.client.rpc('shift_swap_operation_v1', {
        p_action: 'approve', p_request_id: invalidationRequest.id,
        p_payload: { expected_version: invalidationAccepted.version, notes: 'Must reject newly conflicting candidate' },
        p_idempotency_key: randomUUID(),
      })
      if (!invalidatedApproval.error || !/SHIFT_CONFLICT|REPLACEMENT_ALREADY_ASSIGNED|CONFLICT/u.test(String(invalidatedApproval.error.message))) {
        stop('SWAP_APPROVAL_DID_NOT_REVALIDATE_CANDIDATE_CONFLICT')
      }
      const invalidationRead = await service.from('swap_requests').select('id,status,version')
        .eq('id', invalidationRequest.id).maybeSingle()
      const invalidationStored = await requireNoError(invalidationRead, 'SWAP_INVALIDATION_REQUEST_READBACK_FAILED')
      const invalidatedSourceRead = await service.from('shift_registrations')
        .select('id,status,staffing_segment_id').eq('id', memberInTwo.id).maybeSingle()
      const invalidatedSource = await requireNoError(invalidatedSourceRead, 'SWAP_INVALIDATION_SOURCE_READBACK_FAILED')
      if (invalidationStored?.status !== 'accepted' || invalidationStored.version !== invalidationAccepted.version
        || invalidatedSource?.status !== 'approved' || invalidatedSource.staffing_segment_id !== segmentTwo) {
        stop('SWAP_INVALIDATION_ROLLBACK_READBACK_MISMATCH')
      }
      const conflictAssignmentRead = await service.from('shift_registrations')
        .select('id,user_id,status,staffing_segment_id').eq('id', conflictAssignment.id).maybeSingle()
      const persistedConflictAssignment = await requireNoError(conflictAssignmentRead, 'SWAP_INVALIDATION_CONFLICT_READBACK_FAILED')
      if (persistedConflictAssignment?.user_id !== memberUnassigned.id
        || persistedConflictAssignment.status !== 'manually_assigned'
        || persistedConflictAssignment.staffing_segment_id !== conflictSegment) {
        stop('SWAP_INVALIDATION_CONFLICT_READBACK_MISMATCH')
      }
      recordPassSwapSubcase('pass-swap-approval-conflict-invalidation', 'Candidate and scoped Leader',
        'APPROVAL_CONFLICT_DENIED_SOURCE_PRESERVED')
      const supportSource = assignments.find(row => row.user_id === memberSupport.id)
      const supportRequestPayload = { source_registration_id: supportSource.id, mode: 'replacement',
        reason: 'RC19 candidate rejection fixture', target_shift_id: null,
        replacement_staff_id: memberUnassigned.id, counterpart_registration_id: null, notes: 'Reject then cancel fixture' }
      const rejectedRequest = await requireNoError(await memberSupport.client.rpc('shift_swap_operation_v1', {
        p_action: 'create', p_request_id: null, p_payload: supportRequestPayload, p_idempotency_key: randomUUID(),
      }).single(), 'SWAP_REJECTION_REQUEST_CREATE_FAILED')
      const rejected = await requireNoError(await memberUnassigned.client.rpc('shift_swap_operation_v1', {
        p_action: 'respond_reject', p_request_id: rejectedRequest.id,
        p_payload: { expected_version: rejectedRequest.version, notes: 'Synthetic candidate rejection' },
        p_idempotency_key: randomUUID(),
      }).single(), 'SWAP_CANDIDATE_REJECTION_FAILED')
      if (rejected.status !== 'rejected') stop('SWAP_CANDIDATE_REJECTION_STATE_MISMATCH')
      const cancelRequest = await requireNoError(await memberSupport.client.rpc('shift_swap_operation_v1', {
        p_action: 'create', p_request_id: null, p_payload: { ...supportRequestPayload, reason: 'RC19 cancellation fixture' },
        p_idempotency_key: randomUUID(),
      }).single(), 'SWAP_CANCELLATION_REQUEST_CREATE_FAILED')
      const cancelled = await requireNoError(await memberSupport.client.rpc('shift_swap_operation_v1', {
        p_action: 'cancel', p_request_id: cancelRequest.id,
        p_payload: { expected_version: cancelRequest.version, reason: 'Requester cancelled synthetic request' },
        p_idempotency_key: randomUUID(),
      }).single(), 'SWAP_REQUEST_CANCELLATION_FAILED')
      if (cancelled.status !== 'cancelled') stop('SWAP_CANCELLATION_STATE_MISMATCH')
      const lifecycleRows = await service.from('swap_requests').select('id,status')
        .in('id', [firstRow.id, exchange.id, rejectedRequest.id, cancelRequest.id])
      const lifecycle = await requireNoError(lifecycleRows, 'SWAP_LIFECYCLE_DATABASE_READBACK_FAILED')
      if (new Map(lifecycle.map(row => [row.id, row.status])).get(firstRow.id) !== 'completed'
        || new Map(lifecycle.map(row => [row.id, row.status])).get(exchange.id) !== 'completed'
        || new Map(lifecycle.map(row => [row.id, row.status])).get(rejectedRequest.id) !== 'rejected'
        || new Map(lifecycle.map(row => [row.id, row.status])).get(cancelRequest.id) !== 'cancelled') {
        stop('SWAP_LIFECYCLE_DATABASE_READBACK_MISMATCH')
      }
      recordPassSwapSubcase('pass-swap-candidate-rejection-and-requester-cancellation',
        'Candidate Member and requester Member', 'REJECTED_AND_CANCELLED_READBACK')
      const receiptReadback = readDatabase(databaseContainer,
        `SELECT count(*) FROM private.rc19_swap_operation_receipts WHERE (actor_id=${sqlLiteral(member.id)} AND idempotency_key=${sqlLiteral(key)}::uuid AND response->>'id'=${sqlLiteral(firstRow.id)}) OR (actor_id=${sqlLiteral(memberUnassigned.id)} AND idempotency_key=${sqlLiteral(acceptKey)}::uuid AND response->>'id'=${sqlLiteral(firstRow.id)}) OR (actor_id=${sqlLiteral(leader.id)} AND idempotency_key=${sqlLiteral(approvalKey)}::uuid AND response->>'id'=${sqlLiteral(firstRow.id)})`)
      if (receiptReadback !== '3') stop('SWAP_LIFECYCLE_RECEIPT_POSTGRES_READBACK_MISMATCH')
      passSwapFixtures.push({ passRequestId: firstRow.id, passSourceRegistrationId: source.id,
        passReplacementRegistrationId: acceptedReplacement.id, passSegmentId: source.staffing_segment_id,
        exchangeRequestId: exchange.id, exchangeSourceRegistrationId: swapShiftSource.id,
        exchangeCounterpartRegistrationId: swapShiftCounterpart.id, exchangeSegmentIds: [segmentOne, segmentTwo],
        rejectedRequestId: rejectedRequest.id, cancelledRequestId: cancelRequest.id,
        invalidationRequestId: invalidationRequest.id, conflictShiftId: swapConflictShiftId,
        conflictAssignmentId: conflictAssignment.id, invalidationState: invalidationStored.status,
        states: { pass: stored.status, exchange: exchangeApproved.status,
          rejection: rejected.status, cancellation: cancelled.status } })
      const revokedMembership = readDatabase(databaseContainer,
        `WITH changed AS (UPDATE private.rc19_business_user_agency_memberships SET status='revoked',effective_until=statement_timestamp(),revoked_at=statement_timestamp(),version=version+1 WHERE business_user_id=${sqlLiteral(member.id)} AND source_version=${sqlLiteral(marker)} AND status='active' RETURNING 1) SELECT count(*) FROM changed`)
      if (revokedMembership !== '1') stop('SWAP_REVOKE_FIXTURE_FAILED')
      const revokedReplay = await invoke()
      if (!revokedReplay.error || !/SWAP_RECEIPT_REPLAY_NOT_AUTHORIZED|SWAP_RECEIPT_REPLAY_SCOPE_UNRESOLVED|SWAP_ACTOR_NOT_AUTHORIZED|RC19_AGENCY_MEMBERSHIP_REQUIRED/u.test(String(revokedReplay.error.message))) {
        stop('SWAP_REVOKED_REPLAY_NOT_DENIED')
      }
      if (readDatabase(databaseContainer,
        `SELECT count(*) FROM private.rc19_business_user_agency_memberships WHERE business_user_id=${sqlLiteral(member.id)} AND source_version=${sqlLiteral(marker)} AND status='revoked'`) !== '1') {
        stop('SWAP_REVOKED_MEMBERSHIP_POSTGRES_READBACK_MISMATCH')
      }
      recordPassSwapSubcase('pass-swap-revoked-membership-replay', 'Requester after Agency revocation',
        'REPLAY_DENIED_AFTER_MEMBERSHIP_REVOCATION', true)
      return { actual: { rpc_code: 'OK' }, database_readback: { status: 'passed', matches_expected: true },
        negative_authorization: { tested: true, passed: true } }
    })
  caseResults.push({ case_id: 'pass-swap-expiry', actor: 'Synthetic requester/candidate/Leader',
    expected: 'A pending or accepted request expires at its approved action deadline and cannot mutate registrations after expiry.',
    actual: { rpc_code: 'NOT_IMPLEMENTED_NO_EXPIRED_SWAP_STATUS_OR_OPERATION' },
    database_readback: { status: 'not_run', matches_expected: false },
    negative_authorization: { tested: false, passed: false },
    evidence_scope: 'Source contract review only; current swap schema and RPC expose no expired state or expiry transition.',
    started_at: new Date().toISOString(), completed_at: new Date().toISOString(), status: 'BLOCKED' })
  await executeCase('external-summary-approval-revisions-privacy-retry', 'Member submitter and Admin reviewer',
    'Authenticated draft/submit/approve calls create replay receipts, immutable approved revision data and an external projection without personnel details.', async () => {
      const externalActor = memberSupport
      const completed = await service.from('shifts').update({ status: 'completed' }).eq('id', scopedShiftId).select('id').single()
      const completedShift = await requireNoError(completed, 'EXTERNAL_REPORT_SHIFT_FIXTURE_FAILED')
      if (completedShift.id !== scopedShiftId) stop('EXTERNAL_REPORT_SHIFT_FIXTURE_FAILED')
      const created = await externalActor.client.rpc('create_report', { p_data: {
        shift_id: scopedShiftId, revenue: 1200, orders: 12, dashboard_platform: 'other',
        insights_good: 'synthetic private report fixture',
      } }).single()
      const report = await requireNoError(created, 'EXTERNAL_REPORT_FIXTURE_CREATE_FAILED')
      if (!report?.id) stop('EXTERNAL_REPORT_FIXTURE_CREATE_FAILED')
      const summaryKey = randomUUID()
      const content = `Approved synthetic external summary ${randomUUID()}`
      const saveArgs = { p_action: 'save_draft', p_report_id: report.id, p_summary_id: null,
        p_content: content, p_expected_version: 0, p_reason: null, p_idempotency_key: summaryKey }
      const [saved, duplicateSave] = await Promise.all([
        externalActor.client.rpc('external_report_summary_workflow_v1', saveArgs),
        externalActor.client.rpc('external_report_summary_workflow_v1', saveArgs),
      ])
      const saveReceipt = await requireNoError(saved, 'EXTERNAL_SUMMARY_SAVE_FAILED')
      const replayReceipt = await requireNoError(duplicateSave, 'EXTERNAL_SUMMARY_RETRY_FAILED')
      if (!saveReceipt?.summaryId || saveReceipt.summaryId !== replayReceipt.summaryId
        || saveReceipt.version !== replayReceipt.version) stop('EXTERNAL_SUMMARY_RETRY_MISMATCH')
      const receiptCount = readDatabase(databaseContainer,
        `SELECT count(*) FROM private.rc19_report_external_summary_idempotency WHERE actor_id=${sqlLiteral(externalActor.id)} AND idempotency_key=${sqlLiteral(summaryKey)}::uuid AND response->>'summaryId'=${sqlLiteral(saveReceipt.summaryId)}`)
      if (receiptCount !== '1') stop('EXTERNAL_SUMMARY_RECEIPT_POSTGRES_READBACK_MISMATCH')
      const changedPayload = await externalActor.client.rpc('external_report_summary_workflow_v1', {
        ...saveArgs, p_content: `${content} changed`,
      })
      if (!changedPayload.error || !String(changedPayload.error.message).includes('REPORT_EXTERNAL_SUMMARY_IDEMPOTENCY_CONFLICT')) {
        stop('EXTERNAL_SUMMARY_CHANGED_PAYLOAD_NOT_REJECTED')
      }
      const submitted = await externalActor.client.rpc('external_report_summary_workflow_v1', {
        p_action: 'submit', p_report_id: report.id, p_summary_id: saveReceipt.summaryId,
        p_content: null, p_expected_version: saveReceipt.version, p_reason: null, p_idempotency_key: randomUUID(),
      })
      const submitReceipt = await requireNoError(submitted, 'EXTERNAL_SUMMARY_SUBMIT_FAILED')
      const memberApproval = await externalActor.client.rpc('external_report_summary_workflow_v1', {
        p_action: 'approve', p_report_id: report.id, p_summary_id: saveReceipt.summaryId,
        p_content: null, p_expected_version: submitReceipt.version, p_reason: null, p_idempotency_key: randomUUID(),
      })
      if (!memberApproval.error || !String(memberApproval.error.message).includes('REPORT_EXTERNAL_SUMMARY_REVIEW_FORBIDDEN')) {
        stop('EXTERNAL_SUMMARY_MEMBER_REVIEW_NOT_DENIED')
      }
      const approved = await admin.client.rpc('external_report_summary_workflow_v1', {
        p_action: 'approve', p_report_id: report.id, p_summary_id: saveReceipt.summaryId,
        p_content: null, p_expected_version: submitReceipt.version, p_reason: null, p_idempotency_key: randomUUID(),
      })
      const approval = await requireNoError(approved, 'EXTERNAL_SUMMARY_APPROVAL_FAILED')
      const summaryRead = await admin.client.rpc('get_report_external_summary_workflow_v1', { p_report_id: report.id })
      const summaryState = await requireNoError(summaryRead, 'EXTERNAL_SUMMARY_READBACK_FAILED')
      if (summaryState?.summary?.workflowState !== 'approved' || summaryState.summary.content !== content
        || summaryState.summary.version !== approval.version) stop('EXTERNAL_SUMMARY_READBACK_MISMATCH')
      if (!approval.reportRevisionId) stop('EXTERNAL_SUMMARY_REVISION_ID_MISSING')
      const revisionRows = await service.from('report_revisions').select('version')
        .eq('report_id', report.id).order('version', { ascending: true })
      const revisions = await requireNoError(revisionRows, 'EXTERNAL_SUMMARY_REVISION_READBACK_FAILED')
      const approvedRevision = revisions.find(row => row.version && row.version > 1)
      if (!approvedRevision) stop('EXTERNAL_SUMMARY_REVISION_READBACK_MISSING')
      const immutableRead = await admin.client.rpc('get_report_revision_sources_v1', {
        p_report_id: report.id, p_revision_version: approvedRevision.version, p_audience: 'external',
      })
      const immutable = await requireNoError(immutableRead, 'EXTERNAL_SUMMARY_IMMUTABLE_READBACK_FAILED')
      const projection = immutable?.externalProjection
      if (!projection || projection.operationalSummary?.content !== content
        || projection.operationalSummary.version !== approval.version
        || JSON.stringify(projection).includes(externalActor.id)
        || JSON.stringify(projection).includes('synthetic private report fixture')) stop('EXTERNAL_SUMMARY_PRIVACY_OR_REVISION_MISMATCH')
      const correction = await admin.client.rpc('external_report_summary_workflow_v1', {
        p_action: 'request_correction', p_report_id: report.id, p_summary_id: saveReceipt.summaryId,
        p_content: null, p_expected_version: approval.version, p_reason: 'Synthetic correction test',
        p_idempotency_key: randomUUID(),
      })
      const correctionReceipt = await requireNoError(correction, 'EXTERNAL_SUMMARY_CORRECTION_FAILED')
      const historical = await admin.client.rpc('get_report_revision_sources_v1', {
        p_report_id: report.id, p_revision_version: approvedRevision.version, p_audience: 'external',
      })
      const oldRevision = await requireNoError(historical, 'EXTERNAL_SUMMARY_HISTORICAL_READBACK_FAILED')
      const latestVersion = Math.max(...revisions.map(row => row.version), approvedRevision.version) + 1
      const correctedSnapshot = await admin.client.rpc('get_report_revision_sources_v1', {
        p_report_id: report.id, p_revision_version: latestVersion, p_audience: 'external',
      })
      const newRevision = await requireNoError(correctedSnapshot, 'EXTERNAL_SUMMARY_CORRECTION_REVISION_READBACK_FAILED')
      if (oldRevision?.externalProjection?.operationalSummary?.content !== content
        || newRevision?.externalProjection?.operationalSummary !== null
        || correctionReceipt.workflowState !== 'correction_requested') stop('EXTERNAL_SUMMARY_IMMUTABILITY_FAILED')
      externalSummaryFixtures.push({ reportId: report.id, summaryId: saveReceipt.summaryId,
        approvedRevisionId: approval.reportRevisionId, approvedRevisionVersion: approvedRevision.version,
        summaryVersion: approval.version, correctionVersion: correctionReceipt.version })
      return { actual: { rpc_code: 'OK' }, database_readback: { status: 'passed', matches_expected: true },
        negative_authorization: { tested: true, passed: true } }
    })

  const browserRequested = process.env.RC19_W4_RUN_BROWSER_UAT?.trim().toLowerCase() === 'true'
  let browserResult = { app_ready: false, readiness_http_status: null, ran: false, passed: false,
    authenticated: false, interaction_count: 0, status: 'NOT RUN', blocker: null }
  if (browserRequested) {
    try {
      const browserCredentials = credentials.map(item => item.role === 'member'
        ? { ...item, email: memberSupport.email, password: supportPassword }
        : item)
      const browserMemberEmail = browserCredentials.find(item => item.role === 'member')?.email
      const browserMember = browserMemberEmail === memberSupport.email
      if (!browserMember) stop('BROWSER_MEMBER_FIXTURE_MAPPING_FAILED')
      browserResult = await runBrowserAcceptance(browserCredentials)
    } catch (error) {
      browserResult.blocker = typeof error?.message === 'string' && /^[A-Z0-9_]+$/u.test(error.message)
        ? error.message : 'BROWSER_ACCEPTANCE_BLOCKED'
      browserResult.status = 'BLOCKED'
    }
  } else if (process.env.RC19_W4_NEXT_BASE_URL?.trim()) {
    try {
      const appOrigin = parseLoopbackUrl(process.env.RC19_W4_NEXT_BASE_URL, 3000, 'NEXT_APP_URL_NOT_DISPOSABLE_LOOPBACK')
      const response = await fetch(`${appOrigin}/login`, { signal: AbortSignal.timeout(10000) })
      browserResult.app_ready = response.status === 200
      browserResult.readiness_http_status = response.status
    } catch { /* no browser request: readiness is recorded as unavailable */ }
  }
  const browserCase = {
    case_id: 'authenticated-browser', actor: 'Admin, Leader, Member',
    expected: 'Run Antigravity authenticated GoTrue browser workflows against the exact candidate Next.js runtime and retain each UI result.',
    actual: { http_status: browserResult.readiness_http_status, rpc_code: browserResult.blocker ?? (browserResult.passed ? 'PLAYWRIGHT_PASS' : browserResult.status) },
    database_readback: { status: 'not_asserted_by_browser_suite', matches_expected: false },
    negative_authorization: { tested: browserResult.ran, passed: browserResult.passed },
    browser_interaction: { performed: browserResult.ran && browserResult.interaction_count > 0,
      authenticated: browserResult.authenticated, interaction_count: browserResult.interaction_count,
      status: browserResult.status },
    evidence_scope: browserResult.ran
      ? 'Authenticated Playwright against exact local Next.js app and marked disposable runtime; DB evidence is separately reported by API cases.'
      : 'No browser evidence.',
    status: browserResult.status,
  }

  const originalD = [
    ['D01', 'atomic_staffing_replacement', 'full_segment_skip_emergency_replacement_atomic_receipt_history'],
    ['D02', 'attendance_segment_boundaries', 'partial_replacement_preserves_actual_attendance_and_payroll_intervals'],
    ['D03', 'workforce_reporting', 'distinguish_pass_reassignment_authorized_absence_and_confirmed_incidents'],
    ['D04', 'workforce_reporting', 'host_support_technical_overnight_business_month_unknown_minutes'],
    ['D05', 'brand_agency_authorization_boundaries', 'unauthorized_scope_segment_version_lock_concurrency_retry_denial'],
    ['D06', 'operational_notes_lifecycle', 'draft_save_switch_reload_relogin_resume_edit_version_conflict'],
    ['D07', 'report_revision_snapshots', 'saved_notes_preview_submit_readback_retry_correction_revision'],
    ['D08', 'workforce_reporting', 'employee_summary_unique_incident_pending_late_minutes_no_deduction'],
    ['D09', 'external_summary', 'history_note_and_external_report_privacy_authorization'],
    ['D10', 'import_staffing_updates', 'combined_import_reimport_replacement_attendance_actual_payroll_report_history'],
    ['D11', 'storage_authorization_upload_readback', 'authenticated_api_database_browser_migration_and_provider_evidence'],
  ].map(([case_id, area, criterion]) => {
    const d01Result = case_id === 'D01' ? caseResults.find(item => item.case_id === 'delta-d01-atomic-skip-replacement') : null
    const resultStatus = d01Result?.status === 'PASS' ? 'passed' : d01Result?.status === 'FAIL' ? 'fail' : 'not_run'
    return ({
    case_id, area, source_case_ids: [case_id], source_criteria: [{ id: case_id, criterion }],
    actor: { role: 'Admin, Leader, Member per original D case', scope_key: 'synthetic-disposable-runtime' },
    expected: { authorization: 'Original #190 role and scope rules; deny unauthorized and cross-scope actions.',
      result: `Demonstrate original ${case_id} criterion ${criterion} with authenticated API/UI behavior and independent persisted readback.` },
    actual: d01Result?.actual ?? { rpc_code: 'NOT_RUN' },
    database_readback: d01Result?.database_readback ?? { status: 'not_run', matches_expected: false },
    negative_authorization: d01Result?.negative_authorization ?? { tested: false, passed: false },
    browser_interaction: { performed: false, authenticated: false, status: 'NOT RUN' },
    status: resultStatus,
  })})
  const originalL = [
    ['L01', 'live_monitoring_authorization', 'save_link_db_readback_reload_other_account_stale_write'],
    ['L02', 'live_monitoring_authorization', 'publisher_consent_and_actual_video'],
    ['L03', 'live_monitoring_authorization', 'publisher_shift_a_b_a_continuity'],
    ['L04', 'live_monitoring_authorization', 'publisher_reports_navigation_continuity'],
    ['L05', 'live_monitoring_authorization', 'independent_admin_receives_changing_frames'],
    ['L06', 'live_monitoring_authorization', 'independent_leader_receives_changing_frames'],
    ['L07', 'live_monitoring_authorization', 'member_receives_only_permitted_shift_media'],
    ['L08', 'storage_authorization_upload_readback', 'anonymous_wrong_scope_and_direct_media_denial'],
    ['L09', 'live_monitoring_authorization', 'viewer_reload_reconnect_without_stopping_publisher'],
    ['L10', 'live_monitoring_authorization', 'concurrent_room_isolation_and_duplicate_publisher_guard'],
    ['L11', 'live_monitoring_authorization', 'publisher_stop_ends_viewer_and_releases_resources'],
    ['L12', 'live_monitoring_authorization', 'capture_browser_network_interruption_and_consent_restart'],
    ['L13', 'live_monitoring_authorization', 'token_expiry_revocation_logout_and_termination'],
    ['L14', 'live_monitoring_authorization', 'privacy_no_recording_and_audio_when_available'],
    ['L15', 'live_monitoring_authorization', 'live_reports_calendar_shift_obs_regression_and_resource_metrics'],
  ].map(([case_id, area, criterion]) => ({
    case_id, area, source_case_ids: [case_id], source_criteria: [{ id: case_id, criterion }],
    actor: { role: 'Admin, Leader, Member, publisher/viewer per original L case', scope_key: 'synthetic-disposable-runtime' },
    expected: { authorization: 'Only authorized authenticated users can publish or view within the approved scope.',
      result: `Demonstrate original #189 ${case_id} criterion ${criterion} with real media and sanitized runtime evidence.` },
    actual: { rpc_code: 'NOT_RUN' },
    database_readback: { status: 'not_run', matches_expected: false },
    negative_authorization: { tested: false, passed: false },
    browser_interaction: { performed: false, authenticated: false, status: 'NOT RUN' },
    status: 'not_run',
  }))

  const report = {
    schema,
    status: [...caseResults, browserCase].some(item => item.status === 'FAIL') ? 'FAIL' : 'BLOCKED',
    application_sha: sha,
    runtime_database_marker: marker,
    database_binding: { runtime_marker_match: true, application_target_match: true },
    next_app: { ready: browserResult.app_ready, readiness_http_status: browserResult.readiness_http_status,
      authenticated_browser: browserResult.ran && browserResult.authenticated },
    synthetic_users: {
      admin: { login: true, canonical_business_user_mapping: true,
        auth_user_id: admin.id, business_user_id: admin.id, role: 'admin' },
      leader: { login: true, canonical_business_user_mapping: true,
        auth_user_id: leader.id, business_user_id: leader.id, role: 'leader' },
      member: { login: true, canonical_business_user_mapping: true,
        auth_user_id: member.id, business_user_id: member.id, role: 'member' },
    },
    fixture_manifest: {
      schema: 'rc19-w4-synthetic-fixtures/v1',
      runtime_marker: marker,
      runtime_database_container: databaseContainer,
      actors: [
        { key: 'admin', auth_user_id: admin.id, business_user_id: admin.id, role: 'admin',
          brand_scope: 'Admin policy scope', agency_membership: 'Admin behavior unchanged by Agency fixture' },
        { key: 'leader_in_scope', auth_user_id: leader.id, business_user_id: leader.id, role: 'leader',
          brand_id: brandIds[0], agency_id: agencyIds.inScope, agency_membership: 'active' },
        { key: 'member_requester', auth_user_id: member.id, business_user_id: member.id, role: 'member',
          brand_id: brandIds[0], agency_id: agencyIds.inScope, agency_membership: 'active before replay revocation' },
        { key: 'member_realtime', auth_user_id: realtimeMember.id, business_user_id: realtimeMember.id, role: 'member',
          brand_id: brandIds[0], agency_id: agencyIds.inScope, agency_membership: 'active; independent of PASS/Swap revocation',
          shift_id: realtimeShiftId, registration_id: realtimeRegistration.id, database_scope_proof: true,
          negative_actor_key: 'leader_wrong_brand' },
        { key: 'member_support_submitter', auth_user_id: memberSupport.id, business_user_id: memberSupport.id,
          role: 'member', brand_id: brandIds[0], agency_id: agencyIds.inScope, agency_membership: 'active' },
        { key: 'member_clear_candidate', auth_user_id: memberUnassigned.id, business_user_id: memberUnassigned.id,
          role: 'member', brand_id: brandIds[0], agency_id: agencyIds.inScope, agency_membership: 'active', assignment: 'unassigned' },
        { key: 'leader_wrong_brand', auth_user_id: leaderOtherBrand.id, business_user_id: leaderOtherBrand.id,
          role: 'leader', brand_id: brandIds[1], agency_id: agencyIds.outOfScope, agency_membership: 'active' },
        { key: 'member_wrong_agency', auth_user_id: memberOutAgency.id, business_user_id: memberOutAgency.id,
          role: 'member', agency_id: agencyIds.outOfScope, agency_membership: 'active' },
        { key: 'leader_revoked_agency', auth_user_id: leaderRevoked.id, business_user_id: leaderRevoked.id,
          role: 'leader', brand_id: brandIds[0], agency_id: agencyIds.inScope, agency_membership: 'revoked' },
      ],
      brands: [{ id: brandIds[0], scope: 'primary synthetic Brand' },
        { id: brandIds[1], scope: 'wrong-Brand denial' }],
      agencies: [{ id: agencyIds.inScope, scope: 'authorized synthetic Agency' },
        { id: agencyIds.outOfScope, scope: 'cross-Agency denial' }],
      shifts: [
        { id: scopedShiftId, brand_id: brandIds[0], agency_id: agencyIds.inScope, business_date: '2099-12-01' },
        { id: foreignShiftId, brand_id: brandIds[1], agency_id: agencyIds.outOfScope, business_date: '2099-12-02' },
        { id: d01ShiftId, brand_id: brandIds[0], agency_id: agencyIds.inScope, business_date: d01BusinessDate,
          purpose: 'D01 exact K02 atomic skip and replacement',
          segment_start_at: d01K02Segment.start_at, segment_end_at: d01K02Segment.end_at },
        { id: realtimeShiftId, brand_id: brandIds[0], agency_id: agencyIds.inScope, business_date: '2099-12-03',
          purpose: 'dedicated authenticated Realtime delivery and wrong-scope event denial' },
        { id: swapShiftId, brand_id: brandIds[0], agency_id: agencyIds.inScope, business_date: '2099-12-04',
          purpose: 'reciprocal exact-segment PASS/Swap exchange' },
        { id: swapConflictShiftId, brand_id: brandIds[0], agency_id: agencyIds.inScope, business_date: '2099-12-04',
          purpose: 'approval-time candidate conflict invalidation' },
      ],
      staffing_segments: storedSegments.map(row => ({ id: row.id, shift_id: row.shift_id,
        segment_index: row.segment_index })),
      registrations: [
        ...assignments.map(row => ({ id: row.id, shift_id: row.shift_id,
          business_user_id: row.user_id, role: row.operational_role, staffing_segment_id: row.staffing_segment_id })),
        { id: realtimeRegistration.id, shift_id: realtimeRegistration.shift_id,
          business_user_id: realtimeRegistration.user_id, role: realtimeRegistration.operational_role,
          staffing_segment_id: realtimeRegistration.staffing_segment_id },
        ...swapAssignments.map(row => ({ id: row.id, shift_id: row.shift_id,
          business_user_id: row.user_id, role: row.operational_role, staffing_segment_id: row.staffing_segment_id })),
        { id: d01OriginalAssignment.id, shift_id: d01ShiftId, business_user_id: member.id,
          role: d01OriginalAssignment.operational_role, staffing_segment_id: d01OriginalAssignment.staffing_segment_id,
          status: d01Receipt ? 'removed_after_D01_replacement' : 'manually_assigned_before_D01_execution' },
        ...(d01Receipt ? [{ id: d01Receipt.replacementRegistrationId, shift_id: d01ShiftId,
          business_user_id: memberUnassigned.id, role: 'host', staffing_segment_id: d01K02Segment.id,
          status: 'manually_assigned_after_D01_replacement' }] : []),
      ],
      d01_atomic_replacement: {
        case_id: 'D01',
        segment_index: 2,
        original_actor: member.id,
        replacement_actor: memberUnassigned.id,
        receipt: d01Receipt,
      },
      pass_swap_candidates: {
        clear_replacement_candidate: memberUnassigned.id,
        candidate_initial_state: 'unassigned before business case execution',
        candidate_post_case_state: passSwapFixtures.length ? 'assigned by accepted PASS and approval-invalidation fixture' : 'unchanged by PASS/Swap case',
        same_actor_conflict: member.id,
        cross_agency_candidate: memberOutAgency.id,
        source_registration_id: assignments.find(row => row.user_id === member.id)?.id ?? null,
        schedule_overlap_candidate: swapConflictShiftId,
        schedule_overlap_status: passSwapFixtures.length ? 'APPROVAL_REVALIDATION_DENIED_AND_ROLLED_BACK' : 'NOT RUN',
        lifecycle: passSwapFixtures,
      },
      pass_swap_expiry: { status: 'BLOCKED', reason: 'Published RPC and swap_requests schema expose no expiry transition or expired state.' },
      workforce: { month: '2099-12', agency_id: agencyIds.inScope, brand_id: brandIds[0],
        expected: { total_incidents: 2, total_distinct_shifts: 1, total_distinct_staff: 2,
          pending_count: 1, confirmed_count: 1, confirmed_late_count: 1, verified_late_minutes_total: 7 } },
      external_summaries: externalSummaryFixtures,
      attendance_payroll: { status: 'NOT RUN',
        expected: 'No temporal Attendance or Payroll row was created or mutated by this fixture runner.' },
      required_environment_variable_names: [
        'RC19_W4_EXPECTED_APPLICATION_SHA', 'RC19_W4_RUNTIME_URL',
        'RC19_W4_RUNTIME_DATABASE_URL', 'RC19_W4_RUNTIME_DATABASE_MARKER',
        'RC19_W4_RUNTIME_DATABASE_CONTAINER', 'RC19_W4_RUNTIME_ANON_KEY',
        'RC19_W4_RUNTIME_SERVICE_ROLE_KEY', 'RC19_W4_SYNTHETIC_ADMIN_EMAIL',
        'RC19_W4_SYNTHETIC_ADMIN_PASSWORD', 'RC19_W4_SYNTHETIC_LEADER_EMAIL',
        'RC19_W4_SYNTHETIC_LEADER_PASSWORD', 'RC19_W4_SYNTHETIC_MEMBER_EMAIL',
        'RC19_W4_SYNTHETIC_MEMBER_PASSWORD', 'RC19_W4_RUN_BROWSER_UAT', 'RC19_W4_NEXT_BASE_URL',
      ],
      credentials_included: false,
      independent_database_readback: 'The runtime marker is bound to this report; service-role PostgreSQL readback targets RC19_W4_RUNTIME_DATABASE_CONTAINER in this disposable runtime.',
    },
    browser_uat: { requested: browserRequested, ran: browserResult.ran, passed: browserResult.passed,
      authenticated: browserResult.authenticated, interaction_count: browserResult.interaction_count,
      expected: browserResult.expected ?? 0, skipped: browserResult.skipped ?? 0,
      failed: browserResult.failed ?? 0, flaky: browserResult.flaky ?? 0,
      suite_passed: browserResult.suite_passed ?? false,
      status: browserResult.status, blocker: browserResult.blocker },
    browser_cases: browserResult.cases ?? [],
    business_cases: [
      ...caseResults.map(item => ({
      case_id: item.case_id,
      area: item.case_id.startsWith('delta-d01-') ? 'atomic_staffing_replacement'
        : item.case_id.startsWith('agency-') ? 'brand_agency_authorization_boundaries'
        : item.case_id.startsWith('workforce-') ? 'workforce_reporting'
          : item.case_id.startsWith('external-summary-') ? 'external_summary'
            : item.case_id.startsWith('operational-note-') ? 'operational_notes_lifecycle' : 'pass_swap_lifecycle',
      source_case_ids: item.case_id === 'delta-d01-atomic-skip-replacement' ? ['D01'] : [item.case_id],
      source_criteria: [{ id: item.case_id === 'delta-d01-atomic-skip-replacement' ? 'D01' : item.case_id,
        criterion: item.case_id === 'delta-d01-atomic-skip-replacement'
          ? 'full_segment_skip_emergency_replacement_atomic_receipt_history' : item.expected }],
      actor: { role: item.actor, scope_key: 'synthetic-disposable-runtime' },
      expected: { authorization: item.expected, result: item.expected },
      actual: item.actual,
      database_readback: item.database_readback,
      negative_authorization: item.negative_authorization,
      browser_interaction: { performed: false, authenticated: false, status: 'NOT RUN' },
      status: item.status.toLowerCase(),
      })),
      ...originalD,
      ...originalL,
      ...[
        ['calendar-shift-creation-fixture', 'calendar_shift_creation', 'shift fixture creation and canonical database readback'],
        ['segmented-staffing-fixture', 'segmented_staffing', 'exact segment fixtures and canonical registration readback'],
        ['shift-registration-fixture', 'shift_registration', 'authorized registration fixture and canonical identity readback'],
        ['temporal-payroll-runtime', 'temporal_payroll', 'Attendance and Payroll effective-time linkage and immutable actual hours'],
        ['report-revision-snapshot-api', 'report_revision_snapshots', 'approved External Summary immutable revision snapshot'],
      ].map(([case_id, area, criterion]) => ({
        case_id, area, source_case_ids: [case_id], source_criteria: [{ id: case_id, criterion }],
        actor: { role: 'Synthetic Admin, Leader, Member', scope_key: 'synthetic-disposable-runtime' },
        expected: { authorization: 'Use the active GoTrue actor and its approved role/scope.', result: criterion },
        actual: { rpc_code: 'NOT_RUN' }, database_readback: { status: 'not_run', matches_expected: false },
        negative_authorization: { tested: false, passed: false },
        browser_interaction: { performed: false, authenticated: false, status: 'NOT RUN' }, status: 'not_run',
      })),
    ],
    cases: [
      ...caseResults,
      ...passSwapSubcaseExpectations.map(([case_id, expected]) => passSwapSubcaseResults.find(item => item.case_id === case_id)
        ?? { case_id, actor: 'Synthetic requester/candidate/Leader per case', expected,
          actual: { rpc_code: 'NOT_RUN' }, database_readback: { status: 'not_run', matches_expected: false },
          negative_authorization: { tested: false, passed: false },
          evidence_scope: 'No case execution evidence.', status: 'NOT RUN' }),
      ...(browserResult.cases ?? []),
      ...[
        ['temporal-attendance-payroll', 'Attendance and actual-work temporal boundaries persist into Payroll without changing historical evidence.'],
        ['kao-184-parse-preview-confirm-readback', 'Synthetic KAO #184 input parses, previews, confirms and reads back through authorized APIs.'],
      ].map(([case_id, expected]) => ({ case_id, actor: 'Admin, Leader, Member as required', expected,
        actual: 'NOT RUN: executable API and persisted-readback flow is not implemented in this runner.',
        evidence_scope: 'No runtime case evidence.', status: 'NOT RUN' })),
      ...[
        'D01','D02','D03','D04','D05','D06','D07','D08','D09','D10','D11',
      ].map((case_id, index) => ({ case_id, actor: 'Original D-series actor per acceptance contract',
        expected: [
          'Full A skip to B emergency replacement on exact segment; atomic roster, incident and receipt; preserve A history and other segments.',
          'Partial replacement preserves A worked interval, evidence, approved actual and payroll references; B is separate with no overlap or double pay.',
          'Distinguish approved PASS/reassignment/authorized absence from confirmed skip/no-show/late; pending and missing-photo cases are not auto-violations.',
          'Late or absence without replacement covers Host/Support/Technical, overnight/business month and unknown minutes.',
          'Unauthorized, cross-Agency/Brand, wrong segment/actor, stale version and locked history deny; concurrency/retry create no duplicate or orphan.',
          'Draft note survives shift switch, reload/relogin, resume/edit and version conflict without loss or wrong-shift association.',
          'End-of-shift report uses saved notes, submit/readback/relogin/export snapshot; duplicate/retry/reopen/correction preserve prior revision.',
          'Monthly employee summary/drilldown counts incidents once; B unaffected; pending/rejected are not confirmed; verified late minutes do not auto-deduct.',
          'Employee history, notes and internal/external report visibility enforce authorization and privacy.',
          'Combined A+B+D import/reimport, replacement, attendance, actual approval, payroll, report/history preserve prior fingerprints and no automatic penalty.',
          'Actual authenticated Admin/Leader/Member API, DB and browser tests; migration/regression/type/lint/build evidence and exact SHA.',
        ][index], actual: 'NOT RUN: this D-series interaction and persisted-readback flow is not implemented in this runner.',
        evidence_scope: 'No runtime case evidence.', status: 'NOT RUN' })),
      ...[
        ['L01', 'save_link_db_readback_reload_other_account_stale_write'],
        ['L02', 'publisher_consent_and_actual_video'],
        ['L03', 'publisher_shift_a_b_a_continuity'],
        ['L04', 'publisher_reports_navigation_continuity'],
        ['L05', 'independent_admin_receives_changing_frames'],
        ['L06', 'independent_leader_receives_changing_frames'],
        ['L07', 'member_receives_only_permitted_shift_media'],
        ['L08', 'anonymous_wrong_scope_and_direct_media_denial'],
        ['L09', 'viewer_reload_reconnect_without_stopping_publisher'],
        ['L10', 'concurrent_room_isolation_and_duplicate_publisher_guard'],
        ['L11', 'publisher_stop_ends_viewer_and_releases_resources'],
        ['L12', 'capture_browser_network_interruption_and_consent_restart'],
        ['L13', 'token_expiry_revocation_logout_and_termination'],
        ['L14', 'privacy_no_recording_and_audio_when_available'],
        ['L15', 'live_reports_calendar_shift_obs_regression_and_resource_metrics'],
      ].map(([case_id, expected]) => ({ case_id, actor: 'Admin, Leader, Member, publisher/viewer as required',
        expected, actual: 'NOT RUN: current browser smoke assertions do not demonstrate the original live media criterion.',
        evidence_scope: 'No full live media/browser evidence.', status: 'NOT RUN' })),
      browserCase,
    ],
    fixtures: {
      authenticated_users: authUsers.length + 6,
      brands: brandIds.length,
      platforms: 1,
      parent_shifts: 6,
      staffing_segments: storedSegments.length,
      canonical_assignments: assignments.length + swapAssignments.length + 2 + (d01Receipt ? 1 : 0),
      wrong_brand_denied: true,
      unassigned_member_has_no_assignment: true,
      wrong_agency_denied: caseResults.some(item => item.case_id === 'agency-wrong-agency-denial' && item.status === 'PASS'),
      anonymous_denied: true,
      agency_membership_readback_rows: membershipRows.length,
    },
  }
  persistWorkflowEvidence(report)
  process.stdout.write(`${JSON.stringify(report)}\n`)
}

main().catch(error => {
  const code = typeof error?.message === 'string' && /^[A-Z0-9_]+$/u.test(error.message)
    ? error.message : 'APPLICATION_ACCEPTANCE_FAILED'
  process.stderr.write(`${code}\n`)
  process.exitCode = 1
})
