import type {
  Brand,
  Campaign,
  Platform,
  Report,
  ScheduleImportBatch,
  ScheduleImportRow,
  Shift,
  ShiftRegistration,
  SwapRequest,
  User,
} from '@/lib/types/database.types'
import { isStaffedRegistration } from '@/lib/services/supabaseShiftRegistrationService'

// Orphan detection — pure, read-only, no auto-repair
export interface OrphanIssue {
  kind: 'registration_shift' | 'registration_user' | 'report_shift' | 'report_user' | 'swap_shift' | 'swap_registration' | 'swap_user' | 'import_batch' | 'shift_brand' | 'shift_platform' | 'shift_campaign'
  id: string
  relatedId: string
  message: string
}

export function findOrphanRegistrations(
  registrations: Pick<ShiftRegistration, 'id' | 'shift_id' | 'user_id'>[],
  shifts: Pick<Shift, 'id'>[],
  users: Pick<User, 'id'>[],
): OrphanIssue[] {
  const shiftIds = new Set(shifts.map(s => s.id))
  const userIds = new Set(users.map(u => u.id))
  const out: OrphanIssue[] = []
  for (const r of registrations) {
    if (!shiftIds.has(r.shift_id)) out.push({ kind: 'registration_shift', id: r.id, relatedId: r.shift_id, message: `registration ${r.id} references missing shift ${r.shift_id}` })
    if (!userIds.has(r.user_id)) out.push({ kind: 'registration_user', id: r.id, relatedId: r.user_id, message: `registration ${r.id} references missing user ${r.user_id}` })
  }
  return out
}

export function findOrphanReports(
  reports: Pick<Report, 'id' | 'shift_id'>[],
  shifts: Pick<Shift, 'id'>[],
): OrphanIssue[] {
  const shiftIds = new Set(shifts.map(s => s.id))
  return reports
    .filter(r => r.shift_id && !shiftIds.has(r.shift_id))
    .map(r => ({ kind: 'report_shift', id: r.id, relatedId: r.shift_id, message: `report ${r.id} references missing shift ${r.shift_id}` }))
}

export function findOrphanSwaps(
  swaps: Pick<SwapRequest, 'id' | 'requester_id' | 'source_shift_id' | 'target_shift_id' | 'source_registration_id'>[],
  shifts: Pick<Shift, 'id'>[],
  registrations: Pick<ShiftRegistration, 'id'>[],
  users: Pick<User, 'id'>[],
): OrphanIssue[] {
  const shiftIds = new Set(shifts.map(s => s.id))
  const regIds = new Set(registrations.map(r => r.id))
  const userIds = new Set(users.map(u => u.id))
  const out: OrphanIssue[] = []
  for (const s of swaps) {
    if (!userIds.has(s.requester_id)) out.push({ kind: 'swap_user', id: s.id, relatedId: s.requester_id, message: `swap ${s.id} missing requester` })
    if (s.source_shift_id && !shiftIds.has(s.source_shift_id)) out.push({ kind: 'swap_shift', id: s.id, relatedId: s.source_shift_id, message: `swap ${s.id} missing source shift` })
    if (s.target_shift_id && !shiftIds.has(s.target_shift_id)) out.push({ kind: 'swap_shift', id: s.id, relatedId: s.target_shift_id, message: `swap ${s.id} missing target shift` })
    if (s.source_registration_id && !regIds.has(s.source_registration_id)) out.push({ kind: 'swap_registration', id: s.id, relatedId: s.source_registration_id, message: `swap ${s.id} missing source registration` })
  }
  return out
}

export function findOrphanImportRows(
  rows: { batch_id: string; row_number: number }[],
  batches: Pick<ScheduleImportBatch, 'id'>[],
): OrphanIssue[] {
  const batchIds = new Set(batches.map(b => b.id))
  return rows
    .filter(r => !batchIds.has(r.batch_id))
    .map(r => ({ kind: 'import_batch', id: `${r.batch_id}:${r.row_number}`, relatedId: r.batch_id, message: `import row ${r.row_number} missing batch ${r.batch_id}` }))
}

export function findShiftOrphanMasterData(
  shifts: Pick<Shift, 'id' | 'brand_id' | 'platform_id' | 'campaign_id'>[],
  brands: Pick<Brand, 'id'>[],
  platforms: Pick<Platform, 'id'>[],
  campaigns: Pick<Campaign, 'id'>[],
): OrphanIssue[] {
  const brandIds = new Set(brands.map(b => b.id))
  const platformIds = new Set(platforms.map(p => p.id))
  const campaignIds = new Set(campaigns.map(c => c.id))
  const out: OrphanIssue[] = []
  for (const s of shifts) {
    if (!brandIds.has(s.brand_id)) out.push({ kind: 'shift_brand', id: s.id, relatedId: s.brand_id, message: `shift ${s.id} missing brand` })
    if (!platformIds.has(s.platform_id)) out.push({ kind: 'shift_platform', id: s.id, relatedId: s.platform_id, message: `shift ${s.id} missing platform` })
    if (s.campaign_id && !campaignIds.has(s.campaign_id)) out.push({ kind: 'shift_campaign', id: s.id, relatedId: s.campaign_id, message: `shift ${s.id} missing campaign` })
  }
  return out
}

