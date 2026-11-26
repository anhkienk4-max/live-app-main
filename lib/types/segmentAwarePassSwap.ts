import type { OperationalRole } from './database.types'

export interface SwapExchangeCandidateV2 {
  registration_id: string
  user_id: string
  full_name: string
  operational_role?: OperationalRole
  shift_id?: string
  staffing_segment_id?: string | null
  segment_index?: number | null
  effective_start_at?: string | null
  effective_end_at?: string | null
  brand_id?: string
  authoritative_agency_id?: string | null
}

export interface SwapExchangeCandidateLegacy {
  registration_id: string
  user_id: string
  full_name: string
}
