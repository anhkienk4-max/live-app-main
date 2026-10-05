import * as React from 'react'
import { PageShell, PageHeader, PageHeaderContent } from '@/components/ui/archetypes'
import { ShiftRegistrationBoard } from '@/components/features/calendar/ShiftRegistrationBoard'

export default function StaffingPage() {
  return (
    <PageShell archetype="schedule" className="p-4 md:p-6 space-y-6" data-testid="staffing-page">
      <PageHeader>
        <PageHeaderContent>
          <h1 className="text-2xl font-semibold">Staffing</h1>
          <p className="text-sm text-muted-foreground">Manage shift requirements, gaps, and assignments.</p>
        </PageHeaderContent>
      </PageHeader>

      <ShiftRegistrationBoard mode="open" />
    </PageShell>
  )
}
