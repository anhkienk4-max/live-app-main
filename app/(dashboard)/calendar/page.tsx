import { CalendarWorkspace } from '@/components/features/calendar/CalendarWorkspace'
import { LocalizedPageHeading } from '@/lib/i18n'
import { PageShell } from '@/components/ui/archetypes'

export default function CalendarPage() {
  return (
    <PageShell archetype="schedule" className="min-w-0 space-y-6" data-testid="calendar-page">
      <LocalizedPageHeading title="calendar" subtitle="calendarSubtitle" />
      <CalendarWorkspace />
    </PageShell>
  )
}
