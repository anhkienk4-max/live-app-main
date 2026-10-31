'use client'

import { Button } from '@/components/ui/button'
import { GlobalSearch } from '@/components/features/search/GlobalSearch'
import { NotificationCenter } from '@/components/features/notifications/NotificationCenter'
import { useTranslation } from '@/lib/i18n'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'
import { resolveSystemPermission } from '@/lib/permissions'
import { filterNav, getNavigationForRole } from '@/lib/ui/role-ux'
import { usePathname, useSearchParams } from 'next/navigation'
import { resolveActiveNavigation } from './shellConfig'
import { Menu } from 'lucide-react'
import { NavigationDrawer } from './NavigationDrawer'
import { AccountMenu } from './AccountMenu'
import { AdaBrand } from '@/components/branding/AdaBrand'

function MobileNavMenu() {
  const pathname = usePathname()
  const search = useSearchParams()
  const { t } = useTranslation()
  const { currentUser } = useCurrentUser()
  const roleNav = filterNav(getNavigationForRole(resolveSystemPermission(currentUser)), currentUser)
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
    <header data-testid="production-topbar" className="ada-header sticky top-0 z-40 h-[56px] shrink-0 border-b border-slate-200 bg-white">
      <div className="px-3 sm:px-6">
        <div className="flex h-[55px] items-center justify-between gap-2 sm:gap-3">

          {/* Left: wordmark (mobile only — desktop shows sidebar wordmark) */}
          <div className="flex items-center lg:hidden">
            <MobileNavMenu />
            <AdaBrand inverse compact className="ada-header__brand" />
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
