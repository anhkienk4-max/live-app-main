import { createHash } from 'node:crypto'
import {
  AttendanceMatchResult,
  ParsedAttendanceSegment,
} from './historicalAttendanceTypes'
import { stripVietnameseAccents } from './historicalAttendanceParser'

export interface ShiftReference {
  id: string
  brandId?: string | null
  brandName?: string | null
  startTime: string // ISO timestamptz
  endTime: string   // ISO timestamptz
  status: 'preparing' | 'scheduled' | 'live' | 'completed' | 'cancelled'
  hostId?: string | null
  supportId?: string | null
  technicalId?: string | null
}

export interface StaffReference {
  id: string
  fullName: string
  email?: string
  systemPermission: string
  status: 'active' | 'inactive'
}

/**
 * Creates deterministic SHA-256 fingerprint for idempotency.
 */
export function createSourceFingerprint(content: string | Buffer): string {
  return createHash('sha256').update(content).digest('hex')
}

/**
 * Matches staff identity by email first, then exact full name, then accentless, then first+last token.
 */
export function matchStaffIdentity(
  rawName: string,
  staffList: StaffReference[],
  email?: string
): { staffId?: string; confidence: 'exact' | 'high' | 'none'; isAmbiguous: boolean } {
  // 1. Direct Email Match (P0 for CONTROL TIMESHEETS)
  if (email) {
    const cleanEmail = email.trim().toLowerCase()
    const emailMatch = staffList.find(s => s.email?.trim().toLowerCase() === cleanEmail && s.status === 'active')
    if (emailMatch) {
      return { staffId: emailMatch.id, confidence: 'exact', isAmbiguous: false }
    }
  }

  if (!rawName) return { confidence: 'none', isAmbiguous: false }

  const clean = rawName.trim().toLowerCase()
  const cleanAccentless = stripVietnameseAccents(rawName)

  // 2. Exact match on full_name
  const exactMatches = staffList.filter(s => s.fullName.trim().toLowerCase() === clean && s.status === 'active')
  if (exactMatches.length === 1) {
    return { staffId: exactMatches[0].id, confidence: 'exact', isAmbiguous: false }
  }
  if (exactMatches.length > 1) {
    return { confidence: 'none', isAmbiguous: true }
  }

  // 3. Accentless match
  const accentlessMatches = staffList.filter(s => stripVietnameseAccents(s.fullName) === cleanAccentless && s.status === 'active')
  if (accentlessMatches.length === 1) {
    return { staffId: accentlessMatches[0].id, confidence: 'high', isAmbiguous: false }
  }
  if (accentlessMatches.length > 1) {
    return { confidence: 'none', isAmbiguous: true }
  }

  // 4. Substring / first + last token match
  const tokens = cleanAccentless.split(' ').filter(Boolean)
  if (tokens.length >= 2) {
    const lastName = tokens[tokens.length - 1]
    const firstName = tokens[0]
    const tokenMatches = staffList.filter(s => {
      const sTokens = stripVietnameseAccents(s.fullName).split(' ').filter(Boolean)
      return sTokens[sTokens.length - 1] === lastName && sTokens[0] === firstName && s.status === 'active'
    })
    if (tokenMatches.length === 1) {
      return { staffId: tokenMatches[0].id, confidence: 'high', isAmbiguous: false }
    }
  }

  return { confidence: 'none', isAmbiguous: false }
}

/**
 * Matches a parsed attendance segment against completed shifts in the database.
 */
