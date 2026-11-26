import type { OperationalRole } from '@/lib/types/database.types'

/** Exact persisted source assignment selected for PASS or SWAP. */
export interface SegmentAwareSwapSource {
  registrationId: string
  shiftId: string
  staffingSegmentId: string | null
  operationalRole: OperationalRole
  effectiveStartAt: string
  effectiveEndAt: string
  registrationVersion: number
}

/** Row returned by get_swap_exchange_candidates_v2. */
export interface SegmentAwareSwapExchangeCandidate {
  registration_id: string
  user_id: string
  full_name: string
  operational_role: OperationalRole
  shift_id: string
  staffing_segment_id: string | null
  segment_index: number | null
  effective_start_at: string
  effective_end_at: string
  brand_id: string | null
  authoritative_agency_id: string
}

/** Existing preflight RPC contract; all assignment identity stays server-derived. */
export interface SegmentAwareSwapConflictInput {
  sourceRegistrationId: string
  mode: 'replacement' | 'exchange'
  replacementStaffId?: string | null
  targetShiftId?: string | null
  counterpartRegistrationId?: string | null
}

export type SegmentAwareSwapConflictStatus = 'VERIFIED_CLEAR' | 'CONFLICT' | 'UNKNOWN'
