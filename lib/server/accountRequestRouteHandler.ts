import { z } from 'zod'
import { NextResponse } from 'next/server'

import {
  authorizationErrorResponse,
  isAuthorizationError,
  requireRole,
  type AuthenticatedServerUser,
  type ServerUserResolver,
} from '@/lib/server/authGuards'
import {
  type AccountRequestService,
} from '@/lib/server/accountRequestService'

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

function errorResponse(message: string, status: 400 | 503 = 400) {
  return NextResponse.json({ ok: false, error: { code: 'ACCOUNT_REQUEST_FAILED', message } }, {
    status,
    headers: { 'Cache-Control': 'no-store' },
  })
}

function defaultService(): AccountRequestService {
  return {
    async submitAccountRequest(input) {
      const service = await import('@/lib/server/accountRequestService')
      return service.submitAccountRequest(input)
    },
    async listAccountRequests(status) {
      const service = await import('@/lib/server/accountRequestService')
      return service.listAccountRequests(status)
    },
    async getAccountRequest(id) {
      const service = await import('@/lib/server/accountRequestService')
      return service.getAccountRequest(id)
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
      await service.submitAccountRequest(parsed.data)
      return NextResponse.json(acknowledgement, {
        status: 202,
        headers: { 'Cache-Control': 'no-store' },
      })
    } catch {
      return errorResponse('Unable to submit the account request.', 503)
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
