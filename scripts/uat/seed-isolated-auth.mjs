import { randomBytes } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'

const { createClient } = await import(pathToFileURL(resolve(process.cwd(), 'node_modules/@supabase/supabase-js/dist/index.mjs')).href)
const url = process.env.UAT_SUPABASE_URL
const anonKey = process.env.UAT_SUPABASE_ANON_KEY
const serviceKey = process.env.UAT_SUPABASE_SERVICE_KEY
const credentialsFile = process.env.UAT_CREDENTIALS_FILE

if (!url || !anonKey || !serviceKey || !credentialsFile) throw new Error('ISOLATED_UAT_ENVIRONMENT_REQUIRED')
const target = new URL(url)
if (target.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(target.hostname)) {
  throw new Error('ISOLATED_UAT_LOOPBACK_TARGET_REQUIRED')
}

const root = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
const roles = [
  { key: 'admin', id: 'uat-admin', permission: 'admin', role: 'admin', name: 'UAT Synthetic Admin' },
  { key: 'leader', id: 'uat-leader', permission: 'leader', role: 'leader', name: 'UAT Synthetic Leader' },
  { key: 'member', id: 'uat-member', permission: 'member', role: 'staff', name: 'UAT Synthetic Member' },
  { key: 'inactive_member', id: 'uat-inactive-member', permission: 'member', role: 'staff', name: 'UAT Inactive Member', status: 'inactive' },
]

const existing = await root.from('shifts').select('id', { count: 'exact', head: true }).like('title', 'UAT %')
if (existing.error) throw existing.error
if (existing.count) throw new Error('ISOLATED_UAT_DATABASE_NOT_EMPTY: reset this local project before seeding')

const credentials = []
for (const role of roles) {
  const email = `ada-uat-${role.key}@example.invalid`
  const password = `Uat-${randomBytes(24).toString('base64url')}!`
  const created = await root.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { system_permission: role.permission, business_user_id: role.id },
    user_metadata: { full_name: role.name },
  })
  if (created.error || !created.data.user) throw created.error ?? new Error('UAT_AUTH_USER_NOT_CREATED')
  const user = await root.from('business_users').insert({
    id: role.id,
    auth_user_id: created.data.user.id,
    email,
    full_name: role.name,
    role: role.role,
    system_permission: role.permission,
    operational_roles: ['host', 'support', 'technical'],
    status: role.status ?? 'active',
    account_status: 'active',
    email_verified: true,
    auth_provider: 'email',
  })
  if (user.error) throw user.error
  credentials.push({ role: role.key, email, password })
}
console.log('UAT_SEED_STAGE=auth_users_created')

const admin = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
const adminLogin = await admin.auth.signInWithPassword(credentials.find(account => account.role === 'admin'))
if (adminLogin.error) throw adminLogin.error
const member = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
const memberLogin = await member.auth.signInWithPassword(credentials.find(account => account.role === 'member'))
if (memberLogin.error) throw memberLogin.error

const brand = await root.from('brands').insert({ id: 'uat-brand', name: 'ADA UAT Synthetic Brand', status: 'active' })
if (brand.error) throw brand.error
const platform = await root.from('platforms').insert({ id: 'uat-platform', name: 'Shopee Live', status: 'active' })
if (platform.error) throw platform.error
console.log('UAT_SEED_STAGE=reference_data_created')

