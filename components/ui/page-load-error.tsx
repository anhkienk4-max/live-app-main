'use client'

import { Button } from '@/components/ui/button'
import { useTranslation } from '@/lib/i18n'

interface PageLoadErrorProps {
  error: unknown
  onRetry: () => void
}

export function PageLoadError({ error, onRetry }: PageLoadErrorProps) {
  const { t } = useTranslation()

  return (
    <div className="space-y-3 py-12 text-center" role="alert">
      <p className="font-medium">{t('error')}</p>
      <p className="text-sm text-muted-foreground">
        {error instanceof Error ? error.message : t('tryAgain')}
      </p>
      <Button type="button" variant="outline" onClick={onRetry}>{t('tryAgain')}</Button>
    </div>
  )
}
