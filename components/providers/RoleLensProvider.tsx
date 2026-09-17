'use client'

import * as React from 'react'
import { RoleLensConfig, getRoleLens, ROLE_LENS_CONFIG } from '@/lib/ui/role-lens'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'
import { resolveSystemPermission } from '@/lib/permissions'

const RoleLensContext = React.createContext<RoleLensConfig | null>(null)

export function RoleLensProvider({ children }: { children: React.ReactNode }) {
  const { currentUser, loading } = useCurrentUser()
  const systemPermission = resolveSystemPermission(currentUser)
  
  const lensConfig = React.useMemo(() => {
    const config = getRoleLens(systemPermission)
    // If not loading but we still have no valid role, fallback to member.
    // This prevents transient 'Member' flashes during initial load.
    if (!config && !loading) {
      return ROLE_LENS_CONFIG.member
    }
    return config
  }, [systemPermission, loading])

  if (loading && !lensConfig) {
    return null
  }

  return (
    <RoleLensContext.Provider value={lensConfig}>
      {children}
    </RoleLensContext.Provider>
  )
}

export function useRoleLens() {
  const context = React.useContext(RoleLensContext)
  if (!context) {
    throw new Error('useRoleLens must be used within a RoleLensProvider')
  }
  return context
}
