/** Delta D V1 interface proposal. The existing C4 RPC remains unchanged. */
export type ShiftIncidentType =
  | 'skip'
  | 'absent'
  | 'authorized_absence'
  | 'late'
  | 'early_leave'
  | 'approved_pass'
  | 'approved_swap'
  | 'planned_reassignment'
  | 'other'

export type ShiftIncidentReviewState = 'pending' | 'confirmed' | 'rejected' | 'corrected'
export type ShiftIncidentRole = 'host' | 'support' | 'technical'

/** IDs mirror the existing C4 text identifiers; idempotencyKey is a UUID. */
export interface ReplaceAssignmentWithIncidentV1Request {
  shiftId: string
  staffingSegmentId: string | null
  registrationId: string
  replacementUserId: string
  role: ShiftIncidentRole
  expectedShiftVersion: number
  expectedRegistrationVersion: number
  effectiveAt: string
  reason: string
  isEmergency: boolean
  idempotencyKey: string
  incidentType: ShiftIncidentType
  evidenceReferenceId: string | null
}

export interface ShiftIncidentV1 {
  id: string
  shiftId: string
  staffingSegmentId: string | null
  originalRegistrationId: string
  originalStaffId: string
  replacementRegistrationId: string | null
  replacementStaffId: string | null
  role: ShiftIncidentRole
  businessDate: string
  incidentType: ShiftIncidentType
  reviewState: ShiftIncidentReviewState
  verifiedLateMinutes: number | null
  version: number
}

/** A facade adds this data to, rather than renames, the existing registration field. */
export interface ReplaceAssignmentIncidentV1Addition {
  canonicalIncident: ShiftIncidentV1
  receiptId: string
}
