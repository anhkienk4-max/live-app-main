import { z } from 'zod'
import { NextResponse } from 'next/server'

import {
  authorizationErrorResponse,
  isAuthorizationError,
  requireRole,
  type AuthenticatedServerUser,
  type ServerUserResolver,
} from '@/lib/server/authGuards'
import { requestIp } from '@/lib/server/apiSecurity'
import type { AccountRequestService } from '@/lib/server/accountRequestService'

const submissionSchema = z.object({
  email: z.string().trim().email().max(320),
  full_name: z.string().trim().min(1).max(200),
  phone: z.string().trim().max(80).nullable().optional(),
  department: z.string().trim().max(160).nullable().optional(),
}).strict()

const statusSchema = z.enum(['pending', 'approved', 'rejected', 'cancelled', 'all'])
const idSchema = z.string().uuid()

const acknowledgement = {
  ok: true,
  message: 'If your request is eligible, it has been recorded for review.',
}

type HandlerOptions = {
  service?: AccountRequestService
  resolveUser?: ServerUserResolver
}

type ReviewAction = 'approve' | 'reject'

const approveReviewSchema = z.object({
  expected_version: z.number().int().nonnegative(),
}).strict()

const rejectReviewSchema = approveReviewSchema.extend({
  rejection_reason: z.string().trim().min(1).max(1000),
}).strict()

function errorResponse(message: string, status: 400 | 503 = 400) {
  return NextResponse.json({ ok: false, error: { code: 'ACCOUNT_REQUEST_FAILED', message } }, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  })
}

function defaultService(): AccountRequestService {
  return {
    async submitAccountRequest(input, clientIp) {
      const service = await import('@/lib/server/accountRequestService')
      return service.submitAccountRequest(input, clientIp)
    },
    async listAccountRequests(status) {
      const service = await import('@/lib/server/accountRequestService')
      return service.listAccountRequests(status)
    },
    async getAccountRequest(id) {
      const service = await import('@/lib/server/accountRequestService')
      return service.getAccountRequest(id)
    },
    async approveAccountRequest(requestId, expectedVersion) {
      const service = await import('@/lib/server/accountRequestService')
      return service.approveAccountRequest(requestId, expectedVersion)
    },
    async rejectAccountRequest(requestId, expectedVersion, rejectionReason) {
      const service = await import('@/lib/server/accountRequestService')
      return service.rejectAccountRequest(requestId, expectedVersion, rejectionReason)
    },
  }
}

export function createAccountRequestPostHandler(options: HandlerOptions = {}) {
  const service = options.service ?? defaultService()
  return async function POST(request: Request) {
    let body: unknown
    try {
      body = await request.json()
    } catch {
      return errorResponse('Invalid account request payload.')
    }

    const parsed = submissionSchema.safeParse(body)
    if (!parsed.success) return errorResponse('Invalid account request payload.')

    try {
      await service.submitAccountRequest(parsed.data, requestIp(request))
      return NextResponse.json(acknowledgement, {
        status: 202,
        headers: { 'Cache-Control': 'no-store' },
      })
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ACCOUNT_REQUEST_RATE_LIMITED') {
        return NextResponse.json({ ok: false, error: { code: 'ACCOUNT_REQUEST_RATE_LIMITED', message: 'Too many requests. Please try again later.' } }, {
          status: 429,
          headers: { 'Cache-Control': 'no-store', 'Retry-After': '900' },
        })
      }
      return errorResponse('Unable to submit the account request.', 503)
    }
  }
}

function reviewErrorResponse(error: unknown) {
  const code = error && typeof error === 'object' && 'code' in error
    && typeof error.code === 'string'
    && error.code in {
      ACCOUNT_REQUEST_NOT_FOUND: true,
      ACCOUNT_REQUEST_NOT_PENDING: true,
      ACCOUNT_REQUEST_REVIEW_STALE: true,
      ACCOUNT_REQUEST_REJECTION_REASON_REQUIRED: true,
      ACCOUNT_REQUEST_REJECTION_REASON_TOO_LONG: true,
      STAFF_ADMIN_REQUIRED: true,
    }
    ? error.code as keyof typeof reviewErrorMessages
    : 'ACCOUNT_REQUEST_FAILED'
  const response = reviewErrorMessages[code]
  return NextResponse.json({ ok: false, error: { code, message: response[1] } }, {
    status: response[0],
    headers: { 'Cache-Control': 'no-store' },
  })
}

