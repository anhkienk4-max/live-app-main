import { CalendarWorkspace } from '@/components/features/calendar/CalendarWorkspace'
import { LocalizedPageHeading } from '@/lib/i18n'
import { PageShell } from '@/components/ui/archetypes'

export default function CalendarPage() {
  return (
    <PageShell archetype="schedule" className="space-y-6 w-full max-w-none px-4 md:px-8 py-6" data-testid="calendar-page">
      <CalendarWorkspace />
    </PageShell>
  )
}
