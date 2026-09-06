"use client"

import { Button } from "@/components/ui/button"
import { useTranslation } from "@/lib/i18n"
import { PageError } from "@/components/ui/states"

interface PageLoadErrorProps {
  error: unknown
  onRetry: () => void
}

export function PageLoadError({ error, onRetry }: PageLoadErrorProps) {
  const { t } = useTranslation()

  return (
    <PageError
      title={t("error")}
      description={error instanceof Error ? error.message : t("tryAgain")}
      action={<Button type="button" variant="outline" onClick={onRetry}>{t("tryAgain")}</Button>}
    />
  )
}
