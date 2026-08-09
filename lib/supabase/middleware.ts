import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { requireSupabasePublicConfig } from '@/lib/auth/authMode'

interface SessionVerifierClient {
  auth: {
    getClaims(): Promise<
      | { data: { claims: { sub?: unknown } }; error: null }
      | { data: null; error: unknown | null }
    >
  }
}

export type SessionClientFactory = (
  request: NextRequest,
  onResponse: (response: NextResponse) => void,
) => SessionVerifierClient

function withPrivateNoStore(response: NextResponse) {
  response.headers.set('Cache-Control', 'private, no-cache, no-store, must-revalidate, max-age=0')
  response.headers.set('Expires', '0')
  response.headers.set('Pragma', 'no-cache')
  return response
}

function copySessionState(source: NextResponse, target: NextResponse) {
  source.cookies.getAll().forEach(cookie => target.cookies.set(cookie))
  ;['Cache-Control', 'Expires', 'Pragma'].forEach(name => {
    const value = source.headers.get(name)
    if (value) target.headers.set(name, value)
  })
  return withPrivateNoStore(target)
}

export function isPublicAuthPath(pathname: string) {
  return pathname === '/login'
}

export function createLoginRedirect(
  request: NextRequest,
  reason: 'authentication_required' | 'auth_unavailable' | 'session_expired' | 'identity_unavailable',
  sessionResponse = NextResponse.next({ request }),
) {
  const url = request.nextUrl.clone()
  const returnTo = `${url.pathname}${url.search}`
  url.pathname = '/login'
  url.search = ''
  url.searchParams.set('reason', reason)
  if (!isPublicAuthPath(request.nextUrl.pathname)) {
    url.searchParams.set('next', returnTo)
  }
  return copySessionState(sessionResponse, NextResponse.redirect(url))
}

const createSupabaseSessionClient: SessionClientFactory = (request, onResponse) => {
  const { url, anonKey } = requireSupabasePublicConfig()

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet, responseHeaders) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        const response = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) =>
          response.cookies.set(name, value, options)
        )
        Object.entries(responseHeaders).forEach(([name, value]) =>
          response.headers.set(name, value)
        )
        onResponse(response)
      },
    },
  })
}

export function createSessionUpdater(
  createClient: SessionClientFactory = createSupabaseSessionClient,
) {
  return async function refreshSession(request: NextRequest) {
    let sessionResponse = withPrivateNoStore(NextResponse.next({ request }))

    try {
      const client = createClient(request, response => {
        sessionResponse = withPrivateNoStore(response)
      })
      const { data, error } = await client.auth.getClaims()
      const authenticated = !error
        && typeof data?.claims?.sub === 'string'
        && data.claims.sub.length > 0

      if (!authenticated) {
        return isPublicAuthPath(request.nextUrl.pathname)
          ? sessionResponse
          : createLoginRedirect(request, 'session_expired', sessionResponse)
      }

      if (
        isPublicAuthPath(request.nextUrl.pathname)
        && request.nextUrl.searchParams.get('reason') !== 'identity_unavailable'
      ) {
        const home = request.nextUrl.clone()
        home.pathname = '/'
        home.search = ''
        return copySessionState(sessionResponse, NextResponse.redirect(home))
      }

      return sessionResponse
    } catch {
      return isPublicAuthPath(request.nextUrl.pathname)
        ? sessionResponse
        : createLoginRedirect(request, 'auth_unavailable', sessionResponse)
    }
  }
}

export const updateSession = createSessionUpdater()
