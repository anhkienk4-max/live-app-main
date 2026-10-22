/**
 * RC1.6: Workforce & Payroll client services.
 * Communicates exclusively with /api/workforce/* routes with no-store caching,
 * strict client-side validation, UUID idempotency and version checking.
 */

export type PayrollPeriodStatus = 'draft' | 'reviewed' | 'confirmed' | 'payroll_ready' | 'locked'
export type WorkforceRole = 'host' | 'support' | 'technical'
export type RateScope = 'staff_specific' | 'role_default'

export interface PayrollPeriod {
  id: string
  period_start: string
  period_end: string
  status: PayrollPeriodStatus
  revision: number
  created_by: string | null
  reviewed_by: string | null
  confirmed_by: string | null
  locked_by: string | null
  locked_at: string | null
  created_at: string
  updated_at: string
}

export interface PayrollLine {
  id: string
  period_id: string
  segment_id: string
  rate_card_id: string
  staff_id: string
  operational_role: WorkforceRole
  actual_minutes: number
  payable_minutes: number
  overtime_minutes: number
  rate_vnd_per_hour: number
  overtime_multiplier_basis_points: number
  gross_vnd: number
  adjustment_vnd: number
  net_vnd: number
  adjustment_reason: string | null
  calculation_version: string
  version: number
  voided_at: string | null
  created_at: string
  updated_at: string
}

export interface PayrollAudit {
  id: number
  period_id: string
  line_id: string | null
  line_version: number | null
  action: string
  actor_id: string
  reason: string
  from_status: string | null
  to_status: string | null
  created_at: string
  request_id: string | null
  request_payload: unknown
  previous_values: unknown
  updated_values: unknown
}

export interface RateCard {
  id: string
  staff_id: string | null
  scope: RateScope
  operational_role: WorkforceRole
  effective_from: string
  effective_through: string | null
  vnd_per_hour: number
  overtime_multiplier_basis_points: number
  approved_by: string
  approved_at: string
  approval_note: string
  created_at: string
}

export interface Pagination {
  page: number
  page_size: number
  total_count: number
  total_pages: number
  has_next: boolean
  has_previous: boolean
}

export interface RecalculationLineDiff {
  lineId: string
  segmentId: string
  staffId: string
  role: WorkforceRole
  version: number
  shiftDate: string
  actualMinutes: number
  payableMinutes: number
  overtimeMinutes: number
  oldRateCardId: string
  oldRateVndPerHour: number
  newRateCardId: string | null
  newRateVndPerHour: number | null
  oldGrossVnd: number
  newGrossVnd: number | null
  grossDeltaVnd: number
  adjustmentVnd: number
  adjustmentReason: string | null
  oldNetVnd: number
  newNetVnd: number | null
  netDeltaVnd: number
  rateChanged: boolean
  errorReason: string | null
}

export interface RecalculationDiffSummary {
  totalLines: number
  changedLinesCount: number
  totalGrossDeltaVnd: number
  totalNetDeltaVnd: number
  preservedAdjustmentsCount: number
  unresolvedCount: number
}

export interface PayrollReconciliationSummary {
  total_approved_segments: number
  reconciled_count: number
  unreconciled_count: number
  is_fully_reconciled: boolean
  unreconciled_segments: Array<{
    segmentId: string
    shiftId: string
    staffId: string
    role: string
    shiftDate: string
    reason: string
  }>
}

export interface PeriodDetailResponse {
  ok: boolean
  period: PayrollPeriod
  lines: PayrollLine[]
  audit: PayrollAudit[]
}

export interface RawSelfAttendanceReviewEvent {
  id: string
  shift_id: string
  staff_id: string
  operational_role: WorkforceRole
  event_kind: 'check_in' | 'check_out'
  recorded_at: string
  verification_status: 'pending_verification'
}

export interface ActualSegmentsResponse {
  ok: true
  segments: ActualSegment[]
  /** Independent app evidence, NOT approved actual minutes or group-message timestamps. */
  attendance_events?: RawSelfAttendanceReviewEvent[]
  /** False or missing means raw journal was not queried. Never interpret as zero check-ins. */
  attendance_review_enabled?: boolean
  shift_context?: {
    id: string
    date: string
    start_time: string
    end_time: string
    start_at?: string | null
    end_at?: string | null
    end_date?: string | null
    crosses_midnight?: boolean | null
    duration_minutes?: number | null
    status: string
    host_id?: string | null
    support_id?: string | null
    technical_id?: string | null
  } | null
  planned_staff?: Array<{
    id: string
    user_id: string
    operational_role: string
    status: string
  }>
  lateness_policy?: {
    grace_minutes: number
    policy_status: string
  }
}

