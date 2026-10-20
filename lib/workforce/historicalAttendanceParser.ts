import {
  ParsedAttendanceSegment,
  RawAttendanceInputRow,
  ControlTimesheetRow,
  AttendanceEvidenceKind,
  SourceProfile,
  SourceProfileId,
  DateOrderOption,
  AttendanceExceptionCode,
} from './historicalAttendanceTypes'

export const SOURCE_PROFILES: Record<SourceProfileId, SourceProfile> = {
  opella_t10: {
    id: 'opella_t10',
    name: 'OPELLA THÁNG 10 FINAL',
    dateOrder: 'month-first', // MM/DD/YYYY: 10/01/2026 = Oct 1st
    sourceType: 'google_sheets',
    validateWeekday: true,
  },
  pepsico_t10: {
    id: 'pepsico_t10',
    name: 'PEPSICO THÁNG 10 FINAL',
    dateOrder: 'month-first', // MM/DD/YYYY: 10/17/2026 = Oct 17th
    sourceType: 'google_sheets',
    validateWeekday: true,
  },
  control_timesheets: {
    id: 'control_timesheets',
    name: 'ADA SHIFT MANAGER · CONTROL TIMESHEETS',
    dateOrder: 'iso',
    sourceType: 'shift_manager_control',
  },
  custom: {
    id: 'custom',
    name: 'Custom Import Profile',
    dateOrder: 'day-first',
    sourceType: 'excel_upload',
  },
}

/**
 * Normalizes Vietnamese string for resilient matching (lowercase, trimmed, collapsed whitespace).
 */
export function normalizeStaffName(name: string): string {
  return name.trim().replace(/\s+/g, ' ')
}

/**
 * Strips Vietnamese diacritics for fallback fuzzy search.
 */
export function stripVietnameseAccents(str: string): string {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim()
}

/**
 * Converts Excel / Google Sheets numeric serial date (e.g. 46300) to YYYY-MM-DD.
 */
export function parseExcelSerialDate(serial: number): string | null {
  if (typeof serial !== 'number' || Number.isNaN(serial) || serial < 1000 || serial > 100000) {
    return null
  }
  // Excel epoch: Dec 30 1899 (accounting for 1900 leap year bug)
  const epoch = new Date(Date.UTC(1899, 11, 30))
  const target = new Date(epoch.getTime() + Math.round(serial) * 86400000)
  return target.toISOString().slice(0, 10)
}

/**
 * Verifies if calculated date matches declared weekday.
 * e.g. "Thứ Hai" -> Monday (1), "Thứ Bảy" -> Saturday (6), "Chủ Nhật" -> Sunday (0).
 */
export function verifyWeekdayMatches(dateStr: string, weekdayStr?: string): boolean {
  if (!weekdayStr || !dateStr) return true
  const date = new Date(`${dateStr}T12:00:00Z`)
  if (Number.isNaN(date.getTime())) return false

  const dayOfWeek = date.getUTCDay() // 0 = Sun, 1 = Mon, ..., 6 = Sat
  const clean = stripVietnameseAccents(weekdayStr)

  const map: Record<string, number> = {
    'chu nhat': 0, 'cn': 0, 'sunday': 0, 'sun': 0,
    'thu hai': 1, 't2': 1, 'monday': 1, 'mon': 1,
    'thu ba': 2, 't3': 2, 'tuesday': 2, 'tue': 2,
    'thu tu': 3, 't4': 3, 'wednesday': 3, 'wed': 3,
    'thu nam': 4, 't5': 4, 'thursday': 4, 'thu': 4,
    'thu sau': 5, 't6': 5, 'friday': 5, 'fri': 5,
    'thu bay': 6, 't7': 6, 'saturday': 6, 'sat': 6,
  }

  const expected = map[clean]
  if (expected === undefined) return true // Unknown weekday string, ignore check
  return expected === dayOfWeek
}

