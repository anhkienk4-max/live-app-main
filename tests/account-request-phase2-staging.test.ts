import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const STAGING_REF = 'amagnzebmmuqiptmrjmc'
const PRODUCTION_REF = 'egdjnpmoasarrttvhgds'
const runStaging = process.env.ACCOUNT_REQUEST_PHASE2_RUN_STAGING === '1'
const migrationApplied = process.env.ACCOUNT_REQUEST_PHASE2_STAGING_MIGRATION_APPLIED === '1'
const credentialNames = [
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SECRET_KEY',
  'ACCOUNT_REQUEST_PHASE2_ADMIN_EMAIL',
  'ACCOUNT_REQUEST_PHASE2_ADMIN_PASSWORD',
  'ACCOUNT_REQUEST_PHASE2_LEADER_EMAIL',
  'ACCOUNT_REQUEST_PHASE2_LEADER_PASSWORD',
  'ACCOUNT_REQUEST_PHASE2_MEMBER_EMAIL',
  'ACCOUNT_REQUEST_PHASE2_MEMBER_PASSWORD',
] as const
const missingCredentials = credentialNames.filter(name => !process.env[name]?.trim())
const skipReason = !runStaging
  ? 'SKIPPED_PRE_MIGRATION: set ACCOUNT_REQUEST_PHASE2_RUN_STAGING=1 to opt into staging.'
  : !migrationApplied
    ? 'SKIPPED_PRE_MIGRATION: set ACCOUNT_REQUEST_PHASE2_STAGING_MIGRATION_APPLIED=1 only after the Phase 2 migration is applied to staging.'
    : missingCredentials.length
      ? `SKIPPED_MISSING_STAGING_FIXTURES: configure ${missingCredentials.join(', ')}.`
      : undefined

