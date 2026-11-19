export type AttendanceEventKind = 'check_in' | 'check_out'
export type AttendanceRole = 'host' | 'support' | 'technical'

export interface SelfAttendanceEvent {
  event_id: string
  shift_id: string
  staff_id: string
  role: AttendanceRole
  event: AttendanceEventKind
  recorded_at: string
  verification_status: 'pending_verification'
  photo_available?: boolean
  replayed?: boolean
}

export function decodeSelfAttendanceEvent(data: unknown): SelfAttendanceEvent {
  if (!data || Array.isArray(data) || typeof data !== 'object') throw new Error('ATTENDANCE_RESPONSE_INVALID')
  const v = data as Record<string, unknown>
  if (['event_id','shift_id','staff_id','role','event','recorded_at','verification_status'].some(k=>typeof v[k]!=='string'||!(v[k] as string).trim()) ||
      !['host','support','technical'].includes(v.role as string) ||
      !['check_in','check_out'].includes(v.event as string) ||
      v.verification_status !== 'pending_verification' ||
      !Number.isFinite(Date.parse(v.recorded_at as string)) ||
      (v.photo_available!==undefined && typeof v.photo_available!=='boolean') ||
      (v.replayed!==undefined && typeof v.replayed!=='boolean')) throw new Error('ATTENDANCE_RESPONSE_INVALID')
  return v as unknown as SelfAttendanceEvent
}

export function decodeSelfAttendanceHistory(data: unknown): SelfAttendanceEvent[] {
  if (!Array.isArray(data) || data.length>100) throw new Error('ATTENDANCE_HISTORY_INVALID')
  const rows = data.map(decodeSelfAttendanceEvent)
  if (new Set(rows.map(r=>r.event_id)).size!==rows.length) throw new Error('ATTENDANCE_HISTORY_DUPLICATED')
  return rows
}

export interface AttendanceTimingCompliance {
  isWithinWindow: boolean
  labelVi: string
  labelEn: string
  isOutsideWindowWarning: boolean
  detailsVi: string
  detailsEn: string
}

/**
 * Checks whether an attendance event was recorded within the compliant time window:
 * - Check-in: [T_start - 120m, T_end]
 * - Check-out: [T_start, T_end + 120m]
 * Events outside this range are still recorded by the server, but flagged for manual management review.
 */
export function checkAttendanceTimingCompliance(
  recordedAtIso: string,
  startTime: string,
  endTime: string,
  kind: AttendanceEventKind,
  timeZone = 'Asia/Ho_Chi_Minh'
): AttendanceTimingCompliance {
  const dateObj = new Date(recordedAtIso)
  if (!Number.isFinite(dateObj.getTime())) {
    return {
      isWithinWindow: false,
      labelVi: 'Thời gian không hợp lệ',
      labelEn: 'Invalid time',
      isOutsideWindowWarning: true,
      detailsVi: 'Không thể phân tích mốc thời gian ghi nhận.',
      detailsEn: 'Unable to parse recorded timestamp.',
    }
  }

  // Format time in the shift timezone
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
  const recordedParts = formatter.format(dateObj).split(':')
  const recordedMins = parseInt(recordedParts[0], 10) * 60 + parseInt(recordedParts[1], 10)

  const startMins = parseMinutesFromTimeString(startTime)
  const endMins = parseMinutesFromTimeString(endTime)

  const checkInMinMins = ((startMins - 120) % 1440 + 1440) % 1440
  const checkOutMaxMins = ((endMins + 120) % 1440 + 1440) % 1440

  let isWithin = true
  if (kind === 'check_in') {
    // Compliant check-in window: between T_start - 120m and T_end
    if (checkInMinMins <= endMins) {
      isWithin = recordedMins >= checkInMinMins && recordedMins <= endMins
    } else {
      // Crosses midnight window
      isWithin = recordedMins >= checkInMinMins || recordedMins <= endMins
    }
  } else {
    // Compliant check-out window: between T_start and T_end + 120m
    if (startMins <= checkOutMaxMins) {
      isWithin = recordedMins >= startMins && recordedMins <= checkOutMaxMins
    } else {
      // Crosses midnight window
      isWithin = recordedMins >= startMins || recordedMins <= checkOutMaxMins
    }
  }

  if (isWithin) {
    return {
      isWithinWindow: true,
      labelVi: 'Đúng khung giờ chuẩn',
      labelEn: 'Within standard window',
      isOutsideWindowWarning: false,
      detailsVi: 'Ghi nhận trong cửa sổ cho phép của ca trực.',
      detailsEn: 'Recorded within the authorized shift window.',
    }
  }

  const recordedTimeLabel = `${recordedParts[0].padStart(2, '0')}:${recordedParts[1].padStart(2, '0')}`
  const openTime = formatMinutesToTimeString(startMins - 120)
  const closeTime = formatMinutesToTimeString(endMins + 120)

  return {
    isWithinWindow: false,
    labelVi: 'Ngoài khung giờ chuẩn',
    labelEn: 'Outside standard window',
    isOutsideWindowWarning: true,
    detailsVi: `Ghi nhận lúc ${recordedTimeLabel} (Khung giờ chuẩn: ${openTime} – ${closeTime}). Hệ thống lưu biên nhận thực tế để quản lý đối soát.`,
    detailsEn: `Recorded at ${recordedTimeLabel} (Standard window: ${openTime} – ${closeTime}). Stored for management review.`,
  }
}

