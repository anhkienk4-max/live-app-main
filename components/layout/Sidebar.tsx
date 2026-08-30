'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/lib/i18n'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'
import { resolveSystemPermission } from '@/lib/permissions'
import { getNavigationForRole, filterNav } from '@/lib/ui/role-ux'

export function Sidebar() {
  const pathname = usePathname()
  const { t } = useTranslation()
  const { currentUser } = useCurrentUser()

  const rawNav = getNavigationForRole(resolveSystemPermission(currentUser))
  const navigation = filterNav(rawNav, currentUser)

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
            {navigation.map((item) => {
              const isActive = pathname === item.href
              const Icon = item.icon
              const label = item.labelKey
                ? t(item.labelKey as Parameters<typeof t>[0])
                : t(item.name.toLowerCase() as Parameters<typeof t>[0])
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
                  {label}
                </Link>
              )
            })}
          </nav>
        </div>
      </div>
    </aside>
  )
}
