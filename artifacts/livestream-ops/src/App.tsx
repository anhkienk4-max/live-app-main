import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Route, Switch, Router as WouterRouter } from 'wouter'
import { Sidebar } from '@/components/layout/Sidebar'
import { Header } from '@/components/layout/Header'
import { BottomNav } from '@/components/layout/BottomNav'
import { Toaster } from '@/components/ui/toaster'
import LoginPage from '@/pages/LoginPage'
import DashboardPage from '@/pages/DashboardPage'
import AnalyticsPage from '@/pages/AnalyticsPage'
import BrandsPage from '@/pages/BrandsPage'
import CalendarPage from '@/pages/CalendarPage'
import CampaignsPage from '@/pages/CampaignsPage'
import LivePage from '@/pages/LivePage'
import PlatformsPage from '@/pages/PlatformsPage'
import ProfilePage from '@/pages/ProfilePage'
import ReportsPage from '@/pages/ReportsPage'
import SettingsPage from '@/pages/SettingsPage'
import StaffPage from '@/pages/StaffPage'
import SwapsPage from '@/pages/SwapsPage'

const queryClient = new QueryClient()

const mockUser = {
  email: 'admin@livestream.com',
  user_metadata: {
    full_name: 'Admin User',
    avatar_url: 'https://api.dicebear.com/7.x/avataaars/svg?seed=admin',
  },
}

function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <Sidebar />
      <div className="flex flex-col flex-1 overflow-hidden">
        <Header user={mockUser} />
        <main className="flex-1 overflow-y-auto pb-20 md:pb-8">
          <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8">
            {children}
          </div>
        </main>
        <BottomNav />
      </div>
    </div>
  )
}

function Router() {
  return (
    <Switch>
      <Route path="/login" component={LoginPage} />
      <Route path="/">
        <DashboardLayout><DashboardPage /></DashboardLayout>
      </Route>
      <Route path="/analytics">
        <DashboardLayout><AnalyticsPage /></DashboardLayout>
      </Route>
      <Route path="/brands">
        <DashboardLayout><BrandsPage /></DashboardLayout>
      </Route>
      <Route path="/calendar">
        <DashboardLayout><CalendarPage /></DashboardLayout>
      </Route>
      <Route path="/campaigns">
        <DashboardLayout><CampaignsPage /></DashboardLayout>
      </Route>
      <Route path="/live">
        <DashboardLayout><LivePage /></DashboardLayout>
      </Route>
      <Route path="/platforms">
        <DashboardLayout><PlatformsPage /></DashboardLayout>
      </Route>
      <Route path="/profile">
        <DashboardLayout><ProfilePage /></DashboardLayout>
      </Route>
      <Route path="/reports">
        <DashboardLayout><ReportsPage /></DashboardLayout>
      </Route>
      <Route path="/settings">
        <DashboardLayout><SettingsPage /></DashboardLayout>
      </Route>
      <Route path="/staff">
        <DashboardLayout><StaffPage /></DashboardLayout>
      </Route>
      <Route path="/swaps">
        <DashboardLayout><SwapsPage /></DashboardLayout>
      </Route>
    </Switch>
  )
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
        <Router />
      </WouterRouter>
      <Toaster />
    </QueryClientProvider>
  )
}

export default App