export interface CoverageVerification {
  coverage_kind: 'planned' | 'cover' | 'replacement' | 'extra'
  assignment_verified: boolean
  is_exception: boolean
  requires_exception_approval: boolean
  matched_source: 'shift_roster' | 'shift_registration' | 'swap_request' | 'unverified_exception'
  exception_reason: string | null
}

export interface ActualSegment {
  id: string
  shift_id: string
  staff_id: string
  operational_role: WorkforceRole
  event_kind: 'worked' | 'no_show'
  coverage_kind: 'planned' | 'cover' | 'replacement' | 'extra'
  actual_start_at: string | null
  actual_end_at: string | null
  review_status: 'draft' | 'approved' | 'rejected'
  evidence_note: string
  review_note: string | null
  created_by: string
  reviewed_by: string | null
  reviewed_at: string | null
  version: number
  created_at: string
  coverage_verification?: CoverageVerification
}

export interface WorkforcePerformanceSummary {
  staffId: string
  role: WorkforceRole
  assignedShifts: number
  verifiedShifts: number
  unknownAttendanceShifts: number
  approvedNoShows: number
  approvedWorkedShifts: number
  approvedActualMinutes: number
  lateShifts: number
  onTimeShifts: number
  attendanceCoveragePct: number | null
  punctualityPct: number | null
  knownReliabilityPct: number | null
  isComplete: boolean
  warning: 'INCOMPLETE_ATTENDANCE_EVIDENCE' | null
  name?: string | null
  department?: string | null
}

export interface WorkforceTeamOverview {
  staffCount: number
  assignedShifts: number
  verifiedShifts: number
  unknownAttendanceShifts: number
  workedShifts: number
  approvedNoShows: number
  actualMinutes: number
  onTimeShifts: number
  lateShifts: number
  attendanceCoveragePct: number | null
  punctualityPct: number | null
  knownReliabilityPct: number | null
  isComplete: boolean
  incompleteStaffCount: number
}

export interface LeaderboardEntry {
  rank: number
  staff_id: string
  name: string | null
  punctuality_pct: number | null
  approved_worked_shifts: number
  approved_actual_minutes: number
}

export interface WorkforceOverviewResponse {
  ok: boolean
  period: string
  month?: string
  year?: string
  role: WorkforceRole
  team: WorkforceTeamOverview
  staff: WorkforcePerformanceSummary[]
  leaderboard: LeaderboardEntry[]
  leaderboard_policy_configured: boolean
  unmatched_approved_segments: number
  gmv_per_hour: number | null
  orders_per_hour: number | null
  warning: string | null
}

export class WorkforceServiceError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    message?: string,
    public readonly details?: unknown
  ) {
    super(message || code)
    this.name = 'WorkforceServiceError'
  }
}

export interface WorkforceCapabilities {
  actual_staffing: boolean
  team_performance: boolean
  own_performance: boolean
  payroll: boolean
}

