'use client'

import * as React from 'react'
import Link from 'next/link'
import { Globe, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useTranslation } from '@/lib/i18n'
import { mockAuthService } from '@/lib/services/mockAuthService'
import { AuthLayout } from '@/components/layouts/AuthLayout'
import {
  AuthPanel,
  AuthHeader,
  AuthField,
  PasswordField,
  AuthStatusState
} from '@/components/ui/auth'

type FormErrors = Partial<Record<'fullName' | 'email' | 'password' | 'confirmPassword' | 'form', string>>

export default function RegisterPage() {
  const { language, setLanguage, t } = useTranslation()
  const [fullName, setFullName] = React.useState('')
  const [email, setEmail] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [confirmPassword, setConfirmPassword] = React.useState('')
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

  if (created) {
    return (
      <AuthLayout>
        <AuthPanel data-testid="registration-status">
          <AuthHeader title={t('registrationSuccess')} subtitle={t('pendingAdminApproval')} />
          <AuthStatusState 
            type="success" 
            message={t('emailAutoVerifiedMock')} 
          />
          <p className="text-sm text-muted-foreground">
            {t('mockVerificationHelp')}
          </p>
          <div className="pt-4">
            <Link href="/login" className="flex h-11 w-full items-center justify-center rounded-md bg-blue-600 px-8 text-sm font-medium text-white transition-colors hover:bg-blue-700">
              {t('signIn')}
            </Link>
          </div>
        </AuthPanel>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout>
      <AuthPanel>
        <AuthHeader title={t('createAccount')} subtitle={t('registrationSubtitle')} />

        <form className="space-y-4" onSubmit={submit} noValidate>
          <AuthField label={t('fullName')} error={errors.fullName} htmlFor="fullName">
            <Input 
              id="fullName"
              value={fullName} 
              onChange={event => setFullName(event.target.value)} 
              autoComplete="name" 
              data-testid="register-full-name" 
              aria-invalid={Boolean(errors.fullName)}
              className="h-11"
            />
          </AuthField>
          
          <AuthField label={t('email')} error={errors.email} htmlFor="email">
            <Input 
              id="email"
              type="email" 
              value={email} 
              onChange={event => setEmail(event.target.value)} 
              autoComplete="email" 
              placeholder="name@company.com" 
              data-testid="register-email" 
              aria-invalid={Boolean(errors.email)}
              className="h-11"
            />
          </AuthField>
          
          <AuthField label={t('password')} error={errors.password} htmlFor="password">
            <PasswordField 
              id="password"
              value={password} 
              onChange={event => setPassword(event.target.value)} 
              labelToggleShow={t('showPassword')}
              labelToggleHide={t('hidePassword')}
              data-testid="register-password" 
              autoComplete="new-password"
              error={Boolean(errors.password)}
            />
          </AuthField>
          
          <AuthField label={t('confirmPassword')} error={errors.confirmPassword} htmlFor="confirmPassword">
            <PasswordField 
              id="confirmPassword"
              value={confirmPassword} 
              onChange={event => setConfirmPassword(event.target.value)} 
              labelToggleShow={t('showPassword')}
              labelToggleHide={t('hidePassword')}
              data-testid="register-confirm-password" 
              autoComplete="new-password"
              error={Boolean(errors.confirmPassword)}
            />
          </AuthField>
          
          {errors.form && (
            <AuthStatusState type="error" message={errors.form} testId="register-form-error" />
          )}
          
          <p className="text-xs text-muted-foreground">{t('mockVerificationHelp')}</p>
          
          <Button 
            className="h-11 w-full bg-blue-600 text-white hover:bg-blue-700" 
            type="submit" 
            disabled={loading} 
            data-testid="create-account-btn"
          >
            {loading ? <><Loader2 className="mr-2 size-4 animate-spin" />{t('creatingAccount')}</> : t('createAccount')}
          </Button>
        </form>

        <div className="text-center text-sm text-muted-foreground">
          <p>
            {t('haveAccount')} <Link className="font-semibold text-blue-600 hover:text-blue-500" href="/login">{t('signIn')}</Link>
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
