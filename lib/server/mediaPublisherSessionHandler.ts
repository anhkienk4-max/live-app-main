import 'server-only'
import { randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { getAuthMode } from '@/lib/auth/authMode'
import { consumeRateLimit, rateLimitResponse, readJsonBody, RequestBodyError } from '@/lib/server/apiSecurity'
import {
  authorizationErrorResponse,
  isAuthorizationError,
  requireUser,
  type AuthenticatedServerUser,
  type ServerUserResolver,
} from '@/lib/server/authGuards'
import {
  deterministicShiftMediaPath,
  loadLiveSessionMediaSettings,
  signMediaPublishGrant,
  signMediaViewerGrant,
  type MediaSigningSettings,
} from '@/lib/server/mediaViewerKey'
import { mockShifts, mockUsers } from '@/lib/services/mockData'
import type { Shift, ShiftRegistration } from '@/lib/types/database.types'
import { canManageShiftLiveLink, canViewShiftLiveSession } from '@/lib/utils/liveStreamLink'

const postSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('start'),
    shiftId: z.string().trim().min(1).max(120),
    forceHandover: z.boolean().optional(),
  }).strict(),
  z.object({
    action: z.literal('heartbeat'),
    shiftId: z.string().trim().min(1).max(120),
    sessionId: z.string().trim().min(1).max(120),
  }).strict(),
  z.object({
    action: z.literal('stop'),
    shiftId: z.string().trim().min(1).max(120),
    sessionId: z.string().trim().min(1).max(120).optional(),
  }).strict(),
  z.object({
    action: z.literal('viewer-grant'),
    shiftId: z.string().trim().min(1).max(120),
  }).strict(),
  z.object({
    action: z.literal('sync-mock-shift'),
    shiftId: z.string().trim().min(1).max(120),
    status: z.enum(['scheduled', 'preparing', 'live', 'paused', 'completed', 'cancelled']).optional(),
    liveLink: z.string().max(2048).optional(),
  }).strict(),
])

const responseHeaders = {
  'Cache-Control': 'private, no-store',
  'Referrer-Policy': 'no-referrer',
  Vary: 'Cookie',
}

const errorResponse = (code: string, status: number) =>
  Response.json({ ok: false, error: { code } }, { status, headers: responseHeaders })

type MockSessionRecord = {
  sessionId: string
  shiftId: string
  mediaPath: string
  publisherAuthUserId: string
  publisherBusinessUserId: string
  startedAt: string
}

const mockSessions = new Map<string, MockSessionRecord>()
const mockShiftOverrides = new Map<string, Partial<Pick<Shift, 'status' | 'live_link'>>>()
const mockExtraShifts = new Map<string, Shift>()
const mockExtraRegistrations: ShiftRegistration[] = []

export function resetMockMediaSessionsForTests() {
  mockSessions.clear()
  mockShiftOverrides.clear()
  mockExtraShifts.clear()
  mockExtraRegistrations.length = 0
}

export function isLocalMockMediaAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  return (
    env.NODE_ENV === 'development'
    && env.NEXT_PUBLIC_USE_MOCK_DATA === 'true'
    && env.MEDIA_DEV_EPHEMERAL_KEY_ENABLED === 'true'
    && env.VERCEL !== '1'
    && !env.VERCEL_ENV
  )
}

function resolveMockShift(shiftId: string): Shift | null {
  const base = mockExtraShifts.get(shiftId) ?? mockShifts.find(s => s.id === shiftId)
  if (!base) return null
  const override = mockShiftOverrides.get(shiftId)
  return override ? { ...base, ...override } : { ...base }
}