const localToday = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Ho_Chi_Minh' }))
const shifts = Array.from({ length: 120 }, (_, index) => {
  const date = new Date(localToday)
  date.setDate(date.getDate() - index - 1)
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(date)
  return {
    id: `uat-shift-${String(index + 1).padStart(3, '0')}`,
    date: day,
    start_time: '09:00:00',
    end_time: '10:00:00',
    timezone: 'Asia/Ho_Chi_Minh',
    start_at: `${day}T09:00:00+07:00`,
    end_at: `${day}T10:00:00+07:00`,
    end_date: day,
    crosses_midnight: false,
    duration_minutes: 60,
    brand_id: 'uat-brand',
    platform_id: 'uat-platform',
    title: `UAT historical campaign ${String(120 - index).padStart(3, '0')}`,
    host_id: index === 0 ? 'uat-member' : null,
    support_id: index === 1 ? 'uat-member' : null,
    technical_id: index === 2 ? 'uat-member' : null,
    registration_cutoff_at: `${day}T08:00:00+07:00`,
    status: 'completed',
  }
})
const seededShifts = await root.from('shifts').insert(shifts).select('id,title,date')
if (seededShifts.error || seededShifts.data.length !== shifts.length) {
  throw seededShifts.error ?? new Error('UAT_SHIFT_FIXTURE_INCOMPLETE')
}
console.log('UAT_SEED_STAGE=historical_shifts_created')

const currentDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' })
  .format(new Date(Date.now() + 3 * 24 * 60 * 60 * 1000))
const createAssignedCompletedShift = async (role) => {
  const title = role === 'host' ? 'UAT registered member report shift' : `UAT direct ${role} assignment`
  const startTime = role === 'host' ? '09:00:00' : role === 'support' ? '11:00:00' : '13:00:00'
  const created = await admin.rpc('create_shift', { p_data: {
    date: currentDay,
    start_time: startTime,
    end_time: `${String(Number(startTime.slice(0, 2)) + 1).padStart(2, '0')}:00:00`,
    timezone: 'Asia/Ho_Chi_Minh',
    brand_id: 'uat-brand',
    platform_id: 'uat-platform',
    title,
    status: 'scheduled',
    registration_cutoff_at: `${currentDay}T08:00:00+07:00`,
  } }).single()
  if (created.error || !created.data) throw created.error ?? new Error('UAT_ASSIGNED_SHIFT_NOT_CREATED')
  const assigned = await admin.rpc('manual_assign_shift_staff', {
    p_shift_id: created.data.id,
    p_user_id: 'uat-member',
    p_role: role,
    p_notes: 'Synthetic isolated UAT assignment',
    p_expected_version: created.data.version,
  })
  if (assigned.error) throw assigned.error
  let current = await root.from('shifts').select('version').eq('id', created.data.id).single()
  if (current.error) throw current.error
  for (const status of ['preparing', 'live', 'completed']) {
    const transition = await admin.rpc('update_shift', {
      p_shift_id: created.data.id,
      p_patch: { status },
      p_confirm_impact: false,
      p_expected_version: current.data.version,
    }).single()
    if (transition.error || !transition.data) throw transition.error ?? new Error('UAT_SHIFT_LIFECYCLE_FAILED')
    current = { data: { version: transition.data.version }, error: null }
  }
  return created.data.id
}

const directlyAssignedShifts = {}
for (const role of ['host', 'support', 'technical']) directlyAssignedShifts[role] = await createAssignedCompletedShift(role)
console.log('UAT_SEED_STAGE=direct_assignment_shifts_created')

const registrationDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' })
  .format(new Date(Date.now() + 4 * 24 * 60 * 60 * 1000))
const openShift = await admin.rpc('create_shift', { p_data: {
  date: registrationDay,
  start_time: '09:00:00',
  end_time: '10:00:00',
  timezone: 'Asia/Ho_Chi_Minh',
  brand_id: 'uat-brand',
  platform_id: 'uat-platform',
  title: 'UAT member registration shift',
  status: 'scheduled',
  registration_cutoff_at: `${registrationDay}T08:00:00+07:00`,
} }).single()
if (openShift.error || !openShift.data) throw openShift.error ?? new Error('UAT_REGISTRATION_SHIFT_NOT_CREATED')
const memberRegistration = await member.rpc('register_for_shift', {
  p_shift_id: openShift.data.id,
  p_role: 'technical',
})
if (memberRegistration.error) throw memberRegistration.error
const registrationVersion = await root.from('shift_registrations').select('version').eq('id', memberRegistration.data.id).single()
if (registrationVersion.error) throw registrationVersion.error
const approvedRegistration = await admin.rpc('approve_shift_registration', {
  p_registration_id: memberRegistration.data.id,
  p_notes: 'Synthetic isolated UAT approval',
  p_expected_version: registrationVersion.data.version,
})
if (approvedRegistration.error) throw approvedRegistration.error
let registeredShift = await root.from('shifts').select('version').eq('id', openShift.data.id).single()
if (registeredShift.error) throw registeredShift.error
console.log('UAT_SEED_STAGE=approved_registration_created')

