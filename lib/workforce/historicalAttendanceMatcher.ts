import { createHash } from 'node:crypto'
import {
  AttendanceMatchResult,
  ParsedAttendanceSegment,
} from './historicalAttendanceTypes'
import { stripVietnameseAccents } from './historicalAttendanceParser'

export interface ShiftReference {
  id: string
  date?: string | Date // YYYY-MM-DD or Date object from PostgreSQL driver
  startTime: string // TIME WITHOUT TIME ZONE (HH:mm:ss / HH:mm) or ISO timestamptz
  endTime: string   // TIME WITHOUT TIME ZONE (HH:mm:ss / HH:mm) or ISO timestamptz
  startAtIso?: string // Precomputed ISO timestamptz in Asia/Ho_Chi_Minh
  endAtIso?: string   // Precomputed ISO timestamptz in Asia/Ho_Chi_Minh
  brandId?: string | null
  brandName?: string | null
  platformId?: string | null
  platformName?: string | null
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
 * Combines a date string/Date (YYYY-MM-DD) and time string (HH:mm or HH:mm:ss) into an ISO timestamptz in Asia/Ho_Chi_Minh (+07:00).
 */
export function combineDateAndTime(dateInput: string | Date, timeStr: string): string {
  let dateStr: string
  if (dateInput instanceof Date) {
    const y = dateInput.getFullYear()
    const m = String(dateInput.getMonth() + 1).padStart(2, '0')
    const d = String(dateInput.getDate()).padStart(2, '0')
    dateStr = `${y}-${m}-${d}`
  } else {
    dateStr = String(dateInput || '').trim().slice(0, 10)
  }
  const cleanTime = (timeStr || '00:00').trim()
  const parts = cleanTime.split(':')
  const hh = (parts[0] || '00').padStart(2, '0')
  const mm = (parts[1] || '00').padStart(2, '0')
  const ss = (parts[2] || '00').padStart(2, '0')
  return `${dateStr}T${hh}:${mm}:${ss}+07:00`
}

/**
 * Resolves start and end ISO timestamps for a shift using date, start_time, end_time in Asia/Ho_Chi_Minh (+07:00).
 * Supports overnight shifts (where end_time <= start_time -> crosses midnight to next day).
 */
export function computeShiftTimestamps(sh: ShiftReference): {
  startAtIso: string
  endAtIso: string
  isOvernight: boolean
} {
  if (sh.startAtIso && sh.endAtIso) {
    const isOver = Date.parse(sh.endAtIso) - Date.parse(sh.startAtIso) > 86400000 || sh.endAtIso.slice(0, 10) !== sh.startAtIso.slice(0, 10)
    return { startAtIso: sh.startAtIso, endAtIso: sh.endAtIso, isOvernight: isOver }
  }

  // If startTime is already an ISO timestamptz (e.g. from legacy tests)
  if (sh.startTime && sh.startTime.includes('T')) {
    return {
      startAtIso: sh.startTime,
      endAtIso: sh.endTime,
      isOvernight: sh.endTime.slice(0, 10) !== sh.startTime.slice(0, 10),
    }
  }

  let shiftDate: string
  if (sh.date instanceof Date) {
    const y = sh.date.getFullYear()
    const m = String(sh.date.getMonth() + 1).padStart(2, '0')
    const d = String(sh.date.getDate()).padStart(2, '0')
    shiftDate = `${y}-${m}-${d}`
  } else if (typeof sh.date === 'string' && sh.date.trim()) {
    shiftDate = sh.date.trim().slice(0, 10)
  } else {
    shiftDate = new Date().toISOString().slice(0, 10)
  }

  const startAtIso = combineDateAndTime(shiftDate, sh.startTime)

  const sParts = (sh.startTime || '00:00').split(':').map(Number)
  const eParts = (sh.endTime || '00:00').split(':').map(Number)
  const sMins = (sParts[0] || 0) * 60 + (sParts[1] || 0)
  const eMins = (eParts[0] || 0) * 60 + (eParts[1] || 0)

  let endDateStr = shiftDate
  let isOvernight = false

  if (eMins <= sMins) {
    isOvernight = true
    const d = new Date(`${shiftDate}T12:00:00Z`)
    d.setUTCDate(d.getUTCDate() + 1)
    endDateStr = d.toISOString().slice(0, 10)
  }

  const endAtIso = combineDateAndTime(endDateStr, sh.endTime)
  return { startAtIso, endAtIso, isOvernight }
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
    // 3b. Time and Brand Proximity Match using planned time (P0-3, P0-4)
    const matchTimeIso = segment.plannedStartAtIso || segment.startAtIso
    const segmentStartMs = Date.parse(matchTimeIso)

    interface ScoredCandidate {
      shift: ShiftReference
      diffStartMins: number
      hasStaffRoleMatch: boolean
      score: number
    }

    const candidateShifts: ScoredCandidate[] = []

    for (const sh of shifts) {
      // Check Brand filter
      const targetBrand = brandName || ''
      if (targetBrand && sh.brandName && !sh.brandName.toLowerCase().includes(targetBrand.toLowerCase()) && !targetBrand.toLowerCase().includes(sh.brandName.toLowerCase())) {
        continue
      }

      const { startAtIso: shStartIso } = computeShiftTimestamps(sh)
      const shStartMs = Date.parse(shStartIso)
      const diffStartMins = Math.abs(shStartMs - segmentStartMs) / 60000

      if (diffStartMins <= 90) {
        // Check if assigned staff matches
        let hasStaffRoleMatch = false
        if (segment.operationalRole === 'host' && sh.hostId === staffMatch.staffId) {
          hasStaffRoleMatch = true
        } else if (segment.operationalRole === 'support' && sh.supportId === staffMatch.staffId) {
          hasStaffRoleMatch = true
        } else if (segment.operationalRole === 'technical' && sh.technicalId === staffMatch.staffId) {
          hasStaffRoleMatch = true
        }

        // Score: higher is better
        // Exact staff assigned: +1000 points
        // Closer time: minus diffStartMins
        const score = (hasStaffRoleMatch ? 1000 : 0) - diffStartMins

        candidateShifts.push({
          shift: sh,
          diffStartMins,
          hasStaffRoleMatch,
          score,
        })
      }
    }

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

    // Sort descending by score
    candidateShifts.sort((a, b) => b.score - a.score)

    // Ambiguity Check: If multiple candidates have equivalent confidence, fail to ROLE_AMBIGUOUS
    if (candidateShifts.length > 1) {
      const top1 = candidateShifts[0]
      const top2 = candidateShifts[1]

      // Equal score or virtually identical proximity without staff distinction
      const isAmbiguous = (top1.score === top2.score) ||
        (top1.hasStaffRoleMatch === top2.hasStaffRoleMatch && Math.abs(top1.diffStartMins - top2.diffStartMins) < 5)

      if (isAmbiguous) {
        return {
          rowNumber: segment.rowNumber,
          segment,
          status: 'exception',
          matchedStaffId: staffMatch.staffId,
          confidence: 'none',
          exceptionCode: 'ROLE_AMBIGUOUS',
          exceptionDetail: `Tìm thấy ${candidateShifts.length} ca trực trùng khớp cùng khung giờ (độ tin cậy tương đương: #${top1.shift.id}, #${top2.shift.id}); cần chỉ định cụ thể`,
        }
      }
    }

    matchedShift = candidateShifts[0].shift
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
