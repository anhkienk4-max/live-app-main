/**
 * Core V1 Backup / Restore / Recovery — contract foundation
 * Read-only, docs/constants/helpers only. No production DB changes, no migrations, no destructive restore.
 */

export type BackupEntity = {
  entity: string
  table?: string
  mustRecoverable: boolean
  retention: string
  sensitive: boolean
  notes: string
}

export const BACKUP_SCOPE: BackupEntity[] = [
  { entity: 'users/business users', table: 'public.users', mustRecoverable: true, retention: 'PITR 7d + daily snapshot 30d', sensitive: true, notes: 'email, phone, role, account_status; must retain historical references' },
  { entity: 'shifts', table: 'public.shifts', mustRecoverable: true, retention: 'PITR 7d + daily snapshot 30d', sensitive: false, notes: 'operational core, FK to brand/platform/campaign' },
  { entity: 'shift registrations', table: 'public.shift_registrations', mustRecoverable: true, retention: 'PITR 7d + daily snapshot 30d', sensitive: false, notes: 'canonical staffing source of truth' },
  { entity: 'swap requests/history', table: 'public.swap_requests', mustRecoverable: true, retention: 'PITR 7d + daily snapshot 30d', sensitive: false, notes: 'includes approval_history' },
  { entity: 'reports', table: 'public.reports', mustRecoverable: true, retention: 'PITR 7d + daily snapshot 30d', sensitive: false, notes: 'report + revisions, linked shift' },
  { entity: 'import batches/rows', table: 'public.schedule_import_batches + rows', mustRecoverable: true, retention: '30d (import batches)', sensitive: false, notes: 'batch → rows FK must remain intact' },
  { entity: 'master data (brand/platform/campaign)', table: 'public.brands, platforms, campaigns', mustRecoverable: true, retention: 'PITR 7d + daily snapshot 30d', sensitive: false, notes: 'historical refs must remain readable after archive' },
  { entity: 'auth.users', table: 'auth.users', mustRecoverable: true, retention: 'PITR 7d + Supabase auth backup', sensitive: true, notes: 'Supabase Auth, sensitive: password hash, email, provider' },
]

export const RETENTION_EXPECTATION = 'Core V1: Supabase PITR 7 days + daily logical snapshot retained 30 days, weekly retained 90 days where available; audit logs 90d per settings'
export const SENSITIVE_CONSIDERATIONS = 'Sensitive data (email, phone, auth hash, tokens) must be encrypted at rest, excluded from plaintext emergency export, and redacted in logs; emergency export contains only operational fields'

export const RPO_TARGET = '24h' // Recovery Point Objective
export const RTO_TARGET = '4h' // Recovery Time Objective
export const RPO_RTO_ASSUMPTIONS = [
  'Supabase PITR enabled (7d)',
  'Daily logical backup via pg_dump or Supabase dashboard',
  'No cross-region DR in Core V1 (single region)',
  'RPO measured from last successful snapshot/PITR point',
  'RTO assumes 1h verification + 1h restore + 1h validation + 1h smoke',
  'No enterprise infrastructure invented',
] as const

export const RESTORE_PROCEDURE_STEPS = [
  'backup selection (verify timestamp + checksum)',
  'target verification (confirm project/branch, not production overwrite)',
  'maintenance/write freeze (enable maintenance mode, block writes)',
  'restore (PITR or snapshot restore to staging target first)',
  'schema/migration verification (compare supabase/migrations lineage)',
  'integrity validation (orphan, row counts, FK checks)',
  'permission/RLS validation (role matrix, RLS policies)',
  'operational smoke (calendar/shift/registration/report/swap reads)',
  'reopen writes (disable maintenance, monitor)',
] as const

export type RestoreValidationResult = {
  tablesExist: boolean
  orphans: { kind: string; count: number }[]
  rowCounts: Record<string, number>
  migrationLineageOk: boolean
  authIdentityConsistent: boolean
  registrationIntegrityOk: boolean
  swapIntegrityOk: boolean
  reportIntegrityOk: boolean
}

// Pure read-only helpers — reuse data-integrity logic if needed, duplicated minimally here to avoid cross-branch dependency
function hasOrphans(issues: { kind: string }[], kind: string): boolean {
  return issues.some(i => i.kind === kind)
}

