import { NextResponse, type NextRequest } from 'next/server'
import { getAuthMode, getSupabasePublicConfig, type AuthMode } from '@/lib/auth/authMode'
import { createLoginRedirect, isPublicAuthPath, updateSession } from '@/lib/supabase/middleware'

export interface AuthProxyDependencies {
  getMode: () => AuthMode
  hasSupabaseConfig: () => boolean
  refreshSession: (request: NextRequest) => Promise<NextResponse>
}

const defaultDependencies: AuthProxyDependencies = {
  getMode: getAuthMode,
  hasSupabaseConfig: () => Boolean(getSupabasePublicConfig()),
  refreshSession: updateSession,
}

export function createAuthProxy(
  dependencies: AuthProxyDependencies = defaultDependencies,
) {
  return async function handleAuthProxy(request: NextRequest) {
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
