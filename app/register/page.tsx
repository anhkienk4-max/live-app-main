'use client'

import * as React from 'react'
import Link from 'next/link'
import { CheckCircle2, Eye, EyeOff, Globe, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useTranslation } from '@/lib/i18n'
import { mockAuthService } from '@/lib/services/mockAuthService'

type FormErrors = Partial<Record<'fullName' | 'email' | 'password' | 'confirmPassword' | 'form', string>>

export default function RegisterPage() {
  const { language, setLanguage, t } = useTranslation()
  const [fullName, setFullName] = React.useState('')
  const [email, setEmail] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [confirmPassword, setConfirmPassword] = React.useState('')
  const [showPassword, setShowPassword] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const [errors, setErrors] = React.useState<FormErrors>({})
  const [created, setCreated] = React.useState(false)
  const useMockData = process.env.NEXT_PUBLIC_USE_MOCK_DATA !== 'false'

  const validate = () => {
    const next: FormErrors = {}
    if (!fullName.trim()) next.fullName = t('fullNameRequired')
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) next.email = t('emailInvalid')
    if (password.length < 8) next.password = t('passwordMinLength')
    if (password !== confirmPassword) next.confirmPassword = t('passwordMismatch')
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (loading || !validate()) return
    setLoading(true)
    setErrors({})
    try {
      if (!useMockData) {
        setErrors({ form: t('supabaseNotConfigured') })
        return
      }
      const result = await mockAuthService.registerEmail({ fullName, email, password })
      if (!result.ok) {
        setErrors({ form: result.code === 'duplicate_email' ? t('emailAlreadyExists') : t('validationError') })
        return
      }
      setCreated(true)
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 via-white to-blue-50 p-4">
      <Card className="w-full max-w-lg border-0 shadow-xl">
        <CardHeader className="space-y-3 text-center">
          <CardTitle className="text-3xl">{t('createAccount')}</CardTitle>
          <CardDescription>{t('registrationSubtitle')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {created ? (
            <div className="space-y-4 text-center" data-testid="registration-status">
              <CheckCircle2 className="mx-auto h-12 w-12 text-green-600" />
              <h2 className="text-xl font-semibold">{t('registrationSuccess')}</h2>
              <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">{t('emailAutoVerifiedMock')}</p>
              <p className="text-sm text-muted-foreground">{t('pendingAdminApproval')}</p>
              <p className="text-xs text-muted-foreground">{t('mockVerificationHelp')}</p>
              <Button render={<Link href="/login" />} className="w-full">{t('signIn')}</Button>
            </div>
          ) : (
            <form className="space-y-4" onSubmit={submit} noValidate>
              <Field label={t('fullName')} error={errors.fullName}>
                <Input value={fullName} onChange={event => setFullName(event.target.value)} autoComplete="name" data-testid="register-full-name" aria-invalid={Boolean(errors.fullName)} />
              </Field>
              <Field label={t('email')} error={errors.email}>
                <Input type="email" value={email} onChange={event => setEmail(event.target.value)} autoComplete="email" placeholder="name@company.com" data-testid="register-email" aria-invalid={Boolean(errors.email)} />
              </Field>
              <Field label={t('password')} error={errors.password}>
                <PasswordInput value={password} onChange={setPassword} visible={showPassword} onToggle={() => setShowPassword(value => !value)} label={showPassword ? t('hidePassword') : t('showPassword')} testId="register-password" autoComplete="new-password" />
              </Field>
              <Field label={t('confirmPassword')} error={errors.confirmPassword}>
                <PasswordInput value={confirmPassword} onChange={setConfirmPassword} visible={showPassword} onToggle={() => setShowPassword(value => !value)} label={showPassword ? t('hidePassword') : t('showPassword')} testId="register-confirm-password" autoComplete="new-password" />
              </Field>
              {errors.form && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700" data-testid="register-form-error">{errors.form}</p>}
              <p className="text-xs text-muted-foreground">{t('mockVerificationHelp')}</p>
              <Button className="w-full" type="submit" disabled={loading} data-testid="create-account-btn">
                {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />{t('creatingAccount')}</> : t('createAccount')}
              </Button>
            </form>
          )}
          <p className="text-center text-sm text-gray-600">{t('haveAccount')} <Link className="font-semibold text-blue-700 hover:underline" href="/login">{t('signIn')}</Link></p>
          <Button type="button" variant="ghost" className="w-full" onClick={() => setLanguage(language === 'en' ? 'vi' : 'en')}>
            <Globe className="mr-2 h-4 w-4" />
            {language === 'en' ? t('vietnamese') : t('english')}
          </Button>
        </CardContent>
      </Card>
    </main>
  )
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return <label className="block space-y-2 text-sm font-medium text-gray-700">{label}{children}{error && <span className="block text-xs text-red-600">{error}</span>}</label>
}

function PasswordInput({
  value,
  onChange,
  visible,
  onToggle,
  label,
  testId,
  autoComplete,
}: {
  value: string
  onChange: (value: string) => void
  visible: boolean
  onToggle: () => void
  label: string
  testId: string
  autoComplete: string
}) {
  return <div className="relative"><Input className="pr-11" type={visible ? 'text' : 'password'} value={value} onChange={event => onChange(event.target.value)} autoComplete={autoComplete} data-testid={testId} /><Button type="button" variant="ghost" size="icon-sm" className="absolute right-1 top-1" aria-label={label} onClick={onToggle}>{visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</Button></div>
}
