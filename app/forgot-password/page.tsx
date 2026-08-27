'use client'

import * as React from 'react'
import Link from 'next/link'
import { useTranslation } from '@/lib/i18n'
import { getAuthMode, getSupabasePublicConfig } from '@/lib/auth/authMode'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

export default function ForgotPasswordPage() {
  const { t } = useTranslation()
  const [email, setEmail] = React.useState('')
  const [sent, setSent] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setLoading(true)
    setError(null)
    try {
      if (getAuthMode() === 'mock' || !getSupabasePublicConfig()) {
        setSent(true)
        return
      }
      const { error: resetError } = await createClient().auth.resetPasswordForEmail(
        email.trim().toLowerCase(),
        { redirectTo: `${window.location.origin}/api/auth/callback?next=/reset-password` },
      )
      if (resetError && resetError.message.length > 500) {
        setError(t('passwordResetFailed'))
        return
      }
      setSent(true)
    } catch {
      setError(t('passwordResetFailed'))
    } finally {
      setLoading(false)
    }
  }

  return <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-blue-50 p-4">
    <Card className="w-full max-w-md"><CardHeader><CardTitle>{t('forgotPasswordTitle')}</CardTitle><CardDescription>{t('forgotPasswordHelp')}</CardDescription></CardHeader><CardContent>
      {sent ? <div className="space-y-4"><p className="text-sm text-green-700" data-testid="password-reset-sent">{t('resetLinkSent')}</p><Link href="/login" className="text-sm text-blue-700 hover:underline">{t('signIn')}</Link></div> : <form onSubmit={submit} className="space-y-4"><label className="text-sm font-medium" htmlFor="reset-email">{t('email')}</label><Input id="reset-email" type="email" required value={email} onChange={event => setEmail(event.target.value)} data-testid="reset-email-input" />{error && <p className="text-sm text-red-600" data-testid="password-reset-error">{error}</p>}<Button type="submit" disabled={loading} className="w-full" data-testid="send-reset-link">{loading ? t('loading') : t('sendResetLink')}</Button><Link href="/login" className="block text-center text-sm text-blue-700 hover:underline">{t('signIn')}</Link></form>}
    </CardContent></Card>
  </div>
}
