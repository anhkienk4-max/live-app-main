'use client'

import { Button } from '@/components/ui/button'
import { GlobalSearch } from '@/components/features/search/GlobalSearch'
import { NotificationCenter } from '@/components/features/notifications/NotificationCenter'
import { useTranslation } from '@/lib/i18n'
import { getSharedNavigation } from '@/lib/ui/role-ux'
import { usePathname, useSearchParams } from 'next/navigation'
import { resolveActiveNavigation } from './shellConfig'
import { Menu } from 'lucide-react'
import { NavigationDrawer } from './NavigationDrawer'
import { AccountMenu } from './AccountMenu'

function MobileNavMenu() {
  const pathname = usePathname()
  const search = useSearchParams()
  const { t } = useTranslation()
  const roleNav = getSharedNavigation()
  const activeHref = resolveActiveNavigation(roleNav, pathname, search)

  return <div className="mr-2 hidden md:flex lg:hidden">
    <NavigationDrawer menuId="tablet" items={roleNav} activeHref={activeHref} trigger={<Button variant="ghost" size="icon" aria-label={t('navMain')}><Menu className="h-5 w-5" /></Button>} />
  </div>
}

interface HeaderProps {
  user?: {
    email?: string
    user_metadata?: {
      full_name?: string
      avatar_url?: string
    }
  }
}

export function Header({ user }: HeaderProps) {
  const { language, setLanguage, t } = useTranslation()

  return (
    <header data-testid="production-topbar" className="sticky top-0 z-40 h-[56px] shrink-0 border-b border-slate-200 bg-white">
      <div className="px-3 sm:px-6">
        <div className="flex h-[55px] items-center justify-between gap-2 sm:gap-3">

          {/* Left: wordmark (mobile only — desktop shows sidebar wordmark) */}
          <div className="flex items-center lg:hidden">
            <MobileNavMenu />
            <div className="w-6 h-6 bg-primary rounded-md flex items-center justify-center flex-shrink-0">
              <svg className="w-3.5 h-3.5 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </div>
            <span className="ml-2 hidden text-sm font-semibold text-foreground tracking-tight whitespace-nowrap min-[375px]:inline">
              LiveStream Ops
            </span>
          </div>

          {/* One responsive search instance preserves the shared keyboard shortcut. */}
          <div className="min-w-0 flex-1"><GlobalSearch /></div>

          {/* Right: actions cluster */}
          <div className="flex items-center gap-1.5">
            <NotificationCenter />

            {/* Language toggle */}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setLanguage(language === 'en' ? 'vi' : 'en')}
              aria-label={t('language')}
              className="h-11 w-11 px-0 text-xs font-medium text-muted-foreground"
            >
              {language === 'en' ? 'VI' : 'EN'}
            </Button>

            {/* Shared user menu. Sidebar and Header use the same actions. */}
            <AccountMenu placement="header" user={user} />
          </div>
        </div>
      </div>
    </header>
  )
}
