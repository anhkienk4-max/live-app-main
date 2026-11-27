import type {
  ReportExternalSummaryMutationResponse,
  ReportExternalSummaryWorkflowRequest,
  ReportExternalSummaryWorkflowResponse,
} from '@/lib/types/reportExternalSummary'

export class ReportExternalSummaryServiceError extends Error {
  code: string
  status: number
  constructor(message: string, code: string, status: number) {
    super(message)
    this.name = 'ReportExternalSummaryServiceError'
    this.code = code
    this.status = status
  }
}

export const reportExternalSummaryService = {
  async getSummary(reportId: string): Promise<ReportExternalSummaryWorkflowResponse> {
    if (!reportId) {
      throw new ReportExternalSummaryServiceError('Report ID is required', 'REPORT_EXTERNAL_SUMMARY_QUERY_INVALID', 400)
    }

    const res = await fetch(`/api/reports/external-operational-summary?report_id=${encodeURIComponent(reportId)}`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
      },
      cache: 'no-store',
    })

    if (!res.ok) {
      const errBody = await res.json().catch(() => null)
      const errCode = errBody?.error?.code || `HTTP_${res.status}`
      const errMsg = errBody?.error?.message || `Failed to fetch external summary (${res.status})`
      throw new ReportExternalSummaryServiceError(errMsg, errCode, res.status)
    }

    const json = await res.json()
    return json.data as ReportExternalSummaryWorkflowResponse
  },

  async executeWorkflow(payload: ReportExternalSummaryWorkflowRequest): Promise<ReportExternalSummaryMutationResponse> {
    const res = await fetch('/api/reports/external-operational-summary', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(payload),
      cache: 'no-store',
    })

    if (!res.ok) {
      const errBody = await res.json().catch(() => null)
      const errCode = errBody?.error?.code || `HTTP_${res.status}`
      const errMsg = errBody?.error?.message || `Failed to execute external summary action (${res.status})`
      throw new ReportExternalSummaryServiceError(errMsg, errCode, res.status)
    }

    const json = await res.json()
    const result = json.data as ReportExternalSummaryMutationResponse

    // Validate that mutation receipt and readback match
    if (result.readback.summary && result.mutation.summaryId !== result.readback.summary.id) {
      throw new ReportExternalSummaryServiceError(
        'Readback summary ID mismatch',
        'REPORT_EXTERNAL_SUMMARY_READBACK_INVALID',
        502
      )
    }

    return result
  },

  async saveDraft(params: {
    reportId: string
    summaryId: string | null
    content: string
    expectedVersion: number | null
    idempotencyKey?: string
  }): Promise<ReportExternalSummaryMutationResponse> {
    return this.executeWorkflow({
      action: 'save_draft',
      reportId: params.reportId,
      summaryId: params.summaryId,
      content: params.content,
      expectedVersion: params.expectedVersion,
      reason: null,
      idempotencyKey: params.idempotencyKey || (typeof crypto !== 'undefined' ? crypto.randomUUID() : 'temp-key'),
    })
  },

  async submit(params: {
    reportId: string
    summaryId: string
    expectedVersion: number
    idempotencyKey?: string
  }): Promise<ReportExternalSummaryMutationResponse> {
    return this.executeWorkflow({
      action: 'submit',
      reportId: params.reportId,
      summaryId: params.summaryId,
      content: null,
      expectedVersion: params.expectedVersion,
      reason: null,
      idempotencyKey: params.idempotencyKey || (typeof crypto !== 'undefined' ? crypto.randomUUID() : 'temp-key'),
    })
  },

  async approve(params: {
    reportId: string
    summaryId: string
    expectedVersion: number
    idempotencyKey?: string
  }): Promise<ReportExternalSummaryMutationResponse> {
    return this.executeWorkflow({
      action: 'approve',
      reportId: params.reportId,
      summaryId: params.summaryId,
      content: null,
      expectedVersion: params.expectedVersion,
      reason: null,
      idempotencyKey: params.idempotencyKey || (typeof crypto !== 'undefined' ? crypto.randomUUID() : 'temp-key'),
    })
  },

  async reject(params: {
    reportId: string
    summaryId: string
    expectedVersion: number
    reason: string
    idempotencyKey?: string
  }): Promise<ReportExternalSummaryMutationResponse> {
    if (!params.reason?.trim()) {
      throw new ReportExternalSummaryServiceError('Review reason is required for rejection', 'REPORT_EXTERNAL_SUMMARY_REQUEST_INVALID', 400)
    }
    return this.executeWorkflow({
      action: 'reject',
      reportId: params.reportId,
      summaryId: params.summaryId,
      content: null,
      expectedVersion: params.expectedVersion,
      reason: params.reason,
      idempotencyKey: params.idempotencyKey || (typeof crypto !== 'undefined' ? crypto.randomUUID() : 'temp-key'),
    })
  },

  async requestCorrection(params: {
    reportId: string
    summaryId: string
    expectedVersion: number
    reason: string
    idempotencyKey?: string
  }): Promise<ReportExternalSummaryMutationResponse> {
    if (!params.reason?.trim()) {
      throw new ReportExternalSummaryServiceError('Review reason is required for requesting correction', 'REPORT_EXTERNAL_SUMMARY_REQUEST_INVALID', 400)
    }
    return this.executeWorkflow({
      action: 'request_correction',
      reportId: params.reportId,
      summaryId: params.summaryId,
      content: null,
      expectedVersion: params.expectedVersion,
      reason: params.reason,
      idempotencyKey: params.idempotencyKey || (typeof crypto !== 'undefined' ? crypto.randomUUID() : 'temp-key'),
    })
  },
}
