'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Calendar, Radio, FileText, User, Settings, Users, Package, Megaphone, BarChart3, RefreshCw, History } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/lib/i18n'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'
import { hasAnyPermission } from '@/lib/permissions'

const navigation = [
  { name: 'Dashboard', href: '/', icon: Home },
  { name: 'Calendar', href: '/calendar', icon: Calendar },
  { name: 'Live', href: '/live', icon: Radio },
  { name: 'Reports', href: '/reports', icon: FileText },
  { name: 'Swaps', href: '/swaps', icon: RefreshCw },
  { name: 'Analytics', href: '/analytics', icon: BarChart3 },
  { name: 'Staff', href: '/staff', icon: Users },
  { name: 'Brands', href: '/brands', icon: Package },
  { name: 'Platforms', href: '/platforms', icon: Megaphone },
  { name: 'Campaigns', href: '/campaigns', icon: Megaphone },
  { name: 'Audit', href: '/audit', icon: History, restricted: true },
  { name: 'Settings', href: '/settings', icon: Settings },
  { name: 'Profile', href: '/profile', icon: User },
]

export function Sidebar() {
  const pathname = usePathname()
  const { t } = useTranslation()
  const { currentUser } = useCurrentUser()

  return (
    <aside className="hidden md:flex md:flex-shrink-0">
      <div className="flex flex-col w-64 border-r bg-card">
        <div className="flex flex-col flex-grow pt-4 pb-4 overflow-y-auto">
          <div className="flex items-center flex-shrink-0 px-5 mb-6">
            <div className="w-8 h-8 bg-primary rounded-md flex items-center justify-center">
              <svg className="w-5 h-5 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </div>
            <h1 className="ml-3 text-lg font-bold text-foreground tracking-tight">
              LiveStream Ops
            </h1>
          </div>
          <nav className="mt-5 flex-1 px-3 space-y-1">
            {navigation.filter(item => !item.restricted || (currentUser && hasAnyPermission(currentUser, ['audit.view', 'audit.view_team']))).map((item) => {
              const isActive = pathname === item.href
              const Icon = item.icon
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={cn(
                    'group flex items-center px-3 py-2 text-sm font-medium rounded-md transition-all',
                    isActive
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                  )}
                  data-testid={`sidebar-${item.name.toLowerCase()}`}
                >
                  <Icon
                    className={cn(
                      'mr-3 flex-shrink-0 h-4 w-4',
                      isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-foreground'
                    )}
                  />
                  {item.name === 'Audit' ? 'Audit History' : t(item.name.toLowerCase() as Parameters<typeof t>[0])}
                </Link>
              )
            })}
          </nav>
        </div>
      </div>
    </aside>
  )
}
