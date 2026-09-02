import { z } from 'zod'
import type { ApplicationFilePurpose, CloudFileProvider } from '@/lib/files/applicationFileSource'
import {
  CloudFileIngestionError,
  type CloudFileIngestionErrorCode,
} from '@/lib/services/cloudFileIngestionService'
import {
  authorizationErrorResponse,
  isAuthorizationError,
  requirePermission,
  type ServerUserResolver,
} from '@/lib/server/authGuards'
import { readJsonBody, RequestBodyError } from '@/lib/server/apiSecurity'
import {
  applicationFileSourceService,
  type ApplicationFileSourceService,
} from '@/lib/services/applicationFileSourceService'

const requestSchema = z.object({
  purpose: z.enum(['schedule_import', 'report']),
  provider: z.string().trim().min(1).max(80),
  resource: z.string().trim().min(1).max(2_000),
  expectedContentType: z.string().trim().max(160).optional(),
}).strict()

const errorStatus: Record<CloudFileIngestionErrorCode, number> = {
  CLOUD_INGESTION_INVALID_REQUEST: 400,
  CLOUD_INGESTION_PROVIDER_UNSUPPORTED: 400,
  CLOUD_INGESTION_RESOURCE_INVALID: 400,
  CLOUD_INGESTION_AUTH_REQUIRED: 401,
  CLOUD_INGESTION_REAUTH_REQUIRED: 401,
  CLOUD_INGESTION_PERMISSION_DENIED: 403,
  CLOUD_INGESTION_NOT_FOUND: 404,
  CLOUD_INGESTION_RESOURCE_TYPE_UNSUPPORTED: 415,
  CLOUD_INGESTION_FILE_TYPE_UNSUPPORTED: 415,
  CLOUD_INGESTION_EMPTY_FILE: 422,
  CLOUD_INGESTION_FILE_TOO_LARGE: 413,
  CLOUD_INGESTION_TRANSIENT_FAILURE: 502,
  CLOUD_INGESTION_MALFORMED_RESPONSE: 502,
  CLOUD_INGESTION_PROVIDER_ERROR: 502,
}
const errorMessage: Record<CloudFileIngestionErrorCode, string> = {
  CLOUD_INGESTION_INVALID_REQUEST: 'The cloud file request is invalid.',
  CLOUD_INGESTION_PROVIDER_UNSUPPORTED: 'The selected cloud provider is not supported.',
  CLOUD_INGESTION_RESOURCE_INVALID: 'The cloud file reference is invalid.',
  CLOUD_INGESTION_AUTH_REQUIRED: 'Cloud file authorization is required.',
  CLOUD_INGESTION_REAUTH_REQUIRED: 'Cloud file authorization must be renewed.',
  CLOUD_INGESTION_PERMISSION_DENIED: 'The cloud file is not accessible.',
  CLOUD_INGESTION_NOT_FOUND: 'The cloud file was not found.',
  CLOUD_INGESTION_RESOURCE_TYPE_UNSUPPORTED: 'The selected cloud resource is not a file.',
  CLOUD_INGESTION_FILE_TYPE_UNSUPPORTED: 'The cloud file type is not supported for this workflow.',
  CLOUD_INGESTION_EMPTY_FILE: 'The cloud file is empty.',
  CLOUD_INGESTION_FILE_TOO_LARGE: 'The cloud file is too large.',
  CLOUD_INGESTION_TRANSIENT_FAILURE: 'The cloud provider is temporarily unavailable.',
  CLOUD_INGESTION_MALFORMED_RESPONSE: 'The cloud provider returned an invalid file response.',
  CLOUD_INGESTION_PROVIDER_ERROR: 'The cloud file could not be loaded.',
}

function errorResponse(code: string, message: string, status: number) {
  return Response.json({ ok: false, error: { code, message } }, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  })
}

function cloudErrorResponse(error: CloudFileIngestionError) {
  return errorResponse(error.code, errorMessage[error.code] || errorMessage.CLOUD_INGESTION_PROVIDER_ERROR, errorStatus[error.code] || 502)
}

export function createApplicationFileSourcePostHandler(dependencies: {
  resolveUser?: ServerUserResolver
  authorize?: (request: Request, purpose: ApplicationFilePurpose) => Promise<void>
  sourceService?: ApplicationFileSourceService
} = {}) {
  const sourceService = dependencies.sourceService || applicationFileSourceService
  return async function POST(request: Request) {
    try {
      const parsed = requestSchema.safeParse(await readJsonBody(request, 32 * 1024))
      if (!parsed.success) return errorResponse('CLOUD_INGESTION_INVALID_REQUEST', 'The cloud file request is invalid.', 400)

      if (dependencies.authorize) {
        await dependencies.authorize(request, parsed.data.purpose)
      } else {
        await requirePermission(
          request,
          parsed.data.purpose === 'schedule_import' ? 'shifts.import' : 'reports.submit',
          dependencies.resolveUser,
        )
      }

      const result = await sourceService.ingest({
        type: parsed.data.provider as CloudFileProvider,
        resource: parsed.data.resource,
      }, parsed.data.purpose, parsed.data.expectedContentType)
      const encodedFilename = encodeURIComponent(result.filename)
      return new Response(result.content as BodyInit, {
        status: 200,
        headers: {
          'Cache-Control': 'no-store',
          'Content-Type': result.mimeType,
          'Content-Length': String(result.size),
          'Content-Disposition': `attachment; filename="cloud-file"; filename*=UTF-8''${encodedFilename}`,
          'X-File-Name': encodedFilename,
          'X-File-Provider': result.sourceType,
          'X-File-Resource-Id': result.providerResourceId,
        },
      })
    } catch (error) {
      if (isAuthorizationError(error)) return authorizationErrorResponse(error)
      if (error instanceof RequestBodyError) return errorResponse(error.code, error.message, error.status)
      if (error instanceof CloudFileIngestionError) return cloudErrorResponse(error)
      return errorResponse('CLOUD_INGESTION_PROVIDER_ERROR', 'The cloud file could not be loaded.', 502)
    }
  }
}
