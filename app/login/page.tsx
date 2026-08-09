'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Eye, EyeOff, Globe, Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useTranslation } from '@/lib/i18n'
import { mockAuthService } from '@/lib/services/mockAuthService'
import { getAuthMode, getSupabasePublicConfig, safeLocalRedirect } from '@/lib/auth/authMode'
import { establishPasswordSession } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/client'

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
    if (reason === 'session_expired' || reason === 'authentication_required') {
      setError(t('sessionExpired'))
    } else if (reason === 'auth_unavailable') {
      setError(t('authServiceUnavailable'))
    } else if (reason === 'identity_unavailable') {
      setError(t('authIdentityUnavailable'))
    } else if (reason === 'signed_out') {
      setNotice(t('signedOutMessage'))
    }
  }, [t])

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

    setError(t('authServiceUnavailable'))
    setLoading(false)
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-blue-50 p-4">
      <Card className="w-full max-w-md shadow-xl border-0">
        <CardHeader className="space-y-4 text-center pb-8">
          <div className="mx-auto w-16 h-16 bg-gradient-to-br from-blue-600 to-blue-700 rounded-2xl flex items-center justify-center">
            <svg className="w-10 h-10 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </div>
          <div>
            <CardTitle className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-blue-800 bg-clip-text text-transparent">
              LiveStream Ops
            </CardTitle>
            <CardDescription className="text-base mt-2">
              {t('loginSubtitle')}
            </CardDescription>
            {mockMode && (
              <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                <p className="text-xs text-blue-700 font-medium">
                  🔧 {t('demoModeHelp')}
                </p>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {mockMode && (
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

          {notice && (
            <div className="text-sm text-green-700 bg-green-50 p-3 rounded-lg border border-green-100" data-testid="login-notice">
              {notice}
            </div>
          )}

          <form onSubmit={handleEmailLogin} className="space-y-4">
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
                  type={showPassword ? 'text' : 'password'}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="h-11 pr-11"
                  data-testid="password-input"
                />
                <Button type="button" variant="ghost" size="icon-sm" className="absolute right-1 top-1.5" aria-label={showPassword ? t('hidePassword') : t('showPassword')} onClick={() => setShowPassword(value => !value)}>
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            {error && (
              <div className="text-sm text-red-600 bg-red-50 p-3 rounded-lg border border-red-100" data-testid="login-error">
                {error}
              </div>
            )}
            <Button
              type="submit"
              disabled={loading}
              className="w-full h-11 text-base font-medium bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 transition-all"
              data-testid="email-login-btn"
            >
              {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{t('signingIn')}</> : t('signIn')}
            </Button>
          </form>
          <div className="space-y-3 text-center text-sm">
            {mockMode && (
              <>
                <button type="button" className="text-blue-700 hover:underline" onClick={() => setError(t('passwordResetMockHelp'))}>{t('forgotPassword')}</button>
                <p className="text-gray-600">{t('noAccount')} <Link className="font-semibold text-blue-700 hover:underline" href="/register">{t('signUp')}</Link></p>
              </>
            )}
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
        </CardContent>
      </Card>
    </div>
  )
}