const createOpenShift = async (title, dateOffset) => {
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' })
    .format(new Date(Date.now() + dateOffset * 24 * 60 * 60 * 1000))
  const created = await admin.rpc('create_shift', { p_data: {
    date: day,
    start_time: '09:00:00',
    end_time: '10:00:00',
    timezone: 'Asia/Ho_Chi_Minh',
    brand_id: 'uat-brand',
    platform_id: 'uat-platform',
    title,
    status: 'scheduled',
    registration_cutoff_at: `${day}T08:00:00+07:00`,
  } }).single()
  if (created.error || !created.data) throw created.error ?? new Error('UAT_OPEN_SHIFT_NOT_CREATED')
  return created.data.id
}

const completeShiftForReport = async (shiftId) => {
  let current = await root.from('shifts').select('version').eq('id', shiftId).single()
  if (current.error) throw current.error
  for (const status of ['preparing', 'live', 'completed']) {
    const transition = await admin.rpc('update_shift', {
      p_shift_id: shiftId,
      p_patch: { status },
      p_confirm_impact: false,
      p_expected_version: current.data.version,
    }).single()
    if (transition.error || !transition.data) throw transition.error ?? new Error('UAT_REPORTABLE_SHIFT_TRANSITION_FAILED')
    current = { data: { version: transition.data.version }, error: null }
  }
}

const createEmptyReportableShift = async (title, dateOffset) => {
  const shiftId = await createOpenShift(title, dateOffset)
  await completeShiftForReport(shiftId)
  return shiftId
}

const emptyDashboardReportShiftId = await createEmptyReportableShift('UAT admin missing dashboard report shift', 16)
const artifactFailureReportShiftId = await createEmptyReportableShift('UAT artifact failure report shift', 17)

const unregisteredOpenShiftId = await createOpenShift('UAT open report shift no registration', 7)
console.log('UAT_SEED_STAGE=open_unregistered_shift_created')
const pendingRegistrationShiftId = await createOpenShift('UAT pending report shift', 8)
console.log('UAT_SEED_STAGE=pending_shift_created')
const pendingRegistration = await member.rpc('register_for_shift', {
  p_shift_id: pendingRegistrationShiftId,
  p_role: 'host',
})
if (pendingRegistration.error) throw pendingRegistration.error
console.log('UAT_SEED_STAGE=pending_registration_created')

const approvedRegistrationShiftId = await createOpenShift('UAT approved registration report shift', 9)
console.log('UAT_SEED_STAGE=approved_registration_shift_created')
const approvedOnlyRequest = await member.rpc('register_for_shift', {
  p_shift_id: approvedRegistrationShiftId,
  p_role: 'support',
})
if (approvedOnlyRequest.error) throw approvedOnlyRequest.error
const approvedOnlyVersion = await root.from('shift_registrations').select('version').eq('id', approvedOnlyRequest.data.id).single()
if (approvedOnlyVersion.error) throw approvedOnlyVersion.error
const approvedOnlyRegistration = await admin.rpc('approve_shift_registration', {
  p_registration_id: approvedOnlyRequest.data.id,
  p_notes: 'Synthetic isolated approved registration report fixture',
  p_expected_version: approvedOnlyVersion.data.version,
})
if (approvedOnlyRegistration.error) throw approvedOnlyRegistration.error
await completeShiftForReport(approvedRegistrationShiftId)
console.log('UAT_SEED_STAGE=registration_status_fixtures_created')
for (const status of ['preparing', 'live', 'completed']) {
  const transition = await admin.rpc('update_shift', {
    p_shift_id: openShift.data.id,
    p_patch: { status },
    p_confirm_impact: false,
    p_expected_version: registeredShift.data.version,
  }).single()
  if (transition.error || !transition.data) throw transition.error ?? new Error('UAT_REGISTERED_SHIFT_LIFECYCLE_FAILED')
  registeredShift = { data: { version: transition.data.version }, error: null }
}

