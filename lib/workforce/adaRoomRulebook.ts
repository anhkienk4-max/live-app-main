/**
 * ADA Livestream room rules: issued 2026-10-21, effective 2026-10-22.
 * Source: "NỘI QUY PHÒNG LIVESTREAM" (4 pages, version October 2026).
 *
 * This is a PROPOSAL calculator for independent case review, never an automatic
 * payroll deduction. Do not confuse the historical Workforce 10-minute
 * attendance grace with the separate check-in deadline in the rulebook.
 *
 * Labour Code 2019 Art.127 prohibits punitive wage deductions for employees.
 * Status, lawful payment impact and contractor-specific enforceability require
 * independent approval outside this pure domain model.
 */
export const ADA_ROOM_RULES_VERSION = 'ADA-LIVE-2026-10-22'
export const ADA_ROOM_RULES_EFFECTIVE_DATE = '2026-10-22'
export const ADA_ROOM_RULES_ISSUED_DATE = '2026-10-21'

export type LiveRole = 'host' | 'support'
export type LiveKind = 'daily' | 'campaign'
export type RoomRuleCode =
  | 'lateness' | 'checkin_or_outfit_missing' | 'checkout_or_recap_missing'
  | 'outfit_not_corrected' | 'conduct' | 'personal_work'
  | 'general' | 'cancel_or_no_show' | 'false_report'
  | 'verified_report_reward' | 'damage' | 'confidentiality' | 'cover_up'

export interface RoomRuleProposalInput {
  rule: RoomRuleCode
  role: LiveRole
  liveKind: LiveKind
  shiftDate: string
  /** Shift fee under the relevant agreement, never an invented hourly-rate proxy. */
  shiftFeeVnd?: number
  /** ISO 8601 timestamps WITH offset (e.g. +07:00). */
  liveStartAt?: string
  groupCheckInAt?: string
  airedLate?: boolean
  /** 1-based count of this individual's verified personal-work incidents in month. */
  personalWorkOccurrence?: number
  /** Hours of notice before live starts. */
  cancellationNoticeHours?: number
  replacementApproved?: boolean
  /** Must be >=24h for a campaign pass to waive a cancellation case. */
  campaignPassApprovedHoursBefore?: number
  /** First valid reporter + verified case required; amounts after approved case review. */
  firstVerifiedReporter?: boolean
  reviewedCaseAmountVnd?: number
  /** Recorded force-majeure evidence; pending evidence must never silently waive a case. */
  forceMajeureApproved?: boolean
}

export interface RoomRuleProposal {
  version: typeof ADA_ROOM_RULES_VERSION
  rule: RoomRuleCode
  state: 'proposed' | 'no_violation' | 'needs_evidence' | 'outside_policy' | 'manual_review'
  suggestedVnd: number | null
  /** Negative means deduction proposal, positive means bonus proposal. Not applied to payroll. */
  direction: 'review_deduction' | 'review_bonus' | 'none'
  label: string
  basis: string
  warnings: string[]
  requiredEvidence: string[]
  payrollApplied: false
}

const money = (value: number | undefined) => typeof value === 'number'
  && Number.isSafeInteger(value) && value >= 0 && value <= 1_000_000_000_000
const dateValid = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date)
  && !Number.isNaN(Date.parse(date))
  && new Date(date + 'T00:00:00Z').toISOString().slice(0, 10) === date
const timestamp = (value?: string): number | null =>
  value && /(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value))
    ? Date.parse(value) : null
const percent = (basis: number, rate: number) => Math.round(basis * rate / 100)
const labelFor: Record<RoomRuleCode,string> = {
  lateness:'Đi trễ mốc có mặt', checkin_or_outfit_missing:'Thiếu check-in hoặc ảnh outfit',
  checkout_or_recap_missing:'Thiếu check-out, recap hoặc hình report',
  outfit_not_corrected:'Trang phục không đạt trước giờ live',
  conduct:'Vi phạm tác phong', personal_work:'Làm việc riêng trong ca',
  general:'Vi phạm quy định chung', cancel_or_no_show:'Hủy / bỏ ca',
  false_report:'Report cố tình sai sự thật', verified_report_reward:'Thưởng report được xác minh',
  damage:'Hư hại trang thiết bị / tài sản', confidentiality:'Tiết lộ thông tin bảo mật',
  cover_up:'Bao che vi phạm',
}

