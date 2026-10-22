import type { AuthenticatedServerUser } from '@/lib/server/authGuards'

/**
 * The authenticated server user has two distinct IDs:
 * - id: Supabase Auth user UUID
 * - businessUserId: persisted, verified business_users.id
 * Browser currentUserService and page caches use the latter.
 *
 * resolveServerUser verifies the auth->business mapping before returning.
 * The id fallback preserves injected legacy test resolvers that don't supply
 * businessUserId; it must not be used to bypass the real resolver.
 */
export function operationsResponseOwnerKey(user: AuthenticatedServerUser): string {
  const id = user.businessUserId || user.id
  if (!id || !user.systemPermission) throw new Error('LIST_IDENTITY_UNAVAILABLE')
  return id + ':' + user.systemPermission
}