let reportCount = 0
for (const shift of seededShifts.data.slice(3)) {
  const report = await admin.rpc('create_report', { p_data: {
    shift_id: shift.id,
    dashboard_platform: 'other',
    final_recap: {},
    insights_good: `Synthetic report for ${shift.title}`,
  } }).single()
  if (report.error) throw report.error
  reportCount++
}
console.log('UAT_SEED_STAGE=historical_reports_created')

const createReportForShift = async (shiftId) => {
  const created = await admin.rpc('create_report', { p_data: {
    shift_id: shiftId,
    dashboard_platform: 'other',
    final_recap: {},
    insights_good: 'Synthetic report authorization fixture',
  } }).single()
  if (created.error || !created.data) throw created.error ?? new Error('UAT_REPORT_FIXTURE_NOT_CREATED')
  return created.data.id
}

const createReportThenRestoreOpenShift = async (shiftId) => {
  await completeShiftForReport(shiftId)
  const reportId = await createReportForShift(shiftId)
  // Create the report through the real RPC, then restore the synthetic open state for the read-scope probe.
  const restored = await root.from('shifts').update({ status: 'scheduled', registration_locked: false }).eq('id', shiftId)
  if (restored.error) throw restored.error
  return reportId
}

const hostAssignmentOnlyShiftId = await root.from('shifts').select('id').eq('id', shifts[0].id).single()
if (hostAssignmentOnlyShiftId.error) throw hostAssignmentOnlyShiftId.error
const directHostReportId = await createReportForShift(hostAssignmentOnlyShiftId.data.id)
const createMemberReportForShift = async (shiftId, message) => {
  const created = await member.rpc('create_report', { p_data: {
    shift_id: shiftId,
    dashboard_platform: 'other',
    final_recap: {},
    insights_good: message,
  } }).single()
  if (created.error || !created.data) throw created.error ?? new Error('UAT_MEMBER_REPORT_NOT_CREATED')
  return created.data.id
}
const directSupportReportId = await createMemberReportForShift(directlyAssignedShifts.support, 'Synthetic member draft for direct Support assignment')
const directTechnicalReportId = await createMemberReportForShift(directlyAssignedShifts.technical, 'Synthetic member draft for direct Technical assignment')
const approvedOnlyReportId = await createMemberReportForShift(approvedRegistrationShiftId, 'Synthetic member draft for approved registration')
await createMemberReportForShift(directlyAssignedShifts.host, 'Synthetic member draft for direct Host assignment')
const openShiftReportId = await createReportThenRestoreOpenShift(unregisteredOpenShiftId)
const pendingShiftReportId = await createReportThenRestoreOpenShift(pendingRegistrationShiftId)

