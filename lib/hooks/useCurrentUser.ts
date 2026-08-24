'use client'

import * as React from 'react'
import { getAuthMode, type AuthMode } from '@/lib/auth/authMode'
import { useAuthIdentity } from '@/lib/auth/AuthIdentityProvider'
import { currentUserService, userService } from '@/lib/services/dataService'
import { User } from '@/lib/types/database.types'

export const currentUserDirectoryRequired = (mode: AuthMode) => mode === 'mock'

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
    if (!currentUserDirectoryRequired(supabaseMode ? 'supabase' : 'mock')) {
      const current = auth?.businessUser || null
      setCurrentUserState(current)
      setUsers(current ? [current] : [])
      setLoading(false)
      return
    }

    setLoading(true)
    try {
      const [available, current] = await Promise.all([
        userService.getAll(),
        currentUserService.getCurrent(),
      ])
      setCurrentUserState(current)
      setUsers(current
        ? available.map(user => user.id === current.id ? current : user)
        : available)
    } finally {
      setLoading(false)
    }
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
