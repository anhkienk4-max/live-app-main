'use client'

import * as React from 'react'
import { getAuthMode } from '@/lib/auth/authMode'
import { useAuthIdentity } from '@/lib/auth/AuthIdentityProvider'
import { currentUserService, userService } from '@/lib/services/dataService'
import { User } from '@/lib/types/database.types'

export function useCurrentUser() {
  const auth = useAuthIdentity()
  const supabaseMode = auth?.mode === 'supabase'
    || (!auth && getAuthMode() === 'supabase')
  const [currentUser, setCurrentUserState] = React.useState<User | null>(
    supabaseMode ? auth?.businessUser || null : null,
  )
  const [users, setUsers] = React.useState<User[]>([])
  const [loading, setLoading] = React.useState(!supabaseMode)

  const reload = React.useCallback(async () => {
    const available = await userService.getAll()
    let current = auth?.businessUser || null
    if (!supabaseMode) {
      current = await currentUserService.getCurrent()
    } else {
      try {
        current = await currentUserService.getCurrent() || current
      } catch {
        // The provider's server-derived business user remains authoritative
        // while its client binding is being established.
      }
    }
    setCurrentUserState(current)
    setUsers(current
      ? available.map(user => user.id === current.id ? current : user)
      : available)
    setLoading(false)
  }, [auth?.businessUser, supabaseMode])

  React.useEffect(() => {
    void reload()
    if (supabaseMode) return
    const handleChange = () => void reload()
    window.addEventListener('livestream-ops-current-user-change', handleChange)
    return () => window.removeEventListener('livestream-ops-current-user-change', handleChange)
  }, [reload, supabaseMode])

  const setCurrentUser = React.useCallback(async (id: string) => {
    if (supabaseMode && id !== auth?.businessUser?.id) return null
    const user = await currentUserService.setCurrent(id)
    if (user) setCurrentUserState(user)
    return user
  }, [auth?.businessUser?.id, supabaseMode])

  return {
    currentUser,
    users,
    loading,
    setCurrentUser,
    reload,
    authIdentity: auth?.identity || null,
    clearIdentity: auth?.clearIdentity || (() => undefined),
  }
}