const memberReporterShiftId = await createOpenShift('UAT member submitted report without current assignment', 15)
const memberReporterRegistration = await member.rpc('register_for_shift', {
  p_shift_id: memberReporterShiftId,
  p_role: 'host',
})
if (memberReporterRegistration.error) throw memberReporterRegistration.error
const memberReporterRegistrationVersion = await root.from('shift_registrations').select('version').eq('id', memberReporterRegistration.data.id).single()
if (memberReporterRegistrationVersion.error) throw memberReporterRegistrationVersion.error
const memberReporterApproved = await admin.rpc('approve_shift_registration', {
  p_registration_id: memberReporterRegistration.data.id,
  p_notes: 'Synthetic isolated UAT member report fixture',
  p_expected_version: memberReporterRegistrationVersion.data.version,
})
if (memberReporterApproved.error) throw memberReporterApproved.error
const memberReporterShiftVersion = await root.from('shifts').select('version').eq('id', memberReporterShiftId).single()
if (memberReporterShiftVersion.error) throw memberReporterShiftVersion.error
const memberReporterPreparing = await admin.rpc('update_shift', {
  p_shift_id: memberReporterShiftId,
  p_patch: { status: 'preparing' },
  p_confirm_impact: false,
  p_expected_version: memberReporterShiftVersion.data.version,
}).single()
if (memberReporterPreparing.error || !memberReporterPreparing.data) throw memberReporterPreparing.error ?? new Error('UAT_MEMBER_REPORT_SHIFT_NOT_PREPARING')
const memberSubmittedReport = await member.rpc('create_report', { p_data: {
  shift_id: memberReporterShiftId,
  dashboard_platform: 'other',
  final_recap: {},
  insights_good: 'Synthetic member-submitted report authorization fixture',
} }).single()
if (memberSubmittedReport.error || !memberSubmittedReport.data) {
  throw memberSubmittedReport.error ?? new Error('UAT_MEMBER_REPORT_FIXTURE_NOT_CREATED')
}
const memberReporterOpen = await root.from('shifts').update({ status: 'scheduled', registration_locked: false }).eq('id', memberReporterShiftId)
if (memberReporterOpen.error) throw memberReporterOpen.error
const memberReporterCurrentRegistration = await root.from('shift_registrations').select('version').eq('id', memberReporterRegistration.data.id).single()
if (memberReporterCurrentRegistration.error) throw memberReporterCurrentRegistration.error
const cancelMemberReporterRegistration = await member.rpc('cancel_own_shift_registration', {
  p_registration_id: memberReporterRegistration.data.id,
  p_notes: 'Synthetic isolated UAT submitter no-current-assignment boundary',
  p_expected_version: memberReporterCurrentRegistration.data.version,
})
if (cancelMemberReporterRegistration.error) throw cancelMemberReporterRegistration.error

const archivedReportShiftId = await createOpenShift('UAT archived report shift', 11)
const deletedReportShiftId = await createOpenShift('UAT deleted report shift', 12)
const archivedParentShiftId = await createOpenShift('UAT archived parent shift', 13)
const deletedShiftReportShiftId = await createOpenShift('UAT deleted parent shift', 14)
const archivedReportId = await createReportThenRestoreOpenShift(archivedReportShiftId)
const deletedReportId = await createReportThenRestoreOpenShift(deletedReportShiftId)
const archivedParentShiftReportId = await createReportThenRestoreOpenShift(archivedParentShiftId)
const deletedShiftReportId = await createReportThenRestoreOpenShift(deletedShiftReportShiftId)
const archivedReport = await admin.rpc('archive_report', { p_report_id: archivedReportId, p_reason: 'Synthetic isolated UAT archive boundary' })
if (archivedReport.error) throw archivedReport.error
const deletedReport = await admin.rpc('soft_delete_report', { p_report_id: deletedReportId, p_reason: 'Synthetic isolated UAT delete boundary' })
if (deletedReport.error) throw deletedReport.error
const deletedShiftCurrent = await root.from('shifts').select('version').eq('id', deletedShiftReportShiftId).single()
if (deletedShiftCurrent.error) throw deletedShiftCurrent.error
const deletedShift = await admin.rpc('soft_delete_shift', {
  p_shift_id: deletedShiftReportShiftId,
  p_reason: 'Synthetic isolated UAT deleted shift boundary',
  p_expected_version: deletedShiftCurrent.data.version,
})
if (deletedShift.error) throw deletedShift.error
const archivedParentShift = await root.from('shifts').update({ archived_at: new Date().toISOString() }).eq('id', archivedParentShiftId)
if (archivedParentShift.error) throw archivedParentShift.error

