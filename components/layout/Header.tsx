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

  const initials = displayUser?.user_metadata?.full_name
    ?.split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase() || displayUser?.email?.[0].toUpperCase() || 'U'

  return (
    <header className="bg-card border-b sticky top-0 z-40">
      <div className="px-4 sm:px-6 lg:px-8">
        <div className="flex h-14 items-center justify-between">
          <div className="flex-1">
            <h2 className="text-xl font-bold text-foreground hidden md:block tracking-tight">
              {t('operationsCenter')}
            </h2>
            <div className="md:hidden flex items-center">
              <div className="w-8 h-8 bg-primary rounded-md flex items-center justify-center">
                <svg className="w-5 h-5 text-primary-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </div>
              <h1 className="ml-2 text-lg font-bold text-foreground tracking-tight">
                LiveStream Ops
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <GlobalSearch />
            <NotificationCenter />
            <Button type="button" variant="outline" size="sm" onClick={() => setLanguage(language === 'en' ? 'vi' : 'en')} aria-label={t('language')}>{language === 'en' ? 'VI' : 'EN'}</Button>

            <DropdownMenu>
              <DropdownMenuTrigger
                render={<Button variant="ghost" className="relative h-9 w-9 rounded-full" data-testid="user-menu-btn" />}
              >
                <Avatar className="h-9 w-9">
                  <AvatarImage src={displayUser?.user_metadata?.avatar_url} alt={displayUser?.user_metadata?.full_name || displayUser?.email} />
                  <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                    {initials}
                  </AvatarFallback>
                </Avatar>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56" align="end">
                <DropdownMenuGroup>
                  <DropdownMenuLabel className="font-normal">
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-medium leading-none text-foreground">{displayUser?.user_metadata?.full_name || 'User'}</p>
                      <p className="text-xs leading-none text-muted-foreground">{displayUser?.email}</p>
                    </div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => void handleSignOut()} disabled={signingOut} data-testid="signout-btn">
                    <LogOut className="mr-2 h-4 w-4" />
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
