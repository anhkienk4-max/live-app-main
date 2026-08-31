'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Separator } from '@/components/ui/separator'
import { Globe, Loader2 } from 'lucide-react'
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
import {
  AuthPanel,
  AuthHeader,
  AuthField,
  PasswordField,
  AuthStatusState,
  type AuthStatusType
} from '@/components/ui/auth'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<{ message: string; type: AuthStatusType } | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
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
      setError({ message: t('sessionExpired'), type: 'error' })
    } else if (reason === 'auth_unavailable') {
      setError({ message: t('authServiceUnavailable'), type: 'error' })
    } else if (reason === 'identity_unavailable') {
      setError({ message: t('authIdentityUnavailable'), type: 'error' })
    } else if (reason === 'signed_out') {
      setNotice(t('signedOutMessage'))
    }
  }, [mockMode, t])

  const redirectAfterLogin = () => {
    const next = safeLocalRedirect(new URLSearchParams(window.location.search).get('next'))
    router.replace(next)
    router.refresh()
  }

  const handleAuthStatus = (status?: string) => {
    if (status === 'pending_email_verification') {
      setError({ message: t('pendingEmailVerification'), type: 'warning' })
    } else if (status === 'pending_approval') {
      setError({ message: t('pendingAdminApproval'), type: 'warning' })
    } else if (status === 'rejected') {
      setError({ message: t('accountRejected'), type: 'error' })
    } else if (status === 'deactivated') {
      setError({ message: 'Account deactivated', type: 'error' })
    } else {
      setError({ message: t('invalidEmailOrPassword'), type: 'error' })
    }
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
      handleAuthStatus(result.status)
      setLoading(false)
      return
    }

    if (!getSupabasePublicConfig()) {
      setError({ message: t('authServiceUnavailable'), type: 'error' })
      setLoading(false)
      return
    }

    const authenticated = await establishPasswordSession(createClient(), email, password)
    if (authenticated) {
      redirectAfterLogin()
      return
    }

    setError({ message: t('invalidEmailOrPassword'), type: 'error' })
    setLoading(false)
  }

  return (
    <AuthLayout>
      <AuthPanel>
        <AuthHeader title="LiveStream Ops" subtitle={t('loginSubtitle')} />

        {mockMode && (
          <AuthStatusState type="info" message={t('demoModeHelp')} />
        )}

        {notice && (
          <AuthStatusState type="success" message={notice} testId="login-notice" />
        )}

        {error && (
          <AuthStatusState type={error.type} message={error.message} testId="login-error" />
        )}

        <div className="grid gap-4">
          <Button
            type="button"
            disabled={true}
            variant="outline"
            className="h-11 w-full bg-white text-zinc-950 opacity-70 hover:bg-zinc-50"
            title={t('googleAuthHelp')}
          >
            <Globe className="mr-2 size-5" />
            {t('continueWithGoogle')}
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            {t('googleAuthMissing')}
          </p>
        </div>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <Separator className="w-full" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-white lg:bg-zinc-50 px-4 text-muted-foreground font-medium">
              {t('continueWithEmail')}
            </span>
          </div>
        </div>

        <form onSubmit={handleEmailLogin} className="space-y-4">
          <AuthField label={t('email')} htmlFor="email">
            <Input
              id="email"
              type="email"
              placeholder="name@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              aria-invalid={Boolean(error)}
              className="h-11"
              data-testid="email-input"
            />
          </AuthField>

          <AuthField label={t('password')} htmlFor="password">
            <div className="flex justify-end -mt-7 mb-1 relative z-10">
              {mockMode ? (
                <button 
                  type="button" 
                  onClick={() => setError({ message: t('passwordResetMockHelp'), type: 'info' })}
                  className="text-sm font-medium text-blue-600 hover:text-blue-500"
                >
                  {t('forgotPassword')}
                </button>
              ) : (
                <Link 
                  href="/forgot-password"
                  className="text-sm font-medium text-blue-600 hover:text-blue-500"
                >
                  {t('forgotPassword')}
                </Link>
              )}
            </div>
            <PasswordField
              id="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              error={Boolean(error)}
              data-testid="password-input"
              labelToggleShow={t('showPassword')}
              labelToggleHide={t('hidePassword')}
            />
          </AuthField>

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
          <p>
            {t('noAccount')} <Link className="font-semibold text-blue-600 hover:text-blue-500" href="/register">{t('signUp')}</Link>
          </p>
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
      </AuthPanel>
    </AuthLayout>
  )
}
