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

export interface PeriodDetailResponse {
  ok: boolean
  period: PayrollPeriod
  lines: PayrollLine[]
  audit: PayrollAudit[]
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
  month: string
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
    if (error.status === 409) return 'Dữ liệu đã thay đổi hoặc bị xung đột. Hãy tải lại trước khi thử tiếp.'
    if (error.status === 503) return error.code.endsWith('FEATURE_DISABLED')
      ? 'Tính năng đang tắt. Vui lòng chờ cấu hình được phê duyệt.'
      : 'Dịch vụ hiện chưa sẵn sàng. Vui lòng thử lại sau.'
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
      window.dispatchEvent(new CustomEvent('workforce-access-invalidated', { detail: { message: workforceErrorMessage(failure) } }))
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
    effectiveDate?: string
    scope?: RateScope
  } = {}): Promise<{ ok: true; rates: RateCard[]; pagination: Pagination }> {
    const q = new URLSearchParams()
    q.set('action', 'list_rates')
    if (params.page) q.set('page', String(params.page))
    if (params.pageSize) q.set('page_size', String(params.pageSize))
    if (params.staffId) q.set('staff_id', params.staffId)
    if (params.role) q.set('role', params.role)
    if (params.effectiveDate) q.set('effective_date', params.effectiveDate)
    if (params.scope) q.set('scope', params.scope)

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
  }): Promise<{ ok: true; rate: RateCard }> {
    return requestJson<{ ok: true; rate: RateCard }>('/api/workforce/payroll', {
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
  async getActualSegments(shiftId: string): Promise<{ ok: true; segments: ActualSegment[] }> {
    return requestJson<{ ok: true; segments: ActualSegment[] }>(
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
    month: string
  }): Promise<{ ok: true; performance: WorkforcePerformanceSummary }> {
    const q = new URLSearchParams()
    q.set('staff_id', params.staffId)
    q.set('role', params.role)
    q.set('month', params.month)

    return requestJson<{ ok: true; performance: WorkforcePerformanceSummary }>(
      `/api/workforce/performance?${q.toString()}`
    )
  },

  async getWorkforceOverview(params: {
    month: string
    role: WorkforceRole
  }): Promise<WorkforceOverviewResponse> {
    const q = new URLSearchParams()
    q.set('month', params.month)
    q.set('role', params.role)

    return requestJson<WorkforceOverviewResponse>(
      `/api/workforce/overview?${q.toString()}`
    )
  },
}
