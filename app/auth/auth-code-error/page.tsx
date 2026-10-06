'use client'

import Link from 'next/link'
import { useTranslation } from '@/lib/i18n'
import { Button } from '@/components/ui/button'
import { AuthLayout } from '@/components/layouts/AuthLayout'

export default function AuthCodeErrorPage() {
  const { t } = useTranslation()

  return <AuthLayout title={t('authCodeErrorTitle')} subtitle={t('authCodeErrorHelp')}>
    <Button nativeButton={false} render={<Link href="/login" />} className="w-full">{t('signIn')}</Button>
  </AuthLayout>
}
