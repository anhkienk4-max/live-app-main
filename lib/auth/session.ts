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
