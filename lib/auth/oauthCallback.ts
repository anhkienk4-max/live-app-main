import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createSupabaseMasterDataRepository } from '@/lib/services/supabaseMasterDataService'
import { createAuthIdentity, mapAuthIdentityToBusinessUser, type AuthIdentity, type AuthUserSource } from './authIdentity'
import { getVerifiedUser } from './session'
import { safeLocalRedirect } from './authMode'
import type { User } from '@/lib/types/database.types'

interface OAuthContext {
  auth: {
    exchangeCodeForSession(code: string): Promise<{ error: unknown | null }>
    getUser(): Promise<{ data: { user: AuthUserSource | null }; error: unknown | null }>
    signOut(options: { scope: 'local' }): Promise<{ error: unknown | null }>
  }
  readBusinessUser(identity: AuthIdentity): Promise<User | null>
}

async function createOAuthContext(): Promise<OAuthContext> {
  const client = await createClient()
  return { auth: client.auth, readBusinessUser: identity => createSupabaseMasterDataRepository(client).businessUsers.getByAuthIdentity(identity) }
}

export function createOAuthCallbackHandler(createContext: () => Promise<OAuthContext> = createOAuthContext) {
  return async function GET(request: Request) {
    const url = new URL(request.url)
    const redirect = (path: string) => {
      const response = NextResponse.redirect(new URL(path, url.origin))
      response.headers.set('Cache-Control', 'no-store')
      return response
    }
    if (url.searchParams.has('error')) return redirect('/login?reason=oauth_failed')
    const code = url.searchParams.get('code')
    if (!code) return redirect('/auth/auth-code-error')
    try {
      const context = await createContext()
      const { error } = await context.auth.exchangeCodeForSession(code)
      if (error) return redirect('/login?reason=oauth_failed')
      const verified = await getVerifiedUser(() => context.auth.getUser())
      const identity = createAuthIdentity(verified)
      const persisted = identity ? await context.readBusinessUser(identity) : null
      if (!identity || !persisted || !mapAuthIdentityToBusinessUser(identity, [persisted])) {
        await context.auth.signOut({ scope: 'local' })
        return redirect('/login?reason=approval_required')
      }
      return redirect(safeLocalRedirect(url.searchParams.get('next')))
    } catch { return redirect('/login?reason=oauth_failed') }
  }
}
