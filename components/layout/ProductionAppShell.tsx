'use client'

import type { ReactNode } from 'react'
import { Sidebar } from './Sidebar'
import { Header } from './Header'
import { BottomNav } from './BottomNav'

export function ProductionAppShell({ children, user }: { children: ReactNode; user?: Parameters<typeof Header>[0]['user'] }) {
  return (
    <div data-testid="production-app-shell" data-shell="persistent" className="flex h-dvh min-w-0 overflow-hidden bg-slate-50 text-slate-900">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Header user={user} />
        <main data-testid="production-main-content" className="min-w-0 flex-1 overflow-y-auto pb-24 md:pb-4">{children}</main>
        <BottomNav />
      </div>
    </div>
  )
}