/**
 * Parses date string in DD/MM/YYYY, MM/DD/YYYY, or YYYY-MM-DD.
 * Respects source-specific date order ('month-first', 'day-first', 'iso').
 * If ambiguous and dateOrder is unknown, returns error flag.
 */
export function parseCanonicalDateWithOrder(
  rawDate: string | number,
  dateOrder: DateOrderOption = 'month-first',
  allowAmbiguousFallback: boolean = false
): { date: string | null; isAmbiguous: boolean } {
  if (rawDate === undefined || rawDate === null || rawDate === '') {
    return { date: null, isAmbiguous: false }
  }

  // 1. Check numeric serial from Excel/Sheets
  if (typeof rawDate === 'number') {
    const fromSerial = parseExcelSerialDate(rawDate)
    return { date: fromSerial, isAmbiguous: false }
  }

  const cleaned = String(rawDate).trim()

  // 2. Check ISO YYYY-MM-DD
  const isoMatch = cleaned.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/)
  if (isoMatch) {
    const y = isoMatch[1]
    const m = isoMatch[2].padStart(2, '0')
    const d = isoMatch[3].padStart(2, '0')
    return { date: `${y}-${m}-${d}`, isAmbiguous: false }
  }

  // 3. Match Slash/Dot date (XX/YY/ZZZZ)
  const slashMatch = cleaned.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/)
  if (slashMatch) {
    const first = parseInt(slashMatch[1], 10)
    const second = parseInt(slashMatch[2], 10)
    const y = slashMatch[3]

    let day: number
    let month: number
    let isAmbiguous = false

    if (first > 12) {
      // Must be DD/MM/YYYY
      day = first
      month = second
    } else if (second > 12) {
      // Must be MM/DD/YYYY
      month = first
      day = second
    } else {
      // Both numbers <= 12, inherently ambiguous!
      isAmbiguous = true
      if (dateOrder === 'month-first') {
        month = first
        day = second
      } else if (dateOrder === 'day-first') {
        day = first
        month = second
      } else {
        // Unknown or iso -> fail-closed unless explicit fallback allowed
        if (!allowAmbiguousFallback) {
          return { date: null, isAmbiguous: true }
        }
        month = first
        day = second
      }
    }

    if (month < 1 || month > 12 || day < 1 || day > 31) {
      return { date: null, isAmbiguous: false }
    }
    return {
      date: `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
      isAmbiguous,
    }
  }

  return { date: null, isAmbiguous: false }
}

/**
 * Convenience helper returning canonical date string YYYY-MM-DD or null.
 */
export function parseCanonicalDate(
  rawDate: string | number,
  dateOrder: DateOrderOption = 'month-first',
  allowAmbiguousFallback: boolean = true
): string | null {
  return parseCanonicalDateWithOrder(rawDate, dateOrder, allowAmbiguousFallback).date
}

/**
 * Normalizes time string (e.g., '09:00', '9h', '09:30:00', '9h30') to HH:mm.
 */
export function normalizeTimeString(rawTime: string): string | null {
  if (!rawTime) return null
  const cleaned = rawTime.trim().toLowerCase().replace(/h$/i, '').replace(/h/i, ':')
  const match = cleaned.match(/^(\d{1,2})(?::(\d{1,2}))?(?::\d{1,2})?$/)
  if (!match) return null
  const hours = parseInt(match[1], 10)
  const minutes = match[2] ? parseInt(match[2], 10) : 0
  if (hours < 0 || hours > 24 || minutes < 0 || minutes > 59) return null
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

/**
 * Parses time range like '09:00 - 13:00' or '22:00 - 02:00'.
 */
export function parseTimeRange(rawRange: string): { startTime: string; endTime: string } | null {
  if (!rawRange) return null
  const parts = rawRange.split(/[-–—đếnto]/i).map(s => s.trim())
  if (parts.length < 2) return null
  const startTime = normalizeTimeString(parts[0])
  const endTime = normalizeTimeString(parts[1])
  if (!startTime || !endTime) return null
  return { startTime, endTime }
}

/**
 * Splits multi-staff cell value separated by comma, semicolon, newline, or slashes.
 */
export function splitStaffNames(rawValue?: string): string[] {
  if (!rawValue) return []
  return rawValue
    .split(/[\n\r;,/]+/g)
    .map(s => normalizeStaffName(s))
    .filter(s => s.length > 0 && !['không', 'k', 'none', 'n/a', '-', '_'].includes(s.toLowerCase()))
}

/**
 * Analyzes PASS / Cover notes:
 * e.g. "An PASS cho Bình", "Bình nhận PASS từ An", "Hương đổi ca"
 */
export function detectPassCoverage(notes?: string): {
  isPass: boolean
  originalStaff?: string
  replacementStaff?: string
} {
  if (!notes) return { isPass: false }
  const cleanNotes = notes.toLowerCase()
  if (!cleanNotes.includes('pass') && !cleanNotes.includes('doi ca') && !cleanNotes.includes('đổi ca') && !cleanNotes.includes('thay cho')) {
    return { isPass: false }
  }

  // Regex patterns: "X pass cho Y", "X thay cho Y"
  const passPattern = /([^\d\s,;:]+(?:\s+[^\d\s,;:]+)*)\s*(?:pass cho|đổi ca cho|thay cho)\s*([^\d\s,;:]+(?:\s+[^\d\s,;:]+)*)/i
  const match = notes.match(passPattern)
  if (match) {
    let rep = match[2].trim()
    rep = rep.replace(/\s+(?:do|vì|vi|tại|tai|bị|bi)\s+.*$/i, '').trim()
    return {
      isPass: true,
      originalStaff: normalizeStaffName(match[1]),
      replacementStaff: normalizeStaffName(rep),
    }
  }

  return { isPass: true }
}

/**
 * Parses raw attendance row with source profile awareness.
 */
export function parseRawAttendanceRow(
  row: RawAttendanceInputRow,
  profile?: SourceProfile
): {
  segments: ParsedAttendanceSegment[]
  errors: string[]
  exceptionCode?: AttendanceExceptionCode
} {
  const errors: string[] = []
  const dateOrder = profile?.dateOrder ?? 'month-first' // Opella/PepsiCo T10 default MM/DD/YYYY

  const { date: parsedDate, isAmbiguous } = parseCanonicalDateWithOrder(row.date ?? '', dateOrder)
  if (!parsedDate) {
    if (isAmbiguous) {
      return {
        segments: [],
        errors: [`Row ${row.rowNumber}: Ngày mơ hồ không thể xác định thứ tự ngày/tháng`],
        exceptionCode: 'AMBIGUOUS_DATE_ORDER',
      }
    }
    return {
      segments: [],
      errors: [`Row ${row.rowNumber}: Ngày không hợp lệ '${row.date}'`],
      exceptionCode: 'TIME_RANGE_INVALID',
    }
  }

  // Weekday verification if provided
  if (profile?.validateWeekday && row.weekday) {
    if (!verifyWeekdayMatches(parsedDate, row.weekday)) {
      return {
        segments: [],
        errors: [`Row ${row.rowNumber}: Thứ declared '${row.weekday}' không khớp với ngày ${parsedDate}`],
        exceptionCode: 'WEEKDAY_MISMATCH',
      }
    }
  }

  let startTime = normalizeTimeString(row.startTime ?? '')
  let endTime = normalizeTimeString(row.endTime ?? '')

  if ((!startTime || !endTime) && row.timeRange) {
    const range = parseTimeRange(row.timeRange)
    if (range) {
      startTime = range.startTime
      endTime = range.endTime
    }
  }

  if (!startTime || !endTime) {
    return {
      segments: [],
      errors: [`Row ${row.rowNumber}: Thiếu khung giờ bắt đầu / kết thúc hợp lệ`],
      exceptionCode: 'TIME_RANGE_INVALID',
    }
  }

  // Build timestamps in Asia/Ho_Chi_Minh (+07:00)
  const startAtIso = `${parsedDate}T${startTime}:00+07:00`
  let endAtDate = parsedDate

  const [sH, sM] = startTime.split(':').map(Number)
  const [eH, eM] = endTime.split(':').map(Number)
  let durationMinutes = (eH * 60 + eM) - (sH * 60 + sM)
  if (durationMinutes <= 0) {
    // Cross midnight
    durationMinutes += 1440
    const d = new Date(`${parsedDate}T12:00:00Z`)
    d.setUTCDate(d.getUTCDate() + 1)
    endAtDate = d.toISOString().slice(0, 10)
  }
  const endAtIso = `${endAtDate}T${endTime}:00+07:00`

  // Evidence kind classification:
  // Strict rule: "Done", "FINAL", "Đã live" is NOT actual punch proof!
  // ONLY real physical check-in/out timestamps count as actual_punch,
  // or explicit supervisor sign-off with confirmedBy/confirmedAt counts as supervisor_verified.
  let evidenceKind: AttendanceEvidenceKind = 'missing_evidence'
  if (row.checkIn && row.checkOut) {
    evidenceKind = 'actual_punch'
  } else if (row.confirmedBy && row.confirmedAt) {
    evidenceKind = 'supervisor_verified'
  }

  const passInfo = detectPassCoverage(row.notes)
  const segments: ParsedAttendanceSegment[] = []

  // Extract Hosts
  const hosts = splitStaffNames(row.hostName ?? (row.role?.toLowerCase() === 'host' ? row.staffName : undefined))
  for (const h of hosts) {
    const isPassTarget = passInfo.isPass && passInfo.replacementStaff && passInfo.replacementStaff.toLowerCase() === h.toLowerCase()
    segments.push({
      rowNumber: row.rowNumber,
      parsedDate,
      startTime,
      endTime,
      startAtIso,
      endAtIso,
      durationMinutes,
      rawStaffName: h,
      normalizedStaffName: normalizeStaffName(h),
      staffEmail: row.staffEmail,
      operationalRole: 'host',
      coverageKind: isPassTarget ? 'cover' : (row.coverageKind === 'cover' || row.coverageKind === 'replacement' || row.coverageKind === 'extra' ? row.coverageKind : 'planned'),
      passTargetStaffName: isPassTarget ? passInfo.originalStaff : undefined,
      evidenceKind,
      approvedOtMinutes: row.approvedOtMinutes ?? 0,
      rawNotes: row.notes ?? '',
      shiftIdHint: row.shiftCode,
      confirmedBy: row.confirmedBy,
      confirmedAt: row.confirmedAt,
    })
  }

  // Extract Support
  const supports = splitStaffNames(row.assistantName ?? (row.role?.toLowerCase() === 'support' ? row.staffName : undefined))
  for (const s of supports) {
    segments.push({
      rowNumber: row.rowNumber,
      parsedDate,
      startTime,
      endTime,
      startAtIso,
      endAtIso,
      durationMinutes,
      rawStaffName: s,
      normalizedStaffName: normalizeStaffName(s),
      staffEmail: row.staffEmail,
      operationalRole: 'support',
      coverageKind: row.coverageKind === 'cover' || row.coverageKind === 'replacement' || row.coverageKind === 'extra' ? row.coverageKind : 'planned',
      evidenceKind,
      approvedOtMinutes: row.approvedOtMinutes ?? 0,
      rawNotes: row.notes ?? '',
      shiftIdHint: row.shiftCode,
      confirmedBy: row.confirmedBy,
      confirmedAt: row.confirmedAt,
    })
  }

  // Extract Technical
  const techs = splitStaffNames(row.technicalName ?? (row.role?.toLowerCase() === 'technical' ? row.staffName : undefined))
  for (const t of techs) {
    segments.push({
      rowNumber: row.rowNumber,
      parsedDate,
      startTime,
      endTime,
      startAtIso,
      endAtIso,
      durationMinutes,
      rawStaffName: t,
      normalizedStaffName: normalizeStaffName(t),
      staffEmail: row.staffEmail,
      operationalRole: 'technical',
      coverageKind: row.coverageKind === 'cover' || row.coverageKind === 'replacement' || row.coverageKind === 'extra' ? row.coverageKind : 'planned',
      evidenceKind,
      approvedOtMinutes: row.approvedOtMinutes ?? 0,
      rawNotes: row.notes ?? '',
      shiftIdHint: row.shiftCode,
      confirmedBy: row.confirmedBy,
      confirmedAt: row.confirmedAt,
    })
  }

  return { segments, errors }
}

/**
 * Exact parser for ADA SHIFT MANAGER · CONTROL TIMESHEETS row
 */
export function parseControlTimesheetRow(row: ControlTimesheetRow): {
  segment?: ParsedAttendanceSegment
  error?: string
  exceptionCode?: AttendanceExceptionCode
} {
  if (!row.ShiftID || !row.StaffEmail || !row.WorkRole) {
    return {
      error: `Row ${row.rowNumber}: Thiếu thông tin bắt buộc ShiftID, StaffEmail hoặc WorkRole`,
      exceptionCode: 'INVALID_CONTROL_STRUCTURE',
    }
  }

  const role = row.WorkRole.trim().toLowerCase()
  if (!['host', 'support', 'technical'].includes(role)) {
    return {
      error: `Row ${row.rowNumber}: WorkRole '${row.WorkRole}' không hợp lệ`,
      exceptionCode: 'ROLE_AMBIGUOUS',
    }
  }

  // Check actual working times
  if (!row.ActualStartLocal || !row.ActualEndLocal) {
    return {
      error: `Row ${row.rowNumber}: Thiếu ActualStartLocal hoặc ActualEndLocal trong TIMESHEETS`,
      exceptionCode: 'MISSING_EVIDENCE',
    }
  }

  const startMs = Date.parse(row.ActualStartLocal)
  const endMs = Date.parse(row.ActualEndLocal)
  if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs <= startMs) {
    return {
      error: `Row ${row.rowNumber}: Thời gian thực tế không hợp lệ`,
      exceptionCode: 'TIME_RANGE_INVALID',
    }
  }

  const durationMinutes = Math.round((endMs - startMs) / 60000)
  const startDateStr = new Date(startMs).toISOString().slice(0, 10)
  const startTimeStr = row.ActualStartLocal.slice(11, 16)
  const endTimeStr = row.ActualEndLocal.slice(11, 16)

  // Status alone does NOT grant punch proof if unconfirmed!
  const isConfirmed = Boolean(row.ConfirmedBy && row.ConfirmedAt)
  const evidenceKind: AttendanceEvidenceKind = isConfirmed ? 'supervisor_verified' : 'actual_punch'

  const segment: ParsedAttendanceSegment = {
    rowNumber: row.rowNumber,
    parsedDate: startDateStr,
    startTime: startTimeStr,
    endTime: endTimeStr,
    startAtIso: row.ActualStartLocal,
    endAtIso: row.ActualEndLocal,
    durationMinutes,
    rawStaffName: row.StaffEmail.split('@')[0],
    normalizedStaffName: row.StaffEmail.split('@')[0],
    staffEmail: row.StaffEmail.trim().toLowerCase(),
    operationalRole: role as 'host' | 'support' | 'technical',
    coverageKind: 'planned',
    evidenceKind,
    rawNotes: row.Note || `CONTROL TIMESHEET: Status=${row.Status}`,
    shiftIdHint: row.ShiftID.trim(),
    confirmedBy: row.ConfirmedBy,
    confirmedAt: row.ConfirmedAt,
  }

  return { segment }
}
