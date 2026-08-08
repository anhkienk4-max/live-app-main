import { redirect } from 'next/navigation'
import { connection } from 'next/server'
import { Header } from '@/components/layout/Header'
import { Sidebar } from '@/components/layout/Sidebar'
import { BottomNav } from '@/components/layout/BottomNav'
import { getAuthMode, getSupabasePublicConfig } from '@/lib/auth/authMode'
import { getVerifiedUser } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/server'

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

    user = {
      email: supabaseUser.email || undefined,
      user_metadata: {
        full_name: typeof supabaseUser.user_metadata?.full_name === 'string'
          ? supabaseUser.user_metadata.full_name
          : undefined,
        avatar_url: typeof supabaseUser.user_metadata?.avatar_url === 'string'
          ? supabaseUser.user_metadata.avatar_url
          : undefined,
      },
    }
  }

  return (
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
  )
}
