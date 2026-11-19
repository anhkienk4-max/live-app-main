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
  // Server-authenticated props may change while this layout stays mounted.
  // Synchronize during render, rather than after paint: React discards this
  // render and retries before descendants can see a previous actor's data.
  // Keeping the source props separately preserves clearIdentity() on logout.
  const [snapshot, setSnapshot] = React.useState(() => ({
    sourceIdentity: initialIdentity,
    sourceBusinessUser: initialBusinessUser,
    identity: initialIdentity,
    businessUser: initialBusinessUser,
  }))
  if (snapshot.sourceIdentity !== initialIdentity || snapshot.sourceBusinessUser !== initialBusinessUser) {
    setSnapshot({
      sourceIdentity: initialIdentity,
      sourceBusinessUser: initialBusinessUser,
      identity: initialIdentity,
      businessUser: initialBusinessUser,
    })
  }
  const { identity, businessUser } = snapshot

  // Service reads from descendants begin in passive effects. Bind verified identity
  // during layout commit first, so navigation/initial mount cannot race the actor.
  React.useLayoutEffect(() => {
    if (mode !== 'supabase' || !businessUser) return
    const bindingRevision = currentUserService.bindAuthenticatedUser(businessUser)
    return () => currentUserService.clearAuthenticatedUser(businessUser.id, bindingRevision)
  }, [businessUser, mode])

  const clearIdentity = React.useCallback(() => {
    if (businessUser) currentUserService.clearAuthenticatedUser(businessUser.id)
    invalidatePageCache()
    setSnapshot(previous => ({ ...previous, identity: null, businessUser: null }))
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
