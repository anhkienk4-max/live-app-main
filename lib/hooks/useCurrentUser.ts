'use client'

import * as React from 'react'
import { currentUserService, userService } from '@/lib/services/dataService'
import { User } from '@/lib/types/database.types'

export function useCurrentUser() {
  const [currentUser, setCurrentUserState] = React.useState<User | null>(null)
  const [users, setUsers] = React.useState<User[]>([])
  const [loading, setLoading] = React.useState(true)

  const reload = React.useCallback(async () => {
    const [current, available] = await Promise.all([
      currentUserService.getCurrent(),
      userService.getAll(),
    ])
    setCurrentUserState(current)
    setUsers(available)
    setLoading(false)
  }, [])

  React.useEffect(() => {
    void reload()
    const handleChange = () => void reload()
    window.addEventListener('livestream-ops-current-user-change', handleChange)
    return () => window.removeEventListener('livestream-ops-current-user-change', handleChange)
  }, [reload])

  const setCurrentUser = React.useCallback(async (id: string) => {
    const user = await currentUserService.setCurrent(id)
    if (user) setCurrentUserState(user)
    return user
  }, [])

  return { currentUser, users, loading, setCurrentUser, reload }
}

