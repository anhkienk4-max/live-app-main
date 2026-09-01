'use client'

import { Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useTranslation } from '@/lib/i18n'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

function AuthCodeErrorContent() {
  const { t } = useTranslation()
  const reason = useSearchParams().get('reason')
  const title = reason === 'google_not_authorized'
    ? t('googleAuthUnauthorized')
    : reason === 'expired_link'
      ? t('authCodeErrorTitle')
      : t('authOAuthErrorTitle')
  const help = reason === 'google_not_authorized'
    ? t('googleAuthUnauthorizedHelp')
    : reason === 'expired_link'
      ? t('authCodeErrorHelp')
      : t('authOAuthErrorHelp')

  return <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-blue-50 p-4">
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{help}</CardDescription>
      </CardHeader>
      <CardContent>
        <Button render={<Link href="/login" />} className="w-full">{t('signIn')}</Button>
      </CardContent>
    </Card>
  </div>
}

export default function AuthCodeErrorPage() {
  return <Suspense fallback={null}><AuthCodeErrorContent /></Suspense>
}
