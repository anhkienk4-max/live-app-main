'use client'

import * as React from 'react'
import Link from 'next/link'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useTranslation } from '@/lib/i18n'
import { AuthLayout } from '@/components/layouts/AuthLayout'
import {
  AuthPanel,
  AuthHeader,
  AuthField,
  AuthStatusState
} from '@/components/ui/auth'
import { getAuthMode, getSupabasePublicConfig } from '@/lib/auth/authMode'
import { mockAuthService } from '@/lib/services/mockAuthService'
import { requestPasswordResetEmail } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/client'

export default function ForgotPasswordPage() {
  const { t } = useTranslation()
  const [email, setEmail] = React.useState('')
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [submitted, setSubmitted] = React.useState(false)
  const mockMode = getAuthMode() === 'mock'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.trim() || loading) return
    setLoading(true)
    setError(null)

    try {
      if (mockMode) {
        await mockAuthService.resetPasswordEmail(email)
        setSubmitted(true)
        return
      }

      if (!getSupabasePublicConfig()) {
        setError(t('authServiceUnavailable'))
        return
      }

      const success = await requestPasswordResetEmail(
        createClient(),
        email,
        `${window.location.origin}/reset-password`
      )
      
      if (success) {
        setSubmitted(true)
      } else {
        setError('Failed to request password reset.')
      }
    } finally {
      setLoading(false)
    }
  }

  if (submitted) {
    return (
      <AuthLayout>
        <AuthPanel>
          <AuthHeader title={'Check your email'} subtitle={'If an account exists, we have sent a password reset link.'} />
          
          <AuthStatusState 
            type="success"
            message={'Password reset email sent.'}
          />

          <div className="pt-4">
            <Link href="/login" className="flex h-11 w-full items-center justify-center rounded-md bg-blue-600 px-8 text-sm font-medium text-white transition-colors hover:bg-blue-700">
              {'Return to sign in'}
            </Link>
          </div>
        </AuthPanel>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout>
      <AuthPanel>
        <AuthHeader 
          title={'Forgot Password'} 
          subtitle={'Enter your email address to receive a password reset link.'} 
        />

        {error && (
          <AuthStatusState type="error" message={error} />
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
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
              data-testid="forgot-password-email"
            />
          </AuthField>

          <Button
            type="submit"
            disabled={loading || !email.trim()}
            className="h-11 w-full bg-blue-600 text-white hover:bg-blue-700"
            data-testid="request-reset-btn"
          >
            {loading ? <><Loader2 className="mr-2 size-4 animate-spin" />{'Sending...'}</> : 'Send Reset Link'}
          </Button>
        </form>

        <div className="text-center text-sm text-muted-foreground">
          <p>
            <Link className="font-semibold text-blue-600 hover:text-blue-500" href="/login">
              {'Back to sign in'}
            </Link>
          </p>
        </div>
      </AuthPanel>
    </AuthLayout>
  )
}
