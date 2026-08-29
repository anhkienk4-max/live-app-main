'use client'

import * as React from 'react'
import Link from 'next/link'
import { CheckCircle2, Eye, EyeOff, Globe, Loader2, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useTranslation } from '@/lib/i18n'
import { mockAuthService } from '@/lib/services/mockAuthService'
import { AuthLayout } from '@/components/layouts/AuthLayout'

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

  if (created) {
    return (
      <AuthLayout title={t('registrationSuccess')} subtitle={t('pendingAdminApproval')}>
        <div className="flex flex-col items-center justify-center space-y-6 py-8" data-testid="registration-status">
          <div className="rounded-full bg-green-100 p-3">
            <CheckCircle2 className="size-12 text-green-600" />
          </div>
          
          <div className="space-y-2 text-center">
            <p className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 shadow-sm">
              {t('emailAutoVerifiedMock')}
            </p>
            <p className="text-sm text-muted-foreground mt-4">
              {t('mockVerificationHelp')}
            </p>
          </div>

          <Link href="/login" className="flex h-11 w-full items-center justify-center rounded-md bg-blue-600 px-8 text-sm font-medium text-white transition-colors hover:bg-blue-700">
            {t('signIn')}
          </Link>
        </div>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout title={t('createAccount')} subtitle={t('registrationSubtitle')}>
      <form className="space-y-4" onSubmit={submit} noValidate>
        <Field label={t('fullName')} error={errors.fullName}>
          <Input 
            value={fullName} 
            onChange={event => setFullName(event.target.value)} 
            autoComplete="name" 
            data-testid="register-full-name" 
            aria-invalid={Boolean(errors.fullName)}
            className="h-11"
          />
        </Field>
        
        <Field label={t('email')} error={errors.email}>
          <Input 
            type="email" 
            value={email} 
            onChange={event => setEmail(event.target.value)} 
            autoComplete="email" 
            placeholder="name@company.com" 
            data-testid="register-email" 
            aria-invalid={Boolean(errors.email)}
            className="h-11"
          />
        </Field>
        
        <Field label={t('password')} error={errors.password}>
          <PasswordInput 
            value={password} 
            onChange={setPassword} 
            visible={showPassword} 
            onToggle={() => setShowPassword(value => !value)} 
            label={showPassword ? t('hidePassword') : t('showPassword')} 
            testId="register-password" 
            autoComplete="new-password"
            error={Boolean(errors.password)}
          />
        </Field>
        
        <Field label={t('confirmPassword')} error={errors.confirmPassword}>
          <PasswordInput 
            value={confirmPassword} 
            onChange={setConfirmPassword} 
            visible={showPassword} 
            onToggle={() => setShowPassword(value => !value)} 
            label={showPassword ? t('hidePassword') : t('showPassword')} 
            testId="register-confirm-password" 
            autoComplete="new-password"
            error={Boolean(errors.confirmPassword)}
          />
        </Field>
        
        {errors.form && (
          <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700" data-testid="register-form-error">
            <AlertCircle className="size-4 shrink-0" />
            <p>{errors.form}</p>
          </div>
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
    </AuthLayout>
  )
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
        {label}
      </label>
      {children}
      {error && <span className="text-xs font-medium text-red-500">{error}</span>}
    </div>
  )
}

function PasswordInput({
  value,
  onChange,
  visible,
  onToggle,
  label,
  testId,
  autoComplete,
  error,
}: {
  value: string
  onChange: (value: string) => void
  visible: boolean
  onToggle: () => void
  label: string
  testId: string
  autoComplete: string
  error?: boolean
}) {
  return (
    <div className="relative">
      <Input 
        className="h-11 pr-11" 
        type={visible ? 'text' : 'password'} 
        value={value} 
        onChange={event => onChange(event.target.value)} 
        autoComplete={autoComplete} 
        data-testid={testId}
        aria-invalid={error}
      />
      <Button 
        type="button" 
        variant="ghost" 
        size="icon" 
        className="absolute right-1 top-1.5 size-8 text-muted-foreground hover:text-foreground" 
        aria-label={label} 
        onClick={onToggle}
      >
        {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </Button>
    </div>
  )
}