const reviewErrorMessages = {
    ACCOUNT_REQUEST_NOT_FOUND: [404, 'Account request was not found.'],
    ACCOUNT_REQUEST_NOT_PENDING: [409, 'Account request is no longer pending.'],
    ACCOUNT_REQUEST_REVIEW_STALE: [409, 'Account request changed. Refresh and try again.'],
    ACCOUNT_REQUEST_REJECTION_REASON_REQUIRED: [400, 'A rejection reason is required.'],
    ACCOUNT_REQUEST_REJECTION_REASON_TOO_LONG: [400, 'The rejection reason is too long.'],
    STAFF_ADMIN_REQUIRED: [403, 'You do not have permission to review account requests.'],
    ACCOUNT_REQUEST_FAILED: [503, 'Unable to review the account request.'],
} as const

export function createAccountRequestReviewPostHandler(
  action: ReviewAction,
  options: HandlerOptions = {},
) {
  const service = options.service ?? defaultService()
  return async function POST(request: Request, requestId: string) {
    try {
      await requireRole(request, 'admin', options.resolveUser)
    } catch (error) {
      if (isAuthorizationError(error)) return authorizationErrorResponse(error)
      return errorResponse('Unable to authorize the account request review.', 503)
    }

    if (!idSchema.safeParse(requestId).success) return errorResponse('Invalid account request id.')

    let body: unknown
    try {
      body = await request.json()
    } catch {
      return errorResponse('Invalid account request review payload.')
    }

    try {
      if (action === 'reject') {
        const parsed = rejectReviewSchema.safeParse(body)
        if (!parsed.success) return errorResponse('A valid rejection reason and expected version are required.')
        const result = await service.rejectAccountRequest(
          requestId,
          parsed.data.expected_version,
          parsed.data.rejection_reason,
        )
        return NextResponse.json({ ok: true, request: result }, {
          headers: { 'Cache-Control': 'no-store' },
        })
      }

      const parsed = approveReviewSchema.safeParse(body)
      if (!parsed.success) return errorResponse('A valid expected version is required.')
      const result = await service.approveAccountRequest(requestId, parsed.data.expected_version)
      return NextResponse.json({ ok: true, request: result }, {
        headers: { 'Cache-Control': 'no-store' },
      })
    } catch (error) {
      return reviewErrorResponse(error)
    }
  }
}

export function createAccountRequestGetHandler(options: HandlerOptions = {}) {
  const service = options.service ?? defaultService()
  return async function GET(request: Request) {
    let user: AuthenticatedServerUser
    try {
      user = await requireRole(request, 'admin', options.resolveUser)
    } catch (error) {
      if (isAuthorizationError(error)) return authorizationErrorResponse(error)
      return errorResponse('Unable to authorize the account request read.', 503)
    }
    void user

    const params = new URL(request.url).searchParams
    const id = params.get('id')
    const statusValue = params.get('status') ?? 'pending'
    if (id && !idSchema.safeParse(id).success) return errorResponse('Invalid account request id.')
    const status = statusSchema.safeParse(statusValue)
    if (!status.success) return errorResponse('Invalid account request status.')

    try {
      if (id) {
        return NextResponse.json({ ok: true, request: await service.getAccountRequest(id) }, {
          headers: { 'Cache-Control': 'no-store' },
        })
      }
      return NextResponse.json({ ok: true, requests: await service.listAccountRequests(status.data) }, {
        headers: { 'Cache-Control': 'no-store' },
      })
    } catch {
      return errorResponse('Unable to read account requests.', 503)
    }
  }
}