export function matchSegmentToShift(params: {
  segment: ParsedAttendanceSegment
  brandName?: string
  shifts: ShiftReference[]
  staffList: StaffReference[]
  existingSegments?: Array<{ staffId: string; startAt: string; endAt: string }>
}): AttendanceMatchResult {
  const { segment, brandName, shifts, staffList, existingSegments = [] } = params

  // 1. Match staff (with email support)
  const staffMatch = matchStaffIdentity(segment.normalizedStaffName, staffList, segment.staffEmail)
  if (staffMatch.isAmbiguous) {
    return {
      rowNumber: segment.rowNumber,
      segment,
      status: 'exception',
      confidence: 'none',
      exceptionCode: 'STAFF_NOT_FOUND',
      exceptionDetail: `Tên nhân sự '${segment.rawStaffName}' trùng lặp với nhiều tài khoản hệ thống`,
    }
  }
  if (!staffMatch.staffId) {
    return {
      rowNumber: segment.rowNumber,
      segment,
      status: 'exception',
      confidence: 'none',
      exceptionCode: 'STAFF_NOT_FOUND',
      exceptionDetail: `Không tìm thấy nhân sự '${segment.rawStaffName || segment.staffEmail}' trong danh mục nhân sự hệ thống`,
    }
  }

  // 2. Validate time duration
  if (segment.durationMinutes <= 0 || segment.durationMinutes > 1440) {
    return {
      rowNumber: segment.rowNumber,
      segment,
      status: 'exception',
      confidence: 'none',
      exceptionCode: 'TIME_RANGE_INVALID',
      exceptionDetail: `Thời lượng ca không hợp lệ (${segment.durationMinutes} phút)`,
    }
  }

  // 3. Match Shift
  let matchedShift: ShiftReference | undefined

  // 3a. Direct Shift ID Hint (from CONTROL TIMESHEETS or ShiftCode)
  if (segment.shiftIdHint) {
    matchedShift = shifts.find(sh => sh.id === segment.shiftIdHint)
    if (!matchedShift) {
      return {
        rowNumber: segment.rowNumber,
        segment,
        status: 'exception',
        matchedStaffId: staffMatch.staffId,
        confidence: 'none',
        exceptionCode: 'SHIFT_NOT_FOUND',
        exceptionDetail: `Mã ca ShiftID '${segment.shiftIdHint}' không tồn tại trong hệ thống`,
      }
    }
  } else {
    // 3b. Time and Brand Proximity Match
    const segmentStartMs = Date.parse(segment.startAtIso)
    const candidateShifts = shifts.filter(sh => {
      const shStartMs = Date.parse(sh.startTime)
      if (brandName && sh.brandName && !sh.brandName.toLowerCase().includes(brandName.toLowerCase()) && !brandName.toLowerCase().includes(sh.brandName.toLowerCase())) {
        return false
      }
      const diffStartMins = Math.abs(shStartMs - segmentStartMs) / 60000
      return diffStartMins <= 90
    })

    if (candidateShifts.length === 0) {
      return {
        rowNumber: segment.rowNumber,
        segment,
        status: 'exception',
        matchedStaffId: staffMatch.staffId,
        confidence: 'none',
        exceptionCode: 'SHIFT_NOT_FOUND',
        exceptionDetail: `Không tìm thấy ca trực tương ứng trên Lịch vào ngày ${segment.parsedDate} lúc ${segment.startTime}`,
      }
    }

    matchedShift = candidateShifts.sort((a, b) => {
      const diffA = Math.abs(Date.parse(a.startTime) - segmentStartMs)
      const diffB = Math.abs(Date.parse(b.startTime) - segmentStartMs)
      return diffA - diffB
    })[0]
  }

  // Enforce contract: Shift MUST be completed
  if (matchedShift.status !== 'completed') {
    return {
      rowNumber: segment.rowNumber,
      segment,
      status: 'exception',
      matchedShiftId: matchedShift.id,
      matchedStaffId: staffMatch.staffId,
      confidence: staffMatch.confidence,
      exceptionCode: 'SHIFT_NOT_COMPLETED',
      exceptionDetail: `Ca trực #${matchedShift.id} chưa hoàn thành (trạng thái: ${matchedShift.status}). Chỉ ca completed mới được ghi nhận chấm công.`,
    }
  }

  // 4. Check Overlap with existing approved segments
  const segmentStartMs = Date.parse(segment.startAtIso)
  const segmentEndMs = Date.parse(segment.endAtIso)
  const hasOverlap = existingSegments.some(es => {
    if (es.staffId !== staffMatch.staffId) return false
    const esStart = Date.parse(es.startAt)
    const esEnd = Date.parse(es.endAt)
    return Math.max(segmentStartMs, esStart) < Math.min(segmentEndMs, esEnd)
  })

  if (hasOverlap) {
    return {
      rowNumber: segment.rowNumber,
      segment,
      status: 'exception',
      matchedShiftId: matchedShift.id,
      matchedStaffId: staffMatch.staffId,
      confidence: staffMatch.confidence,
      exceptionCode: 'OVERLAP_CONFLICT',
      exceptionDetail: `Nhân sự đã có ca chấm công được duyệt trùng khung giờ làm việc`,
    }
  }

  // 5. Evidence Check (Strict non-assumption rule)
  if (segment.evidenceKind === 'missing_evidence') {
    return {
      rowNumber: segment.rowNumber,
      segment,
      status: 'exception',
      matchedShiftId: matchedShift.id,
      matchedStaffId: staffMatch.staffId,
      confidence: staffMatch.confidence,
      exceptionCode: 'MISSING_EVIDENCE',
      exceptionDetail: `Dữ liệu chỉ có giờ lịch dự kiến, thiếu minh chứng check-in/out thực tế hoặc xác nhận của quản lý`,
    }
  }

  return {
    rowNumber: segment.rowNumber,
    segment,
    status: 'matched',
    matchedShiftId: matchedShift.id,
    matchedStaffId: staffMatch.staffId,
    confidence: staffMatch.confidence,
  }
}
