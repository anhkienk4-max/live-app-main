import type { OperationalRole, Shift, ShiftRegistration, User } from '@/lib/types/database.types'
import { resolveShiftDateTime } from '@/lib/utils/shiftUtils'

export const DAILY_PASS_MIN_LEAD_MINUTES = 120 // 2 hours
export const CAMPAIGN_PASS_MIN_LEAD_MINUTES = 1440 // 24 hours

export type SwapTimingErrorCode =
  | 'DAILY_PASS_DEADLINE_EXCEEDED'
  | 'CAMPAIGN_PASS_DEADLINE_EXCEEDED'
  | 'CAMPAIGN_PASS_APPROVAL_DEADLINE_EXCEEDED'
  | 'PASS_DURING_LIVE_NOT_ALLOWED'
  | 'EXCHANGE_DURING_LIVE_NOT_ALLOWED'
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
 * Uses reliable business data: checks shift.campaign_id foreign key,
 * avoiding heuristics like titles, tags, or unverified notes.
 */
export function isCampaignShift(
  shift: Shift,
  campaigns?: Array<{ id: string; status?: string; archived_at?: string | null; deleted_at?: string | null }>,
): boolean {
  if (!shift.campaign_id || typeof shift.campaign_id !== 'string') {
    return false
  }
  const normalized = shift.campaign_id.trim()
  if (normalized === '' || normalized.toLowerCase() === 'none') {
    return false
  }
  if (campaigns && campaigns.length > 0) {
    return campaigns.some(
      c => c.id === normalized && c.status !== 'archived' && !c.archived_at && !c.deleted_at,
    )
  }
  return true
}

/**
 * Validates lead time and live status for PASS / Swap requests per Issue #93.
 *
 * Rules:
 * - Daily PASS (replacement): Must be requested at least 2 hours (120 mins) before live start.
 * - Campaign PASS (replacement): Must be requested at least 24 hours (1440 mins) before live start.
 * - During Live: Ordinary PASS is prohibited. Emergency replacements during live
 *   must use Emergency Backup Reassignment by Leader/Manager, not staff self-service PASS.
 * - Exchange: Does NOT apply PASS lead time rules (120m / 1440m); only ensures
 *   neither shift has already started live or ended.
 */
export function validateSwapTiming(
  shift: Shift,
  requestTime: Date = new Date(),
  mode: 'replacement' | 'exchange' = 'replacement',
  campaigns?: Array<{ id: string; status?: string; archived_at?: string | null; deleted_at?: string | null }>,
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
      messageVi: 'Ca làm việc đã kết thúc, không thể tạo yêu cầu.',
      messageEn: 'Shift has already ended. Request cannot be created.',
    }
  }

  // 2. Prohibition during live
  if (requestTimeMs >= startAtMs && requestTimeMs < endAtMs) {
    if (mode === 'replacement') {
      return {
        allowed: false,
        code: 'PASS_DURING_LIVE_NOT_ALLOWED',
        isEmergencyBackupEligible: true,
        messageVi:
          'Không cho phép tạo yêu cầu PASS thông thường khi ca đang diễn ra. Trường hợp mệt hoặc phát sinh khẩn cấp phải thực hiện Emergency Backup Reassignment bởi Leader/Quản lý.',
        messageEn:
          'Ordinary PASS is not allowed while the shift is live. Emergency replacements during live must use Emergency Backup Reassignment by Leader/Manager.',
      }
    } else {
      return {
        allowed: false,
        code: 'EXCHANGE_DURING_LIVE_NOT_ALLOWED',
        isEmergencyBackupEligible: false,
        messageVi: 'Không cho phép đổi ca (Exchange) khi ca đang diễn ra trực tiếp.',
        messageEn: 'Shift exchange is not allowed while the shift is live.',
      }
    }
  }

  // For Exchange, PASS lead-time restrictions (120m / 1440m) do not apply
  if (mode === 'exchange') {
    return { allowed: true }
  }

  // 3. PASS mode lead time validations
  const leadMinutes = Math.floor((startAtMs - requestTimeMs) / 60_000)
  const isCampaign = isCampaignShift(shift, campaigns)

  // Campaign PASS: minimum 24 hours (1440 minutes)
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
    // Daily PASS: minimum 2 hours (120 minutes)
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
 * Validates approval timing for PASS / Swap requests per Issue #93.
 *
 * Rules:
 * - Campaign PASS (replacement): MUST be approved at least 24 hours (1440 minutes) before live start.
 * - Ordinary PASS: Cannot be approved during live.
 * - Exchange: Cannot be approved if either shift is already live or ended.
 */
