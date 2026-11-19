import * as React from 'react'
import { CalendarWorkspace } from '@/components/features/calendar/CalendarWorkspace'
import { PageShell } from '@/components/ui/archetypes'

export default function CalendarPage() {
  return (
    <PageShell archetype="schedule" className="ada-calendar-page min-w-0 space-y-4 p-4 md:p-6" data-testid="calendar-page">
      <React.Suspense fallback={<div className="p-4">Đang tải lịch...</div>}>
        <CalendarWorkspace />
      </React.Suspense>
    </PageShell>
  )
}
