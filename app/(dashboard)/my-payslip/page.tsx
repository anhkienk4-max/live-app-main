'use client'

import * as React from 'react'
import { PageShell } from '@/components/ui/archetypes'
import { MyPayslipPanel } from '@/components/features/payroll/MyPayslipPanel'
import { useWorkforceCapabilities } from '@/lib/hooks/useWorkforceCapabilities'
import { useTranslation } from '@/lib/i18n'

export default function MyPayslipPage() {
  return (
    <React.Suspense fallback={<PageShell archetype="command" className="p-4 md:p-6" data-testid="my-payslip-page"><p role="status">Đang tải phiếu lương...</p></PageShell>}>
      <MyPayslipContent />
    </React.Suspense>
  )
}

function MyPayslipContent() {
  const { translate } = useTranslation()
  const { currentUser, loading, error, identityKey } = useWorkforceCapabilities()

  if (loading) {
    return (
      <PageShell archetype="command" className="p-4 md:p-6" data-testid="my-payslip-page">
        <p role="status">{translate('Đang xác minh phiên đăng nhập và quyền truy cập…')}</p>
      </PageShell>
    )
  }
  if (error) {
    return (
      <PageShell archetype="command" className="p-4 md:p-6" data-testid="my-payslip-page">
        <p role="alert">{translate(error)}</p>
      </PageShell>
    )
  }
  if (!currentUser) {
    return (
      <PageShell archetype="command" className="p-4 md:p-6" data-testid="my-payslip-page">
        <p role="alert">{translate('Vui lòng đăng nhập.')}</p>
      </PageShell>
    )
  }

  return (
    <div data-testid="my-payslip-page">
      <MyPayslipPanel key={identityKey ?? currentUser.id} />
    </div>
  )
}