export function workforceErrorMessage(error: unknown): string {
  if (error instanceof WorkforceServiceError) {
    if (error.status === 401) return 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.'
    if (error.status === 403) return 'Bạn không có quyền thực hiện thao tác này.'
    if (error.status === 409) {
      switch (error.code) {
        case 'WORKFORCE_GRACE_POLICY_NOT_CONFIGURED':
          return 'Chính sách ân hạn thời gian (Grace Period) chưa được cấu hình trên máy chủ. Vui lòng liên hệ quản trị viên.'
        case 'WORKFORCE_GRACE_POLICY_REQUIRED':
          return 'Chính sách ân hạn thời gian (Grace Period) bắt buộc và chưa hợp lệ.'
        case 'WORKFORCE_LEADERBOARD_POLICY_INVALID':
        case 'WORKFORCE_LEADERBOARD_POLICY_REQUIRED':
          return 'Chính sách ngưỡng mẫu tối thiểu của bảng xếp hạng chưa hợp lệ trên máy chủ.'
        case 'WORKFORCE_SHIFT_TIMESTAMPS_MISSING':
          return 'Dữ liệu ca làm việc thiếu mốc thời gian bắt đầu quy định.'
        case 'WORKFORCE_MULTIPLE_WORKED_SEGMENTS':
          return 'Phát hiện nhiều đoạn làm việc thực tế cho cùng một ca.'
        case 'WORKFORCE_NO_SHOW_CONTRADICTS_WORKED':
          return 'Minh chứng vắng mặt mâu thuẫn với dữ liệu làm việc thực tế.'
        case 'WORKFORCE_CONFLICTING_APPROVED_EVIDENCE':
          return 'Minh chứng chấm công đã duyệt bị xung đột dữ liệu.'
        case 'WORKFORCE_OVERLAPPING_APPROVED_SEGMENTS':
          return 'Các đoạn làm việc thực tế đã duyệt bị trùng lặp thời gian.'
        case 'WORKFORCE_ACTUAL_BEFORE_START':
          return 'Thời gian bắt đầu thực tế không hợp lệ.'
        case 'WORKFORCE_ACTUAL_TIMES_REQUIRED':
        case 'WORKFORCE_APPROVED_WORKED_TIMES_REQUIRED':
          return 'Thiếu mốc thời gian thực tế đã được xác nhận.'
        case 'WORKFORCE_TIMEZONE_REQUIRED':
        case 'WORKFORCE_TIME_INVALID':
        case 'WORKFORCE_DURATION_INVALID':
          return 'Thời gian hoặc thời lượng ca làm việc không hợp lệ.'
        case 'WORKFORCE_DUPLICATE_PLANNED_ASSIGNMENT':
          return 'Phát hiện phân công ca làm việc bị trùng lặp.'
        case 'ACTUAL_STAFFING_SELF_APPROVAL_PROHIBITED':
          return 'Người tự ghi nhận ca không được phép tự phê duyệt.'
        case 'ACTUAL_STAFFING_UNASSIGNED_REQUIRES_EXCEPTION':
          return 'Nhân sự chưa được phân công ca, cần ghi nhận ngoại lệ kèm lý do.'
        case 'ACTUAL_STAFFING_START_AFTER_END':
          return 'Thời gian bắt đầu ca thực tế phải trước thời gian kết thúc.'
        case 'ACTUAL_STAFFING_CANNOT_RECORD_FUTURE_SHIFT':
          return 'Không thể ghi nhận chấm công cho ca làm việc trong tương lai.'
        case 'ACTUAL_STAFFING_PAST_WINDOW_EXCEEDED':
          return 'Đã quá thời hạn cho phép ghi nhận ca làm việc trong quá khứ.'
        case 'SEGMENT_ALREADY_REVIEWED':
          return 'Bản ghi chấm công đã được xem xét trước đó. Vui lòng tải lại trang.'
        case 'PAYROLL_PERIOD_ALREADY_EXISTS':
          return 'Kỳ lương đã tồn tại.'
        case 'PAYROLL_PERIOD_LOCKED':
          return 'Kỳ lương đã khóa, không thể chỉnh sửa.'
        case 'VERSION_CONFLICT':
        case 'CONCURRENT_MODIFICATION':
        default:
          return 'Dữ liệu đã thay đổi hoặc bị xung đột. Hãy tải lại trước khi thử tiếp.'
      }
    }
    if (error.status === 503) {
      if (error.code.endsWith('FEATURE_DISABLED')) {
        return 'Tính năng đang tắt. Vui lòng chờ cấu hình được phê duyệt.'
      }
      if (error.code === 'WORKFORCE_TEAM_EVIDENCE_INCOMPLETE') {
        return 'Dữ liệu chứng từ chấm công đội ngũ chưa hoàn tất hoặc vượt quá giới hạn truy vấn.'
      }
      if (error.code === 'WORKFORCE_TEAM_SCOPE_INCOMPLETE' || error.code === 'WORKFORCE_PLANNED_SCOPE_INCOMPLETE') {
        return 'Phạm vi dữ liệu ca làm việc vượt quá giới hạn xử lý của hệ thống.'
      }
      return 'Dịch vụ hiện chưa sẵn sàng. Vui lòng thử lại sau.'
    }
    return error.code
  }
  return 'Không thể kết nối máy chủ. Vui lòng thử lại.'
}

