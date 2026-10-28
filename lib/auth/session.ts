import {
  isAuthApiError,
  isAuthRetryableFetchError,
  isAuthSessionMissingError,
} from '@supabase/supabase-js'

export interface PasswordSessionClient {
  auth: {
    signInWithPassword(credentials: {
      email: string
      password: string
    }): Promise<{
      data: { session: unknown | null; user: unknown | null }
      error: unknown | null
    }>
    signOut(options: { scope: 'local' }): Promise<{ error: unknown | null }>
  }
}

export type PasswordSessionFailure =
  | 'INVALID_CREDENTIALS'
  | 'AUTH_NETWORK_ERROR'
  | 'AUTH_PROVIDER_UNAVAILABLE'
  | 'AUTH_SESSION_FAILURE'
  | 'UNKNOWN_AUTH_ERROR'

export type PasswordSessionResult =
  | { ok: true }
  | { ok: false; reason: PasswordSessionFailure }

function supabaseErrorShape(error: unknown): { name: string; code?: string } | null {
  if (typeof error !== 'object' || error === null || !('name' in error) || typeof error.name !== 'string') return null
  return { name: error.name, code: 'code' in error && typeof error.code === 'string' ? error.code : undefined }
}

export function classifyPasswordSessionError(error: unknown): PasswordSessionFailure {
  const typedError = supabaseErrorShape(error)
  if (isAuthRetryableFetchError(error) || typedError?.name === 'AuthRetryableFetchError') return 'AUTH_NETWORK_ERROR'
  if (isAuthSessionMissingError(error) || typedError?.name === 'AuthSessionMissingError') return 'AUTH_SESSION_FAILURE'
  if (isAuthApiError(error) || typedError?.name === 'AuthApiError') {
    if (typedError?.code === 'invalid_credentials') return 'INVALID_CREDENTIALS'
    if (typedError?.code === 'email_provider_disabled' || typedError?.code === 'provider_disabled') {
      return 'AUTH_PROVIDER_UNAVAILABLE'
    }
  }
  return 'UNKNOWN_AUTH_ERROR'
}

const sessionResetReasons = new Set([
  'session_expired',
  'authentication_required',
  'signed_out',
])

export function shouldClearLocalSessionForLoginReason(
  reason: string | null | undefined,
): boolean {
  return Boolean(reason && sessionResetReasons.has(reason))
}

export async function establishPasswordSession(
  createClient: () => PasswordSessionClient,
  email: string,
  password: string,
): Promise<PasswordSessionResult> {
  try {
    const client = createClient()
    const { data, error } = await client.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    })
    if (error) return { ok: false, reason: classifyPasswordSessionError(error) }
    if (!data.session || !data.user) return { ok: false, reason: 'AUTH_SESSION_FAILURE' }
    return { ok: true }
  } catch (error) {
    return { ok: false, reason: classifyPasswordSessionError(error) }
  }
}

export async function clearLocalSession(
  client: PasswordSessionClient,
): Promise<boolean> {
  try {
    const { error } = await client.auth.signOut({ scope: 'local' })
    return !error
  } catch {
    return false
  }
}

export async function getVerifiedUser<TUser>(
  getUser: () => Promise<{
    data: { user: TUser | null }
    error: unknown | null
  }>,
): Promise<TUser | null> {
  try {
    const { data, error } = await getUser()
    return error ? null : data.user
  } catch {
    return null
  }
}
