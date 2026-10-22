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
  const sessionChanged = error instanceof Error
    && (error.message === 'LIST_IDENTITY_CHANGED' || error.message === 'LIST_IDENTITY_UNAVAILABLE')

  return (
    <PageError
      role="alert"
      title={t("error")}
      description={sessionChanged
        ? 'Phiên đăng nhập và dữ liệu chưa đồng bộ. Hãy tải lại trang để xác nhận phiên hiện tại. Nếu dùng nhiều tài khoản, hãy mở mỗi tài khoản trong một hồ sơ trình duyệt riêng.'
        : error instanceof Error ? error.message : t("tryAgain")}
      action={<Button type="button" variant="outline" onClick={sessionChanged
        ? () => window.location.reload()
        : onRetry}>{sessionChanged ? 'Tải lại phiên đăng nhập' : t("tryAgain")}</Button>}
    />
  )
}
