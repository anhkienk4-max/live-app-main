
'use client'

import * as React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { getNavigationForRole } from '@/lib/ui/role-ux'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Menu, Bell } from 'lucide-react'

// Simple mock components for Visual QA
function QaSidebar({ role }: { role: 'admin' | 'leader' | 'member' }) {
  const pathname = usePathname()
  
  // Use raw nav, skip user filtering for QA
  const systemPermission = role
  const navigation = getNavigationForRole(systemPermission)
  
  const roleLabel = role.toUpperCase()
  const initials = role.charAt(0).toUpperCase()
  
  return (
    <aside className="hidden lg:flex flex-col border-r border-border bg-sidebar transition-all duration-300 w-[248px]">
      <div className="flex flex-col flex-grow pt-3 pb-3 overflow-y-auto">
        <div className="flex items-center flex-shrink-0 px-4 mb-4 h-[40px]">
          <div className="w-6 h-6 bg-primary rounded-md flex items-center justify-center flex-shrink-0">
            <svg className="w-3.5 h-3.5 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </div>
          <span className="ml-2.5 text-sm font-semibold text-foreground tracking-tight leading-none overflow-hidden whitespace-nowrap hidden xl:block">
            LiveStream Ops QA
          </span>
        </div>

        <nav className="flex-1 px-2 space-y-0.5">
          {navigation.map((item, index) => {
            const isActive = pathname === item.href
            const isFirstInGroup = index === 0 || navigation[index - 1].group !== item.group
            const Icon = item.icon

            return (
              <div key={item.name}>
                {isFirstInGroup && item.group && (
                  <div className="px-3 pt-4 pb-1 text-xs font-semibold text-muted-foreground tracking-wider uppercase hidden xl:block">
                    {item.group}
                  </div>
                )}
                <Link
                  href={item.href}
                  className={cn(
                    'group flex items-center px-2.5 py-1.5 text-sm font-medium rounded-md transition-colors',
                    isActive ? 'bg-primary/8 text-primary' : 'text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                    "xl:justify-start justify-center xl:px-2.5 px-0"
                  )}
                >
                  <Icon className={cn('flex-shrink-0 h-4 w-4', isActive ? 'text-primary' : 'text-muted-foreground group-hover:text-sidebar-accent-foreground', "xl:mr-2.5 mr-0")} />
                  <span className="truncate hidden xl:block">{item.name}</span>
                </Link>
              </div>
            )
          })}
        </nav>
      </div>

      <div className="flex-shrink-0 border-t border-border p-4">
        <div className="flex items-center xl:gap-3 justify-center xl:justify-start">
          <Avatar className="h-9 w-9">
            <AvatarFallback className="bg-primary/10 text-primary text-small font-semibold">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="flex-col overflow-hidden hidden xl:flex">
            <span className="text-sm font-medium text-foreground truncate">{role} QA User</span>
            <span className="text-micro text-muted-foreground tracking-wider font-medium truncate">{roleLabel}</span>
          </div>
        </div>
      </div>
    </aside>
  )
}

function QaHeader({ role }: { role: 'admin' | 'leader' | 'member' }) {
  const initials = role.charAt(0).toUpperCase()
  return (
    <header className="bg-card border-b border-border sticky top-0 z-40">
      <div className="px-4 sm:px-6">
        <div className="flex h-14 items-center justify-between gap-3">
          <div className="flex items-center lg:hidden">
            <Button variant="ghost" size="icon" className="h-8 w-8 px-0 mr-2">
              <Menu className="h-5 w-5" />
            </Button>
            <div className="w-6 h-6 bg-primary rounded-md flex items-center justify-center flex-shrink-0">
              <svg className="w-3.5 h-3.5 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </div>
            <span className="ml-2 text-sm font-semibold text-foreground tracking-tight whitespace-nowrap">
              QA Shell
            </span>
          </div>
          <div className="hidden md:flex flex-1" />
          <div className="flex items-center gap-1.5">
            <Button variant="ghost" size="icon" className="relative h-8 w-8 rounded-full">
              <Bell className="h-4 w-4" />
            </Button>
            <Button variant="ghost" className="relative h-8 w-8 rounded-full p-0">
              <Avatar className="h-7 w-7">
                <AvatarFallback className="bg-primary text-primary-foreground text-micro font-semibold">{initials}</AvatarFallback>
              </Avatar>
            </Button>
          </div>
        </div>
      </div>
    </header>
  )
}

export function VisualQaShell({ children, role }: { children: React.ReactNode, role: 'admin' | 'leader' | 'member' }) {
  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <QaSidebar role={role} />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <QaHeader role={role} />
        <main className="min-w-0 flex-1 overflow-y-auto pb-28 md:pb-4">
          <div className="w-full min-w-0 h-full">
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}
