'use client'

import * as React from 'react'
import type { AuthMode } from '@/lib/auth/authMode'
import type { AuthIdentity } from '@/lib/auth/authIdentity'
import { currentUserService } from '@/lib/services/dataService'
import type { User } from '@/lib/types/database.types'
import { invalidatePageCache } from '@/lib/services/operationsPageCache'
import { ShiftChangeBridge } from '@/components/providers/ShiftChangeBridge'

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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- synchronize verified server identity into provider state when the server session changes
    setIdentity(initialIdentity); setBusinessUser(initialBusinessUser)
  }, [initialBusinessUser, initialIdentity])

  // Service reads from descendants begin in passive effects. Bind verified identity
  // during layout commit first, so navigation/initial mount cannot race the actor.
  React.useLayoutEffect(() => {
    if (mode !== 'supabase' || !businessUser) return
    currentUserService.bindAuthenticatedUser(businessUser)
    return () => currentUserService.clearAuthenticatedUser(businessUser.id)
  }, [businessUser, mode])

  const clearIdentity = React.useCallback(() => {
    if (businessUser) currentUserService.clearAuthenticatedUser(businessUser.id)
    invalidatePageCache()
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
      <ShiftChangeBridge userId={businessUser?.id ?? null} enabled={mode === 'supabase'} />
      {children}
    </AuthIdentityContext.Provider>
  )
}

export function useAuthIdentity() {
  return React.useContext(AuthIdentityContext)
}