type ReviewClient = SupabaseClient
type AccountRequestRow = {
  id: string
  email: string
  status: string
  provisioning_status: string
  version: number
  reviewed_at: string | null
  reviewed_by: string | null
  rejection_reason: string | null
  staff_id: string | null
  auth_user_id: string | null
}
type BusinessUserRow = {
  id: string
  auth_user_id: string | null
  email: string | null
  system_permission: string | null
  status: string | null
  account_status: string | null
}

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Missing required staging test variable: ${name}`)
  return value
}

function assertStagingTarget(url: string): void {
  if (process.env.VERCEL_ENV === 'production' || url.includes(PRODUCTION_REF) || !url.includes(STAGING_REF)) {
    throw new Error('Refusing Account Request Phase 2 test: target is not the configured staging project.')
  }
}

function client(url: string, key: string): ReviewClient {
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

async function authenticatedClient(
  url: string,
  anonKey: string,
  email: string,
  password: string,
  label: string,
): Promise<ReviewClient> {
  const result = client(url, anonKey)
  const { data, error } = await result.auth.signInWithPassword({ email, password })
  if (error || !data.user?.id) throw new Error(`${label} staging fixture authentication failed.`)
  return result
}

async function rpc(
  supabase: ReviewClient,
  functionName: string,
  args: Record<string, unknown>,
): Promise<unknown> {
  const { data, error } = await supabase.rpc(functionName, args)
  if (error) throw Object.assign(new Error(error.message || `RPC ${functionName} failed.`), { code: error.code })
  return data
}

async function expectRpcError(
  supabase: ReviewClient,
  functionName: string,
  args: Record<string, unknown>,
  expectedCode: string,
): Promise<void> {
  const { error } = await supabase.rpc(functionName, args)
  const errorText = `${error?.code ?? ''} ${error?.message ?? ''}`
  assert.ok(error, `Expected ${functionName} to be rejected.`)
  assert.match(errorText, new RegExp(expectedCode))
}

async function currentUserId(supabase: ReviewClient): Promise<string> {
  const { data, error } = await supabase.auth.getUser()
  if (error || !data.user?.id) throw new Error('Authenticated staging fixture returned no user.')
  return data.user.id
}

async function businessUserForAuth(admin: ReviewClient, authUserId: string): Promise<BusinessUserRow> {
  const { data, error } = await admin
    .from('business_users')
    .select('id,auth_user_id,email,system_permission,status,account_status')
    .eq('auth_user_id', authUserId)
  if (error || !data || data.length !== 1) throw new Error('Staging fixture has no unique canonical business user.')
  return data[0] as BusinessUserRow
}

async function requestById(admin: ReviewClient, id: string): Promise<AccountRequestRow> {
  const { data, error } = await admin
    .from('account_requests')
    .select('id,email,status,provisioning_status,version,reviewed_at,reviewed_by,rejection_reason,staff_id,auth_user_id')
    .eq('id', id)
    .single()
  if (error || !data) throw new Error('Account Request fixture could not be read.')
  return data as AccountRequestRow
}

async function createPendingRequest(
  anonymous: ReviewClient,
  admin: ReviewClient,
  prefix: string,
  label: string,
): Promise<AccountRequestRow> {
  const email = `${prefix}-${label}@example.invalid`
  await rpc(anonymous, 'submit_account_request', {
    p_email: email,
    p_full_name: `Phase 2 ${label}`,
    p_phone: null,
    p_department: 'phase2-test',
  })
  const { data, error } = await admin
    .from('account_requests')
    .select('id,email,status,provisioning_status,version,reviewed_at,reviewed_by,rejection_reason,staff_id,auth_user_id')
    .eq('email', email)
    .eq('status', 'pending')
    .single()
  if (error || !data) throw new Error(`Could not find disposable ${label} account request.`)
  return data as AccountRequestRow
}

async function countStaff(admin: ReviewClient): Promise<number> {
  const { count, error } = await admin.from('business_users').select('id', { count: 'exact', head: true })
  if (error || count === null) throw new Error('Could not count staging business users.')
  return count
}

async function countAuthUsers(admin: ReviewClient): Promise<number> {
  let page = 1
  let total = 0
  while (true) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw new Error('Could not count staging Auth users.')
    total += data.users.length
    if (data.users.length < 1000) return total
    page += 1
  }
}

async function auditRows(admin: ReviewClient, requestId: string) {
  const { data, error } = await admin
    .from('audit_logs')
    .select('id,actor_business_user_id,module,action,entity_type,entity_id,before_data,after_data,reason')
    .eq('entity_id', requestId)
    .eq('entity_type', 'account_requests')
  if (error) throw new Error('Could not read Account Request audit evidence.')
  return data ?? []
}

async function notificationRows(admin: ReviewClient, requestId: string) {
  const { data, error } = await admin
    .from('notifications')
    .select('id,recipient_id,event_key,notification_type,related_entity_type,related_entity_id')
    .eq('related_entity_type', 'account_requests')
    .eq('related_entity_id', requestId)
  if (error) throw new Error('Could not read Account Request notification evidence.')
  return data ?? []
}

test('Account Request Phase 2 staging runtime contract', { skip: skipReason }, async () => {
  const url = requiredEnv('SUPABASE_URL')
  const anonKey = requiredEnv('SUPABASE_ANON_KEY')
  const secretKey = requiredEnv('SUPABASE_SECRET_KEY')
  assertStagingTarget(url)

  const adminFixture = await authenticatedClient(url, anonKey, requiredEnv('ACCOUNT_REQUEST_PHASE2_ADMIN_EMAIL'), requiredEnv('ACCOUNT_REQUEST_PHASE2_ADMIN_PASSWORD'), 'Admin')
  const adminFixture2 = await authenticatedClient(url, anonKey, requiredEnv('ACCOUNT_REQUEST_PHASE2_ADMIN_EMAIL'), requiredEnv('ACCOUNT_REQUEST_PHASE2_ADMIN_PASSWORD'), 'Admin second session')
  const leaderFixture = await authenticatedClient(url, anonKey, requiredEnv('ACCOUNT_REQUEST_PHASE2_LEADER_EMAIL'), requiredEnv('ACCOUNT_REQUEST_PHASE2_LEADER_PASSWORD'), 'Leader')
  const memberFixture = await authenticatedClient(url, anonKey, requiredEnv('ACCOUNT_REQUEST_PHASE2_MEMBER_EMAIL'), requiredEnv('ACCOUNT_REQUEST_PHASE2_MEMBER_PASSWORD'), 'Member')
  const anonymous = client(url, anonKey)
  const admin = client(url, secretKey)
  const adminAuthId = await currentUserId(adminFixture)
  const adminAuthId2 = await currentUserId(adminFixture2)
  const leaderAuthId = await currentUserId(leaderFixture)
  const memberAuthId = await currentUserId(memberFixture)
  assert.equal(adminAuthId2, adminAuthId)

  const canonicalAdmin = await businessUserForAuth(admin, adminAuthId)
  const canonicalLeader = await businessUserForAuth(admin, leaderAuthId)
  const canonicalMember = await businessUserForAuth(admin, memberAuthId)
  assert.equal(canonicalAdmin.system_permission, 'admin')
  assert.equal(canonicalLeader.system_permission, 'leader')
  assert.equal(canonicalMember.system_permission, 'member')
  const eligibleAdmins = await admin
    .from('business_users')
    .select('id')
    .eq('system_permission', 'admin')
    .eq('status', 'active')
    .eq('account_status', 'active')
    .is('archived_at', null)
    .is('deleted_at', null)
  if (eligibleAdmins.error) throw new Error('Could not identify eligible Admin notification recipients.')
  const eligibleAdminIds = new Set((eligibleAdmins.data ?? []).map(row => String(row.id)))
  assert.ok(eligibleAdminIds.has(canonicalAdmin.id))

  const prefix = `account-request-phase2-${Date.now()}-${randomUUID().slice(0, 8)}`
  const fixtureIds: string[] = []
  const fixtureNotificationIds: string[] = []
  const fixtureAuditIds: string[] = []
  const track = (row: AccountRequestRow) => { fixtureIds.push(row.id); return row }

  try {
    const approval = track(await createPendingRequest(anonymous, admin, prefix, 'approval'))
    const approvalAuthCount = await countAuthUsers(admin)
    const approvalStaffCount = await countStaff(admin)
    const approved = await rpc(adminFixture, 'approve_account_request', {
      p_request_id: approval.id,
      p_expected_version: approval.version,
    }) as AccountRequestRow
    assert.equal(approved.status, 'approved')
    assert.equal(approved.version, approval.version + 1)
    assert.ok(approved.reviewed_at)
    assert.equal(approved.reviewed_by, canonicalAdmin.id)
    assert.equal(approved.provisioning_status, 'not_started')
    assert.equal(approved.staff_id, approval.staff_id)
    assert.equal(approved.auth_user_id, approval.auth_user_id)
    assert.equal(await countAuthUsers(admin), approvalAuthCount)
    assert.equal(await countStaff(admin), approvalStaffCount)

    const approvedAgain = await rpc(adminFixture2, 'approve_account_request', {
      p_request_id: approval.id,
      p_expected_version: approval.version,
    }) as AccountRequestRow
    assert.equal(approvedAgain.id, approved.id)
    assert.equal(approvedAgain.version, approved.version)
    assert.equal(approvedAgain.reviewed_at, approved.reviewed_at)
    assert.equal(approvedAgain.reviewed_by, approved.reviewed_by)
    await expectRpcError(adminFixture, 'reject_account_request', {
      p_request_id: approval.id,
      p_expected_version: approval.version,
      p_rejection_reason: 'cross-terminal',
    }, 'ACCOUNT_REQUEST_NOT_PENDING')

    const approvalAudit = await auditRows(admin, approval.id)
    const approvalEvent = approvalAudit.find(row => row.action === 'approve') as Record<string, unknown> | undefined
    assert.ok(approvalEvent)
    assert.equal(approvalEvent.actor_business_user_id, canonicalAdmin.id)
    assert.equal((approvalEvent.before_data as Record<string, unknown>).status, 'pending')
    assert.equal((approvalEvent.after_data as Record<string, unknown>).status, 'approved')
    assert.equal(approvalEvent.module, 'staff')
    assert.equal(approvalEvent.entity_type, 'account_requests')

    const rejection = track(await createPendingRequest(anonymous, admin, prefix, 'rejection'))
    const rejectionAuthCount = await countAuthUsers(admin)
    const rejectionStaffCount = await countStaff(admin)
    const rejected = await rpc(adminFixture, 'reject_account_request', {
      p_request_id: rejection.id,
      p_expected_version: rejection.version,
      p_rejection_reason: '  duplicate request  ',
    }) as AccountRequestRow
    assert.equal(rejected.status, 'rejected')
    assert.equal(rejected.version, rejection.version + 1)
    assert.equal(rejected.rejection_reason, 'duplicate request')
    assert.ok(rejected.reviewed_at)
    assert.equal(rejected.reviewed_by, canonicalAdmin.id)
    assert.equal(rejected.provisioning_status, 'not_started')
    assert.equal(await countAuthUsers(admin), rejectionAuthCount)
    assert.equal(await countStaff(admin), rejectionStaffCount)
    const rejectedAgain = await rpc(adminFixture2, 'reject_account_request', {
      p_request_id: rejection.id,
      p_expected_version: rejection.version,
      p_rejection_reason: 'ignored on terminal retry',
    }) as AccountRequestRow
    assert.equal(rejectedAgain.version, rejected.version)
    assert.equal(rejectedAgain.rejection_reason, rejected.rejection_reason)
    await expectRpcError(adminFixture, 'approve_account_request', {
      p_request_id: rejection.id,
      p_expected_version: rejection.version,
    }, 'ACCOUNT_REQUEST_NOT_PENDING')

    const rejectionAudit = await auditRows(admin, rejection.id)
    const rejectionEvent = rejectionAudit.find(row => row.action === 'reject') as Record<string, unknown> | undefined
    assert.ok(rejectionEvent)
    assert.equal(rejectionEvent.actor_business_user_id, canonicalAdmin.id)
    assert.equal((rejectionEvent.before_data as Record<string, unknown>).status, 'pending')
    assert.equal((rejectionEvent.after_data as Record<string, unknown>).status, 'rejected')
    assert.equal(rejectionEvent.reason, 'duplicate request')

    const authorization = track(await createPendingRequest(anonymous, admin, prefix, 'authorization'))
    await expectRpcError(leaderFixture, 'approve_account_request', { p_request_id: authorization.id, p_expected_version: 0 }, 'STAFF_ADMIN_REQUIRED')
    await expectRpcError(memberFixture, 'approve_account_request', { p_request_id: authorization.id, p_expected_version: 0 }, 'STAFF_ADMIN_REQUIRED')
    await expectRpcError(anonymous, 'approve_account_request', { p_request_id: authorization.id, p_expected_version: 0 }, '42501|permission|function')
    await expectRpcError(adminFixture, 'approve_account_request', { p_request_id: randomUUID(), p_expected_version: 0 }, 'ACCOUNT_REQUEST_NOT_FOUND')

    const stale = track(await createPendingRequest(anonymous, admin, prefix, 'stale'))
    await expectRpcError(adminFixture, 'approve_account_request', { p_request_id: stale.id, p_expected_version: stale.version + 1 }, 'ACCOUNT_REQUEST_REVIEW_STALE')
    const staleAfter = await requestById(admin, stale.id)
    assert.equal(staleAfter.status, 'pending')
    assert.equal(staleAfter.version, stale.version)

    const cancelled = track(await createPendingRequest(anonymous, admin, prefix, 'cancelled'))
    const cancelledUpdate = await admin.from('account_requests').update({ status: 'cancelled' }).eq('id', cancelled.id)
    if (cancelledUpdate.error) throw new Error('Could not prepare disposable cancelled request fixture.')
    await expectRpcError(adminFixture, 'approve_account_request', { p_request_id: cancelled.id, p_expected_version: cancelled.version }, 'ACCOUNT_REQUEST_NOT_PENDING')
    await expectRpcError(adminFixture, 'reject_account_request', { p_request_id: cancelled.id, p_expected_version: cancelled.version, p_rejection_reason: 'cancelled' }, 'ACCOUNT_REQUEST_NOT_PENDING')

    const race = track(await createPendingRequest(anonymous, admin, prefix, 'approve-reject-race'))
    const raceResults = await Promise.allSettled([
      rpc(adminFixture, 'approve_account_request', { p_request_id: race.id, p_expected_version: race.version }),
      rpc(adminFixture2, 'reject_account_request', { p_request_id: race.id, p_expected_version: race.version, p_rejection_reason: 'race loser' }),
    ])
    assert.equal(raceResults.filter(result => result.status === 'fulfilled').length, 1)
    const raceError = raceResults.find(result => result.status === 'rejected') as PromiseRejectedResult
    assert.match(`${raceError.reason?.code ?? ''} ${raceError.reason?.message ?? ''}`, /ACCOUNT_REQUEST_NOT_PENDING/)
    const raceAfter = await requestById(admin, race.id)
    assert.ok(['approved', 'rejected'].includes(raceAfter.status))
    assert.equal(raceAfter.version, race.version + 1)

    const approvalRace = track(await createPendingRequest(anonymous, admin, prefix, 'approval-race'))
    const approvalRaceResults = await Promise.allSettled([
      rpc(adminFixture, 'approve_account_request', { p_request_id: approvalRace.id, p_expected_version: approvalRace.version }),
      rpc(adminFixture2, 'approve_account_request', { p_request_id: approvalRace.id, p_expected_version: approvalRace.version }),
    ])
    assert.equal(approvalRaceResults.filter(result => result.status === 'fulfilled').length, 2)
    const approvalRaceAfter = await requestById(admin, approvalRace.id)
    assert.equal(approvalRaceAfter.status, 'approved')
    assert.equal(approvalRaceAfter.version, approvalRace.version + 1)
    const approvalRaceAudit = await auditRows(admin, approvalRace.id)
    assert.equal(approvalRaceAudit.filter(row => row.action === 'approve').length, 1)

    const notification = track(await createPendingRequest(anonymous, admin, prefix, 'notification'))
    const firstNotifications = await notificationRows(admin, notification.id)
    const firstNotificationIds = new Set(firstNotifications.map(row => String(row.id)))
    fixtureNotificationIds.push(...firstNotifications.map(row => String(row.id)))
    assert.equal(firstNotifications.length, eligibleAdminIds.size)
    assert.deepEqual(new Set(firstNotifications.map(row => String(row.recipient_id))), eligibleAdminIds)
    assert.ok(firstNotifications.every(row => row.notification_type === 'account_request_submitted'))
    assert.ok(firstNotifications.every(row => String(row.event_key).startsWith(`account_request_submitted:${notification.id}:`)))
    await rpc(anonymous, 'submit_account_request', {
      p_email: notification.email,
      p_full_name: 'Duplicate notification attempt',
      p_phone: null,
      p_department: 'phase2-test',
    })
    const retryNotifications = await notificationRows(admin, notification.id)
    assert.deepEqual(new Set(retryNotifications.map(row => String(row.id))), firstNotificationIds)
    fixtureAuditIds.push(...(await auditRows(admin, notification.id)).map(row => String(row.id)))
    fixtureAuditIds.push(...(await auditRows(admin, approval.id)).map(row => String(row.id)))
    fixtureAuditIds.push(...(await auditRows(admin, rejection.id)).map(row => String(row.id)))
    fixtureAuditIds.push(...(await auditRows(admin, authorization.id)).map(row => String(row.id)))
    fixtureAuditIds.push(...(await auditRows(admin, stale.id)).map(row => String(row.id)))
    fixtureAuditIds.push(...(await auditRows(admin, cancelled.id)).map(row => String(row.id)))
    fixtureAuditIds.push(...(await auditRows(admin, race.id)).map(row => String(row.id)))
    fixtureAuditIds.push(...(await auditRows(admin, approvalRace.id)).map(row => String(row.id)))
  } finally {
    const { data: prefixRows, error: prefixRowsError } = await admin
      .from('account_requests')
      .select('id')
      .like('email', `${prefix}-%@example.invalid`)
    if (prefixRowsError) throw new Error('Could not discover disposable Account Request fixtures for cleanup.')
    const cleanupIds = Array.from(new Set([
      ...fixtureIds,
      ...(prefixRows ?? []).map(row => String(row.id)),
    ]))

    if (cleanupIds.length) {
      const { error } = await admin.from('account_requests').delete().in('id', cleanupIds)
      if (error) throw new Error('Account Request staging fixture cleanup failed.')
    }
    if (cleanupIds.length || fixtureNotificationIds.length) {
      const { error } = cleanupIds.length
        ? await admin.from('notifications').delete().eq('related_entity_type', 'account_requests').in('related_entity_id', cleanupIds)
        : await admin.from('notifications').delete().in('id', fixtureNotificationIds)
      if (error) throw new Error('Notification staging fixture cleanup failed.')
    }
    if (cleanupIds.length || fixtureAuditIds.length) {
      const { error } = cleanupIds.length
        ? await admin.from('audit_logs').delete().eq('entity_type', 'account_requests').in('entity_id', cleanupIds)
        : await admin.from('audit_logs').delete().in('id', Array.from(new Set(fixtureAuditIds)))
      if (error) throw new Error('Audit staging fixture cleanup failed.')
    }
    const { data: leftovers, error: leftoversError } = await admin
      .from('account_requests')
      .select('id')
      .like('email', `${prefix}-%@example.invalid`)
    if (leftoversError || leftovers?.length) throw new Error('Account Request cleanup left disposable rows.')
  }
})