export function validateSwapApprovalTiming(params: {
  sourceShift: Shift
  mode: 'replacement' | 'exchange'
  targetShift?: Shift | null
  approvalTime?: Date
  campaigns?: Array<{ id: string; status?: string; archived_at?: string | null; deleted_at?: string | null }>
}): SwapTimingValidationResult {
  const { sourceShift, mode, targetShift, approvalTime = new Date(), campaigns } = params

  if (sourceShift.status !== 'scheduled') {
    return {
      allowed: false,
      code: 'SHIFT_NOT_SCHEDULED',
      messageVi: 'Ca nguồn không ở trạng thái đã lên lịch (scheduled).',
      messageEn: 'Source shift is not in scheduled status.',
    }
  }

  const srcTiming = resolveShiftDateTime(
    sourceShift.date,
    sourceShift.start_time,
    sourceShift.end_time,
    sourceShift.timezone,
  )
  if (!srcTiming || !srcTiming.valid) {
    return {
      allowed: false,
      code: 'DAILY_PASS_DEADLINE_EXCEEDED',
      messageVi: 'Không thể xác định thời gian bắt đầu ca làm việc nguồn.',
      messageEn: 'Could not determine source shift start time.',
    }
  }

  const approvalTimeMs = approvalTime.getTime()
  const srcStartMs = srcTiming.startAt.getTime()
  const srcEndMs = srcTiming.endAt.getTime()

  if (approvalTimeMs >= srcEndMs) {
    return {
      allowed: false,
      code: 'SHIFT_ALREADY_ENDED',
      messageVi: 'Ca làm việc nguồn đã kết thúc, không thể phê duyệt.',
      messageEn: 'Source shift has already ended. Cannot approve.',
    }
  }

  if (approvalTimeMs >= srcStartMs) {
    return {
      allowed: false,
      code: 'PASS_DURING_LIVE_NOT_ALLOWED',
      isEmergencyBackupEligible: true,
      messageVi: 'Không cho phép phê duyệt PASS khi ca đang diễn ra trực tiếp.',
      messageEn: 'Cannot approve PASS while shift is live.',
    }
  }

  if (mode === 'replacement') {
    const isCampaign = isCampaignShift(sourceShift, campaigns)
    if (isCampaign) {
      const leadMinutes = Math.floor((srcStartMs - approvalTimeMs) / 60_000)
      if (leadMinutes < CAMPAIGN_PASS_MIN_LEAD_MINUTES) {
        return {
          allowed: false,
          code: 'CAMPAIGN_PASS_APPROVAL_DEADLINE_EXCEEDED',
          requiredLeadMinutes: CAMPAIGN_PASS_MIN_LEAD_MINUTES,
          actualLeadMinutes: leadMinutes,
          messageVi: `Yêu cầu PASS ca Campaign phải được phê duyệt trước giờ live tối thiểu 24 giờ (hiện tại còn ${leadMinutes} phút trước ca).`,
          messageEn: `Campaign PASS must be approved at least 24 hours prior to live start (${leadMinutes} minutes remaining).`,
        }
      }
    }
  } else if (mode === 'exchange' && targetShift) {
    const tgtTiming = resolveShiftDateTime(
      targetShift.date,
      targetShift.start_time,
      targetShift.end_time,
      targetShift.timezone,
    )
    if (tgtTiming?.valid) {
      if (approvalTimeMs >= tgtTiming.endAt.getTime()) {
        return {
          allowed: false,
          code: 'SHIFT_ALREADY_ENDED',
          messageVi: 'Ca làm việc mục tiêu đã kết thúc, không thể phê duyệt đổi ca.',
          messageEn: 'Target shift has already ended.',
        }
      }
      if (approvalTimeMs >= tgtTiming.startAt.getTime()) {
        return {
          allowed: false,
          code: 'EXCHANGE_DURING_LIVE_NOT_ALLOWED',
          messageVi: 'Không cho phép phê duyệt đổi ca khi ca mục tiêu đang diễn ra trực tiếp.',
          messageEn: 'Cannot approve exchange while target shift is live.',
        }
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

  if (sourceTiming && sourceTiming.valid) {
    const substituteAssignedRegistrations = existingRegistrations.filter(
      r =>
        r.user_id === substitute.id &&
        r.shift_id !== sourceShift.id &&
        ['approved', 'manually_assigned'].includes(r.status),
    )

    const substituteAssignedShiftIds = new Set(substituteAssignedRegistrations.map(r => r.shift_id))
    const substituteShifts = allShifts.filter(s => substituteAssignedShiftIds.has(s.id))

    for (const otherShift of substituteShifts) {
      const otherTiming = resolveShiftDateTime(
        otherShift.date,
        otherShift.start_time,
        otherShift.end_time,
        otherShift.timezone,
      )
      if (otherTiming && otherTiming.valid) {
        // Overlap: startA < endB && endA > startB
        if (
          sourceTiming.startAt < otherTiming.endAt &&
          sourceTiming.endAt > otherTiming.startAt
        ) {
          return {
            valid: false,
            code: 'SUBSTITUTE_SCHEDULE_CONFLICT',
            messageVi: `Nhân sự thay thế đã có lịch ca khác trùng giờ: ${otherShift.title || otherShift.date} (${otherShift.start_time} - ${otherShift.end_time}).`,
            messageEn: `Substitute staff has an overlapping shift: ${otherShift.title || otherShift.date}.`,
          }
        }
      }
    }
  }

  return { valid: true }
}