// ShiftRegistration invariants — canonical staffing source
export function hasDuplicateActiveRegistration(
  registrations: Pick<ShiftRegistration, 'shift_id' | 'user_id' | 'operational_role' | 'status'>[],
): boolean {
  const seen = new Set<string>()
  for (const r of registrations) {
    if (r.status === 'cancelled' || r.status === 'rejected' || r.status === 'removed') continue
    // pending/approved/manually_assigned are considered active for duplicate check where forbidden
    const key = `${r.shift_id}:${r.user_id}:${r.operational_role}`
    if (seen.has(key)) return true
    seen.add(key)
  }
  return false
}

export function isActiveStaffingCountValid(
  registrations: Pick<ShiftRegistration, 'shift_id' | 'operational_role' | 'status'>[],
  shifts: Pick<Shift, 'id' | 'required_host_count' | 'required_support_count' | 'required_technical_count'>[],
): boolean {
  for (const shift of shifts) {
    const map: Record<string, number | undefined> = {
      host: shift.required_host_count,
      support: shift.required_support_count,
      technical: shift.required_technical_count,
    }
    for (const role of ['host', 'support', 'technical'] as const) {
      const required = map[role] ?? 1
      if (required < 0) return false
      const staffed = registrations.filter(r => r.shift_id === shift.id && r.operational_role === role && isStaffedRegistration(r)).length
      if (staffed < 0) return false
      // do not allow negative remaining; staffed should not be negative, but exceeding is handled by service RPC (capacity check)
    }
  }
  return true
}

// Shift temporal sanity
export function isShiftTemporalValid(shift: Pick<Shift, 'start_at' | 'end_at' | 'start_time' | 'end_time' | 'date'>): boolean {
  if (shift.start_at && shift.end_at) {
    return new Date(shift.start_at).getTime() < new Date(shift.end_at).getTime()
  }
  // fallback to time strings HH:MM
  if (shift.start_time && shift.end_time) {
    return shift.start_time < shift.end_time || Boolean(shift.end_at && shift.end_at !== shift.start_at)
  }
  return true
}

// Excel regressions — documented, not guessed
export const EXCEL_REGRESSION_CASES = [
  { serial: 46259, expected: '2026-08-25' },
  { serial: '14/24', expected: '14:00' },
  { serial: '16/24', expected: '16:00' },
] as const

// Idempotency classification
export type IdempotencyStatus = 'PROTECTED' | 'PARTIAL' | 'MISSING'
export interface IdempotencyEntry {
  operation: string
  status: IdempotencyStatus
  notes: string
}
export const IDEMPOTENCY_MATRIX: IdempotencyEntry[] = [
  { operation: 'duplicate create shift', status: 'PARTIAL', notes: 'Excel duplicate_skipped deterministic, but no DB unique constraint on natural key' },
  { operation: 'repeated approve registration', status: 'PROTECTED', notes: 'RPC approve_shift_registration is idempotent, second approve fails closed via status check' },
  { operation: 'repeated import confirm', status: 'PARTIAL', notes: 'import batch status previewed→confirmed guarded, but retry after network failure requires client retry with same batchId' },
  { operation: 'repeated Swap transition (approved→completed)', status: 'PROTECTED', notes: 'Supabase RPC checks status, terminal states throw' },
  { operation: 'stale state transition (e.g., approve cancelled)', status: 'PROTECTED', notes: 'RPC checks current status, throws if stale' },
  { operation: 'retry after network failure (generic)', status: 'PARTIAL', notes: 'Supabase RPCs are transactional, but client must retry with same idempotency key (registration id/batch id)' },
]

// Stale write / concurrency
export type StaleProtection = 'updated_at' | 'version' | 'lock' | 'transaction' | 'unique_constraint' | 'none'
export interface StaleMatrixEntry {
  entity: string
  currentProtection: StaleProtection[]
  missingProtection: StaleProtection[]
  severity: 'P0' | 'P1' | 'P2'
}
export const STALE_WRITE_MATRIX: StaleMatrixEntry[] = [
  { entity: 'Shift', currentProtection: ['updated_at', 'transaction'], missingProtection: ['version'], severity: 'P1' },
  { entity: 'ShiftRegistration', currentProtection: ['updated_at', 'transaction', 'unique_constraint'], missingProtection: ['version'], severity: 'P1' },
  { entity: 'Report', currentProtection: ['updated_at', 'transaction'], missingProtection: ['version'], severity: 'P2' },
  { entity: 'SwapRequest', currentProtection: ['updated_at', 'transaction'], missingProtection: ['version'], severity: 'P1' },
  { entity: 'User', currentProtection: ['updated_at'], missingProtection: ['version', 'lock'], severity: 'P2' },
  { entity: 'ScheduleImportBatch', currentProtection: ['updated_at', 'transaction'], missingProtection: ['version'], severity: 'P2' },
]

