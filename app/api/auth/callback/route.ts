import { NextResponse } from 'next/server'
import type { AuthUser } from '@supabase/supabase-js'

import {
  resolveGoogleApplicationAccess,
  type GoogleCallbackClient,
} from '@/lib/auth/googleOAuth'
import { classifyGoogleOAuthError, type AuthCodeErrorReason } from '@/lib/auth/authError'
import { createSupabaseMasterDataRepository } from '@/lib/services/supabaseMasterDataService'
import { type AuthUserSource } from '@/lib/auth/authIdentity'

type GoogleCallbackClientFactory = () => Promise<GoogleCallbackClient>
type GoogleAuthorizationResolver = (
  client: GoogleCallbackClient,
  user: AuthUserSource,
) => Promise<boolean>

async function defaultCreateClient(): Promise<GoogleCallbackClient> {
  const { createClient } = await import('@/lib/supabase/server')
  return createClient()
}

async function defaultResolveAuthorization(
  client: GoogleCallbackClient,
  user: AuthUserSource,
): Promise<boolean> {
  const repository = createSupabaseMasterDataRepository(client)
  const authorized = await resolveGoogleApplicationAccess(
    user,
    identity => repository.businessUsers.getByAuthIdentity(identity),
  )
  return Boolean(authorized)
}

function safeCallbackPath(value: string | null): string | null {
  if (value === null) return '/'
  if (!value.startsWith('/') || value.startsWith('//')) return null

  try {
    const parsed = new URL(value, 'http://google-callback.invalid')
    if (parsed.origin !== 'http://google-callback.invalid') return null
    if (parsed.username || parsed.password) return null
    return `${parsed.pathname}${parsed.search}${parsed.hash}`
  } catch {
    return null
  }
}

function errorRedirect(request: Request, reason: Exclude<AuthCodeErrorReason, 'expired_link'>) {
  const location = new URL('/auth/auth-code-error', request.url)
  location.searchParams.set('reason', reason)
  const response = NextResponse.redirect(location)
  response.headers.set('Cache-Control', 'no-store')
  return response
}

export function createGoogleCallbackGetHandler(
  createSupabaseClient: GoogleCallbackClientFactory = defaultCreateClient,
  resolveAuthorization: GoogleAuthorizationResolver = defaultResolveAuthorization,
) {
  return async function GET(request: Request) {
    const requestUrl = new URL(request.url)
    const code = requestUrl.searchParams.get('code')?.trim()
    const next = safeCallbackPath(requestUrl.searchParams.get('next'))
    const callbackErrorReason = classifyGoogleOAuthError(
      requestUrl.searchParams.get('error_description'),
    )

    if (!code || !next) return errorRedirect(request, callbackErrorReason)

    try {
      const client = await createSupabaseClient()
      const { data, error } = await client.auth.exchangeCodeForSession(code)
      const user = data?.user as AuthUser | null | undefined
      if (error || !user || !(await resolveAuthorization(client, user))) {
        return errorRedirect(request, callbackErrorReason)
      }

      const response = NextResponse.redirect(new URL(next, requestUrl.origin))
      response.headers.set('Cache-Control', 'no-store')
      return response
    } catch {
      return errorRedirect(request, callbackErrorReason)
    }
  }
}

export const GET = createGoogleCallbackGetHandler()
