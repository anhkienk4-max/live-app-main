import type { ShiftOperationalNoteCategory, OperationalRole } from '@/lib/types/database.types'

export type ShiftOperationalNoteWorkflowState =
  | 'draft'
  | 'submitted'
  | 'reviewed'
  | 'correction_requested'
  | 'rejected'

export type ShiftOperationalNoteWorkflowAction =
  | 'save_draft'
  | 'submit'
  | 'approve'
  | 'request_correction'
  | 'reject'

export interface ShiftOperationalNoteWorkflowV1Request {
  action: ShiftOperationalNoteWorkflowAction
  noteId: string | null
  expectedVersion: number | null
  idempotencyKey: string
  shiftId: string | null
  businessDate: string | null
  category: ShiftOperationalNoteCategory | null
  note: string | null
  actualEventTime: string | null
  affectedRole: OperationalRole | null
  affectedUserId: string | null
  staffingSegmentId: string | null
  canonicalIncidentId: string | null
}

export interface ShiftOperationalNoteWorkflowV1Response {
  note: {
    id: string
    shift_id: string
    business_date: string
    category: ShiftOperationalNoteCategory
    note: string
    author_id: string
    actual_event_time: string
    affected_role: OperationalRole | null
    affected_user_id: string | null
    version: number
    workflow_state: ShiftOperationalNoteWorkflowState
    staffing_segment_id: string | null
    canonical_incident_id: string | null
    created_at: string
    updated_at: string
  }
  replayed: boolean
  revision: number
}
