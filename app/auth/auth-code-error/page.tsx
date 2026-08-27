'use client'

import Link from 'next/link'
import { useTranslation } from '@/lib/i18n'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function AuthCodeErrorPage() {
  const { t } = useTranslation()

  return <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-blue-50 p-4">
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>{t('authCodeErrorTitle')}</CardTitle>
        <CardDescription>{t('authCodeErrorHelp')}</CardDescription>
      </CardHeader>
      <CardContent>
        <Button render={<Link href="/login" />} className="w-full">{t('signIn')}</Button>
      </CardContent>
    </Card>
  </div>
}