export interface AttendanceTimePolicy {
  timeZone: string
  checkInOpensTime: string
  checkOutClosesTime: string
  expectedArrivalTime: string | null
  expectedArrivalLabel: string
  checkInWindowLabel: string
  checkOutWindowLabel: string
  compensationNotice: string
}

export function parseMinutesFromTimeString(timeStr: string): number {
  const parts = timeStr.trim().split(':')
  const hours = parseInt(parts[0], 10) || 0
  const minutes = parseInt(parts[1], 10) || 0
  return hours * 60 + minutes
}

export function formatMinutesToTimeString(totalMinutes: number): string {
  const normalized = ((totalMinutes % 1440) + 1440) % 1440
  const hours = Math.floor(normalized / 60)
  const minutes = normalized % 60
  return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`
}

/**
 * Calculates attendance time policy display values per Owner #183:
 * - Check-in window opens: T_start - 120 minutes
 * - Check-out window closes: T_end + 120 minutes
 * - Host: Expected arrival deadline T_start - 15 minutes
 * - Support (Trợ live): Expected arrival deadline T_start - 30 minutes
 * - Technical: No fixed deadline ("Theo sắp xếp ca")
 * - Early check-in does not auto-add pay; lateness does not auto-deduct pay.
 */
export function calculateAttendanceTimePolicy(
  startTime: string,
  endTime: string,
  role: AttendanceRole,
  timeZone = 'Asia/Ho_Chi_Minh',
): AttendanceTimePolicy {
  const startMins = parseMinutesFromTimeString(startTime)
  const endMins = parseMinutesFromTimeString(endTime)

  // Check-in opens 120 mins before shift start
  const checkInOpensMins = startMins - 120
  const checkInOpensTime = formatMinutesToTimeString(checkInOpensMins)

  // Check-out closes 120 mins after shift end
  const checkOutClosesMins = endMins + 120
  const checkOutClosesTime = formatMinutesToTimeString(checkOutClosesMins)

  let expectedArrivalTime: string | null = null
  let expectedArrivalLabel = 'Theo sắp xếp ca trực (Không áp dụng mốc cố định)'

  if (role === 'host') {
    const arrivalMins = startMins - 15
    expectedArrivalTime = formatMinutesToTimeString(arrivalMins)
    expectedArrivalLabel = `${expectedArrivalTime} (T-15 phút)`
  } else if (role === 'support') {
    const arrivalMins = startMins - 30
    expectedArrivalTime = formatMinutesToTimeString(arrivalMins)
    expectedArrivalLabel = `${expectedArrivalTime} (T-30 phút)`
  }

  return {
    timeZone,
    checkInOpensTime,
    checkOutClosesTime,
    expectedArrivalTime,
    expectedArrivalLabel,
    checkInWindowLabel: `Mở từ ${checkInOpensTime} (T-120 phút)`,
    checkOutWindowLabel: `Đóng lúc ${checkOutClosesTime} (T+120 phút)`,
    compensationNotice: 'Check-in sớm không mặc định cộng lương; đi trễ không tự động trừ lương. Giờ làm việc thực tế do quản lý phê duyệt.',
  }
}