export function validateRestore(params: {
  tables: string[]
  requiredTables: string[]
  orphanIssues: { kind: string }[]
  rowCounts: Record<string, number>
  expectedMigrations: string[]
  appliedMigrations: string[]
  authBusinessPairs: { authId: string; businessId: string; email: string }[]
  registrations: { id: string; shift_id: string; user_id: string; status: string; operational_role: string }[]
  shifts: { id: string }[]
  users: { id: string }[]
  swaps: { id: string; requester_id: string; source_shift_id?: string }[]
  reports: { id: string; shift_id: string }[]
}): RestoreValidationResult & { ok: boolean } {
  const tablesExist = params.requiredTables.every(t => params.tables.includes(t))
  const orphansByKind = params.orphanIssues.reduce<Record<string, number>>((acc, o) => {
    acc[o.kind] = (acc[o.kind] || 0) + 1
    return acc
  }, {})
  const orphans = Object.entries(orphansByKind).map(([kind, count]) => ({ kind, count }))
  const rowCounts = params.rowCounts
  const migrationLineageOk = params.expectedMigrations.every(m => params.appliedMigrations.includes(m))
  const authIdentityConsistent = params.authBusinessPairs.every(p => p.authId === p.businessId && p.email.includes('@'))
  // registration integrity: no duplicate active same user/shift/role where forbidden (simplified)
  const seen = new Set<string>()
  let duplicate = false
  for (const r of params.registrations) {
    if (['cancelled', 'rejected', 'removed'].includes(r.status)) continue
    const key = `${r.shift_id}:${r.user_id}:${r.operational_role}`
    if (seen.has(key)) { duplicate = true; break }
    seen.add(key)
  }
  const registrationIntegrityOk = !duplicate && !hasOrphans(params.orphanIssues, 'registration_shift') && !hasOrphans(params.orphanIssues, 'registration_user')
  const swapIntegrityOk = !hasOrphans(params.orphanIssues, 'swap_shift') && !hasOrphans(params.orphanIssues, 'swap_registration')
  const reportIntegrityOk = !hasOrphans(params.orphanIssues, 'report_shift')
  const ok = tablesExist && migrationLineageOk && authIdentityConsistent && registrationIntegrityOk && swapIntegrityOk && reportIntegrityOk
  return { tablesExist, orphans, rowCounts, migrationLineageOk, authIdentityConsistent, registrationIntegrityOk, swapIntegrityOk, reportIntegrityOk, ok }
}

export type EmergencyExportDataset = {
  name: string
  entities: string[]
  fields: string[]
  sensitiveExcluded: string[]
  purpose: string
}

export const EMERGENCY_EXPORT_DATASET: EmergencyExportDataset[] = [
  { name: 'schedule', entities: ['shifts'], fields: ['id', 'date', 'start_time', 'end_time', 'brand_id', 'platform_id', 'campaign_id', 'status'], sensitiveExcluded: [], purpose: 'continue schedule ops' },
  { name: 'staffing', entities: ['shift_registrations'], fields: ['id', 'shift_id', 'user_id', 'operational_role', 'status'], sensitiveExcluded: [], purpose: 'staffing assignments' },
  { name: 'users/staff', entities: ['users'], fields: ['id', 'email', 'full_name', 'role', 'operational_roles', 'status'], sensitiveExcluded: ['phone', 'auth hash'], purpose: 'staff directory' },
  { name: 'reports/status', entities: ['reports'], fields: ['id', 'shift_id', 'status', 'revenue', 'orders'], sensitiveExcluded: [], purpose: 'report status' },
  { name: 'swaps/status', entities: ['swap_requests'], fields: ['id', 'requester_id', 'source_shift_id', 'status', 'mode'], sensitiveExcluded: [], purpose: 'swap queue' },
]

export function buildEmergencyExportPayload(params: {
  shifts: any[]
  registrations: any[]
  users: any[]
  reports: any[]
  swaps: any[]
}): Record<string, any> {
  // Minimal, no UI, just data shape for manual ops
  return {
    generated_at: new Date().toISOString(),
    schedule: params.shifts.map(s => ({ id: s.id, date: s.date, start_time: s.start_time, end_time: s.end_time, brand_id: s.brand_id, platform_id: s.platform_id, status: s.status })),
    staffing: params.registrations.map(r => ({ id: r.id, shift_id: r.shift_id, user_id: r.user_id, operational_role: r.operational_role, status: r.status })),
    users: params.users.map(u => ({ id: u.id, email: u.email, full_name: u.full_name, operational_roles: u.operational_roles, status: u.status })),
    reports: params.reports.map(r => ({ id: r.id, shift_id: r.shift_id, status: r.status })),
    swaps: params.swaps.map(s => ({ id: s.id, requester_id: s.requester_id, source_shift_id: s.source_shift_id, status: s.status })),
  }
}

export type AdminRecoveryRequirement = {
  rule: string
  required: boolean
  notes: string
}

