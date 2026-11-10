import type { OperationalRole, Shift, ShiftRegistration, User } from '@/lib/types/database.types'
import { resolveShiftDateTime } from '@/lib/utils/shiftUtils'

export const DAILY_PASS_MIN_LEAD_MINUTES = 120 // 2 hours
export const CAMPAIGN_PASS_MIN_LEAD_MINUTES = 1440 // 24 hours

export type SwapTimingErrorCode =
  | 'DAILY_PASS_DEADLINE_EXCEEDED'
  | 'CAMPAIGN_PASS_DEADLINE_EXCEEDED'
  | 'PASS_DURING_LIVE_NOT_ALLOWED'
  | 'SHIFT_ALREADY_ENDED'
  | 'SHIFT_NOT_SCHEDULED'

export interface SwapTimingValidationResult {
  allowed: boolean
  code?: SwapTimingErrorCode
  messageVi?: string
  messageEn?: string
  isEmergencyBackupEligible?: boolean
  requiredLeadMinutes?: number
  actualLeadMinutes?: number
}

export type SubstituteErrorCode =
  | 'SUBSTITUTE_SELF_NOT_ALLOWED'
  | 'SUBSTITUTE_INACTIVE'
  | 'SUBSTITUTE_ROLE_MISMATCH'
  | 'SUBSTITUTE_ALREADY_ASSIGNED'
  | 'SUBSTITUTE_SCHEDULE_CONFLICT'

export interface SubstituteValidationResult {
  valid: boolean
  code?: SubstituteErrorCode
  messageVi?: string
  messageEn?: string
}

/**
 * Determine if a shift is associated with a marketing / sales campaign.
 */
export function isCampaignShift(shift: Shift): boolean {
  return Boolean(shift.campaign_id && shift.campaign_id.trim() !== '')
}

/**
 * Validates lead time and live status for PASS / Swap requests per Issue #93.
 *
 * Rules:
 * - Daily PASS: Must be requested at least 2 hours (120 mins) before live start.
 * - Campaign PASS: Must be requested at least 24 hours (1440 mins) before live start.
 * - During Live: Ordinary PASS is prohibited. Emergency replacements during live
 *   must use Emergency Backup Reassignment by Leader/Manager, not staff self-service PASS.
 */
export function validateSwapTiming(
  shift: Shift,
  requestTime: Date = new Date(),
): SwapTimingValidationResult {
  if (shift.status !== 'scheduled') {
    return {
      allowed: false,
      code: 'SHIFT_NOT_SCHEDULED',
      messageVi: 'Ca làm việc không ở trạng thái đã lên lịch (scheduled).',
      messageEn: 'Shift is not in scheduled status.',
    }
  }

  const timing = resolveShiftDateTime(shift.date, shift.start_time, shift.end_time, shift.timezone)
  if (!timing || !timing.valid) {
    // If timing cannot be parsed, fail closed
    return {
      allowed: false,
      code: 'DAILY_PASS_DEADLINE_EXCEEDED',
      messageVi: 'Không thể xác định thời gian bắt đầu ca làm việc.',
      messageEn: 'Could not determine shift start time.',
    }
  }

  const startAtMs = timing.startAt.getTime()
  const endAtMs = timing.endAt.getTime()
  const requestTimeMs = requestTime.getTime()

  // 1. Shift already ended
  if (requestTimeMs >= endAtMs) {
    return {
      allowed: false,
      code: 'SHIFT_ALREADY_ENDED',
      messageVi: 'Ca làm việc đã kết thúc, không thể tạo yêu cầu PASS/đổi ca.',
      messageEn: 'Shift has already ended. PASS or swap request cannot be created.',
    }
  }

  // 2. Ordinary PASS prohibited during live (between start and end)
  if (requestTimeMs >= startAtMs && requestTimeMs < endAtMs) {
    return {
      allowed: false,
      code: 'PASS_DURING_LIVE_NOT_ALLOWED',
      isEmergencyBackupEligible: true,
      messageVi:
        'Không cho phép tạo yêu cầu PASS thông thường khi ca đang diễn ra. Trường hợp mệt hoặc phát sinh khẩn cấp phải thực hiện Emergency Backup Reassignment bởi Leader/Quản lý.',
      messageEn:
        'Ordinary PASS is not allowed while the shift is live. Emergency replacements during live must use Emergency Backup Reassignment by Leader/Manager.',
    }
  }

  const leadMinutes = Math.floor((startAtMs - requestTimeMs) / 60_000)
  const isCampaign = isCampaignShift(shift)

  // 3. Campaign PASS: minimum 24 hours (1440 minutes)
  if (isCampaign) {
    if (leadMinutes < CAMPAIGN_PASS_MIN_LEAD_MINUTES) {
      return {
        allowed: false,
        code: 'CAMPAIGN_PASS_DEADLINE_EXCEEDED',
        isEmergencyBackupEligible: false,
        requiredLeadMinutes: CAMPAIGN_PASS_MIN_LEAD_MINUTES,
        actualLeadMinutes: leadMinutes,
        messageVi: `Yêu cầu PASS ca Campaign phải gửi trước giờ live tối thiểu 24 giờ (hiện tại còn ${leadMinutes} phút). Vui lòng liên hệ Leader/Quản lý nếu có tình huống khẩn cấp.`,
        messageEn: `Campaign PASS must be requested at least 24 hours prior to live start (currently ${leadMinutes} minutes remaining).`,
      }
    }
  } else {
    // 4. Daily PASS: minimum 2 hours (120 minutes)
    if (leadMinutes < DAILY_PASS_MIN_LEAD_MINUTES) {
      return {
        allowed: false,
        code: 'DAILY_PASS_DEADLINE_EXCEEDED',
        isEmergencyBackupEligible: false,
        requiredLeadMinutes: DAILY_PASS_MIN_LEAD_MINUTES,
        actualLeadMinutes: leadMinutes,
        messageVi: `Yêu cầu PASS ca thường (Daily) phải gửi trước giờ live tối thiểu 2 giờ (120 phút). Hiện tại còn ${leadMinutes} phút. Vui lòng liên hệ Leader/Quản lý nếu phát sinh đột xuất.`,
        messageEn: `Daily PASS must be requested at least 2 hours (120 minutes) prior to live start (currently ${leadMinutes} minutes remaining).`,
      }
    }
  }

  return { allowed: true }
}

