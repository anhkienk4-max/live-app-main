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
      <div className="min-w-0 space-y-6">
        {mockMode && (
          <p role="status" className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm leading-relaxed text-blue-800">
            {t('demoModeHelp')}
          </p>
        )}
        {(notice || recoveryNotice) && (
          <div role="status" aria-live="polite" className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-relaxed text-emerald-800" data-testid="login-notice">
            {notice || recoveryNotice}
          </div>
        )}
        {(error || (!hasSubmitted && recoveryMessage)) && (
          <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-relaxed text-red-800" data-testid="login-error">
            {error || recoveryMessage}
          </div>
        )}

        <form onSubmit={handleEmailLogin} className="space-y-5" aria-busy={loading}>
          <div className="space-y-2">
            <label htmlFor="email" className="block text-sm font-semibold text-slate-800">{t('email')}</label>
            <Input
              id="email"
              autoComplete="username"
              inputMode="email"
              type="email"
              placeholder="name@company.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              disabled={loading}
              className="h-12 rounded-lg border-slate-300 px-3.5 text-base shadow-none focus-visible:ring-blue-500"
              data-testid="email-input"
            />
          </div>
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
              <label htmlFor="password" className="text-sm font-semibold text-slate-800">{t('password')}</label>
              <Link className="inline-flex min-h-9 items-center text-sm font-medium text-blue-700 underline-offset-4 hover:underline focus-visible:rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600" href="/forgot-password">
                {t('forgotPassword')}
              </Link>
            </div>
            <div className="relative">
              <Input
                id="password"
                autoComplete="current-password"
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                disabled={loading}
                className="h-12 rounded-lg border-slate-300 px-3.5 pr-12 text-base shadow-none focus-visible:ring-blue-500"
                data-testid="password-input"
              />
              <Button type="button" variant="ghost" size="icon-sm" className="absolute right-1 top-1 h-10 w-10 rounded-md" aria-label={showPassword ? t('hidePassword') : t('showPassword')} onClick={() => setShowPassword(value => !value)}>
                {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </Button>
            </div>
          </div>
          <Button
            type="submit"
            disabled={loading}
            className="mt-2 h-12 w-full rounded-lg bg-blue-600 text-base font-semibold shadow-sm shadow-blue-900/10 transition-colors hover:bg-blue-700"
            data-testid="email-login-btn"
          >
            {loading ? <><Loader2 className="mr-2 h-5 w-5 animate-spin" aria-hidden="true" />{t('signingIn')}</> : t('signIn')}
          </Button>
        </form>

        {(mockMode || googleEnabled) && (
          <div className="space-y-4">
            <div className="relative flex items-center justify-center">
              <Separator className="absolute inset-x-0 top-1/2" />
              <span className="relative bg-white px-3 text-xs font-medium text-slate-500">{t('continueWithEmail')}</span>
            </div>
            <Button type="button" onClick={handleGoogleLogin} disabled={loading} variant="outline" className="h-12 w-full rounded-lg border-slate-300 text-sm font-semibold hover:bg-slate-50" data-testid="google-login-btn">
              <Globe className="mr-2 h-5 w-5" aria-hidden="true" />
              {t('continueWithGoogle')}
            </Button>
          </div>
        )}

        <div className="space-y-3 border-t border-slate-100 pt-5 text-center text-sm">
          <p className="leading-relaxed text-slate-600">
            {t('noAccount')}{' '}
            <Link href="/register" className="inline-flex min-h-9 items-center font-semibold text-blue-700 underline-offset-4 hover:underline">
              {t(mockMode ? 'signUp' : 'accountRequestTitle')}
            </Link>
          </p>
          {!mockMode && !googleEnabled && (
            <p role="status" className="text-xs leading-relaxed text-slate-500" data-testid="google-unavailable">
              {t('googleUnavailable')}
            </p>
          )}
        </div>
        <div className="flex justify-center">
          <Button
            type="button"
            variant="ghost"
            className="min-h-11 rounded-lg px-4 text-sm text-slate-600"
            aria-label={t('language')}
            onClick={() => setLanguage(language === 'en' ? 'vi' : 'en')}
          >
            <Globe className="mr-2 h-4 w-4" aria-hidden="true" />
            {language === 'en' ? t('vietnamese') : t('english')}
          </Button>
        </div>
      </div>
    </AuthLayout>
  )
}

function LoginPagePending() {
  const { t } = useTranslation()
  return (
    <AuthLayout title={t('signIn')} subtitle={t('loginSubtitle')}>
      <div role="status" aria-busy="true" aria-label={t('loading')} data-testid="login-pending" className="space-y-5">
        <div className="h-4 w-20 animate-pulse rounded bg-slate-100 motion-reduce:animate-none" />
        <div className="h-12 w-full animate-pulse rounded-lg bg-slate-100 motion-reduce:animate-none" />
        <div className="h-4 w-24 animate-pulse rounded bg-slate-100 motion-reduce:animate-none" />
        <div className="h-12 w-full animate-pulse rounded-lg bg-slate-100 motion-reduce:animate-none" />
        <div className="h-12 w-full animate-pulse rounded-lg bg-blue-100 motion-reduce:animate-none" />
      </div>
    </AuthLayout>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginPagePending />}>
      <LoginPageContent />
    </Suspense>
  )
}
