import { NextResponse, type NextRequest } from 'next/server'
import { authProxy } from '@/lib/auth/proxy'
import { isVisualFixtureMode } from '@/lib/visual-fixtures'

export function proxy(request: NextRequest) {
  const isVisualQa = request.nextUrl.pathname.startsWith('/visual-qa')
  const isFixtureMode = process.env.NODE_ENV === 'development' && isVisualFixtureMode()

  if (isVisualQa && isFixtureMode) {
    const requestHeaders = new Headers(request.headers)
    requestHeaders.set('x-visual-qa-bypass', 'true')
    const role = request.nextUrl.searchParams.get('role') || 'member'
    requestHeaders.set('x-visual-qa-role', role)
    return NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    })
  }

  // Strip client-injected visual QA headers on all normal requests so they cannot bypass auth
  if (request.headers.has('x-visual-qa-bypass') || request.headers.has('x-visual-qa-role')) {
    request.headers.delete('x-visual-qa-bypass')
    request.headers.delete('x-visual-qa-role')
  }

  return authProxy(request)
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
