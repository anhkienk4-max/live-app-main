import { Header } from '@/components/layout/Header'
import { Sidebar } from '@/components/layout/Sidebar'
import { BottomNav } from '@/components/layout/BottomNav'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Mock user for development
  const mockUser = {
    email: 'admin@livestream.com',
    user_metadata: {
      full_name: 'Admin User',
      avatar_url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=admin',
    },
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Header user={mockUser} />
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