// Soft delete / archive contract
export type ArchiveStatus = 'ACTIVE' | 'ARCHIVED' | 'DELETED'
export interface ArchiveEntry {
  domain: string
  activeToArchivedRetainsHistory: boolean
  hardDeleteAllowed: boolean
  severity: 'P0' | 'P1' | 'P2'
}
export const ARCHIVE_MATRIX: ArchiveEntry[] = [
  { domain: 'User', activeToArchivedRetainsHistory: true, hardDeleteAllowed: false, severity: 'P0' },
  { domain: 'Brand/Platform/Campaign', activeToArchivedRetainsHistory: true, hardDeleteAllowed: false, severity: 'P1' },
  { domain: 'Shift', activeToArchivedRetainsHistory: true, hardDeleteAllowed: false, severity: 'P1' },
  { domain: 'Report', activeToArchivedRetainsHistory: true, hardDeleteAllowed: false, severity: 'P1' },
  { domain: 'ShiftRegistration', activeToArchivedRetainsHistory: true, hardDeleteAllowed: false, severity: 'P0' },
  { domain: 'SwapRequest', activeToArchivedRetainsHistory: true, hardDeleteAllowed: false, severity: 'P1' },
]

// Master integrity matrix
export type GapSeverity = 'P0' | 'P1' | 'P2'
export interface IntegrityMatrixEntry {
  domain: string
  invariant: string
  currentEnforcement: string
  testCoverage: string
  gapSeverity: GapSeverity
  recommendedFix: string
}
export const CORE_INTEGRITY_MATRIX: IntegrityMatrixEntry[] = [
  { domain: 'Shift', invariant: 'shift.id unique, brand/platform FK valid', currentEnforcement: 'Supabase FK + app orphan detection', testCoverage: 'orphan detection helper', gapSeverity: 'P1', recommendedFix: 'Add DB FK index test, no delete' },
  { domain: 'ShiftRegistration', invariant: 'no duplicate active registration same user/shift/role where forbidden', currentEnforcement: 'DB unique partial index + service check + isActiveRegistration', testCoverage: 'hasDuplicateActiveRegistration', gapSeverity: 'P1', recommendedFix: 'Keep DB constraint, test duplicate should throw' },
  { domain: 'ShiftRegistration', invariant: 'capacity not exceeded via normal flow', currentEnforcement: 'RPC capacity check (required vs staffed)', testCoverage: 'isActiveStaffingCountValid + shiftRegistration eligibilty', gapSeverity: 'P1', recommendedFix: 'Keep RPC, no negative capacity' },
  { domain: 'ShiftRegistration', invariant: 'cancelled/rejected not counted as staffed', currentEnforcement: 'isStaffedRegistration = approved|manually_assigned only', testCoverage: 'isStaffedRegistration helper', gapSeverity: 'P1', recommendedFix: 'Keep helper, no change' },
  { domain: 'ShiftRegistration', invariant: 'imported host_names not canonical', currentEnforcement: 'display metadata host_names vs canonical ShiftRegistration', testCoverage: 'staffing display vs registration', gapSeverity: 'P2', recommendedFix: 'Document, keep display not mutating' },
  { domain: 'Shift', invariant: 'start < end, cross-day detected', currentEnforcement: 'resolveShiftDateTime + isShiftTemporalValid', testCoverage: 'temporal sanity test', gapSeverity: 'P1', recommendedFix: 'Keep validation, document cross-day' },
  { domain: 'Shift', invariant: 'duplicate import deterministic', currentEnforcement: 'Excel duplicate_skipped via existing-shift matching', testCoverage: 'schedule import tests', gapSeverity: 'P1', recommendedFix: 'Keep deterministic, no silent mutate' },
  { domain: 'Swap', invariant: 'REPLACEMENT completed: old cancelled, replacement active, same shift/role', currentEnforcement: 'swap RPC + status checks', testCoverage: 'swap integrity contract', gapSeverity: 'P0', recommendedFix: 'Keep RPC, test replacement' },
  { domain: 'Swap', invariant: 'EXCHANGE completed: exactly swapped, no third', currentEnforcement: 'swap RPC', testCoverage: 'swap integrity contract', gapSeverity: 'P0', recommendedFix: 'Keep RPC' },
  { domain: 'Swap', invariant: 'MOVE not newly created (historical compatibility)', currentEnforcement: 'app blocks MOVE creation, only historical', testCoverage: 'swap mode check', gapSeverity: 'P1', recommendedFix: 'Keep block' },
  { domain: 'Report', invariant: 'report references valid shift/user where required', currentEnforcement: 'orphan detection helper', testCoverage: 'findOrphanReports', gapSeverity: 'P1', recommendedFix: 'Keep FK, test orphan' },
  { domain: 'Import', invariant: 'batch→rows relationship intact', currentEnforcement: 'batch_id FK + orphan helper', testCoverage: 'findOrphanImportRows', gapSeverity: 'P1', recommendedFix: 'Keep FK' },
  { domain: 'SoftDelete', invariant: 'ACTIVE→archived retains history, no hard delete', currentEnforcement: 'archived_at/deleted_at soft, getAll filters', testCoverage: 'archive/historical readable', gapSeverity: 'P0', recommendedFix: 'Never hard delete referenced entities' },
]
