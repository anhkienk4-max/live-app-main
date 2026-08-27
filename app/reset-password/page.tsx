'use client'

import * as React from 'react'
import Link from 'next/link'
import { useTranslation } from '@/lib/i18n'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

export default function ResetPasswordPage() {
  const { t } = useTranslation()
  const [password, setPassword] = React.useState('')
  const [confirmation, setConfirmation] = React.useState('')
  const [loading, setLoading] = React.useState(false)
  const [success, setSuccess] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (password.length < 8) { setError(t('passwordMinLength')); return }
    if (password !== confirmation) { setError(t('passwordMismatch')); return }
    setLoading(true)
    setError(null)
    try {
      const { error: updateError } = await createClient().auth.updateUser({ password })
      if (updateError) throw updateError
      setSuccess(true)
    } catch {
      setError(t('passwordResetFailed'))
    } finally {
      setLoading(false)
    }
  }

  return <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-blue-50 p-4">
    <Card className="w-full max-w-md"><CardHeader><CardTitle>{t('resetPasswordTitle')}</CardTitle><CardDescription>{t('passwordMinLength')}</CardDescription></CardHeader><CardContent>
      {success ? <div className="space-y-4"><p className="text-sm text-green-700" data-testid="password-reset-success">{t('passwordResetSuccess')}</p><Link href="/login" className="text-sm text-blue-700 hover:underline">{t('signIn')}</Link></div> : <form onSubmit={submit} className="space-y-4"><label className="text-sm font-medium" htmlFor="new-password">{t('newPassword')}</label><Input id="new-password" type="password" minLength={8} required value={password} onChange={event => setPassword(event.target.value)} data-testid="new-password-input" /><label className="text-sm font-medium" htmlFor="confirm-new-password">{t('confirmNewPassword')}</label><Input id="confirm-new-password" type="password" minLength={8} required value={confirmation} onChange={event => setConfirmation(event.target.value)} data-testid="confirm-new-password-input" />{error && <p className="text-sm text-red-600" data-testid="password-reset-error">{error}</p>}<Button type="submit" disabled={loading} className="w-full" data-testid="save-new-password">{loading ? t('loading') : t('update')}</Button></form>}
    </CardContent></Card>
  </div>
}
