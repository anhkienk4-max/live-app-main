'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AuthLayout } from '@/components/layouts/AuthLayout'
import { Separator } from '@/components/ui/separator'
import { Eye, EyeOff, Globe, Loader2 } from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTranslation, type TranslationKey } from '@/lib/i18n'
import { mockAuthService } from '@/lib/services/mockAuthService'
import { getAuthMode, getSupabasePublicConfig, safeLocalRedirect } from '@/lib/auth/authMode'
import {
  clearLocalSession,
  establishPasswordSession,
  type PasswordSessionFailure,
  shouldClearLocalSessionForLoginReason,
} from '@/lib/auth/session'
import { startGoogleOAuth } from '@/lib/auth/googleOAuth'
import { createClient } from '@/lib/supabase/client'

const passwordFailureMessages: Record<PasswordSessionFailure, TranslationKey> = {
  INVALID_CREDENTIALS: 'invalidEmailOrPassword',
  AUTH_NETWORK_ERROR: 'authNetworkError',
  AUTH_PROVIDER_UNAVAILABLE: 'authProviderUnavailable',
  AUTH_SESSION_FAILURE: 'authSessionFailure',
  UNKNOWN_AUTH_ERROR: 'authUnknownError',
}

function LoginPageContent() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [hasSubmitted, setHasSubmitted] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  const { language, setLanguage, t } = useTranslation()
  const mockMode = getAuthMode() === 'mock'
  const [googleEnabled, setGoogleEnabled] = useState(false)
  useEffect(() => {
    if (mockMode) return
    const controller = new AbortController()
    void fetch('/api/auth/providers', { cache: 'no-store', signal: controller.signal })
      .then(async response => response.ok ? response.json() : null)
      .then(data => { if (!controller.signal.aborted) setGoogleEnabled(data?.google === true) })
      .catch(() => { /* Email and request access remain available. */ })
    return () => controller.abort()
  }, [mockMode])
  const recoveryReason = searchParams.get('reason')
  const recoveryMessage = recoveryReason === 'session_expired' || recoveryReason === 'authentication_required'
    ? t('sessionExpired')
    : recoveryReason === 'auth_unavailable'
      ? t('authServiceUnavailable')
        : recoveryReason === 'identity_unavailable'
          ? t('authIdentityUnavailable')
          : recoveryReason === 'approval_required'
            ? t('googleApprovalRequired')
            : recoveryReason === 'oauth_failed' ? t('googleLoginFailed') : null
  const recoveryNotice = recoveryReason === 'signed_out' && !hasSubmitted
    ? t('signedOutMessage')
    : null

  useEffect(() => {
    if (
      !mockMode
      && getSupabasePublicConfig()
      && shouldClearLocalSessionForLoginReason(recoveryReason)
    ) {
      try { void clearLocalSession(createClient()) } catch { /* Local session cleanup is best effort. */ }
    }
  }, [mockMode, recoveryReason])

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
    setHasSubmitted(true)
    setLoading(true)
    setError(null)
    setNotice(null)

    try {
      if (mockMode) {
        const result = await mockAuthService.signInEmail(email, password)
        if (result.ok) {
          redirectAfterLogin()
          return
        }
        setError(authStatusMessage(result.status))
        return
      }

      if (!getSupabasePublicConfig()) {
        setError(t('authProviderUnavailable'))
        return
      }

      const result = await establishPasswordSession(createClient, email, password)
      if (result.ok) {
        redirectAfterLogin()
        return
      }
      setError(t(passwordFailureMessages[result.reason]))
    } catch {
      setError(t('authUnknownError'))
    } finally {
      setLoading(false)
    }
  }

  const handleGoogleLogin = async () => {
    setLoading(true)
    setError(null)

    if (mockMode) {
      const result = await mockAuthService.signInWithGoogle(email)
      if (result.ok) {
        redirectAfterLogin()
        return
      }
      setError(authStatusMessage(result.status))
      setLoading(false)
      return
    }

    if (!googleEnabled || !getSupabasePublicConfig()) {
      setError(t('googleUnavailable'))
      setLoading(false)
      return
    }
    try {
      const { error } = await startGoogleOAuth(createClient(), window.location.origin, searchParams.get('next'))
      if (!error) return
    } catch { /* Show a safe error without provider details. */ }
    setError(t('googleLoginFailed'))
    setLoading(false)
  }

  return (
    <AuthLayout title={t('signIn')} subtitle={t('loginSubtitle')}>
      <div className="space-y-5">
        {mockMode && <p className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-700">{t('demoModeHelp')}</p>}
          {(mockMode || googleEnabled) && (
            <>
              <Button
                onClick={handleGoogleLogin}
                disabled={loading}
                variant="outline"
                className="w-full h-12 text-base font-medium hover:bg-gray-50 transition-all"
                data-testid="google-login-btn"
              >
                <Globe className="mr-2 h-5 w-5" />
                {t('continueWithGoogle')}
              </Button>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <Separator className="w-full" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-white px-4 text-gray-500 font-medium">
                    {t('continueWithEmail')}
                  </span>
                </div>
              </div>
            </>
          )}

          {!mockMode && !googleEnabled && <p role="status" className="text-sm leading-relaxed text-slate-500" data-testid="google-unavailable">{t('googleUnavailable')}</p>}
          {(notice || recoveryNotice) && (
            <div className="text-sm text-green-700 bg-green-50 p-3 rounded-lg border border-green-100" data-testid="login-notice">
              {notice || recoveryNotice}
            </div>
          )}

          <form onSubmit={handleEmailLogin} className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium text-gray-700">
                {t('email')}
              </label>
              <Input
                id="email"
                autoComplete="username"
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
              <label htmlFor="password" className="text-sm font-medium text-gray-700">
                {t('password')}
              </label>
              <div className="relative">
                <Input
                  id="password"
                  autoComplete="current-password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="h-11 pr-11"
                  data-testid="password-input"
                />
                <Button type="button" variant="ghost" size="icon-sm" className="absolute right-0 top-0 h-11 w-11" aria-label={showPassword ? t('hidePassword') : t('showPassword')} onClick={() => setShowPassword(value => !value)}>
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            {(error || (!hasSubmitted && recoveryMessage)) && (
              <div className="text-sm text-red-600 bg-red-50 p-3 rounded-lg border border-red-100" data-testid="login-error" role="alert">
                {error || recoveryMessage}
              </div>
            )}
            <Button
              type="submit"
              disabled={loading}
              className="w-full h-11 text-sm font-semibold bg-blue-600 hover:bg-blue-700"
              data-testid="email-login-btn"
            >
              {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{t('signingIn')}</> : t('signIn')}
            </Button>
          </form>
          <div className="space-y-3 text-center text-sm">
            <Link className="inline-flex min-h-11 items-center text-blue-700 hover:underline" href="/forgot-password">{t('forgotPassword')}</Link>
            <p className="text-muted-foreground">{t('noAccount')} <Link className="inline-flex min-h-11 items-center font-semibold text-blue-700 hover:underline" href="/register">{t(mockMode ? 'signUp' : 'accountRequestTitle')}</Link></p>
          </div>
          <Button
            type="button"
            variant="ghost"
            className="h-11 w-full"
            onClick={() => setLanguage(language === 'en' ? 'vi' : 'en')}
          >
            <Globe className="mr-2 h-4 w-4" />
            {language === 'en' ? t('vietnamese') : t('english')}
          </Button>
      </div>
    </AuthLayout>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageContent />
    </Suspense>
  )
}
