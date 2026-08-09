import { redirect } from 'next/navigation'
import { connection } from 'next/server'
import { Header } from '@/components/layout/Header'
import { Sidebar } from '@/components/layout/Sidebar'
import { BottomNav } from '@/components/layout/BottomNav'
import { getAuthMode, getSupabasePublicConfig } from '@/lib/auth/authMode'
import { AuthIdentityProvider } from '@/lib/auth/AuthIdentityProvider'
import {
  createAuthIdentity,
  mapAuthIdentityToBusinessUser,
  type AuthIdentity,
} from '@/lib/auth/authIdentity'
import { getVerifiedUser } from '@/lib/auth/session'
import { mockUsers } from '@/lib/services/mockData'
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
  const mockMode = getAuthMode() === 'mock'
  let identity: AuthIdentity | null = null
  let businessUser: User | null = null
  let user: DashboardHeaderUser | null = mockMode ? {
    email: 'admin@livestream.com',
    user_metadata: {
      full_name: 'Admin User',
      avatar_url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=admin',
    },
  } : null

  if (!mockMode) {
    await connection()

    if (!getSupabasePublicConfig()) {
      redirect('/login?reason=auth_unavailable')
    }

    const supabaseUser = await (async () => {
      try {
        const supabase = await createClient()
        return getVerifiedUser(() => supabase.auth.getUser())
      } catch {
        return null
      }
    })()

    if (!supabaseUser) {
      redirect('/login?reason=session_expired')
    }

    identity = createAuthIdentity(supabaseUser)
    businessUser = identity
      ? mapAuthIdentityToBusinessUser(identity, mockUsers)
      : null
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
      <div className="flex h-screen overflow-hidden bg-gray-50">
        <Sidebar />
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <Header user={user || undefined} />
          <main className="min-w-0 flex-1 overflow-y-auto pb-20 md:pb-8">
            <div className="w-full min-w-0 px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
              {children}
            </div>
          </main>
          <BottomNav />
        </div>
      </div>
    </AuthIdentityProvider>
  )
}
