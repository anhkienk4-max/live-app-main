import {
  AttendanceImportBatchSummary,
  AttendanceMatchResult,
  RawAttendanceInputRow,
  ControlTimesheetRow,
  SourceProfileId,
  DateOrderOption,
} from './historicalAttendanceTypes'
import {
  parseRawAttendanceRow,
  parseControlTimesheetRow,
  SOURCE_PROFILES,
} from './historicalAttendanceParser'
import {
  createSourceFingerprint,
  matchSegmentToShift,
  ShiftReference,
  StaffReference,
} from './historicalAttendanceMatcher'

export interface PreviewAttendanceImportOptions {
  batchId?: string
  sourceProfileId?: SourceProfileId
  dateOrder?: DateOrderOption
  sourceType: 'google_sheets' | 'excel_upload' | 'csv_upload' | 'shift_manager_control'
  sourceName: string
  rawRows?: RawAttendanceInputRow[]
  controlRows?: ControlTimesheetRow[]
  brandName?: string
  shifts: ShiftReference[]
  staffList: StaffReference[]
  existingSegments?: Array<{ staffId: string; startAt: string; endAt: string }>
}

export interface PreviewAttendanceImportResult {
  batchId: string
  sourceFingerprint: string
  results: AttendanceMatchResult[]
  summary: AttendanceImportBatchSummary
  errors: string[]
}

/**
 * Parses and matches all attendance input rows, classifying into matched vs exceptions.
 */
export function previewAttendanceImport(
  options: PreviewAttendanceImportOptions
): PreviewAttendanceImportResult {
  const {
    batchId = `batch-${Date.now()}`,
    sourceProfileId = 'opella_t10',
    dateOrder,
    sourceType,
    sourceName,
    rawRows = [],
    controlRows = [],
    brandName,
    shifts,
    staffList,
    existingSegments = [],
  } = options

  const sourceProfile = SOURCE_PROFILES[sourceProfileId] || SOURCE_PROFILES.opella_t10
  const profile = dateOrder ? { ...sourceProfile, dateOrder } : sourceProfile
  const payloadString = JSON.stringify(controlRows.length > 0 ? controlRows : rawRows)
  const sourceFingerprint = createSourceFingerprint(payloadString)

  const matchResults: AttendanceMatchResult[] = []
  const parseErrors: string[] = []

  const exceptionCounters = {
    SHIFT_NOT_FOUND: 0,
    STAFF_NOT_FOUND: 0,
    ROLE_AMBIGUOUS: 0,
    MISSING_EVIDENCE: 0,
    SHIFT_NOT_COMPLETED: 0,
    TIME_RANGE_INVALID: 0,
    OVERLAP_CONFLICT: 0,
    UNRESOLVED_PASS: 0,
    AMBIGUOUS_DATE_ORDER: 0,
    WEEKDAY_MISMATCH: 0,
    INVALID_CONTROL_STRUCTURE: 0,
  }

  // 1. Process CONTROL TIMESHEETS rows if provided
  if (controlRows.length > 0) {
    for (const ctrlRow of controlRows) {
      const { segment, error, exceptionCode } = parseControlTimesheetRow(ctrlRow)
      if (error || !segment) {
        parseErrors.push(error || `Row ${ctrlRow.rowNumber}: Lỗi định dạng CONTROL`)
        const code = exceptionCode || 'INVALID_CONTROL_STRUCTURE'
        exceptionCounters[code] = (exceptionCounters[code] || 0) + 1
        matchResults.push({
          rowNumber: ctrlRow.rowNumber,
          segment: {
            rowNumber: ctrlRow.rowNumber,
            parsedDate: '',
            startTime: '',
            endTime: '',
            startAtIso: '',
            endAtIso: '',
            durationMinutes: 0,
            rawStaffName: ctrlRow.StaffEmail || '',
            normalizedStaffName: ctrlRow.StaffEmail || '',
            staffEmail: ctrlRow.StaffEmail,
            operationalRole: ctrlRow.WorkRole?.toLowerCase() === 'support' ? 'support' : ctrlRow.WorkRole?.toLowerCase() === 'technical' ? 'technical' : 'host',
            coverageKind: 'planned',
            evidenceKind: 'missing_evidence',
            rawNotes: ctrlRow.Note || '',
            shiftIdHint: ctrlRow.ShiftID,
          },
          status: 'exception',
          confidence: 'none',
          exceptionCode: code,
          exceptionDetail: error,
        })
        continue
      }

      const match = matchSegmentToShift({
        segment,
        brandName,
        shifts,
        staffList,
        existingSegments,
      })
      matchResults.push(match)
      if (match.status === 'exception' && match.exceptionCode) {
        exceptionCounters[match.exceptionCode] = (exceptionCounters[match.exceptionCode] || 0) + 1
      }
    }
  } else {
    // 2. Process Standard Raw Rows (Opella, PepsiCo, etc.)
    for (const rawRow of rawRows) {
      const { segments, errors, exceptionCode } = parseRawAttendanceRow(rawRow, profile)
      if (errors.length > 0) {
        parseErrors.push(...errors)
      }
      if (exceptionCode && segments.length === 0) {
        exceptionCounters[exceptionCode] = (exceptionCounters[exceptionCode] || 0) + 1
        matchResults.push({
          rowNumber: rawRow.rowNumber,
          segment: {
            rowNumber: rawRow.rowNumber,
            parsedDate: '',
            startTime: '',
            endTime: '',
            startAtIso: '',
            endAtIso: '',
            durationMinutes: 0,
            rawStaffName: rawRow.hostName || rawRow.staffName || '',
            normalizedStaffName: rawRow.hostName || rawRow.staffName || '',
            operationalRole: rawRow.role?.toLowerCase() === 'support' ? 'support' : rawRow.role?.toLowerCase() === 'technical' ? 'technical' : 'host',
            coverageKind: 'planned',
            evidenceKind: 'missing_evidence',
            rawNotes: rawRow.notes || '',
          },
          status: 'exception',
          confidence: 'none',
          exceptionCode,
          exceptionDetail: errors.join(', '),
        })
        continue
      }

      for (const segment of segments) {
        const match = matchSegmentToShift({
          segment,
          brandName,
          shifts,
          staffList,
          existingSegments,
        })

        matchResults.push(match)
        if (match.status === 'exception' && match.exceptionCode) {
          exceptionCounters[match.exceptionCode] = (exceptionCounters[match.exceptionCode] || 0) + 1
        }
      }
    }
  }

  const matchedCount = matchResults.filter(r => r.status === 'matched').length
  const exceptionCount = matchResults.filter(r => r.status === 'exception').length

  const summary: AttendanceImportBatchSummary = {
    batchId,
    sourceProfileId,
    sourceType,
    sourceName,
    sourceFingerprint,
    totalRows: matchResults.length,
    matchedRows: matchedCount,
    exceptionRows: exceptionCount,
    draftedSegments: 0,
    exceptionsSummary: exceptionCounters,
  }

  return {
    batchId,
    sourceFingerprint,
    results: matchResults,
    summary,
    errors: parseErrors,
  }
}