export function proposeAdaRoomRule(input: RoomRuleProposalInput): RoomRuleProposal {
  const warnings: string[] = []
  const requiredEvidence: string[] = ['Mã ca, nhân sự, vai trò và phân loại Daily/Campaign', 'Bằng chứng, thời điểm và xác nhận của người rà soát độc lập']
  const base = {
    version: ADA_ROOM_RULES_VERSION, rule: input.rule, label: labelFor[input.rule],
    payrollApplied: false as const, warnings, requiredEvidence,
  }
  const result = (state: RoomRuleProposal['state'], amount: number | null,
    basis: string, direction: RoomRuleProposal['direction'] = amount === null || amount === 0
      ? 'none' : 'review_deduction'): RoomRuleProposal =>
    ({ ...base, state, suggestedVnd: amount, basis, direction })

  if (!dateValid(input.shiftDate)) return result('needs_evidence', null, 'Ngày ca không hợp lệ')
  if (input.shiftDate < ADA_ROOM_RULES_EFFECTIVE_DATE)
    return result('outside_policy', 0, 'Nội quy này chỉ có hiệu lực từ 22/10/2026')

  if (input.role !== 'host' && input.role !== 'support')
    return result('manual_review', null, 'Vai trò Kỹ thuật được xử lý theo quy định riêng')
  if (input.liveKind !== 'daily' && input.liveKind !== 'campaign')
    return result('needs_evidence', null, 'Chưa xác định loại ca')

  if (input.forceMajeureApproved) {
    warnings.push('Bất khả kháng phải được duyệt và lưu bằng chứng trong 48 giờ, không miễn tự động trước xác minh')
    return result('manual_review', null, 'Chuyển hồ sơ bất khả kháng cho người duyệt')
  }
  const campaign = input.liveKind === 'campaign'
  const fee = input.shiftFeeVnd
  const needFee = (): RoomRuleProposal | null => {
    if (money(fee)) return null
    requiredEvidence.push('Tiền ca từ hợp đồng/đơn giá đã xác nhận, không suy ra từ rate giờ')
    return result('needs_evidence', null, 'Thiếu căn cứ tiền ca để tính tỷ lệ')
  }
  const rated = (pct: number, text: string, state: RoomRuleProposal['state'] = 'proposed') => {
    const invalid = needFee()
    return invalid ?? result(state, percent(fee!, pct), text)
  }
  switch (input.rule) {
    case 'lateness': {
      const start = timestamp(input.liveStartAt)
      const checkin = timestamp(input.groupCheckInAt)
      requiredEvidence.push('Tin nhắn group check-in có timestamp, không thay bằng thời điểm chấm công hệ thống')
      if (input.airedLate) return rated(100, 'Phiên live air trễ giờ: 100% tiền ca theo nội quy')
      if (start === null || checkin === null)
        return result('needs_evidence', null, 'Không đủ giờ live và giờ gửi tin check-in để kết luận đi trễ')
      const requiredAt = start - (input.role === 'host' ? 15 : 30) * 60_000
      // Ceiling ensures 5m00s is in the first bucket and 5m01s is in the second.
      const lateMinutes = Math.max(0, Math.ceil((checkin - requiredAt) / 60_000))
      if (lateMinutes === 0) return result('no_violation', 0, 'Check-in đúng hoặc trước mốc có mặt bắt buộc')
      const bands = input.role === 'host'
        ? (campaign ? [20, 50, 100, 100] : [10, 30, 50, 100])
        : (campaign ? [25, 50, 100, 100] : [15, 30, 50, 100])
      const index = lateMinutes <= 5 ? 0 : lateMinutes <= 15 ? 1 : lateMinutes <= 30 ? 2 : 3
      return rated(bands[index], 'Trễ ' + lateMinutes + ' phút tính từ mốc có mặt bắt buộc; không dùng grace 10 phút của Workforce')
    }
    case 'checkin_or_outfit_missing':
      return result('proposed', campaign ? 200_000 : 100_000,
        'Mục II: một case thiếu check-in HOẶC ảnh outfit; Campaign x2')
    case 'checkout_or_recap_missing':
      requiredEvidence.push('Tin nhắn check-out trong 15 phút và với Trợ live: dashboard + visibility đã tải lên Drive')
      return result('proposed', campaign ? 200_000 : 100_000,
        'Mục II: thiếu check-out hoặc recap/hình report; Campaign x2')
    case 'outfit_not_corrected':
      return rated(campaign ? 60 : 30, 'Mục II: outfit không đạt, không được khắc phục trước live; Campaign x2')
    case 'conduct':
      return rated(30, 'Mục III/IV: vi phạm tác phong có xác minh; không tự nhân đôi Campaign')
    case 'personal_work': {
      const occurrence = input.personalWorkOccurrence
      if (!Number.isSafeInteger(occurrence) || !occurrence || occurrence < 1)
        return result('needs_evidence', null, 'Cần số lần vi phạm cùng nhân sự trong tháng')
      const pct = occurrence === 1 ? (campaign ? 50 : 30)
        : occurrence === 2 ? (campaign ? 100 : 50) : 100
      if (occurrence >= 3) warnings.push('Đề nghị ngưng xếp lịch 1 tuần, cần xác minh và phê duyệt')
      warnings.push('Cùng hành vi: mức này THAY THẾ mức 100.000đ chung và trừ 30% tác phong; không cộng đôi')
      return rated(pct, 'Mục V: lần ' + occurrence + ' trong tháng; chỉ tính một mức cho cùng hành vi')
    }
    case 'general':
      return result('proposed', 100_000, 'Mục I: vi phạm chung, không có quy định nhân đôi Campaign')
    case 'cancel_or_no_show': {
      requiredEvidence.push('Lịch ca, thời điểm báo hủy, lịch sử pass, xác nhận người thay và bất khả kháng')
      if (input.replacementApproved) {
        if (campaign && (!Number.isFinite(input.campaignPassApprovedHoursBefore)
          || input.campaignPassApprovedHoursBefore! < 24)) {
          return result('manual_review', null, 'Pass Campaign cần được đồng ý trước tối thiểu 24 giờ')
        }
        return result('no_violation', 0, 'Pass hợp lệ đã được vận hành chấp thuận, không phạt hủy')
      }
      const notice = input.cancellationNoticeHours
      if (notice === undefined || !Number.isFinite(notice) || notice < 0)
        return result('needs_evidence', null, 'Thiếu số giờ báo trước; cần xác minh bỏ ca')
      if (notice < 3) return result('proposed',
        input.role === 'host' ? (campaign ? 2_000_000 : 1_000_000)
          : (campaign ? 1_000_000 : 500_000),
        'Không báo hoặc báo sát giờ dưới 3 tiếng: mức bỏ ca')
      if (notice < (campaign ? 168 : 24))
        return result('proposed', input.role === 'host'
          ? (campaign ? 600_000 : 300_000)
          : (campaign ? 400_000 : 200_000),
        campaign ? 'Hủy Campaign trong 7 ngày không có pass hợp lệ; đề xuất cần xét duyệt'
          : 'Hủy Daily dưới 24 giờ, không có người thay hợp lệ')
      return result('no_violation', 0, 'Mốc báo hủy đạt điều kiện thời gian của nội quy')
    }
    case 'false_report':
      requiredEvidence.push('Quyết định xác minh report cố tình sai sự thật')
      return result('proposed', 200_000, 'Mục V: report sai sự thật, tính một lỗi kỷ luật')
    case 'verified_report_reward': {
      requiredEvidence.push('Case đã xác minh, người report hợp lệ đầu tiên, giá trị case đã phê duyệt')
      if (!input.firstVerifiedReporter || !money(input.reviewedCaseAmountVnd))
        return result('needs_evidence', null, 'Chưa xác minh người report đầu tiên hoặc giá trị case')
      return result('proposed', Math.min(70_000, percent(input.reviewedCaseAmountVnd!, 50)),
        'Mục V: thưởng 50% tiền case được xác minh, tối đa 70.000đ',
        'review_bonus')
    }
    case 'damage':
      return result('manual_review', null, 'Chỉ bồi thường thiệt hại thực tế sau xác minh tài sản và pháp lý')
    case 'confidentiality':
      return result('manual_review', null, 'Bảo mật: quyết định hợp tác và thiệt hại thực tế do bộ phận có thẩm quyền xem xét')
    case 'cover_up':
      return result('manual_review', null, 'Bao che: xem xét trách nhiệm tương đương case gốc; không tự suy luận số tiền')
  }
}

export interface MonthlyDisciplineSummary {
  totalConfirmedIncidents: number
  confirmedCampaignLate: number
  confirmedUnannouncedNoShows: number
  proposals: string[]
}

export function summarizeAdaRoomRecurrence(input: Omit<MonthlyDisciplineSummary,'proposals'>): MonthlyDisciplineSummary {
  for (const value of Object.values(input)) {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error('INVALID_VERIFIED_MONTHLY_COUNT')
  }
  const proposals: string[] = []
  if (input.totalConfirmedIncidents >= 3) proposals.push('Đề nghị ngưng xếp lịch live 1 tuần')
  if (input.confirmedCampaignLate >= 2) proposals.push('Đề nghị không xếp ca Campaign trong tháng tiếp theo')
  if (input.totalConfirmedIncidents >= 5 || input.confirmedUnannouncedNoShows >= 2)
    proposals.push('Đề nghị xem xét chấm dứt hợp tác theo quy trình')
  return { ...input, proposals }
}
