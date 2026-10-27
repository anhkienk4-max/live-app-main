'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { AuthLayout } from '@/components/layouts/AuthLayout'
import { Separator } from '@/components/ui/separator'
import { Eye, EyeOff, Globe, Loader2 } from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useTranslation } from '@/lib/i18n'
import { mockAuthService } from '@/lib/services/mockAuthService'
import { getAuthMode, getSupabasePublicConfig, safeLocalRedirect } from '@/lib/auth/authMode'
import {
  clearLocalSession,
  establishPasswordSession,
  shouldClearLocalSessionForLoginReason,
} from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/client'

function GoogleMark() {
  return <svg aria-hidden="true" focusable="false" viewBox="0 0 48 48" className="h-[19px] w-[19px] shrink-0">
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z" />
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.27 5.48-4.8 7.18l7.73 6C44.38 38.02 46.98 31.87 46.98 24.55Z" />
    <path fill="#FBBC05" d="M10.53 28.59A14.41 14.41 0 0 1 9.75 24c0-1.59.27-3.13.76-4.59l-7.97-6.19A23.92 23.92 0 0 0 0 24c0 3.87.93 7.51 2.56 10.78l7.97-6.19Z" />
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.87-5.8l-7.73-6C30.14 37.55 27.57 38.5 24 38.5c-6.26 0-11.57-4.22-13.47-9.91l-7.97 6.19C6.51 42.62 14.62 48 24 48Z" />
  </svg>
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
  const recoveryReason = searchParams.get('reason')
  const recoveryMessage = recoveryReason === 'session_expired' || recoveryReason === 'authentication_required'
    ? t('sessionExpired')
    : recoveryReason === 'auth_unavailable'
      ? t('authServiceUnavailable')
        : recoveryReason === 'identity_unavailable'
          ? t('authIdentityUnavailable')
          : null
  const recoveryNotice = recoveryReason === 'signed_out' && !hasSubmitted
    ? t('signedOutMessage')
    : null

  useEffect(() => {
    if (
      !mockMode
      && getSupabasePublicConfig()
      && shouldClearLocalSessionForLoginReason(recoveryReason)
    ) {
      void clearLocalSession(createClient())
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

    if (!getSupabasePublicConfig()) {
      setError(t('authServiceUnavailable'))
      setLoading(false)
      return
    }

    try {
      const next = safeLocalRedirect(searchParams.get('next'))
      const redirectTo = new URL('/api/auth/callback', window.location.origin)
      redirectTo.searchParams.set('next', next)
      const { data, error } = await createClient().auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: redirectTo.toString(), skipBrowserRedirect: true },
      })
      if (error || !data.url) {
        setError(language === 'vi'
          ? 'Google chưa sẵn sàng. Kiểm tra Google OAuth và Redirect URLs của Supabase Staging.'
          : 'Google sign-in is unavailable. Check staging OAuth and allowed redirect URLs.')
        setLoading(false)
        return
      }
      window.location.assign(data.url)
    } catch {
      setError(language === 'vi'
        ? 'Không thể bắt đầu đăng nhập Google. Vui lòng thử lại.'
        : 'Unable to start Google sign-in. Please try again.')
      setLoading(false)
    }
  }

  return (
    <AuthLayout variant="login" title={language === 'vi' ? 'Chào mừng trở lại!' : 'Welcome back!'} subtitle={t('loginSubtitle')}>
      <div className="space-y-3.5">
        {mockMode && <p className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-xs text-blue-700">{t('demoModeHelp')}</p>}
          {(notice || recoveryNotice) && (
            <div className="text-sm text-green-700 bg-green-50 p-3 rounded-lg border border-green-100" data-testid="login-notice">
              {notice || recoveryNotice}
            </div>
          )}

          <form onSubmit={handleEmailLogin} className="space-y-3.5">
            <div className="space-y-2">
              <label htmlFor="email" className="text-sm font-medium text-gray-700">
                {t('email')}
              </label>
              <Input
                id="email"
                type="email"
                placeholder="name@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="h-10"
                autoComplete="email"
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
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="h-10 pr-11"
                  autoComplete="current-password"
                  data-testid="password-input"
                />
                <Button type="button" variant="ghost" size="icon-sm" className="absolute right-1 top-1.5" aria-label={showPassword ? t('hidePassword') : t('showPassword')} onClick={() => setShowPassword(value => !value)}>
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            {(error || (!hasSubmitted && recoveryMessage)) && (
              <div className="text-sm text-red-600 bg-red-50 p-3 rounded-lg border border-red-100" data-testid="login-error">
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
          <div data-testid="google-login-option" className="space-y-3">
            <div className="relative flex items-center gap-3">
              <Separator className="flex-1" />
              <span className="whitespace-nowrap text-[11px] font-semibold text-slate-400">{language === 'vi' ? 'hoặc' : 'or'}</span>
              <Separator className="flex-1" />
            </div>
            <Button
              type="button"
              onClick={() => void handleGoogleLogin()}
              disabled={loading}
              variant="outline"
              className="ada-google-login w-full justify-center gap-2.5 rounded-[10px] border-[#DCE4F4] bg-white text-[13px] font-semibold text-[#14254D] hover:bg-blue-50"
              data-testid="google-login-btn"
            >
              <GoogleMark />
              {t('continueWithGoogle')}
            </Button>
          </div>
          <div className="space-y-2 text-center text-[12px]">
            <Link className="text-blue-700 hover:underline" href="/forgot-password">{t('forgotPassword')}</Link>
            <p className="text-muted-foreground">{t('noAccount')} <Link className="font-semibold text-blue-700 hover:underline" href="/register">{t(mockMode ? 'signUp' : 'accountRequestTitle')}</Link></p>
          </div>
          <Button
            type="button"
            variant="ghost"
            className="w-full"
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
