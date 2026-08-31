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
    resetPasswordForEmail(email: string, options?: { redirectTo?: string }): Promise<{ error: unknown | null }>
    updateUser(attributes: { password?: string }): Promise<{ error: unknown | null }>
  }
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
  client: PasswordSessionClient,
  email: string,
  password: string,
): Promise<boolean> {
  try {
    const { data, error } = await client.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    })
    return !error && Boolean(data.session) && Boolean(data.user)
  } catch {
    return false
  }
}

export async function requestPasswordResetEmail(
  client: PasswordSessionClient,
  email: string,
  redirectTo?: string
): Promise<boolean> {
  try {
    const { error } = await client.auth.resetPasswordForEmail(email.trim().toLowerCase(), { redirectTo })
    return !error
  } catch {
    return false
  }
}

export async function updateSessionPassword(
  client: PasswordSessionClient,
  password: string
): Promise<boolean> {
  try {
    const { error } = await client.auth.updateUser({ password })
    return !error
  } catch {
    return false
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