async function requestResponse(url: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(url, {
    ...init,
    cache: 'no-store',
    credentials: 'same-origin',
    headers: {
      'Cache-Control': 'no-store',
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  })

  if (!res.ok) {
    let errorCode = 'UNKNOWN_ERROR'
    let details: unknown = null
    try {
      const body = await res.json()
      if (body?.error?.code) errorCode = body.error.code
      details = body
    } catch {
      // not json
    }
    const failure = new WorkforceServiceError(errorCode, res.status, errorCode, details)
    if (typeof window !== 'undefined' && (res.status === 401 || res.status === 403 || errorCode.endsWith('FEATURE_DISABLED'))) {
      // A forbidden operation does not prove the current user's entire Workforce
      // capability set is revoked. Revalidate it rather than making a local
      // action-level 403 permanently replace the authorized workspace.
      const revalidate = res.status === 403 && url !== '/api/workforce/capabilities'
      window.dispatchEvent(new CustomEvent('workforce-access-invalidated', { detail: { message: workforceErrorMessage(failure), revalidate } }))
    }
    throw failure
  }

  return res
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  return (await requestResponse(url, init)).json()
}

export const workforceService = {
  async getCapabilities(signal?: AbortSignal): Promise<{ ok: true; capabilities: WorkforceCapabilities }> {
    const result = await requestJson<{ ok: true; capabilities: WorkforceCapabilities }>('/api/workforce/capabilities', { signal })
    if (!result.ok || !result.capabilities || !['actual_staffing', 'team_performance', 'own_performance', 'payroll']
      .every(key => typeof result.capabilities[key as keyof WorkforceCapabilities] === 'boolean')) {
      throw new WorkforceServiceError('WORKFORCE_CAPABILITIES_INVALID', 503)
    }
    return result
  },
  // PAYROLL DISCOVERY & CRUD
  async listPeriods(params: {
    page?: number
    pageSize?: number
    dateFrom?: string
    dateTo?: string
    status?: PayrollPeriodStatus
  } = {}): Promise<{ ok: true; periods: PayrollPeriod[]; pagination: Pagination }> {
    const q = new URLSearchParams()
    q.set('action', 'list_periods')
    if (params.page) q.set('page', String(params.page))
    if (params.pageSize) q.set('page_size', String(params.pageSize))
    if (params.dateFrom) q.set('date_from', params.dateFrom)
    if (params.dateTo) q.set('date_to', params.dateTo)
    if (params.status) q.set('status', params.status)

    return requestJson<{ ok: true; periods: PayrollPeriod[]; pagination: Pagination }>(
      `/api/workforce/payroll?${q.toString()}`
    )
  },

  async getPeriod(periodId: string): Promise<PeriodDetailResponse> {
    return requestJson<PeriodDetailResponse>(`/api/workforce/payroll?period_id=${encodeURIComponent(periodId)}`)
  },

  async createPeriod(payload: {
    periodStart: string
    periodEnd: string
  }): Promise<{ ok: true; period: PayrollPeriod }> {
    return requestJson<{ ok: true; period: PayrollPeriod }>('/api/workforce/payroll', {
      method: 'POST',
      body: JSON.stringify({
        action: 'create_period',
        period_start: payload.periodStart,
        period_end: payload.periodEnd,
      }),
    })
  },

  async listRates(params: {
    page?: number
    pageSize?: number
    staffId?: string
    role?: WorkforceRole
    roles?: WorkforceRole[]
    effectiveDate?: string
    scope?: RateScope
    scopes?: RateScope[]
  } = {}): Promise<{ ok: true; rates: RateCard[]; pagination: Pagination }> {
    const q = new URLSearchParams()
    q.set('action', 'list_rates')
    if (params.page) q.set('page', String(params.page))
    if (params.pageSize) q.set('page_size', String(params.pageSize))
    if (params.staffId) q.set('staff_id', params.staffId)
    if (params.role) q.set('role', params.role)
    params.roles?.forEach(role => q.append('roles', role))
    if (params.effectiveDate) q.set('effective_date', params.effectiveDate)
    if (params.scope) q.set('scope', params.scope)
    params.scopes?.forEach(scope => q.append('scopes', scope))

    return requestJson<{ ok: true; rates: RateCard[]; pagination: Pagination }>(
      `/api/workforce/payroll?${q.toString()}`
    )
  },

  async registerRate(payload: {
    staffId: string | null
    operationalRole: WorkforceRole
    effectiveFrom: string
    effectiveThrough: string | null
    vndPerHour: number
    overtimeMultiplierBasisPoints: number
    approvalNote: string
  }): Promise<{ ok: true; rate: RateCard; superseded_rate_id?: string | null }> {
    return requestJson<{ ok: true; rate: RateCard; superseded_rate_id?: string | null }>('/api/workforce/payroll', {
      method: 'POST',
      body: JSON.stringify({
        action: 'register_rate',
        staff_id: payload.staffId,
        operational_role: payload.operationalRole,
        effective_from: payload.effectiveFrom,
        effective_through: payload.effectiveThrough,
        vnd_per_hour: payload.vndPerHour,
        overtime_multiplier_basis_points: payload.overtimeMultiplierBasisPoints,
        approval_note: payload.approvalNote,
      }),
    })
  },

  async previewRecalculation(periodId: string): Promise<{
    ok: true
    diffs: RecalculationLineDiff[]
    summary: RecalculationDiffSummary
  }> {
    return requestJson('/api/workforce/payroll', {
      method: 'POST',
      body: JSON.stringify({
        action: 'preview_recalculation',
        period_id: periodId,
      }),
    })
  },

  async recalculateDraft(payload: {
    periodId: string
    reason: string
    requestId: string
  }): Promise<{
    ok: true
    recalculated_count: number
    lines: PayrollLine[]
    summary: RecalculationDiffSummary
  }> {
    return requestJson('/api/workforce/payroll', {
      method: 'POST',
      body: JSON.stringify({
        action: 'recalculate_draft',
        period_id: payload.periodId,
        reason: payload.reason,
        request_id: payload.requestId,
      }),
    })
  },

  async autoCalculateDraft(payload: {
    periodId: string
    recalculateExisting?: boolean
    reason?: string
    requestId?: string
  } | string): Promise<{
    ok: true
    prepared_count: number
    recalculated_count?: number
    skipped_count: number
    unapproved_ot_exceptions?: Array<{ segmentId: string; staffId: string; shiftDate: string; reason: string }>
    reconciliation?: PayrollReconciliationSummary
    lines: PayrollLine[]
    recalculated_lines?: PayrollLine[]
    skipped: Array<{ segmentId: string; reason: string }>
  }> {
    const body = typeof payload === 'string'
      ? { action: 'auto_calculate_draft', period_id: payload }
      : {
          action: 'auto_calculate_draft',
          period_id: payload.periodId,
          recalculate_existing: payload.recalculateExisting,
          reason: payload.reason,
          request_id: payload.requestId,
        }
    return requestJson('/api/workforce/payroll', {
      method: 'POST',
      body: JSON.stringify(body),
    })
  },

  async prepareLine(payload: {
    periodId: string
    segmentId: string
    payableMinutes: number
    overtimeMinutes: number
    adjustmentVnd: number
    adjustmentReason: string | null
  }): Promise<{ ok: true; line: PayrollLine }> {
    return requestJson<{ ok: true; line: PayrollLine }>('/api/workforce/payroll', {
      method: 'POST',
      body: JSON.stringify({
        action: 'prepare_line',
        period_id: payload.periodId,
        segment_id: payload.segmentId,
        payable_minutes: payload.payableMinutes,
        overtime_minutes: payload.overtimeMinutes,
        adjustment_vnd: payload.adjustmentVnd,
        adjustment_reason: payload.adjustmentReason,
      }),
    })
  },

  async correctLine(payload: {
    periodId: string
    lineId: string
    expectedVersion: number
    requestId: string
    reason: string
    payableMinutes: number
    overtimeMinutes: number
    adjustmentVnd: number
    adjustmentReason: string | null
  }): Promise<{ ok: true; line: PayrollLine; audit: PayrollAudit; replayed: boolean }> {
    return requestJson<{ ok: true; line: PayrollLine; audit: PayrollAudit; replayed: boolean }>(
      '/api/workforce/payroll',
      {
        method: 'POST',
        body: JSON.stringify({
          action: 'correct_line',
          period_id: payload.periodId,
          line_id: payload.lineId,
          expected_version: payload.expectedVersion,
          request_id: payload.requestId,
          reason: payload.reason,
          payable_minutes: payload.payableMinutes,
          overtime_minutes: payload.overtimeMinutes,
          adjustment_vnd: payload.adjustmentVnd,
          adjustment_reason: payload.adjustmentReason,
        }),
      }
    )
  },

  async voidLine(payload: {
    periodId: string
    lineId: string
    expectedVersion: number
    requestId: string
    reason: string
  }): Promise<{ ok: true; line: PayrollLine; audit: PayrollAudit; replayed: boolean }> {
    return requestJson<{ ok: true; line: PayrollLine; audit: PayrollAudit; replayed: boolean }>(
      '/api/workforce/payroll',
      {
        method: 'POST',
        body: JSON.stringify({
          action: 'void_line',
          period_id: payload.periodId,
          line_id: payload.lineId,
          expected_version: payload.expectedVersion,
          request_id: payload.requestId,
          reason: payload.reason,
        }),
      }
    )
  },

  async transitionPeriod(payload: {
    periodId: string
    expectedStatus: PayrollPeriodStatus
    targetStatus: PayrollPeriodStatus
    reason: string
  }): Promise<{ ok: true; period: PayrollPeriod; audit: PayrollAudit }> {
    return requestJson<{ ok: true; period: PayrollPeriod; audit: PayrollAudit }>(
      '/api/workforce/payroll',
      {
        method: 'POST',
        body: JSON.stringify({
          action: 'transition',
          period_id: payload.periodId,
          expected_status: payload.expectedStatus,
          target_status: payload.targetStatus,
          reason: payload.reason,
        }),
      }
    )
  },

  getExportCsvUrl(periodId: string): string {
    return `/api/workforce/payroll?period_id=${encodeURIComponent(periodId)}&export=csv`
  },

  async downloadCsv(periodId: string): Promise<void> {
    const response = await requestResponse(this.getExportCsvUrl(periodId))
    if (!response.headers.get('Content-Type')?.includes('text/csv')) throw new WorkforceServiceError('WORKFORCE_CSV_RESPONSE_INVALID', 503)
    const url = URL.createObjectURL(await response.blob())
    const link = document.createElement('a')
    link.href = url
    link.download = 'payroll.csv'
    document.body.append(link)
    link.click()
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  },

  // ACTUAL STAFFING
  async getActualSegments(shiftId: string): Promise<ActualSegmentsResponse> {
    return requestJson<ActualSegmentsResponse>(
      `/api/workforce/actual?shift_id=${encodeURIComponent(shiftId)}`
    )
  },

  async recordActualSegment(payload: {
    shiftId: string
    staffId: string
    operationalRole: WorkforceRole
    eventKind: 'worked' | 'no_show'
    coverageKind: 'planned' | 'cover' | 'replacement' | 'extra'
    actualStartAt: string | null
    actualEndAt: string | null
    evidenceNote: string
  }): Promise<{ ok: true; segment: ActualSegment }> {
    return requestJson<{ ok: true; segment: ActualSegment }>('/api/workforce/actual', {
      method: 'POST',
      body: JSON.stringify({
        action: 'record',
        shift_id: payload.shiftId,
        staff_id: payload.staffId,
        operational_role: payload.operationalRole,
        event_kind: payload.eventKind,
        coverage_kind: payload.coverageKind,
        actual_start_at: payload.actualStartAt,
        actual_end_at: payload.actualEndAt,
        evidence_note: payload.evidenceNote,
      }),
    })
  },

  async reviewActualSegment(payload: {
    segmentId: string
    expectedVersion: number
    decision: 'approved' | 'rejected'
    reviewNote: string
  }): Promise<{ ok: true; segment: ActualSegment }> {
    return requestJson<{ ok: true; segment: ActualSegment }>('/api/workforce/actual', {
      method: 'POST',
      body: JSON.stringify({
        action: 'review',
        segment_id: payload.segmentId,
        expected_version: payload.expectedVersion,
        decision: payload.decision,
        review_note: payload.reviewNote,
      }),
    })
  },

  // WORKFORCE PERFORMANCE & OVERVIEW
  async getWorkforcePerformance(params: {
    staffId: string
    role: WorkforceRole
    period: string
  }): Promise<{ ok: true; performance: WorkforcePerformanceSummary }> {
    const q = new URLSearchParams()
    q.set('staff_id', params.staffId)
    q.set('role', params.role)
    q.set('period', params.period)

    return requestJson<{ ok: true; performance: WorkforcePerformanceSummary }>(
      `/api/workforce/performance?${q.toString()}`
    )
  },

  async getWorkforceOverview(params: {
    period: string
    role: WorkforceRole
  }): Promise<WorkforceOverviewResponse> {
    const q = new URLSearchParams()
    q.set('period', params.period)
    q.set('role', params.role)

    return requestJson<WorkforceOverviewResponse>(
      `/api/workforce/overview?${q.toString()}`
    )
  },
}
