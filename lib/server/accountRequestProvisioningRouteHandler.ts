import { z } from 'zod'

import {
  authorizationErrorResponse,
  isAuthorizationError,
  requireRole,
  type ServerUserResolver,
} from '@/lib/server/authGuards'
import {
  accountRequestProvisioningService,
  AccountRequestProvisioningError,
  type AccountRequestProvisioningService,
} from '@/lib/server/accountRequestProvisioningService'

const requestSchema = z.object({
  expected_version: z.number().int().nonnegative(),
  retry: z.boolean().default(false),
}).strict()

const errorMap: Record<AccountRequestProvisioningError['code'], [number, string]> = {
  ACCOUNT_REQUEST_NOT_FOUND: [404, 'Account request was not found.'],
  ACCOUNT_REQUEST_NOT_APPROVED: [409, 'Only approved account requests can be provisioned.'],
  ACCOUNT_PROVISIONING_IN_PROGRESS: [409, 'Account provisioning is already in progress.'],
  ACCOUNT_PROVISIONING_RETRY_REQUIRED: [409, 'Retry must be explicitly requested for failed provisioning.'],
  ACCOUNT_PROVISIONING_RETRY_INVALID: [409, 'Retry is only valid for failed provisioning.'],
  ACCOUNT_PROVISIONING_STATE_INVALID: [409, 'The account request has an invalid provisioning state.'],
  ACCOUNT_PROVISIONING_STALE: [409, 'Account request changed. Refresh and try again.'],
  ACCOUNT_PROVISIONING_NOT_IN_PROGRESS: [409, 'Account provisioning is not in progress.'],
  ACCOUNT_PROVISIONING_STATUS_INVALID: [400, 'The provisioning result is invalid.'],
  ACCOUNT_PROVISIONING_IDENTITY_INCOMPLETE: [502, 'The account identity could not be completed.'],
  ACCOUNT_PROVISIONING_IDENTITY_CONFLICT: [409, 'The account identity could not be reconciled safely.'],
  ACCOUNT_PROVISIONING_ERROR_CODE_INVALID: [502, 'The provisioning failure could not be recorded.'],
  ACCOUNT_AUTH_USER_NOT_FOUND: [404, 'The authentication account was not found.'],
  ACCOUNT_AUTH_EMAIL_MISMATCH: [409, 'The authentication email does not match the account request.'],
  ACCOUNT_AUTH_USER_ALREADY_LINKED: [409, 'The authentication account is already linked.'],
  ACCOUNT_STAFF_NOT_FOUND: [404, 'The Staff record was not found.'],
  ACCOUNT_STAFF_ARCHIVED: [409, 'Archived or deleted Staff cannot receive an account.'],
  ACCOUNT_STAFF_INACTIVE: [409, 'Inactive Staff cannot receive an account.'],
  ACCOUNT_STAFF_ALREADY_LINKED: [409, 'The Staff record is already linked.'],
  ACCOUNT_EMAIL_AMBIGUOUS: [409, 'Multiple identities match this account request.'],
  ACCOUNT_AUTH_PROVIDER_UNAVAILABLE: [502, 'The authentication provider is unavailable.'],
  ACCOUNT_INVITE_FAILED: [502, 'The account invitation could not be sent.'],
  ACCOUNT_METADATA_SYNC_FAILED: [502, 'The account identity could not be synchronized.'],
  ACCOUNT_PROVISIONING_FAILED: [502, 'The account provisioning operation failed.'],
}

function response(code: string, message: string, status: number) {
  return Response.json({ ok: false, error: { code, message } }, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  })
}

function provisioningErrorResponse(error: AccountRequestProvisioningError) {
  const [status, message] = errorMap[error.code] ?? errorMap.ACCOUNT_PROVISIONING_FAILED
  return response(error.code, message, status)
}

export function createAccountRequestProvisioningPostHandler(dependencies: {
  resolveUser?: ServerUserResolver
  service?: AccountRequestProvisioningService
} = {}) {
  const service = dependencies.service || accountRequestProvisioningService
  return async function POST(request: Request, requestId: string) {
    try {
      const user = await requireRole(request, 'admin', dependencies.resolveUser)
      const parsedId = z.string().uuid().safeParse(requestId)
      if (!parsedId.success) return response('ACCOUNT_PROVISIONING_INVALID_REQUEST', 'Invalid account request id.', 400)
      let body: unknown
      try { body = await request.json() } catch { return response('ACCOUNT_PROVISIONING_INVALID_REQUEST', 'Invalid provisioning payload.', 400) }
      const parsed = requestSchema.safeParse(body)
      if (!parsed.success) return response('ACCOUNT_PROVISIONING_INVALID_REQUEST', 'Invalid provisioning payload.', 400)
      const result = await service.provision({
        requestId,
        expectedVersion: parsed.data.expected_version,
        retry: parsed.data.retry,
        redirectTo: new URL('/auth/confirm?next=/reset-password', request.url).toString(),
        actorAuthUserId: user.id,
      })
      return Response.json({ ok: true, request: result }, {
        headers: { 'Cache-Control': 'no-store' },
      })
    } catch (error) {
      if (isAuthorizationError(error)) return authorizationErrorResponse(error)
      if (error instanceof AccountRequestProvisioningError) return provisioningErrorResponse(error)
      return response('ACCOUNT_PROVISIONING_FAILED', 'The account provisioning operation failed.', 502)
    }
  }
}
