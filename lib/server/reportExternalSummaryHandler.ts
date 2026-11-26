import 'server-only'

import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { authorizationErrorResponse, isAuthorizationError, requireRole, type ServerUserResolver } from '@/lib/server/authGuards'
import { readJsonBody, RequestBodyError } from '@/lib/server/apiSecurity'
import {
  ReportExternalSummaryMutationResponseSchema,
  ReportExternalSummaryWorkflowRequestSchema,
  ReportExternalSummaryWorkflowResponseSchema,
  ReportExternalSummaryWorkflowResultSchema,
} from '@/lib/types/reportExternalSummary'

type Options = {
  createClient?: () => SupabaseClient | Promise<SupabaseClient>
  resolveUser?: ServerUserResolver
}

const noStore = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }
const failure = (code: string, status: number) =>
  Response.json({ ok: false, error: { code } }, { status, headers: noStore })

function hasSameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin')
  if (!origin || origin.includes(',')) return false
  try {
    const parsed = new URL(origin)
    const requestUrl = new URL(request.url)
    return !parsed.username && !parsed.password && origin === parsed.origin && origin === requestUrl.origin
  } catch {
    return false
  }
}

function statusForRpcError(message: string, code?: string | null) {
  if (/AUTHENTICATION_REQUIRED/u.test(message) || code === '42501' && /AUTHENTICATION/u.test(message)) return 401
  if (/FORBIDDEN|MUTATION_FORBIDDEN|REVIEW_FORBIDDEN|REPLAY_FORBIDDEN|PERMISSION_DENIED/u.test(message) || code === '42501') return 403
  if (/REPORT_NOT_FOUND/u.test(message)) return 404
  if (/VERSION_CONFLICT|STATE_CONFLICT|IDEMPOTENCY_CONFLICT|REPORT_CONFIRMED/u.test(message) || code === '40001') return 409
  if (/REQUEST_INVALID|CONTENT_INVALID/u.test(message) || code === '22023') return 400
  return 503
}

export function createReportExternalSummaryHandler(options: Options = {}) {
  return {
    async GET(request: Request): Promise<Response> {
      try {
        await requireRole(request, ['admin', 'leader', 'member'], options.resolveUser)
        const url = new URL(request.url)
        const reportId = url.searchParams.get('report_id')?.trim()
        if (!reportId || reportId.length > 128 || [...url.searchParams.keys()].some((key) => key !== 'report_id')) {
          return failure('REPORT_EXTERNAL_SUMMARY_QUERY_INVALID', 400)
        }
        const client = options.createClient
          ? await options.createClient()
          : await (await import('@/lib/supabase/server')).createClient()
        const result = await client.rpc('get_report_external_summary_workflow_v1', { p_report_id: reportId })
        if (result.error) return failure(
          result.error.message?.includes('REPORT_NOT_FOUND') ? 'REPORT_NOT_FOUND' :
            result.error.message?.includes('FORBIDDEN') ? 'REPORT_EXTERNAL_SUMMARY_FORBIDDEN' :
              'REPORT_EXTERNAL_SUMMARY_UNAVAILABLE',
          statusForRpcError(result.error.message ?? '', result.error.code),
        )
        const checked = ReportExternalSummaryWorkflowResponseSchema.safeParse(result.data)
        if (!checked.success || checked.data.reportId !== reportId) return failure('REPORT_EXTERNAL_SUMMARY_READBACK_INVALID', 502)
        return Response.json({ ok: true, data: checked.data }, { headers: noStore })
      } catch (error) {
        if (isAuthorizationError(error)) return authorizationErrorResponse(error)
        return failure('REPORT_EXTERNAL_SUMMARY_UNAVAILABLE', 503)
      }
    },

    async POST(request: Request): Promise<Response> {
      try {
        if (!hasSameOrigin(request)) return failure('REPORT_EXTERNAL_SUMMARY_ORIGIN_INVALID', 403)
        await requireRole(request, ['admin', 'leader', 'member'], options.resolveUser)
        const body = await readJsonBody(request, 8_192)
        const parsed = ReportExternalSummaryWorkflowRequestSchema.safeParse(body)
        if (!parsed.success) return failure('REPORT_EXTERNAL_SUMMARY_REQUEST_INVALID', 400)
        const input = parsed.data
        const client = options.createClient
          ? await options.createClient()
          : await (await import('@/lib/supabase/server')).createClient()
        const result = await client.rpc('external_report_summary_workflow_v1', {
          p_action: input.action,
          p_report_id: input.reportId,
          p_summary_id: input.summaryId,
          p_content: input.content,
          p_expected_version: input.expectedVersion,
          p_reason: input.reason,
          p_idempotency_key: input.idempotencyKey,
        })
        if (result.error) {
          const message = result.error.message ?? ''
          return failure(message.match(/REPORT_[A-Z_]+/u)?.[0] ?? 'REPORT_EXTERNAL_SUMMARY_FAILED', statusForRpcError(message, result.error.code))
        }
        const mutation = ReportExternalSummaryWorkflowResultSchema.safeParse(result.data)
        if (!mutation.success || mutation.data.reportId !== input.reportId) return failure('REPORT_EXTERNAL_SUMMARY_READBACK_REQUIRED', 503)

        const readback = await client.rpc('get_report_external_summary_workflow_v1', { p_report_id: input.reportId })
        if (readback.error) return failure('REPORT_EXTERNAL_SUMMARY_READBACK_REQUIRED', 503)
        const parsedReadback = ReportExternalSummaryWorkflowResponseSchema.safeParse(readback.data)
        if (!parsedReadback.success || parsedReadback.data.reportId !== input.reportId
          || parsedReadback.data.summary?.id !== mutation.data.summaryId
          || parsedReadback.data.summary?.version !== mutation.data.version
          || parsedReadback.data.summary?.workflowState !== mutation.data.workflowState) {
          return failure('REPORT_EXTERNAL_SUMMARY_READBACK_REQUIRED', 503)
        }
        const response = ReportExternalSummaryMutationResponseSchema.safeParse({
          mutation: mutation.data,
          readback: parsedReadback.data,
        })
        if (!response.success) return failure('REPORT_EXTERNAL_SUMMARY_READBACK_INVALID', 502)
        return Response.json({ ok: true, data: response.data }, { headers: noStore })
      } catch (error) {
        if (isAuthorizationError(error)) return authorizationErrorResponse(error)
        if (error instanceof RequestBodyError) return failure(error.code, error.status)
        if (error instanceof z.ZodError) return failure('REPORT_EXTERNAL_SUMMARY_REQUEST_INVALID', 400)
        return failure('REPORT_EXTERNAL_SUMMARY_UNAVAILABLE', 503)
      }
    },
  }
}
