import 'server-only'
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import { hasExactOrigin } from '@/lib/server/apiSecurity'
import {
  authorizationErrorResponse,
  isAuthorizationError,
  requireRole,
  type ServerUserResolver,
} from '@/lib/server/authGuards'
import {
  ReportRevisionSnapshotResponseSchema,
  UpdateReportRevisionSnapshotRequestSchema,
  UpdateReportRevisionSnapshotResponseSchema,
} from '@/lib/types/reportRevisionSnapshot'

const querySchema = z.object({
  report_id: z.string().trim().min(1).max(128),
  audience: z.enum(['internal', 'external']).default('internal'),
  revision_version: z.coerce.number().int().positive().optional(),
}).strict()

type Options = {
  createClient?: () => SupabaseClient | Promise<SupabaseClient>
  resolveUser?: ServerUserResolver
}

const noStore = { 'Cache-Control': 'no-store' }
const failure = (code: string, status: number) =>
  Response.json({ ok: false, error: { code } }, { status, headers: noStore })

export function createReportRevisionSnapshotHandler(options: Options = {}) {
  return {
    async GET(request: Request): Promise<Response> {
      try {
        await requireRole(request, ['admin', 'leader', 'member'], options.resolveUser)
        const url = new URL(request.url)
        const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams.entries()))
        if (!parsed.success) return failure('REPORT_SNAPSHOT_QUERY_INVALID', 400)

        const { report_id: reportId, audience, revision_version: revisionVersion } = parsed.data
        const client = options.createClient
          ? await options.createClient()
          : await (await import('@/lib/supabase/server')).createClient()
        const result = revisionVersion === undefined
          ? await client.rpc('preview_report_revision_sources_v1', {
            p_report_id: reportId,
            p_audience: audience,
          })
          : await client.rpc('get_report_revision_sources_v1', {
            p_report_id: reportId,
            p_revision_version: revisionVersion,
            p_audience: audience,
          })

        if (result.error) {
          const message = result.error.message ?? ''
          if (/REPORT_INTERNAL_SNAPSHOT_FORBIDDEN|42501|PERMISSION_DENIED/u.test(message))
            return failure('REPORT_SNAPSHOT_FORBIDDEN', 403)
          if (/REPORT_NOT_FOUND|REPORT_REVISION_SNAPSHOT_NOT_FOUND/u.test(message))
            return failure('REPORT_SNAPSHOT_NOT_FOUND', 404)
          if (/REPORT_SNAPSHOT_(AUDIENCE_INVALID|QUERY_INVALID)/u.test(message))
            return failure('REPORT_SNAPSHOT_QUERY_INVALID', 400)
          return failure('REPORT_SNAPSHOT_UNAVAILABLE', 503)
        }

        const checked = ReportRevisionSnapshotResponseSchema.safeParse(result.data)
        if (!checked.success
          || checked.data.reportId !== reportId
          || checked.data.audience !== audience
          || (revisionVersion !== undefined
            && (checked.data.kind !== 'revision' || checked.data.revisionVersion !== revisionVersion))
          || (revisionVersion === undefined && checked.data.kind !== 'preview')) {
          return failure('REPORT_SNAPSHOT_INVALID', 502)
        }

        return Response.json({ ok: true, data: checked.data }, { headers: noStore })
      } catch (error) {
        if (isAuthorizationError(error)) return authorizationErrorResponse(error)
        return failure('REPORT_SNAPSHOT_UNAVAILABLE', 503)
      }
    },

    async POST(request: Request): Promise<Response> {
      try {
        if (!hasExactOrigin(request)) return failure('REPORT_SNAPSHOT_ORIGIN_INVALID', 403)
        await requireRole(request, ['admin', 'leader', 'member'], options.resolveUser)
        let body: unknown
        try {
          body = await request.json()
        } catch {
          return failure('REPORT_SNAPSHOT_SAVE_REQUEST_INVALID', 400)
        }
        const parsed = UpdateReportRevisionSnapshotRequestSchema.safeParse(body)
        if (!parsed.success) return failure('REPORT_SNAPSHOT_SAVE_REQUEST_INVALID', 400)

        const input = parsed.data
        const client = options.createClient
          ? await options.createClient()
          : await (await import('@/lib/supabase/server')).createClient()
        const result = await client.rpc('update_report_with_revision_snapshot_v1', {
          p_report_id: input.reportId,
          p_patch: input.patch,
          p_expected_version: input.expectedVersion,
          p_reason: input.reason ?? null,
          p_event: input.event,
          p_idempotency_key: input.idempotencyKey,
        })
        if (result.error) {
          const message = result.error.message ?? ''
          if (/REPORT_VERSION_CONFLICT|REPORT_IDEMPOTENCY_CONFLICT|REPORT_CONFIRMED|REPORT_SOURCE_SCOPE_INVALID/u.test(message))
            return failure(message.match(/REPORT_[A-Z_]+/u)?.[0] ?? 'REPORT_CONFLICT', 409)
          if (/REPORT_SCOPE_DENIED|OPERATION_NOT_ALLOWED|REPORT_INTERNAL_SNAPSHOT_FORBIDDEN|42501/u.test(message))
            return failure('REPORT_SNAPSHOT_SAVE_FORBIDDEN', 403)
          if (/REPORT_NOT_FOUND/u.test(message)) return failure('REPORT_NOT_FOUND', 404)
          if (/REPORT_(PAYLOAD|FIELD|EVENT|EXPECTED_VERSION|IDEMPOTENCY_KEY)_/u.test(message))
            return failure(message.match(/REPORT_[A-Z_]+/u)?.[0] ?? 'REPORT_SNAPSHOT_SAVE_INVALID', 400)
          return failure('REPORT_SNAPSHOT_SAVE_UNAVAILABLE', 503)
        }

        const checked = UpdateReportRevisionSnapshotResponseSchema.safeParse(result.data)
        if (!checked.success || checked.data.revisionVersion <= input.expectedVersion)
          return failure('REPORT_SNAPSHOT_SAVE_INVALID', 502)
        return Response.json({ ok: true, data: checked.data }, { headers: noStore })
      } catch (error) {
        if (isAuthorizationError(error)) return authorizationErrorResponse(error)
        return failure('REPORT_SNAPSHOT_SAVE_UNAVAILABLE', 503)
      }
    },
  }
}
