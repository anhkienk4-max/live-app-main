import { safeLocalRedirect } from './authMode'

export function googleProviderEnabled(settings: unknown): boolean {
  if (!settings || typeof settings !== 'object' || !('external' in settings)) return false
  const external = settings.external
  return !!external && typeof external === 'object' && 'google' in external && external.google === true
}

interface GoogleOAuthClient {
  auth: { signInWithOAuth(options: { provider: 'google'; options: { redirectTo: string } }): Promise<{ error: unknown | null }> }
}

export function startGoogleOAuth(client: GoogleOAuthClient, origin: string, next: string | null) {
  const callback = new URL('/api/auth/callback', origin)
  callback.searchParams.set('next', safeLocalRedirect(next))
  return client.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: callback.toString() } })
}
