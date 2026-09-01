import { z } from 'zod'
import {
  authorizationErrorResponse,
  isAuthorizationError,
  requireRole,
  type ServerUserResolver,
} from '@/lib/server/authGuards'
import { readJsonBody, RequestBodyError } from '@/lib/server/apiSecurity'
import {
  accountProvisioningService,
  AccountProvisioningError,
  type AccountProvisioningService,
} from '@/lib/server/accountProvisioningService'

const role = z.enum(['admin', 'leader', 'member'])
const requestSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('provision'),
    staffId: z.string().trim().min(1).max(200),
    email: z.string().trim().email().max(320),
    initialRole: role,
  }).strict(),
  z.object({
    action: z.literal('link'),
    staffId: z.string().trim().min(1).max(200),
    authUserId: z.string().uuid(),
    initialRole: role.optional(),
  }).strict(),
])

const errorStatus: Record<AccountProvisioningError['code'], number> = {
  ACCOUNT_PROVISIONING_INVALID_REQUEST: 400,
  ACCOUNT_ROLE_MISSING: 422,
  ACCOUNT_ROLE_INVALID: 422,
  ACCOUNT_STAFF_NOT_FOUND: 404,
  ACCOUNT_STAFF_ARCHIVED: 409,
  ACCOUNT_STAFF_INACTIVE: 409,
  ACCOUNT_STAFF_ALREADY_LINKED: 409,
  ACCOUNT_AUTH_USER_NOT_FOUND: 404,
  ACCOUNT_AUTH_USER_ALREADY_LINKED: 409,
  ACCOUNT_AUTH_EMAIL_MISMATCH: 409,
  ACCOUNT_EMAIL_ALREADY_EXISTS: 409,
  ACCOUNT_EMAIL_AMBIGUOUS: 409,
  ACCOUNT_AUTH_PROVIDER_UNAVAILABLE: 502,
  ACCOUNT_INVITE_FAILED: 502,
  ACCOUNT_LINK_FAILED: 502,
}

const errorMessage: Record<AccountProvisioningError['code'], string> = {
  ACCOUNT_PROVISIONING_INVALID_REQUEST: 'The account provisioning request is invalid.',
  ACCOUNT_ROLE_MISSING: 'The Staff record has no valid application role.',
  ACCOUNT_ROLE_INVALID: 'The application role is invalid.',
  ACCOUNT_STAFF_NOT_FOUND: 'The Staff record was not found.',
  ACCOUNT_STAFF_ARCHIVED: 'Archived or deleted Staff cannot receive an account.',
  ACCOUNT_STAFF_INACTIVE: 'Inactive Staff cannot receive an account.',
  ACCOUNT_STAFF_ALREADY_LINKED: 'The Staff record already has an account.',
  ACCOUNT_AUTH_USER_NOT_FOUND: 'The authentication account was not found.',
  ACCOUNT_AUTH_USER_ALREADY_LINKED: 'The authentication account is already linked.',
  ACCOUNT_AUTH_EMAIL_MISMATCH: 'The authentication email does not match the Staff record.',
  ACCOUNT_EMAIL_ALREADY_EXISTS: 'An authentication account already exists for this email; use explicit linking.',
  ACCOUNT_EMAIL_AMBIGUOUS: 'Multiple authentication accounts match this email.',
  ACCOUNT_AUTH_PROVIDER_UNAVAILABLE: 'The authentication provider is unavailable.',
  ACCOUNT_INVITE_FAILED: 'The account invitation could not be sent.',
  ACCOUNT_LINK_FAILED: 'The Staff and authentication accounts could not be linked.',
}

function responseFor(code: string, message: string, status: number) {
  return Response.json({ ok: false, error: { code, message } }, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  })
}

function provisioningErrorResponse(error: AccountProvisioningError) {
  return responseFor(error.code, errorMessage[error.code], errorStatus[error.code])
}

export function createAccountProvisioningPostHandler(dependencies: {
  resolveUser?: ServerUserResolver
  service?: AccountProvisioningService
} = {}) {
  const service = dependencies.service || accountProvisioningService
  return async function POST(request: Request) {
    try {
      await requireRole(request, 'admin', dependencies.resolveUser)
      const parsed = requestSchema.safeParse(await readJsonBody(request, 32 * 1024))
      if (!parsed.success) {
        return responseFor(
          'ACCOUNT_PROVISIONING_INVALID_REQUEST',
          'The account provisioning request is invalid.',
          400,
        )
      }

      if (parsed.data.action === 'provision') {
        const staff = await service.provisionExistingStaff({
          staffId: parsed.data.staffId,
          email: parsed.data.email,
          initialRole: parsed.data.initialRole,
          redirectTo: new URL('/auth/confirm?next=/reset-password', request.url).toString(),
        })
        return Response.json({ ok: true, action: parsed.data.action, staff }, {
          status: 201,
          headers: { 'Cache-Control': 'no-store' },
        })
      }

      const staff = await service.linkExistingAuthUser({
        staffId: parsed.data.staffId,
        authUserId: parsed.data.authUserId,
        initialRole: parsed.data.initialRole,
      })
      return Response.json({ ok: true, action: parsed.data.action, staff }, {
        status: 200,
        headers: { 'Cache-Control': 'no-store' },
      })
    } catch (error) {
      if (isAuthorizationError(error)) return authorizationErrorResponse(error)
      if (error instanceof RequestBodyError) return responseFor(error.code, error.message, error.status)
      if (error instanceof AccountProvisioningError) return provisioningErrorResponse(error)
      return responseFor('ACCOUNT_LINK_FAILED', 'The account provisioning operation failed.', 502)
    }
  }
}
