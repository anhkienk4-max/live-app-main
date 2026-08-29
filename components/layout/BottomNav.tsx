'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, Calendar, Radio, FileText, User } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/lib/i18n'

const navigation = [
  { name: 'Dashboard', href: '/', icon: Home },
  { name: 'Calendar', href: '/calendar', icon: Calendar },
  { name: 'Live', href: '/live', icon: Radio },
  { name: 'Reports', href: '/reports', icon: FileText },
  { name: 'Profile', href: '/profile', icon: User },
]

export function BottomNav() {
  const pathname = usePathname()
  const { t } = useTranslation()

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border md:hidden">
      <div className="grid grid-cols-5 h-16">
        {navigation.map((item) => {
          const isActive = pathname === item.href
          const Icon = item.icon
          return (
            <Link
              key={item.name}
              href={item.href}
              className={cn(
                'flex flex-col items-center justify-center gap-1 transition-colors',
                isActive
                  ? 'text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              )}
              data-testid={`nav-${item.name.toLowerCase()}`}
            >
              <Icon className="h-5 w-5" />
              <span className="text-xs font-medium">{t(item.name.toLowerCase() as Parameters<typeof t>[0])}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
