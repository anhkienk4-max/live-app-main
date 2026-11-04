import type { User } from '@/lib/types/database.types'

/**
 * A stable, role-scoped, versioned actor key for in-browser page caches.
 * Permission fallback must be identical both when the request starts and
 * when its response is checked. Never derive permission from user_metadata.
 */
export function operationsActorCacheKey(
  user: Pick<User, 'id' | 'role' | 'system_permission' | 'updated_at'>,
): string {
  const permission = user.system_permission ?? user.role
  if (!user.id || !permission || !user.updated_at) {
    throw new Error('LIST_IDENTITY_UNAVAILABLE')
  }
  return [user.id, permission, user.updated_at].join(':')
}
