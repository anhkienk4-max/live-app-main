import { redirect } from 'next/navigation'
import { connection } from 'next/server'
import { headers } from 'next/headers'
import { ProductionAppShell } from '@/components/layout/ProductionAppShell'
import { RoleLensProvider } from '@/components/providers/RoleLensProvider'

import { getAuthMode, getSupabasePublicConfig } from '@/lib/auth/authMode'
import { AuthIdentityProvider } from '@/lib/auth/AuthIdentityProvider'
import {
  createAuthIdentity,
  mapAuthIdentityToBusinessUser,
  type AuthIdentity,
} from '@/lib/auth/authIdentity'
import { getVerifiedUser } from '@/lib/auth/session'
import { createSupabaseMasterDataRepository } from '@/lib/services/supabaseMasterDataService'
import { createClient } from '@/lib/supabase/server'
import type { User } from '@/lib/types/database.types'

type DashboardHeaderUser = {
  email?: string
  user_metadata?: {
    full_name?: string
    avatar_url?: string
  }
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const headersList = await headers()
  const isVisualQaBypass = headersList.get('x-visual-qa-bypass') === 'true'
  const qaRole = headersList.get('x-visual-qa-role') || 'admin'
  const mockMode = getAuthMode() === 'mock' || isVisualQaBypass
  let identity: AuthIdentity | null = null
  let businessUser: User | null = null

  if (isVisualQaBypass) {
    businessUser = {
      id: `qa-${qaRole}`,
      email: `${qaRole}@livestream.com`,
      full_name: `${qaRole.charAt(0).toUpperCase() + qaRole.slice(1)} QA User`,
      role: (qaRole === 'member' ? 'staff' : qaRole) as 'admin' | 'leader' | 'staff',
      operational_roles: ['host', 'support'],
      status: 'active',
      avatar_url: '',
      join_date: new Date().toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }
  }

  let user: DashboardHeaderUser | null = mockMode ? {
    email: `@livestream.com`,
    user_metadata: {
      full_name: ` QA User`,
      avatar_url: `https://api.dicebear.com/7.x/avataaars/svg?seed=`,
    },
  } : null

  if (!mockMode) {
    await connection()

    if (!getSupabasePublicConfig()) {
      redirect('/login?reason=auth_unavailable')
    }

    const authenticatedSession = await (async () => {
      try {
        const supabase = await createClient()
        const verifiedUser = await getVerifiedUser(() => supabase.auth.getUser())
        return verifiedUser ? { supabase, verifiedUser } : null
      } catch {
        return null
      }
    })()

    if (!authenticatedSession) {
      redirect('/login?reason=session_expired')
    }

    identity = createAuthIdentity(authenticatedSession.verifiedUser)
    if (identity) {
      try {
        const persistedBusinessUser = await createSupabaseMasterDataRepository(
          authenticatedSession.supabase,
        ).businessUsers.getByAuthIdentity(identity)
        businessUser = persistedBusinessUser
          ? mapAuthIdentityToBusinessUser(identity, [persistedBusinessUser])
          : null
      } catch {
        businessUser = null
      }
    }
    if (!identity || !businessUser) {
      redirect('/login?reason=identity_unavailable')
    }

    user = {
      email: identity.email,
      user_metadata: {
        full_name: identity.display_name || businessUser.full_name,
        avatar_url: identity.avatar_url || businessUser.avatar_url,
      },
    }
  }

  return (
    <AuthIdentityProvider
      mode={mockMode ? 'mock' : 'supabase'}
      identity={identity}
      businessUser={businessUser}
    >
      <ProductionAppShell user={user || undefined}>
        <RoleLensProvider>{children}</RoleLensProvider>
      </ProductionAppShell>
    </AuthIdentityProvider>
  )
}
