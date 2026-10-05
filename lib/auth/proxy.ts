import { NextResponse, type NextRequest } from 'next/server'
import { getAuthMode, getSupabasePublicConfig, type AuthMode } from '@/lib/auth/authMode'
import { createLoginRedirect, isPublicAuthPath, updateSession } from '@/lib/supabase/middleware'

export interface AuthProxyDependencies {
  getMode: () => AuthMode
  hasSupabaseConfig: () => boolean
  refreshSession: (request: NextRequest) => Promise<NextResponse>
  /** Override for testing: true when running outside production */
  isDevEnvironment?: () => boolean
}

/**
 * Returns true for /visual-qa and /visual-qa/* paths.
 * These are static development QA routes with no real auth requirement.
 */
export function isVisualQaPath(pathname: string): boolean {
  return pathname === '/visual-qa' || pathname.startsWith('/visual-qa/')
}

const defaultDependencies: AuthProxyDependencies = {
  getMode: getAuthMode,
  hasSupabaseConfig: () => Boolean(getSupabasePublicConfig()),
  refreshSession: updateSession,
  isDevEnvironment: () => process.env.NODE_ENV !== 'production',
}

export function createAuthProxy(
  dependencies: AuthProxyDependencies = defaultDependencies,
) {
  return async function handleAuthProxy(request: NextRequest) {
    // DEV-ONLY: bypass auth for /visual-qa routes so the static QA page is
    // reachable without Supabase credentials during local development.
    // This block is never reached in production (NODE_ENV === 'production').
    const isDev = dependencies.isDevEnvironment?.() ?? (process.env.NODE_ENV !== 'production')
    if (isDev && isVisualQaPath(request.nextUrl.pathname)) {
      return NextResponse.next({ request })
    }

    if (dependencies.getMode() === 'mock') {
      return NextResponse.next({ request })
    }

    if (!dependencies.hasSupabaseConfig()) {
      if (isPublicAuthPath(request.nextUrl.pathname)) {
        const response = NextResponse.next({ request })
        response.headers.set('Cache-Control', 'private, no-store')
        return response
      }
      return createLoginRedirect(request, 'auth_unavailable')
    }

    return dependencies.refreshSession(request)
  }
}

export const authProxy = createAuthProxy()
