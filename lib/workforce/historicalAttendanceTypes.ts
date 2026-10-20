export type AttendanceSourceType =
  | 'google_sheets'
  | 'excel_upload'
  | 'csv_upload'
  | 'shift_manager_control'

export type SourceProfileId =
  | 'opella_t10'
  | 'pepsico_t10'
  | 'control_timesheets'
  | 'custom'

export type DateOrderOption = 'month-first' | 'day-first' | 'iso'

export interface SourceProfile {
  id: SourceProfileId
  name: string
  dateOrder: DateOrderOption
  sourceType: AttendanceSourceType
  hasNativeSerials?: boolean
  validateWeekday?: boolean
  columnMapping?: Record<string, string>
}

export type AttendanceEvidenceKind =
  | 'actual_punch'          // Real biometric/app check-in/out timestamp or confirmed ActualStartLocal/ActualEndLocal
  | 'supervisor_verified'   // Supervisor explicitly certified actual attendance with confirmed note and physical times
  | 'missing_evidence'      // Only scheduled hours present; no proof of actual working hours

export type AttendanceExceptionCode =
  | 'SHIFT_NOT_FOUND'
  | 'STAFF_NOT_FOUND'
  | 'ROLE_AMBIGUOUS'
  | 'MISSING_EVIDENCE'
  | 'SHIFT_NOT_COMPLETED'
  | 'TIME_RANGE_INVALID'
  | 'OVERLAP_CONFLICT'
  | 'UNRESOLVED_PASS'
  | 'AMBIGUOUS_DATE_ORDER'
  | 'WEEKDAY_MISMATCH'
  | 'INVALID_CONTROL_STRUCTURE'

export type AttendanceRowStatus =
  | 'pending'
  | 'matched'
  | 'exception'
  | 'drafted'
  | 'rejected'

export interface RawAttendanceInputRow {
  rowNumber: number
  date?: string | number // String or Excel/Sheets numeric serial
  weekday?: string       // e.g. "Thứ Hai", "Thứ Năm", "Monday"
  timeRange?: string
  startTime?: string
  endTime?: string
  brand?: string
  platform?: string
  title?: string
  shiftCode?: string
  hostName?: string
  assistantName?: string
  technicalName?: string
  staffName?: string
  staffEmail?: string
  role?: string
  coverageKind?: string
  notes?: string
  checkIn?: string
  checkOut?: string
  approvedOtMinutes?: number
  confirmedBy?: string
  confirmedAt?: string
}

/**
 * ADA SHIFT MANAGER · CONTROL exact TIMESHEETS contract
 */
export interface ControlTimesheetRow {
  rowNumber: number
  ShiftID: string
  StaffEmail: string
  WorkRole: 'host' | 'support' | 'technical' | string
  ActualStartLocal: string
  ActualEndLocal: string
  BreakMinutes?: number | string
  ActualLateMinutes?: number | string
  Status: string
  Note?: string
  ShiftFingerprint?: string
  ConfirmedBy?: string
  ConfirmedAt?: string
  CreatedBy?: string
  CreatedAt?: string
  UpdatedAt?: string
}

export interface ParsedAttendanceSegment {
  rowNumber: number
  parsedDate: string // YYYY-MM-DD
  startTime: string  // HH:mm
  endTime: string    // HH:mm
  startAtIso: string // timestamptz ISO in Asia/Ho_Chi_Minh
  endAtIso: string   // timestamptz ISO in Asia/Ho_Chi_Minh
  durationMinutes: number
  rawStaffName: string
  normalizedStaffName: string
  staffEmail?: string
  operationalRole: 'host' | 'support' | 'technical'
  coverageKind: 'planned' | 'cover' | 'replacement' | 'extra'
  passTargetStaffName?: string
  evidenceKind: AttendanceEvidenceKind
  approvedOtMinutes?: number
  rawNotes: string
  shiftIdHint?: string
  confirmedBy?: string
  confirmedAt?: string
}

export interface AttendanceMatchResult {
  rowNumber: number
  segment: ParsedAttendanceSegment
  status: AttendanceRowStatus
  matchedShiftId?: string
  matchedStaffId?: string
  confidence: 'exact' | 'high' | 'low' | 'unmatched' | 'none'
  exceptionCode?: AttendanceExceptionCode
  exceptionDetail?: string
}

export interface AttendanceImportBatchSummary {
  batchId: string
  sourceProfileId?: SourceProfileId
  sourceType: AttendanceSourceType
  sourceName: string
  sourceFingerprint: string
  totalRows: number
  matchedRows: number
  exceptionRows: number
  draftedSegments: number
  exceptionsSummary: Record<AttendanceExceptionCode, number>
}