export const ADMIN_RECOVERY_CONTRACT: AdminRecoveryRequirement[] = [
  { rule: 'authorized Admin only (hasPermission staff.manage)', required: true, notes: 'Member/Leader cannot perform recovery' },
  { rule: 'mandatory reason (non-empty string)', required: true, notes: 'audit reason required' },
  { rule: 'before/after snapshot (full row before, after)', required: true, notes: 'stored in audit before/after' },
  { rule: 'audit event (module/action, actor, timestamp, correlation)', required: true, notes: 'audit staff.* with reason' },
  { rule: 'no silent destructive correction (no hard delete without audit)', required: true, notes: 'soft delete/archive only, hard delete forbidden for referenced entities' },
]

export function validateAdminRecovery(input: {
  actorHasAdmin: boolean
  reason?: string
  before?: Record<string, unknown> | null
  after?: Record<string, unknown> | null
  auditLogged: boolean
  hardDelete: boolean
}): { ok: boolean; errors: string[] } {
  const errors: string[] = []
  if (!input.actorHasAdmin) errors.push('actor must be Admin')
  if (!input.reason || !input.reason.trim()) errors.push('reason required')
  if (!input.before) errors.push('before snapshot required')
  if (!input.after) errors.push('after snapshot required')
  if (!input.auditLogged) errors.push('audit event required')
  if (input.hardDelete) errors.push('hard delete not allowed')
  return { ok: errors.length === 0, errors }
}

export type FailureScenario = {
  id: string
  title: string
  detect: string
  contain: string
  recover: string
  verify: string
  severity: 'P0' | 'P1' | 'P2'
}

export const FAILURE_SCENARIOS: FailureScenario[] = [
  { id: 'accidental_archive', title: 'Accidental archive (user/brand/shift)', detect: 'archive via audit staff.archive + orphan check', contain: 'block further archives, set maintenance', recover: 'restore via userService.restore with reason + audit', verify: 'historical getAllIncludingDeleted still shows, orphan 0, permission check', severity: 'P1' },
  { id: 'bad_import', title: 'Bad import (duplicate/validation_failed)', detect: 'import batch status failed + validation_failed rows', contain: 'freeze import confirm, keep batch preview', recover: 'disambiguate master data, retry import with same batchId idempotency', verify: 'duplicate_skipped deterministic, row counts', severity: 'P1' },
  { id: 'duplicate_operation', title: 'Duplicate operation (double approve/create)', detect: 'duplicate active registration key or idempotency key collision', contain: 'idempotency check (hasDuplicateActiveRegistration)', recover: 'second call fails closed via RPC status check, no duplicate', verify: 'only one canonical registration, second error code', severity: 'P1' },
  { id: 'missing_fk_orphan', title: 'Missing FK / orphan (registration→missing shift)', detect: 'orphan helper findOrphanRegistrations', contain: 'block writes, quarantine orphan', recover: 'restore missing master from backup, re-link, or soft-restore archived entity', verify: 'orphan count 0 after restore', severity: 'P0' },
  { id: 'partial_external_failure', title: 'Partial external failure (Supabase unavailable)', detect: 'Supabase RPC throws, createClient fails closed', contain: 'fail closed, no mock fallback, surface error', recover: 'retry with same idempotency key after Supabase back', verify: 'row counts unchanged, no partial mock', severity: 'P1' },
  { id: 'failed_migration_deploy', title: 'Failed migration/deploy', detect: 'migration lineage mismatch (expected vs applied)', contain: 'block writes, keep previous deployment', recover: 'rollback to previous backup/snapshot, verify schema', verify: 'migration lineage ok, smoke calendar/shift reads', severity: 'P0' },
  { id: 'supabase_unavailable', title: 'Supabase unavailable', detect: 'health check / Supabase URL/auth fails', contain: 'fail closed, emergency export for manual ops', recover: 'restore from latest snapshot when back', verify: 'emergency export available, then reconciliation', severity: 'P0' },
]

export const BUSINESS_CONTINUITY_STEPS = [
  'latest operational export (schedule + staffing + users + reports + swaps via buildEmergencyExportPayload)',
  'temporary manual operation (spreadsheet/calendar manual, no app writes)',
  'later reconciliation back to LIVE OPS (re-import validated rows, re-apply staffing via canonical ShiftRegistration)',
] as const

export const RECOVERY_GAPS = [
  { gap: 'No automated backup verification job in Core V1', severity: 'P1' as const, recommended: 'Add daily cron that validates backup checksum + row counts' },
  { gap: 'No cross-region DR', severity: 'P2' as const, recommended: 'Document single-region RPO 24h, no enterprise DR in V1' },
  { gap: 'Emergency export is manual (no scheduled export)', severity: 'P1' as const, recommended: 'Add weekly manual export or on-demand button (no UI in this task)' },
] as const
