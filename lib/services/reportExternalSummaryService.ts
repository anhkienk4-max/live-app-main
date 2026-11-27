import {
  ReportExternalSummaryMutationResponseSchema,
  ReportExternalSummaryWorkflowRequestSchema,
  type ReportExternalSummaryMutationResponse,
  type ReportExternalSummaryWorkflowRequest,
  type ReportExternalSummaryWorkflowResponse,
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

export function resolveSecureUuid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  throw new ReportExternalSummaryServiceError(
    'Secure UUID generation is unavailable in this environment',
    'UUID_GENERATION_UNAVAILABLE',
    500
  )
}

const pendingSummaryKeys = new Map<string, string>()
const summaryKeyStoragePrefix = 'rc19:external-summary:v1:'

export function summaryOperationSlot(reportId: string, action: string, summaryId?: string | null): string {
  return `${summaryKeyStoragePrefix}${encodeURIComponent(reportId)}:${action}:${encodeURIComponent(summaryId || 'root')}`
}

export function pendingKeyFor(slot: string): string | null {
  const memoryKey = pendingSummaryKeys.get(slot)
  if (memoryKey) return memoryKey
  if (typeof window === 'undefined') return null
  try {
    const saved = window.sessionStorage.getItem(slot)
    if (!saved) return null
    const parsed = JSON.parse(saved) as { key?: string }
    return typeof parsed.key === 'string' ? parsed.key : null
  } catch {
    return null
  }
}

export function setPendingKey(slot: string, key: string): void {
  pendingSummaryKeys.set(slot, key)
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(slot, JSON.stringify({ key }))
  } catch {}
}

