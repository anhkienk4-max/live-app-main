'use client'

import { useState } from 'react'
import Link from 'next/link'
import { LogOut, MoreHorizontal, Settings, UserRound } from 'lucide-react'
import { Button } from '@/components/ui/button'
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
import { useTranslation } from '@/lib/i18n'
import { useCurrentUser } from '@/lib/hooks/useCurrentUser'
import { useToast } from '@/components/ui/toast'
import { getAuthMode, getSupabasePublicConfig } from '@/lib/auth/authMode'
import { clearLocalSession } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/client'
import { resolveSystemPermission } from '@/lib/permissions'

type HeaderUser = {
  email?: string
  user_metadata?: { full_name?: string; avatar_url?: string }
}

export function AccountMenu({ placement, user }: { placement: 'header' | 'sidebar'; user?: HeaderUser }) {
  const { t } = useTranslation()
  const { toast } = useToast()
  const { currentUser, clearIdentity } = useCurrentUser()
  const [signingOut, setSigningOut] = useState(false)
  const displayUser: HeaderUser | undefined = currentUser ? {
    email: currentUser.email,
    user_metadata: {
      full_name: currentUser.full_name,
      avatar_url: currentUser.avatar_url,
    },
  } : user
  const name = displayUser?.user_metadata?.full_name || displayUser?.email || 'User'
  const avatarUrl = displayUser?.user_metadata?.avatar_url?.trim() || undefined
  const initials = displayUser?.user_metadata?.full_name
    ?.split(' ').filter(Boolean).map(part => part[0]).join('').slice(0, 2).toUpperCase()
    || displayUser?.email?.[0]?.toUpperCase() || 'U'

  const handleSignOut = async () => {
    if (signingOut) return
    setSigningOut(true)
    if (getAuthMode() === 'mock') {
      clearIdentity()
      window.location.replace('/login?reason=signed_out')
      return
    }
    if (!getSupabasePublicConfig()) {
      toast({ title: t('signOutFailed'), description: t('authServiceUnavailable'), variant: 'destructive' })
      setSigningOut(false)
      return
    }
    try {
      const signedOut = await clearLocalSession(createClient())
      if (!signedOut) {
        toast({ title: t('signOutFailed'), description: t('tryAgain'), variant: 'destructive' })
        setSigningOut(false)
        return
      }
      clearIdentity()
      window.location.replace('/login?reason=signed_out')
    } catch {
      toast({ title: t('signOutFailed'), description: t('tryAgain'), variant: 'destructive' })
      setSigningOut(false)
    }
  }

  const avatar = (size: 'small' | 'large') => (
    <Avatar className={size === 'small' ? 'h-7 w-7 shrink-0' : 'h-9 w-9 shrink-0'}>
      {avatarUrl && <AvatarImage src={avatarUrl} alt={name} />}
      <AvatarFallback className={size === 'small'
        ? 'bg-primary text-primary-foreground text-micro font-semibold'
        : 'bg-blue-100 text-xs font-bold text-blue-700'}>{initials}</AvatarFallback>
    </Avatar>
  )

  return <DropdownMenu>
    {placement === 'header' ? (
      <DropdownMenuTrigger render={<Button type="button" variant="ghost" className="h-11 min-w-11 max-w-48 gap-2 rounded-md px-1.5 max-md:!h-11 max-md:!min-w-11" aria-label={t('profile')} data-testid="user-menu-btn" />}>
        {avatar('small')}
        <span className="hidden min-w-0 text-left md:block">
          <span className="block truncate text-xs font-semibold">{name}</span>
          <span className="block text-[11px] capitalize text-slate-500">{resolveSystemPermission(currentUser)}</span>
        </span>
      </DropdownMenuTrigger>
    ) : (
      <DropdownMenuTrigger render={<button type="button" aria-label={t('profile')} data-testid="sidebar-account-trigger" className="flex min-h-14 w-full items-center gap-3 border-t border-white/10 px-4 py-3 text-left text-slate-200 transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-400" />}>
        {avatar('large')}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold text-white">{name}</span>
          <span className="block truncate text-[11px] capitalize text-slate-400">{resolveSystemPermission(currentUser)}</span>
        </span>
        <MoreHorizontal className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
      </DropdownMenuTrigger>
    )}
    <DropdownMenuContent className="w-56" align={placement === 'sidebar' ? 'start' : 'end'} side={placement === 'sidebar' ? 'top' : 'bottom'}>
      <DropdownMenuGroup>
        <DropdownMenuLabel className="py-2 font-normal">
          <div className="flex min-w-0 flex-col gap-1">
            <span className="truncate text-sm font-medium text-foreground">{name}</span>
            <span className="truncate text-xs text-muted-foreground">{displayUser?.email}</span>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem render={<Link href="/profile" />} data-testid="account-profile-link">
          <UserRound className="mr-2 h-4 w-4" aria-hidden="true" />
          <span>{t('profile')}</span>
        </DropdownMenuItem>
        <DropdownMenuItem render={<Link href="/settings" />} data-testid="account-settings-link">
          <Settings className="mr-2 h-4 w-4" aria-hidden="true" />
          <span>{t('settings')}</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => void handleSignOut()} disabled={signingOut} data-testid="signout-btn">
          <LogOut className="mr-2 h-4 w-4" aria-hidden="true" />
          <span>{t('signOut')}</span>
        </DropdownMenuItem>
      </DropdownMenuGroup>
    </DropdownMenuContent>
  </DropdownMenu>
}