/**
 * Validates that replacement staff is valid, active, role-qualified,
 * not already assigned to source shift, and has no schedule conflict (including overnight).
 */
export function validateSubstituteStaff(params: {
  sourceShift: Shift
  role: OperationalRole
  requesterId: string
  substitute: User
  existingRegistrations: ShiftRegistration[]
  allShifts: Shift[]
}): SubstituteValidationResult {
  const { sourceShift, role, requesterId, substitute, existingRegistrations, allShifts } = params

  if (substitute.id === requesterId) {
    return {
      valid: false,
      code: 'SUBSTITUTE_SELF_NOT_ALLOWED',
      messageVi: 'Không thể tự chọn chính mình làm nhân sự thay thế.',
      messageEn: 'Cannot select yourself as substitute staff.',
    }
  }

  if (substitute.status !== 'active' || substitute.archived_at || substitute.deleted_at) {
    return {
      valid: false,
      code: 'SUBSTITUTE_INACTIVE',
      messageVi: 'Nhân sự thay thế không ở trạng thái hoạt động (inactive/archived).',
      messageEn: 'Substitute staff is inactive or archived.',
    }
  }

  if (!substitute.operational_roles?.includes(role)) {
    return {
      valid: false,
      code: 'SUBSTITUTE_ROLE_MISMATCH',
      messageVi: `Nhân sự thay thế không có vai trò ${role} trong hồ sơ năng lực.`,
      messageEn: `Substitute staff does not possess the ${role} operational role.`,
    }
  }

  const isAlreadyAssigned = existingRegistrations.some(
    r =>
      r.shift_id === sourceShift.id &&
      r.user_id === substitute.id &&
      ['approved', 'manually_assigned'].includes(r.status),
  )

  if (isAlreadyAssigned) {
    return {
      valid: false,
      code: 'SUBSTITUTE_ALREADY_ASSIGNED',
      messageVi: 'Nhân sự thay thế đã được phân công trong ca này.',
      messageEn: 'Substitute staff is already assigned to this shift.',
    }
  }

  // Conflict check with other shifts assigned to substitute
  const sourceTiming = resolveShiftDateTime(
    sourceShift.date,
    sourceShift.start_time,
    sourceShift.end_time,
    sourceShift.timezone,
  )
  if (!sourceTiming || !sourceTiming.valid) {
    return {
      valid: false,
      code: 'SUBSTITUTE_SCHEDULE_CONFLICT',
      messageVi: 'Không thể xác thực lịch ca nguồn.',
      messageEn: 'Could not resolve source shift time range.',
    }
  }

  const substituteActiveRegs = existingRegistrations.filter(
    r =>
      r.user_id === substitute.id &&
      r.shift_id !== sourceShift.id &&
      ['approved', 'manually_assigned', 'pending'].includes(r.status),
  )

  const hasConflict = substituteActiveRegs.some(reg => {
    const assignedShift = allShifts.find(s => s.id === reg.shift_id)
    if (!assignedShift || assignedShift.status === 'cancelled' || assignedShift.deleted_at) return false
    const assignedTiming = resolveShiftDateTime(
      assignedShift.date,
      assignedShift.start_time,
      assignedShift.end_time,
      assignedShift.timezone,
    )
    if (!assignedTiming || !assignedTiming.valid) return false

    // Overlap: start1 < end2 and end1 > start2
    return (
      sourceTiming.startAt.getTime() < assignedTiming.endAt.getTime() &&
      sourceTiming.endAt.getTime() > assignedTiming.startAt.getTime()
    )
  })

  if (hasConflict) {
    return {
      valid: false,
      code: 'SUBSTITUTE_SCHEDULE_CONFLICT',
      messageVi: 'Nhân sự thay thế bị trùng lịch với một ca làm việc khác.',
      messageEn: 'Substitute staff has a schedule conflict with another shift.',
    }
  }

  return { valid: true }
}