export function clearPendingKey(slot: string, key: string): void {
  if (pendingSummaryKeys.get(slot) === key) {
    pendingSummaryKeys.delete(slot)
  }
  if (typeof window === 'undefined') return
  try {
    const saved = window.sessionStorage.getItem(slot)
    if (saved) {
      const parsed = JSON.parse(saved) as { key?: string }
      if (parsed.key === key) {
        window.sessionStorage.removeItem(slot)
      }
    }
  } catch {}
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

  async executeWorkflow(
    payload: ReportExternalSummaryWorkflowRequest,
    slot?: string
  ): Promise<ReportExternalSummaryMutationResponse> {
    const parsedInput = ReportExternalSummaryWorkflowRequestSchema.safeParse(payload)
    if (!parsedInput.success) {
      throw new ReportExternalSummaryServiceError(
        'Invalid workflow request payload',
        'REPORT_EXTERNAL_SUMMARY_REQUEST_INVALID',
        400
      )
    }

    let res: Response
    try {
      res = await fetch('/api/reports/external-operational-summary', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(payload),
        cache: 'no-store',
      })
    } catch (networkError) {
      // Preserve pending key on network error so retry re-sends the same UUID and payload
      throw new ReportExternalSummaryServiceError(
        `Network error during external summary action: ${networkError instanceof Error ? networkError.message : String(networkError)}`,
        'NETWORK_ERROR',
        500
      )
    }

    if (!res.ok) {
      const errBody = await res.json().catch(() => null)
      const errCode = errBody?.error?.code || `HTTP_${res.status}`
      const errMsg = errBody?.error?.message || `Failed to execute external summary action (${res.status})`
      throw new ReportExternalSummaryServiceError(errMsg, errCode, res.status)
    }

    const json = await res.json()
    const parseResult = ReportExternalSummaryMutationResponseSchema.safeParse(json.data)
    if (!parseResult.success) {
      throw new ReportExternalSummaryServiceError(
        'Malformed mutation response from server',
        'REPORT_EXTERNAL_SUMMARY_READBACK_INVALID',
        502
      )
    }
    const result = parseResult.data

    // Receipt and readback integrity validation:
    // 1. Report identity
    if (result.mutation.reportId !== payload.reportId) {
      throw new ReportExternalSummaryServiceError(
        `Mutation reportId ${result.mutation.reportId} does not match request reportId ${payload.reportId}`,
        'REPORT_EXTERNAL_SUMMARY_READBACK_INVALID',
        502
      )
    }

    // 2. Summary identity
    if (payload.summaryId && result.mutation.summaryId !== payload.summaryId) {
      throw new ReportExternalSummaryServiceError(
        `Mutation summaryId ${result.mutation.summaryId} does not match expected summaryId ${payload.summaryId}`,
        'REPORT_EXTERNAL_SUMMARY_READBACK_INVALID',
        502
      )
    }

    // 3. Expected action -> workflowState
    const expectedStateForAction: Record<ReportExternalSummaryWorkflowRequest['action'], string> = {
      save_draft: 'draft',
      submit: 'submitted',
      approve: 'approved',
      reject: 'rejected',
      request_correction: 'correction_requested',
    }
    if (result.mutation.workflowState !== expectedStateForAction[payload.action]) {
      throw new ReportExternalSummaryServiceError(
        `Mutation workflowState ${result.mutation.workflowState} does not match action ${payload.action}`,
        'REPORT_EXTERNAL_SUMMARY_READBACK_INVALID',
        502
      )
    }

    // 4. Version check
    if (payload.expectedVersion !== null) {
      if (result.mutation.replayed) {
        if (result.mutation.version < payload.expectedVersion) {
          throw new ReportExternalSummaryServiceError(
            `Replayed version ${result.mutation.version} is lower than expected ${payload.expectedVersion}`,
            'REPORT_EXTERNAL_SUMMARY_READBACK_INVALID',
            502
          )
        }
      } else {
        if (result.mutation.version !== payload.expectedVersion + 1) {
          throw new ReportExternalSummaryServiceError(
            `Mutation version ${result.mutation.version} did not increment expected version ${payload.expectedVersion}`,
            'REPORT_EXTERNAL_SUMMARY_READBACK_INVALID',
            502
          )
        }
      }
    }

    // 5. Readback presence
    if (!result.readback || !result.readback.summary) {
      throw new ReportExternalSummaryServiceError(
        'Authoritative readback summary is missing from response',
        'REPORT_EXTERNAL_SUMMARY_READBACK_REQUIRED',
        503
      )
    }

    // 6. Readback matches mutation
    if (
      result.readback.reportId !== payload.reportId ||
      result.readback.summary.id !== result.mutation.summaryId ||
      result.readback.summary.version !== result.mutation.version ||
      result.readback.summary.workflowState !== result.mutation.workflowState
    ) {
      throw new ReportExternalSummaryServiceError(
        'Readback summary does not match mutation receipt',
        'REPORT_EXTERNAL_SUMMARY_READBACK_INVALID',
        502
      )
    }

    // Clear pending key on validated success
    if (slot) {
      clearPendingKey(slot, payload.idempotencyKey)
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
    const slot = summaryOperationSlot(params.reportId, 'save_draft', params.summaryId)
    const idempotencyKey = params.idempotencyKey || pendingKeyFor(slot) || resolveSecureUuid()
    if (!params.idempotencyKey && !pendingKeyFor(slot)) {
      setPendingKey(slot, idempotencyKey)
    }
    return this.executeWorkflow({
      action: 'save_draft',
      reportId: params.reportId,
      summaryId: params.summaryId,
      content: params.content,
      expectedVersion: params.expectedVersion,
      reason: null,
      idempotencyKey,
    }, slot)
  },

  async submit(params: {
    reportId: string
    summaryId: string
    expectedVersion: number
    idempotencyKey?: string
  }): Promise<ReportExternalSummaryMutationResponse> {
    const slot = summaryOperationSlot(params.reportId, 'submit', params.summaryId)
    const idempotencyKey = params.idempotencyKey || pendingKeyFor(slot) || resolveSecureUuid()
    if (!params.idempotencyKey && !pendingKeyFor(slot)) {
      setPendingKey(slot, idempotencyKey)
    }
    return this.executeWorkflow({
      action: 'submit',
      reportId: params.reportId,
      summaryId: params.summaryId,
      content: null,
      expectedVersion: params.expectedVersion,
      reason: null,
      idempotencyKey,
    }, slot)
  },

  async approve(params: {
    reportId: string
    summaryId: string
    expectedVersion: number
    idempotencyKey?: string
  }): Promise<ReportExternalSummaryMutationResponse> {
    const slot = summaryOperationSlot(params.reportId, 'approve', params.summaryId)
    const idempotencyKey = params.idempotencyKey || pendingKeyFor(slot) || resolveSecureUuid()
    if (!params.idempotencyKey && !pendingKeyFor(slot)) {
      setPendingKey(slot, idempotencyKey)
    }
    return this.executeWorkflow({
      action: 'approve',
      reportId: params.reportId,
      summaryId: params.summaryId,
      content: null,
      expectedVersion: params.expectedVersion,
      reason: null,
      idempotencyKey,
    }, slot)
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
    const slot = summaryOperationSlot(params.reportId, 'reject', params.summaryId)
    const idempotencyKey = params.idempotencyKey || pendingKeyFor(slot) || resolveSecureUuid()
    if (!params.idempotencyKey && !pendingKeyFor(slot)) {
      setPendingKey(slot, idempotencyKey)
    }
    return this.executeWorkflow({
      action: 'reject',
      reportId: params.reportId,
      summaryId: params.summaryId,
      content: null,
      expectedVersion: params.expectedVersion,
      reason: params.reason,
      idempotencyKey,
    }, slot)
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
    const slot = summaryOperationSlot(params.reportId, 'request_correction', params.summaryId)
    const idempotencyKey = params.idempotencyKey || pendingKeyFor(slot) || resolveSecureUuid()
    if (!params.idempotencyKey && !pendingKeyFor(slot)) {
      setPendingKey(slot, idempotencyKey)
    }
    return this.executeWorkflow({
      action: 'request_correction',
      reportId: params.reportId,
      summaryId: params.summaryId,
      content: null,
      expectedVersion: params.expectedVersion,
      reason: params.reason,
      idempotencyKey,
    }, slot)
  },
}
