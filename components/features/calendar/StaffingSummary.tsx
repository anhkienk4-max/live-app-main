'use client'

import type { Shift, ShiftRegistration } from '@/lib/types/database.types'
import { useTranslation } from '@/lib/i18n'
import { getStaffingRoleSummary } from '@/lib/utils/shiftRegistration'

export function StaffingSummary({ shift, registrations }: { shift: Shift; registrations: ShiftRegistration[] }) {
  const { t } = useTranslation()
  const summary = getStaffingRoleSummary(shift, registrations)

  return (
    <section className="rounded-lg border bg-muted/20 p-3" data-testid={`staffing-summary-${shift.id}`} aria-label={t('staffingSummary')}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{t('staffingSummary')}</h3>
        <p className="text-xs text-muted-foreground">{t('staffingSummaryHelp')}</p>
      </div>
      <div className="grid gap-2 sm:grid-cols-3">
        {summary.map(item => (
          <div key={item.role} className="rounded-md border bg-background p-2" data-testid={`staffing-summary-${shift.id}-${item.role}`}>
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-sm font-medium">{t(item.role)}</span>
              <span className="text-sm font-semibold" aria-label={`${t('assignedCount')}: ${item.assigned}; ${t('required')}: ${item.required}`}>
                {item.assigned}/{item.required}
              </span>
            </div>
            <dl className="grid grid-cols-3 gap-1 text-xs">
              <div><dt className="text-muted-foreground">{t('assignedCount')}</dt><dd className="font-semibold">{item.assigned}</dd></div>
              <div><dt className="text-muted-foreground">{t('pendingCount')}</dt><dd className="font-semibold">{item.pending}</dd></div>
              <div><dt className="text-muted-foreground">{t('missingCount')}</dt><dd className="font-semibold">{item.gap}</dd></div>
            </dl>
          </div>
        ))}
      </div>
    </section>
  )
}