const unrelatedBaselineReport = await root.from('reports').select('id').eq('shift_id', seededShifts.data[4].id).single()
if (unrelatedBaselineReport.error) throw unrelatedBaselineReport.error
const unrelatedReportImage = await admin.rpc('upload_report_image', {
  p_report_id: unrelatedBaselineReport.data.id,
  p_storage_path: 'uat/unrelated.png',
  p_image_url: 'https://example.invalid/uat-unrelated.png',
  p_original_name: 'unrelated.png',
  p_mime_type: 'image/png',
  p_size_bytes: 0,
  p_image_type: 'other',
}).single()
if (unrelatedReportImage.error || !unrelatedReportImage.data) throw unrelatedReportImage.error ?? new Error('UAT_UNRELATED_REPORT_IMAGE_NOT_CREATED')
const authorizedReportImage = await admin.rpc('upload_report_image', {
  p_report_id: directHostReportId,
  p_storage_path: 'uat/authorized.png',
  p_image_url: 'https://example.invalid/uat-authorized.png',
  p_original_name: 'authorized.png',
  p_mime_type: 'image/png',
  p_size_bytes: 0,
  p_image_type: 'other',
}).single()
if (authorizedReportImage.error || !authorizedReportImage.data) throw authorizedReportImage.error ?? new Error('UAT_AUTHORIZED_REPORT_IMAGE_NOT_CREATED')
const unrelatedLiveImage = await admin.rpc('upsert_live_report_image', { p_data: {
  report_id: unrelatedBaselineReport.data.id,
  category: 'other',
  file_url: 'https://example.invalid/uat-unrelated-live.png',
  file_name: 'unrelated.png',
  mime_type: 'image/png',
  size_bytes: 0,
} }).single()
if (unrelatedLiveImage.error || !unrelatedLiveImage.data) throw unrelatedLiveImage.error ?? new Error('UAT_UNRELATED_LIVE_IMAGE_NOT_CREATED')
const authorizedLiveImage = await admin.rpc('upsert_live_report_image', { p_data: {
  report_id: directHostReportId,
  category: 'other',
  file_url: 'https://example.invalid/uat-authorized-live.png',
  file_name: 'authorized.png',
  mime_type: 'image/png',
  size_bytes: 0,
} }).single()
if (authorizedLiveImage.error || !authorizedLiveImage.data) throw authorizedLiveImage.error ?? new Error('UAT_AUTHORIZED_LIVE_IMAGE_NOT_CREATED')
const unlinkedLiveImage = await root.from('live_report_images').insert({
  id: 'uat-live-image-unlinked',
  report_id: null,
  file_url: 'https://example.invalid/uat-unlinked-live.png',
  file_name: 'unlinked.png',
  mime_type: 'image/png',
  size_bytes: 0,
})
if (unlinkedLiveImage.error) throw unlinkedLiveImage.error
console.log('UAT_SEED_STAGE=report_and_image_fixtures_created')