function mapSupabaseRpcError(error: { code?: string; message?: string } | null | undefined): Response {
  const message = error?.message || ''
  if (message.includes('DUPLICATE_ACTIVE_PUBLISHER') || error?.code === '23505') {
    return errorResponse('DUPLICATE_ACTIVE_PUBLISHER', 409)
  }
  if (
    message.includes('OPERATION_NOT_ALLOWED')
    || message.includes('HANDOVER_REQUIRES_MANAGER')
    || message.includes('MEDIA_PERMISSION_DENIED')
    || error?.code === '42501'
  ) {
    return errorResponse('MEDIA_PERMISSION_DENIED', 403)
  }
  if (message.includes('MEDIA_SESSION_NOT_ACTIVE') || message.includes('SHIFT_NOT_FOUND')) {
    return errorResponse('MEDIA_SESSION_NOT_ACTIVE', 404)
  }
  if (message.includes('AUTHENTICATION_REQUIRED')) {
    return errorResponse('AUTHENTICATION_REQUIRED', 401)
  }
  return errorResponse('MEDIA_ACL_UNAVAILABLE', 503)
}

type HandlerDependencies = {
  resolveUser?: ServerUserResolver
  createClient?: () => Promise<SupabaseClient>
  settings?: () => MediaSigningSettings
  now?: () => number
  mode?: () => 'mock' | 'supabase'
  allowLocalMock?: () => boolean
}

