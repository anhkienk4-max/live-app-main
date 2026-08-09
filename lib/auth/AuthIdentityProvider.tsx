'use client'

import * as React from 'react'
import type { AuthMode } from '@/lib/auth/authMode'
import type { AuthIdentity } from '@/lib/auth/authIdentity'
import { currentUserService } from '@/lib/services/dataService'
import type { User } from '@/lib/types/database.types'

interface AuthIdentityContextValue {
  mode: AuthMode
  identity: AuthIdentity | null
  businessUser: User | null
  clearIdentity: () => void
}

interface AuthIdentityProviderProps {
  mode: AuthMode
  identity: AuthIdentity | null
  businessUser: User | null
  children: React.ReactNode
}

const AuthIdentityContext = React.createContext<AuthIdentityContextValue | null>(null)

export function AuthIdentityProvider({
  mode,
  identity: initialIdentity,
  businessUser: initialBusinessUser,
  children,
}: AuthIdentityProviderProps) {
  const [identity, setIdentity] = React.useState(initialIdentity)
  const [businessUser, setBusinessUser] = React.useState(initialBusinessUser)

  React.useEffect(() => {
    setIdentity(initialIdentity)
    setBusinessUser(initialBusinessUser)
  }, [initialBusinessUser, initialIdentity])

  React.useEffect(() => {
    if (mode !== 'supabase' || !businessUser) return
    currentUserService.bindAuthenticatedUser(businessUser)
    return () => currentUserService.clearAuthenticatedUser(businessUser.id)
  }, [businessUser, mode])

  const clearIdentity = React.useCallback(() => {
    if (businessUser) currentUserService.clearAuthenticatedUser(businessUser.id)
    setIdentity(null)
    setBusinessUser(null)
  }, [businessUser])

  const value = React.useMemo<AuthIdentityContextValue>(() => ({
    mode,
    identity,
    businessUser,
    clearIdentity,
  }), [businessUser, clearIdentity, identity, mode])

  return (
    <AuthIdentityContext.Provider value={value}>
      {children}
    </AuthIdentityContext.Provider>
  )
}

export function useAuthIdentity() {
  return React.useContext(AuthIdentityContext)
}
