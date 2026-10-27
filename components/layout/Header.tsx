'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { AdaBrand } from '@/components/branding/AdaBrand'
import { LogOut } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { GlobalSearch } from '@/components/features/search/GlobalSearch'
import { NotificationCenter } from '@/components/features/notifications/NotificationCenter'
import { useTranslation } from '@/lib/i18n'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'
import { useToast } from '@/components/ui/toast'
import { getAuthMode, getSupabasePublicConfig } from '@/lib/auth/authMode'
import { clearLocalSession } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/client'
import { resolveSystemPermission } from '@/lib/permissions'
import { getNavigationForRole, filterNav } from '@/lib/ui/role-ux'
import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import { resolveActiveNavigation } from './shellConfig'
import { Menu } from 'lucide-react'
import { useWorkforceCapabilities } from '@/lib/hooks/useWorkforceCapabilities'
import { filterWorkforceNavigation } from '@/lib/ui/workforceNavigation'

function MobileNavMenu() {
  const pathname = usePathname()
  const search = useSearchParams()
  const { t } = useTranslation()
  const { currentUser } = useCurrentUser()
  const rawNav = getNavigationForRole(resolveSystemPermission(currentUser))
  const { capabilities } = useWorkforceCapabilities()
  const roleNav = filterWorkforceNavigation(filterNav(rawNav, currentUser), capabilities)
  const activeHref = resolveActiveNavigation(roleNav, pathname, search)
  const [open, setOpen] = useState(false)
  const menuId = 'ada-tablet-navigation'

  // Close when a link is selected, or when the route changes via a different control.
  // The menu remains an ordinary React-controlled panel; no popup portal is mounted.
  return (
    <div className="relative mr-2 hidden md:flex lg:hidden">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={t('navMain')}
        aria-expanded={open}
        aria-controls={menuId}
        data-testid="tablet-nav-toggle"
        className="h-9 w-9 px-0"
        onClick={() => setOpen(value => !value)}
      >
        <Menu className="h-5 w-5" />
      </Button>
      {open && (
        <>
          <button
            type="button"
            aria-label={t('close')}
            className="fixed inset-0 z-40 cursor-default bg-slate-900/10"
            onClick={() => setOpen(false)}
          />
          <nav
            id={menuId}
            aria-label={t('navMain')}
            data-testid="tablet-nav-panel"
            className="absolute left-0 top-11 z-50 max-h-[min(68dvh,560px)] w-64 overflow-y-auto rounded-xl border border-slate-200 bg-white p-2 text-slate-900 shadow-xl"
          >
            {roleNav.map(item => {
              const Icon = item.icon
              const active = activeHref === item.href
              const label = item.labelKey
                ? t(item.labelKey as Parameters<typeof t>[0])
                : t(item.name.toLowerCase() as Parameters<typeof t>[0]) || item.name
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  onClick={() => setOpen(false)}
                  className={`flex min-h-11 items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium focus-visible:outline-2 focus-visible:outline-blue-600 ${active ? 'bg-blue-50 text-blue-700' : 'text-slate-700 hover:bg-slate-50'}`}
                >
                  <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                  <span className="min-w-0 truncate">{label}</span>
                </Link>
              )
            })}
          </nav>
        </>
      )}
    </div>
  )
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
  const { toast } = useToast()
  const [signingOut, setSigningOut] = useState(false)
  const { currentUser, clearIdentity } = useCurrentUser()
  const mockMode = getAuthMode() === 'mock'
  const displayUser = currentUser ? {
    email: currentUser.email,
    user_metadata: {
      full_name: currentUser.full_name,
      avatar_url: currentUser.avatar_url,
    },
  } : user

  const handleSignOut = async () => {
    if (signingOut) return
    setSigningOut(true)

    if (mockMode) {
      clearIdentity()
      window.location.replace('/login?reason=signed_out')
      return
    }

    if (!getSupabasePublicConfig()) {
      toast({
        title: t('signOutFailed'),
        description: t('authServiceUnavailable'),
        variant: 'destructive',
      })
      setSigningOut(false)
      return
    }

    const signedOut = await clearLocalSession(createClient())
    if (!signedOut) {
      toast({
        title: t('signOutFailed'),
        description: t('tryAgain'),
        variant: 'destructive',
      })
      setSigningOut(false)
      return
    }

    clearIdentity()
    window.location.replace('/login?reason=signed_out')
  }

  const avatarUrl = displayUser?.user_metadata?.avatar_url?.trim() || undefined

  const initials = displayUser?.user_metadata?.full_name
    ?.split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase() || displayUser?.email?.[0].toUpperCase() || 'U'

  return (
    <header data-testid="production-topbar" className="ada-header sticky top-0 z-40 h-[68px] shrink-0 border-b border-white/10 bg-[#081C49] text-white lg:h-[56px] lg:border-slate-200 lg:bg-white lg:text-slate-900">
      <div className="px-3 sm:px-6">
        <div className="flex h-[67px] items-center justify-between gap-2 lg:h-[55px] sm:gap-3">

          {/* Reference-board mobile greeting; account identity is always sourced from session. */}
          <div className="flex min-w-0 flex-1 items-center gap-2.5 lg:hidden">
            <div className="hidden md:block"><MobileNavMenu /></div>
            <Avatar className="h-9 w-9 shrink-0 border border-white/15">
              {avatarUrl && <AvatarImage src={avatarUrl} alt={displayUser?.user_metadata?.full_name || displayUser?.email || 'User'} />}
              <AvatarFallback className="bg-[#3678f8] text-[11px] font-bold text-white">{initials}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <span className="block text-[10px] text-blue-200">Xin chào,</span>
              <span className="block max-w-[185px] truncate text-[12px] font-bold text-white">{displayUser?.user_metadata?.full_name || displayUser?.email || 'User'}</span>
              <span className="block text-[10px] capitalize text-blue-200">{resolveSystemPermission(currentUser)}</span>
            </div>
          </div>

          {/* One responsive search instance preserves the shared keyboard shortcut. */}
          <div className="hidden min-w-0 flex-1 lg:block"><GlobalSearch /></div>

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
              className="hidden h-8 w-8 px-0 text-xs font-medium text-muted-foreground md:inline-flex"
            >
              {language === 'en' ? 'VI' : 'EN'}
            </Button>

            {/* User menu */}
            <DropdownMenu>
              <DropdownMenuTrigger
                render={<Button variant="ghost" className="hidden h-9 max-w-48 gap-2 rounded-md px-1.5 lg:inline-flex" data-testid="user-menu-btn" />}
              >
                <Avatar className="h-7 w-7">
                  {avatarUrl && <AvatarImage src={avatarUrl} alt={displayUser?.user_metadata?.full_name || displayUser?.email || 'User'} />}
                  <AvatarFallback className="bg-primary text-primary-foreground text-micro font-semibold">
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <span className="hidden min-w-0 text-left md:block"><span className="block truncate text-[12px] font-semibold">{displayUser?.user_metadata?.full_name || displayUser?.email || 'User'}</span><span className="block text-[11px] capitalize text-slate-500">{resolveSystemPermission(currentUser)}</span></span>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-52" align="end">
                <DropdownMenuGroup>
                  <DropdownMenuLabel className="font-normal py-2">
                    <div className="flex flex-col gap-0.5">
                      <p className="text-sm font-medium leading-none text-foreground">{displayUser?.user_metadata?.full_name || 'User'}</p>
                      <p className="text-xs leading-none text-muted-foreground">{displayUser?.email}</p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => void handleSignOut()} disabled={signingOut} data-testid="signout-btn">
                    <LogOut className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
                    <span>{t('signOut')}</span>
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>
    </header>
  )
}
