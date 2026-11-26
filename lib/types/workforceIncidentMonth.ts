import type { ShiftIncidentType } from '@/lib/types/shiftIncidentContract'

export type WorkforceIncidentMonthlyState = 'pending' | 'confirmed' | 'rejected' | 'corrected'

export interface WorkforceIncidentMonthlyItem {
  incidentId: string
  shiftId: string
  staffingSegmentId: string | null
  role: 'host' | 'support' | 'technical'
  businessDate: string
  type: ShiftIncidentType
  reviewState: WorkforceIncidentMonthlyState
  verifiedLateMinutes: number | null
  version: number
}

export interface WorkforceIncidentMonthlyStaffSummary {
  staff_id: string
  incident_count: number
  distinct_shift_count: number
  pending_count: number
  confirmed_count: number
  rejected_count: number
  corrected_count: number
  confirmed_skip_count: number
  confirmed_absent_count: number
  confirmed_authorized_absence_count: number
  confirmed_late_count: number
  confirmed_early_leave_count: number
  approved_pass_count: number
  approved_swap_count: number
  unknown_late_minutes_count: number
  verified_late_minutes_total: number
  items: WorkforceIncidentMonthlyItem[]
}

export interface WorkforceIncidentMonthlyResponse {
  month: string
  timezone: 'Asia/Ho_Chi_Minh'
  pageLimit: number
  pageOffset: number
  totalIncidents: number
  /** Count over the complete authorized and filtered scope, before pagination. */
  totalDistinctShifts: number
  /** Count over the complete authorized and filtered scope, before pagination. */
  totalDistinctStaff: number
  staff: WorkforceIncidentMonthlyStaffSummary[]
}
