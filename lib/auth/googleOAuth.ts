import type { SupabaseClient } from '@supabase/supabase-js'

import { safeLocalRedirect } from '@/lib/auth/authMode'
import { createAuthIdentity, type AuthIdentity, type AuthUserSource } from '@/lib/auth/authIdentity'
import type { User } from '@/lib/types/database.types'

export interface GoogleOAuthClient {
  auth: {
    signInWithOAuth(options: {
      provider: 'google'
      options: { redirectTo: string }
    }): Promise<{
      data: { url?: string | null }
      error: unknown | null
    }>
  }
}

export function googleOAuthCallbackUrl(
  origin: string,
  next: string | null | undefined,
): string {
  const callback = new URL('/api/auth/callback', origin)
  callback.searchParams.set('next', safeLocalRedirect(next))
  return callback.toString()
}

export async function startGoogleOAuth(
  client: GoogleOAuthClient,
  redirectTo: string,
): Promise<string | null> {
  try {
    const { data, error } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo },
    })
    return error || !data.url ? null : data.url
  } catch {
    return null
  }
}

export type GoogleStaffAuthorizationRecord = Pick<
  User,
  | 'id'
  | 'auth_user_id'
  | 'email'
  | 'system_permission'
  | 'status'
  | 'account_status'
  | 'archived_at'
  | 'deleted_at'
>

export interface GoogleAuthorizedIdentity {
  identity: AuthIdentity
  staff: GoogleStaffAuthorizationRecord
}

/**
 * Google proves Auth identity only. Application access remains a lookup of the
 * canonical Auth-to-Staff link and the server-owned Staff lifecycle/role.
 */
export async function resolveGoogleApplicationAccess(
  source: AuthUserSource | null | undefined,
  getStaff: (identity: AuthIdentity) => Promise<GoogleStaffAuthorizationRecord | null>,
): Promise<GoogleAuthorizedIdentity | null> {
  const identity = createAuthIdentity(source)
  if (!identity) return null

  const staff = await getStaff(identity)
  if (
    !staff
    || staff.id !== identity.business_user_id
    || staff.auth_user_id !== identity.auth_user_id
    || staff.status !== 'active'
    || staff.account_status !== 'active'
    || staff.archived_at
    || staff.deleted_at
    || staff.system_permission !== identity.system_permission
  ) return null

  return { identity, staff }
}

export type GoogleCallbackClient = SupabaseClient
