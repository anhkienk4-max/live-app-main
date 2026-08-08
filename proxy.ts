import type { NextRequest } from 'next/server'
import { authProxy } from '@/lib/auth/proxy'

export function proxy(request: NextRequest) {
  return authProxy(request)
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
