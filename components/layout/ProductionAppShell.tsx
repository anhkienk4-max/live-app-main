'use client'

import type { ReactNode } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { Sidebar } from './Sidebar'
import { Header } from './Header'
import { BottomNav } from './BottomNav'
import { resolveProductionShell } from './shellConfig'

export function ProductionAppShell({ children, user }: { children: ReactNode; user?: Parameters<typeof Header>[0]['user'] }) {
  const pathname = usePathname()
  const search = useSearchParams()
  const variant = resolveProductionShell(pathname, search)
  return (
    <div data-testid="production-app-shell" data-shell={variant} className="flex h-dvh min-w-0 overflow-hidden bg-slate-50 text-slate-900">
      <Sidebar variant={variant} />
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Header user={user} variant={variant} />
        <main className="min-w-0 flex-1 overflow-y-auto pb-24 md:pb-4">{children}</main>
        <BottomNav variant={variant} />
      </div>
    </div>
  )
}
