'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Eye, EyeOff, Globe, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useTranslation } from '@/lib/i18n'
import { mockAuthService } from '@/lib/services/mockAuthService'
import { getAuthMode, getSupabasePublicConfig, safeLocalRedirect } from '@/lib/auth/authMode'
import {
  clearLocalSession,
  establishPasswordSession,
  shouldClearLocalSessionForLoginReason,
} from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/client'
import { AuthLayout } from '@/components/layouts/AuthLayout'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [showPassword, setShowPassword] = useState(false)
  const router = useRouter()
  const { language, setLanguage, t } = useTranslation()
  const mockMode = getAuthMode() === 'mock'

  useEffect(() => {
    const reason = new URLSearchParams(window.location.search).get('reason')
    if (
      !mockMode
      && getSupabasePublicConfig()
      && shouldClearLocalSessionForLoginReason(reason)
    ) {
      void clearLocalSession(createClient())
    }
    if (reason === 'session_expired' || reason === 'authentication_required') {
      setError(t('sessionExpired'))
    } else if (reason === 'auth_unavailable') {
      setError(t('authServiceUnavailable'))
    } else if (reason === 'identity_unavailable') {
      setError(t('authIdentityUnavailable'))
    } else if (reason === 'signed_out') {
      setNotice(t('signedOutMessage'))
    }
  }, [mockMode, t])

  const redirectAfterLogin = () => {
    const next = safeLocalRedirect(new URLSearchParams(window.location.search).get('next'))
    router.replace(next)
    router.refresh()
  }

  const authStatusMessage = (status?: string) => {
    if (status === 'pending_email_verification') return t('pendingEmailVerification')
    if (status === 'pending_approval') return t('pendingAdminApproval')
    if (status === 'rejected') return t('accountRejected')
    return t('invalidEmailOrPassword')
  }

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setNotice(null)

    if (mockMode) {
      const result = await mockAuthService.signInEmail(email, password)
      if (result.ok) {
        redirectAfterLogin()
        return
      }
      setError(authStatusMessage(result.status))
      setLoading(false)
      return
    }

    if (!getSupabasePublicConfig()) {
      setError(t('authServiceUnavailable'))
      setLoading(false)
      return
    }

    const authenticated = await establishPasswordSession(createClient(), email, password)
    if (authenticated) {
      redirectAfterLogin()
      return
    }

    setError(t('invalidEmailOrPassword'))
    setLoading(false)
  }

  return (
    <AuthLayout title="LiveStream Ops" subtitle={t('loginSubtitle')}>
      {mockMode && (
        <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700">
          <AlertCircle className="size-4 shrink-0" />
          <p className="font-medium">{t('demoModeHelp')}</p>
        </div>
      )}

      {notice && (
        <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700" data-testid="login-notice">
          <CheckCircle2 className="size-4 shrink-0" />
          <p>{notice}</p>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700" data-testid="login-error">
          <AlertCircle className="size-4 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      <div className="grid gap-4">
        <Button
          type="button"
          disabled={true}
          variant="outline"
          className="h-11 w-full bg-white text-zinc-950 opacity-70 hover:bg-zinc-50"
          title="Google Sign-In is not currently configured in the Supabase backend."
        >
          <Globe className="mr-2 size-5" />
          {t('continueWithGoogle')}
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          Google Sign-In requires backend configuration.
        </p>
      </div>

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <Separator className="w-full" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-background px-4 text-muted-foreground font-medium">
            {t('continueWithEmail')}
          </span>
        </div>
      </div>

      <form onSubmit={handleEmailLogin} className="space-y-4">
        <div className="space-y-2">
          <label htmlFor="email" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
            {t('email')}
          </label>
          <Input
            id="email"
            type="email"
            placeholder="name@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="h-11"
            data-testid="email-input"
          />
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label htmlFor="password" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
              {t('password')}
            </label>
            {mockMode && (
              <button 
                type="button" 
                onClick={() => setError(t('passwordResetMockHelp'))}
                className="text-sm font-medium text-blue-600 hover:text-blue-500"
              >
                {t('forgotPassword')}
              </button>
            )}
          </div>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? 'text' : 'password'}
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="h-11 pr-11"
              data-testid="password-input"
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="absolute right-1 top-1.5 size-8 text-muted-foreground hover:text-foreground"
              aria-label={showPassword ? t('hidePassword') : t('showPassword')}
              onClick={() => setShowPassword(value => !value)}
            >
              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </Button>
          </div>
        </div>
        <Button
          type="submit"
          disabled={loading}
          className="h-11 w-full bg-blue-600 text-white hover:bg-blue-700"
          data-testid="email-login-btn"
        >
          {loading ? <><Loader2 className="mr-2 size-4 animate-spin" />{t('signingIn')}</> : t('signIn')}
        </Button>
      </form>

      <div className="text-center text-sm text-muted-foreground">
        {mockMode && (
          <p>
            {t('noAccount')} <Link className="font-semibold text-blue-600 hover:text-blue-500" href="/register">{t('signUp')}</Link>
          </p>
        )}
      </div>

      <div className="mt-8 flex justify-center">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
          onClick={() => setLanguage(language === 'en' ? 'vi' : 'en')}
        >
          <Globe className="mr-2 size-4" />
          {language === 'en' ? t('vietnamese') : t('english')}
        </Button>
      </div>
    </AuthLayout>
  )
}