const baselineMember = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } })
const baselineMemberLogin = await baselineMember.auth.signInWithPassword(credentials.find(account => account.role === 'member'))
if (baselineMemberLogin.error) throw baselineMemberLogin.error
const [baselineUnrelated, baselineOpen, baselinePending, baselineUnrelatedList, baselineOpenList, baselinePendingList, baselineRevisions, baselineImages, baselineLiveImages, baselineUnlinkedLiveImage] = await Promise.all([
  baselineMember.from('reports').select('id').eq('id', unrelatedBaselineReport.data.id),
  baselineMember.from('reports').select('id').eq('id', openShiftReportId),
  baselineMember.from('reports').select('id').eq('id', pendingShiftReportId),
  baselineMember.rpc('get_report_list_page', { p_page: 1, p_page_size: 20, p_filters: { shiftIds: [seededShifts.data[4].id] }, p_summary: false }),
  baselineMember.rpc('get_report_list_page', { p_page: 1, p_page_size: 20, p_filters: { shiftIds: [unregisteredOpenShiftId] }, p_summary: false }),
  baselineMember.rpc('get_report_list_page', { p_page: 1, p_page_size: 20, p_filters: { shiftIds: [pendingRegistrationShiftId] }, p_summary: false }),
  baselineMember.rpc('get_report_revisions', { p_report_id: openShiftReportId }),
  baselineMember.from('report_images').select('id').eq('id', unrelatedReportImage.data.id),
  baselineMember.from('live_report_images').select('id').eq('id', unrelatedLiveImage.data.id),
  baselineMember.from('live_report_images').select('id').eq('id', 'uat-live-image-unlinked'),
])
if ([baselineUnrelated, baselineOpen, baselinePending, baselineUnrelatedList, baselineOpenList, baselinePendingList, baselineRevisions, baselineImages, baselineLiveImages, baselineUnlinkedLiveImage].some(result => result.error)) {
  throw new Error('BASELINE_REPORT_READ_REPROBE_FAILED')
}
const baselineObserved = {
  target: 'isolated_local_supabase_before_rc16k_member_report_read_rls',
  authenticatedMember: Boolean(baselineMemberLogin.data.session),
  unrelatedReportRows: baselineUnrelated.data?.length ?? 0,
  openRegistrationWithoutSignupRows: baselineOpen.data?.length ?? 0,
  pendingRegistrationRows: baselinePending.data?.length ?? 0,
  unrelatedInReportListRpc: (baselineUnrelatedList.data?.rows ?? []).some(row => row.id === baselineUnrelated.data?.[0]?.id),
  openInReportListRpc: (baselineOpenList.data?.rows ?? []).some(row => row.id === openShiftReportId),
  pendingInReportListRpc: (baselinePendingList.data?.rows ?? []).some(row => row.id === pendingShiftReportId),
  unrelatedRevisionsReturned: baselineRevisions.data?.length ?? 0,
  unrelatedReportImagesReturned: baselineImages.data?.length ?? 0,
  unrelatedLiveReportImagesReturned: baselineLiveImages.data?.length ?? 0,
  unlinkedLiveReportImagesReturned: baselineUnlinkedLiveImage.data?.length ?? 0,
}
console.log(`UAT_BASELINE_REPRODUCTION=${JSON.stringify(baselineObserved)}`)
if (!baselineObserved.unrelatedReportRows || !baselineObserved.openRegistrationWithoutSignupRows || !baselineObserved.pendingRegistrationRows || !baselineObserved.openInReportListRpc || !baselineObserved.pendingInReportListRpc || !baselineObserved.unrelatedRevisionsReturned || !baselineObserved.unrelatedReportImagesReturned || !baselineObserved.unrelatedLiveReportImagesReturned || !baselineObserved.unlinkedLiveReportImagesReturned) {
  throw new Error('UNAUTHORIZED_REPORT_READ_BASELINE_NOT_REPRODUCED')
}
await writeFile(resolve(process.env.UAT_EVIDENCE_DIR, 'baseline-report-read-reproduction.json'), JSON.stringify({
  ...baselineObserved,
  archivedReportId,
  deletedReportId,
  archivedParentShiftReportId,
  deletedShiftReportId,
  openShiftReportId,
  pendingShiftReportId,
  unregisteredOpenShiftId,
  pendingRegistrationShiftId,
  approvedRegistrationShiftId,
  memberReporterShiftId,
  memberSubmittedReportId: memberSubmittedReport.data.id,
  emptyDashboardReportShiftId,
  artifactFailureReportShiftId,
  unrelatedReportImageId: unrelatedReportImage.data.id,
  authorizedReportImageId: authorizedReportImage.data.id,
  unrelatedLiveImageId: unrelatedLiveImage.data.id,
  authorizedLiveImageId: authorizedLiveImage.data.id,
  allowedEntitlementReportIds: [directHostReportId, directSupportReportId, directTechnicalReportId, approvedOnlyReportId, memberSubmittedReport.data.id],
}, null, 2))

await writeFile(credentialsFile, JSON.stringify(credentials), { mode: 0o600 })
console.log(JSON.stringify({ authUsers: credentials.length, shifts: 131, directAssignments: 3, memberRegistrations: 3, reports: reportCount + 11, credentialFileWritten: true, unauthorizedReadBaselineReproduced: true }))