export function createMediaPublisherSessionHandler(options: HandlerDependencies = {}) {
  const resolveEffectiveMode = () => options.mode?.() ?? getAuthMode()
  const resolveMockAllowed = () => options.allowLocalMock?.() ?? isLocalMockMediaAllowed()

  async function resolveActor(request: Request): Promise<AuthenticatedServerUser> {
    if (resolveEffectiveMode() === 'mock' && resolveMockAllowed()) {
      const actorId = request.headers.get('x-ada-live-actor-id')?.trim()
      const mockUser = actorId ? mockUsers.find(u => u.id === actorId && u.status === 'active') : null
      if (!mockUser) {
        return errorOrThrow401()
      }
      return {
        id: `mock-auth-${mockUser.id}`,
        email: mockUser.email,
        systemPermission: mockUser.system_permission ?? (mockUser.role === 'admin' ? 'admin' : mockUser.role === 'leader' ? 'leader' : 'member'),
        businessUserId: mockUser.id,
        role: mockUser.role,
      }
    }
    return requireUser(request, options.resolveUser)
  }

  function errorOrThrow401(): never {
    throw Object.assign(new Error('AUTHENTICATION_REQUIRED'), { status: 401 })
  }

  return {
    async GET(request: Request): Promise<Response> {
      try {
        const actor = await resolveActor(request)
        const url = new URL(request.url)
        const shiftId = url.searchParams.get('shiftId')?.trim()
        if (!shiftId || shiftId.length > 120) {
          return errorResponse('MEDIA_REQUEST_INVALID', 400)
        }

        if (resolveEffectiveMode() === 'mock' && resolveMockAllowed()) {
          const shift = resolveMockShift(shiftId)
          const businessUser = mockUsers.find(u => u.id === actor.businessUserId)
          if (!shift || !businessUser || !canViewShiftLiveSession(businessUser, shift, mockExtraRegistrations)) {
            return errorResponse('MEDIA_PERMISSION_DENIED', 403)
          }
          const active = mockSessions.get(shiftId)
          if (!active) {
            return Response.json(
              {
                ok: true,
                active: false,
                shiftId,
                mockLiveLink: shift.live_link,
                mockStatus: shift.status,
              },
              { headers: responseHeaders },
            )
          }
          return Response.json(
            {
              ok: true,
              active: true,
              shiftId,
              sessionId: active.sessionId,
              mediaPath: active.mediaPath,
              publisherBusinessUserId: active.publisherBusinessUserId,
              startedAt: active.startedAt,
              mockLiveLink: shift.live_link,
              mockStatus: shift.status,
            },
            { headers: responseHeaders },
          )
        }

        const db = options.createClient
          ? await options.createClient()
          : await (await import('@/lib/supabase/server')).createClient()
        const result = await db
          .from('media_publish_sessions')
          .select('id, shift_id, media_path, publisher_business_user_id, started_at, status')
          .eq('shift_id', shiftId)
          .eq('status', 'active')
          .limit(1)
        if (result.error) return errorResponse('MEDIA_ACL_UNAVAILABLE', 503)
        const row = result.data?.[0] as
          | { id: string; shift_id: string; media_path: string; publisher_business_user_id: string; started_at: string }
          | undefined
        if (!row) {
          return Response.json({ ok: true, active: false, shiftId }, { headers: responseHeaders })
        }
        return Response.json(
          {
            ok: true,
            active: true,
            shiftId: row.shift_id,
            sessionId: row.id,
            mediaPath: row.media_path,
            publisherBusinessUserId: row.publisher_business_user_id,
            startedAt: row.started_at,
          },
          { headers: responseHeaders },
        )
      } catch (error) {
        if (isAuthorizationError(error)) return authorizationErrorResponse(error)
        if (error && typeof error === 'object' && 'status' in error && (error as { status: number }).status === 401) {
          return errorResponse('AUTHENTICATION_REQUIRED', 401)
        }
        return errorResponse('MEDIA_UNAVAILABLE', 503)
      }
    },

    async POST(request: Request): Promise<Response> {
      try {
        const actor = await resolveActor(request)
        const settings = (options.settings ?? loadLiveSessionMediaSettings)()
        const origin = request.headers.get('origin')
        const requestUrlOrigin = new URL(request.url).origin
        const requestHost = request.headers.get('host')
        const expectedAppUrl = new URL(settings.appOrigin)
        const targetMatches =
          requestUrlOrigin === expectedAppUrl.origin
          || (Boolean(requestHost) && requestHost === expectedAppUrl.host)
        if (origin !== settings.appOrigin || !targetMatches) {
          return errorResponse('MEDIA_ORIGIN_DENIED', 403)
        }

        const rawBody = await readJsonBody(request, 4096)
        const parsed = postSchema.safeParse(rawBody)
        if (!parsed.success) {
          return errorResponse('MEDIA_REQUEST_INVALID', 400)
        }

        const now = (options.now ?? Date.now)()
        const limit = consumeRateLimit({
          key: `media-session:${actor.id}`,
          limit: 60,
          windowMs: 60_000,
          now,
        })
        if (!limit.allowed) return rateLimitResponse(limit.resetAt)

        const data = parsed.data
        const useMock = resolveEffectiveMode() === 'mock' && resolveMockAllowed()

        if (data.action === 'sync-mock-shift') {
          if (!useMock) {
            return errorResponse('MEDIA_PERMISSION_DENIED', 403)
          }
          const shift = resolveMockShift(data.shiftId)
          const businessUser = mockUsers.find(u => u.id === actor.businessUserId)
          if (!shift || !businessUser) return errorResponse('SHIFT_NOT_FOUND', 404)
          if (!canManageShiftLiveLink(businessUser, shift, mockExtraRegistrations) && businessUser.system_permission !== 'admin') {
            return errorResponse('MEDIA_PERMISSION_DENIED', 403)
          }
          const currentOverride = mockShiftOverrides.get(data.shiftId) ?? {}
          if (data.status !== undefined) currentOverride.status = data.status
          if (data.liveLink !== undefined) currentOverride.live_link = data.liveLink || undefined
          mockShiftOverrides.set(data.shiftId, currentOverride)
          if (data.status === 'completed' || data.status === 'cancelled') {
            mockSessions.delete(data.shiftId)
          }
          return Response.json({ ok: true, shiftId: data.shiftId, ...currentOverride }, { headers: responseHeaders })
        }

        if (useMock) {
          const shift = resolveMockShift(data.shiftId)
          const businessUser = mockUsers.find(u => u.id === actor.businessUserId)
          if (!shift || !businessUser) return errorResponse('SHIFT_NOT_FOUND', 404)

          if (data.action === 'start') {
            if (!canManageShiftLiveLink(businessUser, shift, mockExtraRegistrations)) {
              return errorResponse('MEDIA_PERMISSION_DENIED', 403)
            }
            const existing = mockSessions.get(data.shiftId)
            if (existing && existing.publisherBusinessUserId !== businessUser.id) {
              if (!data.forceHandover) {
                return errorResponse('DUPLICATE_ACTIVE_PUBLISHER', 409)
              }
              if (businessUser.system_permission === 'member' && businessUser.role === 'staff') {
                return errorResponse('MEDIA_PERMISSION_DENIED', 403)
              }
            }
            const mediaPath = deterministicShiftMediaPath(data.shiftId)
            const session: MockSessionRecord = {
              sessionId: randomUUID(),
              shiftId: data.shiftId,
              mediaPath,
              publisherAuthUserId: actor.id,
              publisherBusinessUserId: businessUser.id,
              startedAt: new Date(now).toISOString(),
            }
            mockSessions.set(data.shiftId, session)
            const credential = signMediaPublishGrant({ settings, path: mediaPath, sub: businessUser.id, now })
            return Response.json(
              {
                ok: true,
                sessionId: session.sessionId,
                shiftId: session.shiftId,
                mediaPath: session.mediaPath,
                mediaOrigin: settings.mediaOrigin,
                whipUrl: credential.whipUrl,
                token: credential.token,
                expiresAt: credential.expiresAt,
              },
              { headers: responseHeaders },
            )
          }

          if (data.action === 'heartbeat') {
            if (!canManageShiftLiveLink(businessUser, shift, mockExtraRegistrations)) {
              mockSessions.delete(data.shiftId)
              return errorResponse('MEDIA_PERMISSION_DENIED', 403)
            }
            const existing = mockSessions.get(data.shiftId)
            if (!existing || existing.sessionId !== data.sessionId || existing.publisherBusinessUserId !== businessUser.id) {
              return errorResponse('MEDIA_SESSION_NOT_ACTIVE', 404)
            }
            const credential = signMediaPublishGrant({ settings, path: existing.mediaPath, sub: businessUser.id, now })
            return Response.json(
              {
                ok: true,
                sessionId: existing.sessionId,
                shiftId: existing.shiftId,
                mediaPath: existing.mediaPath,
                mediaOrigin: settings.mediaOrigin,
                whipUrl: credential.whipUrl,
                token: credential.token,
                expiresAt: credential.expiresAt,
              },
              { headers: responseHeaders },
            )
          }

          if (data.action === 'stop') {
            const existing = mockSessions.get(data.shiftId)
            if (existing && (!data.sessionId || existing.sessionId === data.sessionId)) {
              if (
                existing.publisherBusinessUserId !== businessUser.id
                && !canManageShiftLiveLink(businessUser, shift, mockExtraRegistrations)
              ) {
                return errorResponse('MEDIA_PERMISSION_DENIED', 403)
              }
              mockSessions.delete(data.shiftId)
            }
            return Response.json({ ok: true, shiftId: data.shiftId, stopped: true }, { headers: responseHeaders })
          }

          // action === 'viewer-grant'
          if (!canViewShiftLiveSession(businessUser, shift, mockExtraRegistrations)) {
            return errorResponse('MEDIA_PERMISSION_DENIED', 403)
          }
          const existing = mockSessions.get(data.shiftId)
          if (!existing) {
            return errorResponse('MEDIA_SESSION_NOT_ACTIVE', 404)
          }
          const credential = signMediaViewerGrant({ settings, path: existing.mediaPath, now })
          return Response.json(
            {
              ok: true,
              sessionId: existing.sessionId,
              shiftId: existing.shiftId,
              mediaPath: existing.mediaPath,
              mediaOrigin: settings.mediaOrigin,
              frameUrl: `${settings.mediaOrigin}/${existing.mediaPath}/frame`,
              token: credential.token,
              expiresAt: credential.expiresAt,
              publisherBusinessUserId: existing.publisherBusinessUserId,
            },
            { headers: responseHeaders },
          )
        }

        // Authoritative Supabase RPC enforcement path (never uses service_role).
        const db = options.createClient
          ? await options.createClient()
          : await (await import('@/lib/supabase/server')).createClient()

        if (data.action === 'start') {
          const rpc = await db.rpc('start_shift_media_publish_session', {
            p_shift_id: data.shiftId,
            p_force_handover: Boolean(data.forceHandover),
          })
          if (rpc.error || !rpc.data || typeof rpc.data !== 'object') {
            return mapSupabaseRpcError(rpc.error)
          }
          const session = rpc.data as { session_id: string; shift_id: string; media_path: string }
          const credential = signMediaPublishGrant({
            settings,
            path: session.media_path,
            sub: actor.businessUserId ?? actor.id,
            now,
          })
          return Response.json(
            {
              ok: true,
              sessionId: session.session_id,
              shiftId: session.shift_id,
              mediaPath: session.media_path,
              mediaOrigin: settings.mediaOrigin,
              whipUrl: credential.whipUrl,
              token: credential.token,
              expiresAt: credential.expiresAt,
            },
            { headers: responseHeaders },
          )
        }

        if (data.action === 'heartbeat') {
          const activeCheck = await db
            .from('media_publish_sessions')
            .select('id, shift_id, media_path, publisher_auth_user_id, status')
            .eq('id', data.sessionId)
            .eq('shift_id', data.shiftId)
            .eq('status', 'active')
            .limit(1)
          if (activeCheck.error) return mapSupabaseRpcError(activeCheck.error)
          const row = activeCheck.data?.[0] as
            | { id: string; shift_id: string; media_path: string; publisher_auth_user_id: string }
            | undefined
          if (!row) return errorResponse('MEDIA_SESSION_NOT_ACTIVE', 404)
          if (row.publisher_auth_user_id !== actor.id) return errorResponse('MEDIA_PERMISSION_DENIED', 403)
          const credential = signMediaPublishGrant({
            settings,
            path: row.media_path,
            sub: actor.businessUserId ?? actor.id,
            now,
          })
          return Response.json(
            {
              ok: true,
              sessionId: row.id,
              shiftId: row.shift_id,
              mediaPath: row.media_path,
              mediaOrigin: settings.mediaOrigin,
              whipUrl: credential.whipUrl,
              token: credential.token,
              expiresAt: credential.expiresAt,
            },
            { headers: responseHeaders },
          )
        }

        if (data.action === 'stop') {
          const rpc = await db.rpc('stop_shift_media_publish_session', {
            p_shift_id: data.shiftId,
            p_session_id: data.sessionId ?? null,
          })
          if (rpc.error) return mapSupabaseRpcError(rpc.error)
          return Response.json({ ok: true, shiftId: data.shiftId, stopped: Boolean(rpc.data) }, { headers: responseHeaders })
        }

        // action === 'viewer-grant'
        const rpc = await db.rpc('authorize_shift_media_viewer', {
          p_shift_id: data.shiftId,
        })
        if (rpc.error || !rpc.data || typeof rpc.data !== 'object') {
          return mapSupabaseRpcError(rpc.error)
        }
        const viewerAuth = rpc.data as {
          session_id: string
          shift_id: string
          media_path: string
          publisher_business_user_id?: string
        }
        const credential = signMediaViewerGrant({ settings, path: viewerAuth.media_path, now })
        return Response.json(
          {
            ok: true,
            sessionId: viewerAuth.session_id,
            shiftId: viewerAuth.shift_id,
            mediaPath: viewerAuth.media_path,
            mediaOrigin: settings.mediaOrigin,
            frameUrl: `${settings.mediaOrigin}/${viewerAuth.media_path}/frame`,
            token: credential.token,
            expiresAt: credential.expiresAt,
            publisherBusinessUserId: viewerAuth.publisher_business_user_id,
          },
          { headers: responseHeaders },
        )
      } catch (error) {
        if (isAuthorizationError(error)) return authorizationErrorResponse(error)
        if (error instanceof RequestBodyError) return errorResponse(error.code, error.status)
        if (error && typeof error === 'object' && 'status' in error && (error as { status: number }).status === 401) {
          return errorResponse('AUTHENTICATION_REQUIRED', 401)
        }
        return errorResponse('MEDIA_UNAVAILABLE', 503)
      }
    },
  }
}
