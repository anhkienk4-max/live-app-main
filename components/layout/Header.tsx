'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
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

function MobileNavMenu() {
  const pathname = usePathname()
  const search = useSearchParams()
  const { t } = useTranslation()
  const { currentUser } = useCurrentUser()
  const rawNav = getNavigationForRole(resolveSystemPermission(currentUser))
  const roleNav = filterNav(rawNav, currentUser)
  const activeHref = resolveActiveNavigation(roleNav, pathname, search)

  return (
    <div className="hidden md:flex lg:hidden mr-2">
      <DropdownMenu>
        <DropdownMenuTrigger render={
          <Button variant="ghost" size="icon" className="h-8 w-8 px-0">
            <Menu className="h-5 w-5" />
            <span className="sr-only">Toggle menu</span>
          </Button>
        }>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuLabel className="font-normal text-xs text-muted-foreground uppercase tracking-wider">{t('navMain')}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            {roleNav.map(item => {
              const isActive = activeHref === item.href
              const Icon = item.icon
              const label = item.labelKey ? t(item.labelKey as Parameters<typeof t>[0]) : t(item.name.toLowerCase() as Parameters<typeof t>[0]) || item.name
              return (
                <DropdownMenuItem key={item.name} render={
                  <Link href={item.href} className={`flex items-center gap-2 ${isActive ? 'bg-primary/10 text-primary font-medium' : ''}`}>
                    <Icon className={`h-4 w-4 ${isActive ? 'text-primary' : 'text-muted-foreground'}`} />
                    <span>{label}</span>
                  </Link>
                } />
              )
            })}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
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
    <header data-testid="production-topbar" className="sticky top-0 z-40 shrink-0 border-b border-slate-200 bg-white">
      <div className="px-3 sm:px-6">
        <div className="flex h-[56px] items-center justify-between gap-2 sm:gap-3">

          {/* Left: wordmark (mobile only — desktop shows sidebar wordmark) */}
          <div className="flex items-center lg:hidden">
            <MobileNavMenu />
            <div className="w-6 h-6 bg-primary rounded-md flex items-center justify-center flex-shrink-0">
              <svg className="w-3.5 h-3.5 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </div>
            <span className="ml-2 text-sm font-semibold text-foreground tracking-tight whitespace-nowrap">
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
              className="h-8 w-8 px-0 text-xs font-medium text-muted-foreground"
            >
              {language === 'en' ? 'VI' : 'EN'}
            </Button>

            {/* User menu */}
            <DropdownMenu>
              <DropdownMenuTrigger
                render={<Button variant="ghost" className="h-9 max-w-48 gap-2 rounded-md px-1.5" data-testid="user-menu-btn" />}
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
