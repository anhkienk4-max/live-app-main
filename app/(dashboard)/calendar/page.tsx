import { CalendarWorkspace } from '@/components/features/calendar/CalendarWorkspace'
import { LocalizedPageHeading } from '@/lib/i18n'
import { PageShell } from '@/components/ui/archetypes'

export default function CalendarPage() {
  return (
    <PageShell archetype="schedule" className="space-y-6 w-full" data-testid="calendar-page">
      <CalendarWorkspace />
    </PageShell>
  )
}
