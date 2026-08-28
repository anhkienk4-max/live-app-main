import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const AUTH_CONFIRM_TYPES = new Set(['invite', 'recovery'] as const)
type AuthConfirmType = 'invite' | 'recovery'

interface AuthConfirmClient {
  auth: {
    verifyOtp: (params: {
      token_hash: string
      type: AuthConfirmType
    }) => Promise<{ error: unknown | null }>
  }
}

type AuthConfirmClientFactory = () => Promise<AuthConfirmClient>

function safeNextPath(value: string | null): string | null {
  const candidate = value ?? '/reset-password'
  if (!candidate.startsWith('/') || candidate.startsWith('//')) return null

  try {
    const parsed = new URL(candidate, 'http://auth-confirm.invalid')
    if (parsed.origin !== 'http://auth-confirm.invalid') return null
    if (parsed.username || parsed.password) return null
    return `${parsed.pathname}${parsed.search}${parsed.hash}`
  } catch {
    return null
  }
}

function redirectToError(request: Request) {
  const origin = new URL(request.url).origin
  const response = NextResponse.redirect(new URL('/auth/auth-code-error', origin))
  response.headers.set('Cache-Control', 'no-store')
  return response
}

export function createAuthConfirmGetHandler(
  createSupabaseClient: AuthConfirmClientFactory = createClient,
) {
  return async function GET(request: Request) {
    const requestUrl = new URL(request.url)
    const tokenHash = requestUrl.searchParams.get('token_hash')?.trim()
    const typeValue = requestUrl.searchParams.get('type')
    const next = safeNextPath(requestUrl.searchParams.get('next'))

    if (!tokenHash || !typeValue || !AUTH_CONFIRM_TYPES.has(typeValue as AuthConfirmType) || !next) {
      return redirectToError(request)
    }

    try {
      const supabase = await createSupabaseClient()
      const { error } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: typeValue as AuthConfirmType,
      })
      if (error) return redirectToError(request)

      const response = NextResponse.redirect(new URL(next, requestUrl.origin))
      response.headers.set('Cache-Control', 'no-store')
      return response
    } catch {
      return redirectToError(request)
    }
  }
}

export const GET = createAuthConfirmGetHandler()
