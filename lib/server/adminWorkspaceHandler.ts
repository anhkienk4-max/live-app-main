import { NextResponse } from 'next/server'
import {
  AuthorizationError,
  requireRole,
  resolveServerUser,
  type ServerUserResolver,
} from '@/lib/server/authGuards'

/** Returns only an authorization decision; workspace records remain owned by their existing APIs. */
export function createAdminWorkspaceHandler(resolveUser: ServerUserResolver = resolveServerUser) {
  return async function GET(request: Request) {
    try {
      const actor = await requireRole(request, 'admin', resolveUser)
      if (!actor.businessUserId) {
        return NextResponse.json({ ok: false, error: { code: 'BUSINESS_USER_REQUIRED' } }, {
          status: 403,
          headers: { 'Cache-Control': 'no-store' },
        })
      }
      return NextResponse.json({ ok: true }, {
        headers: { 'Cache-Control': 'no-store' },
      })
    } catch (error) {
      if (error instanceof AuthorizationError) {
        return NextResponse.json({
          ok: false,
          error: { code: error.code },
        }, {
          status: error.status,
          headers: { 'Cache-Control': 'no-store' },
        })
      }
      return NextResponse.json({
        ok: false,
        error: { code: 'ADMIN_WORKSPACE_UNAVAILABLE' },
      }, {
        status: 500,
        headers: { 'Cache-Control': 'no-store' },
      })
    }
  }
}