/**
 * Converts matched attendance results into workforce_actual_segments draft records.
 * STRICT: Only creates 'draft' status. Independent reviewer must approve.
 */
export function buildActualSegmentsFromMatches(params: {
  matchedResults: AttendanceMatchResult[]
  creatorId: string
  batchId: string
}): Array<{
  shift_id: string
  staff_id: string
  operational_role: 'host' | 'support' | 'technical'
  event_kind: 'worked'
  coverage_kind: 'planned' | 'cover' | 'replacement' | 'extra'
  actual_start_at: string
  actual_end_at: string
  review_status: 'draft'
  evidence_note: string
  created_by: string
}> {
  const { matchedResults, creatorId, batchId } = params

  return matchedResults
    .filter(m => m.status === 'matched' && m.matchedShiftId && m.matchedStaffId)
    .map(m => {
      const seg = m.segment
      const passClause = seg.passTargetStaffName ? ` [Nhận ca PASS từ ${seg.passTargetStaffName}]` : ''
      const otClause = seg.approvedOtMinutes ? ` [Kèm đề xuất OT ${seg.approvedOtMinutes} phút]` : ''
      const noteContent = `Imported from historical attendance batch #${batchId} row ${seg.rowNumber}${passClause}${otClause}: ${seg.rawNotes || 'Xác nhận chấm công hợp lệ'}`

      return {
        shift_id: m.matchedShiftId!,
        staff_id: m.matchedStaffId!,
        operational_role: seg.operationalRole,
        event_kind: 'worked' as const,
        coverage_kind: seg.coverageKind,
        actual_start_at: seg.startAtIso,
        actual_end_at: seg.endAtIso,
        review_status: 'draft' as const,
        evidence_note: noteContent.slice(0, 2000),
        created_by: creatorId,
      }
    })
}
