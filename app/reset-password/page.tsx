'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useTranslation } from '@/lib/i18n'
import { AuthLayout } from '@/components/layouts/AuthLayout'
import {
  AuthPanel,
  AuthHeader,
  AuthField,
  PasswordField,
  AuthStatusState
} from '@/components/ui/auth'
import { getAuthMode, getSupabasePublicConfig } from '@/lib/auth/authMode'
import { mockAuthService } from '@/lib/services/mockAuthService'
import { updateSessionPassword } from '@/lib/auth/session'
import { createClient } from '@/lib/supabase/client'

export default function ResetPasswordPage() {
  const { t } = useTranslation()
  const router = useRouter()
  const [password, setPassword] = React.useState('')
  const [confirmPassword, setConfirmPassword] = React.useState('')
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [success, setSuccess] = React.useState(false)
  const mockMode = getAuthMode() === 'mock'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (loading) return
    
    if (password.length < 8) {
      setError(t('passwordMinLength'))
      return
    }
    
    if (password !== confirmPassword) {
      setError(t('passwordMismatch'))
      return
    }

    setLoading(true)
    setError(null)

    try {
      if (mockMode) {
        await mockAuthService.updatePassword(password)
        setSuccess(true)
        return
      }

      if (!getSupabasePublicConfig()) {
        setError(t('authServiceUnavailable'))
        return
      }

      const updated = await updateSessionPassword(createClient(), password)
      
      if (updated) {
        setSuccess(true)
      } else {
        setError('Failed to update password. Your link may have expired.')
      }
    } finally {
      setLoading(false)
    }
  }

  if (success) {
    return (
      <AuthLayout>
        <AuthPanel>
          <AuthHeader title={'Password Updated'} subtitle={'Your password has been successfully reset.'} />
          
          <AuthStatusState 
            type="success"
            message={'You can now sign in with your new password.'}
          />

          <div className="pt-4">
            <Button
              className="h-11 w-full bg-blue-600 text-white hover:bg-blue-700"
              onClick={() => router.push('/login')}
            >
              {'Sign In'}
            </Button>
          </div>
        </AuthPanel>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout>
      <AuthPanel>
        <AuthHeader 
          title={'Reset Password'} 
          subtitle={'Enter your new password below.'} 
        />

        {error && (
          <AuthStatusState type="error" message={error} />
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <AuthField label={'New Password'} htmlFor="password">
            <PasswordField
              id="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="new-password"
              error={Boolean(error)}
              labelToggleShow={t('showPassword')}
              labelToggleHide={t('hidePassword')}
              data-testid="reset-password-input"
            />
          </AuthField>

          <AuthField label={'Confirm New Password'} htmlFor="confirmPassword">
            <PasswordField
              id="confirmPassword"
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              autoComplete="new-password"
              error={Boolean(error)}
              labelToggleShow={t('showPassword')}
              labelToggleHide={t('hidePassword')}
              data-testid="reset-confirm-password-input"
            />
          </AuthField>

          <Button
            type="submit"
            disabled={loading || !password || !confirmPassword}
            className="h-11 w-full bg-blue-600 text-white hover:bg-blue-700 mt-2"
            data-testid="update-password-btn"
          >
            {loading ? <><Loader2 className="mr-2 size-4 animate-spin" />{'Updating...'}</> : 'Update Password'}
          </Button>
        </form>
      </AuthPanel>
    </AuthLayout>
  )
}
